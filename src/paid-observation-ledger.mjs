import { isDeepStrictEqual } from "node:util";

/**
 * Native paid-observation records, not a payment rail.
 *
 * The signed payment identity selects exactly one retained request. Append is
 * durable authority: a record is visible to a caller only after it is written.
 * No unsigned challenge produces an intent and no unknown ID is "pending".
 */
export function createPaidObservationLedger({
  intents,
  terminals,
  append,
  observe,
  projectRefusal,
  pricing,
}) {
  if (!(intents instanceof Map) || !(terminals instanceof Map)) {
    throw new TypeError("paid observation recovery requires intent and terminal Maps");
  }
  for (const invocation of terminals.keys()) {
    if (!intents.has(invocation)) {
      throw new Error("recovered terminal has no matching durable observation intent");
    }
  }
  if (typeof append !== "function" || typeof observe !== "function"
      || typeof projectRefusal !== "function") {
    throw new TypeError("paid observation requires append, observe and refusal producers");
  }

  // Preserve the quoted price at construction, not a mutable caller-owned view.
  const priceQuote = structuredClone(pricing);
  const pendingRequestWrites = new Map();
  const pendingSettlementWrites = new Map();

  async function recordSignedRequest(invocation, request) {
    if (typeof invocation !== "string" || invocation === "") {
      throw new TypeError("a signed payment invocation identity is required");
    }
    const inFlight = pendingRequestWrites.get(invocation);
    if (inFlight) await inFlight;
    const existing = intents.get(invocation);
    if (existing) {
      if (!isDeepStrictEqual(existing.request, request)) {
        const error = new Error("signed invocation already binds a different observation request");
        error.code = "invocation-payload-conflict";
        throw error;
      }
      return structuredClone(existing);
    }
    const attempt = (async () => {
      const intent = {
        type: "X402PaidFabricationRunObservationIntent",
        invocation,
        request: structuredClone(request),
      };
      await append(structuredClone(intent));
      intents.set(invocation, intent);
      return intent;
    })();
    pendingRequestWrites.set(invocation, attempt);
    try {
      return structuredClone(await attempt);
    } finally {
      if (pendingRequestWrites.get(invocation) === attempt) pendingRequestWrites.delete(invocation);
    }
  }

  async function recordPaymentSettlement(evidence) {
    const invocation = evidence?.invocation;
    if (typeof invocation !== "string" || invocation === "") {
      throw new TypeError("successful settlement must identify the invocation");
    }
    const settled = terminals.get(invocation);
    if (settled) return structuredClone(settled);
    if (pendingSettlementWrites.has(invocation)) return structuredClone(await pendingSettlementWrites.get(invocation));
    const intent = intents.get(invocation);
    if (!intent) throw new Error("settled payment has no durable observation intent");
    // Capture once before async observation can yield to another caller.
    const settlement = structuredClone(evidence);

    const attempt = (async () => {
      let record;
      try {
        record = {
          type: "X402PaidFabricationRunObservationReceipt",
          invocation,
          settlement,
          pricing: priceQuote,
          result: structuredClone(await observe(structuredClone(intent.request))),
        };
      } catch (error) {
        record = {
          type: "X402PaidFabricationRunObservationRefusal",
          invocation,
          settlement,
          pricing: priceQuote,
          refusal: structuredClone(projectRefusal(error)),
        };
      }
      await append(structuredClone(record));
      terminals.set(invocation, record);
      return record;
    })();
    pendingSettlementWrites.set(invocation, attempt);
    try {
      return structuredClone(await attempt);
    } finally {
      if (pendingSettlementWrites.get(invocation) === attempt) pendingSettlementWrites.delete(invocation);
    }
  }

  function getReceiptResponse(invocation) {
    const terminal = terminals.get(invocation);
    if (terminal) {
      return { status: 200, body: { ok: true, invocation, status: "terminal", terminal: structuredClone(terminal) } };
    }
    if (intents.has(invocation)) {
      return { status: 202, body: { ok: true, invocation, status: "intent-recorded", settlement: "unobserved", terminal: null } };
    }
    return {
      status: 404,
      body: { ok: false, invocation, refusal: { type: "X402PaidFabricationRunObservationNotFound" } },
    };
  }

  return Object.freeze({
    recordSignedRequest, recordPaymentSettlement, getReceiptResponse,
    retain: recordSignedRequest, settle: recordPaymentSettlement, read: getReceiptResponse,
  });
}

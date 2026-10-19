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

  const retaining = new Map();
  const settling = new Map();

  async function retain(invocation, request) {
    if (typeof invocation !== "string" || invocation === "") {
      throw new TypeError("a signed payment invocation identity is required");
    }
    const inFlight = retaining.get(invocation);
    if (inFlight) await inFlight;
    const existing = intents.get(invocation);
    if (existing) {
      if (!isDeepStrictEqual(existing.request, request)) {
        const error = new Error("signed invocation already binds a different observation request");
        error.code = "invocation-payload-conflict";
        throw error;
      }
      return existing;
    }
    const attempt = (async () => {
      const intent = {
        type: "X402PaidFabricationRunObservationIntent",
        invocation,
        request: structuredClone(request),
      };
      await append(intent);
      intents.set(invocation, intent);
      return intent;
    })();
    retaining.set(invocation, attempt);
    try {
      return await attempt;
    } finally {
      if (retaining.get(invocation) === attempt) retaining.delete(invocation);
    }
  }

  async function settle(evidence) {
    const invocation = evidence?.invocation;
    if (typeof invocation !== "string" || invocation === "") {
      throw new TypeError("successful settlement must identify the invocation");
    }
    const settled = terminals.get(invocation);
    if (settled) return settled;
    if (settling.has(invocation)) return settling.get(invocation);
    const intent = intents.get(invocation);
    if (!intent) throw new Error("settled payment has no durable observation intent");

    const attempt = (async () => {
      let record;
      try {
        record = {
          type: "X402PaidFabricationRunObservationReceipt",
          invocation,
          settlement: evidence,
          pricing,
          result: await observe(intent.request),
        };
      } catch (error) {
        record = {
          type: "X402PaidFabricationRunObservationRefusal",
          invocation,
          settlement: evidence,
          pricing,
          refusal: projectRefusal(error),
        };
      }
      await append(record);
      terminals.set(invocation, record);
      return record;
    })();
    settling.set(invocation, attempt);
    try {
      return await attempt;
    } finally {
      if (settling.get(invocation) === attempt) settling.delete(invocation);
    }
  }

  function read(invocation) {
    const terminal = terminals.get(invocation);
    if (terminal) {
      return { status: 200, body: { ok: true, invocation, status: "terminal", terminal } };
    }
    if (intents.has(invocation)) {
      return { status: 202, body: { ok: true, invocation, status: "pending", terminal: null } };
    }
    return {
      status: 404,
      body: { ok: false, invocation, refusal: { type: "X402PaidFabricationRunObservationNotFound" } },
    };
  }

  return Object.freeze({ retain, settle, read });
}

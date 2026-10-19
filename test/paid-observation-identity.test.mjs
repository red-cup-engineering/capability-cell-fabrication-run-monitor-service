import assert from "node:assert/strict";
import test from "node:test";
import { paidObservationResultReference, paidObservationInvocationFromReference } from "../src/paid-observation-identity.mjs";
import { createPaidObservationLedger } from "../src/paid-observation-ledger.mjs";

const DIGEST = "A".repeat(43);
const INVOCATION = `ni:///sha-256;${DIGEST}`;

test("x402 canonical NI round-trips into a safe path segment", () => {
  const reference = paidObservationResultReference(INVOCATION);
  assert.equal(reference, DIGEST);
  assert.equal(paidObservationInvocationFromReference(reference), INVOCATION);
  assert.match(reference, /^[A-Za-z0-9_-]+$/u);
});

test("legacy sha256:hex format cannot be mistaken for an NI identity", () => {
  assert.throws(() => paidObservationResultReference(`sha256:${"a".repeat(64)}`), /canonical RFC 6920/);
  assert.equal(paidObservationInvocationFromReference("a".repeat(64)), null);
});

test("noncanonical SHA-256 digest pad bits and malformed references are refused", () => {
  for (const invalid of [undefined, "", "B".repeat(43), "A".repeat(42) + "B", "A".repeat(44), "a/b"]){
    assert.equal(paidObservationInvocationFromReference(invalid), null);
  }
  assert.throws(() => paidObservationResultReference(`ni:///sha-256;${"A".repeat(42)}B`), /invalid SHA-256/);
});

test("paid x402 receipt is reachable through the returned canonical result reference", async () => {
  const ledger = createPaidObservationLedger({
    intents: new Map(), terminals: new Map(),
    append: async () => {},
    observe: async () => ({ type: "FabricationRunObservation", state: { status: "completed" } }),
    projectRefusal: (e) => ({ reason: String(e) }),
    pricing: {},
  });
  await ledger.retain(INVOCATION, { run: "real-run" });
  const resultReference = paidObservationResultReference(INVOCATION);
  assert.equal(ledger.read(paidObservationInvocationFromReference(resultReference)).status, 202);
  await ledger.settle({ type: "X402SettlementEvidence", invocation: INVOCATION });
  const delivered = ledger.read(paidObservationInvocationFromReference(resultReference));
  assert.equal(delivered.status, 200);
  assert.equal(delivered.body.terminal.result.state.status, "completed");
});

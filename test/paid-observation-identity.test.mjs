import assert from "node:assert/strict";
import test from "node:test";
import { paidObservationResultReference, paidObservationInvocationFromReference } from "../src/paid-observation-identity.mjs";

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

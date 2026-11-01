import assert from "node:assert/strict";
import test from "node:test";
import { createPaidObservationLedger } from "../src/paid-observation-ledger.mjs";

const paymentInvocationId = `ni:///sha-256;${"A".repeat(43)}`;
function ledgerFixture() {
  const journal = [];
  let calls = 0;
  const ledger = createPaidObservationLedger({
    intents: new Map(),
    terminals: new Map(),
    append: async entry => journal.push(structuredClone(entry)),
    observe: async request => { calls++; return {type:"CapabilityCellFabricationRunObservation",request}; },
    projectRefusal: error => ({type:"CapabilityCellFabricationRunObservationRefusal",code:"failed",reason:String(error)}),
    pricing: {amount:1},
  });
  return {ledger,journal,calls:()=>calls};
}
test("standard ledger method names retain installed legacy invocation contracts", async () => {
  const f=ledgerFixture();
  assert.strictEqual(f.ledger.recordSignedRequest,f.ledger.retain);
  assert.strictEqual(f.ledger.recordPaymentSettlement,f.ledger.settle);
  assert.strictEqual(f.ledger.getReceiptResponse,f.ledger.read);
  assert.equal(f.ledger.getReceiptResponse(paymentInvocationId).status,404);
  await f.ledger.recordSignedRequest(paymentInvocationId,{run:"one"});
  assert.equal(f.ledger.read(paymentInvocationId).status,202);
  await f.ledger.recordPaymentSettlement({invocation:paymentInvocationId,transaction:"tx"});
  assert.equal(f.ledger.read(paymentInvocationId).status,200);
  assert.equal(f.journal.length,2);
  await f.ledger.settle({invocation:paymentInvocationId,transaction:"tx"});
  assert.equal(f.journal.length,2);
  assert.equal(f.calls(),1);
});
test("renamed operations preserve signed-request conflict refusal",async()=>{
  const f=ledgerFixture();
  await f.ledger.recordSignedRequest(paymentInvocationId,{run:"one"});
  await assert.rejects(f.ledger.retain(paymentInvocationId,{run:"two"}),{code:"invocation-payload-conflict"});
  assert.equal(f.journal.length,1);
});

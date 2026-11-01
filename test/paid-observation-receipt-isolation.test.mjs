import assert from "node:assert/strict";
import test from "node:test";
import { createPaidObservationLedger } from "../src/paid-observation-ledger.mjs";

const INVOCATION = `ni:///sha-256;${"A".repeat(43)}`;
const evidence = () => ({ invocation: INVOCATION, transaction: { id: "tx-one" } });

function fixture({ observe, projectRefusal, append } = {}) {
  const records = [];
  const intents = new Map();
  const terminals = new Map();
  const pricing = { currency: "USD", measure: { units: 1 } };
  const ledger = createPaidObservationLedger({
    intents,
    terminals,
    pricing,
    append: append ?? (async (record) => { records.push(structuredClone(record)); }),
    observe: observe ?? (async (request) => ({
      type: "CapabilityCellFabricationRunObservation",
      state: { status: "completed", request },
    })),
    projectRefusal: projectRefusal ?? ((error) => ({
      type: "CapabilityCellFabricationRunObservationRefusal",
      code: error.message,
    })),
  });
  return { ledger, records, intents, terminals, pricing };
}

test("returned intent cannot rewrite the signed request after durable retention", async () => {
  const f = fixture();
  const submitted = { run: "original" };
  const returned = await f.ledger.retain(INVOCATION, submitted);
  returned.request.run = "injected";
  submitted.run = "changed";

  assert.equal(f.intents.get(INVOCATION).request.run, "original");
  assert.equal(f.records[0].request.run, "original");
  assert.equal((await f.ledger.retain(INVOCATION, { run: "original" })).request.run, "original");
  await assert.rejects(f.ledger.retain(INVOCATION, { run: "changed" }), {
    code: "invocation-payload-conflict",
  });
});

test("settlement, pricing, and returned terminal cannot rewrite durable evidence", async () => {
  const f = fixture();
  const settlement = evidence();
  await f.ledger.retain(INVOCATION, { run: "run-one" });
  const returned = await f.ledger.settle(settlement);

  settlement.transaction.id = "rewritten";
  f.pricing.measure.units = 999;
  returned.settlement.transaction.id = "also-rewritten";
  returned.result.state.status = "forged-completed";

  const retained = f.ledger.read(INVOCATION).body.terminal;
  assert.equal(retained.settlement.transaction.id, "tx-one");
  assert.equal(retained.pricing.measure.units, 1);
  assert.equal(retained.result.state.status, "completed");
  assert.deepEqual(retained, f.records[1]);
});

test("two consumers and repeated settlement receive detached terminal readings", async () => {
  const f = fixture();
  await f.ledger.retain(INVOCATION, { run: "run-one" });
  await f.ledger.settle(evidence());
  const first = f.ledger.read(INVOCATION).body.terminal;
  const second = f.ledger.read(INVOCATION).body.terminal;
  first.result.state.status = "injected";
  second.result.state.request.run = "rewritten";
  (await f.ledger.settle(evidence())).result.state.status = "forged-replay";

  assert.equal(f.ledger.read(INVOCATION).body.terminal.result.state.status, "completed");
  assert.equal(f.ledger.read(INVOCATION).body.terminal.result.state.request.run, "run-one");
  assert.equal(f.records.length, 2, "replay must not append a duplicate terminal");
});

test("observation cannot rewrite its input intent while computing the result", async () => {
  const f = fixture({
    observe: async (request) => {
      request.run = "mutated-by-observer";
      return { type: "CapabilityCellFabricationRunObservation", state: { status: "completed" } };
    },
  });
  await f.ledger.retain(INVOCATION, { run: "original" });
  await f.ledger.settle(evidence());
  assert.equal(f.intents.get(INVOCATION).request.run, "original");
  await f.ledger.retain(INVOCATION, { run: "original" });
});

test("settlement is captured before delayed observation yields control", async () => {
  let finish;
  const f = fixture({
    observe: async () => new Promise((resolve) => { finish = resolve; }),
  });
  const settlement = evidence();
  await f.ledger.retain(INVOCATION, { run: "original" });
  const pending = f.ledger.settle(settlement);
  assert.equal(typeof finish, "function");
  settlement.transaction.id = "changed-during-observation";
  finish({ type: "CapabilityCellFabricationRunObservation", state: { status: "completed" } });
  await pending;
  assert.equal(f.ledger.read(INVOCATION).body.terminal.settlement.transaction.id, "tx-one");
});

test("typed refusal stays detached from a reusable projector object", async () => {
  const refusal = { type: "CapabilityCellFabricationRunObservationRefusal", detail: { code: "invalid-event" } };
  const f = fixture({
    observe: () => { throw new Error("invalid event"); },
    projectRefusal: () => refusal,
  });
  await f.ledger.retain(INVOCATION, { run: "original" });
  const returned = await f.ledger.settle(evidence());
  assert.equal(returned.type, "X402PaidFabricationRunObservationRefusal");
  refusal.detail.code = "pretend-success";
  returned.refusal.detail.code = "tampered";
  const original = f.ledger.read(INVOCATION).body.terminal;
  assert.equal(original.refusal.detail.code, "invalid-event");
  assert.deepEqual(original, f.records[1]);
});

test("concurrent settled readers cannot mutate each other or cause duplicate appends", async () => {
  let release;
  const f = fixture({
    append: async (record) => {
      if (record.type === "X402PaidFabricationRunObservationReceipt") {
        await new Promise((resolve) => { release = resolve; });
      }
    },
  });
  await f.ledger.retain(INVOCATION, { run: "original" });
  const first = f.ledger.settle(evidence());
  const second = f.ledger.settle(evidence());
  for (let i = 0; release === undefined && i < 10; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(typeof release, "function");
  release();
  const [a, b] = await Promise.all([first, second]);
  a.result.state.status = "forged";
  assert.equal(b.result.state.status, "completed");
  assert.equal(f.ledger.read(INVOCATION).body.terminal.result.state.status, "completed");
});

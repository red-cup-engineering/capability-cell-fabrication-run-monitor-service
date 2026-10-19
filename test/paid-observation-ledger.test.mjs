import assert from "node:assert/strict";
import test from "node:test";
import { createPaidObservationLedger } from "../src/paid-observation-ledger.mjs";

const INVOCATION = `sha256:${"ab".repeat(32)}`;
const EVIDENCE = { type: "X402SettlementEvidence", invocation: INVOCATION, transaction: `0x${"cd".repeat(32)}` };

function fixture(overrides = {}) {
  const records = [];
  let executions = 0;
  const ledger = createPaidObservationLedger({
    intents: new Map(),
    terminals: new Map(),
    append: async (record) => { records.push(record); },
    observe: async (request) => { executions++; return { type: "Observation", request }; },
    projectRefusal: (error) => ({ type: "CapabilityCellFabricationRunObservationRefusal", code: "execution-error", reason: error.message }),
    pricing: { result: "quoted" },
    ...overrides,
  });
  return { ledger, records, executions: () => executions };
}

test("unknown signature is 404 rather than fabricated pending work", () => {
  const { ledger } = fixture();
  assert.deepEqual(ledger.read(INVOCATION), {
    status: 404,
    body: {
      ok: false, invocation: INVOCATION,
      refusal: { type: "X402PaidFabricationRunObservationNotFound" },
    },
  });
});

test("retain persists the exact signed request before it becomes observable or settleable", async () => {
  let release;
  const events = [];
  const intents = new Map();
  const { ledger } = fixture({
    intents,
    append: async (record) => {
      events.push("append-start");
      await new Promise((resolve) => { release = resolve; });
      events.push("append-finished");
    },
  });
  const retention = ledger.retain(INVOCATION, { run: "signed-one" });
  assert.deepEqual(events, ["append-start"]);
  assert.equal(intents.size, 0);
  assert.equal(ledger.read(INVOCATION).status, 404);
  await assert.rejects(ledger.settle(EVIDENCE), /no durable observation intent/);
  release();
  await retention;
  assert.deepEqual(events, ["append-start", "append-finished"]);
  assert.equal(intents.get(INVOCATION).request.run, "signed-one");
  assert.equal(ledger.read(INVOCATION).status, 202);
  assert.equal(ledger.read(INVOCATION).body.status, "intent-recorded");
  assert.equal(ledger.read(INVOCATION).body.settlement, "unobserved");
});

test("one invocation cannot change body on retry or concurrent signed requests", async () => {
  const { ledger, records } = fixture();
  await Promise.all([
    ledger.retain(INVOCATION, { run: "signed-one", stages: ["a"] }),
    ledger.retain(INVOCATION, { stages: ["a"], run: "signed-one" }),
  ]);
  assert.equal(records.length, 1);
  await assert.rejects(
    ledger.retain(INVOCATION, { run: "other" }),
    (error) => error.code === "invocation-payload-conflict",
  );
  assert.equal(records.length, 1);
  assert.equal(ledger.read(INVOCATION).status, 202);
});

test("concurrent settlement executes exactly once and only claims terminal after durable append", async () => {
  let releaseTerminal;
  let observations = 0;
  const records = [];
  const { ledger } = fixture({
    append: async (record) => {
      if (record.type === "X402PaidFabricationRunObservationReceipt") {
        await new Promise((resolve) => { releaseTerminal = resolve; });
      }
      records.push(record);
    },
    observe: async () => { observations++; return { status: "accepted" }; },
  });
  await ledger.retain(INVOCATION, { run: "signed-one" });
  const a = ledger.settle(EVIDENCE);
  const b = ledger.settle(EVIDENCE);
  assert.equal(ledger.read(INVOCATION).status, 202);
  for (let attempt = 0; attempt < 10 && releaseTerminal === undefined; attempt++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(typeof releaseTerminal, "function", "terminal append was not reached");
  releaseTerminal();
  const [first, second] = await Promise.all([a, b]);
  assert.deepEqual(first, second);
  assert.deepEqual(await ledger.settle(EVIDENCE), first);
  assert.equal(observations, 1);
  assert.equal(records.length, 2);
  assert.equal(ledger.read(INVOCATION).status, 200);
  assert.equal(ledger.read(INVOCATION).body.terminal.result.status, "accepted");
});

test("typed refusals after successful settlement are terminal and survive restart", async () => {
  const intents = new Map();
  const terminals = new Map();
  const { ledger } = fixture({
    intents, terminals,
    observe: () => { throw new Error("observation contradicted the event trajectory"); },
    projectRefusal: () => ({ type: "CapabilityCellFabricationRunObservationRefusal", code: "event-time-regression" }),
  });
  await ledger.retain(INVOCATION, { run: "invalid-observation" });
  const result = await ledger.settle(EVIDENCE);
  assert.equal(result.type, "X402PaidFabricationRunObservationRefusal");
  assert.equal(result.refusal.code, "event-time-regression");
  const recovered = fixture({ intents, terminals }).ledger;
  assert.deepEqual(recovered.read(INVOCATION).body.terminal, result);
  assert.equal(recovered.read(INVOCATION).status, 200);
});

test("unwritten terminals, orphaned receipts and lost durable writes cannot become success", async () => {
  assert.throws(() => fixture({
    intents: new Map(),
    terminals: new Map([[INVOCATION, { type: "Receipt" }]]),
  }), /no matching durable observation intent/);
  const { ledger } = fixture({
    append: async (record) => {
      if (record.type !== "X402PaidFabricationRunObservationIntent") throw new Error("disk full");
    },
  });
  await ledger.retain(INVOCATION, { run: "signed-one" });
  await assert.rejects(ledger.settle(EVIDENCE), /disk full/);
  assert.equal(ledger.read(INVOCATION).status, 202);
});

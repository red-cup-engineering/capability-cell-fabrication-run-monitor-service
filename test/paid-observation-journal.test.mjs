import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendReceipt, receiptState } from "../src/paid-observation-journal.mjs";

async function withJournal(run) {
  const directory = await mkdtemp(join(tmpdir(), "moniday-paid-receipt-"));
  try { await run(join(directory, "nested", "receipts.jsonl")); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

test("absent journal means no invented paid invocations", async () => {
  await withJournal(async (path) => {
    const found = await receiptState(path);
    assert.equal(found.intents.size, 0);
    assert.equal(found.terminals.size, 0);
  });
});

test("real appended intent and terminal recover across fresh reads", async () => {
  await withJournal(async (path) => {
    const intent = { type: "X402PaidFabricationRunObservationIntent", invocation: "sha256:a", request: { run: "r" } };
    const terminal = { type: "X402PaidFabricationRunObservationReceipt", invocation: "sha256:a", result: { status: "completed" } };
    await appendReceipt(path, intent);
    assert.equal((await receiptState(path)).intents.get(intent.invocation).request.run, "r");
    assert.equal((await receiptState(path)).terminals.size, 0);
    await appendReceipt(path, terminal);
    const recovered = await receiptState(path);
    assert.deepEqual(recovered.terminals.get(terminal.invocation), terminal);
    assert.equal((await readFile(path, "utf8")).split("\n").filter(Boolean).length, 2);
  });
});

test("concurrent appends keep complete independent receipt lines", async () => {
  await withJournal(async (path) => {
    await Promise.all(Array.from({ length: 30 }, (_, n) => appendReceipt(path, {
      type: "X402PaidFabricationRunObservationIntent", invocation: `sha256:${n}`, request: { n },
    })));
    const raw = (await readFile(path, "utf8")).trim().split("\n").map(JSON.parse);
    assert.equal(raw.length, 30);
    assert.deepEqual(raw.map(x => x.request.n), Array.from({ length: 30 }, (_, n) => n));
    assert.equal((await receiptState(path)).intents.size, 30);
  });
});

test("incomplete terminal JSON refuses restart rather than inventing paid success", async () => {
  await withJournal(async (path) => {
    await appendReceipt(path, { type: "X402PaidFabricationRunObservationIntent", invocation: "sha256:b", request: {} });
    await writeFile(path, (await readFile(path, "utf8")) + '{"type":"X402PaidFabricationRunObservationReceipt",', "utf8");
    await assert.rejects(receiptState(path), SyntaxError);
  });
});

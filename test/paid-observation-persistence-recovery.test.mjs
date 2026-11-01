import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPaidObservationLedger } from "../src/paid-observation-ledger.mjs";
import { appendReceipt, receiptState } from "../src/paid-observation-journal.mjs";

const INVOCATION = `ni:///sha-256;${"A".repeat(43)}`;

test("flushed paid journal survives recovery, mutation, and idempotent replay", async () => {
  const directory = await mkdtemp(join(tmpdir(), "capfab-receive-"));
  const file = join(directory, "journal", "paid.jsonl");
  try {
    const source = await receiptState(file);
    const options = {
      ...source,
      pricing: { exact: "1" },
      append: async (record) => appendReceipt(file, record),
      observe: async (request) => ({
        type: "CapabilityCellFabricationRunObservation",
        state: { status: "completed", demand: request },
      }),
      projectRefusal: (error) => ({ code: error.message }),
    };
    const ledger = createPaidObservationLedger(options);
    await ledger.retain(INVOCATION, { source: "original", stages: ["a"] });
    const settlement = { invocation: INVOCATION, transaction: "0xone" };
    const terminal = await ledger.settle(settlement);
    settlement.transaction = "0xchanged";
    terminal.result.state.status = "tampered";

    const exactJournal = await readFile(file, "utf8");
    assert.equal(exactJournal.split("\n").filter(Boolean).length, 2);

    const recovered = await receiptState(file);
    const restarted = createPaidObservationLedger({
      ...options,
      ...recovered,
      append: async () => { throw new Error("unexpected duplicate append"); },
      observe: async () => { throw new Error("unexpected observation replay"); },
    });
    assert.equal(restarted.read(INVOCATION).status, 200);
    const replay = await restarted.settle({ invocation: INVOCATION, transaction: "0xone" });
    assert.equal(replay.result.state.status, "completed");
    assert.equal(replay.settlement.transaction, "0xone");
    assert.equal(await readFile(file, "utf8"), exactJournal);
    await assert.rejects(restarted.retain(INVOCATION, { source: "changed" }), {
      code: "invocation-payload-conflict",
    });

    // The existing journal owner must refuse a truncated final record.
    await writeFile(file, `${exactJournal}{"type":"X402PaidFabricationRunObservationReceipt",`);
    await assert.rejects(receiptState(file), SyntaxError);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

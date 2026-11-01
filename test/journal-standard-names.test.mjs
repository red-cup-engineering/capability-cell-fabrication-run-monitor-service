import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendJournalEntry, recoverJournalState, appendReceipt, receiptState } from "../src/paid-observation-journal.mjs";

test("original JSONL journal ports use standard names and preserve restart recovery", async () => {
  assert.strictEqual(appendReceipt, appendJournalEntry);
  assert.strictEqual(receiptState, recoverJournalState);
  const folder = await mkdtemp(join(tmpdir(), "monitor-journal-"));
  const path = join(folder,"nested","journal.jsonl");
  try {
    const paymentId = "ni:///sha-256;"+"A".repeat(43);
    await appendJournalEntry(path,{type:"X402PaidFabricationRunObservationIntent",invocation:paymentId,request:{run:"r"}});
    await appendReceipt(path,{type:"X402PaidFabricationRunObservationReceipt",invocation:paymentId,result:{state:{status:"completed"}}});
    const oldReader=await receiptState(path),newReader=await recoverJournalState(path);
    assert.deepEqual([...oldReader.terminals],[...newReader.terminals]);
    const original=await readFile(path,"utf8");assert.equal(original.split("\n").filter(Boolean).length,2);
    await writeFile(path, original+'{"type":"X402PaidFabricationRunObservationReceipt",');
    await assert.rejects(recoverJournalState(path),SyntaxError);
  } finally { await rm(folder,{recursive:true,force:true}); }
});

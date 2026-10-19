import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";

// The paid seller has one writer per process. Serialize its writes so receipt
// lines cannot interleave, and flush before acknowledging terminal completion.
const writes = new Map();

export async function appendReceipt(path, record) {
  const previous = writes.get(path) ?? Promise.resolve();
  const write = previous.catch(() => {}).then(async () => {
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, `${JSON.stringify(record)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flush: true,
    });
  });
  writes.set(path, write);
  try {
    await write;
  } finally {
    if (writes.get(path) === write) writes.delete(path);
  }
}

export async function receiptState(path) {
  let source;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return { intents: new Map(), terminals: new Map() };
    throw error;
  }
  // Fail closed on a torn/malformed journal; do not fabricate a paid outcome.
  const records = source.split("\n").filter(Boolean).map((line) => JSON.parse(line));
  return {
    intents: new Map(records
      .filter((record) => record?.type === "X402PaidFabricationRunObservationIntent")
      .map((record) => [record.invocation, record])),
    terminals: new Map(records
      .filter((record) => [
        "X402PaidFabricationRunObservationReceipt",
        "X402PaidFabricationRunObservationRefusal",
      ].includes(record?.type))
      .map((record) => [record.invocation, record])),
  };
}

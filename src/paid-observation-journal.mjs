import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { isDeepStrictEqual } from "node:util";

// The paid seller has one writer per process. Serialize its writes so receipt
// lines cannot interleave, and flush before acknowledging terminal completion.
const pendingLogAppends = new Map();

export async function appendLogEntry(path, record) {
  // Serialization cannot have written bytes, so refuse malformed in-memory
  // records before touching the per-file durable-write chain.
  const serializedRecord = JSON.stringify(record);
  if (typeof serializedRecord !== "string") {
    throw new TypeError("paid observation receipt is not a JSON record");
  }
  const previousAppend = pendingLogAppends.get(path) ?? Promise.resolve();
  // After any failed append we cannot know whether a partial record reached
  // disk. Preserve that failure for this path until a verified restart reads
  // the durable journal; do not append beyond uncertain bytes.
  const appendOperation = previousAppend.then(async () => {
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, `${serializedRecord}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flush: true,
    });
  });
  pendingLogAppends.set(path, appendOperation);
  await appendOperation;
  if (pendingLogAppends.get(path) === appendOperation) pendingLogAppends.delete(path);
}

export async function recoverLogState(path) {
  let logText;
  try {
    logText = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return { intents: new Map(), terminals: new Map() };
    throw error;
  }
  const logEntries = logText.split("\n").filter(Boolean).map((line) => JSON.parse(line));
  // A successful append writes a newline and flushes it. A final JSON object
  // without that delimiter may be a torn write, even when JSON parses.
  if (logText !== "" && !logText.endsWith("\n")) {
    throw new Error("paid observation journal has an unterminated record");
  }
  const intents = new Map();
  const terminals = new Map();
  for (const record of logEntries) {
    let bucket;
    if (record?.type === "X402PaidFabricationRunObservationIntent") {
      bucket = intents;
    } else if ([
      "X402PaidFabricationRunObservationReceipt",
      "X402PaidFabricationRunObservationRefusal",
    ].includes(record?.type)) {
      bucket = terminals;
    } else {
      // Other original journal records (such as OCapN admissions) retain
      // their independent meaning; do not convert them into paid results.
      continue;
    }
    if (typeof record.invocation !== "string" || record.invocation === "") {
      throw new Error("paid observation journal record lacks signed invocation");
    }
    const previous = bucket.get(record.invocation);
    if (previous && !isDeepStrictEqual(previous, record)) {
      throw new Error(bucket === intents
        ? "conflicting durable paid observation intents for one invocation"
        : "conflicting durable paid observation terminals for one invocation");
    }
    if (!previous) bucket.set(record.invocation, record);
  }
  return { intents, terminals };
}

/** Stable names for the original JSON Lines journal entry and recovery ports. */
export const appendRecord = appendLogEntry;
export const recordState = recoverLogState;

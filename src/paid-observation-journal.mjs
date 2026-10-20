import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { isDeepStrictEqual } from "node:util";

// The paid seller has one writer per process. Serialize its writes so receipt
// lines cannot interleave, and flush before acknowledging terminal completion.
const writes = new Map();

export async function appendReceipt(path, record) {
  const previous = writes.get(path) ?? Promise.resolve();
  // After any failed append we cannot know whether a partial record reached
  // disk. Preserve that failure for this path until a verified restart reads
  // the durable journal; do not append beyond uncertain bytes.
  const write = previous.then(async () => {
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, `${JSON.stringify(record)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flush: true,
    });
  });
  writes.set(path, write);
  await write;
  if (writes.get(path) === write) writes.delete(path);
}

export async function receiptState(path) {
  let source;
  try {
    source = await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return { intents: new Map(), terminals: new Map() };
    throw error;
  }
  const records = source.split("\n").filter(Boolean).map((line) => JSON.parse(line));
  // A successful append writes a newline and flushes it. A final JSON object
  // without that delimiter may be a torn write, even when JSON parses.
  if (source !== "" && !source.endsWith("\n")) {
    throw new Error("paid observation journal has an unterminated record");
  }
  const intents = new Map();
  const terminals = new Map();
  for (const record of records) {
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

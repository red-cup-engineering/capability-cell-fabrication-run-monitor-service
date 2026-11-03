#!/usr/bin/env node

import { observeCapabilityCellFabricationRun } from "../src/observe.mjs";
import { toObservationCloudEvent } from "../src/cloud-events.mjs";

const useCloudEvents = process.argv.includes("--format=cloudevents-json");
let requestJson = "";
for await (const inputChunk of process.stdin) requestJson += inputChunk;
try {
  const observation = observeCapabilityCellFabricationRun(JSON.parse(requestJson));
  const representation = useCloudEvents ? toObservationCloudEvent(observation, { source: process.env.CAPABILITY_MONITOR_EVENT_SOURCE }) : observation;
  process.stdout.write(`${JSON.stringify(representation)}\n`);
} catch (error) {
  const rejection = typeof error?.toJSON === "function"
    ? error.toJSON()
    : {
      type: "CapabilityCellFabricationRunObservationRefusal",
      code: "invalid-transport",
      reason: error instanceof Error ? error.message : String(error),
    };
  process.stdout.write(`${JSON.stringify(rejection)}\n`);
  process.exitCode = 1;
}

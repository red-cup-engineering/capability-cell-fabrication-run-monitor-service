#!/usr/bin/env node

import { observeCapabilityCellFabricationRun } from "../src/observe.mjs";

let source = "";
for await (const chunk of process.stdin) source += chunk;
try {
  process.stdout.write(`${JSON.stringify(observeCapabilityCellFabricationRun(JSON.parse(source)))}\n`);
} catch (error) {
  const refusal = typeof error?.toJSON === "function"
    ? error.toJSON()
    : {
      type: "CapabilityCellFabricationRunObservationRefusal",
      code: "invalid-transport",
      reason: error instanceof Error ? error.message : String(error),
    };
  process.stdout.write(`${JSON.stringify(refusal)}\n`);
  process.exitCode = 1;
}

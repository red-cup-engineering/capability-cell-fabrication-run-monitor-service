import { readFileSync } from "node:fs";
import { compileRmlLaw } from "@emsenn/rmn-semantic-conformance/law";

export const CAPABILITY_CELL_FABRICATION_RUN_OBSERVATION_LAW = compileRmlLaw(
  readFileSync(
    new URL(
      "../content/contracts/observe-capability-cell-fabrication-run.rml",
      import.meta.url,
    ),
    "utf8",
  ),
);

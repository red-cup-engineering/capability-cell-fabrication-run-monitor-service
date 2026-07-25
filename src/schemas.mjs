import inputSchema from "../content/schemas/observation-input.schema.json" with { type: "json" };
import outputSchema from "../content/schemas/observation-output.schema.json" with { type: "json" };
import refusalSchema from "../content/schemas/observation-refusal.schema.json" with { type: "json" };
import stateSchema from "../content/schemas/observed-run-state.schema.json" with { type: "json" };

export const OBSERVATION_INPUT_SCHEMA = Object.freeze(inputSchema);
export const OBSERVATION_OUTPUT_SCHEMA = Object.freeze(outputSchema);
export const OBSERVATION_REFUSAL_SCHEMA = Object.freeze(refusalSchema);
export const OBSERVED_RUN_STATE_SCHEMA = Object.freeze(stateSchema);

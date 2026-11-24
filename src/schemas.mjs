import { deepFreeze } from "@red-cup-engineering/signcell/values";
import inputSchema from "../content/schemas/observation-input.schema.json" with { type: "json" };
import outputSchema from "../content/schemas/observation-output.schema.json" with { type: "json" };
import refusalSchema from "../content/schemas/observation-refusal.schema.json" with { type: "json" };
import stateSchema from "../content/schemas/observed-run-state.schema.json" with { type: "json" };
import paidJournalEntrySchema from "../content/schemas/paid-observation-journal-entry.schema.json" with { type: "json" };

// JSON modules are inert data, but freezing only their root lets another
// consumer change nested $ref and format declarations for everyone in-process.
// The source-owned schema carriers are fixed contracts, not mutable settings.


export const OBSERVATION_INPUT_SCHEMA = deepFreeze(inputSchema);
export const OBSERVATION_OUTPUT_SCHEMA = deepFreeze(outputSchema);
export const OBSERVATION_REFUSAL_SCHEMA = deepFreeze(refusalSchema);
export const OBSERVED_RUN_STATE_SCHEMA = deepFreeze(stateSchema);

/** Opt-in authoring schema. Never silently gate historical journal replay. */
export const PAID_JOURNAL_ENTRY_SCHEMA = deepFreeze(paidJournalEntrySchema);

import assert from "node:assert/strict";
import test from "node:test";
import {
  OBSERVATION_INPUT_SCHEMA,
  OBSERVATION_OUTPUT_SCHEMA,
  OBSERVATION_REFUSAL_SCHEMA,
  OBSERVED_RUN_STATE_SCHEMA,
} from "../src/schemas.mjs";

const AOE_V1 = new Set([
  "urn:red-cup-engineering:schema:capability-cell-fabrication-run-observation-input:v1",
  "urn:red-cup-engineering:schema:capability-cell-fabrication-run-observation-output:v1",
  "urn:red-cup-engineering:schema:observed-capability-cell-fabrication-run-state:v1",
]);
const MONITOR_NAMESPACE = "urn:red-cup-engineering:schema:monitor-";

test("Monitor's three differing schema bodies no longer counterfeit Organizing v1 identity", () => {
  const differing = [OBSERVATION_INPUT_SCHEMA, OBSERVATION_OUTPUT_SCHEMA, OBSERVED_RUN_STATE_SCHEMA];
  for (const schema of differing) {
    assert.ok(schema.$id.startsWith(MONITOR_NAMESPACE), schema.$id);
    assert.ok(schema.$id.endsWith(":v2"), schema.$id);
    assert.ok(!AOE_V1.has(schema.$id), schema.$id);
  }
  const ids = [...differing, OBSERVATION_REFUSAL_SCHEMA].map((schema) => schema.$id);
  assert.equal(new Set(ids).size, ids.length, "all installed source schema IDs must be unique");
});

test("the original identical typed refusal keeps its original v1 identity", () => {
  assert.equal(OBSERVATION_REFUSAL_SCHEMA.$id,
    "urn:red-cup-engineering:schema:capability-cell-fabrication-run-observation-refusal:v1");
  assert.deepEqual(OBSERVATION_REFUSAL_SCHEMA.required, ["type", "code", "reason"]);
});

test("Monitor output names an actual registered state schema, not a relative unresolved URL", () => {
  assert.equal(OBSERVATION_OUTPUT_SCHEMA.properties.state.$ref, OBSERVED_RUN_STATE_SCHEMA.$id);
  assert.equal(OBSERVATION_OUTPUT_SCHEMA.properties.type.const,
    "CapabilityCellFabricationRunObservation");
  assert.deepEqual(OBSERVATION_OUTPUT_SCHEMA.required, ["type", "state"]);
});

test("the Monitor wire profile retains stricter event time and explicit lastEventAt", () => {
  assert.equal(OBSERVATION_INPUT_SCHEMA.properties.events.items.properties.at.format, "date-time");
  assert.equal(OBSERVED_RUN_STATE_SCHEMA.properties.lastEventAt.format, "date-time");
  assert.ok(OBSERVED_RUN_STATE_SCHEMA.required.includes("lastEventAt"));
  assert.ok(OBSERVED_RUN_STATE_SCHEMA.required.includes("eventHead"));
  assert.ok(OBSERVED_RUN_STATE_SCHEMA.required.includes("events"));
  assert.equal(OBSERVED_RUN_STATE_SCHEMA.additionalProperties, false);
  assert.equal(OBSERVATION_INPUT_SCHEMA.properties.type.const,
    "CapabilityCellFabricationRunObservationRequest");
});

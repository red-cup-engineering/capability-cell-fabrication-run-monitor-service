import assert from "node:assert/strict";
import test from "node:test";
import {
  PAID_JOURNAL_ENTRY_SCHEMA,
  OBSERVATION_OUTPUT_SCHEMA,
  OBSERVATION_REFUSAL_SCHEMA,
} from "../src/schemas.mjs";

test("four first-party journal record envelopes have distinct typed discriminants", () => {
  const schema = PAID_JOURNAL_ENTRY_SCHEMA;
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.$id, "urn:red-cup-engineering:schema:monitor-paid-observation-journal-entry:v1");
  const names = schema.oneOf.map((item) => item.$ref);
  assert.deepEqual(names, [
    "#/$defs/intent", "#/$defs/receipt", "#/$defs/refusal", "#/$defs/ocapnAdmission",
  ]);
  const kinds = names.map((pointer) => schema.$defs[pointer.split("/").at(-1)].properties.type.const);
  assert.equal(new Set(kinds).size, 4);
  for (const entry of Object.values(schema.$defs)) {
    if (entry.properties) assert.equal(entry.additionalProperties, false);
  }
});

test("terminal result schemas bind the actual Monitor v2 and shared v1 refusal identities", () => {
  const { receipt, refusal } = PAID_JOURNAL_ENTRY_SCHEMA.$defs;
  assert.equal(receipt.properties.result.$ref, OBSERVATION_OUTPUT_SCHEMA.$id);
  assert.equal(refusal.properties.refusal.$ref, OBSERVATION_REFUSAL_SCHEMA.$id);
  assert.ok(receipt.required.includes("settlement"));
  assert.ok(refusal.required.includes("settlement"));
  assert.ok(PAID_JOURNAL_ENTRY_SCHEMA.$defs.intent.required.includes("request"));
  assert.deepEqual(PAID_JOURNAL_ENTRY_SCHEMA.$defs.intent.properties.request, {},
    "source intents stay retainable even when later found malformed");
});

test("original recovery stays unaffected and schema is deeply immutable", () => {
  assert.equal(Object.isFrozen(PAID_JOURNAL_ENTRY_SCHEMA.$defs.receipt.properties), true);
  assert.throws(() => {
    PAID_JOURNAL_ENTRY_SCHEMA.$defs.receipt.properties.type.const = "fake";
  }, TypeError);
});

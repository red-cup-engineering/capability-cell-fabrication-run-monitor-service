/** Frozen JSON Schema Draft 2020-12 resource; IDs are source- and version-specific. */
export type JsonSchemaResource = Readonly<{ $schema: string; $id: string; [keyword: string]: unknown }>;
export declare const OBSERVATION_INPUT_SCHEMA: JsonSchemaResource;
export declare const OBSERVATION_OUTPUT_SCHEMA: JsonSchemaResource;
export declare const OBSERVATION_REFUSAL_SCHEMA: JsonSchemaResource;
export declare const OBSERVED_RUN_STATE_SCHEMA: JsonSchemaResource;

/** Authored first-party JSON Lines envelopes, not a historical replay gate. */
export declare const PAID_JOURNAL_ENTRY_SCHEMA: JsonSchemaResource;

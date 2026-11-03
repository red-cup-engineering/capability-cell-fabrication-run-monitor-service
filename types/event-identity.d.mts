import type { Sha256NiUri } from "./index.d.mts";

/** Native Sign/WitnessJournal content identity, not the CloudEvents envelope ID. */
export declare function canonicalEventIdentity(
  entry: Readonly<Record<string, unknown>>,
): Sha256NiUri;
/** Original semantic event carrier bytes (not a JSON serialization). */
export declare function canonicalEventCarrier(
  entry: Readonly<Record<string, unknown>>,
): Uint8Array;

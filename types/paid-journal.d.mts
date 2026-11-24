import type { PaidObservationIntent, PaidObservationOutcome } from "./paid-ledger.d.mts";
/** Existing newline-delimited JSON (JSON Lines) append-only journal.
 * A successful call does not authorize payment; the original x402 boundary does.
 */
export declare function appendJournalEntry(path: string, entry: Readonly<Record<string, unknown>>): Promise<void>;
export declare function recoverJournalState(path: string): Promise<{
  intents: Map<string, PaidObservationIntent>;
  terminals: Map<string, PaidObservationOutcome>;
}>;
/** Original installed aliases. */
export declare const appendReceipt: typeof appendJournalEntry;
export declare const receiptState: typeof recoverJournalState;

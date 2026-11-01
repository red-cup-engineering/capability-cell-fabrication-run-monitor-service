import type { FabricationRunObservation, FabricationRunObservationRejection } from "./index.d.mts";

export interface PaidObservationIntent {
  readonly type: "X402PaidFabricationRunObservationIntent";
  readonly invocation: string;
  readonly request: unknown;
}
export interface PaidObservationReceipt {
  readonly type: "X402PaidFabricationRunObservationReceipt";
  readonly invocation: string;
  readonly settlement: unknown;
  readonly pricing: unknown;
  readonly result: FabricationRunObservation;
}
export interface PaidObservationRefusal {
  readonly type: "X402PaidFabricationRunObservationRefusal";
  readonly invocation: string;
  readonly settlement: unknown;
  readonly pricing: unknown;
  readonly refusal: FabricationRunObservationRejection;
}
export type PaidObservationOutcome = PaidObservationReceipt | PaidObservationRefusal;
export type PaidObservationHttpResponse =
  | { readonly status: 200; readonly body: { readonly ok: true; readonly invocation: string; readonly status: "terminal"; readonly terminal: PaidObservationOutcome } }
  | { readonly status: 202; readonly body: { readonly ok: true; readonly invocation: string; readonly status: "intent-recorded"; readonly settlement: "unobserved"; readonly terminal: null } }
  | { readonly status: 404; readonly body: { readonly ok: false; readonly invocation: string; readonly refusal: { readonly type: "X402PaidFabricationRunObservationNotFound" } } };

/** Existing durable ledger, not an x402 payment authorization boundary. */
export interface PaidObservationLedger {
  recordSignedRequest(paymentInvocationId: string, request: unknown): Promise<PaidObservationIntent>;
  recordPaymentSettlement(evidence: { readonly invocation: string; readonly [key: string]: unknown }): Promise<PaidObservationOutcome>;
  getReceiptResponse(paymentInvocationId: string): PaidObservationHttpResponse;
  /** Legacy compatibility alias. */
  retain: PaidObservationLedger["recordSignedRequest"];
  /** Legacy compatibility alias. */
  settle: PaidObservationLedger["recordPaymentSettlement"];
  /** Legacy compatibility alias. */
  read: PaidObservationLedger["getReceiptResponse"];
}
export interface PaidObservationLedgerDependencies {
  readonly intents: Map<string, PaidObservationIntent>;
  readonly terminals: Map<string, PaidObservationOutcome>;
  readonly append: (record: PaidObservationIntent | PaidObservationOutcome) => Promise<void>;
  readonly observe: (request: unknown) => FabricationRunObservation | Promise<FabricationRunObservation>;
  readonly projectRefusal: (error: unknown) => FabricationRunObservationRejection;
  readonly pricing: unknown;
}
export declare function createPaidObservationLedger(dependencies: PaidObservationLedgerDependencies): PaidObservationLedger;

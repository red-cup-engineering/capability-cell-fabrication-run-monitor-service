/** Native signed event identity. Distinct from a CloudEvents envelope ID. */
export type Sha256NiUri = `ni:///sha-256;${string}`;
export type FabricationStatus = "ready" | "working" | "obstructed" | "completed";
export interface FabricationJournalEntry {
  readonly id: Sha256NiUri;
  readonly run: string;
  readonly sequence: number;
  readonly previous: Sha256NiUri | null;
  readonly at: string;
  readonly type: string;
  readonly stage?: string;
  readonly hiredCells?: readonly string[];
  readonly [attribute: string]: unknown;
}
export interface FabricationRunObservationRequest {
  readonly type: "CapabilityCellFabricationRunObservationRequest";
  readonly run: string;
  readonly stages: readonly string[];
  readonly events: readonly FabricationJournalEntry[];
}
export interface FabricationRunObservedState {
  readonly id: string;
  readonly status: FabricationStatus;
  readonly demand: Readonly<Record<string, unknown>> | null;
  readonly completed: readonly string[];
  readonly currentStage: string | null;
  readonly obstruction: FabricationJournalEntry | null;
  readonly hiredCells: readonly string[];
  readonly result: Readonly<Record<string, unknown>> | null;
  readonly lastEventAt: string;
  readonly eventHead: Sha256NiUri;
  readonly eventCount: number;
  readonly events: readonly FabricationJournalEntry[];
}
export interface FabricationRunObservation {
  readonly type: "CapabilityCellFabricationRunObservation";
  readonly state: FabricationRunObservedState;
}
export interface FabricationRunObservationRejection {
  readonly type: "CapabilityCellFabricationRunObservationRefusal";
  readonly code: string;
  readonly reason: string;
}
export declare class FabricationRunObservationRefusal extends Error {
  readonly code: string;
  toJSON(): FabricationRunObservationRejection;
}
export declare function observeCapabilityCellFabricationRun(
  request: FabricationRunObservationRequest,
): FabricationRunObservation;
export declare const evaluateFabricationRun: typeof observeCapabilityCellFabricationRun;

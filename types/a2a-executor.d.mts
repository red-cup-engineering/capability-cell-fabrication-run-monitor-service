import type { FabricationRunObservation, FabricationRunObservationRequest } from "./index.d.mts";

/** Original Agent2Agent message/RMN (CBOR) service adapter.
 * The A2A SDK remains authoritative for envelope validity, authorization,
 * and transport. These types do not add another JSON-only protocol.
 */
export declare const ACTOR: "urn:ame:capability-cell-fabrication-run-monitor-service";
export declare function executeA2aMessage(
  message: unknown,
  options?: {
    observe?: (request: FabricationRunObservationRequest) =>
      FabricationRunObservation | Promise<FabricationRunObservation>;
  },
): Promise<Record<string, unknown>>;

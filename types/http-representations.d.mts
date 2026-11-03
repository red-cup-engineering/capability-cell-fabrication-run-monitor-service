import type { PaidObservationHttpResponse } from "./paid-ledger.d.mts";
import type { CloudEvent } from "./cloud-events.d.mts";
import type { FabricationRunObservation } from "./index.d.mts";
export declare function acceptsCloudEventJson(acceptHeader: string | undefined): boolean;
export declare function representPaidObservationResponse(
  response: PaidObservationHttpResponse,
  acceptHeader: string | undefined,
  options?: { readonly source?: string },
): { status: number; contentType: "application/json" | "application/cloudevents+json"; body: PaidObservationHttpResponse["body"] | CloudEvent<FabricationRunObservation> };

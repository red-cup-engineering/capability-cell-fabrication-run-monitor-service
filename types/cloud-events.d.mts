import type { FabricationRunObservation } from "./index.d.mts";

/** CloudEvents 1.0 JSON Event Format. Structured HTTP media type is
 * application/cloudevents+json; this event is NOT a native signed event.
 */
export interface CloudEvent<TData> {
  readonly specversion: "1.0";
  readonly id: string;
  readonly source: string;
  readonly type: string;
  readonly subject: string;
  readonly time: string;
  readonly datacontenttype: "application/json";
  readonly data: TData;
}
export declare const CLOUD_EVENT_MEDIA_TYPE: "application/cloudevents+json";
export declare const OBSERVATION_EVENT_TYPE: "group.561.capability-fabrication.run.observed.v1";
export declare const OBSERVATION_EVENT_SOURCE: "urn:red-cup-engineering:capability-cell-fabrication-run-monitor-service";
export declare function toObservationCloudEvent(
  observation: FabricationRunObservation,
  options?: { readonly source?: string },
): CloudEvent<FabricationRunObservation>;

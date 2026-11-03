import { createHash } from "node:crypto";

// A format adapter over accepted readings, not a second event journal.
// CloudEvents JSON event format 1.0 (application/cloudevents+json).
export const CLOUD_EVENT_MEDIA_TYPE = "application/cloudevents+json";
export const OBSERVATION_EVENT_TYPE = "group.561.capability-fabrication.run.observed.v1";
export const OBSERVATION_EVENT_SOURCE = "urn:red-cup-engineering:capability-cell-fabrication-run-monitor-service";

function absoluteSourceUri(value) {
  if (typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value)) {
    throw new TypeError("CloudEvents source must be an absolute URI");
  }
  try {
    new URL(value);
  } catch {
    throw new TypeError("CloudEvents source must be a valid absolute URI");
  }
  return value;
}

/** Project a *successful* original observation into CloudEvents 1.0 JSON.
 * The native reading remains inside `data` without reissuing its event NI,
 * changing signed payloads, or asserting payment or independent receiving.
 */
export function toObservationCloudEvent(observation, { source = OBSERVATION_EVENT_SOURCE } = {}) {
  const sourceUri = absoluteSourceUri(source);
  // Snapshot once. Validation and the returned envelope must use the same
  // detached data; a changing caller must not race this transformation.
  let data;
  try { data = structuredClone(observation); }
  catch { throw new TypeError("CloudEvents projection requires serializable observation data"); }
  const state = data?.state;
  if (data?.type !== "CapabilityCellFabricationRunObservation"
      || !state || typeof state !== "object"
      || typeof state.id !== "string" || state.id.length === 0
      || typeof state.eventHead !== "string" || !/^ni:\/\/\/sha-256;[A-Za-z0-9_-]{43}$/u.test(state.eventHead)
      || !Array.isArray(state.events) || state.events.length === 0
      || state.events.at(-1)?.id !== state.eventHead
      || typeof state.lastEventAt !== "string"
      || state.events.at(-1)?.at !== state.lastEventAt
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(state.lastEventAt)
      || !Number.isFinite(Date.parse(state.lastEventAt))) {
    throw new TypeError("CloudEvents projection requires typed observation data with consistent source event metadata");
  }
  // This ID names the *representation's exact JSON bytes*, not the native
  // Sign/WitnessJournal semantic NI. The latter remains in data.state.eventHead.
  const eventId = `sha256-${createHash("sha256")
    .update(JSON.stringify({ source: sourceUri, data }))
    .digest("hex")}`;
  return {
    specversion: "1.0",
    id: eventId,
    source: sourceUri,
    type: OBSERVATION_EVENT_TYPE,
    subject: state.id,
    time: state.lastEventAt,
    datacontenttype: "application/json",
    data,
  };
}

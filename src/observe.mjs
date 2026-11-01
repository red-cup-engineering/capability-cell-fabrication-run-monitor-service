import { OBSERVATION_INPUT_SCHEMA } from "./schemas.mjs";
import { canonicalEventIdentity } from "./event-identity.mjs";

const CONTENT_ADDRESS_PATTERN = /^ni:\/\/\/sha-256;[A-Za-z0-9_-]{43}$/u;
const FABRICATION_RUN_ID_PATTERN = /^(?:[A-Za-z0-9_-]{43}|[0-9a-f-]{36})$/u;
const RFC3339_TIMESTAMP_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u;

export class FabricationRunObservationRefusal extends Error {
  constructor(code, reason) {
    super(reason);
    this.name = "FabricationRunObservationRefusal";
    this.code = code;
  }

  toJSON() {
    return {
      type: "CapabilityCellFabricationRunObservationRefusal",
      code: this.code,
      reason: this.message,
    };
  }
}

function rejectObservation(code, reason) {
  throw new FabricationRunObservationRefusal(code, reason);
}

function validateObservationRequest(request) {
  const hasExpectedRequestFields = Object.keys(request ?? {}).sort().join("\0")
    === Object.keys(OBSERVATION_INPUT_SCHEMA.properties).sort().join("\0");
  if (!hasExpectedRequestFields || request?.type !== "CapabilityCellFabricationRunObservationRequest") {
    rejectObservation("invalid-request", "request must contain exactly type, run, stages, and events");
  }
  if (!FABRICATION_RUN_ID_PATTERN.test(request.run)) rejectObservation("invalid-run", "run must be one canonical fabrication run identifier");
  if (!Array.isArray(request.stages) || request.stages.length === 0
      || request.stages.some((stage) => typeof stage !== "string" || stage === "")
      || new Set(request.stages).size !== request.stages.length) {
    rejectObservation("invalid-stages", "stages must be one nonempty duplicate-free ordered sequence");
  }
  if (!Array.isArray(request.events) || request.events.length === 0) {
    rejectObservation("events-absent", "at least one durable event is required");
  }
}

function validateJournalSequence(request) {
  let previous = null;
  let previousTimestampMsstampMs = -Infinity;
  let previousSubmillisecondDigits = "";
  const completedStageIds = new Set();
  let isTerminal = false;
  for (const [sequence, event] of request.events.entries()) {
    if (!event || Object.getPrototypeOf(event) !== Object.prototype) {
      rejectObservation("invalid-event", `event ${sequence} is not a plain object`);
    }
    if (!CONTENT_ADDRESS_PATTERN.test(event.id ?? "") || event.id !== canonicalEventIdentity(event)) {
      rejectObservation("event-identity-drift", `event ${sequence} does not carry its exact content identity`);
    }
    if (event.run !== request.run) rejectObservation("foreign-run-event", `event ${sequence} belongs to a different run`);
    if (event.sequence !== sequence) rejectObservation("event-sequence-gap", `event ${sequence} has the wrong sequence`);
    if (event.previous !== previous) rejectObservation("event-predecessor-drift", `event ${sequence} has the wrong predecessor`);
    if (typeof event.type !== "string" || event.type === "") {
      rejectObservation("invalid-event", `event ${sequence} lacks its event type`);
    }
    if (typeof event.at !== "string" || !RFC3339_TIMESTAMP_PATTERN.test(event.at) || !Number.isFinite(Date.parse(event.at))) {
      rejectObservation("invalid-event-time", `event ${sequence} must carry an RFC 3339 observation time`);
    }
    // Date.parse alone accepts normalized impossible dates (e.g. February 30)
    // and discards precision beyond milliseconds. Neither is admissible as a
    // source-event observation, whose original RFC 3339 timestamp is kept.
    const year = Number(event.at.slice(0, 4));
    const month = Number(event.at.slice(5, 7));
    const day = Number(event.at.slice(8, 10));
    const calendar = new Date(0);
    calendar.setUTCFullYear(year, month - 1, day);
    if (calendar.getUTCFullYear() !== year ||
        calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) {
      rejectObservation("invalid-event-time", `event ${sequence} names a nonexistent calendar date`);
    }
    const eventTimestampMsstampMs = Date.parse(event.at);
    // RFC 3339 permits sub-millisecond fractional seconds. The UTC epoch
    // millisecond covers time zones; compare remaining fractional digits
    // only when that epoch millisecond is equal. Trimming trailing zeroes
    // preserves equal instants written at different declared precision.
    const fraction = /\.(\d+)/u.exec(event.at)?.[1] ?? "";
    const submillisecondDigits = fraction.slice(3).replace(/0+$/u, "");
    const fractionalPrecision = Math.max(submillisecondDigits.length, previousSubmillisecondDigits.length);
    if (eventTimestampMs < previousTimestampMs ||
        (eventTimestampMs === previousTimestampMs &&
          submillisecondDigits.padEnd(fractionalPrecision, "0") <
          previousSubmillisecondDigits.padEnd(fractionalPrecision, "0"))) {
      rejectObservation("event-time-regression", `event ${sequence} precedes the previous observation time`);
    }
    if (event.stage !== undefined && !request.stages.includes(event.stage)) {
      rejectObservation("unknown-stage", `event ${sequence} names a stage outside the declared fabrication plan`);
    }
    if (isTerminal && ["stage-started", "stage-deferred", "stage-obstructed", "stage-completed"].includes(event.type)) {
      rejectObservation("post-completion-stage-event", `event ${sequence} changes a stage after fabrication completed`);
    }
    if (["stage-started", "stage-deferred", "stage-obstructed"].includes(event.type)) {
      if (event.stage === undefined) {
        rejectObservation("missing-stage", `event ${sequence} changes a stage without identifying it`);
      }
      if (completedStageIds.has(event.stage)) {
        rejectObservation("completed-stage-transition", `event ${sequence} reopens an already completed stage`);
      }
    }
    if (event.type === "stage-completed") {
      const nextStage = request.stages.find((stage) => !completedStageIds.has(stage));
      if (event.stage === undefined || event.stage !== nextStage) {
        rejectObservation("invalid-stage-completion", `event ${sequence} does not complete the next unfinished stage`);
      }
      completedStageIds.add(event.stage);
    }
    if (event.type === "fabrication-completed") {
      if (isTerminal || completedStageIds.size !== request.stages.length
          || !event.cell || typeof event.cell !== "object" || Array.isArray(event.cell)) {
        rejectObservation("premature-fabrication-completion", `event ${sequence} cannot attest a completed cell without every stage and a result`);
      }
      isTerminal = true;
    }
    previousTimestampMs = eventTimestampMs;
    previousSubmillisecondDigits = submillisecondDigits;
    previous = event.id;
  }
}

export function observeCapabilityCellFabricationRun(request) {
  validateObservationRequest(request);
  validateJournalSequence(request);
  const { events, stages } = request;
  const originatingDemand = events.find((event) => event.type === "demand-submitted")?.demand ?? null;
  const completedStageIds = new Set(events
    .filter((event) => event.type === "stage-completed")
    .map((event) => event.stage));
  const currentStage = stages.find((stage) => !completedStageIds.has(stage)) ?? null;
  const stageStatusEvent = currentStage === null ? null : [...events].reverse()
    .find((event) => event.stage === currentStage
      && ["stage-started", "stage-deferred", "stage-obstructed"].includes(event.type)) ?? null;
  const blockingEvent = stageStatusEvent?.type === "stage-obstructed" ? currentStageEvent : null;
  const fabricatedCell = [...events].reverse()
    .find((event) => event.type === "fabrication-completed")?.cell ?? null;
  const observationState = {
    id: request.run,
    status: fabricatedCell ? "completed" : blockingEvent ? "obstructed"
      : stageStatusEvent?.type === "stage-started" ? "working" : "ready",
    demand: originatingDemand,
    completed: stages.filter((stage) => completedStageIds.has(stage)),
    currentStage,
    obstruction: blockingEvent,
    hiredCells: [...new Set(events.flatMap((event) => event.hiredCells ?? []))],
    result: fabricatedCell,
    lastEventAt: events.at(-1).at,
    eventHead: events.at(-1).id,
    eventCount: events.length,
    events: structuredClone(events),
  };
  return Object.freeze({
    type: "CapabilityCellFabricationRunObservation",
    state: Object.freeze(observationState),
  });
}

/** Industry-language SDK alias; the original native A2A/CLI/x402 entrypoint is unchanged. */
export const evaluateFabricationRun = observeCapabilityCellFabricationRun;

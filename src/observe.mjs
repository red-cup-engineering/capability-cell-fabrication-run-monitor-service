import { createHash } from "node:crypto";
import { OBSERVATION_INPUT_SCHEMA } from "./schemas.mjs";

const NI = /^ni:\/\/\/sha-256;[A-Za-z0-9_-]{43}$/u;
const RUN = /^[0-9a-f-]{36}$/u;

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

function refuse(code, reason) {
  throw new FabricationRunObservationRefusal(code, reason);
}

function eventIdentity(event) {
  const { id: _id, ...body } = event;
  return `ni:///sha-256;${createHash("sha256").update(JSON.stringify(body)).digest("base64url")}`;
}

function validateRequest(request) {
  const exact = Object.keys(request ?? {}).sort().join("\0")
    === Object.keys(OBSERVATION_INPUT_SCHEMA.properties).sort().join("\0");
  if (!exact || request?.type !== "CapabilityCellFabricationRunObservationRequest") {
    refuse("invalid-request", "request must contain exactly type, run, stages, and events");
  }
  if (!RUN.test(request.run)) refuse("invalid-run", "run must be one canonical fabrication run identifier");
  if (!Array.isArray(request.stages) || request.stages.length === 0
      || request.stages.some((stage) => typeof stage !== "string" || stage === "")
      || new Set(request.stages).size !== request.stages.length) {
    refuse("invalid-stages", "stages must be one nonempty duplicate-free ordered sequence");
  }
  if (!Array.isArray(request.events) || request.events.length === 0) {
    refuse("events-absent", "at least one durable event is required");
  }
}

function validateTrajectory(request) {
  let previous = null;
  for (const [sequence, event] of request.events.entries()) {
    if (!event || Object.getPrototypeOf(event) !== Object.prototype) {
      refuse("invalid-event", `event ${sequence} is not a plain object`);
    }
    if (!NI.test(event.id ?? "") || event.id !== eventIdentity(event)) {
      refuse("event-identity-drift", `event ${sequence} does not carry its exact content identity`);
    }
    if (event.run !== request.run) refuse("foreign-run-event", `event ${sequence} belongs to a different run`);
    if (event.sequence !== sequence) refuse("event-sequence-gap", `event ${sequence} has the wrong sequence`);
    if (event.previous !== previous) refuse("event-predecessor-drift", `event ${sequence} has the wrong predecessor`);
    if (typeof event.at !== "string" || event.at === "" || typeof event.type !== "string" || event.type === "") {
      refuse("invalid-event", `event ${sequence} lacks its observation time or type`);
    }
    if (event.stage !== undefined && !request.stages.includes(event.stage)) {
      refuse("unknown-stage", `event ${sequence} names a stage outside the declared fabrication plan`);
    }
    previous = event.id;
  }
}

export function observeCapabilityCellFabricationRun(request) {
  validateRequest(request);
  validateTrajectory(request);
  const { events, stages } = request;
  const demand = events.find((event) => event.type === "demand-submitted")?.demand ?? null;
  const completedSet = new Set(events
    .filter((event) => event.type === "stage-completed")
    .map((event) => event.stage));
  const obstruction = [...events].reverse()
    .find((event) => event.type === "stage-obstructed" && !completedSet.has(event.stage)) ?? null;
  const result = [...events].reverse()
    .find((event) => event.type === "fabrication-completed")?.cell ?? null;
  const state = {
    id: request.run,
    status: result ? "completed" : obstruction ? "obstructed" : "ready",
    demand,
    completed: stages.filter((stage) => completedSet.has(stage)),
    currentStage: stages.find((stage) => !completedSet.has(stage)) ?? null,
    obstruction,
    hiredCells: [...new Set(events.flatMap((event) => event.hiredCells ?? []))],
    result,
    eventHead: events.at(-1).id,
    eventCount: events.length,
    events: structuredClone(events),
  };
  return Object.freeze({
    type: "CapabilityCellFabricationRunObservation",
    state: Object.freeze(state),
  });
}

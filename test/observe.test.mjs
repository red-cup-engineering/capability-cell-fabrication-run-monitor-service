import assert from "node:assert/strict";
import test from "node:test";
import { semanticId } from "@red-cup-engineering/relation-model-notation-runtime";
import { relationalWitnessJournalDocument } from "@red-cup-engineering/witness-journal-rdf-projection-service/client";
import {
  FabricationRunObservationRefusal,
  observeCapabilityCellFabricationRun,
} from "../src/observe.mjs";
import { canonicalEventIdentity } from "../src/event-identity.mjs";

const run = "11111111-1111-4111-8111-111111111111";
const stages = ["extract", "plan", "execute"];

function event(sequence, body, prior = []) {
  const eventBody = {
    run,
    sequence,
    at: `2026-07-25T00:00:0${sequence}.000Z`,
    previous: prior.at(-1)?.id ?? null,
    ...body,
  };
  return { id: canonicalEventIdentity(eventBody), ...eventBody };
}

function request(events) {
  return {
    type: "CapabilityCellFabricationRunObservationRequest",
    run,
    stages,
    events,
  };
}

test("event identity is the canonical relational RMN identity of its id-free body", () => {
  const body = {
    run,
    sequence: 0,
    at: "2026-07-25T00:00:00.000Z",
    previous: null,
    type: "demand-submitted",
    demand: { capability: "toast-bread" },
  };
  assert.equal(canonicalEventIdentity(body), semanticId(relationalWitnessJournalDocument(body)));
});

test("folds one causally exact trajectory into current monitoring state", () => {
  const events = [];
  events.push(event(0, { type: "demand-submitted", demand: { capability: "toast-bread" } }, events));
  events.push(event(1, { type: "stage-completed", stage: "extract", hiredCells: ["extractor"] }, events));
  events.push(event(2, { type: "stage-obstructed", stage: "plan", obstruction: "planner unavailable" }, events));
  const observed = observeCapabilityCellFabricationRun(request(events));
  assert.equal(observed.state.status, "obstructed");
  assert.equal(observed.state.currentStage, "plan");
  assert.equal(observed.state.obstruction.obstruction, "planner unavailable");
  assert.deepEqual(observed.state.hiredCells, ["extractor"]);
  assert.equal(observed.state.eventCount, 3);
  assert.equal(observed.state.eventHead, events[2].id);
});

test("a completed retry monotonically supersedes the prior obstruction", () => {
  const events = [];
  events.push(event(0, { type: "demand-submitted", demand: { capability: "toast-bread" } }, events));
  events.push(event(1, { type: "stage-completed", stage: "extract" }, events));
  events.push(event(2, { type: "stage-obstructed", stage: "plan", obstruction: "planner unavailable" }, events));
  events.push(event(3, { type: "stage-completed", stage: "plan", hiredCells: ["planner"] }, events));
  const observed = observeCapabilityCellFabricationRun(request(events));
  assert.equal(observed.state.status, "ready");
  assert.equal(observed.state.currentStage, "execute");
  assert.equal(observed.state.obstruction, null);
});

test("a started causal transition is working rather than resumable", () => {
  const events = [];
  events.push(event(0, { type: "demand-submitted", demand: { capability: "toast-bread" } }, events));
  events.push(event(1, { type: "stage-started", stage: "extract", activation: { parentEventHead: events[0].id } }, events));
  const observed = observeCapabilityCellFabricationRun(request(events));
  assert.equal(observed.state.status, "working");
  assert.equal(observed.state.eventHead, events[1].id);
});

test("canonical identities admit new append-only event variants without a type whitelist", () => {
  const events = [];
  events.push(event(0, { type: "demand-submitted", demand: { capability: "toast-bread" } }, events));
  events.push(event(1, {
    type: "customer-invocation-recovered",
    stage: "execute",
    resultUrl: "https://customer.example/results/1",
    evidence: { settlement: "0x1234" },
    hiredCells: ["recovery-provider"],
  }, events));
  const observed = observeCapabilityCellFabricationRun(request(events));
  assert.equal(observed.state.eventCount, 2);
  assert.equal(observed.state.eventHead, events[1].id);
  assert.deepEqual(observed.state.hiredCells, ["recovery-provider"]);
});

test("refuses a trajectory whose bytes no longer match its event identity", () => {
  const events = [event(0, { type: "demand-submitted", demand: { capability: "toast-bread" } })];
  events[0].demand.capability = "silently-changed";
  assert.throws(
    () => observeCapabilityCellFabricationRun(request(events)),
    (error) => error instanceof FabricationRunObservationRefusal
      && error.code === "event-identity-drift",
  );
});

test("a fabrication-completed claim cannot bypass unfinished stages", () => {
  const events = [];
  events.push(event(0, { type: "demand-submitted", demand: { capability: "toast-bread" } }, events));
  events.push(event(1, { type: "fabrication-completed", cell: { id: "urn:cell:premature" } }, events));
  assert.throws(
    () => observeCapabilityCellFabricationRun(request(events)),
    (error) => error instanceof FabricationRunObservationRefusal
      && error.code === "premature-fabrication-completion",
  );
});

test("the original Monitor reports a genuinely completed ordered run and its last observation time", () => {
  const events = [];
  events.push(event(0, { type: "demand-submitted", demand: { capability: "toast-bread" } }, events));
  for (const stage of stages) {
    events.push(event(events.length, { type: "stage-completed", stage }, events));
  }
  events.push(event(events.length, { type: "fabrication-completed", cell: { id: "urn:cell:real" } }, events));
  const observation = observeCapabilityCellFabricationRun(request(events));
  assert.equal(observation.state.status, "completed");
  assert.deepEqual(observation.state.completed, stages);
  assert.equal(observation.state.currentStage, null);
  assert.equal(observation.state.result.id, "urn:cell:real");
  assert.equal(observation.state.lastEventAt, events.at(-1).at);
});

test("a duplicated or out-of-order stage completion does not create fake progress", () => {
  const events = [];
  events.push(event(0, { type: "demand-submitted" }, events));
  events.push(event(1, { type: "stage-completed", stage: "plan" }, events));
  assert.throws(
    () => observeCapabilityCellFabricationRun(request(events)),
    (error) => error instanceof FabricationRunObservationRefusal
      && error.code === "invalid-stage-completion",
  );
});

test("a malformed observation time or time regression cannot be used as fresh telemetry", () => {
  const events = [];
  events.push(event(0, { type: "demand-submitted" }, events));
  events.push(event(1, { type: "stage-started", stage: "extract", at: "yesterday" }, events));
  assert.throws(
    () => observeCapabilityCellFabricationRun(request(events)),
    (error) => error instanceof FabricationRunObservationRefusal
      && error.code === "invalid-event-time",
  );
  events[1] = event(1, { type: "stage-started", stage: "extract", at: "2026-07-24T00:00:00.000Z" }, events.slice(0,1));
  assert.throws(
    () => observeCapabilityCellFabricationRun(request(events)),
    (error) => error instanceof FabricationRunObservationRefusal
      && error.code === "event-time-regression",
  );
});

test("stage transitions after completion refuse instead of contradicting completed state", () => {
  const events = [];
  events.push(event(0, { type: "demand-submitted" }, events));
  for (const stage of stages) events.push(event(events.length, { type: "stage-completed", stage }, events));
  events.push(event(events.length, { type: "fabrication-completed", cell: {} }, events));
  events.push(event(events.length, { type: "stage-obstructed", stage: "execute", obstruction: "late" }, events));
  assert.throws(
    () => observeCapabilityCellFabricationRun(request(events)),
    (error) => error instanceof FabricationRunObservationRefusal
      && error.code === "post-completion-stage-event",
  );
});

test("cannot reopen a completed stage with a later started, deferred, or obstructed event", () => {
  for (const type of ["stage-started", "stage-deferred", "stage-obstructed"]) {
    const events = [];
    events.push(event(0, { type: "demand-submitted" }, events));
    events.push(event(1, { type: "stage-completed", stage: "extract" }, events));
    events.push(event(2, { type, stage: "extract" }, events));
    assert.throws(
      () => observeCapabilityCellFabricationRun(request(events)),
      (error) => error instanceof FabricationRunObservationRefusal
        && error.code === "completed-stage-transition",
    );
  }
});

test("stage status cannot be emitted without naming the actual stage", () => {
  for (const type of ["stage-started", "stage-deferred", "stage-obstructed"]) {
    const events = [];
    events.push(event(0, { type: "demand-submitted" }, events));
    events.push(event(1, { type }, events));
    assert.throws(
      () => observeCapabilityCellFabricationRun(request(events)),
      (error) => error instanceof FabricationRunObservationRefusal
        && error.code === "missing-stage",
    );
  }
});

test("RFC 3339 calendar validity refuses normalized impossible observation dates", () => {
  const events = [event(0, { type: "demand-submitted", at: "2026-02-30T00:00:00Z" })];
  assert.throws(
    () => observeCapabilityCellFabricationRun(request(events)),
    (error) => error instanceof FabricationRunObservationRefusal
      && error.code === "invalid-event-time",
  );
  const leapDay = [event(0, { type: "demand-submitted", at: "2024-02-29T23:59:59Z" })];
  assert.equal(observeCapabilityCellFabricationRun(request(leapDay)).state.lastEventAt, leapDay[0].at);
});

test("sub-millisecond timestamp regression cannot be misreported as monotone", () => {
  const events = [];
  events.push(event(0, { type: "demand-submitted", at: "2026-07-25T00:00:00.000900Z" }, events));
  events.push(event(1, { type: "customer-invocation-recovered",
    at: "2026-07-25T00:00:00.000100Z" }, events));
  assert.throws(
    () => observeCapabilityCellFabricationRun(request(events)),
    (error) => error instanceof FabricationRunObservationRefusal
      && error.code === "event-time-regression",
  );
});

test("equal and increasing instants retain precision across valid RFC 3339 offsets", () => {
  const events = [];
  events.push(event(0, { type: "demand-submitted", at: "2026-07-25T01:00:00.000100+01:00" }, events));
  events.push(event(1, { type: "customer-invocation-recovered",
    at: "2026-07-25T00:00:00.0001000Z" }, events));
  events.push(event(2, { type: "customer-invocation-recovered",
    at: "2026-07-25T00:00:00.000101Z" }, events));
  const observed = observeCapabilityCellFabricationRun(request(events));
  assert.equal(observed.state.eventCount, 3);
  assert.equal(observed.state.lastEventAt, events.at(-1).at);
});

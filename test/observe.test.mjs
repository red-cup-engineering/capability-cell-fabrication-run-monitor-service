import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  FabricationRunObservationRefusal,
  observeCapabilityCellFabricationRun,
} from "../src/observe.mjs";

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
  return {
    id: `ni:///sha-256;${createHash("sha256").update(JSON.stringify(eventBody)).digest("base64url")}`,
    ...eventBody,
  };
}

function request(events) {
  return {
    type: "CapabilityCellFabricationRunObservationRequest",
    run,
    stages,
    events,
  };
}

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

test("refuses a trajectory whose bytes no longer match its event identity", () => {
  const events = [event(0, { type: "demand-submitted", demand: { capability: "toast-bread" } })];
  events[0].demand.capability = "silently-changed";
  assert.throws(
    () => observeCapabilityCellFabricationRun(request(events)),
    (error) => error instanceof FabricationRunObservationRefusal
      && error.code === "event-identity-drift",
  );
});

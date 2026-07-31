import assert from "node:assert/strict";
import test from "node:test";
import { semanticId } from "@red-cup-engineering/rmn-semantic-conformance";
import { relationalRwilDocument } from "@lenticule-science/witness-journal-rdf-projection-service/client";
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
  assert.equal(canonicalEventIdentity(body), semanticId(relationalRwilDocument(body)));
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

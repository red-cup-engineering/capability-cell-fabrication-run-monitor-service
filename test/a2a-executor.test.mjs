import assert from "node:assert/strict";
import test from "node:test";
import { Message, Role } from "@a2a-js/sdk";
import {
  extractRmnPart,
  userRmnMessage,
} from "@red-cup-engineering/a2a-rmn-part-service";
import {
  decodeSemantic,
  semanticBytes,
} from "@red-cup-engineering/relation-model-notation-runtime";
import { executeA2aMessage } from "../src/a2a-executor.mjs";
import { canonicalEventIdentity } from "../src/event-identity.mjs";

test("the A2A face invokes the same Monitor executable through exact RMN bytes", async () => {
  const run = "11111111-1111-4111-8111-111111111111";
  const body = {
    run,
    sequence: 0,
    at: "2026-07-25T00:00:00.000Z",
    previous: null,
    type: "demand-submitted",
    demand: { capability: "toast-bread" },
  };
  const request = {
    type: "CapabilityCellFabricationRunObservationRequest",
    run,
    stages: ["extract", "plan", "execute"],
    events: [{
      id: canonicalEventIdentity(body),
      ...body,
    }],
  };
  const response = Message.fromJSON(await executeA2aMessage(
    userRmnMessage(semanticBytes(request)),
  ));
  assert.equal(response.role, Role.ROLE_AGENT);
  const result = decodeSemantic(extractRmnPart(response.parts).bytes);
  assert.equal(result.type, "CapabilityCellFabricationRunObservation");
  assert.equal(result.state.id, run);
  assert.equal(result.state.currentStage, "extract");
  assert.equal(result.state.eventCount, 1);
});

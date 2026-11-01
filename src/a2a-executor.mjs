import { Message, Role } from "@a2a-js/sdk";
import { extractRmnPart, rmnPart } from "@red-cup-engineering/a2a-rmn-part-service";
import {
  decodeSemantic,
  semanticBytes,
  semanticId,
} from "@red-cup-engineering/relation-model-notation-runtime";
import { FabricationRunObservationRefusal, observeCapabilityCellFabricationRun } from "./observe.mjs";

export const ACTOR = "urn:ame:capability-cell-fabrication-run-monitor-service";

export async function executeA2aMessage(inboundPayload, options = {}) {
  const inboundMessage = Message.fromJSON(inboundPayload);
  if (inboundMessage.role !== Role.ROLE_USER) {
    throw new Error("fabrication-run Monitor requires an A2A user Message");
  }
  const encodedRequest = extractRmnPart(inboundMessage.parts);
  const observationRequest = decodeSemantic(encodedRequest.bytes);
  let observationResult;
  try {
    observationResult = await (options.observe ?? observeCapabilityCellFabricationRun)(observationRequest);
  } catch (error) {
    if (!(error instanceof FabricationRunObservationRefusal)) throw error;
    // A bad observation is a real, typed monitoring result. Preserve it in
    // the original A2A/RMN reply rather than dropping it at a transport throw.
    observationResult = error.toJSON();
  }
  const encodedResult = semanticBytes(observationResult);
  return Message.toJSON({
    messageId: "",
    contextId: inboundMessage.contextId ?? "",
    taskId: inboundMessage.taskId ?? "",
    role: Role.ROLE_AGENT,
    parts: [rmnPart(encodedResult, "fabrication-run-observation.rmn.cbor")],
    metadata: {
      provider: ACTOR,
      inputNi: encodedRequest.ni,
      outputNi: semanticId(observationResult),
    },
    extensions: [],
    referenceTaskIds: [],
  });
}

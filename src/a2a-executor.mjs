import { Message, Role } from "@a2a-js/sdk";
import { extractRmnPart, rmnPart } from "@emsenn/a2a-rmn-part-service";
import {
  decodeSemantic,
  semanticBytes,
  semanticId,
} from "@emsenn/rmn-semantic-conformance";
import { observeCapabilityCellFabricationRun } from "./observe.mjs";

export const ACTOR = "urn:ame:capability-cell-fabrication-run-monitor-service";

export async function executeA2aMessage(source, options = {}) {
  const message = Message.fromJSON(source);
  if (message.role !== Role.ROLE_USER) {
    throw new Error("fabrication-run Monitor requires an A2A user Message");
  }
  const input = extractRmnPart(message.parts);
  const request = decodeSemantic(input.bytes);
  const result = (options.observe ?? observeCapabilityCellFabricationRun)(request);
  const outputBytes = semanticBytes(result);
  return Message.toJSON({
    messageId: "",
    contextId: message.contextId ?? "",
    taskId: message.taskId ?? "",
    role: Role.ROLE_AGENT,
    parts: [rmnPart(outputBytes, "fabrication-run-observation.rmn.cbor")],
    metadata: {
      provider: ACTOR,
      inputNi: input.ni,
      outputNi: semanticId(result),
    },
    extensions: [],
    referenceTaskIds: [],
  });
}

import { semanticBytes, semanticId } from "@red-cup-engineering/rmn-semantic-conformance";
import { relationalRwilDocument } from "@lenticule-science/rwil-rdf-projection-service/client";

export function canonicalEventCarrier(value) {
  const { id: _id, ...body } = value;
  return semanticBytes(relationalRwilDocument(body));
}

export function canonicalEventIdentity(event) {
  const { id: _id, ...body } = event;
  return semanticId(relationalRwilDocument(body));
}

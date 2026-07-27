import { semanticBytes, semanticId } from "@emsenn/rmn-semantic-conformance";
import { relationalRwilDocument } from "@emsenn/rwil-rdf-services/client";

export function canonicalEventCarrier(value) {
  const { id: _id, ...body } = value;
  return semanticBytes(relationalRwilDocument(body));
}

export function canonicalEventIdentity(event) {
  const { id: _id, ...body } = event;
  return semanticId(relationalRwilDocument(body));
}

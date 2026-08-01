import { semanticBytes, semanticId } from "@red-cup-engineering/rmn-semantic-conformance";
import { relationalWitnessJournalDocument } from "@lenticule-science/witness-journal-rdf-projection-service/client";

export function canonicalEventCarrier(value) {
  const { id: _id, ...body } = value;
  return semanticBytes(relationalWitnessJournalDocument(body));
}

export function canonicalEventIdentity(event) {
  const { id: _id, ...body } = event;
  return semanticId(relationalWitnessJournalDocument(body));
}

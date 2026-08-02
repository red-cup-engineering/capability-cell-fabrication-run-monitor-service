import { semanticBytes, semanticId } from "@red-cup-engineering/relation-model-notation-runtime";
import { relationalWitnessJournalDocument } from "@red-cup-engineering/witness-journal-rdf-projection-service/client";

export function canonicalEventCarrier(value) {
  const { id: _id, ...body } = value;
  return semanticBytes(relationalWitnessJournalDocument(body));
}

export function canonicalEventIdentity(event) {
  const { id: _id, ...body } = event;
  return semanticId(relationalWitnessJournalDocument(body));
}

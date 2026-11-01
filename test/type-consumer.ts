import type { FabricationRunObservationRequest, FabricationRunObservation } from "../types/index.d.mts";
import type { CloudEvent } from "../types/cloud-events.d.mts";
import type { PaidObservationLedger, PaidObservationHttpResponse } from "../types/paid-ledger.d.mts";

declare const request: FabricationRunObservationRequest;
declare const observation: FabricationRunObservation;
declare const ledger: PaidObservationLedger;
const runId: string = request.run;
const eventTime: string = observation.state.lastEventAt;
const event: CloudEvent<FabricationRunObservation> = {specversion:"1.0",id:"a",source:"urn:example:b",type:"event",subject:runId,time:eventTime,datacontenttype:"application/json",data:observation};
const result: PaidObservationHttpResponse = ledger.getReceiptResponse("payment");
void [event,result];
// @ts-expect-error an observation cannot claim an arbitrary status
const badStatus: FabricationRunObservation["state"]["status"] = "installed";
// @ts-expect-error a CloudEvents version cannot silently drift
const badVersion: CloudEvent<FabricationRunObservation>["specversion"] = "2.0";
void [badStatus,badVersion];

import type { appendJournalEntry, recoverJournalState } from "../types/paid-journal.d.mts";
declare const append: typeof appendJournalEntry;
declare const recover: typeof recoverJournalState;
void [append,recover];

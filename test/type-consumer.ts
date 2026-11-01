import type { FabricationRunObservationRequest, FabricationRunObservation } from "@red-cup-engineering/capability-cell-fabrication-run-monitor-service";
import type { CloudEvent } from "@red-cup-engineering/capability-cell-fabrication-run-monitor-service/cloud-events";
import type { PaidObservationLedger, PaidObservationHttpResponse } from "@red-cup-engineering/capability-cell-fabrication-run-monitor-service/paid-observation-ledger";

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

import type { appendJournalEntry, recoverJournalState } from "@red-cup-engineering/capability-cell-fabrication-run-monitor-service/paid-observation-journal";
declare const append: typeof appendJournalEntry;
declare const recover: typeof recoverJournalState;
void [append,recover];

import type { executeA2aMessage } from "@red-cup-engineering/capability-cell-fabrication-run-monitor-service/a2a-executor";
import type { canonicalEventIdentity, canonicalEventCarrier } from "@red-cup-engineering/capability-cell-fabrication-run-monitor-service/event-identity";
declare const execute: typeof executeA2aMessage;
declare const identify: typeof canonicalEventIdentity;
declare const encodeEvent: typeof canonicalEventCarrier;
void [execute,identify,encodeEvent];

import assert from "node:assert/strict";
import test from "node:test";
import { toObservationCloudEvent, CLOUD_EVENT_MEDIA_TYPE } from "../src/cloud-events.mjs";
import { representPaidObservationResponse, acceptsCloudEventJson } from "../src/http-representations.mjs";

const head = `ni:///sha-256;${"A".repeat(43)}`;
const reading = () => ({type:"CapabilityCellFabricationRunObservation",state:{
  id:"11111111-1111-4111-8111-111111111111",status:"completed",
  demand:{id:"d"},completed:["fabricate"],currentStage:null,obstruction:null,
  hiredCells:[],result:{id:"c"},eventHead:head,lastEventAt:"2026-10-31T21:00:00.123Z",
  eventCount:1,events:[{id:head,at:"2026-10-31T21:00:00.123Z",type:"fabrication-completed"}]}});

test("CloudEvents 1.0 retains the entire original NI-addressed observation as JSON data",()=>{
  const source=reading(),cloudEvent=toObservationCloudEvent(source);
  assert.equal(cloudEvent.specversion,"1.0");
  assert.equal(cloudEvent.datacontenttype,"application/json");
  assert.equal(cloudEvent.time,source.state.lastEventAt);
  assert.equal(cloudEvent.subject,source.state.id);
  assert.deepEqual(cloudEvent.data,source);
  assert.equal(cloudEvent.id,toObservationCloudEvent(source).id);
  cloudEvent.data.state.result.id="changed";
  assert.equal(source.state.result.id,"c");
});

test("invalid or mismatched source time, head and URI refuse before projection",()=>{
  const bad=reading();bad.state.events[0].at="yesterday";
  assert.throws(()=>toObservationCloudEvent(bad),TypeError);
  assert.throws(()=>toObservationCloudEvent(reading(),{source:"invalid URI"}),TypeError);
  assert.throws(()=>toObservationCloudEvent({type:"CapabilityCellFabricationRunObservationRefusal"}),TypeError);
});

test("HTTP media negotiation is explicit and never silently wraps old responses",()=>{
  assert.equal(acceptsCloudEventJson("*/*"),false);
  assert.equal(acceptsCloudEventJson("application/cloudevents+json;q=0"),false);
  assert.equal(acceptsCloudEventJson("application/cloudevents+json;q=bogus"),false);
  assert.equal(acceptsCloudEventJson("application/cloudevents+json;q=1.2"),false);
  assert.equal(acceptsCloudEventJson("application/cloudevents+json;q=0.1234"),false);
  assert.equal(acceptsCloudEventJson("application/cloudevents+json;q=0.125"),true);
  const normal={status:200,body:{terminal:{type:"X402PaidFabricationRunObservationReceipt",result:reading()}}};
  assert.equal(representPaidObservationResponse(normal,"*/*").contentType,"application/json");
  const result=representPaidObservationResponse(normal,CLOUD_EVENT_MEDIA_TYPE);
  assert.equal(result.contentType,CLOUD_EVENT_MEDIA_TYPE);
  assert.equal(result.body.data.state.eventHead,head);
  assert.equal(representPaidObservationResponse({status:404,body:{}},CLOUD_EVENT_MEDIA_TYPE).status,404);
});

test("one captured source snapshot prevents changed caller getters from altering event metadata",()=>{
  const input=reading();let reads=0;
  Object.defineProperty(input.state,"lastEventAt",{
    enumerable:true, get(){ reads++; return reads===1? "2026-10-31T21:00:00.123Z":"2026-10-31T22:00:00Z"; },
  });
  const projected=toObservationCloudEvent(input);
  assert.equal(reads,1);
  assert.equal(projected.time,projected.data.state.lastEventAt);
  assert.equal(projected.time,"2026-10-31T21:00:00.123Z");
});

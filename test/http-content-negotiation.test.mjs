import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import test from "node:test";
import { representPaidObservationResponse } from "../src/http-representations.mjs";

const eventHead = `ni:///sha-256;${"A".repeat(43)}`;
const observation={type:"CapabilityCellFabricationRunObservation",state:{
  id:"11111111-1111-4111-8111-111111111111",lastEventAt:"2026-10-31T23:00:00Z",
  eventHead,eventCount:1,events:[{id:eventHead,at:"2026-10-31T23:00:00Z"}],
  status:"completed",demand:null,completed:[],currentStage:null,obstruction:null,hiredCells:[],result:{id:"c"},
}};

test("real HTTP representation negotiation preserves default JSON and serves opt-in CloudEvents", async()=>{
  const legacy={status:200,body:{ok:true,status:"terminal",terminal:{type:"X402PaidFabricationRunObservationReceipt",result:observation}}};
  const server=createServer((request,response)=>{
    const value=representPaidObservationResponse(legacy,request.headers.accept);
    response.statusCode=value.status;
    response.setHeader("Content-Type",value.contentType);
    response.end(JSON.stringify(value.body));
  });
  server.listen(0,"127.0.0.1");
  await once(server,"listening");
  try {
    const address=server.address();const url=`http://127.0.0.1:${address.port}/result`;
    const normal=await fetch(url);
    assert.equal(normal.status,200);
    assert.match(normal.headers.get("content-type"),/^application\/json/u);
    assert.equal((await normal.json()).terminal.type,"X402PaidFabricationRunObservationReceipt");
    const event=await fetch(url,{headers:{Accept:"application/cloudevents+json"}});
    assert.equal(event.status,200);
    assert.match(event.headers.get("content-type"),/^application\/cloudevents\+json/u);
    const body=await event.json();assert.equal(body.specversion,"1.0");
    assert.equal(body.data.state.eventHead,eventHead);
    const refused=await fetch(url,{headers:{Accept:"application/cloudevents+json;q=0"}});
    assert.match(refused.headers.get("content-type"),/^application\/json/u);
  } finally {server.close();await once(server,"close");}
});

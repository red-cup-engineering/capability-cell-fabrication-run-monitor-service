import assert from 'node:assert/strict';
import test from 'node:test';
import {createPaidObservationLedger} from '../src/paid-observation-ledger.mjs';
const INV = 'ni:///sha-256;' + 'A'.repeat(43);
function fixture({observe}={}) {
 const records=[], intents=new Map(), terminals=new Map();
 const pricing={currency:'USD',measure:{units:1}};
 const ledger=createPaidObservationLedger({intents,terminals,pricing,
   append:async record=>records.push(structuredClone(record)),
   observe: observe??(async request=>({type:'CapabilityCellFabricationRunObservation',state:{status:'completed',request}})),
   projectRefusal:e=>({type:'CapabilityCellFabricationRunObservationRefusal',code:e.message})});
 return {ledger,records,intents,terminals,pricing};
}
test('caller mutation of a returned retained intent cannot rewrite original signed request',async()=>{
 const f=fixture(), q={run:'original'};
 const ret=await f.ledger.retain(INV,q);
 ret.request.run='injected';q.run='changed';
 assert.equal(f.intents.get(INV).request.run,'original');
 assert.equal((await f.ledger.retain(INV,{run:'original'})).request.run,'original');
});
test('after durable terminal the source evidence, quoted pricing and reply are detached',async()=>{
 const f=fixture(), e={invocation:INV,tx:{id:'tx-one'}};
 await f.ledger.retain(INV,{run:'r'});
 const terminal=await f.ledger.settle(e);
 e.tx.id='rewritten';f.pricing.measure.units=999;
 terminal.settlement.tx.id='also-rewritten';
 const original=f.ledger.read(INV).body.terminal;
 assert.equal(original.settlement.tx.id,'tx-one');
 assert.equal(original.pricing.measure.units,1);
 assert.deepEqual(original,f.records[1]);
});
test('read and replay consumers cannot mutate the signed durable result',async()=>{
 const f=fixture();await f.ledger.retain(INV,{run:'r'});
 await f.ledger.settle({invocation:INV,tx:{id:'tx'}});
 f.ledger.read(INV).body.terminal.result.state.status='forged';
 (await f.ledger.settle({invocation:INV,tx:{id:'tx'}})).result.state.status='forged-again';
 assert.equal(f.ledger.read(INV).body.terminal.result.state.status,'completed');
 assert.equal(f.records[1].result.state.status,'completed');
});
test('observation callback cannot mutate an already retained intent',async()=>{
 const f=fixture({observe:async request=>{request.run='mutated-by-observer';return {type:'CapabilityCellFabricationRunObservation',state:{status:'completed'}}}});
 await f.ledger.retain(INV,{run:'original'});await f.ledger.settle({invocation:INV});
 assert.equal(f.intents.get(INV).request.run,'original');
 await f.ledger.retain(INV,{run:'original'});
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeOperationEvents} from '../dashboard/web/src/events.ts';
const event=(env,n)=>({environment:env,sequence:n,id:env+':'+n,
 timestamp:'2026-10-27T10:00:00Z',message:'actual preserved event',stage:'system',status:'info'});
test('Stage173 stream merges realtime/replay without duplicates, regressions or environment leakage',()=>{
 const e=mergeOperationEvents('sandbox',[event('sandbox',3),event('testnet',1)],
  [event('sandbox',1),event('sandbox',3),event('sandbox',2)],3);
 assert.deepEqual(e.map(x=>x.sequence),[1,2,3]);
 assert.ok(e.every(x=>x.environment==='sandbox'));
 const newer=mergeOperationEvents('sandbox',e,[event('sandbox',4)],3);
 assert.deepEqual(newer.map(x=>x.sequence),[2,3,4]);
 assert.equal(newer[2].message,'actual preserved event');
});
test('Stage173 bounds memory and rejects invalid event window',()=>{
 assert.deepEqual(mergeOperationEvents('testnet',[],[event('sandbox',1)]),[]);
 assert.throws(()=>mergeOperationEvents('sandbox',[],[],1001),/INVALID_EVENT_WINDOW/);
});

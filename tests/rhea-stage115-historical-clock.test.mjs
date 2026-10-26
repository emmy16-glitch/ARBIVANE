import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sourceClock,readSourceClock,attestReplayClock,initHistoricalSandbox} from '../scripts/stage115-historical-sandbox-clock.mjs';
const header={height:221436207,hash:'ENypY514thT4bf1MXBay7hi66AgpzFEdYnDNFrZE2iL8',
 timestamp_nanosec:'1792872381780605817'};
test('historical clock is anchored to the exact pinned block, rounded forward only',()=>{
 const c=sourceClock(header,header.height);
 assert.equal(c.startIso,'2026-10-24T20:06:22.000Z');
 assert.equal(c.sourceTimestampNanosec,header.timestamp_nanosec);
 assert.throws(()=>sourceClock(header,header.height+1),/INVALID_PINNED/);
 assert.throws(()=>sourceClock({...header,timestamp_nanosec:1792872381780605817},header.height),/INVALID_PINNED/);
});
test('runner wall time and a backwards replay clock are both rejected',()=>{
 const c=sourceClock(header,header.height);
 assert.equal(attestReplayClock(c,{timestamp_nanosec:'1792872382000000000'}).clockRate,1);
 for(const stamp of ['1792872381000000000','1793045181780605817'])
  assert.throws(()=>attestReplayClock(c,{timestamp_nanosec:stamp}),/OUTSIDE_HISTORICAL/);
});
test('clock read requests the pinned block and fails closed on RPC drift',async()=>{
 const c=await readSourceClock('https://example.org',header.height,async(url,options)=>{
  assert.equal(JSON.parse(options.body).params.block_id,header.height);
  return {ok:true,json:async()=>({result:{header}})};
 });
 assert.equal(c.sourceBlockHash,header.hash);
 await assert.rejects(()=>readSourceClock('https://example.org',header.height,
  async()=>({ok:true,json:async()=>({result:{header:{...header,height:1}}})})),/INVALID_PINNED/);
 await assert.rejects(()=>initHistoricalSandbox({},c,{}),/SANDBOX_ONLY/);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
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
test('failed SDK initialization closes the native server and restores the scoped startup hook',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'stage117-test-'));
 const library=join(dir,'library.so');
 await writeFile(library,'test fixture');
 await writeFile(join(dir,'genesis.json'),JSON.stringify({genesis_time:'old',records:['unaltered']}));
 let closed=0;
 class Server {
  static binPath='/test/near-sandbox';
  static async init(){return {homeDir:dir,close:async()=>{closed++;},start:async()=>{}};}
 }
 const original=Server.init, priorPreload=process.env.LD_PRELOAD;
 const Worker={init:async()=>{
  const server=await Server.init({});await server.start();
  const genesis=JSON.parse(await readFile(join(dir,'genesis.json'),'utf8'));
  assert.deepEqual(genesis.records,['unaltered']);
  assert.equal(genesis.genesis_time,'2026-10-24T20:06:22.000Z');
  throw Error('SDK_STARTUP_FAILED');
 }};
 try {
  await assert.rejects(()=>initHistoricalSandbox({Server,SandboxServer:Server,Worker},
   sourceClock(header,header.height),{NEAR_WORKSPACES_NETWORK:'sandbox',EXECUTION_ENABLED:'false',
    STAGE37_ALLOW_SANDBOX_MUTATION:'true',STAGE118_CLOCK_LIBRARY:library}),/SDK_STARTUP_FAILED/);
  assert.equal(closed,1);assert.equal(Server.init,original);
  assert.equal(Server.binPath,'/test/near-sandbox');
  assert.equal(process.env.LD_PRELOAD,priorPreload);
 } finally {await rm(dir,{recursive:true,force:true});}
});

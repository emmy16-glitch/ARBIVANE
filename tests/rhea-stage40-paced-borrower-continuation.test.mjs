import test from 'node:test';
import assert from 'node:assert/strict';
import {PacedNearReadOnlyRpc} from '../src/rhea/paced-readonly-rpc.ts';

test('Stage40 globally spaces concurrent RPC reads instead of a burst',async()=>{
 const waits=[],called=[];
 const underlying={
  async viewAccount(id,block){called.push(['account',id,block]);return {blockHeight:'2',codeHash:'2'.repeat(43)};},
  async view(id,method,args,block){called.push(['view',id,method,block]);return {blockHeight:'2',value:{valid:true}};},
 };
 const rpc=new PacedNearReadOnlyRpc(underlying,500,async n=>{waits.push(n);});
 await Promise.all([
  rpc.viewAccount('contract.main.burrow.near'),
  rpc.view('contract.main.burrow.near','get_config',{},2),
  rpc.view('aggregate-oracle.near','get_price_no_older_than',{age:60},2),
  rpc.viewAccount('aggregate-oracle.near',2),
 ]);
 assert.equal(called.length,4);
 assert.equal(rpc.getStats().scheduledRequests,4);
 assert.equal(rpc.getStats().minimumRequestGapMs,500);
 assert.equal(waits.length,3);
 assert.ok(waits[0]>=450&&waits[1]>=950&&waits[2]>=1450);
});
test('Stage40 refuses bad throttle setting before making a request',()=>{
 const rpc={async view(){throw Error('called');},async viewAccount(){throw Error('called');}};
 for(const gap of [-1,0,99,5001,NaN,1.5]){
  assert.throws(()=>new PacedNearReadOnlyRpc(rpc,gap),/INVALID_STAGE40_RPC_RATE_LIMIT/);
 }
});
test('Stage40 workflow advances contiguous debt windows and keeps mainnet execution disabled',async()=>{
 const {readFile}=await import('node:fs/promises');
 const w=await readFile(new URL('../.github/workflows/rhea-stage40-paced-borrower-continuation.yml',import.meta.url),'utf8');
 assert.ok(w.includes("default: '652'"));
 assert.ok(w.includes("RHEA_RPC_SPACING_MS: '700'"));
 assert.ok(w.includes("RHEA_STAGE32_CONCURRENCY: '2'"));
 assert.ok(w.includes("EXECUTION_ENABLED: 'false'"));
 assert.ok(w.includes("max-parallel: 2"));
 assert.ok(w.includes("rhea-full-paged-verified-market"));
 assert.ok(!w.includes("NEAR_PRIVATE_KEY"));
 assert.ok(!w.includes("broadcast_tx"));
});

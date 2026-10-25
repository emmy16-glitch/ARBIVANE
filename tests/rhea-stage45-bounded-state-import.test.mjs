import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {StateResponseTooLarge,coverPinnedContractState} from '../scripts/stage45-prefix-state.mjs';
import {ArchivalStateRpc} from '../scripts/stage45-archival-state-rpc.mjs';

const HEIGHT=221433162,HASH='7'.repeat(43);
const row=(key,val)=>({key:Buffer.from(key).toString('base64'),value:Buffer.from(val).toString('base64')});
const data=[row([0,1],[4]),row([0,2],[5,6]),row([1,0],[7]),row([255,10],[8])];
const opts={blockHeight:HEIGHT,maxQueries:700,maxRecords:20,maxBytes:102400,maxDepth:4,maxLeafRecords:10};
function reader(rows,{limit=100,blockHeight=HEIGHT,blockHash=HASH,mutate}={}){
 return async prefix=>{
  let selected=rows.filter(r=>Buffer.from(r.key,'base64').subarray(0,prefix.length).equals(prefix));
  if(selected.length>limit)throw new StateResponseTooLarge();
  if(mutate)selected=mutate(selected,prefix);
  return {blockHeight:String(blockHeight),blockHash,values:selected};
 };
}
test('Stage45 splits oversized response into 256 disjoint branches, but NOT full-keyspace parity',async()=>{
 const saved=[];
 const r=await coverPinnedContractState(reader(data,{limit:2}),opts,x=>saved.push(...x));
 assert.equal(r.records,4);assert.equal(r.queryCount,257);
 assert.equal(r.subdividedPrefixes,1);assert.equal(r.leafPrefixes,256);
 assert.equal(r.rawKeyAndValueBytes,13);
 assert.equal(r.completePrefixCoverage,false);
 assert.equal(r.unresolvedExactBoundaryPrefixCount,1);
 assert.equal(r.status,'PARTITIONED_PREFIX_READ_BOUNDARY_KEYS_UNPROVEN');
 assert.equal(new Set(saved.map(x=>x.key)).size,4);
 assert.match(r.recordStreamSha256,/^[0-9a-f]{64}$/);
});
test('Stage45 descends again into hot prefix without double-counting keys',async()=>{
 const busy=[row([97,0],[9]),row([97,1],[8]),row([97,2],[7]),row([98,1],[6])];
 const r=await coverPinnedContractState(reader(busy,{limit:1}),opts,()=>{});
 assert.equal(r.records,4);assert.equal(r.subdividedPrefixes,2);
 assert.equal(r.leafPrefixes,511);assert.equal(r.queryCount,513);
 assert.equal(r.unresolvedExactBoundaryPrefixCount,2);
});
test('Stage45 recognizes full root response without boundary omission',async()=>{
 const r=await coverPinnedContractState(reader(data),opts,()=>{});
 assert.equal(r.status,'ROOT_STATE_RESPONSE_COMPLETE');
 assert.equal(r.completePrefixCoverage,true);assert.equal(r.unresolvedExactBoundaryPrefixCount,0);
});
test('Stage45 refuses cross-block, contradictory block hashes and duplicate keys',async()=>{
 await assert.rejects(()=>coverPinnedContractState(reader(data,{blockHeight:HEIGHT+1}),opts,()=>{}),/STAGE45_CROSS_BLOCK/);
 await assert.rejects(()=>coverPinnedContractState(reader([data[0],data[0]]),opts,()=>{}),/STAGE45_DUPLICATE_STATE_KEY/);
 const alternate=async prefix=>{
  const r=await reader(data,{limit:2})(prefix);
  return {...r,blockHash:prefix.length&&prefix[0]>0?'8'.repeat(43):HASH};
 };
 await assert.rejects(()=>coverPinnedContractState(alternate,opts,()=>{}),/STAGE45_CROSS_BLOCK/);
});
test('Stage45 refuses unrelated prefix keys, malformed base64 and budget exhaustion',async()=>{
 const malicious=reader(data,{limit:2,mutate:(x,p)=>p.length?data:x});
 await assert.rejects(()=>coverPinnedContractState(malicious,opts,()=>{}),/STAGE45_PREFIX_MISMATCH/);
 await assert.rejects(()=>coverPinnedContractState(reader([{key:'not base64',value:'AA=='}]),opts,()=>{}),/STAGE45_BAD_BASE64/);
 await assert.rejects(()=>coverPinnedContractState(reader(data,{limit:2}),{...opts,maxQueries:10},()=>{}),/STAGE45_PREFIX_QUERY_BUDGET/);
 await assert.rejects(()=>coverPinnedContractState(async()=>{throw new StateResponseTooLarge();},{...opts,maxDepth:1},()=>{}),/STAGE45_PREFIX_STILL_OVERSIZE/);
 await assert.rejects(()=>coverPinnedContractState(reader(data),{...opts,maxRecords:2},()=>{}),/STAGE45_STORAGE_RECORD_BUDGET/);
 await assert.rejects(()=>coverPinnedContractState(reader([row([2],Buffer.alloc(2100,1))]),{...opts,maxBytes:1024},()=>{}),/STAGE45_STORAGE_BYTE_BUDGET/);
});
const rpcOptions={endpoint:'https://archival-rpc.mainnet.fastnear.com',accountId:'contract.main.burrow.near',blockHeight:HEIGHT,paceMs:0,maxRetries:1};
const response=(value,status=200,headers={})=>new Response(JSON.stringify(value),{status,headers});
const good=()=>({jsonrpc:'2.0',result:{block_height:HEIGHT,block_hash:HASH,values:[]}});
test('Stage45 archival transport uses only pinned read-only NEAR view_state',async()=>{
 let query;
 const rpc=new ArchivalStateRpc(rpcOptions,async(_url,req)=>{
  query=JSON.parse(req.body);return response(good());
 },async()=>{});
 const x=await rpc.viewState(Buffer.from('a'));
 assert.equal(query.method,'query');
 assert.equal(query.params.request_type,'view_state');
 assert.equal(query.params.account_id,'contract.main.burrow.near');
 assert.equal(query.params.prefix_base64,'YQ==');
 assert.equal(query.params.block_id,HEIGHT);assert.equal(x.blockHeight,String(HEIGHT));
});
test('Stage45 recognizes oversized HTTP/RPC response and retries 429 without claiming completeness',async()=>{
 const oversized=new ArchivalStateRpc(rpcOptions,async()=>
  response({error:{message:'Response size exceeds limit of 50 KiB'}},400),async()=>{});
 await assert.rejects(()=>oversized.viewState(Buffer.alloc(0)),StateResponseTooLarge);
 assert.equal(oversized.getStats().oversizeResponses,1);
 let count=0;
 const retry=new ArchivalStateRpc(rpcOptions,async()=>++count===1?
  response({error:'rate limit'},429,{'retry-after':'0'}):response(good()),async()=>{});
 await retry.viewState(Buffer.alloc(0));
 assert.equal(count,2);assert.equal(retry.getStats().rateLimitResponses,1);
});
test('Stage45 rejects arbitrary HTTP or malformed archival response',async()=>{
 for(const fetcher of [async()=>response({error:'access denied'},403),
  async()=>new Response('garbled',{status:200}),
  async()=>response({result:{block_height:HEIGHT,values:[]}})]){
  await assert.rejects(()=>new ArchivalStateRpc(rpcOptions,fetcher,async()=>{}).viewState(Buffer.alloc(0)),/STAGE45_/);
 }
 assert.throws(()=>new ArchivalStateRpc({...rpcOptions,endpoint:'http://bad.example.com'}),/STAGE45_INVALID/);
});
test('Stage45 actual-workflow safeguards prevent a false liquidation or mainnet signing claim',async()=>{
 const workflow=await readFile(new URL('../.github/workflows/rhea-stage45-bounded-state-import.yml',import.meta.url),'utf8');
 const runner=await readFile(new URL('../scripts/stage45-rhea-paged-sandbox-import.mjs',import.meta.url),'utf8');
 assert.ok(workflow.includes('near-workspaces@5.0.0'));
 assert.ok(workflow.includes("EXECUTION_ENABLED: 'false'"));
 assert.ok(workflow.includes('rhea-stage45-pinned-rhea-import'));
 assert.ok(runner.includes('withData:false'));
 assert.ok(runner.includes('lending.patchStateRecords('));
 assert.ok(runner.includes("configMatchesPinnedSource"));
 assert.ok(runner.includes('unresolvedExactBoundaryPrefixCount'));
 assert.ok(runner.includes("NEAR_WORKSPACES_NETWORK!=='sandbox'"));
 assert.ok(runner.includes('mayBroadcastMainnet:false'));
 assert.ok(!runner.includes('broadcast_tx'));
 assert.ok(!runner.includes('callRaw('));
});

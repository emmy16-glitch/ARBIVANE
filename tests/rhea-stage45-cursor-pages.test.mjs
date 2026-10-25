import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {coverPinnedPagedState} from '../scripts/stage45-cursor-pages.mjs';
import {StateResponseTooLarge} from '../scripts/stage45-prefix-state.mjs';
import {ArchivalStateRpc} from '../scripts/stage45-archival-state-rpc.mjs';
const HEIGHT=221433162,HASH='7'.repeat(43);
const row=(key,value='v')=>({
 key:Buffer.from(key).toString('base64'),value:Buffer.from(value).toString('base64'),
});
const DATA=[row(''),row('a'),row('aa'),row('b'),row('c'),row('zzz')];
const opts={blockHeight:HEIGHT,maxQueries:100,maxRecords:50,maxBytes:30000,pageSize:3};
function pages(max=3){return async(cursor,limit)=>{
 if(limit>max)throw new StateResponseTooLarge();
 const previous=cursor===null?null:Buffer.from(cursor,'base64');
 const available=DATA.filter(x=>previous===null||Buffer.compare(Buffer.from(x.key,'base64'),previous)>0);
 const values=available.slice(0,limit);
 return {blockHeight:String(HEIGHT),blockHash:HASH,values,
  lastKey:available.length>limit?values.at(-1).key:null};
};}
test('native pinned pages enumerate even empty and exact-prefix keys with no split-boundary gap',async()=>{
 const found=[];
 const r=await coverPinnedPagedState(pages(),opts,part=>found.push(...part));
 assert.deepEqual(found.map(x=>Buffer.from(x.key,'base64').toString()),['','a','aa','b','c','zzz']);
 assert.equal(r.records,6);assert.equal(r.completedPages,2);
 assert.equal(r.completePaginationCoverage,true);
 assert.equal(r.unresolvedExactBoundaryPrefixCount,0);
 assert.equal(r.status,'PROVIDER_PAGINATION_CURSOR_EXHAUSTED');
 assert.match(r.recordStreamSha256,/^[0-9a-f]{64}$/);
});
test('oversized paginated response halves limit without restarting from zero',async()=>{
 const r=await coverPinnedPagedState(pages(1),opts,()=>{});
 assert.equal(r.downsizedPages,1);
 assert.equal(r.finalPageSize,1);assert.equal(r.records,6);
 assert.equal(r.completedPages,6);
});
test('reject changed block, bad cursor, duplicate and out-of-order values',async()=>{
 const wrong=async()=>({blockHeight:String(HEIGHT+1),blockHash:HASH,values:[],lastKey:null});
 await assert.rejects(()=>coverPinnedPagedState(wrong,opts,()=>{}),/STAGE45_PAGED_CROSS_BLOCK/);
 const duplicate=async()=>({blockHeight:String(HEIGHT),blockHash:HASH,values:[row('a')],lastKey:row('a').key});
 await assert.rejects(()=>coverPinnedPagedState(duplicate,opts,()=>{}),/STAGE45_NONINCREASING_OR_DUPLICATE_STORAGE_KEY/);
 const badCursor=async()=>({blockHeight:String(HEIGHT),blockHash:HASH,values:[row('a')],lastKey:row('b').key});
 await assert.rejects(()=>coverPinnedPagedState(badCursor,opts,()=>{}),/STAGE45_CONTINUATION_DOES_NOT_MATCH_LAST_STORAGE_KEY/);
});
test('reject when even a single entry exceeds archival response limit',async()=>{
 await assert.rejects(()=>coverPinnedPagedState(async()=>{throw new StateResponseTooLarge();},opts,()=>{}),/STAGE45_INDIVIDUAL_STORAGE_ENTRY_EXCEEDS_RPC_LIMIT/);
});
test('transport sends native NEAR view_state limit and after_key_base64 with immutable block',async()=>{
 const calls=[];
 const rpc=new ArchivalStateRpc({
  endpoint:'https://archival-rpc.mainnet.fastnear.com',
  accountId:'contract.main.burrow.near',blockHeight:HEIGHT,paceMs:0,
  maxRetries:0,
 },async(_,request)=>{
  const b=JSON.parse(request.body);calls.push(b.params);
  return new Response(JSON.stringify({result:{
   block_height:HEIGHT,block_hash:HASH,values:[row('a')],last_key:'YQ==',
  }}),{status:200});
 },async()=>{});
 const first=await rpc.viewPage(null,5);
 const second=await rpc.viewPage('YQ==',5);
 assert.equal(first.lastKey,'YQ==');
 assert.equal(second.blockHeight,String(HEIGHT));
 assert.equal(calls[0].limit,5);assert.equal(calls[0].after_key_base64,undefined);
 assert.equal(calls[1].after_key_base64,'YQ==');
 assert.equal(calls[1].prefix_base64,'');assert.equal(calls[1].block_id,HEIGHT);
 assert.equal(calls[1].request_type,'view_state');
});
test('workflow and runner use cursor pages, preserve read-only mainnet and local-only mutation',async()=>{
 const wf=await readFile(new URL('../.github/workflows/rhea-stage45-bounded-state-import.yml',import.meta.url),'utf8');
 const script=await readFile(new URL('../scripts/stage45-rhea-paged-sandbox-import.mjs',import.meta.url),'utf8');
 assert.ok(wf.includes('STAGE45_PAGE_SIZE'));
 assert.ok(wf.includes("EXECUTION_ENABLED: 'false'"));
 assert.ok(script.includes('coverPinnedPagedState'));
 assert.ok(script.includes('stateRpc.viewPage(afterKey,limit)'));
 assert.ok(script.includes('withData:false'));
 assert.ok(script.includes('lending.patchStateRecords('));
 assert.ok(script.includes('completePaginationCoverage'));
 assert.ok(script.includes('mayBroadcastMainnet:false'));
 assert.ok(!script.includes('broadcast_tx'));
 assert.ok(!script.includes('callRaw('));
});

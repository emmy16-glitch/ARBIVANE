import test from 'node:test';
import assert from 'node:assert/strict';
import {clonePinnedContractWithState} from '../scripts/stage46-paged-sandbox-clone.mjs';

const codeHash='6Nek1MZ8cwJJ2xMQAUWup9V5AToYS9rkTxJfwo6BCpFa';
const blockHash='A'.repeat(43);
const b64=s=>Buffer.from(s).toString('base64');

function scenario(changes={}){
 const pages=[
  {block_height:221433162,block_hash:blockHash,last_key:b64('a'),values:[
   {key:b64('a'),value:b64('one')}]},
  {block_height:221433162,block_hash:blockHash,values:[
   {key:b64('b'),value:b64('two')}]},
 ];
 const patches=[],patchCalls=[],requests=[],imports=[],reports=[];
 let i=0;
 const fetcher=async(url,req)=>{
  const v=JSON.parse(req.body);
  requests.push(v);
  const result=pages[i++];
  return {ok:true,status:200,headers:{get:()=>null},
   text:async()=>JSON.stringify({jsonrpc:'2.0',result})};
 };
 const root={importContract:async opt=>{
  imports.push(opt);
  return {accountView:async()=>({code_hash:codeHash}),
   patchStateRecords:async({records})=>{
    patchCalls.push(records.map(x=>structuredClone(x)));
    patches.push(...records);
   }};
 }};
 const rpc={viewAccount:async()=>({blockHeight:'221433162',codeHash})};
 const args={root,rpc,endpoint:'https://archival-rpc.mainnet.fastnear.com',
  contractId:'contract.main.burrow.near',blockHeight:221433162,
  expectedCodeHash:codeHash,fetcher,onProgress:x=>reports.push(x),
  budgets:{paceMs:0},...changes};
 return {args,requests,imports,patches,patchCalls,reports,pages};
}

test('actually copies all pages into local Sandbox, without mainnet mutation or premature parity claim',async()=>{
 const x=scenario();
 const result=await clonePinnedContractWithState(x.args);
 assert.equal(result.evidence.recordsRead,2);
 assert.equal(result.evidence.recordsPatched,2);
 assert.equal(result.evidence.providerPaginationExhausted,true);
 assert.equal(result.evidence.completeTrieRootParityVerified,false);
 assert.equal(result.evidence.mainnetMutated,false);
 assert.equal(x.imports[0].withData,false);
 assert.equal(x.requests.length,2);
 assert.equal(x.patchCalls.length,1,'cross-page buffered records require one patch rather than one per page');
 assert.equal(result.evidence.patchWriteCalls,1);
 assert.equal(result.evidence.sourcePageCount,2);
 assert.equal(result.evidence.recordsPatched,result.evidence.recordsRead);
 assert.equal(x.requests[0].params.limit,128);
 assert.equal(x.requests[1].params.after_key_base64,b64('a'));
 assert.deepEqual(x.patches.map(row=>row.Data.data_key),[b64('a'),b64('b')]);
 assert.equal(x.reports.at(-1).complete,true);
});

test('a drifted code hash blocks before importing into Sandbox',async()=>{
 const x=scenario({expectedCodeHash:'B'.repeat(43)});
 await assert.rejects(()=>clonePinnedContractWithState(x.args),/CODE_OR_BLOCK_MISMATCH/);
 assert.equal(x.imports.length,0);
 assert.equal(x.requests.length,0);
});

test('cross-block archival pagination fails closed, never claims completed clone',async()=>{
 const x=scenario();
 x.pages[1].block_hash='C'.repeat(43);
 await assert.rejects(()=>clonePinnedContractWithState(x.args),/CROSS_BLOCK_OR_BAD_SHAPE/);
 assert.equal(x.reports.some(r=>r.complete),false);
});

test('unsafe storage budgets and missing Sandbox patch API block execution',async()=>{
 const x=scenario({budgets:{maxPatchBytes:1}});
 await assert.rejects(()=>clonePinnedContractWithState(x.args),/INVALID_SANDBOX_PATCH_BUDGET/);
 const y=scenario({root:{importContract:async()=>({accountView:async()=>({code_hash:codeHash})})}});
 await assert.rejects(()=>clonePinnedContractWithState(y.args),/PATCH_API_MISSING/);
});


test('Stage75 batches authenticated pinned pages without exceeding per-call patch caps',async()=>{
 const x=scenario();
 const rows=Array.from({length:64},(_,i)=>({key:b64('k'+String(i).padStart(3,'0')),
  value:b64('pinned-'+i)}));
 const parts=Array.from({length:4},(_,i)=>rows.slice(i*16,(i+1)*16));
 x.pages.splice(0,x.pages.length,...parts.map((values,i)=>({
  block_height:221433162,block_hash:blockHash,
  ...(i===3?{}:{last_key:values.at(-1).key}),values
 })));
 x.args.budgets={paceMs:0,maxPatchRecords:24,maxPatchBytes:48000};
 const out=await clonePinnedContractWithState(x.args);
 assert.equal(out.evidence.recordsRead,64);
 assert.equal(out.evidence.recordsPatched,64);
 assert.equal(out.evidence.patchWriteCalls,3);
 assert.equal(out.evidence.sourcePageCount,4);
 assert.equal(x.patchCalls.length,3);
 assert.deepEqual(x.patchCalls.map(batch=>batch.length),[24,24,16]);
 assert.deepEqual(x.patches.map(r=>r.Data.data_key),rows.map(r=>r.key));
 assert.match(out.evidence.sourceStorageDigest,/^[a-f0-9]{64}$/);
 assert.equal(out.evidence.completeTrieRootParityVerified,false);
 assert.equal(out.evidence.mainnetMutated,false);
 assert.equal(x.reports.at(-1).complete,true);
});

test('Stage75 source drift never flushes unverified trailing records or marks state fully cloned',async()=>{
 const x=scenario();
 x.pages[1].block_hash='C'.repeat(43);
 await assert.rejects(()=>clonePinnedContractWithState(x.args),/CROSS_BLOCK_OR_BAD_SHAPE/);
 assert.equal(x.patchCalls.length,0);
 assert.equal(x.patches.length,0);
 assert.equal(x.reports.some(x=>x.complete),false);
});


test('Stage77 retries a truly oversized single pinned archive entry at a SECOND read-only archival provider',async()=>{
 const x=scenario(), calls=[];
 x.args.fetcher=async(url,req)=>{
  const {params}=JSON.parse(req.body);
  const cursor=params.after_key_base64??null;
  calls.push({url,cursor,limit:params.limit});
  const first={block_height:221433162,block_hash:blockHash,last_key:b64('a'),
   values:[{key:b64('a'),value:b64('one')}]};
  const second={block_height:221433162,block_hash:blockHash,
   values:[{key:b64('b'),value:b64('two')}]};
  if(cursor===null)return {ok:true,status:200,headers:{get:()=>null},
   text:async()=>JSON.stringify({result:first})};
  if(url==='https://archival-rpc.mainnet.fastnear.com')
   return {ok:false,status:413,headers:{get:()=>null},text:async()=>'Too large'};
  assert.equal(url,'https://archival-rpc.mainnet.near.org');
  assert.equal(params.limit,1);
  return {ok:true,status:200,headers:{get:()=>null},
   text:async()=>JSON.stringify({result:second})};
 };
 const out=await clonePinnedContractWithState(x.args);
 assert.equal(out.evidence.alternateSingleEntryReads,1);
 assert.equal(out.evidence.alternateFailures,0);
 assert.equal(out.evidence.alternateRpcAttempts,1);
 assert.equal(out.evidence.recordsRead,2);
 assert.equal(out.evidence.recordsPatched,2);
 assert.equal(out.evidence.providerPaginationExhausted,true);
 assert.deepEqual(x.patches.map(k=>k.Data.data_key),[b64('a'),b64('b')]);
 assert.ok(calls.some(c=>c.url==='https://archival-rpc.mainnet.fastnear.com'&&c.limit===1));
 assert.equal(calls.filter(c=>c.url==='https://archival-rpc.mainnet.near.org').length,1);
 assert.equal(out.evidence.mainnetMutated,false);
 assert.equal(out.evidence.completeTrieRootParityVerified,false);
});

test('Stage77 secondary archive cannot alter pinned block hash, skip keys, or claim a complete clone on error',async()=>{
 for(const kind of ['wrong-block','unavailable','skip-key']){
  const x=scenario();
  x.args.fetcher=async(url,req)=>{
   const {params}=JSON.parse(req.body);
   const cursor=params.after_key_base64??null;
   if(cursor===null)return {ok:true,status:200,headers:{get:()=>null},
    text:async()=>JSON.stringify({result:{
     block_height:221433162,block_hash:blockHash,last_key:b64('a'),
     values:[{key:b64('a'),value:b64('one')}]}})};
   if(url==='https://archival-rpc.mainnet.fastnear.com'||kind==='unavailable')
    return {ok:false,status:413,headers:{get:()=>null},text:async()=>'Too large'};
   const tail={block_height:221433162,
    block_hash:kind==='wrong-block'?'C'.repeat(43):blockHash,
    values:[{key:kind==='skip-key'?b64('a'):b64('b'),value:b64('two')}]};
   return {ok:true,status:200,headers:{get:()=>null},
    text:async()=>JSON.stringify({result:tail})};
  };
  await assert.rejects(()=>clonePinnedContractWithState(x.args),
   kind==='unavailable'?/STAGE77_NO_ARCHIVAL_PROVIDER_CAN_READ_PINNED_STORAGE_ENTRY/:
   kind==='wrong-block'?/STAGE45_PAGED_CROSS_BLOCK_OR_BAD_SHAPE/:
   /STAGE45_NONINCREASING_OR_DUPLICATE_STORAGE_KEY/);
  assert.equal(x.reports.some(row=>row.complete),false);
 }
});

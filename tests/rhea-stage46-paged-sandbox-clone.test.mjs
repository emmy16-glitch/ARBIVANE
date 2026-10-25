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


test('Stage77 resumes normal large pages after recovering just one oversized storage key',async()=>{
 const x=scenario(),observed=[];
 x.args.fetcher=async(url,req)=>{
  const {params}=JSON.parse(req.body),cursor=params.after_key_base64??null;
  observed.push({url,cursor,limit:params.limit});
  if(cursor===b64('a')&&url==='https://archival-rpc.mainnet.fastnear.com')
   return {ok:false,status:413,headers:{get:()=>null},text:async()=>'Too large'};
  if(url==='https://archival-rpc.mainnet.near.org'&&cursor!==b64('a'))
   throw Error('ONLY_ONE_PINNED_KEY_CAN_BE_RECOVERED');
  const key=cursor===null?'a':cursor===b64('a')?'b':'c';
  const result={block_height:221433162,block_hash:blockHash,
   ...(key==='c'?{}:{last_key:b64(key)}),
   values:[{key:b64(key),value:b64(key+'-value')}]};
  return {ok:true,status:200,headers:{get:()=>null},
   text:async()=>JSON.stringify({result})};
 };
 const evidence=(await clonePinnedContractWithState(x.args)).evidence;
 assert.equal(evidence.recordsRead,3);
 assert.equal(evidence.recordsPatched,3);
 assert.equal(evidence.alternateSingleEntryReads,1);
 const after=observed.find(c=>c.cursor===b64('b'));
 assert.equal(after.url,'https://archival-rpc.mainnet.fastnear.com');
 assert.equal(after.limit,128);
 assert.equal(evidence.providerPaginationExhausted,true);
 assert.equal(evidence.mainnetMutated,false);
});


test('Stage78 explicitly configured higher-limit archival RPC recovers a pinned oversized key',async()=>{
 const x=scenario(),url='https://large-state-provider.example/rpc',calls=[];
 x.args.fallbackEndpoint=url;
 x.args.fetcher=async(endpoint,req)=>{
  const params=JSON.parse(req.body).params;
  calls.push({endpoint,limit:params.limit,after:params.after_key_base64});
  if(params.after_key_base64===undefined)
   return {ok:true,status:200,headers:{get:()=>null},
    text:async()=>JSON.stringify({result:x.pages[0]})};
  if(endpoint!==url)
   return {ok:false,status:413,headers:{get:()=>null},text:async()=>'Too large'};
  return {ok:true,status:200,headers:{get:()=>null},
   text:async()=>JSON.stringify({result:x.pages[1]})};
 };
 const v=(await clonePinnedContractWithState(x.args)).evidence;
 assert.equal(v.alternateSingleEntryReads,1);
 assert.equal(v.recordsRead,2);
 assert.equal(v.recordsPatched,2);
 assert.equal(v.mainnetMutated,false);
 assert.equal(v.completeTrieRootParityVerified,false);
 assert.equal(calls.filter(c=>c.endpoint===url).length,1);
 assert.ok(calls.some(c=>c.endpoint===url&&c.limit===1));
});

test('Stage78 rejects insecure, credential-bearing and same-as-primary alternative endpoints',async()=>{
 for(const fallbackEndpoint of [
  'http://archive.example',
  'https://user:pass@archive.example',
  'https://archive.example/#fragment',
  'https://archival-rpc.mainnet.fastnear.com',
 ]){
  const x=scenario({fallbackEndpoint});
  await assert.rejects(()=>clonePinnedContractWithState(x.args),
   /STAGE46_INVALID_LOCAL_CLONE_CONFIGURATION/);
  assert.equal(x.imports.length,0);
 }
});


test('Stage80 canonical archive validation rejects URL spelling aliases and private endpoints',async()=>{
 const {validateStage80IndependentArchive}=await import('../scripts/stage46-paged-sandbox-clone.mjs');
 const primary='https://archival-rpc.mainnet.fastnear.com';
 for(const rejected of [
  primary,primary+'/',primary+'/?apiKey=fake',
  'http://archive.example/rpc','https://localhost/rpc',
  'https://127.0.0.1/rpc','https://10.2.3.4/rpc',
  'https://192.168.0.1/rpc','https://archive.local/rpc',
  'https://user:pass@archive.example/rpc',
  'https://archive.example:8899/rpc','https://archive.example/rpc#fragment'
 ])assert.throws(()=>validateStage80IndependentArchive(primary,rejected),
  /STAGE46_INVALID_LOCAL_CLONE_CONFIGURATION/);
 const trusted='https://higher-limit-archive.example/rpc?key=TEST_VALUE';
 assert.equal(validateStage80IndependentArchive(primary,trusted),trusted);
});


test('Stage81 blocks IP literal metadata endpoints, IPv6 and intranet DNS before Sandbox cloning',async()=>{
 const {validateStage80IndependentArchive}=await import('../scripts/stage46-paged-sandbox-clone.mjs');
 const primary='https://archival-rpc.mainnet.fastnear.com';
 for(const fallbackEndpoint of [
  'https://169.254.169.254/latest/meta-data',
  'https://8.8.8.8/rpc',
  'https://[::ffff:127.0.0.1]/rpc',
  'https://[::1]/rpc',
  'https://archive.internal/rpc',
  'https://service.localhost/rpc',
  'https://archive.local/rpc',
  primary+'/?apiKey=different'
 ]){
  assert.throws(()=>validateStage80IndependentArchive(primary,fallbackEndpoint),
   /STAGE46_INVALID_LOCAL_CLONE_CONFIGURATION/);
  const x=scenario({fallbackEndpoint});
  await assert.rejects(()=>clonePinnedContractWithState(x.args),
   /STAGE46_INVALID_LOCAL_CLONE_CONFIGURATION/);
  assert.equal(x.requests.length,0);
  assert.equal(x.imports.length,0);
 }
 assert.equal(validateStage80IndependentArchive(primary,
  'https://independent-archive.example/api?key=REDACTED'),
  'https://independent-archive.example/api?key=REDACTED');
});

test('Stage84 patches original oversized archival record in one bounded Sandbox-only call',async()=>{
 const x=scenario();
 const giant=Buffer.alloc(130000,0x5a);
 x.pages[1].values[0].value=b64(giant);
 const output=await clonePinnedContractWithState(x.args);
 assert.equal(output.evidence.recordsRead,2);
 assert.equal(output.evidence.recordsPatched,2);
 assert.equal(output.evidence.largeSingleRecordPatchCalls,1);
 assert.ok(output.evidence.largestPatchRecordBytes>48000);
 assert.equal(x.patchCalls.length,2);
 assert.deepEqual(x.patchCalls.map(c=>c.length),[1,1]);
 assert.equal(x.patchCalls[1][0].Data.value,b64(giant));
 assert.equal(Buffer.from(x.patchCalls[1][0].Data.value,'base64').length,giant.length);
 assert.equal(output.evidence.providerPaginationExhausted,true);
 assert.equal(output.evidence.completeTrieRootParityVerified,false);
 assert.equal(output.evidence.mainnetMutated,false);
 assert.equal(x.reports.at(-1).complete,true);
});

test('Stage84 rejects genuinely over-cap large record without marking clone complete',async()=>{
 const x=scenario();
 x.args.budgets={paceMs:0,maxPatchBytes:48000,maxSinglePatchBytes:75000};
 x.pages[1].values[0].value=b64(Buffer.alloc(85000,0x51));
 await assert.rejects(()=>clonePinnedContractWithState(x.args),
  /STAGE46_INDIVIDUAL_STORAGE_KEY_EXCEEDS_PATCH_LIMIT/);
 assert.equal(x.patchCalls.length,0);
 assert.equal(x.reports.some(v=>v.complete===true),false);
});

test('Stage84 alternate archive must actually supply one oversized key, never empty success',async()=>{
 const x=scenario();let calls=0;
 x.args.fetcher=async(url,req)=>{
  const {params}=JSON.parse(req.body),cursor=params.after_key_base64??null;
  calls++;
  if(cursor===null)
   return new Response(JSON.stringify({result:x.pages[0]}),{status:200});
  if(url===x.args.endpoint)return new Response('Response too large',{status:413});
  return new Response(JSON.stringify({result:{
   block_height:221433162,block_hash:blockHash,values:[],
  }}),{status:200});
 };
 await assert.rejects(()=>clonePinnedContractWithState(x.args),
  /STAGE77_NO_ARCHIVAL_PROVIDER_CAN_READ_PINNED_STORAGE_ENTRY/);
 assert.ok(calls>2);
 assert.equal(x.reports.some(v=>v.complete===true),false);
});

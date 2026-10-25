import test from 'node:test';
import assert from 'node:assert/strict';
import {clonePinnedContractWithState} from '../scripts/stage46-paged-sandbox-clone.mjs';

const codeHash='6Nek1MZ8cwJJ2xMQAUWup9V5AToYS9rkTxJfwo6BCpFa';
const height=221433162,blockA='A'.repeat(43),blockB='B'.repeat(43);
const b64=s=>Buffer.from(s).toString('base64');
const response=(result,error)=>({
 ok:true,status:200,headers:{get:()=>null},
 text:async()=>JSON.stringify(error?{jsonrpc:'2.0',error}:{jsonrpc:'2.0',result})
});
const large=()=>response(null,{code:-32000,
 message:'Response size limit exceeded for state query'});
function harness({backupMode='good',endpoint='https://archival-rpc.mainnet.fastnear.com'}={}){
 const requests=[],patches=[],imports=[];
 const fetcher=async(url,request)=>{
  const q=JSON.parse(request.body),p=q.params;
  assert.equal(q.method,'query');
  assert.equal(p.request_type,'view_state');
  assert.equal(p.block_id,height);
  assert.equal(p.account_id,'contract.main.burrow.near');
  assert.equal(p.prefix_base64,'');
  requests.push({url,limit:p.limit,cursor:p.after_key_base64??null});
  const backup=url==='https://archival-rpc.mainnet.near.org';
  if(backup){
   if(backupMode==='large')return large();
   if(backupMode==='empty')return response({
    block_height:height,block_hash:blockA,values:[]});
   return response({
    block_height:height,block_hash:backupMode==='drift'?blockB:blockA,
    values:[{key:b64('a'),value:b64('ONE')}],
    last_key:b64('a')
   });
  }
  if(p.after_key_base64===b64('a'))return response({
   block_height:height,block_hash:blockA,
   values:[{key:b64('b'),value:b64('TWO')}]
  });
  return large();
 };
 const root={importContract:async o=>{
  imports.push(o);
  return {accountView:async()=>({code_hash:codeHash}),
   patchStateRecords:async({records})=>patches.push(...records)};
 }};
 const rpc={viewAccount:async()=>({codeHash,blockHeight:String(height)})};
 const args={root,rpc,endpoint,
  contractId:'contract.main.burrow.near',blockHeight:height,
  expectedCodeHash:codeHash,fetcher,
  budgets:{paceMs:0,pageSize:8},
  onProgress:()=>{}
 };
 return {args,requests,patches,imports};
}
test('Stage77 obtains one previously oversized archival record from official provider at identical pinned height',async()=>{
 const x=harness();
 const output=await clonePinnedContractWithState(x.args);
 assert.equal(output.evidence.recordsRead,2);
 assert.equal(output.evidence.recordsPatched,2);
 assert.equal(output.evidence.singleEntryFallbacks,1);
 assert.equal(output.evidence.backupArchivalSourceUsed,true);
 assert.equal(output.evidence.sourceBlockHash,blockA);
 assert.match(output.evidence.sourceStorageDigest,/^[0-9a-f]{64}$/);
 assert.deepEqual(x.patches.map(row=>row.Data.data_key),[b64('a'),b64('b')]);
 assert.equal(x.imports[0].withData,false);
 assert.equal(output.evidence.mainnetMutated,false);
 assert.equal(output.evidence.completeTrieRootParityVerified,false);
 assert.ok(x.requests.some(p=>p.url==='https://archival-rpc.mainnet.near.org'&&p.limit===1));
 assert.ok(x.requests.every(p=>p.cursor===null||p.cursor===b64('a')));
});
test('Stage77 never merges different pinned block hashes across archival providers',async()=>{
 const x=harness({backupMode:'drift'});
 await assert.rejects(()=>clonePinnedContractWithState(x.args),/STAGE45_PAGED_CROSS_BLOCK_OR_BAD_SHAPE/);
});
test('Stage77 refuses a missing or oversized required record even when alternative provider responds',async()=>{
 for(const backupMode of ['large','empty']){
  const x=harness({backupMode});
  await assert.rejects(()=>clonePinnedContractWithState(x.args),
   /STAGE77_BOTH_ARCHIVAL_PROVIDERS_REFUSED_REQUIRED_STORAGE_RECORD/);
  assert.equal(x.patches.length,0);
 }
});
test('Stage77 cannot transparently forward source archival reads to arbitrary user-provided endpoints',async()=>{
 const x=harness({endpoint:'https://example.net'});
 await assert.rejects(()=>clonePinnedContractWithState(x.args),
  /STAGE45_INDIVIDUAL_STORAGE_ENTRY_EXCEEDS_RPC_LIMIT/);
 assert.ok(!x.requests.some(p=>p.url==='https://archival-rpc.mainnet.near.org'));
});

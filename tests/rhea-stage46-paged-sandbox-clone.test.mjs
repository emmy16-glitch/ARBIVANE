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
 const patches=[],requests=[],imports=[],reports=[];
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
   patchStateRecords:async({records})=>patches.push(...records)};
 }};
 const rpc={viewAccount:async()=>({blockHeight:'221433162',codeHash})};
 const args={root,rpc,endpoint:'https://archival-rpc.mainnet.fastnear.com',
  contractId:'contract.main.burrow.near',blockHeight:221433162,
  expectedCodeHash:codeHash,fetcher,onProgress:x=>reports.push(x),
  budgets:{paceMs:0},...changes};
 return {args,requests,imports,patches,reports,pages};
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

import test from 'node:test';
import assert from 'node:assert/strict';
import {parseDetailedBorrower,indexDetailedDebtShard} from '../src/rhea/detailed-debt-index.ts';
import {parseParityPools} from '../src/rhea/deployed-share-parity.ts';
const D='usn',C='wrap.near',HASH='2'.repeat(43),CONTRACT='contract.main.burrow.near';
const assets=[[D,{supplied:{shares:'100',balance:'100'},borrowed:{shares:'100',balance:'100'}}],[C,{supplied:{shares:'100',balance:'100'},borrowed:{shares:'100',balance:'100'}}]];
const pools=parseParityPools(assets);
const detailed={supplied:[],positions:{'l-1':{collateral:[{token_id:C,shares:'5',balance:'5'}],borrowed:[{token_id:D,shares:'10',balance:'10'}]}}};
const options={lendingContract:CONTRACT,startIndex:0,maxAccounts:6,pageSize:2,detailConcurrency:2,maxRetries:0,pinnedBlockHeight:101,expectedLendingCodeHash:HASH,batchDelayMs:0};
function mock(detail=()=>detailed){const calls=[];return {calls,rpc:{
 async viewAccount(id,height){calls.push(['account',id,height]);return {blockHeight:'101',codeHash:HASH};},
 async view(id,method,args,height){calls.push([method,id,args,height]);if(height!==101)throw Error('invalid test pinned block');
  return {blockHeight:'101',value:method==='get_assets_paged'?assets:method==='get_num_accounts'?6:method==='get_accounts_paged'?
   Array.from({length:args.limit},(_,i)=>({account_id:`account${args.from_index+i}.near`,positions:{p:{borrowed:[],collateral:[]}}})):method==='get_account_all_positions'?detail(args.account_id):(()=>{throw Error('unexpected read method')})()};}
 }};}
test('detailed position view detects actual debts paged borrower data hides',async()=>{
 const {rpc,calls}=mock(accountId=>accountId==='account3.near'?detailed:{supplied:[],positions:{}});
 const {checkpoint,summary}=await indexDetailedDebtShard(rpc,options);
 assert.equal(summary.debtAccounts,1);assert.equal(checkpoint.sourceView,'get_account_all_positions');
 assert.equal(checkpoint.findings[0].accountId,'account3.near');assert.equal(summary.status,'COMPLETE_INDEX_UNAPPROVED');
 assert.equal(summary.executionEnabled,false);
 assert.equal(calls.filter(c=>c[0]==='get_account_all_positions').length,6);
 assert.ok(calls.filter(c=>c[0]!=='account').every(c=>c[3]===101));
});
test('detailed borrower maps each isolated position without crossing position boundaries',()=>{
 const p=parseDetailedBorrower(detailed,'a.near',pools);assert.deepEqual(p.positions,[{positionId:'l-1',debtAssetIds:[D],collateralRecorded:true}]);
 assert.equal(parseDetailedBorrower({positions:{}},'a.near',pools),null);
});
test('unknown assets and missing debt fields cause schema errors not false zero',()=>{
 assert.throws(()=>parseDetailedBorrower({positions:{x:{collateral:[]}}},'a.near',pools),/MISSING/);
 assert.throws(()=>parseDetailedBorrower({positions:{x:{collateral:[],borrowed:[{token_id:'fake.near',shares:'1'}]}}},'a.near',pools),/TOKEN/);
});
test('a missing detailed account view invalidates the entire shard rather than counting zero',async()=>{
 const {rpc}=mock(()=>null);await assert.rejects(()=>indexDetailedDebtShard(rpc,options),/INVALID_POSITION_OBJECT/);
});
test('missing pages, snapshot block or code hash cannot be silently merged',async()=>{
 const r=mock();r.rpc.viewAccount=async()=>({blockHeight:'101',codeHash:'3'.repeat(43)});
 await assert.rejects(()=>indexDetailedDebtShard(r.rpc,options),/PINNED_CODE_OR_BLOCK_MISMATCH/);
});
test('checkpoint resumes same block after completed pages without duplicating borrower records',async()=>{
 const {rpc}=mock(accountId=>accountId==='account3.near'?detailed:{positions:{}});
 let saved;
 await assert.rejects(()=>indexDetailedDebtShard(rpc,options,undefined,(cp)=>{saved=cp;if(cp.nextIndex===2)throw Error('synthetic interruption');}),/synthetic interruption/);
 const result=await indexDetailedDebtShard(rpc,options,saved);
 assert.equal(result.checkpoint.seenAccountIds.length,6);assert.equal(result.checkpoint.findings.length,1);
});
test('only exact detailed snapshot is allowed on resume',async()=>{
 const {rpc}=mock(()=>({positions:{}}));const {checkpoint}=await indexDetailedDebtShard(rpc,options);
 await assert.rejects(()=>indexDetailedDebtShard(rpc,options,{...checkpoint,blockHeight:'102'}),/INCOMPATIBLE_DETAILED_INDEX_CHECKPOINT/);
});

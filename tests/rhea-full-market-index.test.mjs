import test from 'node:test';
import assert from 'node:assert/strict';
import { backfillRheaDebtIndex, summarizeDebtBackfill } from '../src/rhea/market-debt-index.ts';
const HASH='2'.repeat(43);
const TOKEN='wrap.near',DEBT='usn';
const assets=[
 [TOKEN,{supplied:{shares:'1000',balance:'2000'},borrowed:{shares:'500',balance:'1000'}}],
 [DEBT,{supplied:{shares:'1000',balance:'1000'},borrowed:{shares:'1000',balance:'1000'}}],
];
const borrower=(i)=>({account_id:`account${i}.near`,positions:{
 [`position-${i}`]:{borrowed:i%3===0?[{token_id:DEBT,shares:'2'}]:[], collateral:i%3===0?[{token_id:TOKEN,shares:'2'}]:[]}
}});
const config={lendingContract:'contract.main.burrow.near',startIndex:0,maxAccounts:10,pageSize:2,concurrency:3,maxRetries:1};
function fixture(length=10,{modified=(r)=>r,failMethod='',wrongBlock='',hash=HASH}={}) {
 const rows=Array.from({length},(_,i)=>modified(borrower(i),i));
 const calls=[];
 let failures=0;
 const rpc={
  async viewAccount(id,h){calls.push({method:'viewAccount',block:h});return {blockHeight:'101',codeHash:hash}},
  async view(id,method,args,h){calls.push({method,block:h,args});
   if(method===failMethod && failures++===0)throw Error('NEAR RPC HTTP 429');
   const value=method==='get_assets_paged'?assets:method==='get_num_accounts'?rows.length:
     method==='get_accounts_paged'?rows.slice(args.from_index,args.from_index+args.limit):undefined;
   if(value===undefined)throw Error('unexpected RPC method');
   return {blockHeight:method===wrongBlock?'102':'101',value};
  }
 };
 return {rpc,calls,rows};
}
test('full NEAR market index identifies thousands of debt accounts without inventing liquidations',async()=>{
 const count=12_000;
 const {rpc,calls}=fixture(count);
 const checkpoints=[];
 const {checkpoint,summary}=await backfillRheaDebtIndex(rpc,{...config,maxAccounts:count,pageSize:50,concurrency:8},undefined,(_,s)=>{
  if(s.scannedAccounts%400===0)checkpoints.push([s.scannedAccounts,s.debtAccounts]);
 });
 assert.equal(summary.status,'COMPLETE_INDEX_UNAPPROVED');
 assert.equal(summary.totalAccounts,count);assert.equal(summary.scannedAccounts,count);
 assert.equal(summary.debtAccounts,4000);assert.equal(summary.debtPositions,4000);
 assert.deepEqual(summary.debtAssetIds,[DEBT]);assert.equal(checkpoint.findings.length,4000);
 assert.equal(summary.executionEnabled,false);assert.equal(summary.liquidationParityVerified,false);
 assert.equal(summary.priceParityVerified,false);assert.equal(summary.invalidAccounts,0);
 assert.equal(checkpoint.seenAccountIds.length,count);
 assert.equal(new Set(checkpoint.seenAccountIds).size,count);
 assert.equal(calls.filter(c=>c.method==='get_accounts_paged').length,240);
 assert.ok(calls.filter(c=>c.method.startsWith('get_')).every(c=>c.block===101));
 assert.ok(checkpoints.length>=3);
});
test('bounded partial-range scan never claims complete index',async()=>{
 const {rpc}=fixture(100);
 const {summary}=await backfillRheaDebtIndex(rpc,{...config,maxAccounts:10,startIndex:10});
 assert.equal(summary.scannedAccounts,10);assert.equal(summary.nextIndex,20);
 assert.equal(summary.completeSnapshot,false);assert.equal(summary.debtAccounts,3);
 assert.equal(summary.status,'PARTIAL_WINDOW_UNAPPROVED');
});
test('checkpoint can resume the exact same finalized snapshot without duplicate accounts',async()=>{
 const {rpc,calls}=fixture(26);
 let saved;
 await assert.rejects(()=>backfillRheaDebtIndex(rpc,{...config,maxAccounts:26},undefined,async state=>{
  saved=structuredClone(state);
  if(state.scannedAccounts===6)throw Error('simulated process halt');
 }),/simulated process halt/);
 assert.equal(saved.nextIndex,6);
 const {checkpoint,summary}=await backfillRheaDebtIndex(rpc,{...config,maxAccounts:26},saved);
 assert.equal(summary.scannedAccounts,26);assert.equal(summary.debtAccounts,9);
 assert.equal(new Set(checkpoint.seenAccountIds).size,26);
 assert.ok(calls.some(c=>c.method==='viewAccount'&&c.block===101));
 assert.equal(summary.completeSnapshot,true);
});
test('resumed run cannot silently change observed lending code or finalized block',async()=>{
 const {rpc}=fixture(5);
 const {checkpoint}=await backfillRheaDebtIndex(rpc,{...config,maxAccounts:3});
 const changed=fixture(5,{hash:'3'.repeat(43)});
 await assert.rejects(()=>backfillRheaDebtIndex(changed.rpc,{...config,maxAccounts:3},checkpoint),/CHECKPOINT_BLOCK_OR_CODE_CHANGED/);
 const shifted=fixture(5);shifted.rpc.viewAccount=async()=>({blockHeight:'102',codeHash:HASH});
 await assert.rejects(()=>backfillRheaDebtIndex(shifted.rpc,{...config,maxAccounts:3},checkpoint),/CHECKPOINT_BLOCK_OR_CODE_CHANGED/);
});
test('account index collisions across pages fail closed instead of double-counting',async()=>{
 const {rpc}=fixture(6,{modified:(row,i)=>i===4?borrower(0):row});
 await assert.rejects(()=>backfillRheaDebtIndex(rpc,{...config,maxAccounts:6}),/INVALID_OR_DUPLICATE_ACCOUNT_INDEX/);
});
test('asset exposure schema errors cannot be counted as clean completeness',async()=>{
 const {rpc}=fixture(9,{modified:(r,i)=>i===2?{account_id:r.account_id,borrowed:{'missing.near':'30'}}:r});
 const {summary,checkpoint}=await backfillRheaDebtIndex(rpc,{...config,maxAccounts:9});
 assert.equal(summary.invalidAccounts,1);assert.equal(summary.completeSnapshot,false);
 assert.equal(summary.status,'SCHEMA_ERRORS_UNVERIFIED');
 assert.equal(summary.schemaReasons.UNKNOWN_OR_DUPLICATE_ASSET,1);
 assert.equal(checkpoint.seenAccountIds.length,9);
});
test('RPC same-block incompatibility fails instead of using other block results',async()=>{
 const {rpc}=fixture(10,{wrongBlock:'get_accounts_paged'});
 await assert.rejects(()=>backfillRheaDebtIndex(rpc,config),/INCONSISTENT_BLOCK_OR_PAGE_LENGTH/);
});
test('transient rate limiting retries only when opted into bounded retries',async()=>{
 const retried=fixture(10,{failMethod:'get_accounts_paged'});
 const out=await backfillRheaDebtIndex(retried.rpc,config);
 assert.equal(out.summary.completeSnapshot,true);
 assert.equal(retried.calls.filter(c=>c.method==='get_accounts_paged').length,6);
 const noRetry=fixture(10,{failMethod:'get_accounts_paged'});
 await assert.rejects(()=>backfillRheaDebtIndex(noRetry.rpc,{...config,maxRetries:0}),/HTTP 429/);
});
test('invalid configuration rejected before performing any chain reads',async()=>{
 const bad=[{...config,concurrency:13},{...config,concurrency:0},{...config,pageSize:51},
  {...config,maxAccounts:250001},{...config,startIndex:-1},{...config,maxRetries:5},{...config,lendingContract:'bad id'}];
 for(const c of bad){const {rpc,calls}=fixture(10);await assert.rejects(()=>backfillRheaDebtIndex(rpc,c));assert.equal(calls.length,0);}
});
test('modified or malformed resume checkpoint is rejected before making RPC reads',async()=>{
 const {rpc}=fixture(10);const {checkpoint}=await backfillRheaDebtIndex(rpc,config);
 const bad=[{...checkpoint,blockHeight:'not-a-block'},
  {...checkpoint,nextIndex:0},
  {...checkpoint,seenAccountIds:[...checkpoint.seenAccountIds,'a.near']},
  {...checkpoint,findings:[...checkpoint.findings,{accountId:'forged.near',classification:'DEBT_SHARES_DISCOVERED_UNVALUED',positions:[]}]},
  {...checkpoint,codeHashPinProvided:true},
  {...checkpoint,completeSnapshot:true,invalidAccounts:1}];
 for(const cp of bad){const f=fixture(10);await assert.rejects(()=>backfillRheaDebtIndex(f.rpc,config,cp));assert.equal(f.calls.length,0);}
});
test('empty protocol is a complete observed index but not a liquidation opportunity',async()=>{
 const f=fixture(0);const {summary}=await backfillRheaDebtIndex(f.rpc,config);
 assert.equal(summary.status,'COMPLETE_INDEX_UNAPPROVED');assert.equal(summary.debtAccounts,0);
 assert.equal(summary.completeSnapshot,true);assert.equal(summary.executionEnabled,false);
});
test('pagination failure aborts the scan without producing a false complete report',async()=>{
 const f=fixture(10);const old=f.rpc.view;
 f.rpc.view=async(...a)=>a[1]==='get_accounts_paged'?{blockHeight:'101',value:[]} :old(...a);
 await assert.rejects(()=>backfillRheaDebtIndex(f.rpc,config),/INCONSISTENT_BLOCK_OR_PAGE_LENGTH/);
});

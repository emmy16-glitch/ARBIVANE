import test from 'node:test';
import assert from 'node:assert/strict';
import {indexPagedPositions} from '../src/rhea/paged-position-index.ts';
const L='contract.main.burrow.near',HASH='2'.repeat(43),H=101;
const A='wrap.near',D='usdc.near';
const assets=[[A,{supplied:{shares:'100000',balance:'100000'},borrowed:{shares:'100000',balance:'100000'},config:{}}],[D,{supplied:{shares:'100000',balance:'100000'},borrowed:{shares:'100000',balance:'100000'},config:{}}]];
const row=i=>({account_id:`account${i}.near`,supplied:[],positions:i%10===0?{REGULAR:{borrowed:[{token_id:D,shares:'2',balance:'2'}],collateral:[{token_id:A,shares:'3',balance:'3'}]}}:{},farms:[]});
function fixture(total,{failOnce=false,wrongBlock=false}={}){const rows=Array.from({length:total},(_,i)=>row(i));const calls=[];let failed=false;return {calls,rpc:{
 async viewAccount(id,h){calls.push(['account',h]);return {blockHeight:String(H),codeHash:HASH};},
 async view(id,method,args,h){calls.push([method,args,h]);if(failOnce&&method==='get_accounts_all_positions_paged'&&!failed){failed=true;throw Error('NEAR RPC HTTP 500');}
  const value=method==='get_assets_paged'?assets:method==='get_num_accounts'?total:method==='get_accounts_all_positions_paged'?rows.slice(args.from_index,args.from_index+args.limit):undefined;
  return {blockHeight:wrongBlock&&method==='get_accounts_all_positions_paged'?'102':String(H),value};
 }}};}
const options={lendingContract:L,pinnedBlockHeight:H,expectedLendingCodeHash:HASH,startIndex:0,maxAccounts:10000,pageSize:50,concurrency:4,maxRetries:1,retryBaseDelayMs:0};
test('bulk position pages index thousands with bounded concurrency and no per-account RPC',async()=>{
 const f=fixture(5000);const saved=[];const out=await indexPagedPositions(f.rpc,options,undefined,(cp)=>saved.push(cp.nextIndex));
 assert.equal(out.summary.completeSnapshot,true);assert.equal(out.summary.debtAccounts,500);assert.equal(out.summary.debtPositions,500);
 assert.equal(f.calls.filter(x=>x[0]==='get_accounts_all_positions_paged').length,100);
 assert.equal(f.calls.filter(x=>x[0]==='get_account_all_positions').length,0);assert.ok(saved.length>1);
 assert.equal(new Set(out.checkpoint.seenAccountIds).size,5000);assert.equal(out.summary.executionEnabled,false);
});
test('checkpoint resumes only the identical block and avoids duplicate findings',async()=>{
 const f=fixture(250);let cp;await assert.rejects(()=>indexPagedPositions(f.rpc,{...options,maxAccounts:250,concurrency:1},undefined,state=>{cp=state;if(state.nextIndex===100)throw Error('halt');}),/halt/);
 const out=await indexPagedPositions(f.rpc,{...options,maxAccounts:250,concurrency:1},cp);
 assert.equal(out.summary.scannedAccounts,250);assert.equal(out.summary.debtAccounts,25);
 assert.equal(new Set(out.checkpoint.findings.map(x=>x.accountId)).size,25);
 const changed={...cp,blockHeight:'102'};await assert.rejects(()=>indexPagedPositions(f.rpc,{...options,maxAccounts:250,concurrency:1},changed),/INCOMPATIBLE/);
});
test('bulk page retries transient failures and rejects cross-block or malformed options',async()=>{
 const retry=fixture(60,{failOnce:true});const out=await indexPagedPositions(retry.rpc,{...options,maxAccounts:60,retryBaseDelayMs:0});assert.equal(out.summary.scannedAccounts,60);
 await assert.rejects(()=>indexPagedPositions(fixture(60,{wrongBlock:true}).rpc,{...options,maxAccounts:60}),/BLOCK_OR_LENGTH/);
 for(const bad of [{pageSize:51},{concurrency:17},{maxAccounts:0},{pinnedBlockHeight:0}]){const f=fixture(2);await assert.rejects(()=>indexPagedPositions(f.rpc,{...options,...bad}));assert.equal(f.calls.length,0);}
});

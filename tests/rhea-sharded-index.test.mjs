import test from 'node:test';
import assert from 'node:assert/strict';
import {shardRange,mergeDebtShards} from '../src/rhea/market-shards.ts';
import {detailedDebtPositions,comparePagedToDetailedDebt,inspectRheaBorrowerWitness} from '../src/rhea/debt-schema-witness.ts';
const A='wrap.near',D='usn',HASH='2'.repeat(43);
const pools=new Set([A,D]);
const raw={positions:{'isolated-1':{borrowed:[{token_id:D,shares:'3'}],collateral:[{token_id:A,shares:'2'}]},'isolated-2':{borrowed:[],collateral:[]}}};
const debt=[{positionId:'isolated-1',debtAssetIds:[D],collateralRecorded:true}];
test('detailed SDK-shaped isolated position includes exact bounded token shares',()=>{
 const d=detailedDebtPositions(raw,pools);assert.deepEqual([...d], [['isolated-1',[D]]]);
 assert.equal(comparePagedToDetailedDebt({accountId:'abc.near',positions:debt},d),true);
 assert.equal(comparePagedToDetailedDebt(null,d),false);
});
test('detailed witness rejects missing borrowed role or unknown token, not a debt-free result',()=>{
 assert.throws(()=>detailedDebtPositions({positions:{p:{collateral:[]}}},pools),/MISSING/);
 assert.throws(()=>detailedDebtPositions({positions:{p:{borrowed:[{token_id:'unknown.near',shares:'3'}],collateral:[]}}},pools),/TOKEN/);
 assert.throws(()=>detailedDebtPositions({positions:{p:{borrowed:[{token_id:D,shares:4}],collateral:[]}}},pools),/SHARES/);
});
test('cannot misclassify legacy debt as isolated position zero',()=>{
 assert.throws(()=>comparePagedToDetailedDebt({accountId:'abc.near',positions:[{positionId:null,debtAssetIds:[D],collateralRecorded:true}]},new Map()),/LEGACY/);
});
test('schema witness asks detailed positions at one finalized block across spread account indices',async()=>{
 const events=[],value={account_id:'abc.near',positions:{p:{borrowed:[{token_id:D,shares:'3'}],collateral:[]}}};
 const assets=[[D,{supplied:{shares:'1',balance:'1'},borrowed:{shares:'2',balance:'2'}}]];
 const rpc={
  async viewAccount(c,h){events.push(['account',h]);return {blockHeight:'101',codeHash:HASH};},
  async view(c,m,arg,h){events.push([m,h]);const v=m==='get_assets_paged'?assets:m==='get_num_accounts'?3:m==='get_accounts_paged'?{account_id:`account${arg.from_index}.near`,positions:{p:{borrowed:{[D]:'3'},collateral:{}}}}:value;
   return {blockHeight:'101',value:m==='get_accounts_paged'?[v]:v};}
 };
 const out=await inspectRheaBorrowerWitness(rpc,{lendingContract:'contract.main.burrow.near',sampleCount:3,pageSize:2});
 assert.equal(out.status,'SAMPLE_COMPATIBLE_UNAPPROVED');assert.equal(out.checkedAccounts,3);assert.equal(out.debtAccountsPaged,3);assert.equal(out.debtAccountsDetailed,3);
 assert.ok(events.filter(e=>e[0]!=='account').every(e=>e[1]===101));
});
test('schema witness independently detects paged debt undercount',async()=>{
 const assets=[[D,{supplied:{shares:'1',balance:'1'},borrowed:{shares:'2',balance:'2'}}]];
 const rpc={async viewAccount(){return {blockHeight:'101',codeHash:HASH};},async view(c,m,arg){return {blockHeight:'101',value:m==='get_assets_paged'?assets:m==='get_num_accounts'?1:m==='get_accounts_paged'?[{account_id:'abc.near',positions:{p:{borrowed:[],collateral:[]}}}]:{positions:{p:{borrowed:[{token_id:D,shares:'2'}],collateral:[]}}}};}};
 const out=await inspectRheaBorrowerWitness(rpc,{lendingContract:'contract.main.burrow.near',sampleCount:1,pageSize:1});
 assert.equal(out.status,'SCHEMA_MISMATCH');assert.equal(out.mismatches,1);
});
test('shard ranges cover all accounts exactly once including nondivisible totals',()=>{
 for(const total of [6,11,12001,72768]){
  const ranges=Array.from({length:6},(_,i)=>shardRange(total,i,6));let offset=0;
  for(const item of ranges){assert.equal(item.startIndex,offset);offset+=item.maxAccounts;}
  assert.equal(offset,total);
 }
});
function shard(total,i,count=2){const {startIndex,maxAccounts}=shardRange(total,i,count);
 const ids=Array.from({length:maxAccounts},(_,j)=>`account${startIndex+j}.near`);
 return {version:1,mode:'NEAR_RHEA_SAME_BLOCK_BACKFILL',chain:'NEAR_MAINNET',executionEnabled:false,liquidationParityVerified:false,lendingContract:'contract.main.burrow.near',blockHeight:'101',lendingCodeHash:HASH,codeHashPinProvided:true,totalAccounts:total,startIndex,targetEndIndex:startIndex+maxAccounts,nextIndex:startIndex+maxAccounts,scannedAccounts:maxAccounts,invalidAccounts:0,schemaReasons:{},seenAccountIds:ids,findings:[],completeSnapshot:false,borrowedPoolBalancePositive:true,sourceView:'get_account_all_positions'};}
test('shard merge reports positive pool debt + no located borrower as unverified',()=>{
 const result=mergeDebtShards([shard(10,0),shard(10,1)],2);
 assert.equal(result.status,'BORROWER_DEBT_MISSING_UNVERIFIED');assert.equal(result.scannedAccounts,10);
 assert.equal(result.debtAccounts,0);assert.equal(result.executionEnabled,false);
});
test('valid shard findings produce complete only as research evidence',()=>{
 const a=shard(10,0),b=shard(10,1);b.findings.push({accountId:b.seenAccountIds[2],positions:debt,classification:'DEBT_SHARES_DISCOVERED_UNVALUED'});
 const r=mergeDebtShards([a,b],2);assert.equal(r.status,'COMPLETE_UNAPPROVED');assert.equal(r.debtAccounts,1);assert.equal(r.debtPositions,1);
});
test('shard merge rejects inconsistent block, missed ranges and cross-shard account collisions',()=>{
 const a=shard(10,0),b=shard(10,1);
 assert.throws(()=>mergeDebtShards([a,{...b,blockHeight:'102'}],2),/INCOMPLETE/);
 assert.throws(()=>mergeDebtShards([a,{...b,nextIndex:b.nextIndex-1}],2),/INCOMPLETE/);
 assert.throws(()=>mergeDebtShards([a,{...b,seenAccountIds:[...b.seenAccountIds.slice(0,4),a.seenAccountIds[0]]}],2),/DUPLICATE/);
});
test('invalid shard planner indices rejected before network work',()=>{
 for(const bad of [[10,-1,2],[10,2,2],[10,0,0],[10,0,17],[-2,0,3]])assert.throws(()=>shardRange(...bad),/INVALID/);
});

test('full-market shards run once on a main workflow update and do not overload public RPC',async()=>{
 const {readFile}=await import('node:fs/promises');
 const yaml=await readFile(new URL('../.github/workflows/rhea-sharded-index.yml',import.meta.url),'utf8');
 assert.ok(yaml.includes('  push:\n    branches: [main]'));
 assert.equal(yaml.split("github.event_name == 'workflow_dispatch' || github.event_name == 'push'").length-1,2);
 assert.ok(yaml.includes('max-parallel: 2'));
 assert.ok(yaml.includes("RHEA_DETAIL_CONCURRENCY: '2'"));
});

test('96 shard boundaries cover every original NEAR account index exactly once',()=>{
 const total=72768,count=96;let next=0;
 for(let i=0;i<count;i++){const r=shardRange(total,i,count);assert.equal(r.startIndex,next);
  assert.ok(r.maxAccounts>0&&r.maxAccounts<=758);next+=r.maxAccounts;}
 assert.equal(next,total);assert.throws(()=>shardRange(total,0,129),/INVALID/);
});
test('96-way shard merger never accepts a forged cross-shard borrower',()=>{
 const parts=Array.from({length:96},(_,i)=>shard(960,i,96));
 parts[7].findings.push({accountId:parts[7].seenAccountIds[0],classification:'DEBT_SHARES_DISCOVERED_UNVALUED',
  positions:[{positionId:'7',debtAssetIds:[D],collateralRecorded:true}]});
 const a=mergeDebtShards(parts,96);assert.equal(a.scannedAccounts,960);assert.equal(a.debtAccounts,1);
 assert.throws(()=>mergeDebtShards(parts.slice(0,-1),96),/MISSING/);
 const bad=parts.map(p=>({...p,findings:[...p.findings]}));
 bad[8].findings.push({accountId:parts[7].seenAccountIds[0],classification:'DEBT_SHARES_DISCOVERED_UNVALUED',
  positions:[{positionId:'8',debtAssetIds:[D],collateralRecorded:true}]});
 assert.throws(()=>mergeDebtShards(bad,96),/INVALID_SHARD_FINDING/);
});
test('index workflow and health workflow both require 96 micro-shards',async()=>{
 const {readFile}=await import('node:fs/promises');
 const scan=await readFile(new URL('../.github/workflows/rhea-sharded-index.yml',import.meta.url),'utf8');
 const health=await readFile(new URL('../.github/workflows/rhea-sharded-health.yml',import.meta.url),'utf8');
 assert.ok(scan.includes("ids=$(jq -nc '[range(0;96)]')"));
 assert.ok(scan.includes('fromJson(needs.preflight.outputs.ids)'));
 assert.ok(scan.includes('TOTAL * SHARD / 96'));
 assert.ok(scan.includes('RHEA_BACKFILL_CHECKPOINT_PATH: shard-'));
 assert.ok(scan.includes("RHEA_SHARD_COUNT: '96'"));
 assert.ok(health.includes("RHEA_SHARD_COUNT: '96'"));
});

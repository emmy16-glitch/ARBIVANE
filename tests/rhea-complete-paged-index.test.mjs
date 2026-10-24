import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyCompletePagedIndex} from '../src/rhea/complete-paged-index.ts';
const HASH='2'.repeat(43),TOTAL=40,BLOCK='221435080';
const setting={blockHeight:BLOCK,lendingCodeHash:HASH,totalAccounts:TOTAL,shardCount:4};
const shard=(i)=>{
 const start=TOTAL*i/4,end=TOTAL*(i+1)/4;
 const ids=Array.from({length:end-start},(_,n)=>`test${start+n}.near`);
 return {version:1,mode:'NEAR_RHEA_SAME_BLOCK_BACKFILL',chain:'NEAR_MAINNET',
  executionEnabled:false,liquidationParityVerified:false,sourceView:'get_accounts_all_positions_paged',
  lendingContract:'contract.main.burrow.near',blockHeight:BLOCK,lendingCodeHash:HASH,codeHashPinProvided:true,
  totalAccounts:TOTAL,startIndex:start,targetEndIndex:end,nextIndex:end,scannedAccounts:end-start,invalidAccounts:0,
  schemaReasons:{},seenAccountIds:ids,completeSnapshot:false,borrowedPoolBalancePositive:true,
  findings:[{accountId:ids[0],classification:'DEBT_SHARES_DISCOVERED_UNVALUED',
   positions:[{positionId:'REGULAR',debtAssetIds:['wrap.near'],collateralRecorded:true}]}]};
};
test('four 100%-complete shards become exactly one whole read-only market index',()=>{
 const r=verifyCompletePagedIndex([0,1,2,3].map(shard),setting);
 assert.equal(r.completeSnapshot,true);assert.equal(r.scannedAccounts,40);
 assert.equal(r.debtAccounts,4);assert.equal(r.debtPositions,4);
 assert.equal(r.executionEnabled,false);assert.equal(r.liquidationEligible,false);
});
test('reject missing, duplicate and cross-block shards',()=>{
 const base=[0,1,2,3].map(shard);
 for(const altered of [
  [base[0],base[1],base[2]],
  [base[0],base[0],base[2],base[3]],
  base.map((v,i)=>i===2?{...v,blockHeight:'221435081'}:v),
  base.map((v,i)=>i===1?{...v,invalidAccounts:1}:v),
  base.map((v,i)=>i===3?{...v,nextIndex:v.nextIndex-1}:v),
  base.map((v,i)=>i===3?{...v,seenAccountIds:[base[0].seenAccountIds[0],...v.seenAccountIds.slice(1)]}:v),
  base.map((v,i)=>i===2?{...v,sourceView:'get_accounts_paged'}:v),
 ]){
  assert.throws(()=>verifyCompletePagedIndex(altered,setting));
 }
});
test('positive on-chain lending debt but zero indexed borrower debt fails closed',()=>{
 const rows=[0,1,2,3].map(i=>({...shard(i),findings:[]}));
 assert.throws(()=>verifyCompletePagedIndex(rows,setting),/MARKET_DEBT_EXISTS/);
});
test('reject wrong finding provenance and fictional trade authorization',()=>{
 const rows=[0,1,2,3].map(shard);
 rows[0].findings[0].accountId='not-in-index.near';
 assert.throws(()=>verifyCompletePagedIndex(rows,setting),/INVALID_DEBT_FINDING/);
 const rows2=[0,1,2,3].map(shard);rows2[1].executionEnabled=true;
 assert.throws(()=>verifyCompletePagedIndex(rows2,setting));
});
test('full-run workflow launches on main only and has checkpoint plus aggregate artifact',async()=>{
 const {readFile}=await import('node:fs/promises');
 const w=await readFile(new URL('../.github/workflows/rhea-stage30-full-paged-scan.yml',import.meta.url),'utf8');
 assert.ok(w.includes('branches: [main]'));
 assert.ok(w.includes('RHEA_SCAN_PAGE_SIZE'));
 assert.ok(w.includes('RHEA_CHECKPOINT_EVERY_BATCHES'));
 assert.ok(w.includes('rhea-full-paged-verified-market'));
 assert.ok(w.includes('node --experimental-strip-types src/rhea/market-shard-snapshot-cli.ts > snapshot.json'));
 assert.ok(w.includes('node --experimental-strip-types src/rhea/paged-position-index-cli.ts | tee summary-'));
 assert.ok(!w.includes('npm run probe:rhea:shard-snapshot > snapshot.json'));
 assert.ok(!w.includes('npm run probe:rhea:paged-position-index | tee summary-'));
 assert.ok(!w.includes('broadcast_tx'));
 assert.ok(!w.includes('EXECUTION_ENABLED: \'true\''));
});

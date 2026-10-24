import test from 'node:test';
import assert from 'node:assert/strict';
import {validateObservedDetailedShard} from '../src/rhea/observed-shard-evidence.ts';
import {shardRange} from '../src/rhea/market-shards.ts';
const HASH='2'.repeat(43),CONTRACT='contract.main.burrow.near';
function fixture(id=7,count=96,scanned=5){
 const {startIndex,maxAccounts}=shardRange(72768,id,count);
 const seenAccountIds=Array.from({length:scanned},(_,i)=>`account${startIndex+i}.near`);
 return {version:1,mode:'NEAR_RHEA_SAME_BLOCK_BACKFILL',chain:'NEAR_MAINNET',executionEnabled:false,
 liquidationParityVerified:false,lendingContract:CONTRACT,blockHeight:'221366859',lendingCodeHash:HASH,
 codeHashPinProvided:true,totalAccounts:72768,startIndex,targetEndIndex:startIndex+maxAccounts,
 nextIndex:startIndex+scanned,scannedAccounts:scanned,invalidAccounts:0,schemaReasons:{},seenAccountIds,
 findings:scanned?[{accountId:seenAccountIds[0],classification:'DEBT_SHARES_DISCOVERED_UNVALUED',
 positions:[{positionId:'isolated',debtAssetIds:['usn'],collateralRecorded:true}]}]:[],
 completeSnapshot:false,borrowedPoolBalancePositive:true,sourceView:'get_account_all_positions'};
}
test('observed borrower shard remains partial even if entire one shard scanned',()=>{
 const f=fixture(7,96,5);const {evidence}=validateObservedDetailedShard(f,7,96);
 assert.equal(evidence.observedDebtAccounts,1);assert.equal(evidence.scannedAccounts,5);
 assert.equal(evidence.scannedFromIndex,f.startIndex);assert.equal(evidence.scannedEndIndex,f.nextIndex);
 assert.equal(evidence.unscannedAccountsInShard,f.targetEndIndex-f.nextIndex);
 assert.equal(evidence.borrowerCountIsMarketTotal,false);
 assert.equal(evidence.executionEnabled,false);
 const all=fixture(7,96,758);const out=validateObservedDetailedShard(all,7,96);
 assert.equal(out.evidence.unscannedAccountsInShard,0);
 assert.equal(out.evidence.status,'PARTIAL_COVERAGE_UNAPPROVED');
});
test('rejects wrong assigned shard, count, or tampered progress',()=>{
 const f=fixture();assert.throws(()=>validateObservedDetailedShard(f,8,96),/SHARD_RANGE/);
 assert.throws(()=>validateObservedDetailedShard(f,7,12),/SHARD_RANGE/);
 assert.throws(()=>validateObservedDetailedShard({...f,nextIndex:f.nextIndex+1},7,96),/INVALID_CHECKPOINT/);
 assert.throws(()=>validateObservedDetailedShard(f,-1,96),/INVALID_SHARD/);
 assert.throws(()=>validateObservedDetailedShard(f,7,129),/INVALID_SHARD/);
});
test('rejects paged-only debt sources, schema errors, and forged lender identity',()=>{
 const f=fixture();assert.throws(()=>validateObservedDetailedShard({...f,sourceView:undefined},7,96),/INVALID_CHECKPOINT/);
 assert.throws(()=>validateObservedDetailedShard({...f,codeHashPinProvided:false},7,96),/INVALID_CHECKPOINT|UNTRUSTED/);
 assert.throws(()=>validateObservedDetailedShard({...f,invalidAccounts:1,schemaReasons:{INVALID_SHARES:1}},7,96),/INVALID_CHECKPOINT/);
 assert.throws(()=>validateObservedDetailedShard({...f,seenAccountIds:[...f.seenAccountIds.slice(0,4),f.seenAccountIds[0]]},7,96),/CHECKPOINT_ACCOUNT/);
});
test('rejects unindexed invented borrowers and erroneous full market proof',()=>{
 const f=fixture();const p={...f,findings:[{...f.findings[0],accountId:'forged.near'}]};
 assert.throws(()=>validateObservedDetailedShard(p,7,96),/INVALID_CHECKPOINT_FINDING/);
 assert.throws(()=>validateObservedDetailedShard({...f,completeSnapshot:true},7,96),/INVALID_CHECKPOINT/);
});
test('empty observations do not imply a debt-free market',()=>{
 const f=fixture(20,96,0);const o=validateObservedDetailedShard(f,20,96);
 assert.equal(o.evidence.observedDebtAccounts,0);
 assert.equal(o.evidence.borrowerCountIsMarketTotal,false);
 assert.equal(o.evidence.unscannedAccountsInShard,f.targetEndIndex-f.startIndex);
});

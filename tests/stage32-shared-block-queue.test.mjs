import test from 'node:test';
import assert from 'node:assert/strict';
import {refreshIndexedBorrowerCandidates} from '../src/rhea/active-pyth-debt-queue.ts';

const lendingHash='6Nek1MZ8cwJJ2xMQAUWup9V5AToYS9rkTxJfwo6BCpFa';
const oracleHash='9vafnXzrPYQ4ErDqt2triRkQJHdxtG7tfkyb24t5Ttrg';
function source(){
  return {
    mode:'RHEA_COMPLETE_PAGED_INDEX_ATTESTATION',chain:'NEAR_MAINNET',
    status:'COMPLETE_DEBT_INDEX_READ_ONLY',blockHeight:'221433256',
    lendingCodeHash:lendingHash,totalAccounts:1,scannedAccounts:1,
    debtAccounts:1,debtPositions:1,shardCount:1,
    zeroSchemaErrors:true,completeSnapshot:true,
    findings:[{accountId:'borrower.near',classification:'DEBT_SHARES_DISCOVERED_UNVALUED',
      positions:[{positionId:'Regular',debtAssetIds:['wrap.near'],collateralRecorded:true}]}],
    executionEnabled:false,liquidationEligible:false,profitabilityVerified:false,warnings:[]
  };
}
function options(pin){
  return {fromFinding:0,maxFindings:1,concurrency:1,
    lendingContract:'contract.main.burrow.near',pythOracle:'aggregate-oracle.near',
    expectedLendingCodeHash:lendingHash,expectedPythOracleCodeHash:oracleHash,
    maxConfidenceBps:150,sanityMaxUsd:'10000000',...(pin===undefined?{}:{pinnedBlockHeight:pin})};
}
function priced(blockHeight='221433300'){
  return {
    mode:'RHEA_ACTIVE_EXECUTE_WITH_PYTH_VALUATION',chain:'NEAR_MAINNET',
    status:'ACTIVE_PYTH_VALUE_RECONCILED_UNAPPROVED',
    blockHeight,borrowerAccountId:'borrower.near',
    executionEnabled:false,maySign:false,mayBroadcast:false,
    sourceWasmReproduciblyMatched:false,transactionReplayVerified:false,
    profitVerified:false,priceConstructionMatchesCurrentSdk:true,
    deployedMetadataAndConfigObserved:true,candidatePositions:1,
    positions:[{positionId:'Regular',status:'PAPER_HEALTHY_UNAPPROVED',
      healthFactorBps:'12500',legs:[{role:'borrowed',tokenId:'wrap.near'}]}]
  };
}
test('Stage 32 accepts one explicitly pinned block and never claims trade eligibility',async()=>{
  const r=await refreshIndexedBorrowerCandidates({},source(),options(221433300),async()=>priced());
  assert.equal(r.pricingBlockHeight,'221433300');
  assert.equal(r.items[0].classification,'PAPER_HEALTHY_UNAPPROVED');
  assert.equal(r.items[0].freshBlockHeight,'221433300');
  assert.equal(r.blocked,0);
  assert.equal(r.maySign,false);
  assert.equal(r.mayBroadcast,false);
  assert.equal(r.profitVerified,false);
  assert.equal(r.currentLiquidationEligibilityProven,false);
  assert.ok(r.warnings.includes('REPRICED_POSITIONS_USE_ONE_SHARED_FINALIZED_BLOCK'));
});
test('Stage 32 rejects cross-block borrower evidence without claiming a result',async()=>{
  const r=await refreshIndexedBorrowerCandidates({},source(),options(221433300),
    async()=>priced('221433301'));
  assert.equal(r.status,'REPRICE_BATCH_INCOMPLETE');
  assert.equal(r.paperHealthy,0);
  assert.equal(r.paperAtRisk,0);
  assert.equal(r.blocked,1);
  assert.equal(r.items[0].classification,'BLOCKED_RPC');
  assert.equal(r.items[0].reason,'CROSS_BLOCK_REPRICE');
  assert.equal(r.items[0].freshBlockHeight,null);
});
test('Stage 32 rejects invalid pinned heights before any RPC',async()=>{
  await assert.rejects(()=>refreshIndexedBorrowerCandidates({},source(),options(-1),
    async()=>{throw Error('SHOULD_NOT_RUN');}),/INVALID_STAGE31_REPRICE_QUEUE_OPTIONS/);
});
test('Legacy unpinned read-only queue remains explicitly identified as non-coherent',async()=>{
  const r=await refreshIndexedBorrowerCandidates({},source(),options(),async()=>priced());
  assert.equal(r.pricingBlockHeight,null);
  assert.ok(r.warnings.includes('REPRICED_POSITIONS_USE_INDEPENDENT_RECENT_FINALIZED_BLOCKS'));
});

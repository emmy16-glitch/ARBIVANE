import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyStage33Failure,selectStage33ProbeTargets,diagnoseStage32BlockedAndRisk} from '../src/rhea/stage33-diagnostics.ts';
const HASH='2'.repeat(43),ORACLE='3'.repeat(43),total=332;
const F=i=>({accountId:'borrower'+i+'.near',classification:'DEBT_SHARES_DISCOVERED_UNVALUED',
 positions:[{positionId:'REGULAR',debtAssetIds:['wrap.near'],collateralRecorded:true}]});
const source=()=>({mode:'RHEA_COMPLETE_PAGED_INDEX_ATTESTATION',
 status:'COMPLETE_DEBT_INDEX_READ_ONLY',chain:'NEAR_MAINNET',
 blockHeight:'221436207',lendingCodeHash:HASH,
 totalAccounts:72782,scannedAccounts:72782,debtAccounts:total,debtPositions:total,
 shardCount:4,zeroSchemaErrors:true,completeSnapshot:true,findings:Array.from({length:total},(_,i)=>F(i)),
 executionEnabled:false,liquidationEligible:false,profitabilityVerified:false});
const opts={baseCursor:12,maxBlockedPerShard:3,maxCandidates:16,concurrency:2,
 lendingContract:'contract.main.burrow.near',pythOracle:'aggregate-oracle.near',
 expectedLendingCodeHash:HASH,expectedPythOracleCodeHash:ORACLE,
 maxConfidenceBps:150,sanityMaxUsd:'10000000'};
function shard(i){
 const start=12+i*80;
 const items=Array.from({length:80},(_,n)=>{
  const risk=i===1&&n===10,blocked=n<4;
  return {borrowerAccountId:'borrower'+(start+n)+'.near',
   sourcePositionIds:['REGULAR'],classification:risk?'PAPER_AT_RISK_UNAPPROVED':blocked?'BLOCKED_RPC':'PAPER_HEALTHY_UNAPPROVED',
   freshBlockHeight:blocked?null:'221437012',
   freshHealthBps:blocked?null:risk?'8908':'12222',
   paperAtRiskPositions:risk?1:0,paperHealthyPositions:risk||blocked?0:1,
   reason:blocked?'RPC_OR_ORACLE_READ_FAILED':null,
   executionEligible:false,tradeProfitVerified:false};
 });
 return {version:1,mode:'RHEA_STAGE32_RESUMABLE_PYTH_REPRICE_SWEEP',chain:'NEAR_MAINNET',
  sourceBlockHeight:'221436207',sourceCodeHash:HASH,sourceTotalAccounts:72782,sourceDebtAccounts:total,
  startFinding:start,targetEndFinding:start+80,nextFinding:start+80,processed:80,
  paperAtRisk:items.filter(x=>x.classification==='PAPER_AT_RISK_UNAPPROVED').length,
  paperHealthy:items.filter(x=>x.classification==='PAPER_HEALTHY_UNAPPROVED').length,
  noDebtNow:0,blocked:items.filter(x=>x.classification==='BLOCKED_RPC').length,
  items,executionEnabled:false,maySign:false,mayBroadcast:false,
  liquidationEligibilityVerified:false,profitVerified:false};
}
const shards=()=>[0,1,2,3].map(shard);
const P=(id,risk=false)=>({
 mode:'RHEA_ACTIVE_EXECUTE_WITH_PYTH_VALUATION',chain:'NEAR_MAINNET',
 borrowerAccountId:id,blockHeight:'221438700',status:'ACTIVE_PYTH_VALUE_RECONCILED_UNAPPROVED',
 positions:[{positionId:'REGULAR',status:risk?'PAPER_AT_RISK_UNAPPROVED':'PAPER_HEALTHY_UNAPPROVED',healthFactorBps:risk?'8800':'12900'}],
 executionEnabled:false,maySign:false,mayBroadcast:false,profitVerified:false,transactionReplayVerified:false,
 sourceWasmReproduciblyMatched:false,priceConstructionMatchesCurrentSdk:true,
});
test('selects prior paper-risk before 12 diagnostic samples, no fake opportunities',()=>{
 const t=selectStage33ProbeTargets(source(),shards(),opts);
 assert.equal(t.length,13);
 assert.deepEqual(t[0],{index:102,accountId:'borrower102.near',origin:'PAPER_RISK',oldHealthBps:'8908'});
 assert.equal(new Set(t.map(x=>x.accountId)).size,13);
 assert.equal(t.filter(x=>x.origin==='PREVIOUSLY_BLOCKED').length,12);
});
test('reprices prior risk, isolates stale oracle prices and keeps zero execution authority',async()=>{
 const result=await diagnoseStage32BlockedAndRisk({},source(),shards(),opts,async id=>{
  if(id==='borrower102.near')return P(id,true);
  throw Error('STALE_OR_FUTURE_PYTH_PRICE internal url secret');
 });
 assert.equal(result.probed,13);assert.equal(result.paperAtRiskNow,1);assert.equal(result.blockedNow,12);
 assert.equal(result.reasonCounts.PYTH_PRICE_STALE_OR_UNCERTAIN,12);
 assert.equal(result.observations[0].freshHealthBps,'8800');
 assert.equal(result.observations[0].executionEligible,false);assert.equal(result.maySign,false);
 assert.equal(result.sandboxReplayVerified,false);
 assert.equal(JSON.stringify(result).includes('internal url secret'),false);
});
test('fail closed on fake Stage32 source and partial windows before touching RPC',async()=>{
 for(const candidate of [
  shards().map((s,i)=>i===0?{...s,processed:79}:s),
  shards().map((s,i)=>i===1?{...s,nextFinding:s.nextFinding-1}:s),
  shards().map((s,i)=>i===3?{...s,maySign:true}:s),
  shards().map((s,i)=>i===2?{...s,sourceCodeHash:ORACLE}:s),
  shards().slice(0,3),
 ]){
  await assert.rejects(()=>diagnoseStage32BlockedAndRisk({},source(),candidate,opts,
   async()=>{throw Error('UNEXPECTED_NETWORK_ACCESS');}));
 }
});
test('classifies root cause instead of hiding all failures as RPC',()=>{
 assert.equal(classifyStage33Failure(new Error('NEAR RPC HTTP 429')),'HTTP_RATE_LIMIT_OR_TIMEOUT');
 assert.equal(classifyStage33Failure(new Error('PYTH_CONFIDENCE_TOO_WIDE')),'PYTH_PRICE_STALE_OR_UNCERTAIN');
 assert.equal(classifyStage33Failure(new Error('MISSING_EXECUTION_PRICE_SOURCE')),'PYTH_FEED_OR_ASSET_METADATA');
 assert.equal(classifyStage33Failure(new Error('INVALID_EXTRA_CALL_RATIO')),'DERIVED_ASSET_RATIO_UNAVAILABLE');
 assert.equal(classifyStage33Failure(new Error('ACTIVE_PYTH_CODE_DRIFT')),'CONTRACT_CONFIG_OR_CODE_DRIFT');
 assert.equal(classifyStage33Failure(new Error('SOURCE_SHARE_BALANCE_DRIFT')),'POSITION_DATA_OR_REFERENCE_MATH');
 assert.equal(classifyStage33Failure(new Error('confidential endpoint password')),'UNCLASSIFIED_READ_ERROR');
});
test('Stage33 runs on main and never sends transactions',async()=>{
 const {readFile}=await import('node:fs/promises');
 const y=await readFile(new URL('../.github/workflows/rhea-stage33-oracle-failure-diagnostics.yml',import.meta.url),'utf8');
 assert.ok(y.includes('branches: [main]'));assert.ok(y.includes("EXECUTION_ENABLED: 'false'"));
 assert.ok(y.includes('40129110340'));assert.ok(!y.includes('broadcast_tx'));
});

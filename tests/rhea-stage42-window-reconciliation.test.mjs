import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileStage42Window} from '../src/rhea/stage42-window-reconciliation.ts';
const HASH='2'.repeat(43),BASE=972,DEBT=1600;
const source=()=>({
 mode:'RHEA_COMPLETE_PAGED_INDEX_ATTESTATION',chain:'NEAR_MAINNET',
 status:'COMPLETE_DEBT_INDEX_READ_ONLY',blockHeight:'221436207',lendingCodeHash:HASH,
 totalAccounts:72782,scannedAccounts:72782,debtAccounts:DEBT,debtPositions:DEBT,shardCount:4,
 completeSnapshot:true,zeroSchemaErrors:true,executionEnabled:false,
 liquidationEligible:false,profitabilityVerified:false,
 findings:Array.from({length:DEBT},(_,i)=>({accountId:`borrower${i}.near`,
  classification:'DEBT_SHARES_DISCOVERED_UNVALUED',positions:[{positionId:'REGULAR',
   debtAssetIds:['wrap.near'],collateralRecorded:true}]})),
});
const cp=(shard)=>{
 const start=BASE+shard*80;
 const items=Array.from({length:80},(_,i)=>({
  borrowerAccountId:`borrower${start+i}.near`,sourcePositionIds:['REGULAR'],
  classification:i===3?'PAPER_AT_RISK_UNAPPROVED':i===7?'BLOCKED_RPC':'PAPER_HEALTHY_UNAPPROVED',
  executionEligible:false,tradeProfitVerified:false,
 }));
 return {mode:'RHEA_STAGE32_RESUMABLE_PYTH_REPRICE_SWEEP',version:1,chain:'NEAR_MAINNET',
  sourceBlockHeight:'221436207',sourceCodeHash:HASH,
  sourceTotalAccounts:72782,sourceDebtAccounts:DEBT,
  startFinding:start,targetEndFinding:start+80,nextFinding:start+80,
  processed:80,paperAtRisk:1,paperHealthy:78,noDebtNow:0,blocked:1,
  items,executionEnabled:false,maySign:false,mayBroadcast:false,
  liquidationEligibilityVerified:false,profitVerified:false};
};
const q=(shard)=>{
 const start=BASE+shard*80;
 return {
  mode:'RHEA_STAGE38_LIVE_CANDIDATE_TO_SANDBOX',chain:'NEAR_MAINNET',
  status:'NO_EXECUTABLE_SOURCE_REFERENCE',sourceBlockHeight:'221436207',sourceDebtAccounts:DEBT,
  startFinding:start,nextFinding:start+80,reviewed:80,paperAtRiskFromPreviousScan:1,
  refreshed:1,positiveSourcePlans:0,failedFreshReads:1,
  rows:[{borrowerAccountId:`borrower${start+3}.near`,historicalFindingIndex:start+3,
   status:'BLOCKED_FRESH_READ',observationBlockHeight:null,reasonCode:'RPC_RATE_LIMIT',
   referenceInitialHealthBps:null,paperGrossUsdE27:null,
   executionEligible:false,netProfitVerified:false}],
  bestProposal:null,sandboxPlanReady:false,noEligibleMainnetTrades:true,
  mainnetExecutionEnabled:false,maySignMainnet:false,mayBroadcastMainnet:false,
  sandboxReplaySucceeded:false,liquidationRuleParityVerified:false,
  netProfitVerified:false,walletApproved:false,warnings:[],
 };
};
const shards=()=>Array.from({length:4},(_,shard)=>({shard,checkpoint:cp(shard),qualification:q(shard)}));
test('exactly 320 authentic historical borrower findings are reconciled, with blocked reads preserved',()=>{
 const r=reconcileStage42Window(source(),shards(),BASE);
 assert.equal(r.accountsVisited,320);assert.equal(r.shardsReconciled,4);
 assert.equal(r.baseCursor,972);assert.equal(r.endCursor,1292);
 assert.equal(r.status,'WINDOW_RECONCILED_WITH_BLOCKED_READS');
 assert.equal(r.paperAtRisk,4);assert.equal(r.blockedInitialReads,4);
 assert.equal(r.failedRiskRefreshes,4);assert.equal(r.allCurrentHealthVerified,false);
 assert.equal(r.positiveNetProfitVerified,false);assert.equal(r.mayBroadcastMainnet,false);
});
test('zero blocked observations never imply complete current-market health or profit',()=>{
 const xs=shards();
 for(const s of xs){
  s.checkpoint.items[7].classification='PAPER_HEALTHY_UNAPPROVED';
  s.checkpoint.blocked=0;s.checkpoint.paperHealthy=79;
  s.qualification.rows[0].status='NO_CURRENT_SOURCE_SCENARIO';
  s.qualification.failedFreshReads=0;
 }
 const r=reconcileStage42Window(source(),xs,BASE);
 assert.equal(r.status,'WINDOW_RECONCILED_NO_BLOCKED_READS');
 assert.equal(r.allCurrentHealthVerified,false);assert.equal(r.liquidationEligibilityVerified,false);
});
test('missing, duplicated, misordered and incomplete shards are rejected',()=>{
 for(const change of [
  x=>x.pop(),x=>x[3].shard=2,x=>x[0].checkpoint.nextFinding--,
  x=>x[2].checkpoint.startFinding++,x=>x[3].checkpoint.items.pop(),
 ]){
  const xs=shards();change(xs);
  assert.throws(()=>reconcileStage42Window(source(),xs,BASE));
 }
});
test('forged borrower identities, changed position IDs, money flags and counts are rejected',()=>{
 for(const change of [
  x=>x[1].checkpoint.items[0].borrowerAccountId='fake.near',
  x=>x[1].checkpoint.items[0].sourcePositionIds=['FAKE'],
  x=>x[1].checkpoint.paperHealthy=77,
  x=>x[1].checkpoint.items[0].executionEligible=true,
  x=>x[1].checkpoint.maySign=true,
 ]){
  const xs=shards();change(xs);
  assert.throws(()=>reconcileStage42Window(source(),xs,BASE));
 }
});
test('risk qualification must match exact live risk accounts, order, blocked counts and sign restrictions',()=>{
 for(const change of [
  x=>x[1].qualification.rows[0].borrowerAccountId='other.near',
  x=>x[1].qualification.rows[0].historicalFindingIndex++,
  x=>x[1].qualification.rows[0].executionEligible=true,
  x=>x[1].qualification.refreshed=0,
  x=>x[1].qualification.failedFreshReads=0,
  x=>x[1].qualification.status='BLOCKED_CANDIDATE_LIMIT',
  x=>x[1].qualification.sandboxPlanReady=true,
  x=>x[1].qualification.mayBroadcastMainnet=true,
 ]){
  const xs=shards();change(xs);
  assert.throws(()=>reconcileStage42Window(source(),xs,BASE));
 }
});
test('reject incomplete source and out-of-bounds cursor',()=>{
 for(const change of [
  x=>x.completeSnapshot=false,x=>x.zeroSchemaErrors=false,
  x=>x.scannedAccounts--,x=>x.liquidationEligible=true,
 ]){
  const s=source();change(s);
  assert.throws(()=>reconcileStage42Window(s,shards(),BASE));
 }
 assert.throws(()=>reconcileStage42Window(source(),shards(),1300));
});
test('workflow preserves provenance, reconciliation, Sandbox-only executor, disabled mainnet signing',async()=>{
 const {readFile}=await import('node:fs/promises');
 const workflow=await readFile(new URL('../.github/workflows/rhea-stage42-reconciled-continuation.yml',import.meta.url),'utf8');
 assert.ok(workflow.includes('reconcile:'));
 assert.ok(workflow.includes('stage42-window-reconciliation-cli.ts'));
 assert.ok(workflow.includes("run-id: '40128285853'"));
 assert.ok(workflow.includes('NEAR_WORKSPACES_NETWORK=sandbox'));
 assert.ok(workflow.includes("EXECUTION_ENABLED: 'false'"));
 assert.ok(!workflow.includes('broadcast_tx'));
});

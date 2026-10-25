import test from 'node:test';
import assert from 'node:assert/strict';
import {NearRpcHttpError} from '../src/rhea/rpc.ts';
import {reconcileStage42Window} from '../src/rhea/stage42-window-reconciliation.ts';
import {selectStage43BlockedTargets,recoverStage43Blocked} from '../src/rhea/stage43-blocked-evidence-recovery.ts';

const HASH='2'.repeat(43),ORACLE='3'.repeat(43),BASE=972,DEBT=1600;
const source=()=>({
 mode:'RHEA_COMPLETE_PAGED_INDEX_ATTESTATION',chain:'NEAR_MAINNET',
 status:'COMPLETE_DEBT_INDEX_READ_ONLY',blockHeight:'221436207',lendingCodeHash:HASH,
 totalAccounts:72782,scannedAccounts:72782,debtAccounts:DEBT,debtPositions:DEBT,
 shardCount:4,completeSnapshot:true,zeroSchemaErrors:true,executionEnabled:false,
 liquidationEligible:false,profitabilityVerified:false,
 findings:Array.from({length:DEBT},(_,i)=>({accountId:`borrower${i}.near`,
  classification:'DEBT_SHARES_DISCOVERED_UNVALUED',positions:[{positionId:'REGULAR',
   debtAssetIds:['wrap.near'],collateralRecorded:true}]})),
});
function shard(i){
 const start=BASE+i*80;
 const items=Array.from({length:80},(_,n)=>({
  borrowerAccountId:`borrower${start+n}.near`,sourcePositionIds:['REGULAR'],
  classification:n===3?'PAPER_AT_RISK_UNAPPROVED':n===7?'BLOCKED_RPC':'PAPER_HEALTHY_UNAPPROVED',
  executionEligible:false,tradeProfitVerified:false,
 }));
 const checkpoint={version:1,mode:'RHEA_STAGE32_RESUMABLE_PYTH_REPRICE_SWEEP',
  chain:'NEAR_MAINNET',sourceBlockHeight:'221436207',sourceCodeHash:HASH,
  sourceTotalAccounts:72782,sourceDebtAccounts:DEBT,
  startFinding:start,targetEndFinding:start+80,nextFinding:start+80,processed:80,
  paperAtRisk:1,paperHealthy:78,noDebtNow:0,blocked:1,items,
  executionEnabled:false,maySign:false,mayBroadcast:false,
  liquidationEligibilityVerified:false,profitVerified:false};
 const qualification={mode:'RHEA_STAGE38_LIVE_CANDIDATE_TO_SANDBOX',chain:'NEAR_MAINNET',
  status:'NO_EXECUTABLE_SOURCE_REFERENCE',sourceBlockHeight:'221436207',
  sourceDebtAccounts:DEBT,startFinding:start,nextFinding:start+80,reviewed:80,
  paperAtRiskFromPreviousScan:1,refreshed:1,positiveSourcePlans:0,failedFreshReads:1,
  rows:[{borrowerAccountId:`borrower${start+3}.near`,historicalFindingIndex:start+3,
   status:'BLOCKED_FRESH_READ',observationBlockHeight:null,reasonCode:'HTTP_RATE_LIMIT_OR_TIMEOUT',
   referenceInitialHealthBps:null,paperGrossUsdE27:null,
   executionEligible:false,netProfitVerified:false}],
  bestProposal:null,sandboxPlanReady:false,noEligibleMainnetTrades:true,
  mainnetExecutionEnabled:false,maySignMainnet:false,mayBroadcastMainnet:false,
  sandboxReplaySucceeded:false,liquidationRuleParityVerified:false,
  netProfitVerified:false,walletApproved:false};
 return {shard:i,checkpoint,qualification};
}
const shards=()=>Array.from({length:4},(_,i)=>shard(i));
const opts={baseCursor:BASE,maxTargets:320,maxRetries:1,maxRetryDelayMs:30000,
 betweenAccountsMs:0,maxRiskCandidates:12,concurrency:1,
 lendingContract:'contract.main.burrow.near',pythOracle:'aggregate-oracle.near',
 expectedLendingCodeHash:HASH,expectedPythOracleCodeHash:ORACLE,
 maxConfidenceBps:150,sanityMaxUsd:'10000000',
 minimumPaperGrossUsdE27:'1000000000000000000000000'};
const price=(id)=>({
 mode:'RHEA_ACTIVE_EXECUTE_WITH_PYTH_VALUATION',chain:'NEAR_MAINNET',
 status:'ACTIVE_PYTH_VALUE_RECONCILED_UNAPPROVED',borrowerAccountId:id,
 blockHeight:'221456789',lendingCodeHash:HASH,pythOracleCodeHash:ORACLE,
 executionEnabled:false,maySign:false,mayBroadcast:false,profitVerified:false,
 transactionReplayVerified:false,sourceWasmReproduciblyMatched:false,
 priceConstructionMatchesCurrentSdk:true,deployedMetadataAndConfigObserved:true,
 pythEnabled:true,legacyOracleEnabled:false,candidatePositions:1,
 positions:[{positionId:'REGULAR',reason:null,status:'PAPER_HEALTHY_UNAPPROVED',
  adjustedCollateralE27:'12000',adjustedDebtE27:'10000',healthFactorBps:'12000',
  legs:[{role:'borrowed',tokenId:'wrap.near'}]}],
});
const plan=(id)=>({
 mode:'RHEA_STAGE35_PINNED_SOURCE_ONLY_LIQUIDATION_SIZING',
 chain:'NEAR_MAINNET',status:'NO_SAFE_SOURCE_SCENARIO',
 borrowerAccountId:id,blockHeight:'221456790',
 lendingCodeHash:HASH,pythOracleCodeHash:ORACLE,
 referenceRulesPass:false,repay:null,seize:null,paperGrossUsdE27:null,
 referenceInitialHealthBps:null,contractRouteParityVerified:false,
 rawTokenDenominationsVerified:false,sandboxStateReplaySucceeded:false,
 gasAndSwapNetProfitVerified:false,walletCapitalVerified:false,
 mainnetWalletApproved:false,executionEnabled:false,maySign:false,mayBroadcast:false,
});
test('select exact blocked Stage42 initial and risk refreshes, not healthy accounts',()=>{
 const s=source(),x=shards(),att=reconcileStage42Window(s,x,BASE);
 const targets=selectStage43BlockedTargets(s,x,att,BASE,320);
 assert.deepEqual(targets.map(t=>t.findingIndex),
  [975,979,1055,1059,1135,1139,1215,1219]);
 assert.equal(targets.filter(x=>x.origin==='BLOCKED_INITIAL_PRICE').length,4);
 assert.equal(targets.filter(x=>x.origin==='BLOCKED_RISK_RECHECK').length,4);
});
test('actual blocked borrowers recover with fresh read only and no liquidation claim',async()=>{
 const s=source(),x=shards(),att=reconcileStage42Window(s,x,BASE);
 const got=await recoverStage43Blocked({},s,x,att,opts,
  async id=>price(id),async id=>plan(id),async()=>{});
 assert.equal(got.attemptedFresh,8);
 assert.equal(got.nowHealthy,4);
 assert.equal(got.noSafeSourceScenario,4);
 assert.equal(got.stillBlocked,0);
 assert.equal(got.positiveSourcePlans,0);
 assert.equal(got.sandboxPlanReady,false);
 assert.equal(got.mainnetExecutionEnabled,false);
 assert.equal(got.maySignMainnet,false);
 assert.equal(got.mayBroadcastMainnet,false);
 assert.equal(got.liquidationEligibilityVerified,false);
 assert.equal(got.realNetProfitVerified,false);
});
test('retry transient 429 using bounded backoff, never retry deterministic untrusted pricing',async()=>{
 const s=source(),x=shards(),att=reconcileStage42Window(s,x,BASE);
 const delays=[];let calls=0;
 const got=await recoverStage43Blocked({},s,x,att,opts,async id=>{
  calls++;
  if(id==='borrower979.near'&&calls===2)throw new NearRpcHttpError(429,'1');
  return price(id);
 },async id=>plan(id),async ms=>{delays.push(ms);});
 assert.equal(got.stillBlocked,0);
 assert.equal(got.rows.find(x=>x.findingIndex===979).attempts,2);
 assert.ok(delays.includes(1500));
 const bad=await recoverStage43Blocked({},s,x,att,{...opts,maxRetries:3},
  async id=>({...price(id),mayBroadcast:true}),async id=>plan(id),async()=>{});
 assert.equal(bad.stillBlocked,4);
 assert.equal(bad.rows.find(x=>x.findingIndex===979).attempts,1);
 assert.equal(bad.positiveSourcePlans,0);
});
test('counterfeit Stage42 aggregate, blocked reason, provenance and budget cannot proceed',()=>{
 for(const modifier of [
  ({att})=>{att.blockedInitialReads--;},
  ({shards})=>{shards[1].checkpoint.items[7].borrowerAccountId='forged.near';},
  ({shards})=>{shards[2].qualification.rows[0].maySignMainnet=true;},
  ({shards})=>{shards[0].qualification.rows[0].borrowerAccountId='other.near';},
  ({att})=>{att.maySignMainnet=true;},
 ]){
  const bundle={s:source(),shards:shards()};
  bundle.att=reconcileStage42Window(bundle.s,bundle.shards,BASE);
  modifier(bundle);
  assert.throws(()=>selectStage43BlockedTargets(bundle.s,bundle.shards,bundle.att,BASE,320));
 }
 const s=source(),x=shards(),att=reconcileStage42Window(s,x,BASE);
 assert.throws(()=>selectStage43BlockedTargets(s,x,att,BASE,4),/MORE_BLOCKERS_THAN_RETRY_BUDGET/);
});
test('zero prior blocked borrowers cannot produce guessed opportunity or profit',async()=>{
 const s=source(),xs=shards();
 for(const x of xs){
  x.checkpoint.items[7].classification='PAPER_HEALTHY_UNAPPROVED';
  x.checkpoint.blocked=0;x.checkpoint.paperHealthy=79;
  x.qualification.rows[0].status='NO_CURRENT_SOURCE_SCENARIO';
  x.qualification.failedFreshReads=0;
 }
 const att=reconcileStage42Window(s,xs,BASE);
 const got=await recoverStage43Blocked({},s,xs,att,opts,
  async()=>{throw Error('should not reprice');},async()=>{throw Error('should not size');});
 assert.equal(got.status,'NO_PRIOR_BLOCKERS');
 assert.equal(got.targets,0);
 assert.equal(got.sandboxPlanReady,false);
});
test('a workflow must depend on completed Stage42 and remain read-only on mainnet',async()=>{
 const {readFile}=await import('node:fs/promises');
 const workflow=await readFile(new URL('../.github/workflows/rhea-stage43-blocked-recovery.yml',import.meta.url),'utf8');
 assert.ok(workflow.includes('workflow_run:'));
 assert.ok(workflow.includes("github.event.workflow_run.conclusion == 'success'"));
 assert.ok(workflow.includes('stage43-blocked-evidence-recovery-cli.ts'));
 assert.ok(workflow.includes("EXECUTION_ENABLED: 'false'"));
 assert.ok(workflow.includes('NEAR_WORKSPACES_NETWORK=sandbox'));
 assert.ok(!workflow.includes('broadcast_tx'));
});

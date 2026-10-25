import test from 'node:test';
import assert from 'node:assert/strict';
import {selectStage44RecoveredRisk,preflightStage44RecoveredRisk}
 from '../src/rhea/stage44-recovered-risk-sandbox-preflight.ts';
const HASH='2'.repeat(43),ORACLE='3'.repeat(43);
const source=()=>({
 mode:'RHEA_COMPLETE_PAGED_INDEX_ATTESTATION',chain:'NEAR_MAINNET',
 status:'COMPLETE_DEBT_INDEX_READ_ONLY',blockHeight:'221436207',lendingCodeHash:HASH,
 totalAccounts:72782,scannedAccounts:72782,debtAccounts:1600,debtPositions:1600,
 shardCount:4,completeSnapshot:true,zeroSchemaErrors:true,
 executionEnabled:false,liquidationEligible:false,profitabilityVerified:false,
 findings:Array.from({length:1600},(_,i)=>({
  accountId:`borrower${i}.near`,classification:'DEBT_SHARES_DISCOVERED_UNVALUED',
  positions:[{positionId:'REGULAR',debtAssetIds:['wrap.near'],collateralRecorded:true}],
 })),
});
const original=(index,status,health)=>({
 findingIndex:index,borrowerAccountId:`borrower${index}.near`,
 origin:index===975?'PAPER_RISK_FRESH_SIZING_BLOCKED':'INITIAL_HEALTH_BLOCKED',
 originalReasonCode:'HTTP_RATE_LIMIT_OR_TIMEOUT',status,
 freshBlockHeight:'221600000',healthBps:health,
 reasonCode:null,executionEligible:false,netProfitVerified:false,
});
const previous=()=>({
 mode:'RHEA_STAGE43_RECONCILED_BLOCKED_OBSERVATION_RETRY',chain:'NEAR_MAINNET',
 status:'RETRY_BATCH_COMPLETE_RESEARCH_ONLY',
 originalSourceBlockHeight:'221436207',originalSourceDebtAccounts:1600,
 stage42BaseCursor:972,stage42EndCursor:1292,currentPricingBlockHeight:'221600000',
 targetCount:8,fromTarget:0,nextTarget:2,remainingTargets:6,processed:2,
 stillBlocked:0,paperAtRiskNeedsSizing:1,paperHealthy:1,noDebtNow:0,
 observations:[original(975,'PAPER_AT_RISK_NEEDS_FRESH_SIZING','9000'),
  original(979,'PAPER_HEALTHY_UNAPPROVED','14000')],
 currentMarketCompletelyScreened:false,deployedLiquidationParityVerified:false,
 transactionReplayVerified:false,positiveNetProfitVerified:false,
 executionEnabled:false,maySignMainnet:false,mayBroadcastMainnet:false,
 blockers:[],
});
const options={
 maxCandidates:12,maxRiskCandidates:12,concurrency:1,
 lendingContract:'contract.main.burrow.near',pythOracle:'aggregate-oracle.near',
 expectedLendingCodeHash:HASH,expectedPythOracleCodeHash:ORACLE,
 maxConfidenceBps:150,sanityMaxUsd:'10000000',
 minimumPaperGrossUsdE27:'1000000000000000000000000',
};
const plan=(id,positive=false)=>({
 mode:'RHEA_STAGE35_PINNED_SOURCE_ONLY_LIQUIDATION_SIZING',
 chain:'NEAR_MAINNET',borrowerAccountId:id,blockHeight:'221600001',
 status:positive?'PAPER_SCENARIOS_FOUND_NOT_EXECUTABLE':'NO_SAFE_SOURCE_SCENARIO',
 lendingCodeHash:HASH,pythOracleCodeHash:ORACLE,
 referenceRulesPass:positive,positionId:positive?'REGULAR':null,
 referenceInitialHealthBps:positive?'9000':null,
 paperGrossUsdE27:positive?'2000000000000000000000000':null,
 repay:positive?{tokenId:'wrap.near',amountLendingInternalAtomic:'1000',
  shareToActualTokenAtomicConversionVerified:false,fundsAvailabilityVerified:false}:null,
 seize:positive?{tokenId:'meta-pool.near',amountLendingInternalAtomic:'1100',
  shareToActualTokenAtomicConversionVerified:false,fundsAvailabilityVerified:false}:null,
 contractRouteParityVerified:false,rawTokenDenominationsVerified:false,
 sandboxStateReplaySucceeded:false,gasAndSwapNetProfitVerified:false,
 walletCapitalVerified:false,mainnetWalletApproved:false,
 executionEnabled:false,maySign:false,mayBroadcast:false,
});
test('select only current paper-risk recovery from authentic Stage43 historical identities',()=>{
 assert.deepEqual(selectStage44RecoveredRisk(source(),previous(),12),[
  {borrowerAccountId:'borrower975.near',historicalFindingIndex:975,
   stage43FreshBlockHeight:'221600000'},
 ]);
});
test('fresh source sizing with no valid scenario never reaches Sandbox or mainnet',async()=>{
 const got=await preflightStage44RecoveredRisk({},source(),previous(),options,
  async id=>plan(id));
 assert.equal(got.recoveredPaperRiskTargets,1);
 assert.equal(got.attemptedFreshSizing,1);
 assert.equal(got.noSafeSourceScenario,1);
 assert.equal(got.sourcePositivePlans,0);
 assert.equal(got.sandboxPlanReady,false);
 assert.equal(got.bestProposal,null);
 assert.equal(got.mainnetExecutionEnabled,false);
 assert.equal(got.netProfitVerified,false);
 assert.equal(got.mayBroadcastMainnet,false);
});
test('positive source reference may ONLY produce an isolated Sandbox plan',async()=>{
 const got=await preflightStage44RecoveredRisk({},source(),previous(),options,
  async id=>plan(id,true));
 assert.equal(got.status,'FRESH_REFERENCE_PLANS_SANDBOX_ONLY');
 assert.equal(got.sourcePositivePlans,1);
 assert.equal(got.sandboxPlanReady,true);
 assert.equal(got.bestProposal.borrowerAccountId,'borrower975.near');
 assert.equal(got.liquidationEligibilityVerified,false);
 assert.equal(got.walletApproved,false);
 assert.equal(got.netProfitVerified,false);
 assert.equal(got.maySignMainnet,false);
});
test('reject forged identities, statuses, current blocks and unauthorized flags',()=>{
 for(const change of [
  x=>x.observations[0].borrowerAccountId='fake.near',
  x=>x.observations[0].freshBlockHeight='221599999',
  x=>x.observations[0].healthBps='10000',
  x=>x.observations[0].executionEligible=true,
  x=>x.observations[0].status='PAPER_HEALTHY_UNAPPROVED',
  x=>x.paperAtRiskNeedsSizing=0,
  x=>x.positiveNetProfitVerified=true,
  x=>x.maySignMainnet=true,
  x=>x.nextTarget=3,
 ]){
  const p=previous();change(p);
  assert.throws(()=>selectStage44RecoveredRisk(source(),p,12));
 }
 assert.throws(()=>selectStage44RecoveredRisk(source(),previous(),0));
});
test('bad sizing, older blocks and RPC exceptions remain explicitly blocked',async()=>{
 for(const evaluate of [
  async id=>({...plan(id,true),mayBroadcast:true}),
  async id=>({...plan(id,true),blockHeight:'221599999'}),
  async id=>({...plan(id,true),paperGrossUsdE27:'0'}),
  async()=>{throw Error('NEAR RPC HTTP 429');},
 ]){
  const got=await preflightStage44RecoveredRisk({},source(),previous(),options,evaluate);
  assert.equal(got.blockedFreshSizing,1);
  assert.equal(got.sandboxPlanReady,false);
  assert.equal(got.netProfitVerified,false);
 }
});
test('no recovered risk does not fetch or manufacture a trade',async()=>{
 const p=previous();
 p.observations=[original(979,'PAPER_HEALTHY_UNAPPROVED','14000')];
 p.processed=1;p.nextTarget=1;p.remainingTargets=7;
 p.paperAtRiskNeedsSizing=0;p.paperHealthy=1;
 const got=await preflightStage44RecoveredRisk({},source(),p,options,
  async()=>{throw Error('should not call RPC');});
 assert.equal(got.status,'NO_RECOVERED_PAPER_RISK');
 assert.equal(got.recoveredPaperRiskTargets,0);
 assert.equal(got.sandboxPlanReady,false);
});
test('CI accepts Stage43 artifact from successful main branch only and retains non-trading gate',async()=>{
 const {readFile}=await import('node:fs/promises');
 const s=await readFile(new URL('../.github/workflows/rhea-stage44-recovered-risk-sandbox.yml',import.meta.url),'utf8');
 assert.ok(s.includes('workflow_run:'));
 assert.ok(s.includes("github.event.workflow_run.conclusion == 'success'"));
 assert.ok(s.includes('stage44-recovered-risk-sandbox-preflight-cli.ts'));
 assert.ok(s.includes("EXECUTION_ENABLED: 'false'"));
 assert.ok(s.includes('NEAR_WORKSPACES_NETWORK=sandbox'));
 assert.ok(!s.includes('broadcast_tx'));
});

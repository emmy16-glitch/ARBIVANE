import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileStage42Window} from '../src/rhea/stage42-window-reconciliation.ts';
import {qualifyStage61RecoveredRisk} from '../src/rhea/stage61-recovered-risk-to-sandbox.ts';
import {collectStage43BlockedTargets,retryStage43BlockedObservations}
 from '../src/rhea/stage43-blocked-observation-retry.ts';

const H='2'.repeat(43),O='3'.repeat(43),BASE=972,DEBT=1600,HEIGHT=221500000;
const source=()=>({
 mode:'RHEA_COMPLETE_PAGED_INDEX_ATTESTATION',chain:'NEAR_MAINNET',
 status:'COMPLETE_DEBT_INDEX_READ_ONLY',blockHeight:'221436207',lendingCodeHash:H,
 totalAccounts:72782,scannedAccounts:72782,debtAccounts:DEBT,debtPositions:DEBT,shardCount:4,
 completeSnapshot:true,zeroSchemaErrors:true,executionEnabled:false,
 liquidationEligible:false,profitabilityVerified:false,
 findings:Array.from({length:DEBT},(_,i)=>({
  accountId:`borrower${i}.near`,classification:'DEBT_SHARES_DISCOVERED_UNVALUED',
  positions:[{positionId:'REGULAR',debtAssetIds:['wrap.near'],collateralRecorded:true}],
 })),
});
const checkpoint=shard=>{
 const start=BASE+shard*80;
 const items=Array.from({length:80},(_,i)=>({
  borrowerAccountId:`borrower${start+i}.near`,
  sourcePositionIds:['REGULAR'],
  classification:i===3?'PAPER_AT_RISK_UNAPPROVED':i===7?'BLOCKED_RPC':'PAPER_HEALTHY_UNAPPROVED',
  freshBlockHeight:i===7?null:'221440100',freshHealthBps:i===7?null:(i===3?'9400':'12500'),
  reason:i===7?'RPC_OR_ORACLE_READ_FAILED':null,
  paperAtRiskPositions:i===3?1:0,paperHealthyPositions:i===3||i===7?0:1,
  executionEligible:false,tradeProfitVerified:false,
 }));
 return {
  mode:'RHEA_STAGE32_RESUMABLE_PYTH_REPRICE_SWEEP',version:1,chain:'NEAR_MAINNET',
  sourceBlockHeight:'221436207',sourceCodeHash:H,
  sourceTotalAccounts:72782,sourceDebtAccounts:DEBT,
  startFinding:start,targetEndFinding:start+80,nextFinding:start+80,
  processed:80,paperAtRisk:1,paperHealthy:78,noDebtNow:0,blocked:1,
  items,executionEnabled:false,maySign:false,mayBroadcast:false,
  liquidationEligibilityVerified:false,profitVerified:false,
 };
};
const qualification=shard=>{
 const start=BASE+shard*80;
 return {
  mode:'RHEA_STAGE38_LIVE_CANDIDATE_TO_SANDBOX',chain:'NEAR_MAINNET',
  status:'NO_EXECUTABLE_SOURCE_REFERENCE',sourceBlockHeight:'221436207',
  sourceDebtAccounts:DEBT,startFinding:start,nextFinding:start+80,reviewed:80,
  paperAtRiskFromPreviousScan:1,refreshed:1,positiveSourcePlans:0,failedFreshReads:1,
  rows:[{borrowerAccountId:`borrower${start+3}.near`,historicalFindingIndex:start+3,
   status:'BLOCKED_FRESH_READ',observationBlockHeight:null,
   reasonCode:'HTTP_RATE_LIMIT_OR_TIMEOUT',
   referenceInitialHealthBps:null,paperGrossUsdE27:null,
   executionEligible:false,netProfitVerified:false}],
  bestProposal:null,sandboxPlanReady:false,noEligibleMainnetTrades:true,
  mainnetExecutionEnabled:false,maySignMainnet:false,mayBroadcastMainnet:false,
  sandboxReplaySucceeded:false,liquidationRuleParityVerified:false,
  netProfitVerified:false,walletApproved:false,warnings:[],
 };
};
const shards=()=>Array.from({length:4},(_,shard)=>({
 shard,checkpoint:checkpoint(shard),qualification:qualification(shard),
}));
const opts=(override={})=>({
 fromTarget:0,maxTargets:8,concurrency:1,pinnedBlockHeight:HEIGHT,
 lendingContract:'contract.main.burrow.near',pythOracle:'aggregate-oracle.near',
 expectedLendingCodeHash:H,expectedPythOracleCodeHash:O,
 maxConfidenceBps:150,sanityMaxUsd:'10000000',...override,
});
const priced=(id,status='PAPER_HEALTHY_UNAPPROVED',block=String(HEIGHT))=>({
 mode:'RHEA_ACTIVE_EXECUTE_WITH_PYTH_VALUATION',chain:'NEAR_MAINNET',
 status:'ACTIVE_PYTH_VALUE_RECONCILED_UNAPPROVED',
 blockHeight:block,borrowerAccountId:id,executionEnabled:false,
 maySign:false,mayBroadcast:false,sourceWasmReproduciblyMatched:false,
 transactionReplayVerified:false,profitVerified:false,
 priceConstructionMatchesCurrentSdk:true,deployedMetadataAndConfigObserved:true,
 candidatePositions:1,
 positions:[{positionId:'REGULAR',status,healthFactorBps:status==='PAPER_AT_RISK_UNAPPROVED'?'9400':'12500',
  legs:[{role:'borrowed',tokenId:'wrap.near'}]}],
});
const input=()=>{const s=source(),xs=shards();return {s,xs,saved:reconcileStage42Window(s,xs,BASE)};};
test('Stage43 derives exact historic failed-account IDs and indices from authenticated artifact shapes',()=>{
 const {s,xs,saved}=input();
 const t=collectStage43BlockedTargets(s,xs,saved,BASE);
 assert.deepEqual(t.map(x=>x.findingIndex),[975,979,1055,1059,1135,1139,1215,1219]);
 assert.equal(t.filter(x=>x.origin==='INITIAL_HEALTH_BLOCKED').length,4);
 assert.equal(t.filter(x=>x.origin==='PAPER_RISK_FRESH_SIZING_BLOCKED').length,4);
});
test('Stage43 retries exactly one coherent finalized block and remains unable to trade',async()=>{
 const {s,xs,saved}=input();
 const visited=[];
 const r=await retryStage43BlockedObservations({},s,xs,saved,BASE,opts(),async id=>{
  visited.push(id);return priced(id);
 });
 assert.equal(visited.length,8);assert.equal(new Set(visited).size,8);
 assert.equal(r.status,'RETRY_BATCH_COMPLETE_RESEARCH_ONLY');
 assert.equal(r.processed,8);assert.equal(r.paperHealthy,8);assert.equal(r.stillBlocked,0);
 assert.equal(r.remainingTargets,0);assert.equal(r.currentPricingBlockHeight,String(HEIGHT));
 assert.ok(r.observations.every(x=>x.freshBlockHeight===String(HEIGHT)));
 assert.equal(r.executionEnabled,false);assert.equal(r.mayBroadcastMainnet,false);
 assert.equal(r.transactionReplayVerified,false);assert.equal(r.positiveNetProfitVerified,false);
});
test('Stage43 retries a partial target cursor without skipping or double counting',async()=>{
 const {s,xs,saved}=input();
 const r=await retryStage43BlockedObservations({},s,xs,saved,BASE,
  opts({fromTarget:2,maxTargets:3}),async id=>priced(id));
 assert.equal(r.fromTarget,2);assert.equal(r.nextTarget,5);
 assert.equal(r.remainingTargets,3);assert.equal(r.processed,3);
 assert.deepEqual(r.observations.map(x=>x.findingIndex),[1055,1059,1135]);
});
test('Stage43 labels re-observed paper-risk as needing fresh source sizing, not eligible',async()=>{
 const {s,xs,saved}=input();
 const r=await retryStage43BlockedObservations({},s,xs,saved,BASE,
  opts({maxTargets:2}),async id=>priced(id,'PAPER_AT_RISK_UNAPPROVED'));
 assert.equal(r.paperAtRiskNeedsSizing,2);
 assert.ok(r.observations.every(x=>x.status==='PAPER_AT_RISK_NEEDS_FRESH_SIZING'));
 assert.ok(r.observations.every(x=>x.executionEligible===false&&x.netProfitVerified===false));
 assert.ok(r.blockers.includes('PAPER_RISK_REQUIRES_NEW_SOURCE_SIZING_AND_SANDBOX_REPLAY'));
});
test('Stage43 rejects cross-block evidence and sanitizes untrusted network exception',async()=>{
 const {s,xs,saved}=input();
 const r=await retryStage43BlockedObservations({},s,xs,saved,BASE,
  opts({maxTargets:2}),async id=>{
   if(id==='borrower975.near')return priced(id,'PAPER_HEALTHY_UNAPPROVED',String(HEIGHT+1));
   throw Error('private token=SECRET in network exception');
  });
 assert.equal(r.stillBlocked,2);assert.equal(r.paperHealthy,0);
 assert.equal(r.status,'RETRY_BATCH_WITH_BLOCKERS');
 assert.equal(r.observations[0].reasonCode,'CROSS_BLOCK_REPRICE');
 assert.equal(JSON.stringify(r).includes('SECRET'),false);
});
test('Stage43 fails before network when source, aggregate or shard is forged',async()=>{
 for(const mut of [
  x=>x.saved.accountsVisited=319,
  x=>x.saved.blockers.push('TRADE_OK'),
  x=>x.xs[0].checkpoint.items[7].borrowerAccountId='fake.near',
  x=>x.xs[1].qualification.rows[0].historicalFindingIndex++,
  x=>x.xs[2].qualification.mayBroadcastMainnet=true,
  x=>x.s.completeSnapshot=false,
  x=>x.xs.pop(),
 ]){
  const x=input();mut(x);
  await assert.rejects(()=>retryStage43BlockedObservations({},x.s,x.xs,x.saved,BASE,opts(),
   async()=>{throw Error('NETWORK_SHOULD_NOT_BE_USED');}));
 }
});
test('Stage43 validates bounded cursor, block, hash and request budget before network',async()=>{
 for(const override of [
  {fromTarget:9},{fromTarget:-1},{maxTargets:13},{concurrency:3},
  {pinnedBlockHeight:0},{expectedLendingCodeHash:O},
 ]){
  const {s,xs,saved}=input();
  await assert.rejects(()=>retryStage43BlockedObservations({},s,xs,saved,BASE,
   opts(override),async()=>{throw Error('NETWORK_SHOULD_NOT_BE_USED');}),/STAGE43_/);
 }
});
test('Stage61 Stage43 workflow can execute isolated Sandbox only after source-positive recovered risk',async()=>{
 const {readFile}=await import('node:fs/promises');
 const workflow=await readFile(new URL('../.github/workflows/rhea-stage43-blocked-retry.yml',import.meta.url),'utf8');
 assert.ok(workflow.includes('rhea-stage42-reconciled-window'));
 assert.ok(workflow.includes('rhea-stage42-opportunity-shard-'));
 assert.ok(workflow.includes("EXECUTION_ENABLED: 'false'"));
 assert.ok(workflow.includes('stage43-blocked-observation-retry-cli.ts'));
 assert.ok(workflow.includes('near-workspaces@5.0.0'));
 assert.ok(workflow.includes('stage61-recovered-risk-cli.ts'));
 assert.ok(workflow.includes('stage61-positive-stage35-evidence.json'));
 assert.ok(workflow.includes('STAGE37_ALLOW_SANDBOX_MUTATION=true'));
 assert.ok(workflow.includes('stage56-sandbox-attempt-cli.mjs'));
 assert.ok(!workflow.includes('NEAR_PRIVATE_KEY:'));
 assert.ok(!workflow.includes('broadcast_tx'));
});

const stage61Opts={...opts(),startFinding:BASE,maxFindings:80,maxRiskCandidates:12,
 concurrency:1,minimumPaperGrossUsdE27:'1000000000000000000000000'};
function sized(id,positive=false){
 return {mode:'RHEA_STAGE35_PINNED_SOURCE_ONLY_LIQUIDATION_SIZING',
  chain:'NEAR_MAINNET',borrowerAccountId:id,blockHeight:String(HEIGHT+2),
  status:positive?'PAPER_SCENARIOS_FOUND_NOT_EXECUTABLE':'NO_SAFE_SOURCE_SCENARIO',
  referenceRulesPass:positive,positionId:positive?'REGULAR':null,
  lendingCodeHash:H,pythOracleCodeHash:O,referenceInitialHealthBps:'9300',
  referenceInitialDiscountE27:'40000000000000000000000000',
  repay:positive?{tokenId:'wrap.near',amountLendingInternalAtomic:'1230000000000000000',
   referenceUsdE27:'2000000000000000000000000000',
   shareToActualTokenAtomicConversionVerified:false,fundsAvailabilityVerified:false}:null,
  seize:positive?{tokenId:'usdc.near',amountLendingInternalAtomic:'2200000000000000000',
   referenceUsdE27:'2500000000000000000000000000',
   shareToActualTokenAtomicConversionVerified:false,fundsAvailabilityVerified:false}:null,
  paperGrossUsdE27:positive?'500000000000000000000000000':null,
  contractRouteParityVerified:false,rawTokenDenominationsVerified:false,
  sandboxStateReplaySucceeded:false,gasAndSwapNetProfitVerified:false,
  walletCapitalVerified:false,mainnetWalletApproved:false,
  executionEnabled:false,maySign:false,mayBroadcast:false};
}
test('Stage61 fresh-sizes only authentic Stage43 recovered paper-risk and preserves conditional Sandbox gate',async()=>{
 const {s,xs,saved}=input();
 const report=await retryStage43BlockedObservations({},s,xs,saved,BASE,
  opts({maxTargets:2}),async id=>priced(id,'PAPER_AT_RISK_UNAPPROVED'));
 const called=[];
 const result=await qualifyStage61RecoveredRisk({},s,xs,saved,report,stage61Opts,
  async id=>{called.push(id);return sized(id,id==='borrower975.near');},async()=>{});
 assert.deepEqual(called,['borrower975.near','borrower979.near']);
 assert.equal(result.recoveredPaperRisk,2);
 assert.equal(result.positiveSourcePlans,1);
 assert.equal(result.sandboxPlanReady,true);
 assert.equal(result.bestProposal.borrowerAccountId,'borrower975.near');
 assert.equal(result.mainnetExecutionEnabled,false);
 assert.equal(result.mayBroadcastMainnet,false);
 assert.equal(result.realProfitVerified,false);
});
test('Stage61 never sizes healthy recovered borrowers and never invents profits',async()=>{
 const {s,xs,saved}=input();
 const report=await retryStage43BlockedObservations({},s,xs,saved,BASE,
  opts({maxTargets:2}),async id=>priced(id,'PAPER_HEALTHY_UNAPPROVED'));
 const result=await qualifyStage61RecoveredRisk({},s,xs,saved,report,stage61Opts,
  async()=>{throw Error('NETWORK_FORBIDDEN');});
 assert.equal(result.recoveredPaperRisk,0);
 assert.equal(result.attemptedFresh,0);
 assert.equal(result.sandboxPlanReady,false);
 assert.equal(result.bestProposal,null);
});
test('Stage61 rejects modified Stage43 output and forged source borrower before fresh RPC',async()=>{
 const {s,xs,saved}=input();
 const report=await retryStage43BlockedObservations({},s,xs,saved,BASE,
  opts({maxTargets:2}),async id=>priced(id,'PAPER_AT_RISK_UNAPPROVED'));
 for(const change of [
  r=>r.observations[0].borrowerAccountId='imposter.near',
  r=>r.paperAtRiskNeedsSizing=1,
  r=>r.mayBroadcastMainnet=true,
  r=>r.observations[0].freshBlockHeight=String(HEIGHT+1),
 ]){
  const forged=structuredClone(report);change(forged);
  await assert.rejects(()=>qualifyStage61RecoveredRisk({},s,xs,saved,forged,stage61Opts,
   async()=>{throw Error('NETWORK_FORBIDDEN');}),/STAGE61_/);
 }
});
test('Stage61 stays fail-closed on source sizing errors and never accepts untrusted positive result',async()=>{
 const {s,xs,saved}=input();
 const report=await retryStage43BlockedObservations({},s,xs,saved,BASE,
  opts({maxTargets:2}),async id=>priced(id,'PAPER_AT_RISK_UNAPPROVED'));
 const result=await qualifyStage61RecoveredRisk({},s,xs,saved,report,stage61Opts,
  async id=>({...sized(id,true),mainnetWalletApproved:true}),async()=>{});
 assert.equal(result.positiveSourcePlans,0);
 assert.equal(result.blockedFresh,2);
 assert.equal(result.sandboxPlanReady,false);
});

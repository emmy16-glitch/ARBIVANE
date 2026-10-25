import {NearRpcHttpError,type NearReadOnlyRpc} from './rpc.ts';
import type {CompletePagedIndex} from './complete-paged-index.ts';
import type {Stage42Shard,Stage42WindowReport} from './stage42-window-reconciliation.ts';
import {collectStage43BlockedTargets,type Stage43Report} from './stage43-blocked-observation-retry.ts';
import {evaluateActualCandidate,type Stage38Options} from './stage38-live-candidate-pipeline.ts';
import {buildStage37SandboxPlan} from './stage37-sandbox-liquidation.ts';
import {classifyStage33Failure} from './stage33-diagnostics.ts';
import type {SourceLiquidationSizing} from './stage35-atomic-reference-sizing.ts';

/** Stage61: source-size ACTUAL Stage43 recovered paper risk; no mainnet signer.
 * Stage43 reports used here are re-attested against independently reconciled
 * source/shard artifacts before any live reads or isolated Sandbox admission.
 */
const positiveInt=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const heights=(x:unknown)=>typeof x==='string'&&/^[1-9][0-9]{0,15}$/.test(x);
type Row={
 borrowerAccountId:string;findingIndex:number;
 status:'SOURCE_PLAN_SANDBOX_ONLY'|'NO_CURRENT_SOURCE_SCENARIO'|'BLOCKED_FRESH_READ';
 reasonCode:string|null;observedBlockHeight:string|null;
 executableMainnet:false;
};
export interface Stage61Result {
 mode:'RHEA_STAGE61_RECOVERED_RISK_TO_SANDBOX';chain:'NEAR_MAINNET';
 status:'SANDBOX_PLAN_READY_NOT_AUTHORIZED'|'NO_SAFE_RECOVERED_SOURCE_PLAN';
 recoveredPaperRisk:number;attemptedFresh:number;positiveSourcePlans:number;blockedFresh:number;
 rows:Row[];bestProposal:SourceLiquidationSizing|null;sandboxPlanReady:boolean;
 mainnetExecutionEnabled:false;maySignMainnet:false;mayBroadcastMainnet:false;
 sandboxReplaySucceeded:false;realProfitVerified:false;
}
function assertReport(source:CompletePagedIndex,shards:Stage42Shard[],
 saved:Stage42WindowReport,report:Stage43Report):void{
 const target=collectStage43BlockedTargets(source,shards,saved,saved.baseCursor);
 if(!report||report.mode!=='RHEA_STAGE43_RECONCILED_BLOCKED_OBSERVATION_RETRY'||
  report.chain!=='NEAR_MAINNET'||!['NO_BLOCKED_TARGETS','RETRY_BATCH_COMPLETE_RESEARCH_ONLY',
  'RETRY_BATCH_WITH_BLOCKERS'].includes(report.status)||
  report.originalSourceBlockHeight!==source.blockHeight||
  report.originalSourceDebtAccounts!==source.debtAccounts||
  report.stage42BaseCursor!==saved.baseCursor||report.stage42EndCursor!==saved.endCursor||
  report.targetCount!==target.length||!heights(report.currentPricingBlockHeight)||
  !positiveInt(report.fromTarget)||!positiveInt(report.nextTarget)||
  !positiveInt(report.processed)||!positiveInt(report.remainingTargets)||
  report.nextTarget!==report.fromTarget+report.processed||
  report.nextTarget+report.remainingTargets!==target.length||
  report.processed>12||!Array.isArray(report.observations)||
  report.observations.length!==report.processed||
  report.executionEnabled!==false||report.maySignMainnet!==false||
  report.mayBroadcastMainnet!==false||report.transactionReplayVerified!==false||
  report.positiveNetProfitVerified!==false||report.deployedLiquidationParityVerified!==false||
  report.currentMarketCompletelyScreened!==false)throw Error('STAGE61_UNTRUSTED_RECOVERED_REPORT');
 const counts={risk:0,healthy:0,blocked:0,none:0};
 for(let i=0;i<report.observations.length;i++){
  const x=report.observations[i]!,t=target[report.fromTarget+i]!;
  if(!x||!t||x.findingIndex!==t.findingIndex||
   x.borrowerAccountId!==t.borrowerAccountId||x.origin!==t.origin||
   x.originalReasonCode!==t.originalReasonCode||
   x.executionEligible!==false||x.netProfitVerified!==false||
   !['PAPER_AT_RISK_NEEDS_FRESH_SIZING','PAPER_HEALTHY_UNAPPROVED',
    'NO_DEBT_NOW','STILL_BLOCKED'].includes(x.status)||
   (x.status!=='STILL_BLOCKED'&&(x.freshBlockHeight!==report.currentPricingBlockHeight||
    !heights(x.freshBlockHeight)||x.reasonCode!==null))||
   (x.status==='STILL_BLOCKED'&&x.freshBlockHeight!==null&&
     x.freshBlockHeight!==report.currentPricingBlockHeight))
   throw Error('STAGE61_UNTRUSTED_RECOVERED_TARGET');
  if(x.status==='PAPER_AT_RISK_NEEDS_FRESH_SIZING')counts.risk++;
  else if(x.status==='PAPER_HEALTHY_UNAPPROVED')counts.healthy++;
  else if(x.status==='NO_DEBT_NOW')counts.none++;
  else counts.blocked++;
 }
 if(report.paperAtRiskNeedsSizing!==counts.risk||report.paperHealthy!==counts.healthy||
  report.noDebtNow!==counts.none||report.stillBlocked!==counts.blocked)
  throw Error('STAGE61_RECOVERED_TARGET_COUNTS_DRIFT');
}
export async function qualifyStage61RecoveredRisk(
 rpc:Pick<NearReadOnlyRpc,'view'|'viewAccount'>,source:CompletePagedIndex,
 shards:Stage42Shard[],saved:Stage42WindowReport,report:Stage43Report,o:Stage38Options,
 evaluator:(id:string)=>Promise<SourceLiquidationSizing>=(id)=>evaluateActualCandidate(rpc,id,o),
 delay:(ms:number)=>Promise<void>=(ms)=>new Promise(resolve=>setTimeout(resolve,ms)),
):Promise<Stage61Result>{
 assertReport(source,shards,saved,report);
 if(o.expectedLendingCodeHash!==source.lendingCodeHash||
  !positiveInt(o.maxRiskCandidates)||o.maxRiskCandidates<1||o.maxRiskCandidates>12||
  o.concurrency!==1||!heights(source.blockHeight)||
  !/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(o.expectedPythOracleCodeHash)||
  !/^[1-9][0-9]{0,38}$/.test(o.minimumPaperGrossUsdE27))
  throw Error('STAGE61_INVALID_BOUNDED_SOURCE_OPTIONS');
 const risk=report.observations.filter(x=>x.status==='PAPER_AT_RISK_NEEDS_FRESH_SIZING');
 if(risk.length>o.maxRiskCandidates)throw Error('STAGE61_RECOVERED_RISK_BUDGET_EXCEEDED');
 const rows:Row[]=[];const proposals:SourceLiquidationSizing[]=[];
 // Sequential reads prevent another burst against the throttled Rhea RPC.
 for(const item of risk){
  let evidence:SourceLiquidationSizing|undefined,reason:string|null=null;
  for(let tries=0;tries<=1;tries++){
   try {evidence=await evaluator(item.borrowerAccountId);break;}
   catch(e){
    reason=classifyStage33Failure(e);
    if(tries>0||reason!=='HTTP_RATE_LIMIT_OR_TIMEOUT')break;
    const hint=e instanceof NearRpcHttpError?(e.retryAfterMs??0):0;
    const wait=Math.max(4500,hint);
    if(wait>30000)break;
    await delay(wait);
   }
  }
  let status:Row['status']='BLOCKED_FRESH_READ',height:string|null=null;
  try {
   if(!evidence)throw Error('STAGE61_SOURCE_READ_BLOCKED');
   if(evidence.mode!=='RHEA_STAGE35_PINNED_SOURCE_ONLY_LIQUIDATION_SIZING'||
    evidence.chain!=='NEAR_MAINNET'||evidence.borrowerAccountId!==item.borrowerAccountId||
    evidence.lendingCodeHash!==source.lendingCodeHash||
    evidence.pythOracleCodeHash!==o.expectedPythOracleCodeHash||
    !heights(evidence.blockHeight)||evidence.maySign!==false||
    evidence.mayBroadcast!==false||evidence.executionEnabled!==false||
    evidence.mainnetWalletApproved!==false||
    evidence.sandboxStateReplaySucceeded!==false||
    evidence.gasAndSwapNetProfitVerified!==false)
    throw Error('STAGE61_UNTRUSTED_SOURCE_SIZING');
   const positive=evidence.status==='PAPER_SCENARIOS_FOUND_NOT_EXECUTABLE'&&
    evidence.referenceRulesPass===true;
   if(positive){buildStage37SandboxPlan(evidence);proposals.push(evidence);}
   status=positive?'SOURCE_PLAN_SANDBOX_ONLY':'NO_CURRENT_SOURCE_SCENARIO';
   height=evidence.blockHeight;reason=null;
  }catch(e){if(evidence)reason=classifyStage33Failure(e);}
  rows.push({borrowerAccountId:item.borrowerAccountId,findingIndex:item.findingIndex,
   status,reasonCode:reason,observedBlockHeight:height,executableMainnet:false});
 }
 proposals.sort((a,b)=>BigInt(b.paperGrossUsdE27??'0')>BigInt(a.paperGrossUsdE27??'0')?1:
  BigInt(b.paperGrossUsdE27??'0')<BigInt(a.paperGrossUsdE27??'0')?-1:0);
 return {mode:'RHEA_STAGE61_RECOVERED_RISK_TO_SANDBOX',chain:'NEAR_MAINNET',
  status:proposals.length?'SANDBOX_PLAN_READY_NOT_AUTHORIZED':'NO_SAFE_RECOVERED_SOURCE_PLAN',
  recoveredPaperRisk:risk.length,attemptedFresh:rows.length,
  positiveSourcePlans:proposals.length,
  blockedFresh:rows.filter(x=>x.status==='BLOCKED_FRESH_READ').length,
  rows,bestProposal:proposals[0]??null,sandboxPlanReady:proposals.length>0,
  mainnetExecutionEnabled:false,maySignMainnet:false,mayBroadcastMainnet:false,
  sandboxReplaySucceeded:false,realProfitVerified:false};
}

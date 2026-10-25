import type {NearReadOnlyRpc} from './rpc.ts';
import type {CompletePagedIndex} from './complete-paged-index.ts';
import type {Stage43Report,Stage43Observation} from './stage43-blocked-observation-retry.ts';
import {evaluateActualCandidate,type Stage38Options} from './stage38-live-candidate-pipeline.ts';
import {buildStage37SandboxPlan} from './stage37-sandbox-liquidation.ts';
import type {SourceLiquidationSizing} from './stage35-atomic-reference-sizing.ts';
import {classifyStage33Failure} from './stage33-diagnostics.ts';

/** Stage44: turn ONLY authenticated, newly paper-risk Stage43 recoveries into
 * fresh Stage35 reference sizing; a positive plan permits isolated Sandbox
 * replay, never a mainnet liquidation, wallet signing, or profit claim.
 */
const UINT=/^(0|[1-9][0-9]{0,77})$/;
const HEIGHT=/^[1-9][0-9]{0,15}$/;
const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const safe=(v:unknown,min:number,max:number):v is number=>
 typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const fail=(reason:string):never=>{throw Error('STAGE44_'+reason);};
export interface Stage44Options extends Omit<Stage38Options,'startFinding'|'maxFindings'> {
 maxCandidates:number;
}
export interface Stage44Candidate {
 borrowerAccountId:string;historicalFindingIndex:number;stage43FreshBlockHeight:string;
}
export interface Stage44Row extends Stage44Candidate {
 status:'SOURCE_REFERENCE_PLAN_SANDBOX_ONLY'|'NO_CURRENT_SAFE_REFERENCE_SCENARIO'|'BLOCKED_FRESH_SIZING';
 freshSizedBlockHeight:string|null;reasonCode:string|null;paperGrossUsdE27:string|null;
 mainnetExecutionEligible:false;netProfitVerified:false;
}
export interface Stage44Report {
 mode:'RHEA_STAGE44_RECOVERED_RISK_SANDBOX_PREFLIGHT';
 chain:'NEAR_MAINNET';
 status:'NO_RECOVERED_PAPER_RISK'|'FRESH_REFERENCE_PLANS_SANDBOX_ONLY'|
  'NO_VALID_REFERENCE_PLAN'|'BLOCKED_FRESH_SIZING_REMAINS';
 sourceBlockHeight:string;sourceDebtAccounts:number;stage43PricingBlockHeight:string;
 previousStage43Processed:number;previousStage43StillBlocked:number;
 recoveredPaperRiskTargets:number;attemptedFreshSizing:number;
 sourcePositivePlans:number;noSafeSourceScenario:number;blockedFreshSizing:number;
 rows:Stage44Row[];bestProposal:SourceLiquidationSizing|null;
 sandboxPlanReady:boolean;liquidationEligibilityVerified:false;
 completeMarketScreened:false;netProfitVerified:false;walletApproved:false;
 mainnetExecutionEnabled:false;maySignMainnet:false;mayBroadcastMainnet:false;
 warnings:string[];
}

export function selectStage44RecoveredRisk(
 source:CompletePagedIndex,prior:Stage43Report,maxCandidates:number,
):Stage44Candidate[]{
 if(!safe(maxCandidates,1,12)||!source||source.mode!=='RHEA_COMPLETE_PAGED_INDEX_ATTESTATION'||
  source.chain!=='NEAR_MAINNET'||source.status!=='COMPLETE_DEBT_INDEX_READ_ONLY'||
  source.completeSnapshot!==true||source.zeroSchemaErrors!==true||
  source.executionEnabled!==false||source.liquidationEligible!==false||
  source.profitabilityVerified!==false||source.totalAccounts!==source.scannedAccounts||
  !Array.isArray(source.findings)||source.findings.length!==source.debtAccounts||
  !HASH.test(source.lendingCodeHash))
  fail('UNTRUSTED_HISTORICAL_MARKET_SOURCE');
 if(!prior||prior.mode!=='RHEA_STAGE43_RECONCILED_BLOCKED_OBSERVATION_RETRY'||
  prior.chain!=='NEAR_MAINNET'||!['NO_BLOCKED_TARGETS','RETRY_BATCH_COMPLETE_RESEARCH_ONLY',
   'RETRY_BATCH_WITH_BLOCKERS'].includes(prior.status)||
  prior.executionEnabled!==false||prior.maySignMainnet!==false||
  prior.mayBroadcastMainnet!==false||prior.currentMarketCompletelyScreened!==false||
  prior.deployedLiquidationParityVerified!==false||
  prior.transactionReplayVerified!==false||prior.positiveNetProfitVerified!==false||
  prior.originalSourceBlockHeight!==source.blockHeight||
  prior.originalSourceDebtAccounts!==source.debtAccounts||
  !HEIGHT.test(prior.currentPricingBlockHeight)||
  !safe(prior.targetCount,0,320)||!safe(prior.fromTarget,0,prior.targetCount)||
  !safe(prior.nextTarget,prior.fromTarget,prior.targetCount)||
  !safe(prior.stage42BaseCursor,0,source.debtAccounts)||
  prior.stage42EndCursor!==prior.stage42BaseCursor+320||
  prior.stage42EndCursor>source.debtAccounts||
  prior.remainingTargets!==prior.targetCount-prior.nextTarget||
  prior.processed!==prior.nextTarget-prior.fromTarget||
  !Array.isArray(prior.observations)||prior.observations.length!==prior.processed||
  ![prior.stillBlocked,prior.paperHealthy,prior.paperAtRiskNeedsSizing,prior.noDebtNow].every(v=>safe(v,0,prior.processed))||
  prior.stillBlocked+prior.paperHealthy+prior.paperAtRiskNeedsSizing+prior.noDebtNow!==prior.processed)
  fail('UNTRUSTED_STAGE43_PARENT_REPORT');
 const seen=new Set<number>();const selected:Stage44Candidate[]=[];
 let blocked=0,healthy=0,risk=0,noDebt=0;
 for(const obs of prior.observations){
  if(!obs||!safe(obs.findingIndex,prior.stage42BaseCursor,prior.stage42EndCursor-1)||
   seen.has(obs.findingIndex)||source.findings[obs.findingIndex]?.accountId!==obs.borrowerAccountId||
   obs.executionEligible!==false||obs.netProfitVerified!==false||
   !['INITIAL_HEALTH_BLOCKED','PAPER_RISK_FRESH_SIZING_BLOCKED'].includes(obs.origin)||
   !['PAPER_AT_RISK_NEEDS_FRESH_SIZING','PAPER_HEALTHY_UNAPPROVED','NO_DEBT_NOW','STILL_BLOCKED'].includes(obs.status)||
   (obs.originalReasonCode!==null&&!/^[A-Z0-9_]{1,80}$/.test(obs.originalReasonCode)))
   fail('INVALID_PARENT_OBSERVATION');
  seen.add(obs.findingIndex);
  if(obs.status==='STILL_BLOCKED'){
   blocked++;
   if((obs.freshBlockHeight!==null&&obs.freshBlockHeight!==prior.currentPricingBlockHeight)||obs.healthBps!==null)
    fail('BLOCKED_OBSERVATION_CLAIMS_CURRENT_HEALTH');
  }else{
   if(obs.freshBlockHeight!==prior.currentPricingBlockHeight)
    fail('CROSS_BLOCK_STAGE43_OBSERVATION');
   if(obs.status==='PAPER_AT_RISK_NEEDS_FRESH_SIZING'){
    risk++;
    if(!UINT.test(obs.healthBps??'')||BigInt(obs.healthBps!)>=10000n)
     fail('PAPER_RISK_HEALTH_NOT_BELOW_ONE');
    selected.push({borrowerAccountId:obs.borrowerAccountId,
     historicalFindingIndex:obs.findingIndex,stage43FreshBlockHeight:obs.freshBlockHeight!});
   }else if(obs.status==='PAPER_HEALTHY_UNAPPROVED'){
    healthy++;
    if(!UINT.test(obs.healthBps??'')||BigInt(obs.healthBps!)<10000n)
     fail('HEALTHY_STATUS_HEALTH_CONTRADICTION');
   }else{
    noDebt++;
    if(obs.healthBps!==null)fail('NO_DEBT_WITH_HEALTH_FACTOR');
   }
  }
 }
 if(blocked!==prior.stillBlocked||healthy!==prior.paperHealthy||
  risk!==prior.paperAtRiskNeedsSizing||noDebt!==prior.noDebtNow)
  fail('STAGE43_OBSERVATION_COUNT_DRIFT');
 if(selected.length>maxCandidates)fail('RISK_CANDIDATES_EXCEED_HARD_LIMIT');
 return selected;
}
function verifySizing(
 evidence:SourceLiquidationSizing,borrower:string,stage43Height:string,o:Stage44Options,
):boolean{
 if(!evidence||evidence.mode!=='RHEA_STAGE35_PINNED_SOURCE_ONLY_LIQUIDATION_SIZING'||
  evidence.chain!=='NEAR_MAINNET'||evidence.borrowerAccountId!==borrower||
  !HEIGHT.test(evidence.blockHeight)||BigInt(evidence.blockHeight)<BigInt(stage43Height)||
  evidence.lendingCodeHash!==o.expectedLendingCodeHash||
  evidence.pythOracleCodeHash!==o.expectedPythOracleCodeHash||
  evidence.contractRouteParityVerified!==false||
  evidence.rawTokenDenominationsVerified!==false||
  evidence.sandboxStateReplaySucceeded!==false||
  evidence.gasAndSwapNetProfitVerified!==false||
  evidence.walletCapitalVerified!==false||evidence.mainnetWalletApproved!==false||
  evidence.executionEnabled!==false||evidence.maySign!==false||
  evidence.mayBroadcast!==false)
  fail('UNTRUSTED_STAGE35_FRESH_SOURCE');
 if(evidence.status==='NO_CURRENT_REFERENCE_RISK'||
  evidence.status==='NO_SAFE_SOURCE_SCENARIO'){
  if(evidence.referenceRulesPass!==false||evidence.repay!==null||
   evidence.seize!==null||evidence.paperGrossUsdE27!==null)
   fail('CONTRADICTORY_NEGATIVE_SOURCE_PLAN');
  return false;
 }
 if(evidence.status!=='PAPER_SCENARIOS_FOUND_NOT_EXECUTABLE'||
  evidence.referenceRulesPass!==true||
  !UINT.test(evidence.paperGrossUsdE27??'')||
  BigInt(evidence.paperGrossUsdE27!)<=0n)
  fail('INVALID_POSITIVE_SOURCE_PLAN');
 // This is the only admission route, and it returns Sandbox-only actions.
 buildStage37SandboxPlan(evidence);
 return true;
}
export async function preflightStage44RecoveredRisk(
 rpc:Pick<NearReadOnlyRpc,'view'|'viewAccount'>,
 source:CompletePagedIndex,prior:Stage43Report,o:Stage44Options,
 evaluate:(account:string)=>Promise<SourceLiquidationSizing>=id=>
  evaluateActualCandidate(rpc,id,{...o,startFinding:prior.stage42BaseCursor,maxFindings:80}),
):Promise<Stage44Report>{
 if(!HASH.test(o.expectedLendingCodeHash)||!HASH.test(o.expectedPythOracleCodeHash)||
  o.expectedLendingCodeHash!==source.lendingCodeHash||
  o.lendingContract!=='contract.main.burrow.near'||
  o.pythOracle!=='aggregate-oracle.near'||
  !safe(o.concurrency,1,2)||!safe(o.maxConfidenceBps,1,300)||
  !safe(o.maxRiskCandidates,1,16)||!UINT.test(o.minimumPaperGrossUsdE27)||
  BigInt(o.minimumPaperGrossUsdE27)<=0n)
  fail('UNTRUSTED_PREFLIGHT_OPTIONS');
 const selected=selectStage44RecoveredRisk(source,prior,o.maxCandidates);
 const proposals:SourceLiquidationSizing[]=[];
 const rows:Stage44Row[]=[];
 for(const c of selected){
  const row:Stage44Row={...c,status:'BLOCKED_FRESH_SIZING',
   freshSizedBlockHeight:null,reasonCode:'UNCLASSIFIED_READ_ERROR',
   paperGrossUsdE27:null,mainnetExecutionEligible:false,netProfitVerified:false};
  try{
   const evidence=await evaluate(c.borrowerAccountId);
   const positive=verifySizing(evidence,c.borrowerAccountId,c.stage43FreshBlockHeight,o);
   row.freshSizedBlockHeight=evidence.blockHeight;
   row.status=positive?'SOURCE_REFERENCE_PLAN_SANDBOX_ONLY':'NO_CURRENT_SAFE_REFERENCE_SCENARIO';
   row.paperGrossUsdE27=positive?evidence.paperGrossUsdE27:null;
   row.reasonCode=null;
   if(positive)proposals.push(evidence);
  }catch(e){row.reasonCode=classifyStage33Failure(e);}
  rows.push(row);
 }
 proposals.sort((a,b)=>BigInt(a.paperGrossUsdE27??'0')>BigInt(b.paperGrossUsdE27??'0')?-1:
  BigInt(a.paperGrossUsdE27??'0')<BigInt(b.paperGrossUsdE27??'0')?1:0);
 const blocked=rows.filter(x=>x.status==='BLOCKED_FRESH_SIZING').length;
 const negative=rows.filter(x=>x.status==='NO_CURRENT_SAFE_REFERENCE_SCENARIO').length;
 return {
  mode:'RHEA_STAGE44_RECOVERED_RISK_SANDBOX_PREFLIGHT',chain:'NEAR_MAINNET',
  status:selected.length===0?'NO_RECOVERED_PAPER_RISK':
   proposals.length?'FRESH_REFERENCE_PLANS_SANDBOX_ONLY':
   blocked?'BLOCKED_FRESH_SIZING_REMAINS':'NO_VALID_REFERENCE_PLAN',
  sourceBlockHeight:source.blockHeight,sourceDebtAccounts:source.debtAccounts,
  stage43PricingBlockHeight:prior.currentPricingBlockHeight,
  previousStage43Processed:prior.processed,previousStage43StillBlocked:prior.stillBlocked,
  recoveredPaperRiskTargets:selected.length,attemptedFreshSizing:rows.length,
  sourcePositivePlans:proposals.length,noSafeSourceScenario:negative,blockedFreshSizing:blocked,
  rows,bestProposal:proposals[0]??null,sandboxPlanReady:proposals.length>0,
  liquidationEligibilityVerified:false,completeMarketScreened:false,
  netProfitVerified:false,walletApproved:false,mainnetExecutionEnabled:false,
  maySignMainnet:false,mayBroadcastMainnet:false,
  warnings:['STAGE43_RECOVERY_IS_BOUNDED_HISTORICAL_DEBT_COHORT_NOT_WHOLE_MARKET',
   ...(blocked?['FRESH_SIZING_RPC_OR_PARITY_BLOCKERS_UNRESOLVED']:[]),
   'SOURCE_ONLY_LIQUIDATION_SPREAD_IS_NOT_PROVEN_DEPLOYED_ELIGIBILITY',
   'ONLY_ISOLATED_SANDBOX_REPLAY_IS_PERMITTED_FOR_STRICT_POSITIVE_REFERENCE',
   'NO_MAINNET_SIGNER_FINANCING_SWAP_EXECUTION_OR_REALIZED_NET_PROFIT'],
 };
}

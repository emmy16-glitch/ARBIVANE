import {NearRpcHttpError,type NearReadOnlyRpc} from './rpc.ts';
import {ResilientNearReadOnlyRpc} from './resilient-readonly-rpc.ts';
import type {CompletePagedIndex} from './complete-paged-index.ts';
import {checkSweepCheckpoint,type SweepCheckpoint,type SweepOptions} from './full-active-pyth-sweep.ts';
import {inspectActivePythValuation} from './execution-pyth-valuation.ts';
import {sizeStage35SourceLiquidation,type SourceLiquidationSizing} from './stage35-atomic-reference-sizing.ts';
import {buildStage37SandboxPlan} from './stage37-sandbox-liquidation.ts';
import {classifyStage33Failure} from './stage33-diagnostics.ts';

/** Stage38: take ACTUAL Stage32 risk findings -> fresh active Pyth -> source
 * reference sizing -> executable SANDBOX-only plan. No mainnet signer.
 * Historical reference health alone does not qualify a liquidation.
 */
const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
export interface Stage38Options extends Omit<SweepOptions,'batchSize'> {
 maxRiskCandidates:number;minimumPaperGrossUsdE27:string;
 // Bounded across the shard; default eight for callers not opting into
 // Stage163. Larger source sweeps may allot enough for all blocked borrowers.
 maxRecoveryAttempts?:number;
 // Stage159: optional execution-lane route, not a broad market-screening rule.
 // Only source-qualified, same-token LiNEAR proposals can reach the existing
 // Stage37 LiNEAR execution lane. Other candidates stay visible in rows.
 requiredSameTokenId?:'linear-protocol.near';
}
export interface Stage38Row {
 borrowerAccountId:string;historicalFindingIndex:number;
 status:'FRESH_SOURCE_PLAN_FOR_SANDBOX_ONLY'|'FRESH_SOURCE_UNSUPPORTED_SANDBOX_ROUTE'|'NO_CURRENT_SOURCE_SCENARIO'|'BLOCKED_FRESH_READ';
 observationBlockHeight:string|null;reasonCode:string|null;
 referenceInitialHealthBps:string|null;paperGrossUsdE27:string|null;
 sizingStatus:SourceLiquidationSizing['status']|null;
 consideredPairs:number|null;sizingBlockers:string[];
 executionEligible:false;netProfitVerified:false;
}
export interface Stage38Result {
 mode:'RHEA_STAGE38_LIVE_CANDIDATE_TO_SANDBOX';chain:'NEAR_MAINNET';
 status:'SANDBOX_PLAN_READY_NOT_AUTHORIZED'|'NO_EXECUTABLE_SOURCE_REFERENCE'|'BLOCKED_CANDIDATE_LIMIT';
 sourceBlockHeight:string;sourceDebtAccounts:number;
 startFinding:number;nextFinding:number;reviewed:number;paperAtRiskFromPreviousScan:number;
 refreshed:number;positiveSourcePlans:number;rejectedByRequiredRoute:number;failedFreshReads:number;
 recoveryDeferredFindings:number;recoveryBudgetExhausted:boolean;
 boundedRecoveryAttempts:number;recoveredRateLimitedFindings:number;
 recoveredPriceFreshnessFindings:number;
 rows:Stage38Row[];
 bestProposal:SourceLiquidationSizing|null;
 sandboxPlanReady:boolean;noEligibleMainnetTrades:true;
 mainnetExecutionEnabled:false;maySignMainnet:false;mayBroadcastMainnet:false;
 sandboxReplaySucceeded:false;liquidationRuleParityVerified:false;
 netProfitVerified:false;walletApproved:false;
 warnings:string[];
}
function number(v:unknown,min:number,max:number):boolean {
 return typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
}
export async function evaluateActualCandidate(
 input:Pick<NearReadOnlyRpc,'view'|'viewAccount'>,
 borrower:string,o:Stage38Options,
):Promise<SourceLiquidationSizing>{
 const rpc=new ResilientNearReadOnlyRpc(input,{maxRetries:2,initialDelayMs:350,maxDelayMs:5000,maxCachedPinnedViews:256});
 const tip=await rpc.viewAccount(o.lendingContract);
 if(!/^[1-9][0-9]{0,15}$/.test(tip.blockHeight)||tip.codeHash!==o.expectedLendingCodeHash)
  throw Error('STAGE38_CURRENT_DEPLOYED_LENDING_CODE_DRIFT');
 const block=Number(tip.blockHeight);
 const [valuation,assets]=await Promise.all([
  inspectActivePythValuation(rpc,{
   lendingContract:o.lendingContract,pythOracle:o.pythOracle,borrowerAccountId:borrower,
   expectedLendingCodeHash:o.expectedLendingCodeHash,
   expectedPythOracleCodeHash:o.expectedPythOracleCodeHash,
   pinnedBlockHeight:block,nowMs:Date.now(),maxConfidenceBps:o.maxConfidenceBps,
   sanityMaxUsd:o.sanityMaxUsd,maxConcurrency:2,
  }),
  rpc.view<unknown>(o.lendingContract,'get_assets_paged',{},block),
 ]);
 if(valuation.blockHeight!==tip.blockHeight||assets.blockHeight!==tip.blockHeight)
  throw Error('STAGE38_CROSS_BLOCK_VALUATION');
 if(valuation.status==='NO_DEBT'||valuation.status==='INCOMPLETE_ACTIVE_PYTH_VALUATION')
  throw Error('STAGE38_BORROWER_NO_LONGER_PRICEABLE');
 return sizeStage35SourceLiquidation(valuation,assets.value,{
  borrowerAccountId:borrower,maxRepayBps:100,
  minimumPaperGrossUsdE27:o.minimumPaperGrossUsdE27,
  requiredSameTokenId:o.requiredSameTokenId,
 });
}
export async function qualifyStage38Candidates(
 rpc:Pick<NearReadOnlyRpc,'view'|'viewAccount'>,
 source:CompletePagedIndex,prior:SweepCheckpoint,o:Stage38Options,
 evaluator:(borrower:string)=>Promise<SourceLiquidationSizing>=(id)=>evaluateActualCandidate(rpc,id,o),
 delay:(ms:number)=>Promise<void>=(ms)=>new Promise(resolve=>setTimeout(resolve,ms)),
):Promise<Stage38Result>{
 if(!source||!prior||!HASH.test(o.expectedLendingCodeHash)||
  !HASH.test(o.expectedPythOracleCodeHash)||
  !number(o.startFinding,0,source.debtAccounts)||
  !number(o.maxFindings,1,80)||!number(o.maxRiskCandidates,1,80)||
  !number(o.concurrency,1,3)||
  (o.maxRecoveryAttempts!==undefined&&!number(o.maxRecoveryAttempts,0,160))||
  !/^[1-9][0-9]{0,38}$/.test(o.minimumPaperGrossUsdE27)||
  (o.requiredSameTokenId!==undefined&&o.requiredSameTokenId!=='linear-protocol.near'))
  throw Error('INVALID_STAGE38_CANDIDATE_OPTIONS');
 const check:SweepOptions={...o,batchSize:20};
 checkSweepCheckpoint(source,check,prior);
 if(prior.nextFinding!==prior.targetEndFinding||prior.startFinding!==o.startFinding||
  prior.sourceCodeHash!==o.expectedLendingCodeHash||
  !source.completeSnapshot||source.status!=='COMPLETE_DEBT_INDEX_READ_ONLY')
  throw Error('STAGE38_REQUIRES_VERIFIED_COMPLETE_STAGE32_WINDOW');
 const risk=prior.items.map((v,i)=>({v,index:prior.startFinding+i}))
  .filter(x=>x.v.classification==='PAPER_AT_RISK_UNAPPROVED');
 const base={
  mode:'RHEA_STAGE38_LIVE_CANDIDATE_TO_SANDBOX' as const,
  chain:'NEAR_MAINNET' as const,
  sourceBlockHeight:source.blockHeight,sourceDebtAccounts:source.debtAccounts,
  startFinding:prior.startFinding,nextFinding:prior.nextFinding,
  reviewed:prior.processed,paperAtRiskFromPreviousScan:risk.length,
  boundedRecoveryAttempts:0,recoveredRateLimitedFindings:0,
  recoveredPriceFreshnessFindings:0,
  noEligibleMainnetTrades:true as const,mainnetExecutionEnabled:false as const,
  maySignMainnet:false as const,mayBroadcastMainnet:false as const,
  sandboxReplaySucceeded:false as const,liquidationRuleParityVerified:false as const,
  netProfitVerified:false as const,walletApproved:false as const,
  warnings:['REFERENCE_CANDIDATE_NOT_DEPLOYED_LIQUIDATION_PARITY',
   'ONLY_SANDBOX_MUTATION_POSSIBLE_AFTER_FRESH_SUCCESSFUL_REFERENCE_SIZING',
   'PRODUCTION_FUNDING_BALANCES_RECEIPTS_AND_NET_PNL_NOT_VERIFIED'],
 };
 // The real Stage42 caller permits the entire 80-account authenticated shard.
 // A narrower caller-defined cap must fail CLOSED rather than pretending all
 // at-risk accounts were checked. No uncontrolled fan-out: concurrency <= 3.
 if(risk.length>o.maxRiskCandidates)return {...base,
  status:'BLOCKED_CANDIDATE_LIMIT',refreshed:0,positiveSourcePlans:0,rejectedByRequiredRoute:0,
  failedFreshReads:0,recoveryDeferredFindings:0,recoveryBudgetExhausted:false,
  rows:[],bestProposal:null,sandboxPlanReady:false};
 // Every authentic at-risk finding in the completed source window must receive
 // a fresh source evaluation, including cohorts larger than the old cap of 12.
 // Only results actually verified as positive can produce a Sandbox plan.
 const rows:Stage38Row[]=new Array(risk.length);
 const proposals:SourceLiquidationSizing[]=[];
 let rejectedByRequiredRoute=0;
 const retryAfterMs:(number|undefined)[]=new Array(risk.length);
 // Each retry observes current deployed code and a NEW pinned final block.
 // A failed, expired, malformed or untrusted oracle result is never promoted.
 const assess=async(i:number)=>{
  const f=risk[i]!,borrower=f.v.borrowerAccountId;
  let row:Stage38Row={
   borrowerAccountId:borrower,historicalFindingIndex:f.index,
   status:'BLOCKED_FRESH_READ',observationBlockHeight:null,
   reasonCode:'UNCLASSIFIED_READ_ERROR',referenceInitialHealthBps:null,
   paperGrossUsdE27:null,sizingStatus:null,consideredPairs:null,sizingBlockers:[],
   executionEligible:false,netProfitVerified:false,
  };
  try{
   const evidence=await evaluator(borrower);
   if(!evidence||evidence.mode!=='RHEA_STAGE35_PINNED_SOURCE_ONLY_LIQUIDATION_SIZING'||
    evidence.borrowerAccountId!==borrower||evidence.chain!=='NEAR_MAINNET'||
    evidence.lendingCodeHash!==o.expectedLendingCodeHash||
    evidence.pythOracleCodeHash!==o.expectedPythOracleCodeHash||
    evidence.executionEnabled!==false||evidence.maySign!==false||
    evidence.mayBroadcast!==false||evidence.mainnetWalletApproved!==false||
    evidence.sandboxStateReplaySucceeded!==false||
    evidence.gasAndSwapNetProfitVerified!==false)
    throw Error('STAGE38_UNTRUSTED_SIZING_EVIDENCE');
   const positive=evidence.status==='PAPER_SCENARIOS_FOUND_NOT_EXECUTABLE'&&
    evidence.referenceRulesPass===true;
   const unsupportedRoute=positive&&o.requiredSameTokenId!==undefined&&
    (evidence.repay?.tokenId!==o.requiredSameTokenId||
     evidence.seize?.tokenId!==o.requiredSameTokenId);
   if(positive){
    if(unsupportedRoute){
     // Still a genuine source observation, but not an executable asset route.
     rejectedByRequiredRoute++;
    }else{
     buildStage37SandboxPlan(evidence);
     proposals.push(evidence);
    }
   }
   row={...row,status:unsupportedRoute?'FRESH_SOURCE_UNSUPPORTED_SANDBOX_ROUTE':
    positive?'FRESH_SOURCE_PLAN_FOR_SANDBOX_ONLY':'NO_CURRENT_SOURCE_SCENARIO',
    observationBlockHeight:evidence.blockHeight,reasonCode:null,
    referenceInitialHealthBps:evidence.referenceInitialHealthBps,
    paperGrossUsdE27:positive?evidence.paperGrossUsdE27:null,
    sizingStatus:evidence.status,consideredPairs:evidence.consideredPairs,
    sizingBlockers:[...evidence.blockers]};
   retryAfterMs[i]=undefined;
  }catch(err){
   row={...row,reasonCode:classifyStage33Failure(err)};
   retryAfterMs[i]=err instanceof NearRpcHttpError?err.retryAfterMs:undefined;
  }
  rows[i]=row;
 };
 let next=0;
 await Promise.all(Array.from({length:Math.min(o.concurrency,risk.length)},async()=>{
  while(next<risk.length)await assess(next++);
 }));
 // Stage94: an authentic quote may be stale at the first read even though
 // the earlier Pyth classification still reports risk. Never waive contract
 // valid_seconds, confidence bands, source block pinning, or exact sizing.
 // Stage163: two recovery rounds, at most once per borrower in each round.
 // The old eight-attempt shard budget exhausted two retries on only the first
 // four accounts and could abandon another seven proven at-risk accounts.
 // A bounded operator budget (default eight, Stage157 forty) is still shared
 // by the entire shard. No retries on malformed/altered source or stale
 // information without re-reading the current finalized tip.
 const maxRecoveryAttempts=o.maxRecoveryAttempts??8;
 let boundedRecoveryAttempts=0,recoveredRateLimitedFindings=0;
 let recoveredPriceFreshnessFindings=0;
 const recoverable=new Set(['HTTP_RATE_LIMIT_OR_TIMEOUT','PYTH_PRICE_STALE_OR_UNCERTAIN']);
 const firstReasons=rows.map(row=>row?.status==='BLOCKED_FRESH_READ'?row.reasonCode:null);
 const cooldownDeferred=new Set<number>();
 for(let round=0;round<2&&boundedRecoveryAttempts<maxRecoveryAttempts;round++){
  for(let i=0;i<risk.length&&boundedRecoveryAttempts<maxRecoveryAttempts;i++){
   const firstReason=firstReasons[i];
   if(!firstReason||!recoverable.has(firstReason)||cooldownDeferred.has(i)||
    rows[i]?.status!=='BLOCKED_FRESH_READ'||rows[i]?.reasonCode!==firstReason)continue;
   const waitMs=firstReason==='PYTH_PRICE_STALE_OR_UNCERTAIN'?
    4000*2**round:
    Math.max(1500*2**round,retryAfterMs[i]??0);
   // Honor provider cooldown: no quick retry against a 90-second Retry-After.
   // Record this as deferred for a future fresh run, not as ineligible debt.
   if(waitMs>30000){cooldownDeferred.add(i);continue;}
   await delay(waitMs);
   boundedRecoveryAttempts++;
   await assess(i);
   if(rows[i]?.status!=='BLOCKED_FRESH_READ'){
    if(firstReason==='HTTP_RATE_LIMIT_OR_TIMEOUT')recoveredRateLimitedFindings++;
    else recoveredPriceFreshnessFindings++;
   }
  }
 }
 const recoveryDeferredFindings=rows.filter((row,i)=>row?.status==='BLOCKED_FRESH_READ'&&
  firstReasons[i]!==null&&recoverable.has(firstReasons[i]!)).length;
 const recoveryBudgetExhausted=boundedRecoveryAttempts>=maxRecoveryAttempts&&
  recoveryDeferredFindings>0;
 proposals.sort((a,b)=>BigInt(b.paperGrossUsdE27??'0')>BigInt(a.paperGrossUsdE27??'0')?1:
  BigInt(b.paperGrossUsdE27??'0')<BigInt(a.paperGrossUsdE27??'0')?-1:0);
 return {...base,status:proposals.length?'SANDBOX_PLAN_READY_NOT_AUTHORIZED':'NO_EXECUTABLE_SOURCE_REFERENCE',
  refreshed:risk.length,rejectedByRequiredRoute,boundedRecoveryAttempts,recoveredRateLimitedFindings,
  recoveredPriceFreshnessFindings,positiveSourcePlans:proposals.length,
  failedFreshReads:rows.filter(x=>x.status==='BLOCKED_FRESH_READ').length,
  recoveryDeferredFindings,recoveryBudgetExhausted,
  rows,bestProposal:proposals[0]??null,sandboxPlanReady:proposals.length>0};
}

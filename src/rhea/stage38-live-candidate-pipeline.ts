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
}
export interface Stage38Row {
 borrowerAccountId:string;historicalFindingIndex:number;
 status:'FRESH_SOURCE_PLAN_FOR_SANDBOX_ONLY'|'NO_CURRENT_SOURCE_SCENARIO'|'BLOCKED_FRESH_READ';
 observationBlockHeight:string|null;reasonCode:string|null;
 referenceInitialHealthBps:string|null;paperGrossUsdE27:string|null;
 executionEligible:false;netProfitVerified:false;
}
export interface Stage38Result {
 mode:'RHEA_STAGE38_LIVE_CANDIDATE_TO_SANDBOX';chain:'NEAR_MAINNET';
 status:'SANDBOX_PLAN_READY_NOT_AUTHORIZED'|'NO_EXECUTABLE_SOURCE_REFERENCE'|'BLOCKED_CANDIDATE_LIMIT';
 sourceBlockHeight:string;sourceDebtAccounts:number;
 startFinding:number;nextFinding:number;reviewed:number;paperAtRiskFromPreviousScan:number;
 refreshed:number;positiveSourcePlans:number;failedFreshReads:number;
 boundedRecoveryAttempts:number;recoveredRateLimitedFindings:number;
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
  !/^[1-9][0-9]{0,38}$/.test(o.minimumPaperGrossUsdE27))
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
  status:'BLOCKED_CANDIDATE_LIMIT',refreshed:0,positiveSourcePlans:0,failedFreshReads:0,
  rows:[],bestProposal:null,sandboxPlanReady:false};
 // Every authentic at-risk finding in the completed source window must receive
 // a fresh source evaluation, including cohorts larger than the old cap of 12.
 // Only results actually verified as positive can produce a Sandbox plan.
 const rows:Stage38Row[]=new Array(risk.length);
 const proposals:SourceLiquidationSizing[]=[];
 const retryAfterMs:(number|undefined)[]=new Array(risk.length);
 // Each retry observes current deployed code and a NEW pinned final block.
 // A failed, expired, malformed or untrusted oracle result is never promoted.
 const assess=async(i:number)=>{
  const f=risk[i]!,borrower=f.v.borrowerAccountId;
  let row:Stage38Row={
   borrowerAccountId:borrower,historicalFindingIndex:f.index,
   status:'BLOCKED_FRESH_READ',observationBlockHeight:null,
   reasonCode:'UNCLASSIFIED_READ_ERROR',referenceInitialHealthBps:null,
   paperGrossUsdE27:null,executionEligible:false,netProfitVerified:false,
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
   if(positive){
    buildStage37SandboxPlan(evidence);
    proposals.push(evidence);
   }
   row={...row,status:positive?'FRESH_SOURCE_PLAN_FOR_SANDBOX_ONLY':'NO_CURRENT_SOURCE_SCENARIO',
    observationBlockHeight:evidence.blockHeight,reasonCode:null,
    referenceInitialHealthBps:evidence.referenceInitialHealthBps,
    paperGrossUsdE27:positive?evidence.paperGrossUsdE27:null};
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
 // Stage60: the older Stage39 retry was tied to historical workflow artifacts.
 // Recover transient Stage38 failures IN THIS active, source-attested window.
 // Recheck serially after initial fan-out, with eight retries total per shard,
 // at most two per borrower, and never before a provider's Retry-After hint.
 let boundedRecoveryAttempts=0,recoveredRateLimitedFindings=0;
 for(let i=0;i<risk.length&&boundedRecoveryAttempts<8;i++){
  if(rows[i]?.status!=='BLOCKED_FRESH_READ'||
   rows[i]?.reasonCode!=='HTTP_RATE_LIMIT_OR_TIMEOUT')continue;
  for(let attempt=0;attempt<2&&boundedRecoveryAttempts<8;attempt++){
   const waitMs=Math.max(1500*2**attempt,retryAfterMs[i]??0);
   if(waitMs>30000)break; // Never ignore a long provider cooling period.
   await delay(waitMs);
   boundedRecoveryAttempts++;
   await assess(i);
   if(rows[i]?.status!=='BLOCKED_FRESH_READ'){
    recoveredRateLimitedFindings++;
    break;
   }
   if(rows[i]?.reasonCode!=='HTTP_RATE_LIMIT_OR_TIMEOUT')break;
  }
 }
 proposals.sort((a,b)=>BigInt(b.paperGrossUsdE27??'0')>BigInt(a.paperGrossUsdE27??'0')?1:
  BigInt(b.paperGrossUsdE27??'0')<BigInt(a.paperGrossUsdE27??'0')?-1:0);
 return {...base,status:proposals.length?'SANDBOX_PLAN_READY_NOT_AUTHORIZED':'NO_EXECUTABLE_SOURCE_REFERENCE',
  refreshed:risk.length,boundedRecoveryAttempts,recoveredRateLimitedFindings,
  positiveSourcePlans:proposals.length,
  failedFreshReads:rows.filter(x=>x.status==='BLOCKED_FRESH_READ').length,
  rows,bestProposal:proposals[0]??null,sandboxPlanReady:proposals.length>0};
}

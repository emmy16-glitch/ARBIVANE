import type {NearReadOnlyRpc} from './rpc.ts';
import {NearRpcHttpError} from './rpc.ts';
import type {CompletePagedIndex} from './complete-paged-index.ts';
import {checkSweepCheckpoint,type SweepCheckpoint,type SweepOptions} from './full-active-pyth-sweep.ts';
import {evaluateActualCandidate,type Stage38Options,type Stage38Result} from './stage38-live-candidate-pipeline.ts';
import {buildStage37SandboxPlan} from './stage37-sandbox-liquidation.ts';
import type {SourceLiquidationSizing} from './stage35-atomic-reference-sizing.ts';
import {classifyStage33Failure} from './stage33-diagnostics.ts';

/** Stage39: only recheck real, previously Pyth-paper-risk accounts whose Stage38
 * fresh sizing failed due to HTTP rate-limit / timeout.
 * No fake shortlist, no signing, no possible mainnet transaction.
 */
const UINT=/^(0|[1-9][0-9]{0,15})$/;
const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
export interface Stage39Options extends Omit<Stage38Options,'startFinding'|'maxFindings'> {
 baseCursor:number;
 maxRetries:number;maxRetryDelayMs:number;betweenAccountsMs:number;maxTargetAccounts:number;
}
export interface Stage39Result {
 mode:'RHEA_STAGE39_RATE_LIMITED_CANDIDATE_REVALIDATION';
 chain:'NEAR_MAINNET';
 status:'SANDBOX_REFERENCE_READY_ONLY'|'NO_VALID_SANDBOX_SOURCE_PLAN'|'BLOCKED_SOURCE_EVIDENCE';
 historicalMarketBlockHeight:string;sourceDebtAccounts:number;
 windowsChecked:number;priorPaperAtRisk:number;previousRateLimitFailures:number;
 attemptedFresh:number;noSafeScenario:number;blockedFresh:number;positiveSourcePlans:number;
 accountResults:Array<{
  borrowerAccountId:string;findingIndex:number;
  status:'SOURCE_PLAN_SANDBOX_ONLY'|'NO_SAFE_LIQUIDATION_SOURCE_SCENARIO'|'BLOCKED_RETRY_EXHAUSTED';
  attempts:number;reasonCode:string|null;
  observedBlockHeight:string|null;grossPaperUsdE27:string|null;
  executableMainnet:false;
 }>;
 bestProposal:SourceLiquidationSizing|null;
 sandboxPlanReady:boolean;
 mainnetExecutionEnabled:false;maySignMainnet:false;mayBroadcastMainnet:false;
 financingVerified:false;atomicTransferUnitsVerified:false;sandboxReplayed:false;profitVerified:false;
 warnings:string[];
}
type Candidate={borrowerAccountId:string;findingIndex:number};
const sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
export function selectStage39RateLimitedCandidates(
 source:CompletePagedIndex,sweeps:SweepCheckpoint[],previous:Stage38Result[],
 o:Stage39Options,
):Candidate[]{
 if(!source||source.mode!=='RHEA_COMPLETE_PAGED_INDEX_ATTESTATION'||
  source.status!=='COMPLETE_DEBT_INDEX_READ_ONLY'||source.chain!=='NEAR_MAINNET'||
  source.completeSnapshot!==true||source.zeroSchemaErrors!==true||
  source.executionEnabled!==false||source.liquidationEligible!==false||
  source.profitabilityVerified!==false||
  !Number.isSafeInteger(source.totalAccounts)||source.totalAccounts!==source.scannedAccounts||
  !Array.isArray(source.findings)||source.findings.length!==source.debtAccounts||
  !HASH.test(source.lendingCodeHash)||o.expectedLendingCodeHash!==source.lendingCodeHash||
  !UINT.test(source.blockHeight)||
  !Number.isSafeInteger(o.baseCursor)||o.baseCursor<0||o.baseCursor>=source.debtAccounts||
  !Number.isSafeInteger(o.maxRetries)||o.maxRetries<0||o.maxRetries>4||
  !Number.isSafeInteger(o.maxRetryDelayMs)||o.maxRetryDelayMs<0||o.maxRetryDelayMs>90000||
  !Number.isSafeInteger(o.betweenAccountsMs)||o.betweenAccountsMs<0||o.betweenAccountsMs>30000||
  !Number.isSafeInteger(o.maxTargetAccounts)||o.maxTargetAccounts<1||o.maxTargetAccounts>16||
  !Array.isArray(sweeps)||sweeps.length!==4||
  !Array.isArray(previous)||previous.length!==4)
  throw Error('INVALID_STAGE39_VERIFIED_SOURCE');
 const targets:Candidate[]=[];
 for(let i=0;i<4;i++){
  const cp=sweeps[i]!,old=previous[i]!;
  const start=o.baseCursor+i*80;
  // Stage38 used the original Stage32 exact debt windows.
  const options:SweepOptions={...o,startFinding:start,maxFindings:80,batchSize:20};
  checkSweepCheckpoint(source,options,cp);
  if(cp.nextFinding!==cp.targetEndFinding||
   old.mode!=='RHEA_STAGE38_LIVE_CANDIDATE_TO_SANDBOX'||
   old.chain!=='NEAR_MAINNET'||old.sourceBlockHeight!==source.blockHeight||
   old.sourceDebtAccounts!==source.debtAccounts||old.startFinding!==cp.startFinding||
   old.nextFinding!==cp.nextFinding||old.reviewed!==cp.processed||
   old.paperAtRiskFromPreviousScan!==cp.paperAtRisk||
   old.mainnetExecutionEnabled!==false||old.maySignMainnet!==false||
   old.mayBroadcastMainnet!==false||old.noEligibleMainnetTrades!==true||
   old.netProfitVerified!==false||old.walletApproved!==false||
   old.sandboxPlanReady!==false||old.bestProposal!==null||
   old.positiveSourcePlans!==0||!Array.isArray(old.rows)||
   old.rows.length!==cp.paperAtRisk)
   throw Error('STAGE39_UNTRUSTED_PRIOR_QUALIFICATION');
  const risks=cp.items.map((x,index)=>({x,index:cp.startFinding+index}))
   .filter(x=>x.x.classification==='PAPER_AT_RISK_UNAPPROVED');
  for(let j=0;j<risks.length;j++){
   const evidence=old.rows[j]!,one=risks[j]!;
   if(!evidence||evidence.borrowerAccountId!==one.x.borrowerAccountId||
    evidence.historicalFindingIndex!==one.index||
    evidence.executionEligible!==false||evidence.netProfitVerified!==false||
    evidence.status!=='BLOCKED_FRESH_READ'||
    evidence.reasonCode!=='HTTP_RATE_LIMIT_OR_TIMEOUT')
    throw Error('STAGE39_REQUIRES_ACTUAL_HTTP_BLOCKED_RISK_FINDING');
   targets.push({borrowerAccountId:one.x.borrowerAccountId,findingIndex:one.index});
  }
 }
 if(targets.length>o.maxTargetAccounts)throw Error('STAGE39_TOO_MANY_RISK_ACCOUNTS');
 return targets;
}
function wellFormedResult(e:SourceLiquidationSizing,account:string,o:Stage39Options):boolean{
 return !!e&&e.mode==='RHEA_STAGE35_PINNED_SOURCE_ONLY_LIQUIDATION_SIZING'&&
  e.chain==='NEAR_MAINNET'&&e.borrowerAccountId===account&&
  e.lendingCodeHash===o.expectedLendingCodeHash&&e.pythOracleCodeHash===o.expectedPythOracleCodeHash&&
  UINT.test(e.blockHeight)&&e.contractRouteParityVerified===false&&
  e.rawTokenDenominationsVerified===false&&e.sandboxStateReplaySucceeded===false&&
  e.gasAndSwapNetProfitVerified===false&&e.walletCapitalVerified===false&&
  e.mainnetWalletApproved===false&&e.executionEnabled===false&&e.maySign===false&&e.mayBroadcast===false;
}
function waitFor(e:unknown,attempt:number,o:Stage39Options):number|null{
 if(classifyStage33Failure(e)!=='HTTP_RATE_LIMIT_OR_TIMEOUT')return null;
 const hint=e instanceof NearRpcHttpError?e.retryAfterMs:undefined;
 const retryMs=Math.max(hint??0,1500*2**attempt);
 // NEVER ignore a provider's longer Retry-After to retry sooner.
 return retryMs>o.maxRetryDelayMs?null:retryMs;
}
export async function retryStage39Candidates(
 rpc:Pick<NearReadOnlyRpc,'view'|'viewAccount'>,
 source:CompletePagedIndex,sweeps:SweepCheckpoint[],previous:Stage38Result[],o:Stage39Options,
 evaluator:(account:string,options:Stage38Options)=>Promise<SourceLiquidationSizing>=
  (id,opts)=>evaluateActualCandidate(rpc,id,opts),
 delay:(ms:number)=>Promise<void>=sleep,
):Promise<Stage39Result>{
 const targets=selectStage39RateLimitedCandidates(source,sweeps,previous,o);
 const accountResults:Stage39Result['accountResults']=[];
 const proposals:SourceLiquidationSizing[]=[];
 const baseOpts:Stage38Options={...o,startFinding:o.baseCursor,maxFindings:80};
 let noSafeScenario=0,blockedFresh=0;
 for(let i=0;i<targets.length;i++){
  if(i>0&&o.betweenAccountsMs>0)await delay(o.betweenAccountsMs);
  const item=targets[i]!;let lastReason:string|null='UNCLASSIFIED_READ_ERROR';
  let status:'SOURCE_PLAN_SANDBOX_ONLY'|'NO_SAFE_LIQUIDATION_SOURCE_SCENARIO'|'BLOCKED_RETRY_EXHAUSTED'='BLOCKED_RETRY_EXHAUSTED';
  let observation:string|null=null,gross:string|null=null,attempts=0;
  for(let attempt=0;attempt<=o.maxRetries;attempt++){
   attempts++;
   try{
    const evidence=await evaluator(item.borrowerAccountId,baseOpts);
    if(!wellFormedResult(evidence,item.borrowerAccountId,o))
     throw Error('STAGE39_UNTRUSTED_FRESH_REFERENCE');
    observation=evidence.blockHeight;
    if(evidence.status==='PAPER_SCENARIOS_FOUND_NOT_EXECUTABLE'){
     if(evidence.referenceRulesPass!==true||
      !/^[1-9][0-9]*$/.test(evidence.paperGrossUsdE27??''))
      throw Error('STAGE39_UNTRUSTED_POSITIVE_SOURCE_SCENARIO');
     // Admission to Sandbox still requires Stage37 exact ABI safety gate.
     buildStage37SandboxPlan(evidence);
     gross=evidence.paperGrossUsdE27;proposals.push(evidence);
     status='SOURCE_PLAN_SANDBOX_ONLY';
    }else if(evidence.status==='NO_SAFE_SOURCE_SCENARIO'||
      evidence.status==='NO_CURRENT_REFERENCE_RISK'){
     status='NO_SAFE_LIQUIDATION_SOURCE_SCENARIO';noSafeScenario++;
    }else throw Error('STAGE39_UNKNOWN_SIZING_STATUS');
    lastReason=null;break;
   }catch(e){
    lastReason=classifyStage33Failure(e);
    const ms=waitFor(e,attempt,o);
    if(attempt===o.maxRetries||ms===null)break;
    await delay(ms);
   }
  }
  if(status==='BLOCKED_RETRY_EXHAUSTED')blockedFresh++;
  accountResults.push({borrowerAccountId:item.borrowerAccountId,
   findingIndex:item.findingIndex,status,attempts,reasonCode:lastReason,
   observedBlockHeight:observation,grossPaperUsdE27:gross,executableMainnet:false});
 }
 proposals.sort((a,b)=>{
  const x=BigInt(a.paperGrossUsdE27??'0'),y=BigInt(b.paperGrossUsdE27??'0');
  return x>y?-1:x<y?1:0;
 });
 return {
  mode:'RHEA_STAGE39_RATE_LIMITED_CANDIDATE_REVALIDATION',chain:'NEAR_MAINNET',
  status:proposals.length?'SANDBOX_REFERENCE_READY_ONLY':'NO_VALID_SANDBOX_SOURCE_PLAN',
  historicalMarketBlockHeight:source.blockHeight,sourceDebtAccounts:source.debtAccounts,
  windowsChecked:4,priorPaperAtRisk:targets.length,previousRateLimitFailures:targets.length,
  attemptedFresh:accountResults.length,noSafeScenario,blockedFresh,
  positiveSourcePlans:proposals.length,accountResults,bestProposal:proposals[0]??null,
  sandboxPlanReady:proposals.length>0,
  mainnetExecutionEnabled:false,maySignMainnet:false,mayBroadcastMainnet:false,
  financingVerified:false,atomicTransferUnitsVerified:false,sandboxReplayed:false,profitVerified:false,
  warnings:['PAPER_PRICING_AND_SOURCE_MATH_DO_NOT_PROVE_DEPLOYED_LIQUIDATION',
   'NO_ACTUAL_SANDBOX_REPLAY_UNTIL_VALIDATED_REFERENCE_SOURCE',
   'NEVER_TRADE_MAINNET_WITHOUT_EXACT_RECEIPTS_NET_PROFIT_AND_OWNER_AUTHORIZATION'],
 };
}

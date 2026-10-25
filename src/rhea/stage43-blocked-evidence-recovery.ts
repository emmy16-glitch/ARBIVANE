import type {NearReadOnlyRpc} from './rpc.ts';
import {NearRpcHttpError} from './rpc.ts';
import type {CompletePagedIndex} from './complete-paged-index.ts';
import type {ExecutionPythValuationReport} from './execution-pyth-valuation.ts';
import {inspectActivePythValuation} from './execution-pyth-valuation.ts';
import {evaluateActualCandidate,type Stage38Options} from './stage38-live-candidate-pipeline.ts';
import type {SourceLiquidationSizing} from './stage35-atomic-reference-sizing.ts';
import {buildStage37SandboxPlan} from './stage37-sandbox-liquidation.ts';
import {classifyStage33Failure} from './stage33-diagnostics.ts';
import {reconcileStage42Window,type Stage42Shard,type Stage42WindowReport} from './stage42-window-reconciliation.ts';

/** Stage43: recover ONLY actual blocked observations from a fully reconciled
 * Stage42 window. Each retry is a fresh, read-only observation; a paper
 * reference plan can enter the existing NEAR Sandbox path, never mainnet.
 */
const UINT=/^(0|[1-9][0-9]{0,77})$/;
const HEIGHT=/^[1-9][0-9]{0,15}$/;
const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
export type Stage43Origin='BLOCKED_INITIAL_PRICE'|'BLOCKED_RISK_RECHECK';
export interface Stage43Target {
 borrowerAccountId:string;findingIndex:number;origin:Stage43Origin;
}
export interface Stage43Options extends Omit<Stage38Options,'startFinding'|'maxFindings'> {
 baseCursor:number;maxTargets:number;maxRetries:number;
 maxRetryDelayMs:number;betweenAccountsMs:number;
}
export interface Stage43Row extends Stage43Target {
 status:'PAPER_HEALTHY_UNAPPROVED'|'NO_DEBT_NOW'|
  'NO_SAFE_SOURCE_SCENARIO'|'SOURCE_PLAN_SANDBOX_ONLY'|'BLOCKED_RETRY';
 attempts:number;reasonCode:string|null;freshBlockHeight:string|null;
 referenceHealthBps:string|null;grossPaperUsdE27:string|null;
 executionEligible:false;netProfitVerified:false;
}
export interface Stage43Report {
 mode:'RHEA_STAGE43_RECOVER_BLOCKED_BORROWER_EVIDENCE';chain:'NEAR_MAINNET';
 status:'NO_PRIOR_BLOCKERS'|'RETRY_FINISHED_WITH_BLOCKERS'|
  'RETRY_FINISHED_READ_ONLY'|'SANDBOX_REFERENCE_PLAN_ONLY';
 sourceBlockHeight:string;sourceDebtAccounts:number;stage42BaseCursor:number;
 stage42WindowEndCursor:number;originalWindowVisited:number;
 previouslyBlockedPricing:number;previouslyBlockedRiskRechecks:number;
 targets:number;attemptedFresh:number;recovered:number;stillBlocked:number;
 nowHealthy:number;noDebtNow:number;noSafeSourceScenario:number;
 positiveSourcePlans:number;rows:Stage43Row[];
 bestProposal:SourceLiquidationSizing|null;sandboxPlanReady:boolean;
 allMarketBorrowersRepriced:false;liquidationEligibilityVerified:false;
 realNetProfitVerified:false;mainnetExecutionEnabled:false;
 maySignMainnet:false;mayBroadcastMainnet:false;walletAuthorized:false;
 blockers:string[];
}
const exact=(n:unknown,a:number,b:number):n is number=>
 typeof n==='number'&&Number.isSafeInteger(n)&&n>=a&&n<=b;
const fail=(s:string):never=>{throw Error('STAGE43_'+s);};
/** Compare untrusted JSON objects irrespective of property ordering. */
function canonical(value:unknown):string{
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 const record=value as Record<string,unknown>;
 return '{'+Object.keys(record).sort().map(k=>JSON.stringify(k)+':'+canonical(record[k])).join(',')+'}';
}

export function selectStage43BlockedTargets(
 source:CompletePagedIndex,shards:Stage42Shard[],
 attestation:Stage42WindowReport,baseCursor:number,maxTargets:number,
):Stage43Target[]{
 if(!exact(maxTargets,1,320))fail('BAD_TARGET_BUDGET');
 const recomputed=reconcileStage42Window(source,shards,baseCursor);
 // A copied, edited, unrelated or incomplete aggregate is not valid input.
 if(canonical(recomputed)!==canonical(attestation))fail('STAGE42_AGGREGATE_DRIFT');
 const targets:Stage43Target[]=[];
 for(let shard=0;shard<4;shard++){
  const row=shards.find(s=>s.shard===shard)!;
  row.checkpoint.items.forEach((item,i)=>{
   if(item.classification.startsWith('BLOCKED')){
    targets.push({borrowerAccountId:item.borrowerAccountId,
     findingIndex:row.checkpoint.startFinding+i,origin:'BLOCKED_INITIAL_PRICE'});
   }
  });
  for(const item of row.qualification.rows){
   if(item.status==='BLOCKED_FRESH_READ'){
    targets.push({borrowerAccountId:item.borrowerAccountId,
     findingIndex:item.historicalFindingIndex,origin:'BLOCKED_RISK_RECHECK'});
   }
  }
 }
 targets.sort((a,b)=>a.findingIndex-b.findingIndex);
 if(targets.length>maxTargets)fail('MORE_BLOCKERS_THAN_RETRY_BUDGET');
 if(new Set(targets.map(x=>x.findingIndex)).size!==targets.length)
  fail('DUPLICATE_BORROWER_RETRY');
 for(const target of targets){
  const finding=source.findings[target.findingIndex];
  if(!finding||finding.accountId!==target.borrowerAccountId)
   fail('RETRY_NOT_IN_VERIFIED_SOURCE');
 }
 if(targets.filter(x=>x.origin==='BLOCKED_INITIAL_PRICE').length!==recomputed.blockedInitialReads||
  targets.filter(x=>x.origin==='BLOCKED_RISK_RECHECK').length!==recomputed.failedRiskRefreshes)
  fail('RETRY_TARGET_COUNT_MISMATCH');
 return targets;
}
type PriceCheck={status:'NO_DEBT_NOW'|'PAPER_HEALTHY_UNAPPROVED'|
 'PAPER_AT_RISK_UNAPPROVED';health:string|null;block:string};
function checkFreshPrice(e:ExecutionPythValuationReport,target:Stage43Target,
 source:CompletePagedIndex,o:Stage43Options):PriceCheck {
 if(!e||e.mode!=='RHEA_ACTIVE_EXECUTE_WITH_PYTH_VALUATION'||e.chain!=='NEAR_MAINNET'||
  e.borrowerAccountId!==target.borrowerAccountId||!HEIGHT.test(e.blockHeight)||
  e.lendingCodeHash!==o.expectedLendingCodeHash||
  e.pythOracleCodeHash!==o.expectedPythOracleCodeHash||
  e.executionEnabled!==false||e.maySign!==false||e.mayBroadcast!==false||
  e.profitVerified!==false||e.transactionReplayVerified!==false||
  e.sourceWasmReproduciblyMatched!==false||
  e.priceConstructionMatchesCurrentSdk!==true||
  e.deployedMetadataAndConfigObserved!==true||
  e.pythEnabled!==true||e.legacyOracleEnabled!==false||
  !Array.isArray(e.positions)||e.positions.length!==e.candidatePositions)
  fail('UNTRUSTED_FRESH_PRICE');
 if(e.status==='NO_DEBT'&&e.positions.length===0)
  return {status:'NO_DEBT_NOW',health:null,block:e.blockHeight};
 if(e.status!=='ACTIVE_PYTH_VALUE_RECONCILED_UNAPPROVED')
  fail('PRICE_INCOMPLETE_OR_UNKNOWN');
 const previous=source.findings[target.findingIndex]!;
 if(e.positions.length!==previous.positions.length)fail('POSITION_CHANGED');
 const health:bigint[]=[];
 for(const p of e.positions){
  const old=previous.positions.find(x=>x.positionId===p.positionId);
  if(!old||p.reason!==null||!Array.isArray(p.legs)||
   !UINT.test(p.healthFactorBps??'')||!UINT.test(p.adjustedDebtE27??'')||
   !UINT.test(p.adjustedCollateralE27??''))fail('POSITION_SCHEMA_CHANGED');
  const debt=BigInt(p.adjustedDebtE27!),collateral=BigInt(p.adjustedCollateralE27!);
  if(debt<=0n||BigInt(p.healthFactorBps!)!==collateral*10000n/debt)
   fail('PRICE_HEALTH_DRIFT');
  const borrowed=p.legs.filter(x=>x.role==='borrowed').map(x=>x.tokenId);
  if(borrowed.length!==old!.debtAssetIds.length||
   new Set(borrowed).size!==borrowed.length||
   borrowed.some(x=>!old!.debtAssetIds.includes(x)))
   fail('DEBT_ASSET_CHANGED');
  if(p.status!==(collateral<debt?'PAPER_AT_RISK_UNAPPROVED':'PAPER_HEALTHY_UNAPPROVED'))
   fail('PRICE_RISK_STATUS_DRIFT');
  health.push(BigInt(p.healthFactorBps!));
 }
 if(!health.length)fail('EMPTY_PRICE_POSITIONS');
 const atRisk=e.positions.some(p=>p.status==='PAPER_AT_RISK_UNAPPROVED');
 return {status:atRisk?'PAPER_AT_RISK_UNAPPROVED':'PAPER_HEALTHY_UNAPPROVED',
  health:health.reduce((a,b)=>a<b?a:b).toString(),block:e.blockHeight};
}
function checkSourcePlan(e:SourceLiquidationSizing,target:Stage43Target,o:Stage43Options):boolean{
 if(!e||e.mode!=='RHEA_STAGE35_PINNED_SOURCE_ONLY_LIQUIDATION_SIZING'||
  e.chain!=='NEAR_MAINNET'||e.borrowerAccountId!==target.borrowerAccountId||
  !HEIGHT.test(e.blockHeight)||e.lendingCodeHash!==o.expectedLendingCodeHash||
  e.pythOracleCodeHash!==o.expectedPythOracleCodeHash||
  e.contractRouteParityVerified!==false||e.rawTokenDenominationsVerified!==false||
  e.sandboxStateReplaySucceeded!==false||e.gasAndSwapNetProfitVerified!==false||
  e.walletCapitalVerified!==false||e.mainnetWalletApproved!==false||
  e.executionEnabled!==false||e.maySign!==false||e.mayBroadcast!==false)
  fail('UNTRUSTED_FRESH_SIZING');
 if(e.status==='NO_CURRENT_REFERENCE_RISK'||e.status==='NO_SAFE_SOURCE_SCENARIO'){
  if(e.referenceRulesPass!==false||e.repay!==null||e.seize!==null||
   e.paperGrossUsdE27!==null)fail('NEGATIVE_SIZING_CONTRADICTION');
  return false;
 }
 if(e.status!=='PAPER_SCENARIOS_FOUND_NOT_EXECUTABLE'||
  e.referenceRulesPass!==true||!UINT.test(e.paperGrossUsdE27??'')||
  BigInt(e.paperGrossUsdE27!)<=0n)fail('INVALID_POSITIVE_SOURCE_PLAN');
 buildStage37SandboxPlan(e);
 return true;
}
const sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
export async function recoverStage43Blocked(
 rpc:Pick<NearReadOnlyRpc,'view'|'viewAccount'>,
 source:CompletePagedIndex,shards:Stage42Shard[],attestation:Stage42WindowReport,
 o:Stage43Options,
 repricer:(account:string)=>Promise<ExecutionPythValuationReport>=id=>
  inspectActivePythValuation(rpc,{
   lendingContract:o.lendingContract,pythOracle:o.pythOracle,borrowerAccountId:id,
   expectedLendingCodeHash:o.expectedLendingCodeHash,
   expectedPythOracleCodeHash:o.expectedPythOracleCodeHash,nowMs:Date.now(),
   maxConfidenceBps:o.maxConfidenceBps,sanityMaxUsd:o.sanityMaxUsd,maxConcurrency:2,
  }),
 sizer:(account:string)=>Promise<SourceLiquidationSizing>=id=>
  evaluateActualCandidate(rpc,id,{...o,startFinding:o.baseCursor,maxFindings:80}),
 delay:(ms:number)=>Promise<void>=sleep,
 onProgress?:(processed:number,total:number)=>Promise<void>|void,
):Promise<Stage43Report>{
 if(!exact(o.baseCursor,0,250000)||!exact(o.maxRetries,0,3)||
  !exact(o.maxRetryDelayMs,1000,90000)||
  !exact(o.betweenAccountsMs,0,30000)||!exact(o.concurrency,1,2)||
  !HASH.test(o.expectedLendingCodeHash)||!HASH.test(o.expectedPythOracleCodeHash)||
  o.expectedLendingCodeHash!==source?.lendingCodeHash||
  o.lendingContract!=='contract.main.burrow.near'||o.pythOracle!=='aggregate-oracle.near'||
  !exact(o.maxRiskCandidates,1,16)||
  !exact(o.maxConfidenceBps,1,300)||!/^\d+$/.test(o.sanityMaxUsd)||
  !UINT.test(o.minimumPaperGrossUsdE27)||BigInt(o.minimumPaperGrossUsdE27)<=0n)
  fail('INVALID_READ_ONLY_RETRY_OPTIONS');
 const targets=selectStage43BlockedTargets(source,shards,attestation,o.baseCursor,o.maxTargets);
 const rows:Stage43Row[]=[];
 const proposals:SourceLiquidationSizing[]=[];
 for(let i=0;i<targets.length;i++){
  if(i>0&&o.betweenAccountsMs)await delay(o.betweenAccountsMs);
  const t=targets[i]!;
  const row:Stage43Row={...t,status:'BLOCKED_RETRY',attempts:0,
   reasonCode:'UNCLASSIFIED_READ_ERROR',freshBlockHeight:null,
   referenceHealthBps:null,grossPaperUsdE27:null,
   executionEligible:false,netProfitVerified:false};
  for(let k=0;k<=o.maxRetries;k++){
   row.attempts++;
   try{
    if(t.origin==='BLOCKED_INITIAL_PRICE'){
     const price=checkFreshPrice(await repricer(t.borrowerAccountId),t,source,o);
     row.referenceHealthBps=price.health;row.freshBlockHeight=price.block;
     if(price.status==='NO_DEBT_NOW'){
      row.status='NO_DEBT_NOW';row.reasonCode=null;break;
     }
     if(price.status==='PAPER_HEALTHY_UNAPPROVED'){
      row.status='PAPER_HEALTHY_UNAPPROVED';row.reasonCode=null;break;
     }
    }
    const sizing=await sizer(t.borrowerAccountId);
    const positive=checkSourcePlan(sizing,t,o);
    row.freshBlockHeight=sizing.blockHeight;
    row.referenceHealthBps=sizing.referenceInitialHealthBps;
    row.status=positive?'SOURCE_PLAN_SANDBOX_ONLY':'NO_SAFE_SOURCE_SCENARIO';
    row.grossPaperUsdE27=positive?sizing.paperGrossUsdE27:null;
    row.reasonCode=null;
    if(positive)proposals.push(sizing);
    break;
   }catch(e){
    row.reasonCode=classifyStage33Failure(e);
    // Never repeatedly query deterministic contract/parity/oracle failures.
    if(row.reasonCode!=='HTTP_RATE_LIMIT_OR_TIMEOUT'||k===o.maxRetries)break;
    const hinted=e instanceof NearRpcHttpError?e.retryAfterMs??0:0;
    const backoff=Math.max(hinted,1500*2**k);
    if(backoff>o.maxRetryDelayMs)break;
    await delay(backoff);
   }
  }
  rows.push(row);
  if(onProgress)await onProgress(rows.length,targets.length);
 }
 proposals.sort((a,b)=>BigInt(a.paperGrossUsdE27??'0')>BigInt(b.paperGrossUsdE27??'0')?-1:
  BigInt(a.paperGrossUsdE27??'0')<BigInt(b.paperGrossUsdE27??'0')?1:0);
 const blocked=rows.filter(x=>x.status==='BLOCKED_RETRY').length;
 const healthy=rows.filter(x=>x.status==='PAPER_HEALTHY_UNAPPROVED').length;
 const noDebt=rows.filter(x=>x.status==='NO_DEBT_NOW').length;
 const noSafe=rows.filter(x=>x.status==='NO_SAFE_SOURCE_SCENARIO').length;
 const positive=rows.filter(x=>x.status==='SOURCE_PLAN_SANDBOX_ONLY').length;
 return {mode:'RHEA_STAGE43_RECOVER_BLOCKED_BORROWER_EVIDENCE',chain:'NEAR_MAINNET',
  status:targets.length===0?'NO_PRIOR_BLOCKERS':positive?'SANDBOX_REFERENCE_PLAN_ONLY':
   blocked?'RETRY_FINISHED_WITH_BLOCKERS':'RETRY_FINISHED_READ_ONLY',
  sourceBlockHeight:source.blockHeight,sourceDebtAccounts:source.debtAccounts,
  stage42BaseCursor:o.baseCursor,stage42WindowEndCursor:o.baseCursor+320,
  originalWindowVisited:attestation.accountsVisited,
  previouslyBlockedPricing:attestation.blockedInitialReads,
  previouslyBlockedRiskRechecks:attestation.failedRiskRefreshes,
  targets:targets.length,attemptedFresh:rows.length,
  recovered:rows.length-blocked,stillBlocked:blocked,nowHealthy:healthy,
  noDebtNow:noDebt,noSafeSourceScenario:noSafe,positiveSourcePlans:positive,
  rows,bestProposal:proposals[0]??null,sandboxPlanReady:positive>0,
  allMarketBorrowersRepriced:false,liquidationEligibilityVerified:false,
  realNetProfitVerified:false,mainnetExecutionEnabled:false,
  maySignMainnet:false,mayBroadcastMainnet:false,walletAuthorized:false,
  blockers:['STAGE42_BORROWERS_ARE_FROM_HISTORICAL_DEBT_INDEX',
   ...(blocked?['SOME_RETRY_EVIDENCE_IS_STILL_BLOCKED']:[]),
   'SOURCE_REFERENCE_PLAN_IS_NOT_DEPLOYED_MAINNET_LIQUIDATION_PERMISSION',
   'SANDBOX_SETTLEMENT_IS_NOT_A_SOLD_COLLATERAL_SWAP_OR_NET_PROFIT',
   'NO_FINANCING_VERIFIED_MAINNET_SIGNER_OR_OWNER_LOSS_LIMITS'],
 };
}

import type {NearReadOnlyRpc} from './rpc.ts';
import type {CompletePagedIndex} from './complete-paged-index.ts';
import {checkSweepCheckpoint,type SweepCheckpoint,type SweepOptions} from './full-active-pyth-sweep.ts';
import {inspectActivePythValuation,type ExecutionPythValuationReport} from './execution-pyth-valuation.ts';

/** Stage33: recheck potential candidates and find WHY Stage32 blocked so many.
 * Source provenance and read-only, no unknown error strings leaked into artifacts.
 */
const ID=/^[a-z0-9._-]{2,64}$/;
type ReasonCode='HTTP_RATE_LIMIT_OR_TIMEOUT'|'PYTH_PRICE_STALE_OR_UNCERTAIN'|
 'PYTH_FEED_OR_ASSET_METADATA'|'DERIVED_ASSET_RATIO_UNAVAILABLE'|
 'CONTRACT_CONFIG_OR_CODE_DRIFT'|'POSITION_DATA_OR_REFERENCE_MATH'|'UNCLASSIFIED_READ_ERROR';
export function classifyStage33Failure(e:unknown):ReasonCode{
 const m=e instanceof Error?e.message:'';
 if(/HTTP (429|5[0-9][0-9])|fetch failed|timed? ?out|timeout|abort|ECONNRESET/i.test(m))
  return 'HTTP_RATE_LIMIT_OR_TIMEOUT';
 if(/STALE_OR_FUTURE_PYTH_PRICE|PYTH_CONFIDENCE_TOO_WIDE|INVALID_PYTH_PUBLISH_TIME/i.test(m))
  return 'PYTH_PRICE_STALE_OR_UNCERTAIN';
 if(/PYTH_INFO|PRICE_IDENTIFIER|MISSING_PYTH_QUOTE|MISSING_EXECUTION_PRICE_SOURCE|PYTH_QUOTE|INVALID_RECONSTRUCTED_PRICE/i.test(m))
  return 'PYTH_FEED_OR_ASSET_METADATA';
 if(/EXTRA_CALL|EXTRA_CALL_RATIO|RATIO/i.test(m))
  return 'DERIVED_ASSET_RATIO_UNAVAILABLE';
 if(/CODE_DRIFT|CONFIG_NOT_EXCLUSIVE|CROSS_BLOCK|DEPLOYMENT|CODE_HASH/i.test(m))
  return 'CONTRACT_CONFIG_OR_CODE_DRIFT';
 if(/SHARE|POOL|BALANCE|POSITION|ASSET|EXTRA_DECIMALS|VOLATILITY|VALUATION/i.test(m))
  return 'POSITION_DATA_OR_REFERENCE_MATH';
 return 'UNCLASSIFIED_READ_ERROR';
}
export interface Stage33Options extends Omit<SweepOptions,'startFinding'|'maxFindings'|'batchSize'> {
 baseCursor:number;maxBlockedPerShard:number;maxCandidates:number;
}
export interface Stage33Probe {
 accountId:string;origin:'PAPER_RISK'|'PREVIOUSLY_BLOCKED';
 originalFindingIndex:number;oldHealthBps:string|null;
 freshBlockHeight:string|null;
 classification:'PAPER_AT_RISK_UNAPPROVED'|'PAPER_HEALTHY_UNAPPROVED'|'NO_CURRENT_DEBT'|'BLOCKED';
 freshHealthBps:string|null;reasonCode:ReasonCode|null;
 executionEligible:false;profitVerified:false;
}
export interface Stage33Report {
 mode:'RHEA_STAGE33_ORACLE_FAILURE_DIAGNOSTICS';chain:'NEAR_MAINNET';
 status:'READ_ONLY_DIAGNOSTIC_COMPLETE'|'READ_ONLY_DIAGNOSTIC_HAS_BLOCKERS';
 sourceScanBlockHeight:string;sourceDebtAccounts:number;priorChecked:number;
 priorBlocked:number;priorPaperAtRisk:number;probed:number;
 paperAtRiskNow:number;healthyNow:number;blockedNow:number;noDebtNow:number;
 reasonCounts:Partial<Record<ReasonCode,number>>;
 observations:Stage33Probe[];
 liquidationEligibilityVerified:false;executionEnabled:false;maySign:false;mayBroadcast:false;
 sandboxReplayVerified:false;financingVerified:false;profitVerified:false;
 warnings:string[];
}
function exact(v:unknown,a:number,z:number):boolean{
 return typeof v==='number'&&Number.isSafeInteger(v)&&v>=a&&v<=z;
}
/** Validates complete Stage32 research shard windows, then chooses all at-risk
 * paper entries first and a small per-shard sample of previously blocked items.
 */
export function selectStage33ProbeTargets(
 source:CompletePagedIndex,shards:SweepCheckpoint[],o:Stage33Options,
):Array<{index:number;accountId:string;origin:Stage33Probe['origin'];oldHealthBps:string|null}>{
 if(!Array.isArray(shards)||shards.length!==4||
  !exact(o.baseCursor,0,source?.debtAccounts??0)||
  !exact(o.maxBlockedPerShard,1,6)||!exact(o.maxCandidates,1,24)||
  !exact(o.concurrency,1,3)||!ID.test(o.lendingContract)||!ID.test(o.pythOracle))
  throw Error('INVALID_STAGE33_PROBE_OPTIONS');
 const priority:Array<{index:number;accountId:string;origin:Stage33Probe['origin'];oldHealthBps:string|null}>=[];
 const blocked:typeof priority=[];
 for(let shard=0;shard<4;shard++){
  const cp=shards[shard]!;
  const options:SweepOptions={...o,startFinding:o.baseCursor+shard*80,maxFindings:80,batchSize:20};
  checkSweepCheckpoint(source,options,cp);
  if(cp.nextFinding!==cp.targetEndFinding)throw Error('STAGE33_REQUIRES_COMPLETED_SHARDS');
  let sampled=0;
  for(let i=0;i<cp.items.length;i++){
   const v=cp.items[i]!,index=cp.startFinding+i;
   if(v.classification==='PAPER_AT_RISK_UNAPPROVED'){
    priority.push({index,accountId:v.borrowerAccountId,origin:'PAPER_RISK',oldHealthBps:v.freshHealthBps});
   }else if(v.classification.startsWith('BLOCKED')&&sampled<o.maxBlockedPerShard){
    blocked.push({index,accountId:v.borrowerAccountId,origin:'PREVIOUSLY_BLOCKED',oldHealthBps:null});
    sampled++;
   }
  }
 }
 if(priority.length>o.maxCandidates)throw Error('STAGE33_TOO_MANY_PRIORITIES_FOR_BUDGET');
 return [...priority,...blocked].slice(0,o.maxCandidates);
}
function checkedResult(raw:ExecutionPythValuationReport,id:string):
  Pick<Stage33Probe,'classification'|'freshHealthBps'|'reasonCode'|'freshBlockHeight'>{
 if(!raw||raw.mode!=='RHEA_ACTIVE_EXECUTE_WITH_PYTH_VALUATION'||
   raw.borrowerAccountId!==id||raw.chain!=='NEAR_MAINNET'||raw.executionEnabled!==false||
   raw.maySign!==false||raw.mayBroadcast!==false||raw.profitVerified!==false||
   raw.transactionReplayVerified!==false||raw.sourceWasmReproduciblyMatched!==false||
   raw.priceConstructionMatchesCurrentSdk!==true||
   !/^[1-9][0-9]{0,15}$/.test(raw.blockHeight)||!Array.isArray(raw.positions))
  throw Error('UNTRUSTED_STAGE33_EVALUATION');
 if(raw.status==='NO_DEBT'&&raw.positions.length===0)
  return {classification:'NO_CURRENT_DEBT',freshHealthBps:null,reasonCode:null,freshBlockHeight:raw.blockHeight};
 if(raw.status!=='ACTIVE_PYTH_VALUE_RECONCILED_UNAPPROVED'||raw.positions.some(x=>x.status==='BLOCKED'))
  return {classification:'BLOCKED',freshHealthBps:null,reasonCode:'POSITION_DATA_OR_REFERENCE_MATH',freshBlockHeight:raw.blockHeight};
 const numbers=raw.positions.map(x=>x.healthFactorBps);
 if(numbers.length===0||numbers.some(x=>x===null||!/^(0|[1-9][0-9]*)$/.test(x)))throw Error('INVALID_STAGE33_HEALTH');
 const risk=raw.positions.some(x=>x.status==='PAPER_AT_RISK_UNAPPROVED');
 const min=numbers.map(x=>BigInt(x!)).reduce((a,b)=>a<b?a:b).toString();
 return {classification:risk?'PAPER_AT_RISK_UNAPPROVED':'PAPER_HEALTHY_UNAPPROVED',
  freshHealthBps:min,reasonCode:null,freshBlockHeight:raw.blockHeight};
}
export async function diagnoseStage32BlockedAndRisk(
 rpc:Pick<NearReadOnlyRpc,'view'|'viewAccount'>,source:CompletePagedIndex,shards:SweepCheckpoint[],
 o:Stage33Options,
 evaluator:(id:string)=>Promise<ExecutionPythValuationReport>=(borrowerAccountId)=>
  inspectActivePythValuation(rpc,{
   lendingContract:o.lendingContract,pythOracle:o.pythOracle,borrowerAccountId,
   expectedLendingCodeHash:o.expectedLendingCodeHash,
   expectedPythOracleCodeHash:o.expectedPythOracleCodeHash,
   nowMs:Date.now(),maxConfidenceBps:o.maxConfidenceBps,
   sanityMaxUsd:o.sanityMaxUsd,maxConcurrency:2,
  }),
):Promise<Stage33Report>{
 const targets=selectStage33ProbeTargets(source,shards,o);
 const priorBlocked=shards.reduce((n,x)=>n+x.blocked,0);
 const priorPaperAtRisk=shards.reduce((n,x)=>n+x.paperAtRisk,0);
 const observations:Stage33Probe[]=new Array(targets.length);
 let next=0;
 await Promise.all(Array.from({length:Math.min(o.concurrency,targets.length)},async()=>{
  while(next<targets.length){
   const i=next++;const t=targets[i]!;
   let state:ReturnType<typeof checkedResult>;
   try{state=checkedResult(await evaluator(t.accountId),t.accountId);}
   catch(e){state={classification:'BLOCKED',freshHealthBps:null,
    reasonCode:classifyStage33Failure(e),freshBlockHeight:null};}
   observations[i]={accountId:t.accountId,origin:t.origin,originalFindingIndex:t.index,
    oldHealthBps:t.oldHealthBps,...state,executionEligible:false,profitVerified:false};
  }
 }));
 const reasonCounts:Stage33Report['reasonCounts']={};
 for(const x of observations)if(x.reasonCode)reasonCounts[x.reasonCode]=(reasonCounts[x.reasonCode]??0)+1;
 const blockedNow=observations.filter(x=>x.classification==='BLOCKED').length;
 return {mode:'RHEA_STAGE33_ORACLE_FAILURE_DIAGNOSTICS',chain:'NEAR_MAINNET',
  status:blockedNow?'READ_ONLY_DIAGNOSTIC_HAS_BLOCKERS':'READ_ONLY_DIAGNOSTIC_COMPLETE',
  sourceScanBlockHeight:source.blockHeight,sourceDebtAccounts:source.debtAccounts,
  priorChecked:shards.reduce((n,x)=>n+x.processed,0),priorBlocked,priorPaperAtRisk,
  probed:targets.length,
  paperAtRiskNow:observations.filter(x=>x.classification==='PAPER_AT_RISK_UNAPPROVED').length,
  healthyNow:observations.filter(x=>x.classification==='PAPER_HEALTHY_UNAPPROVED').length,
  noDebtNow:observations.filter(x=>x.classification==='NO_CURRENT_DEBT').length,
  blockedNow,reasonCounts,observations,
  liquidationEligibilityVerified:false,executionEnabled:false,maySign:false,mayBroadcast:false,
  sandboxReplayVerified:false,financingVerified:false,profitVerified:false,
  warnings:['GODLIKE_AND_OTHER_PAPER_RISK_POSITIONS_ARE_NOT_DEPLOYED_LIQUIDATION_ELIGIBLE',
    'FAILURE_CODES_ARE_BOUNDED_DIAGNOSTICS_NOT_RAW_RPC_ERRORS',
    'NO_SANDBOX_REPLAY_WALLET_FINANCING_SWAP_PROFIT_OR_SIGNED_TRANSACTION']};
}

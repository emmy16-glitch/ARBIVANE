import type {CompletePagedIndex} from './complete-paged-index.ts';
import type {NearReadOnlyRpc} from './rpc.ts';
import {refreshIndexedBorrowerCandidates,type RepriceQueueOptions} from './active-pyth-debt-queue.ts';
import {reconcileStage42Window,type Stage42Shard,type Stage42WindowReport} from './stage42-window-reconciliation.ts';
import type {ExecutionPythValuationReport} from './execution-pyth-valuation.ts';

/** Stage 43: recheck ONLY genuine Stage42 failed observations, not all historic debt.
 * This is read-only current-health research, never a liquidation or net-profit claim.
 */
export interface Stage43Target {
 findingIndex:number;borrowerAccountId:string;
 origin:'INITIAL_HEALTH_BLOCKED'|'PAPER_RISK_FRESH_SIZING_BLOCKED';
 originalReasonCode:string|null;
}
export interface Stage43Options extends Omit<RepriceQueueOptions,'fromFinding'|'maxFindings'> {
 fromTarget:number;maxTargets:number;pinnedBlockHeight:number;
}
export interface Stage43Observation extends Stage43Target {
 status:'PAPER_AT_RISK_NEEDS_FRESH_SIZING'|'PAPER_HEALTHY_UNAPPROVED'|
  'NO_DEBT_NOW'|'STILL_BLOCKED';
 freshBlockHeight:string|null;healthBps:string|null;
 reasonCode:string|null;executionEligible:false;netProfitVerified:false;
}
export interface Stage43Report {
 mode:'RHEA_STAGE43_RECONCILED_BLOCKED_OBSERVATION_RETRY';chain:'NEAR_MAINNET';
 status:'NO_BLOCKED_TARGETS'|'RETRY_BATCH_COMPLETE_RESEARCH_ONLY'|'RETRY_BATCH_WITH_BLOCKERS';
 originalSourceBlockHeight:string;originalSourceDebtAccounts:number;
 stage42BaseCursor:number;stage42EndCursor:number;
 currentPricingBlockHeight:string;targetCount:number;fromTarget:number;nextTarget:number;
 remainingTargets:number;processed:number;stillBlocked:number;
 paperAtRiskNeedsSizing:number;paperHealthy:number;noDebtNow:number;
 observations:Stage43Observation[];
 currentMarketCompletelyScreened:false;deployedLiquidationParityVerified:false;
 transactionReplayVerified:false;positiveNetProfitVerified:false;
 executionEnabled:false;maySignMainnet:false;mayBroadcastMainnet:false;
 blockers:string[];
}
const safe=(v:unknown,min:number,max:number):v is number=>
 typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const UINT=/^[1-9][0-9]{0,15}$/;
const fail=(why:string):never=>{throw Error('STAGE43_'+why);};

/** Independently derive failed-account identities from original Stage42 artifacts.
 * The saved aggregate must exactly match a freshly recomputed Stage42 attestation.
 */
export function collectStage43BlockedTargets(
 source:CompletePagedIndex,shards:Stage42Shard[],saved:Stage42WindowReport,
 baseCursor:number,
):Stage43Target[]{
 const verified=reconcileStage42Window(source,shards,baseCursor);
 if(!saved||typeof saved!=='object'||
  Object.keys(saved).length!==Object.keys(verified).length||
  Object.entries(verified).some(([k,v])=>
   JSON.stringify((saved as unknown as Record<string,unknown>)[k])!==JSON.stringify(v)))
  fail('STAGE42_AGGREGATE_MISMATCH');
 const targets:Stage43Target[]=[];
 for(let shard=0;shard<4;shard++){
  const pair=shards.find(s=>s.shard===shard);
  if(!pair)throw Error('STAGE43_MISSING_SHARD');
  for(let i=0;i<pair.checkpoint.items.length;i++){
   const item=pair.checkpoint.items[i]!;
   if(item.classification.startsWith('BLOCKED')){
    targets.push({findingIndex:pair.checkpoint.startFinding+i,
     borrowerAccountId:item.borrowerAccountId,origin:'INITIAL_HEALTH_BLOCKED',
     originalReasonCode:item.reason??null});
   }
  }
  for(const row of pair.qualification.rows){
   if(row.status==='BLOCKED_FRESH_READ'){
    targets.push({findingIndex:row.historicalFindingIndex,
     borrowerAccountId:row.borrowerAccountId,
     origin:'PAPER_RISK_FRESH_SIZING_BLOCKED',originalReasonCode:row.reasonCode});
   }
  }
 }
 targets.sort((a,b)=>a.findingIndex-b.findingIndex);
 const seen=new Set<number>();
 for(const t of targets){
  const f=source.findings[t.findingIndex];
  if(!f||f.accountId!==t.borrowerAccountId||seen.has(t.findingIndex)||
   (t.originalReasonCode!==null&&!/^[A-Z0-9_]{1,80}$/.test(t.originalReasonCode)))
   fail('INVALID_OR_DUPLICATE_RETRY_TARGET');
  seen.add(t.findingIndex);
 }
 if(targets.length!==verified.blockedInitialReads+verified.failedRiskRefreshes)
  fail('FAILED_COUNT_MISMATCH');
 return targets;
}
export async function retryStage43BlockedObservations(
 rpc:Pick<NearReadOnlyRpc,'view'|'viewAccount'>,
 source:CompletePagedIndex,shards:Stage42Shard[],saved:Stage42WindowReport,
 baseCursor:number,o:Stage43Options,
 evaluator?:(id:string)=>Promise<ExecutionPythValuationReport>,
):Promise<Stage43Report>{
 const targets=collectStage43BlockedTargets(source,shards,saved,baseCursor);
 if(!safe(o.fromTarget,0,targets.length)||!safe(o.maxTargets,1,12)||
  !safe(o.concurrency,1,2)||!safe(o.pinnedBlockHeight,1,Number.MAX_SAFE_INTEGER)||
  !UINT.test(String(o.pinnedBlockHeight))||
  o.expectedLendingCodeHash!==source.lendingCodeHash)
  fail('INVALID_READONLY_RETRY_OPTIONS');
 const selected=targets.slice(o.fromTarget,o.fromTarget+o.maxTargets);
 const observations:Stage43Observation[]=[];
 for(const target of selected){
  // Stage31 validates the entire verified historic source again, source position
  // identities, active Pyth freshness, code hashes and shared current block.
  const res=await refreshIndexedBorrowerCandidates(rpc,source,{
   ...o,fromFinding:target.findingIndex,maxFindings:1,
  },evaluator);
  const item=res.items[0];
  if(!item)throw Error('STAGE43_MISSING_REPRICE_ITEM');
  if(res.processed!==1||res.nextFinding!==target.findingIndex+1||
   res.pricingBlockHeight!==String(o.pinnedBlockHeight)||!item||
   item.borrowerAccountId!==target.borrowerAccountId||
   item.executionEligible!==false||item.tradeProfitVerified!==false)
   fail('UNTRUSTED_REPRICE_EVIDENCE');
  const disposition=item.classification;
  const status:Stage43Observation['status']=disposition==='PAPER_AT_RISK_UNAPPROVED'?
   'PAPER_AT_RISK_NEEDS_FRESH_SIZING':disposition==='PAPER_HEALTHY_UNAPPROVED'?
   'PAPER_HEALTHY_UNAPPROVED':disposition==='NO_DEBT_NOW'?'NO_DEBT_NOW':'STILL_BLOCKED';
  if(status!=='STILL_BLOCKED'&&item.freshBlockHeight!==String(o.pinnedBlockHeight))
   fail('CROSS_BLOCK_RESULT');
  observations.push({...target,status,
   freshBlockHeight:item.freshBlockHeight,healthBps:item.freshHealthBps,
   reasonCode:status==='STILL_BLOCKED'?(item.reason??'BLOCKED_UNCLASSIFIED'):null,
   executionEligible:false,netProfitVerified:false});
 }
 const stillBlocked=observations.filter(x=>x.status==='STILL_BLOCKED').length;
 const paperAtRiskNeedsSizing=observations.filter(x=>x.status==='PAPER_AT_RISK_NEEDS_FRESH_SIZING').length;
 const paperHealthy=observations.filter(x=>x.status==='PAPER_HEALTHY_UNAPPROVED').length;
 const noDebtNow=observations.filter(x=>x.status==='NO_DEBT_NOW').length;
 const nextTarget=o.fromTarget+selected.length;
 return {
  mode:'RHEA_STAGE43_RECONCILED_BLOCKED_OBSERVATION_RETRY',chain:'NEAR_MAINNET',
  status:targets.length===0?'NO_BLOCKED_TARGETS':stillBlocked?'RETRY_BATCH_WITH_BLOCKERS':
   'RETRY_BATCH_COMPLETE_RESEARCH_ONLY',
  originalSourceBlockHeight:source.blockHeight,originalSourceDebtAccounts:source.debtAccounts,
  stage42BaseCursor:baseCursor,stage42EndCursor:baseCursor+320,
  currentPricingBlockHeight:String(o.pinnedBlockHeight),
  targetCount:targets.length,fromTarget:o.fromTarget,nextTarget,
  remainingTargets:targets.length-nextTarget,processed:selected.length,stillBlocked,
  paperAtRiskNeedsSizing,paperHealthy,noDebtNow,observations,
  currentMarketCompletelyScreened:false,deployedLiquidationParityVerified:false,
  transactionReplayVerified:false,positiveNetProfitVerified:false,
  executionEnabled:false,maySignMainnet:false,mayBroadcastMainnet:false,
  blockers:[
   'ONLY_PRIOR_FAILED_STAGE42_OBSERVATIONS_RETRIED_NOT_ALL_MARKET_ACCOUNTS',
   ...(stillBlocked?['SOME_RPC_OR_ORACLE_READS_STILL_BLOCKED']:[]),
   ...(nextTarget<targets.length?['RETRY_CURSOR_NOT_YET_EXHAUSTED']:[]),
   ...(paperAtRiskNeedsSizing?['PAPER_RISK_REQUIRES_NEW_SOURCE_SIZING_AND_SANDBOX_REPLAY']:[]),
   'NO_DEPLOYED_LIQUIDATION_PARITY_FINANCING_SWAP_GAS_OR_REALIZED_PROFIT',
   'MAINNET_SIGNING_AND_BROADCASTING_DISABLED',
  ],
 };
}

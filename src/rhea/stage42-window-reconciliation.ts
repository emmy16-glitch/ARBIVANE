import type {CompletePagedIndex} from './complete-paged-index.ts';
import {checkSweepCheckpoint,type SweepCheckpoint,type SweepOptions} from './full-active-pyth-sweep.ts';
import type {Stage38Result} from './stage38-live-candidate-pipeline.ts';

/** Attest one bounded historical-debt repricing window. No RPC, signing or transactions. */
export interface Stage42Shard {
 shard:number;checkpoint:SweepCheckpoint;qualification:Stage38Result;
}
export interface Stage42WindowReport {
 mode:'RHEA_STAGE42_VERIFIED_BORROWER_WINDOW';chain:'NEAR_MAINNET';
 status:'WINDOW_RECONCILED_NO_BLOCKED_READS'|'WINDOW_RECONCILED_WITH_BLOCKED_READS';
 historicalSourceBlockHeight:string;historicalSourceDebtAccounts:number;
 baseCursor:number;endCursor:number;shardsReconciled:4;
 accountsVisited:number;paperAtRisk:number;paperHealthy:number;
 noDebtNow:number;blockedInitialReads:number;failedRiskRefreshes:number;
 sourceReferencePlansForSandboxOnly:number;
 everyHistoricalFindingVisited:true;allCurrentHealthVerified:false;
 liquidationEligibilityVerified:false;positiveNetProfitVerified:false;
 executionEnabled:false;maySignMainnet:false;mayBroadcastMainnet:false;
 blockers:string[];
}
const safe=(x:unknown,min:number,max:number)=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=min&&x<=max;
const assert=(ok:unknown,reason:string):void=>{if(!ok)throw Error('STAGE42_'+reason);};
export function reconcileStage42Window(
 source:CompletePagedIndex,shards:Stage42Shard[],baseCursor:number,
):Stage42WindowReport{
 assert(source?.mode==='RHEA_COMPLETE_PAGED_INDEX_ATTESTATION'&&
  source.chain==='NEAR_MAINNET'&&source.status==='COMPLETE_DEBT_INDEX_READ_ONLY'&&
  source.completeSnapshot===true&&source.zeroSchemaErrors===true&&
  source.executionEnabled===false&&source.liquidationEligible===false&&
  source.profitabilityVerified===false&&source.scannedAccounts===source.totalAccounts&&
  source.debtAccounts===source.findings?.length,'SOURCE_NOT_FULLY_VERIFIED');
 assert(safe(baseCursor,0,source.debtAccounts)&&baseCursor+320<=source.debtAccounts,
  'WINDOW_OUT_OF_BOUNDS');
 assert(Array.isArray(shards)&&shards.length===4,'MISSING_OR_EXTRA_SHARDS');
 const seen=new Set<string>();
 let paperAtRisk=0,paperHealthy=0,noDebtNow=0,blockedInitialReads=0;
 let failedRiskRefreshes=0,sourceReferencePlansForSandboxOnly=0;
 for(let shard=0;shard<4;shard++){
  const row=shards.find(s=>s?.shard===shard);
  assert(row!==undefined&&shards.filter(s=>s?.shard===shard).length===1,'DUPLICATE_OR_MISSING_SHARD_'+shard);
  const cp=row!.checkpoint,q=row!.qualification;
  const start=baseCursor+80*shard,end=start+80;
  // The source checkpoint verifier matches every borrower ID and position ID.
  checkSweepCheckpoint(source,{startFinding:start,maxFindings:80} as SweepOptions,cp);
  assert(cp.nextFinding===end&&cp.targetEndFinding===end&&cp.processed===80,
   'INCOMPLETE_WINDOW_'+shard);
  for(const x of cp.items){
   assert(!seen.has(x.borrowerAccountId),'REPEATED_BORROWER_ACROSS_SHARDS');
   seen.add(x.borrowerAccountId);
  }
  const expectedRisk=cp.items.map((x,i)=>({x,index:start+i}))
   .filter(x=>x.x.classification==='PAPER_AT_RISK_UNAPPROVED');
  assert(q?.mode==='RHEA_STAGE38_LIVE_CANDIDATE_TO_SANDBOX'&&
   q.chain==='NEAR_MAINNET'&&q.sourceBlockHeight===source.blockHeight&&
   q.sourceDebtAccounts===source.debtAccounts&&q.startFinding===start&&
   q.nextFinding===end&&q.reviewed===80&&
   q.paperAtRiskFromPreviousScan===expectedRisk.length&&
   q.status!=='BLOCKED_CANDIDATE_LIMIT'&&
   q.refreshed===expectedRisk.length&&
   q.mainnetExecutionEnabled===false&&q.maySignMainnet===false&&
   q.mayBroadcastMainnet===false&&q.netProfitVerified===false&&
   q.walletApproved===false&&q.noEligibleMainnetTrades===true&&
   q.sandboxReplaySucceeded===false&&q.liquidationRuleParityVerified===false&&
   Array.isArray(q.rows)&&q.rows.length===expectedRisk.length,
   'QUALIFICATION_PROVENANCE_OR_GATE_'+shard);
  let failed=0,positive=0;
  for(let i=0;i<expectedRisk.length;i++){
   const a=q.rows[i]!,b=expectedRisk[i]!;
   assert(a.borrowerAccountId===b.x.borrowerAccountId&&
    a.historicalFindingIndex===b.index&&
    a.executionEligible===false&&a.netProfitVerified===false&&
    ['BLOCKED_FRESH_READ','NO_CURRENT_SOURCE_SCENARIO','FRESH_SOURCE_PLAN_FOR_SANDBOX_ONLY'].includes(a.status),
    'QUALIFICATION_ROW_MISMATCH_'+shard);
   if(a.status==='BLOCKED_FRESH_READ')failed++;
   if(a.status==='FRESH_SOURCE_PLAN_FOR_SANDBOX_ONLY')positive++;
  }
  assert(q.failedFreshReads===failed&&q.positiveSourcePlans===positive&&
   q.sandboxPlanReady===(positive>0)&&
   q.status===(positive>0?'SANDBOX_PLAN_READY_NOT_AUTHORIZED':'NO_EXECUTABLE_SOURCE_REFERENCE')&&
   (positive===0?q.bestProposal===null:q.bestProposal!==null),
   'QUALIFICATION_COUNTS_MISMATCH_'+shard);
  paperAtRisk+=cp.paperAtRisk;paperHealthy+=cp.paperHealthy;
  noDebtNow+=cp.noDebtNow;blockedInitialReads+=cp.blocked;
  failedRiskRefreshes+=failed;sourceReferencePlansForSandboxOnly+=positive;
 }
 assert(seen.size===320&&paperAtRisk+paperHealthy+noDebtNow+blockedInitialReads===320,
  'COVERAGE_GAP');
 const blocked=blockedInitialReads+failedRiskRefreshes>0;
 return {
  mode:'RHEA_STAGE42_VERIFIED_BORROWER_WINDOW',chain:'NEAR_MAINNET',
  status:blocked?'WINDOW_RECONCILED_WITH_BLOCKED_READS':'WINDOW_RECONCILED_NO_BLOCKED_READS',
  historicalSourceBlockHeight:source.blockHeight,historicalSourceDebtAccounts:source.debtAccounts,
  baseCursor,endCursor:baseCursor+320,shardsReconciled:4,
  accountsVisited:320,paperAtRisk,paperHealthy,noDebtNow,
  blockedInitialReads,failedRiskRefreshes,sourceReferencePlansForSandboxOnly,
  everyHistoricalFindingVisited:true,allCurrentHealthVerified:false,
  liquidationEligibilityVerified:false,positiveNetProfitVerified:false,
  executionEnabled:false,maySignMainnet:false,mayBroadcastMainnet:false,
  blockers:[
   'HISTORICAL_REGISTRY_WINDOW_NOT_CURRENT_MARKET_ELIGIBILITY',
   ...(blocked?['BLOCKED_ORACLE_OR_RPC_READS_REMAIN_UNRESOLVED']:[]),
   'SOURCE_REFERENCE_SPREAD_IS_NOT_DEPLOYED_LIQUIDATION_OR_PROFIT',
   'NO_MAINNET_WALLET_APPROVAL_FINANCING_EXECUTION_OR_REALIZED_NET_PNL',
  ],
 };
}

import type {CompletePagedIndex} from './complete-paged-index.ts';
import {refreshIndexedBorrowerCandidates,type RepriceQueueReport,type RepriceQueueOptions,type RepriceQueueItem} from './active-pyth-debt-queue.ts';
import type {NearReadOnlyRpc} from './rpc.ts';

/** Stage 32: bounded, restartable scheduler over actual Stage 30 debt findings.
 * A completed slice is NOT whole-market health or executable liquidation proof.
 * All per-borrower reads use Stage31's active Pyth model.
 */
const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
export interface SweepOptions extends Omit<RepriceQueueOptions,'fromFinding'|'maxFindings'> {
 startFinding:number;maxFindings:number;batchSize:number;
}
export interface SweepCheckpoint {
 version:1;mode:'RHEA_STAGE32_RESUMABLE_PYTH_REPRICE_SWEEP';chain:'NEAR_MAINNET';
 sourceBlockHeight:string;sourceCodeHash:string;sourceTotalAccounts:number;sourceDebtAccounts:number;
 startFinding:number;targetEndFinding:number;nextFinding:number;
 processed:number;paperAtRisk:number;paperHealthy:number;noDebtNow:number;blocked:number;
 items:RepriceQueueItem[];
 executionEnabled:false;maySign:false;mayBroadcast:false;
 liquidationEligibilityVerified:false;profitVerified:false;
}
export interface SweepReport extends SweepCheckpoint {
 status:'PARTIAL_SNAPSHOT_COVERAGE'|'SOURCE_DEBT_CURSOR_COMPLETE';
 remainingTotalDebtFindings:number;completeSnapshotPriced:boolean;
 warnings:string[];
}
const integer=(v:unknown,min:number,max:number)=>Number.isSafeInteger(v)&&typeof v==='number'&&v>=min&&v<=max;
const dispositions=new Set(['PAPER_AT_RISK_UNAPPROVED','PAPER_HEALTHY_UNAPPROVED','NO_DEBT_NOW',
 'BLOCKED_INCOMPLETE_QUOTES','BLOCKED_SOURCE_POSITION_CHANGED','BLOCKED_RPC']);
export function checkSweepCheckpoint(
 source:CompletePagedIndex,o:SweepOptions,cp:SweepCheckpoint,
):void {
 const end=Math.min(source.debtAccounts,o.startFinding+o.maxFindings);
 if(!cp||cp.version!==1||cp.mode!=='RHEA_STAGE32_RESUMABLE_PYTH_REPRICE_SWEEP'||
  cp.chain!=='NEAR_MAINNET'||cp.executionEnabled!==false||cp.maySign!==false||
  cp.mayBroadcast!==false||cp.liquidationEligibilityVerified!==false||
  cp.profitVerified!==false||cp.sourceBlockHeight!==source.blockHeight||
  cp.sourceCodeHash!==source.lendingCodeHash||cp.sourceTotalAccounts!==source.totalAccounts||
  cp.sourceDebtAccounts!==source.debtAccounts||
  cp.startFinding!==o.startFinding||cp.targetEndFinding!==end||
  !integer(cp.nextFinding,o.startFinding,end)||
  !Array.isArray(cp.items)||cp.items.length!==cp.nextFinding-o.startFinding||
  cp.processed!==cp.items.length||
  ![cp.paperAtRisk,cp.paperHealthy,cp.noDebtNow,cp.blocked].every(v=>integer(v,0,cp.processed))||
  cp.paperAtRisk+cp.paperHealthy+cp.noDebtNow+cp.blocked!==cp.processed)
  throw Error('STAGE32_REJECTED_UNTRUSTED_RESUME_CHECKPOINT');
 const seen=new Set<string>();const counts={risk:0,healthy:0,none:0,blocked:0};
 for(let i=0;i<cp.items.length;i++){
  const row=cp.items[i]!,f=source.findings[o.startFinding+i];
  if(!row||!f||row.borrowerAccountId!==f.accountId||seen.has(row.borrowerAccountId)||
   !dispositions.has(row.classification)||row.executionEligible!==false||row.tradeProfitVerified!==false||
   !Array.isArray(row.sourcePositionIds)||
   row.sourcePositionIds.length!==f.positions.length||
   row.sourcePositionIds.some((p,k)=>p!==f.positions[k]?.positionId))
   throw Error('STAGE32_BAD_RESUMED_BORROWER_ITEM');
  seen.add(row.borrowerAccountId);
  if(row.classification==='PAPER_AT_RISK_UNAPPROVED')counts.risk++;
  else if(row.classification==='PAPER_HEALTHY_UNAPPROVED')counts.healthy++;
  else if(row.classification==='NO_DEBT_NOW')counts.none++;
  else counts.blocked++;
 }
 if(counts.risk!==cp.paperAtRisk||counts.healthy!==cp.paperHealthy||
 counts.none!==cp.noDebtNow||counts.blocked!==cp.blocked)
  throw Error('STAGE32_CHECKPOINT_COUNTS_MISMATCH');
}
function progress(base:SweepCheckpoint):SweepReport{
 return {...base,status:base.nextFinding===base.sourceDebtAccounts?
  'SOURCE_DEBT_CURSOR_COMPLETE':'PARTIAL_SNAPSHOT_COVERAGE',
  remainingTotalDebtFindings:base.sourceDebtAccounts-base.nextFinding,
  completeSnapshotPriced:base.startFinding===0&&base.nextFinding===base.sourceDebtAccounts&&base.blocked===0,
  warnings:['FULL_MARKET_DEBT_SNAPSHOT_IS_HISTORICAL_NOT_LIVE_ELIGIBILITY',
   'PAPER_HEALTH_NEVER_APPROVES_A_LIQUIDATION',
   'BLOCKED_ACCOUNTS_REQUIRE_A_SEPARATE_RETRY_WITH_CURRENT_PRICES',
   'NO_SIGNER_SANDBOX_TRANSACTION_OR_REAL_PROFIT']};
}
export async function sweepIndexedDebtWithActivePyth(
 rpc:Pick<NearReadOnlyRpc,'view'|'viewAccount'>,source:CompletePagedIndex,o:SweepOptions,
 resume?:SweepCheckpoint,
 onCheckpoint?:(value:SweepCheckpoint,report:SweepReport)=>Promise<void>|void,
 evaluate?:Parameters<typeof refreshIndexedBorrowerCandidates>[3],
):Promise<SweepReport>{
 if(!source||source.mode!=='RHEA_COMPLETE_PAGED_INDEX_ATTESTATION'||source.completeSnapshot!==true||
  source.status!=='COMPLETE_DEBT_INDEX_READ_ONLY'||source.zeroSchemaErrors!==true||
  source.liquidationEligible!==false||source.executionEnabled!==false||source.profitabilityVerified!==false||
  !HASH.test(source.lendingCodeHash)||!Array.isArray(source.findings)||source.debtAccounts!==source.findings.length||
  !integer(o.startFinding,0,source.debtAccounts)||
  !integer(o.maxFindings,1,320)||!integer(o.batchSize,1,20)||
  !integer(o.concurrency,1,3))
  throw Error('INVALID_STAGE32_SOURCE_OR_BUDGET');
 const end=Math.min(source.debtAccounts,o.startFinding+o.maxFindings);
 const cp:SweepCheckpoint=resume?structuredClone(resume):{
  version:1,mode:'RHEA_STAGE32_RESUMABLE_PYTH_REPRICE_SWEEP',chain:'NEAR_MAINNET',
  sourceBlockHeight:source.blockHeight,sourceCodeHash:source.lendingCodeHash,
  sourceTotalAccounts:source.totalAccounts,sourceDebtAccounts:source.debtAccounts,
  startFinding:o.startFinding,targetEndFinding:end,nextFinding:o.startFinding,
  processed:0,paperAtRisk:0,paperHealthy:0,noDebtNow:0,blocked:0,items:[],
  executionEnabled:false,maySign:false,mayBroadcast:false,
  liquidationEligibilityVerified:false,profitVerified:false};
 if(resume)checkSweepCheckpoint(source,o,cp);
 // Still call Stage31 on an empty window to ensure provenance and configured code
 // hashes cannot bypass the original full-index validation.
 if(cp.nextFinding===end){
  const empty=await refreshIndexedBorrowerCandidates(rpc,source,{
   ...o,fromFinding:end,maxFindings:1},evaluate);
  if(empty.processed!==0&&end===source.debtAccounts)throw Error('STAGE32_END_CURSOR_INCONSISTENT');
  return progress(cp);
 }
 for(;cp.nextFinding<end;){
  const before=cp.nextFinding,limit=Math.min(o.batchSize,end-before);
  const batch:RepriceQueueReport=await refreshIndexedBorrowerCandidates(rpc,source,{
   ...o,fromFinding:before,maxFindings:limit},evaluate);
  if(batch.fromFinding!==before||batch.nextFinding!==before+limit||
   batch.processed!==limit||batch.items.length!==limit||
   batch.sourceBlockHeight!==source.blockHeight||
   batch.sourceCodeHash!==source.lendingCodeHash||
   batch.executionEnabled!==false||batch.maySign!==false||batch.mayBroadcast!==false||
   batch.currentLiquidationEligibilityProven!==false||batch.transactionReplayPerformed!==false||
   batch.profitVerified!==false)
   throw Error('STAGE32_UNTRUSTED_BATCH_OUTPUT');
  cp.items.push(...batch.items);cp.nextFinding=batch.nextFinding;
  cp.processed+=batch.processed;
  cp.paperAtRisk+=batch.paperAtRisk;cp.paperHealthy+=batch.paperHealthy;
  cp.noDebtNow+=batch.noDebtNow;cp.blocked+=batch.blocked;
  checkSweepCheckpoint(source,o,cp);
  if(onCheckpoint)await onCheckpoint(structuredClone(cp),progress(cp));
 }
 return progress(cp);
}

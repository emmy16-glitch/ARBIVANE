import type {NearReadOnlyRpc} from './rpc.ts';
import {validateObservedDetailedShard} from './observed-shard-evidence.ts';
import {parseParityPools} from './deployed-share-parity.ts';
import {parseDetailedBorrower} from './detailed-debt-index.ts';
import {inspectIndexedRheaHealth, type IndexedHealthOutput} from './indexed-health-pipeline.ts';
import type {DebtBackfillCheckpoint} from './market-debt-index.ts';

/** Stage 22: re-discover each borrower and price only at the newest finalized NEAR block.
 * The old shard contributes account IDs ONLY; it is NOT a live price snapshot.
 * No wallet, transaction, call args for liquidation, or executive authorization. */
const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const ID=/^[a-z0-9._-]{2,64}$/;
export interface FreshReviewOptions {
  lendingContract:string;oracleContract:string;shardId:number;shardCount:number;
  fromFinding:number;maxFindings:number;nowMs:number;maxPriceAgeMs:number;
  maxPriceQueries:number;expectedLendingCodeHash?:string;expectedOracleCodeHash?:string;
}
export type FreshBlocker='SOURCE_INDEX_DRIFT'|'SOURCE_DETAIL_CHANGED'|'FRESH_INDEX_DRIFT'|
  'FRESH_DETAIL_UNAVAILABLE'|'NO_CURRENT_BORROWING'|'CONTRACT_CHANGED'|'RPC_UNAVAILABLE';
export interface FreshReviewRecord {
  accountId:string;sourceIndex:number;
  status:'REFRESHED_PAPER_ONLY'|'BLOCKED';reason:FreshBlocker|null;
  health:IndexedHealthOutput|null;
  executionEnabled:false;liquidationEligible:false;profitabilityVerified:false;
}
export interface FreshReviewReport {
  mode:'NEAR_RHEA_FRESH_BORROWER_RECHECK';sourceBlockHeight:string;freshBlockHeight:string;
  sourceShardId:number;sourceShardCount:number;sourceBorrowersObserved:number;
  inspected:number;refreshed:number;blocked:number;paperAtRisk:number;paperHealthy:number;
  status:'FRESH_PAPER_EVIDENCE_UNAPPROVED'|'INCOMPLETE_EVIDENCE';
  records:FreshReviewRecord[];
  executionEnabled:false;deployedLiquidationParityVerified:false;custodyVerified:false;netProfitVerified:false;
  warnings:string[];
}
function validNumber(x:number,min:number,max:number):boolean {
  return Number.isSafeInteger(x)&&x>=min&&x<=max;
}
function numberCount(raw:unknown):number {
  if((typeof raw!=='number'&&typeof raw!=='string')||!/^(0|[1-9][0-9]{0,7})$/.test(String(raw)))throw Error('INVALID_FRESH_ACCOUNT_COUNT');
  const n=Number(raw);if(!validNumber(n,1,20_000_000))throw Error('INVALID_FRESH_ACCOUNT_COUNT');return n;
}
function matches(a:{positions:{positionId:string|null;debtAssetIds:string[];collateralRecorded:boolean}[]}|null,
 b:{positions:{positionId:string|null;debtAssetIds:string[];collateralRecorded:boolean}[]}):boolean {
 return a!==null&&a.positions.length===b.positions.length&&b.positions.every(old=>a.positions.some(now=>
  now.positionId===old.positionId&&now.collateralRecorded===old.collateralRecorded&&
  now.debtAssetIds.length===old.debtAssetIds.length&&old.debtAssetIds.every(id=>now.debtAssetIds.includes(id))));
}
export async function inspectFreshBorrowers(rpc:NearReadOnlyRpc,raw:unknown,o:FreshReviewOptions):Promise<FreshReviewReport>{
 const {checkpoint:source,evidence}=validateObservedDetailedShard(raw,o.shardId,o.shardCount);
 if(!ID.test(o.lendingContract)||!ID.test(o.oracleContract)||o.lendingContract!==source.lendingContract||
    !validNumber(o.fromFinding,0,source.findings.length)||!validNumber(o.maxFindings,1,8)||
    !validNumber(o.maxPriceQueries,1,32)||!validNumber(o.maxPriceAgeMs,1000,120000)||
    !validNumber(o.nowMs,1500000000000,Number.MAX_SAFE_INTEGER)||
    Math.abs(Date.now()-o.nowMs)>30000||
    [o.expectedLendingCodeHash,o.expectedOracleCodeHash].some(x=>x!==undefined&&!HASH.test(x)))
  throw Error('INVALID_FRESH_RESEARCH_OPTIONS');
 const oldHeight=Number(source.blockHeight);
 const [historical,latest]=await Promise.all([
  rpc.viewAccount(o.lendingContract,oldHeight),rpc.viewAccount(o.lendingContract),
 ]);
 if(historical.blockHeight!==source.blockHeight||historical.codeHash!==source.lendingCodeHash||
   !validNumber(Number(latest.blockHeight),oldHeight,Number.MAX_SAFE_INTEGER))throw Error('UNATTESTED_SOURCE_OR_FRESH_BLOCK');
 const freshHeight=Number(latest.blockHeight);
 const [oldNum,oldAssets,newNum,newAssets]=await Promise.all([
  rpc.view<unknown>(o.lendingContract,'get_num_accounts',{},oldHeight),
  rpc.view<unknown>(o.lendingContract,'get_assets_paged',{},oldHeight),
  rpc.view<unknown>(o.lendingContract,'get_num_accounts',{},freshHeight),
  rpc.view<unknown>(o.lendingContract,'get_assets_paged',{},freshHeight),
 ]);
 if([oldNum,oldAssets].some(v=>v.blockHeight!==source.blockHeight)||
    [newNum,newAssets].some(v=>v.blockHeight!==latest.blockHeight)||
    numberCount(oldNum.value)!==source.totalAccounts)throw Error('FRESH_SNAPSHOT_INCONSISTENT');
 const currentCount=numberCount(newNum.value);
 const historicalPools=parseParityPools(oldAssets.value),currentPools=parseParityPools(newAssets.value);
 const borrowedPoolBalancePositive=[...currentPools.values()].some(p=>p.borrowed.shares>0n||p.borrowed.balance>0n);
 const candidates=source.findings.slice(o.fromFinding,o.fromFinding+o.maxFindings);
 const records:FreshReviewRecord[]=[];let refreshed=0,paperAtRisk=0,paperHealthy=0;
 const skip=(accountId:string,index:number,reason:FreshBlocker):void=>{
  records.push({accountId,sourceIndex:index,status:'BLOCKED',reason,health:null,
    executionEnabled:false,liquidationEligible:false,profitabilityVerified:false});
 };
 for(const finding of candidates){
  const localIndex=source.seenAccountIds.indexOf(finding.accountId);
  if(localIndex<0)throw Error('SOURCE_FINDING_NOT_INDEXED');
  const index=source.startIndex+localIndex;
  if(latest.codeHash!==source.lendingCodeHash||
    o.expectedLendingCodeHash&&latest.codeHash!==o.expectedLendingCodeHash){skip(finding.accountId,index,'CONTRACT_CHANGED');continue;}
  if(index>=currentCount){skip(finding.accountId,index,'FRESH_INDEX_DRIFT');continue;}
  try {
   const [oldPage,oldDetail]=await Promise.all([
    rpc.view<unknown>(o.lendingContract,'get_accounts_paged',{from_index:index,limit:1},oldHeight),
    rpc.view<unknown>(o.lendingContract,'get_account_all_positions',{account_id:finding.accountId},oldHeight),
   ]);
   if(oldPage.blockHeight!==source.blockHeight||oldDetail.blockHeight!==source.blockHeight)throw Error('SOURCE_BLOCK_DRIFT');
   const oldRows=oldPage.value;
   if(!Array.isArray(oldRows)||oldRows.length!==1||oldRows[0]?.account_id!==finding.accountId){skip(finding.accountId,index,'SOURCE_INDEX_DRIFT');continue;}
   if(!matches(parseDetailedBorrower(oldDetail.value,finding.accountId,historicalPools),finding)){
    skip(finding.accountId,index,'SOURCE_DETAIL_CHANGED');continue;
   }
   const [page,detail]=await Promise.all([
    rpc.view<unknown>(o.lendingContract,'get_accounts_paged',{from_index:index,limit:1},freshHeight),
    rpc.view<unknown>(o.lendingContract,'get_account_all_positions',{account_id:finding.accountId},freshHeight),
   ]);
   if(page.blockHeight!==latest.blockHeight||detail.blockHeight!==latest.blockHeight)throw Error('FRESH_BLOCK_DRIFT');
   if(!Array.isArray(page.value)||page.value.length!==1||page.value[0]?.account_id!==finding.accountId){
    skip(finding.accountId,index,'FRESH_INDEX_DRIFT');continue;
   }
   const now=parseDetailedBorrower(detail.value,finding.accountId,currentPools);
   if(!now){skip(finding.accountId,index,'NO_CURRENT_BORROWING');continue;}
   // One-account, same-new-block checkpoint. No claim of full-market coverage.
   const micro:DebtBackfillCheckpoint & {sourceView:'get_account_all_positions'}={
    version:1,mode:'NEAR_RHEA_SAME_BLOCK_BACKFILL',chain:'NEAR_MAINNET',executionEnabled:false,
    liquidationParityVerified:false,lendingContract:o.lendingContract,blockHeight:latest.blockHeight,
    lendingCodeHash:latest.codeHash,codeHashPinProvided:true,totalAccounts:currentCount,
    startIndex:index,targetEndIndex:index+1,nextIndex:index+1,scannedAccounts:1,
    invalidAccounts:0,schemaReasons:{},seenAccountIds:[finding.accountId],findings:[now],
    completeSnapshot:false,borrowedPoolBalancePositive,sourceView:'get_account_all_positions',
   };
   const health=await inspectIndexedRheaHealth(rpc,micro,{
    lendingContract:o.lendingContract,oracleContract:o.oracleContract,fromFinding:0,maxFoundAccounts:1,
    maxPriceQueries:o.maxPriceQueries,nowMs:o.nowMs,maxAgeMs:o.maxPriceAgeMs,
    maxFutureSkewMs:2000,maxConfidenceBps:150,
    expectedLendingCodeHash:latest.codeHash,expectedOracleCodeHash:o.expectedOracleCodeHash,
   });
   records.push({accountId:finding.accountId,sourceIndex:index,status:'REFRESHED_PAPER_ONLY',reason:null,health,
    executionEnabled:false,liquidationEligible:false,profitabilityVerified:false});
   refreshed++;paperAtRisk+=health.paperAtRisk;paperHealthy+=health.paperHealthy;
  }catch(e){
   // Never call an unavailable price, source view, cross-block read, or broken account a safe candidate.
   skip(finding.accountId,index,'RPC_UNAVAILABLE');
  }
 }
 return {mode:'NEAR_RHEA_FRESH_BORROWER_RECHECK',sourceBlockHeight:source.blockHeight,
  freshBlockHeight:latest.blockHeight,sourceShardId:o.shardId,sourceShardCount:o.shardCount,
  sourceBorrowersObserved:evidence.observedDebtAccounts,inspected:records.length,refreshed,blocked:records.length-refreshed,
  paperAtRisk,paperHealthy,status:records.length===refreshed&&records.every(r=>r.health?.blockedPositions===0)?
   'FRESH_PAPER_EVIDENCE_UNAPPROVED':'INCOMPLETE_EVIDENCE',records,
  executionEnabled:false,deployedLiquidationParityVerified:false,custodyVerified:false,netProfitVerified:false,
  warnings:['SOURCE_IDS_INDEPENDENTLY_REVALIDATED_ON_OLD_AND_FRESH_BLOCKS','NEWEST_FINALIZED_NEAR_BLOCK_FOR_QUOTES',
   'NO_DEPLOYED_WASM_LIQUIDATION_PARITY','NO_SIGNER_OR_TRANSACTION_OR_FINANCING_PROOF','NO_REAL_MONEY_EXECUTION'],
 };
}

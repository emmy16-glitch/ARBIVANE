import type {NearReadOnlyRpc} from './rpc.ts';
import {parseParityPools} from './deployed-share-parity.ts';
import {parseDetailedBorrower} from './detailed-debt-index.ts';
import {retryWaitMs,summarizeDebtBackfill,type DebtBackfillCheckpoint,type DebtBackfillSummary} from './market-debt-index.ts';

/** Uses the deployed bulk detailed-position view. One RPC page replaces N
 * get_account_all_positions calls while preserving one-block consistency. */
const ID=/^[a-z0-9._-]{2,64}$/;
const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
export interface PagedPositionIndexOptions {
 lendingContract:string;pinnedBlockHeight:number;expectedLendingCodeHash:string;
 startIndex:number;maxAccounts:number;pageSize:number;concurrency:number;maxRetries:number;
 batchDelayMs?:number;retryBaseDelayMs?:number;checkpointEveryBatches?:number;
}
export interface PagedPositionCheckpoint extends DebtBackfillCheckpoint {
 sourceView:'get_accounts_all_positions_paged';
}
function valid(n:number,min:number,max:number){return Number.isSafeInteger(n)&&n>=min&&n<=max;}
function settings(o:PagedPositionIndexOptions){
 if(!ID.test(o.lendingContract)||!HASH.test(o.expectedLendingCodeHash)||!valid(o.pinnedBlockHeight,1,Number.MAX_SAFE_INTEGER)||
  !valid(o.startIndex,0,20_000_000)||!valid(o.maxAccounts,1,250_000)||!valid(o.pageSize,1,50)||
  !valid(o.concurrency,1,16)||!valid(o.maxRetries,0,8)||
  (o.batchDelayMs!==undefined&&!valid(o.batchDelayMs,0,10000))||
  (o.retryBaseDelayMs!==undefined&&!valid(o.retryBaseDelayMs,0,120000)))throw Error('INVALID_PAGED_POSITION_INDEX_OPTIONS');
 if(o.checkpointEveryBatches!==undefined&&!valid(o.checkpointEveryBatches,1,100))throw Error('INVALID_CHECKPOINT_INTERVAL');
}
async function retry<T>(op:()=>Promise<T>,tries:number,base:number):Promise<T>{
 for(let n=0;;n++)try{return await op();}catch(e){
  if(n>=tries||!(e instanceof Error)||!/HTTP 429|HTTP 5\d\d|fetch failed|timeout|aborted/i.test(e.message))throw e;
  await sleep(retryWaitMs(e,n,base));
 }
}
function count(v:unknown){
 const n=typeof v==='number'?v:typeof v==='string'&&/^(0|[1-9][0-9]{0,7})$/.test(v)?Number(v):NaN;
 if(!valid(n,0,20_000_000))throw Error('INVALID_ACCOUNT_COUNT');return n;
}
function obj(v:unknown):Record<string,unknown>{
 if(v===null||typeof v!=='object'||Array.isArray(v))throw Error('INVALID_BULK_ACCOUNT');return v as Record<string,unknown>;
}
function validateResume(cp:PagedPositionCheckpoint,o:PagedPositionIndexOptions,total:number,end:number,hash:string){
 if(cp.version!==1||cp.mode!=='NEAR_RHEA_SAME_BLOCK_BACKFILL'||cp.chain!=='NEAR_MAINNET'||cp.executionEnabled!==false||
  cp.liquidationParityVerified!==false||cp.sourceView!=='get_accounts_all_positions_paged'||cp.lendingContract!==o.lendingContract||
  cp.blockHeight!==String(o.pinnedBlockHeight)||cp.lendingCodeHash!==hash||cp.totalAccounts!==total||cp.startIndex!==o.startIndex||
  cp.targetEndIndex!==end||cp.nextIndex!==cp.startIndex+cp.scannedAccounts||cp.nextIndex>end||
  cp.seenAccountIds.length!==cp.scannedAccounts||new Set(cp.seenAccountIds).size!==cp.seenAccountIds.length||
  cp.findings.some(x=>!cp.seenAccountIds.includes(x.accountId)))throw Error('INCOMPATIBLE_PAGED_POSITION_CHECKPOINT');
}
export async function indexPagedPositions(
 rpc:Pick<NearReadOnlyRpc,'viewAccount'|'view'>,o:PagedPositionIndexOptions,resume?:PagedPositionCheckpoint,
 onCheckpoint?:(checkpoint:PagedPositionCheckpoint,summary:DebtBackfillSummary)=>Promise<void>|void,
):Promise<{checkpoint:PagedPositionCheckpoint;summary:DebtBackfillSummary}>{
 settings(o);const base=o.retryBaseDelayMs??5000;
 const account=await retry(()=>rpc.viewAccount(o.lendingContract,o.pinnedBlockHeight),o.maxRetries,base);
 if(account.blockHeight!==String(o.pinnedBlockHeight)||account.codeHash!==o.expectedLendingCodeHash)throw Error('PINNED_CODE_OR_BLOCK_MISMATCH');
 const [assetsView,countView]=await Promise.all([
  retry(()=>rpc.view<unknown>(o.lendingContract,'get_assets_paged',{},o.pinnedBlockHeight),o.maxRetries,base),
  retry(()=>rpc.view<unknown>(o.lendingContract,'get_num_accounts',{},o.pinnedBlockHeight),o.maxRetries,base),
 ]);
 if(assetsView.blockHeight!==account.blockHeight||countView.blockHeight!==account.blockHeight)throw Error('PAGED_POSITION_METADATA_BLOCK_MISMATCH');
 const pools=parseParityPools(assetsView.value),total=count(countView.value);
 if(o.startIndex>total)throw Error('START_INDEX_EXCEEDS_ACCOUNT_COUNT');
 const end=Math.min(total,o.startIndex+o.maxAccounts);
 const poolDebt=[...pools.values()].some(x=>x.borrowed.shares>0n||x.borrowed.balance>0n);
 const cp:PagedPositionCheckpoint=resume?structuredClone(resume):{
  version:1,mode:'NEAR_RHEA_SAME_BLOCK_BACKFILL',chain:'NEAR_MAINNET',executionEnabled:false,liquidationParityVerified:false,
  sourceView:'get_accounts_all_positions_paged',lendingContract:o.lendingContract,blockHeight:account.blockHeight,
  lendingCodeHash:account.codeHash,codeHashPinProvided:true,totalAccounts:total,startIndex:o.startIndex,targetEndIndex:end,
  nextIndex:o.startIndex,scannedAccounts:0,invalidAccounts:0,schemaReasons:{},seenAccountIds:[],findings:[],
  completeSnapshot:false,borrowedPoolBalancePositive:poolDebt,
 };
 if(resume)validateResume(cp,o,total,end,account.codeHash);
 if(cp.borrowedPoolBalancePositive!==poolDebt)throw Error('PAGED_POSITION_POOL_DEBT_DRIFT');
 const seen=new Set(cp.seenAccountIds);
 let batches=0;
 while(cp.nextIndex<end){
  const jobs:Array<{from:number;limit:number}>=[];let cursor=cp.nextIndex;
  for(let i=0;i<o.concurrency&&cursor<end;i++){
   const limit=Math.min(o.pageSize,end-cursor);jobs.push({from:cursor,limit});cursor+=limit;
  }
  const pages=await Promise.all(jobs.map(async job=>{
   const v=await retry(()=>rpc.view<unknown>(o.lendingContract,'get_accounts_all_positions_paged',
    {from_index:job.from,limit:job.limit},o.pinnedBlockHeight),o.maxRetries,base);
   if(v.blockHeight!==account.blockHeight||!Array.isArray(v.value)||v.value.length!==job.limit)
    throw Error('BULK_POSITION_PAGE_BLOCK_OR_LENGTH_MISMATCH');
   return v.value;
  }));
  // Commit a concurrent batch only after every page succeeded and parsed.
  const batch:Array<{id:string;finding:ReturnType<typeof parseDetailedBorrower>}>=[];
  const local=new Set<string>();
  for(const page of pages)for(const raw of page){
   const row=obj(raw),id=row.account_id;
   if(typeof id!=='string'||!ID.test(id)||seen.has(id)||local.has(id))throw Error('INVALID_OR_DUPLICATE_BULK_ACCOUNT');
   local.add(id);batch.push({id,finding:parseDetailedBorrower(raw,id,pools)});
  }
  for(const row of batch){seen.add(row.id);cp.seenAccountIds.push(row.id);if(row.finding)cp.findings.push(row.finding);}
  cp.scannedAccounts+=batch.length;cp.nextIndex+=batch.length;
  cp.completeSnapshot=cp.startIndex===0&&cp.nextIndex===total;
  batches++;
  if(onCheckpoint&&(batches%(o.checkpointEveryBatches??1)===0||cp.nextIndex===end))
   await onCheckpoint(structuredClone(cp),summarizeDebtBackfill(cp));
  if((o.batchDelayMs??0)>0&&cp.nextIndex<end)await sleep(o.batchDelayMs!);
 }
 return {checkpoint:cp,summary:summarizeDebtBackfill(cp)};
}

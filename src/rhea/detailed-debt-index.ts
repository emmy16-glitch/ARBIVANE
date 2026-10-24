import type {NearReadOnlyRpc} from './rpc.ts';
import {parseParityPools, type ParityPool} from './deployed-share-parity.ts';
import {detailedDebtPositions} from './debt-schema-witness.ts';
import {retryWaitMs, summarizeDebtBackfill, type DebtBackfillCheckpoint, type DebtBackfillSummary} from './market-debt-index.ts';
import type {DebtAccountFinding} from './debt-discovery.ts';

/** Account registry is ONLY an ID index. Loan status comes from the contract's
 * get_account_all_positions at the SAME pinned NEAR block. */
const ID=/^[a-z0-9._-]{2,64}$/;
const UINT=/^(0|[1-9][0-9]{0,38})$/;
const MAX_U128=(1n<<128n)-1n;
const sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
export interface DetailedIndexOptions {
 lendingContract:string;startIndex:number;maxAccounts:number;pageSize:number;detailConcurrency:number;maxRetries:number;
 pinnedBlockHeight:number;expectedLendingCodeHash:string;batchDelayMs?:number;retryBaseDelayMs?:number;
}
export interface DetailedIndexCheckpoint extends DebtBackfillCheckpoint {
 sourceView:'get_account_all_positions';
}
function u128(v:unknown):bigint{
 if(typeof v!=='string'||!UINT.test(v)||BigInt(v)>MAX_U128)throw Error('INVALID_EXACT_ACCOUNT_SHARES');return BigInt(v);
}
function obj(v:unknown):Record<string,unknown>{
 if(v===null||typeof v!=='object'||Array.isArray(v))throw Error('INVALID_POSITION_OBJECT');return v as Record<string,unknown>;
}
/** This never copies debt from the paged account entry. */
export function parseDetailedBorrower(raw:unknown,accountId:string,pools:Map<string,ParityPool>):DebtAccountFinding|null{
 if(!ID.test(accountId))throw Error('INVALID_ACCOUNT_ID');
 const detailed=obj(raw),positions=detailedDebtPositions(detailed,new Set(pools.keys()));
 const all=obj(detailed.positions);
 const findings:DebtAccountFinding['positions']=[];
 for(const [positionId,tokens] of positions){
  const position=obj(all[positionId]);let collateralRecorded=false;
  const collateral=position.collateral;
  if(!Array.isArray(collateral))throw Error('INVALID_DETAILED_COLLATERAL');
  for(const entry of collateral){const row=obj(entry);if(u128(row.shares)>0n)collateralRecorded=true;}
  findings.push({positionId,debtAssetIds:tokens,collateralRecorded});
 }
 if(!findings.length)return null;
 findings.sort((a,b)=>a.positionId!.localeCompare(b.positionId!));
 return {accountId,positions:findings,classification:'DEBT_SHARES_DISCOVERED_UNVALUED'};
}
async function retried<T>(op:()=>Promise<T>,tries:number,baseDelay:number):Promise<T>{
 for(let n=0;;n++)try{return await op();}catch(err){
  if(n>=tries||!(err instanceof Error)||!/HTTP 429|HTTP 5\d\d|fetch failed|timeout|aborted/i.test(err.message))throw err;
  await sleep(retryWaitMs(err,n,baseDelay));
 }
}
function settings(o:DetailedIndexOptions){
 if(!ID.test(o.lendingContract)||!Number.isSafeInteger(o.startIndex)||o.startIndex<0||o.startIndex>20_000_000||
  !Number.isSafeInteger(o.maxAccounts)||o.maxAccounts<1||o.maxAccounts>250_000||
  !Number.isSafeInteger(o.pageSize)||o.pageSize<1||o.pageSize>50||
  !Number.isSafeInteger(o.detailConcurrency)||o.detailConcurrency<1||o.detailConcurrency>8||
  !Number.isSafeInteger(o.maxRetries)||o.maxRetries<0||o.maxRetries>8||
  !Number.isSafeInteger(o.pinnedBlockHeight)||o.pinnedBlockHeight<1||
  !/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(o.expectedLendingCodeHash)||
  (o.batchDelayMs!==undefined&&(!Number.isSafeInteger(o.batchDelayMs)||o.batchDelayMs<0||o.batchDelayMs>10000)))throw Error('INVALID_DETAILED_INDEX_OPTIONS');
}
/** Fail closed. A failed request or schema mismatch cannot become a zero-debt account. */
export async function indexDetailedDebtShard(rpc:NearReadOnlyRpc,o:DetailedIndexOptions,resume?:DetailedIndexCheckpoint,
 onCheckpoint?:(s:DetailedIndexCheckpoint,sum:DebtBackfillSummary)=>Promise<void>|void):Promise<{checkpoint:DetailedIndexCheckpoint;summary:DebtBackfillSummary}>{
 settings(o);
 const acc=await retried(()=>rpc.viewAccount(o.lendingContract,o.pinnedBlockHeight),o.maxRetries,o.retryBaseDelayMs??5000);
 if(acc.blockHeight!==String(o.pinnedBlockHeight)||acc.codeHash!==o.expectedLendingCodeHash)throw Error('PINNED_CODE_OR_BLOCK_MISMATCH');
 const [assets,num]=await Promise.all([
  retried(()=>rpc.view<unknown>(o.lendingContract,'get_assets_paged',{},o.pinnedBlockHeight),o.maxRetries,o.retryBaseDelayMs??5000),
  retried(()=>rpc.view<unknown>(o.lendingContract,'get_num_accounts',{},o.pinnedBlockHeight),o.maxRetries,o.retryBaseDelayMs??5000),
 ]);
 if(assets.blockHeight!==acc.blockHeight||num.blockHeight!==acc.blockHeight)throw Error('INCONSISTENT_PINNED_SNAPSHOT');
 const count=typeof num.value==='number'?num.value:Number(num.value);
 if(!Number.isSafeInteger(count)||count<0||count>20_000_000||o.startIndex>count)throw Error('INVALID_INDEX_COUNT');
 const pools=parseParityPools(assets.value);const end=Math.min(count,o.startIndex+o.maxAccounts);
 const borrowedPoolBalancePositive=[...pools.values()].some(p=>p.borrowed.shares>0n||p.borrowed.balance>0n);
 const cp:DetailedIndexCheckpoint=resume?structuredClone(resume):{
   version:1,mode:'NEAR_RHEA_SAME_BLOCK_BACKFILL',chain:'NEAR_MAINNET',executionEnabled:false,liquidationParityVerified:false,
   lendingContract:o.lendingContract,blockHeight:acc.blockHeight,lendingCodeHash:acc.codeHash,codeHashPinProvided:true,
   totalAccounts:count,startIndex:o.startIndex,targetEndIndex:end,nextIndex:o.startIndex,scannedAccounts:0,invalidAccounts:0,
   schemaReasons:{},seenAccountIds:[],findings:[],completeSnapshot:false,borrowedPoolBalancePositive,sourceView:'get_account_all_positions',
 };
 if(resume&&(cp.sourceView!=='get_account_all_positions'||cp.blockHeight!==acc.blockHeight||cp.lendingCodeHash!==acc.codeHash||
  cp.lendingContract!==o.lendingContract||cp.totalAccounts!==count||cp.startIndex!==o.startIndex||cp.targetEndIndex!==end||
  cp.nextIndex!==cp.startIndex+cp.scannedAccounts||cp.nextIndex>end||cp.seenAccountIds.length!==cp.scannedAccounts||
  cp.borrowedPoolBalancePositive!==borrowedPoolBalancePositive))throw Error('INCOMPATIBLE_DETAILED_INDEX_CHECKPOINT');
 const seen=new Set(cp.seenAccountIds);if(seen.size!==cp.seenAccountIds.length)throw Error('INVALID_RESTORED_ACCOUNTS');
 for(let start=cp.nextIndex;start<end;){
  const limit=Math.min(o.pageSize,end-start);
  const page=await retried(()=>rpc.view<unknown>(o.lendingContract,'get_accounts_paged',{from_index:start,limit},o.pinnedBlockHeight),o.maxRetries,o.retryBaseDelayMs??5000);
  if(page.blockHeight!==acc.blockHeight||!Array.isArray(page.value)||page.value.length!==limit)throw Error('PAGED_INDEX_BLOCK_OR_LENGTH_MISMATCH');
  const ids:string[]=[];
  for(const raw of page.value){const row=obj(raw),id=row.account_id;
   if(typeof id!=='string'||!ID.test(id)||seen.has(id)||ids.includes(id))throw Error('INVALID_OR_DUPLICATE_PAGED_INDEX_ID');
   ids.push(id);
  }
  const found:(DebtAccountFinding|null)[]=[];
  for(let at=0;at<ids.length;at+=o.detailConcurrency){
   const group=ids.slice(at,at+o.detailConcurrency);
   const batch=await Promise.all(group.map(async accountId=>{
    const answer=await retried(()=>rpc.view<unknown>(o.lendingContract,'get_account_all_positions',{account_id:accountId},o.pinnedBlockHeight),o.maxRetries,o.retryBaseDelayMs??5000);
    if(answer.blockHeight!==acc.blockHeight)throw Error('DETAILED_VIEW_BLOCK_MISMATCH');
    return parseDetailedBorrower(answer.value,accountId,pools);
   }));
   found.push(...batch);
  }
  // Only checkpoint a page after every detailed read succeeded and parsed.
  for(let j=0;j<ids.length;j++){
   seen.add(ids[j]!);cp.seenAccountIds.push(ids[j]!);const hit=found[j];if(hit)cp.findings.push(hit);
  }
  cp.nextIndex+=ids.length;cp.scannedAccounts+=ids.length;cp.completeSnapshot=cp.startIndex===0&&cp.nextIndex===count;
  const sum=summarizeDebtBackfill(cp);
  if(onCheckpoint)await onCheckpoint(structuredClone(cp),sum);
  start=cp.nextIndex;
  if(start<end&&(o.batchDelayMs??0)>0)await sleep(o.batchDelayMs!);
 }
 return {checkpoint:cp,summary:summarizeDebtBackfill(cp)};
}

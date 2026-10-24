import {shardRange} from './market-shards.ts';
import type {DebtBackfillCheckpoint} from './market-debt-index.ts';

/**
 * Stage 20: permit RESEARCH on a partial detailed-position shard without
 * promoting it to a complete market index. A cancelled Actions runner can
 * still provide bounded, independently rechecked borrower observations.
 */
export type ObservedDetailedShard = DebtBackfillCheckpoint & {sourceView:'get_account_all_positions'};

export interface ObservedShardEvidence {
 mode:'NEAR_RHEA_PARTIAL_SHARD_OBSERVATION';
 status:'PARTIAL_COVERAGE_UNAPPROVED';
 chain:'NEAR_MAINNET';
 blockHeight:string;
 lendingCodeHash:string;
 shardId:number;
 shardCount:number;
 totalAccounts:number;
 assignedFromIndex:number;
 assignedEndIndex:number;
 scannedFromIndex:number;
 scannedEndIndex:number;
 scannedAccounts:number;
 unscannedAccountsInShard:number;
 observedDebtAccounts:number;
 observedDebtPositions:number;
 borrowerCountIsMarketTotal:false;
 sourceView:'get_account_all_positions';
 executionEnabled:false;
 liquidationParityVerified:false;
 profitabilityVerified:false;
 warnings:string[];
}

function boundedInt(v:unknown,min:number,max:number):v is number {
 return typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
}

/** Independent artifact gate; never trust a summary field to attest its input. */
function validateArtifact(raw:unknown):asserts raw is ObservedDetailedShard {
 if(raw===null||typeof raw!=='object'||Array.isArray(raw))throw Error('INVALID_CHECKPOINT');
 const c=raw as Record<string,unknown>;
 if(c.version!==1||c.mode!=='NEAR_RHEA_SAME_BLOCK_BACKFILL'||c.chain!=='NEAR_MAINNET'||
  c.executionEnabled!==false||c.liquidationParityVerified!==false||
  typeof c.lendingContract!=='string'||!/^[a-z0-9._-]{2,64}$/.test(c.lendingContract)||
  typeof c.blockHeight!=='string'||!/^[1-9][0-9]{0,15}$/.test(c.blockHeight)||
  Number(c.blockHeight)>Number.MAX_SAFE_INTEGER||
  typeof c.lendingCodeHash!=='string'||!/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(c.lendingCodeHash)||
  c.codeHashPinProvided!==true||c.sourceView!=='get_account_all_positions'||
  typeof c.borrowedPoolBalancePositive!=='boolean'||c.completeSnapshot!==false||
  !boundedInt(c.totalAccounts,1,20_000_000)||
  !boundedInt(c.startIndex,0,c.totalAccounts as number)||
  !boundedInt(c.targetEndIndex,c.startIndex as number,c.totalAccounts as number)||
  !boundedInt(c.nextIndex,c.startIndex as number,c.targetEndIndex as number)||
  !boundedInt(c.scannedAccounts,0,250_000)||
  c.scannedAccounts!==(c.nextIndex as number)-(c.startIndex as number)||
  c.invalidAccounts!==0||!Array.isArray(c.seenAccountIds)||
  c.seenAccountIds.length!==c.scannedAccounts||
  !Array.isArray(c.findings)||c.findings.length>c.scannedAccounts||
  !c.schemaReasons||typeof c.schemaReasons!=='object'||Array.isArray(c.schemaReasons)||
  Object.keys(c.schemaReasons).length!==0)throw Error('INVALID_CHECKPOINT');
 const seen=new Set<string>();
 for(const id of c.seenAccountIds){
  if(typeof id!=='string'||!/^[a-z0-9._-]{2,64}$/.test(id)||seen.has(id))throw Error('INVALID_CHECKPOINT_ACCOUNT');
  seen.add(id);
 }
 const findings=new Set<string>();
 for(const item of c.findings){
  if(!item||typeof item!=='object'||Array.isArray(item))throw Error('INVALID_CHECKPOINT_FINDING');
  const f=item as Record<string,unknown>;
  if(typeof f.accountId!=='string'||!seen.has(f.accountId)||findings.has(f.accountId)||
   f.classification!=='DEBT_SHARES_DISCOVERED_UNVALUED'||!Array.isArray(f.positions)||
   f.positions.length<1||f.positions.length>64)throw Error('INVALID_CHECKPOINT_FINDING');
  findings.add(f.accountId);
  const positions=new Set<string>();
  for(const e of f.positions){
   if(!e||typeof e!=='object'||Array.isArray(e))throw Error('INVALID_CHECKPOINT_POSITION');
   const leg=e as Record<string,unknown>;
   if(typeof leg.positionId!=='string'||!/^[A-Za-z0-9._:-]{1,100}$/.test(leg.positionId)||
    positions.has(leg.positionId)||typeof leg.collateralRecorded!=='boolean'||
    !Array.isArray(leg.debtAssetIds)||leg.debtAssetIds.length<1||leg.debtAssetIds.length>256||
    leg.debtAssetIds.some(x=>typeof x!=='string'||!/^[a-z0-9._-]{2,64}$/.test(x))||
    new Set(leg.debtAssetIds).size!==leg.debtAssetIds.length)throw Error('INVALID_CHECKPOINT_POSITION');
   positions.add(leg.positionId);
  }
 }
}

/** Validate source, identity, chain snapshot and one complete prefix of the shard. */
export function validateObservedDetailedShard(raw:unknown,shardId:number,shardCount:number):{
 checkpoint:ObservedDetailedShard; evidence:ObservedShardEvidence;
} {
 if(!boundedInt(shardCount,2,128)||!boundedInt(shardId,0,shardCount-1))throw Error('INVALID_SHARD_SELECTION');
 validateArtifact(raw);
 const c=raw as ObservedDetailedShard;
 if(c.sourceView!=='get_account_all_positions'||c.codeHashPinProvided!==true||
    c.invalidAccounts!==0||Object.keys(c.schemaReasons).length!==0||
    typeof c.borrowedPoolBalancePositive!=='boolean'||
    c.completeSnapshot!==false)throw Error('UNTRUSTED_PARTIAL_DETAILED_SOURCE');
 const range=shardRange(c.totalAccounts,shardId,shardCount);
 if(c.startIndex!==range.startIndex||c.targetEndIndex!==range.startIndex+range.maxAccounts||
    c.nextIndex<c.startIndex||c.nextIndex>c.targetEndIndex||
    c.scannedAccounts!==c.nextIndex-c.startIndex)throw Error('SHARD_RANGE_OR_PROGRESS_MISMATCH');
 const observedDebtPositions=c.findings.reduce((a,f)=>a+f.positions.length,0);
 return {checkpoint:c,evidence:{
  mode:'NEAR_RHEA_PARTIAL_SHARD_OBSERVATION',status:'PARTIAL_COVERAGE_UNAPPROVED',
  chain:'NEAR_MAINNET',blockHeight:c.blockHeight,lendingCodeHash:c.lendingCodeHash,
  shardId,shardCount,totalAccounts:c.totalAccounts,
  assignedFromIndex:c.startIndex,assignedEndIndex:c.targetEndIndex,
  scannedFromIndex:c.startIndex,scannedEndIndex:c.nextIndex,
  scannedAccounts:c.scannedAccounts,unscannedAccountsInShard:c.targetEndIndex-c.nextIndex,
  observedDebtAccounts:c.findings.length,observedDebtPositions,
  borrowerCountIsMarketTotal:false,sourceView:'get_account_all_positions',
  executionEnabled:false,liquidationParityVerified:false,profitabilityVerified:false,
  warnings:['OBSERVED_BORROWERS_ONLY_NOT_FULL_MARKET','CANCELLED_OR_PARTIAL_SHARD_DOES_NOT_ATTEST_GLOBAL_COVERAGE',
    'BORROWERS_MUST_BE_RECHECKED_AGAINST_SAME_NEAR_BLOCK','OLD_BLOCK_PYTH_QUOTES_MAY_BE_STALE',
    'NO_LIQUIDATION_OR_NET_PROFIT_APPROVAL'],
 }};
}

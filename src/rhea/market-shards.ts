import type {DebtBackfillCheckpoint} from './market-debt-index.ts';
import {summarizeDebtBackfill} from './market-debt-index.ts';

/** Shards are contiguous disjoint ranges of ONE exact NEAR block snapshot. */
export function shardRange(total:number,shard:number,shards:number):{startIndex:number;maxAccounts:number}{
 if(!Number.isSafeInteger(total)||total<0||total>20_000_000||!Number.isSafeInteger(shards)||shards<1||shards>16||
 !Number.isSafeInteger(shard)||shard<0||shard>=shards)throw Error('INVALID_SHARD_PLAN');
 const startIndex=Math.floor(total*shard/shards),end=Math.floor(total*(shard+1)/shards);
 return {startIndex,maxAccounts:end-startIndex};
}
export interface ShardAggregate {
 mode:'RHEA_FULL_MARKET_SHARDED_READ_ONLY';status:'COMPLETE_UNAPPROVED'|'BORROWER_DEBT_MISSING_UNVERIFIED'|'SCHEMA_ERRORS_UNVERIFIED';
 executionEnabled:false;liquidationParityVerified:false;
 blockHeight:string;lendingCodeHash:string;totalAccounts:number;scannedAccounts:number;debtAccounts:number;debtPositions:number;
 borrowedPoolBalancePositive:boolean;invalidAccounts:number;shardCount:number;completeSnapshot:boolean;warnings:string[];
}
export function mergeDebtShards(parts:unknown[],shards:number):ShardAggregate{
 if(!Array.isArray(parts)||parts.length!==shards||!Number.isSafeInteger(shards)||shards<1||shards>16)throw Error('MISSING_OR_EXCESS_SHARDS');
 const copies=parts as DebtBackfillCheckpoint[];
 const first=copies[0];if(!first||first.version!==1||first.chain!=='NEAR_MAINNET'||first.mode!=='NEAR_RHEA_SAME_BLOCK_BACKFILL'||
  !/^[0-9]+$/.test(first.blockHeight)||!first.lendingCodeHash||!Number.isSafeInteger(first.totalAccounts)||first.totalAccounts<0)throw Error('INVALID_SHARD_REFERENCE');
 const seen=new Set<string>();let scanned=0,invalid=0,debts=0,positions=0,anyPositive=false;
 for(let shard=0;shard<shards;shard++){
  const p=copies[shard],range=shardRange(first.totalAccounts,shard,shards);
  if(!p||p.mode!==first.mode||p.version!==1||p.chain!==first.chain||p.executionEnabled!==false||p.liquidationParityVerified!==false||
   p.lendingContract!==first.lendingContract||p.lendingCodeHash!==first.lendingCodeHash||p.blockHeight!==first.blockHeight||
   p.totalAccounts!==first.totalAccounts||p.startIndex!==range.startIndex||p.targetEndIndex!==range.startIndex+range.maxAccounts||
   p.nextIndex!==p.targetEndIndex||p.scannedAccounts!==range.maxAccounts||p.seenAccountIds?.length!==range.maxAccounts||
   !Array.isArray(p.findings)||!Number.isSafeInteger(p.invalidAccounts)||p.invalidAccounts<0||p.invalidAccounts>range.maxAccounts||
   typeof p.borrowedPoolBalancePositive!=='boolean'||p.borrowedPoolBalancePositive!==first.borrowedPoolBalancePositive)
   throw Error('SHARD_SNAPSHOT_OR_RANGE_INCOMPLETE');
  const report=summarizeDebtBackfill(p);
  for(const id of p.seenAccountIds){if(typeof id!=='string'||seen.has(id))throw Error('DUPLICATE_ACCOUNT_ACROSS_SHARDS');seen.add(id);}
  for(const item of p.findings){if(!seen.has(item.accountId)||!Array.isArray(item.positions)||item.positions.length===0)throw Error('INVALID_SHARD_FINDING');}
  scanned+=p.scannedAccounts;invalid+=p.invalidAccounts;debts+=report.debtAccounts;positions+=report.debtPositions;anyPositive=anyPositive||p.borrowedPoolBalancePositive;
 }
 if(scanned!==first.totalAccounts||seen.size!==first.totalAccounts)throw Error('SHARD_COVERAGE_NOT_COMPLETE');
 const status:ShardAggregate['status']=invalid?'SCHEMA_ERRORS_UNVERIFIED':anyPositive&&debts===0?'BORROWER_DEBT_MISSING_UNVERIFIED':'COMPLETE_UNAPPROVED';
 return {mode:'RHEA_FULL_MARKET_SHARDED_READ_ONLY',status,executionEnabled:false,liquidationParityVerified:false,
  blockHeight:first.blockHeight,lendingCodeHash:first.lendingCodeHash,totalAccounts:first.totalAccounts,
  scannedAccounts:scanned,debtAccounts:debts,debtPositions:positions,borrowedPoolBalancePositive:anyPositive,invalidAccounts:invalid,
  shardCount:shards,completeSnapshot:invalid===0&&scanned===first.totalAccounts,
  warnings:['SAME_BLOCK_COVERAGE_IS_NOT_DEPLOYED_LIQUIDATION_PARITY','NO_PRICE_HEALTH_OR_PROFIT_APPROVAL',
   ...((anyPositive&&debts===0)?['POSITIVE_BORROWED_POOLS_WITH_ZERO_BORROWERS_REQUIRES_INDEPENDENT_SCHEMA_AUDIT']:[])]};
}

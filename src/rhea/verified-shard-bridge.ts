import {mergeDebtShards, type ShardAggregate} from './market-shards.ts';
import type {DetailedIndexCheckpoint} from './detailed-debt-index.ts';
import {validateIndexedCheckpoint} from './indexed-health-pipeline.ts';

/** Strict Stage 18 importer. All shard artifacts must be from the same pinned
 * NEAR block and cover every account index. No account is ranked here. */
export function composeVerifiedDetailedCheckpoint(input:unknown[],shardCount:number):{
 checkpoint:DetailedIndexCheckpoint;aggregate:ShardAggregate
}{
 const aggregate=mergeDebtShards(input,shardCount);
 if(aggregate.status!=='COMPLETE_UNAPPROVED'||!aggregate.completeSnapshot||aggregate.invalidAccounts!==0)
  throw Error('SHARDED_MARKET_EVIDENCE_NOT_COMPLETE');
 const shards=input as DetailedIndexCheckpoint[];
 const reference=shards[0]!;
 if(reference.codeHashPinProvided!==true||reference.sourceView!=='get_account_all_positions'||
    shards.some(s=>s.codeHashPinProvided!==true||s.sourceView!=='get_account_all_positions'||
      s.lendingContract!==reference.lendingContract||s.lendingCodeHash!==reference.lendingCodeHash||
      s.blockHeight!==reference.blockHeight))throw Error('SHARD_CODE_IDENTITY_NOT_ATTESTED');
 const checkpoint:DetailedIndexCheckpoint={
  ...reference,
  startIndex:0,targetEndIndex:aggregate.totalAccounts,nextIndex:aggregate.totalAccounts,
  scannedAccounts:aggregate.totalAccounts,invalidAccounts:0,schemaReasons:{},
  seenAccountIds:shards.flatMap(s=>s.seenAccountIds),
  findings:shards.flatMap(s=>s.findings),completeSnapshot:true,
  borrowedPoolBalancePositive:aggregate.borrowedPoolBalancePositive,
  codeHashPinProvided:true,sourceView:'get_account_all_positions',
 };
 validateIndexedCheckpoint(checkpoint);
 if(checkpoint.findings.length!==aggregate.debtAccounts||
    checkpoint.findings.reduce((n,f)=>n+f.positions.length,0)!==aggregate.debtPositions)
  throw Error('SHARD_FINDING_COUNT_MISMATCH');
 return {checkpoint,aggregate};
}

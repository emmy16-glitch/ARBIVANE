import type {PagedPositionCheckpoint} from './paged-position-index.ts';
import type {DebtAccountFinding} from './debt-discovery.ts';

/** Reconcile bulk read-only Rhea mainnet index shards; no account may be missed, repeated
 * or silently counted as healthy. Pure and deterministic, safe to test offline.
 */
const ID=/^[a-z0-9._-]{2,64}$/;
const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
export interface CompletePagedIndex {
 mode:'RHEA_COMPLETE_PAGED_INDEX_ATTESTATION';chain:'NEAR_MAINNET';
 status:'COMPLETE_DEBT_INDEX_READ_ONLY';blockHeight:string;lendingCodeHash:string;
 totalAccounts:number;scannedAccounts:number;debtAccounts:number;debtPositions:number;
 shardCount:number;zeroSchemaErrors:true;completeSnapshot:true;
 findings:DebtAccountFinding[];
 executionEnabled:false;liquidationEligible:false;profitabilityVerified:false;
 warnings:string[];
}
export function verifyCompletePagedIndex(shards:unknown[],expected:{
 blockHeight:string;lendingCodeHash:string;totalAccounts:number;shardCount:number;
}):CompletePagedIndex{
 if(!Array.isArray(shards)||!Number.isSafeInteger(expected.shardCount)||
  expected.shardCount<1||expected.shardCount>16||shards.length!==expected.shardCount||
  !HASH.test(expected.lendingCodeHash)||!/^[1-9][0-9]{0,15}$/.test(expected.blockHeight)||
  !Number.isSafeInteger(expected.totalAccounts)||expected.totalAccounts<1||expected.totalAccounts>250000)
  throw Error('INVALID_FULL_INDEX_ATTESTATION_INPUT');
 const ids=new Set<string>(), findings:DebtAccountFinding[]=[];
 let borrowedPositive:boolean|null=null;
 for(let shard=0;shard<shards.length;shard++){
  const cp=shards[shard] as PagedPositionCheckpoint;
  if(!cp||cp.version!==1||cp.mode!=='NEAR_RHEA_SAME_BLOCK_BACKFILL'||
   cp.chain!=='NEAR_MAINNET'||cp.executionEnabled!==false||cp.liquidationParityVerified!==false||
   cp.sourceView!=='get_accounts_all_positions_paged'||cp.codeHashPinProvided!==true||
   cp.lendingContract!=='contract.main.burrow.near'||
   cp.blockHeight!==expected.blockHeight||cp.lendingCodeHash!==expected.lendingCodeHash||
   cp.totalAccounts!==expected.totalAccounts||cp.invalidAccounts!==0||
   !cp.schemaReasons||Object.values(cp.schemaReasons).some(n=>n!==0)||
   cp.startIndex!==Math.floor(expected.totalAccounts*shard/expected.shardCount)||
   cp.targetEndIndex!==Math.floor(expected.totalAccounts*(shard+1)/expected.shardCount)||
   cp.nextIndex!==cp.targetEndIndex||cp.scannedAccounts!==cp.targetEndIndex-cp.startIndex||
   !Array.isArray(cp.seenAccountIds)||cp.seenAccountIds.length!==cp.scannedAccounts||
   !Array.isArray(cp.findings)||cp.findings.length>cp.scannedAccounts||
   cp.completeSnapshot!==(cp.startIndex===0&&cp.nextIndex===cp.totalAccounts))
   throw Error('INCOMPLETE_OR_CONTRADICTORY_PAGED_SHARD_'+shard);
  if(typeof cp.borrowedPoolBalancePositive!=='boolean')throw Error('NO_POOL_BORROWED_INDICATOR');
  if(borrowedPositive!==null&&borrowedPositive!==cp.borrowedPoolBalancePositive)
   throw Error('INCONSISTENT_BORROWED_POOL_INDICATOR');
  borrowedPositive=cp.borrowedPoolBalancePositive;
  const shardIds=new Set<string>();
  for(const id of cp.seenAccountIds){
   if(typeof id!=='string'||!ID.test(id)||ids.has(id))throw Error('DUPLICATE_OR_INVALID_ACROSS_SHARDS');
   ids.add(id);shardIds.add(id);
  }
  const seenDebt=new Set<string>();
  for(const f of cp.findings){
   if(!f||!shardIds.has(f.accountId)||seenDebt.has(f.accountId)||
    f.classification!=='DEBT_SHARES_DISCOVERED_UNVALUED'||!Array.isArray(f.positions)||
    f.positions.length===0||f.positions.length>64)
    throw Error('INVALID_DEBT_FINDING_IN_SHARD');
   seenDebt.add(f.accountId);
   for(const p of f.positions){
    if(!p||typeof p.positionId!=='string'||p.positionId.length>100||
     !Array.isArray(p.debtAssetIds)||p.debtAssetIds.length===0||
     p.debtAssetIds.some(x=>typeof x!=='string'||!ID.test(x))||
     typeof p.collateralRecorded!=='boolean')
     throw Error('INVALID_DEBT_POSITION_IN_SHARD');
   }
   findings.push(f);
  }
 }
 if(ids.size!==expected.totalAccounts)throw Error('FULL_ACCOUNT_COVERAGE_GAP');
 if(borrowedPositive===true&&findings.length===0)throw Error('MARKET_DEBT_EXISTS_BUT_NO_ACCOUNT_DEBT_FOUND');
 return {mode:'RHEA_COMPLETE_PAGED_INDEX_ATTESTATION',chain:'NEAR_MAINNET',
  status:'COMPLETE_DEBT_INDEX_READ_ONLY',blockHeight:expected.blockHeight,lendingCodeHash:expected.lendingCodeHash,
  totalAccounts:expected.totalAccounts,scannedAccounts:ids.size,debtAccounts:findings.length,
  debtPositions:findings.reduce((n,f)=>n+f.positions.length,0),shardCount:expected.shardCount,
  zeroSchemaErrors:true,completeSnapshot:true,findings,
  executionEnabled:false,liquidationEligible:false,profitabilityVerified:false,
  warnings:['INDEX_IS_ONE_PINNED_HISTORIC_BLOCK_NOT_CURRENT_ELIGIBILITY',
   'ACCOUNT_DEBT_IS_NOT_LIQUIDATION_ELIGIBILITY',
   'NO_EXECUTION_SIGNER_WALLET_GAS_PROFIT_OR_REAL_TRANSACTIONS']};
}

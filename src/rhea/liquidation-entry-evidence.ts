import type {NearReadOnlyRpc} from './rpc.ts';
import {parseParityPools} from './deployed-share-parity.ts';
import {parseDetailedBorrower} from './detailed-debt-index.ts';

/** Live mainnet entry probe. Do not infer liquidation permissions or executable health from an export. */
const ID=/^[a-z0-9._-]{2,64}$/;
const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
export interface EntryOptions {
 lendingContract:string;configuredOracle:string;aggregatePriceReader:string;
 borrowerAccountId:string;liquidatorAccountId?:string;
 expectedLendingCodeHash:string;expectedConfiguredOracleCodeHash:string;
 expectedAggregatePriceReaderCodeHash:string;
}
export interface LiquidationEntryEvidence {
 mode:'RHEA_STAGE25_MAINNET_LIQUIDATION_ENTRY_READ_ONLY';
 chain:'NEAR_MAINNET';status:'BLOCKED_PENDING_REAL_EXECUTION_PROOFS';
 blockHeight:string;borrowerAccountId:string;liquidatorAccountId:string|null;
 lendingCodeHash:string;configuredOracleCodeHash:string;aggregatePriceReaderCodeHash:string;
 oracleConfigMatches:true;pythOracleEnabled:boolean|null;
 borrowerStillHasDebt:boolean;borrowerPositionCount:number;borrowerDebtAssets:string[];
 liquidatorRegistered:boolean|null;liquidatorSuppliedTokenIds:string[]|null;
 whitelistQueryAvailable:boolean;whitelistContainsLiquidator:boolean|null;
 publicLiquidationPermissionVerified:false;
 latestHealthVerified:false;liquidationActionAndPythBranchVerified:false;
 liquidatorFundsVerified:false;transactionReplayVerified:false;realNetProfitVerified:false;
 executionEnabled:false;mayBroadcast:false;blockers:string[];
}
function plain(x:unknown):Record<string,unknown>{
 if(!x||typeof x!=='object'||Array.isArray(x))throw Error('INVALID_VIEW_OBJECT');
 return x as Record<string,unknown>;
}
function suppliedTokens(raw:unknown):string[]{
 const obj=plain(raw);
 if(!Array.isArray(obj.supplied))throw Error('INVALID_LIQUIDATOR_SUPPLIED_SCHEMA');
 const tokens:string[]=[];
 for(const p of obj.supplied){
  const row=plain(p);
  if(typeof row.token_id!=='string'||!ID.test(row.token_id)||tokens.includes(row.token_id))
   throw Error('INVALID_LIQUIDATOR_TOKEN');
  if(typeof row.balance!=='string'||!/^(0|[1-9][0-9]{0,38})$/.test(row.balance))
   throw Error('INVALID_LIQUIDATOR_BALANCE');
  if(BigInt(row.balance)>0n)tokens.push(row.token_id);
 }
 return tokens;
}
export async function inspectLiveLiquidationEntry(
 rpc:Pick<NearReadOnlyRpc,'viewAccount'|'view'>,o:EntryOptions,
):Promise<LiquidationEntryEvidence>{
 for(const id of [o.lendingContract,o.configuredOracle,o.aggregatePriceReader,o.borrowerAccountId])
  if(!ID.test(id))throw Error('INVALID_STAGE25_ACCOUNT_ID');
 for(const hash of [o.expectedLendingCodeHash,o.expectedConfiguredOracleCodeHash,o.expectedAggregatePriceReaderCodeHash])
  if(!HASH.test(hash))throw Error('INVALID_STAGE25_PINNED_CODE_HASH');
 if(new Set([o.lendingContract,o.configuredOracle,o.aggregatePriceReader]).size!==3)
  throw Error('STAGE25_CONTRACTS_NOT_DISTINCT');
 if(o.liquidatorAccountId!==undefined&&(!ID.test(o.liquidatorAccountId)||
   o.liquidatorAccountId===o.borrowerAccountId))throw Error('INVALID_STAGE25_LIQUIDATOR');
 const latest=await rpc.viewAccount(o.lendingContract);
 if(!/^[1-9][0-9]{0,15}$/.test(latest.blockHeight)||!Number.isSafeInteger(Number(latest.blockHeight))||
   latest.codeHash!==o.expectedLendingCodeHash)throw Error('LENDING_CODE_CHANGED_OR_INVALID_FINAL_BLOCK');
 const height=Number(latest.blockHeight);
 const [lending,oracle,aggregate,config,assets,detail]=await Promise.all([
  rpc.viewAccount(o.lendingContract,height),
  rpc.viewAccount(o.configuredOracle,height),
  rpc.viewAccount(o.aggregatePriceReader,height),
  rpc.view<unknown>(o.lendingContract,'get_config',{},height),
  rpc.view<unknown>(o.lendingContract,'get_assets_paged',{},height),
  rpc.view<unknown>(o.lendingContract,'get_account_all_positions',{account_id:o.borrowerAccountId},height),
 ]);
 if([lending,oracle,aggregate].some(x=>x.blockHeight!==latest.blockHeight)||
   [config,assets,detail].some(x=>x.blockHeight!==latest.blockHeight))
   throw Error('STAGE25_CROSS_BLOCK_STATE');
 if(lending.codeHash!==o.expectedLendingCodeHash||
   oracle.codeHash!==o.expectedConfiguredOracleCodeHash||
   aggregate.codeHash!==o.expectedAggregatePriceReaderCodeHash)
   throw Error('STAGE25_CONTRACT_CODE_CHANGED');
 const cfg=plain(config.value);
 if(cfg.oracle_account_id!==o.configuredOracle)throw Error('STAGE25_CONFIGURED_ORACLE_DRIFT');
 if(cfg.enable_pyth_oracle!==undefined&&typeof cfg.enable_pyth_oracle!=='boolean')
   throw Error('INVALID_STAGE25_PYTH_FLAG');
 const pools=parseParityPools(assets.value);
 const found=parseDetailedBorrower(detail.value,o.borrowerAccountId,pools);
 const debts=[...new Set(found?.positions.flatMap(p=>p.debtAssetIds)??[])].sort();
 let liquidatorRegistered:boolean|null=null;
 let liquidatorSuppliedTokenIds:string[]|null=null;
 if(o.liquidatorAccountId!==undefined){
  try{
   const account=await rpc.view<unknown>(o.lendingContract,'get_account',{account_id:o.liquidatorAccountId},height);
   if(account.blockHeight!==latest.blockHeight)throw Error('STAGE25_CROSS_BLOCK_LIQUIDATOR');
   liquidatorSuppliedTokenIds=suppliedTokens(account.value);
   liquidatorRegistered=true;
  }catch(e){
   if(e instanceof Error&&e.message==='STAGE25_CROSS_BLOCK_LIQUIDATOR')throw e;
   liquidatorRegistered=false;
  }
 }
 let whitelistQueryAvailable=false,whitelistContainsLiquidator:boolean|null=null;
 try{
  const response=await rpc.view<unknown>(o.lendingContract,'get_reliable_liquidator_whitelist',{},height);
  if(response.blockHeight!==latest.blockHeight)throw Error('STAGE25_CROSS_BLOCK_WHITELIST');
  if(!Array.isArray(response.value)||response.value.length>10000||
    response.value.some(id=>typeof id!=='string'||!ID.test(id)))throw Error('UNRECOGNIZED_WHITELIST_SCHEMA');
  whitelistQueryAvailable=true;
  whitelistContainsLiquidator=o.liquidatorAccountId===undefined?null:response.value.includes(o.liquidatorAccountId);
 }catch(e){
  if(e instanceof Error&&e.message==='STAGE25_CROSS_BLOCK_WHITELIST')throw e;
 }
 const blockers:string[]=[];
 if(!found)blockers.push('BORROWER_NO_LONGER_HAS_DEBT');
 if(o.liquidatorAccountId===undefined)blockers.push('LIQUIDATOR_WALLET_NOT_CONFIGURED');
 else if(!liquidatorRegistered)blockers.push('LIQUIDATOR_NOT_REGISTERED_OR_VIEW_UNAVAILABLE');
 else if(liquidatorSuppliedTokenIds?.length===0)blockers.push('LIQUIDATOR_HAS_NO_OBSERVED_SUPPLIED_BALANCE');
 blockers.push('CURRENT_PRICE_AND_HEALTH_NOT_RECALCULATED_FROM_EXECUTION_ORACLE',
  'LIQUIDATION_PYTH_ACTION_BRANCH_NOT_ATTESTED_TO_DEPLOYED_WASM',
  'BORROWER_RULES_AND_TRANSACTION_REPLAY_NOT_VERIFIED',
  'GAS_SWAP_FINANCING_AND_COMPETITION_COSTS_NOT_VERIFIED',
  'WALLET_SIGNER_APPROVAL_AND_MAXIMUM_LOSS_NOT_SET');
 return {mode:'RHEA_STAGE25_MAINNET_LIQUIDATION_ENTRY_READ_ONLY',chain:'NEAR_MAINNET',
  status:'BLOCKED_PENDING_REAL_EXECUTION_PROOFS',blockHeight:latest.blockHeight,
  borrowerAccountId:o.borrowerAccountId,liquidatorAccountId:o.liquidatorAccountId??null,
  lendingCodeHash:lending.codeHash,configuredOracleCodeHash:oracle.codeHash,
  aggregatePriceReaderCodeHash:aggregate.codeHash,oracleConfigMatches:true,
  pythOracleEnabled:typeof cfg.enable_pyth_oracle==='boolean'?cfg.enable_pyth_oracle:null,
  borrowerStillHasDebt:found!==null,borrowerPositionCount:found?.positions.length??0,
  borrowerDebtAssets:debts,liquidatorRegistered,liquidatorSuppliedTokenIds,
  whitelistQueryAvailable,whitelistContainsLiquidator,
  publicLiquidationPermissionVerified:false,latestHealthVerified:false,
  liquidationActionAndPythBranchVerified:false,liquidatorFundsVerified:false,
  transactionReplayVerified:false,realNetProfitVerified:false,
  executionEnabled:false,mayBroadcast:false,blockers};
}

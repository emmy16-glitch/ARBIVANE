import type {NearReadOnlyRpc} from './rpc.ts';
import {parseParityPools} from './deployed-share-parity.ts';

/** Stage 23: read-only on-chain identity and live lending-state witness.
 * A view_account code hash is not a reproducible Wasm/source attestation.
 * This module never creates actions, signed transactions, or broadcasts.
 */
const ID=/^[a-z0-9._-]{2,64}$/;
const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
export interface ContractPreflightOptions {
 lendingContract:string;oracleContract:string;expectedLendingCodeHash?:string;expectedOracleCodeHash?:string;
}
export interface ContractPreflightReport {
 mode:'NEAR_RHEA_DEPLOYED_LIQUIDATION_PREFLIGHT';
 status:'IDENTITY_OBSERVED_SOURCE_PARITY_UNVERIFIED';
 chain:'NEAR_MAINNET';blockHeight:string;lendingContract:string;oracleContract:string;
 lendingCodeHash:string;oracleCodeHash:string;assetPools:number;registryAccounts:number;
 borrowedPoolBalancePositive:boolean;configViewAvailable:true;
 referenceSourceLiquidationChecks:4;publicGuideDescribedChecks:3;
 deployedLiquidationRulesVerified:false;sourceWasmReproduciblyMatched:false;
 mutationDryRunPerformed:false;transactionFeesVerified:false;
 walletAndCapitalAuthorized:false;mayBroadcast:false;executionEnabled:false;
 blockers:string[];
}
function integer(v:unknown):number{
 if(typeof v!=='number'||!Number.isSafeInteger(v)||v<1||v>20_000_000)throw Error('INVALID_DEPLOYED_REGISTRY_COUNT');
 return v;
}
function object(v:unknown):Record<string,unknown>{
 if(v===null||typeof v!=='object'||Array.isArray(v)||Object.keys(v as object).length===0)
  throw Error('INVALID_DEPLOYED_CONFIG');
 return v as Record<string,unknown>;
}
export async function inspectDeployedLiquidationIdentity(
 rpc:Pick<NearReadOnlyRpc,'viewAccount'|'view'>,o:ContractPreflightOptions,
):Promise<ContractPreflightReport>{
 if(!ID.test(o.lendingContract)||!ID.test(o.oracleContract)||o.lendingContract===o.oracleContract)
  throw Error('INVALID_LENDING_OR_ORACLE_CONTRACT');
 if((o.expectedLendingCodeHash!==undefined&&!HASH.test(o.expectedLendingCodeHash))||
    (o.expectedOracleCodeHash!==undefined&&!HASH.test(o.expectedOracleCodeHash)))
  throw Error('INVALID_PINNED_CODE_HASH');
 const latest=await rpc.viewAccount(o.lendingContract);
 if(!/^[1-9][0-9]{0,15}$/.test(latest.blockHeight)||
    !Number.isSafeInteger(Number(latest.blockHeight))||!HASH.test(latest.codeHash))throw Error('INVALID_FINAL_BLOCK');
 const height=Number(latest.blockHeight);
 const [lending,oracle,assets,registry,config]=await Promise.all([
  rpc.viewAccount(o.lendingContract,height),
  rpc.viewAccount(o.oracleContract,height),
  rpc.view<unknown>(o.lendingContract,'get_assets_paged',{},height),
  rpc.view<unknown>(o.lendingContract,'get_num_accounts',{},height),
  rpc.view<unknown>(o.lendingContract,'get_config',{},height),
 ]);
 if(lending.blockHeight!==latest.blockHeight||lending.codeHash!==latest.codeHash||
    oracle.blockHeight!==latest.blockHeight||
    assets.blockHeight!==latest.blockHeight||registry.blockHeight!==latest.blockHeight||
    config.blockHeight!==latest.blockHeight)throw Error('INCONSISTENT_FINALIZED_BLOCK');
 if(!HASH.test(oracle.codeHash)|| (o.expectedLendingCodeHash!==undefined&&o.expectedLendingCodeHash!==lending.codeHash)||
    (o.expectedOracleCodeHash!==undefined&&o.expectedOracleCodeHash!==oracle.codeHash))
  throw Error('DEPLOYED_CODE_HASH_CHANGED');
 object(config.value);
 const pools=parseParityPools(assets.value);
 if(!pools.size)throw Error('EMPTY_LENDING_POOLS');
 const count=integer(registry.value);
 return {mode:'NEAR_RHEA_DEPLOYED_LIQUIDATION_PREFLIGHT',
  status:'IDENTITY_OBSERVED_SOURCE_PARITY_UNVERIFIED',chain:'NEAR_MAINNET',
  blockHeight:latest.blockHeight,lendingContract:o.lendingContract,oracleContract:o.oracleContract,
  lendingCodeHash:lending.codeHash,oracleCodeHash:oracle.codeHash,assetPools:pools.size,registryAccounts:count,
  borrowedPoolBalancePositive:[...pools.values()].some(x=>x.borrowed.shares>0n||x.borrowed.balance>0n),
  configViewAvailable:true,referenceSourceLiquidationChecks:4,publicGuideDescribedChecks:3,
  deployedLiquidationRulesVerified:false,sourceWasmReproduciblyMatched:false,mutationDryRunPerformed:false,
  transactionFeesVerified:false,walletAndCapitalAuthorized:false,mayBroadcast:false,executionEnabled:false,
  blockers:['ARCHIVED_SOURCE_NOT_ATTESTED_TO_DEPLOYED_WASM','PUBLIC_GUIDE_VS_ARCHIVED_SOURCE_RULE_DISCREPANCY',
   'LIQUIDATION_MUTATION_METHOD_AND_BRANCH_PARITY_UNVERIFIED','STATEFUL_TRANSACTION_SIMULATION_NOT_PERFORMED',
   'GAS_FINANCING_SWAP_AND_COMPETITION_COSTS_UNVERIFIED','CUSTODY_LIMITS_AND_INDEPENDENT_RELEASE_UNVERIFIED']};
}

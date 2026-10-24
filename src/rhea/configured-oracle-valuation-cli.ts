import {NearReadOnlyRpc} from './rpc.ts';
import {inspectConfiguredOracleDenomination} from './configured-oracle-valuation.ts';
const proc=(globalThis as typeof globalThis&{process:{env:Record<string,string|undefined>;exitCode:number}}).process;
const env=proc.env;
(async()=>{
 if(env.EXECUTION_ENABLED!=='false'||env.NEAR_NETWORK!=='mainnet'||!env.NEAR_RPC_URL)
  throw Error('STAGE28_MAINNET_READ_ONLY_REQUIRED');
 const report=await inspectConfiguredOracleDenomination(new NearReadOnlyRpc(env.NEAR_RPC_URL),{
  lendingContract:env.RHEA_LENDING_CONTRACT??'',
  configuredOracle:env.RHEA_CONFIGURED_ORACLE??'',
  borrowerAccountId:env.RHEA_BORROWER_ACCOUNT_ID??'',
  expectedLendingCodeHash:env.RHEA_EXPECTED_LENDING_CODE_HASH??'',
  expectedConfiguredOracleCodeHash:env.RHEA_EXPECTED_CONFIGURED_ORACLE_CODE_HASH??'',
  nowMs:Date.now(),maxQuoteAgeMs:120000,sanityMaxUsd:'10000000',
 });
 console.log(JSON.stringify(report,null,2));
})().catch(err=>{
 console.error(JSON.stringify({mode:'RHEA_STAGE28_CONFIGURED_ORACLE_PRICE_DENOMINATION',
  status:'BLOCKED',reason:err instanceof Error?err.message:'UNKNOWN',
  executionEnabled:false,maySign:false,mayBroadcast:false}));
 proc.exitCode=2;
});

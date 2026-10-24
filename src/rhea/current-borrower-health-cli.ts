import {NearReadOnlyRpc} from './rpc.ts';
import {inspectCurrentBorrowerHealth} from './current-borrower-health.ts';
const proc=(globalThis as typeof globalThis&{process:{env:Record<string,string|undefined>;exitCode:number}}).process;
const e=proc.env;
(async()=>{
 if(e.NEAR_NETWORK!=='mainnet'||e.EXECUTION_ENABLED!=='false'||!e.NEAR_RPC_URL)
  throw Error('STAGE26_READ_ONLY_MAINNET_REQUIRED');
 const report=await inspectCurrentBorrowerHealth(new NearReadOnlyRpc(e.NEAR_RPC_URL),{
  lendingContract:e.RHEA_LENDING_CONTRACT??'',
  oracleContract:e.RHEA_AGGREGATE_PRICE_READER??'',
  configuredOracleContract:e.RHEA_CONFIGURED_ORACLE??'',
  borrowerAccountId:e.RHEA_BORROWER_ACCOUNT_ID??'',
  expectedLendingCodeHash:e.RHEA_EXPECTED_LENDING_CODE_HASH??'',
  expectedOracleCodeHash:e.RHEA_EXPECTED_AGGREGATE_READER_CODE_HASH??'',
  expectedConfiguredOracleCodeHash:e.RHEA_EXPECTED_CONFIGURED_ORACLE_CODE_HASH??'',
  nowMs:Date.now(),maxPriceAgeMs:60000,maxFutureSkewMs:2000,
  maxConfidenceBps:150,maxPriceQueries:32,
 });
 console.log(JSON.stringify(report,null,2));
})().catch(err=>{
 console.error(JSON.stringify({mode:'RHEA_STAGE26_FRESH_SINGLE_BORROWER_HEALTH',
  status:'BLOCKED',reason:err instanceof Error?err.message:'UNKNOWN',
  executionEnabled:false,mayBroadcast:false}));
 proc.exitCode=2;
});

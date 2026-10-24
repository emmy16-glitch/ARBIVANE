import {NearReadOnlyRpc} from './rpc.ts';
import {inspectLiveLiquidationEntry} from './liquidation-entry-evidence.ts';
const proc=(globalThis as typeof globalThis&{process:{env:Record<string,string|undefined>;exitCode:number}}).process;
const e=proc.env;
(async()=>{
 if(e.NEAR_NETWORK!=='mainnet'||e.EXECUTION_ENABLED!=='false'||!e.NEAR_RPC_URL)
  throw Error('READ_ONLY_MAINNET_ONLY');
 const report=await inspectLiveLiquidationEntry(new NearReadOnlyRpc(e.NEAR_RPC_URL),{
  lendingContract:e.RHEA_LENDING_CONTRACT??'',
  configuredOracle:e.RHEA_CONFIGURED_ORACLE??'',
  aggregatePriceReader:e.RHEA_AGGREGATE_PRICE_READER??'',
  borrowerAccountId:e.RHEA_BORROWER_ACCOUNT_ID??'',
  liquidatorAccountId:e.RHEA_LIQUIDATOR_ACCOUNT_ID||undefined,
  expectedLendingCodeHash:e.RHEA_EXPECTED_LENDING_CODE_HASH??'',
  expectedConfiguredOracleCodeHash:e.RHEA_EXPECTED_CONFIGURED_ORACLE_CODE_HASH??'',
  expectedAggregatePriceReaderCodeHash:e.RHEA_EXPECTED_AGGREGATE_READER_CODE_HASH??'',
 });
 console.log(JSON.stringify(report,null,2));
})().catch(err=>{
 console.error(JSON.stringify({mode:'RHEA_STAGE25_MAINNET_LIQUIDATION_ENTRY_READ_ONLY',status:'BLOCKED',
  reason:err instanceof Error?err.message:'UNKNOWN',executionEnabled:false,mayBroadcast:false}));
 proc.exitCode=2;
});

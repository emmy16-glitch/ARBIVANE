import {NearReadOnlyRpc} from './rpc.ts';
import {inspectActivePythValuation} from './execution-pyth-valuation.ts';

const proc=(globalThis as typeof globalThis&{process:{env:Record<string,string|undefined>;exitCode:number}}).process;
const env=proc.env;
(async()=>{
 if(env.EXECUTION_ENABLED!=='false'||env.NEAR_NETWORK!=='mainnet'||!env.NEAR_RPC_URL)
  throw Error('ACTIVE_PYTH_MAINNET_READ_ONLY_REQUIRED');
 const report=await inspectActivePythValuation(new NearReadOnlyRpc(env.NEAR_RPC_URL),{
  lendingContract:env.RHEA_LENDING_CONTRACT??'',pythOracle:env.RHEA_ORACLE_CONTRACT??'',
  borrowerAccountId:env.RHEA_BORROWER_ACCOUNT_ID??'',
  expectedLendingCodeHash:env.RHEA_EXPECTED_LENDING_CODE_HASH??'',
  expectedPythOracleCodeHash:env.RHEA_EXPECTED_ORACLE_CODE_HASH??'',
  nowMs:Date.now(),maxConfidenceBps:150,sanityMaxUsd:'10000000',maxConcurrency:4,
 });
 console.log(JSON.stringify(report,null,2));
})().catch(error=>{
 console.error(JSON.stringify({mode:'RHEA_ACTIVE_EXECUTE_WITH_PYTH_VALUATION',status:'BLOCKED',
  reason:error instanceof Error?error.message:'UNKNOWN',executionEnabled:false,maySign:false,mayBroadcast:false}));
 proc.exitCode=2;
});

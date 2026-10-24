import {NearReadOnlyRpc} from './rpc.ts';
import {inspectStage24DeployedWasm} from './deployed-wasm-witness.ts';
import {inspectStage25LiquidationRoute} from './liquidation-transaction-preview.ts';
const proc=(globalThis as typeof globalThis&{process:{env:Record<string,string|undefined>;exitCode:number}}).process;
const env=proc.env;
(async()=>{
 if(env.EXECUTION_ENABLED!=='false'||env.NEAR_NETWORK!=='mainnet'||!env.NEAR_RPC_URL)
  throw Error('READ_ONLY_MAINNET_REQUIRED');
 const witness=await inspectStage24DeployedWasm(new NearReadOnlyRpc(env.NEAR_RPC_URL),env.NEAR_RPC_URL,{
  lendingContract:env.RHEA_LENDING_CONTRACT??'',
  oracleContract:env.RHEA_ORACLE_CONTRACT??'',
  expectedLendingCodeHash:env.RHEA_EXPECTED_LENDING_CODE_HASH||undefined,
  expectedOracleCodeHash:env.RHEA_EXPECTED_ORACLE_CODE_HASH||undefined,
 });
 const route=inspectStage25LiquidationRoute(witness);
 console.log(JSON.stringify({route,sourceWitnessCodeHashes:{
  lending:witness.lending.observedCodeHash,
  configuredOracle:(witness.configuredOracle??witness.oracle).observedCodeHash
 },proposedTransactions:0,eligibleRealBorrowers:0,
   transactionSimulationPerformed:false,executionEnabled:false,mayBroadcast:false},null,2));
})().catch(e=>{
 console.error(JSON.stringify({mode:'RHEA_STAGE25_LIQUIDATION_ROUTE',status:'BLOCKED',
  reason:e instanceof Error?e.message:'UNKNOWN',executionEnabled:false,mayBroadcast:false}));
 proc.exitCode=2;
});

import {NearReadOnlyRpc} from './rpc.ts';
import {inspectStage24DeployedWasm} from './deployed-wasm-witness.ts';
const proc=(globalThis as typeof globalThis&{process:{env:Record<string,string|undefined>;exitCode:number}}).process;
const env=proc.env;
(async()=>{
 if(env.EXECUTION_ENABLED!=='false'||env.NEAR_NETWORK!=='mainnet'||!env.NEAR_RPC_URL)
   throw Error('READ_ONLY_MAINNET_REQUIRED');
 const report=await inspectStage24DeployedWasm(new NearReadOnlyRpc(env.NEAR_RPC_URL),env.NEAR_RPC_URL,{
  lendingContract:env.RHEA_LENDING_CONTRACT??'',oracleContract:env.RHEA_ORACLE_CONTRACT??'',
  expectedLendingCodeHash:env.RHEA_EXPECTED_LENDING_CODE_HASH||undefined,
  expectedOracleCodeHash:env.RHEA_EXPECTED_ORACLE_CODE_HASH||undefined,
 });
 console.log(JSON.stringify(report,null,2));
})().catch(err=>{
 console.error(JSON.stringify({mode:'RHEA_STAGE24_DEPLOYED_WASM_WITNESS',status:'BLOCKED',
  reason:err instanceof Error?err.message:'UNKNOWN',executionEnabled:false,mayBroadcast:false}));
 proc.exitCode=2;
});

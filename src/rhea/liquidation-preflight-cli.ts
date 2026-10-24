import {NearReadOnlyRpc} from './rpc.ts';
import {inspectDeployedLiquidationIdentity} from './liquidation-contract-preflight.ts';
import {simulateArchivedLiquidationRules,USDE27} from './liquidation-reference-simulation.ts';
const proc=(globalThis as typeof globalThis&{process:{env:Record<string,string|undefined>;exitCode:number}}).process;
const env=proc.env;
(async()=>{
 if(env.EXECUTION_ENABLED!=='false'||env.NEAR_NETWORK!=='mainnet'||!env.NEAR_RPC_URL)
  throw Error('READ_ONLY_MAINNET_REQUIRED');
 const report=await inspectDeployedLiquidationIdentity(new NearReadOnlyRpc(env.NEAR_RPC_URL),{
  lendingContract:env.RHEA_LENDING_CONTRACT??'',oracleContract:env.RHEA_ORACLE_CONTRACT??'',
  expectedLendingCodeHash:env.RHEA_EXPECTED_LENDING_CODE_HASH||undefined,
  expectedOracleCodeHash:env.RHEA_EXPECTED_ORACLE_CODE_HASH||undefined,
 });
 // Public upstream example only. Never present as observed Rhea borrower or live profit.
 const reference=simulateArchivedLiquidationRules({
  beforeCollateralE27:(3500n*USDE27).toString(),beforeDebtE27:(4000n*USDE27).toString(),
  afterCollateralE27:(2968n*USDE27).toString(),afterDebtE27:(3000n*USDE27).toString(),
  repaidE27:(1000n*USDE27).toString(),seizedE27:(1064n*USDE27).toString(),
 });
 console.log(JSON.stringify({mode:'RHEA_STAGE23_DEPLOYED_IDENTITY_AND_SOURCE_SIM',contract:report,
  syntheticArchivedSourceExample:reference,sourceExampleIsLiveBorrower:false,executionEnabled:false,
  mayBroadcast:false,realMoneyReady:false},null,2));
})().catch(e=>{console.error(JSON.stringify({mode:'RHEA_STAGE23_PREFLIGHT',status:'BLOCKED',
 reason:e instanceof Error?e.message:'UNKNOWN',executionEnabled:false,mayBroadcast:false}));
 proc.exitCode=2;});

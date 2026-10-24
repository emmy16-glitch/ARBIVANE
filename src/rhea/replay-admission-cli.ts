import {NearReadOnlyRpc} from './rpc.ts';
import {inspectCurrentBorrowerHealth} from './current-borrower-health.ts';
import {assessStage27ReplayAdmission} from './replay-admission.ts';
const proc=(globalThis as typeof globalThis&{process:{env:Record<string,string|undefined>;exitCode:number}}).process;
const e=proc.env;
(async()=>{
 if(e.NEAR_NETWORK!=='mainnet'||e.EXECUTION_ENABLED!=='false'||!e.NEAR_RPC_URL)
  throw Error('STAGE27_READ_ONLY_MAINNET_REQUIRED');
 const rpc=new NearReadOnlyRpc(e.NEAR_RPC_URL);
 const health=await inspectCurrentBorrowerHealth(rpc,{
  lendingContract:e.RHEA_LENDING_CONTRACT??'',oracleContract:e.RHEA_AGGREGATE_PRICE_READER??'',
  configuredOracleContract:e.RHEA_CONFIGURED_ORACLE??'',
  borrowerAccountId:e.RHEA_BORROWER_ACCOUNT_ID??'',
  expectedLendingCodeHash:e.RHEA_EXPECTED_LENDING_CODE_HASH??'',
  expectedOracleCodeHash:e.RHEA_EXPECTED_AGGREGATE_READER_CODE_HASH??'',
  expectedConfiguredOracleCodeHash:e.RHEA_EXPECTED_CONFIGURED_ORACLE_CODE_HASH??'',
  nowMs:Date.now(),maxPriceAgeMs:60000,maxFutureSkewMs:2000,maxConfidenceBps:150,maxPriceQueries:32,
 });
 const latest=await rpc.viewAccount(e.RHEA_LENDING_CONTRACT??'');
 const gate=assessStage27ReplayAdmission(health,{
  latestFinalizedHeight:latest.blockHeight,maxEvidenceBlockLag:30,
  maxUnverifiedAdjustedPositionUsd:'10000000',
 });
 console.log(JSON.stringify({health:{mode:health.mode,status:health.status,
  blockHeight:health.blockHeight,positions:health.positions,
  paperAtRisk:health.paperAtRisk,blockedPositions:health.blockedPositions,
  executedTransactions:0},gate},null,2));
})().catch(err=>{
 console.error(JSON.stringify({mode:'RHEA_STAGE27_REPLAY_ADMISSION_GATE',status:'BLOCKED',
  reason:err instanceof Error?err.message:'UNKNOWN',executionEnabled:false,mayBroadcast:false}));
 proc.exitCode=2;
});

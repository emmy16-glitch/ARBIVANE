import {NearReadOnlyRpc} from './rpc.ts';
import {inspectStage34Candidate} from './stage34-candidate-preflight.ts';
import {classifyStage33Failure} from './stage33-diagnostics.ts';
const proc=(globalThis as typeof globalThis&{process:{env:Record<string,string|undefined>;exitCode:number}}).process;
const e=proc.env;
(async()=>{
 if(e.EXECUTION_ENABLED!=='false'||e.NEAR_NETWORK!=='mainnet'||!e.NEAR_RPC_URL||
  e.RHEA_BORROWER_ACCOUNT_ID!=='godlike.near')
  throw Error('STAGE34_MAINNET_READ_ONLY_PINNED_CANDIDATE_REQUIRED');
 const out=await inspectStage34Candidate(new NearReadOnlyRpc(e.NEAR_RPC_URL),{
  lendingContract:e.RHEA_LENDING_CONTRACT??'',
  configuredOracle:e.RHEA_CONFIGURED_ORACLE??'',
  pythOracle:e.RHEA_ORACLE_CONTRACT??'',
  borrowerAccountId:e.RHEA_BORROWER_ACCOUNT_ID??'',
  expectedLendingCodeHash:e.RHEA_EXPECTED_LENDING_CODE_HASH??'',
  expectedConfiguredOracleCodeHash:e.RHEA_EXPECTED_CONFIGURED_ORACLE_CODE_HASH??'',
  expectedPythCodeHash:e.RHEA_EXPECTED_ORACLE_CODE_HASH??'',
 });
 console.log(JSON.stringify(out,null,2));
})().catch(err=>{
 // Not leaking RPC URL/provider bodies. Fail CLOSED but preserve structured
 // evidence for missing oracle feeds, rate limits or contract mismatch.
 console.log(JSON.stringify({mode:'RHEA_STAGE34_ONE_BLOCK_CANDIDATE_PREFLIGHT',
  chain:'NEAR_MAINNET',status:'BLOCKED_READONLY_OBSERVATION_ERROR',
  reasonCode:classifyStage33Failure(err),borrowerAccountId:'godlike.near',
  liquidationContractLogicVerified:false,liquidationRepaymentAtomicVerified:false,
  statefulTransactionReplayVerified:false,netProfitVerified:false,
  executionEnabled:false,maySign:false,mayBroadcast:false},null,2));
});

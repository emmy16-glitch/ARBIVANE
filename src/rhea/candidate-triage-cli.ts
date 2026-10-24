import { NearReadOnlyRpc } from './rpc.ts';
import { triageRheaDebtWindow } from './candidate-triage.ts';
const proc=(globalThis as typeof globalThis & {process:{env:Record<string,string|undefined>;exitCode:number}}).process;
const env=proc.env;
async function main(){
 if(env.EXECUTION_ENABLED!=='false'||env.NEAR_NETWORK!=='mainnet')throw Error('read only requires explicit EXECUTION_ENABLED=false and NEAR_NETWORK=mainnet');
 if(!env.NEAR_RPC_URL)throw Error('NEAR_RPC_URL must be provided');
 const report=await triageRheaDebtWindow(new NearReadOnlyRpc(env.NEAR_RPC_URL),{
  lendingContract:env.RHEA_LENDING_CONTRACT??'',oracleContract:env.RHEA_ORACLE_CONTRACT??'',
  fromIndex:Number(env.RHEA_TRIAGE_FROM_INDEX??'0'),maxAccounts:Number(env.RHEA_TRIAGE_MAX_ACCOUNTS??'200'),
  pageSize:Number(env.RHEA_TRIAGE_PAGE_SIZE??'25'),maxFindings:Number(env.RHEA_TRIAGE_MAX_FINDINGS??'12'),
  maxDetails:Number(env.RHEA_TRIAGE_MAX_DETAILS??'8'),
  expectedLendingCodeHash:env.RHEA_EXPECTED_LENDING_CODE_HASH||undefined,
  expectedOracleCodeHash:env.RHEA_EXPECTED_ORACLE_CODE_HASH||undefined,
 });
 console.log(JSON.stringify(report,null,2));
 if(report.status==='INCOMPLETE_EVIDENCE')proc.exitCode=2;
}
main().catch(e=>{console.error(JSON.stringify({mode:'READ_ONLY_POSITION_TRIAGE',status:'TRIAGE_ERROR',executionEnabled:false,reason:e instanceof Error?e.message:'unknown'}));proc.exitCode=2;});

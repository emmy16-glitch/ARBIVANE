import { NearReadOnlyRpc } from './rpc.ts';
import { probeRheaIsolatedPositions } from './isolated-parity.ts';
const proc=(globalThis as typeof globalThis & {process:{env:Record<string,string|undefined>;exitCode:number}}).process;
const env=proc.env;
async function main(){
 if(env.EXECUTION_ENABLED!=='false'||env.NEAR_NETWORK!=='mainnet')throw Error('read-only mainnet probe requires EXECUTION_ENABLED=false');
 const report=await probeRheaIsolatedPositions(new NearReadOnlyRpc(env.NEAR_RPC_URL??''),{
  lendingContract:env.RHEA_LENDING_CONTRACT??'',oracleContract:env.RHEA_ORACLE_CONTRACT??'',
  maxAccounts:Number(env.RHEA_STAGE10_MAX_ACCOUNTS??'40'),pageSize:Number(env.RHEA_STAGE10_PAGE_SIZE??'10'),maxDetails:Number(env.RHEA_STAGE10_MAX_DETAILS??'8'),
  expectedLendingCodeHash:env.RHEA_EXPECTED_LENDING_CODE_HASH||undefined,expectedOracleCodeHash:env.RHEA_EXPECTED_ORACLE_CODE_HASH||undefined,
 });
 console.log(JSON.stringify(report,null,2));
 if(report.status!=='SAMPLED_POSITION_MATCH_UNAPPROVED')proc.exitCode=2;
}
main().catch(err=>{console.error(JSON.stringify({mode:'READ_ONLY_ISOLATED_POSITION_DIFFERENTIAL',status:'PROBE_ERROR',executionEnabled:false,reason:err instanceof Error?err.message:'unknown'}));proc.exitCode=2;});

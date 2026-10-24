import { NearReadOnlyRpc } from './rpc.ts';
import { scanRheaDebtWindow } from './debt-discovery.ts';
const proc=(globalThis as typeof globalThis & {process:{env:Record<string,string|undefined>;exitCode:number}}).process;
const env=proc.env;
async function main(){
 if(env.EXECUTION_ENABLED!=='false'||env.NEAR_NETWORK!=='mainnet')throw Error('READ_ONLY requires EXECUTION_ENABLED=false and NEAR_NETWORK=mainnet');
 if(!env.NEAR_RPC_URL)throw Error('explicit HTTPS NEAR_RPC_URL required');
 const result=await scanRheaDebtWindow(new NearReadOnlyRpc(env.NEAR_RPC_URL),{
  lendingContract:env.RHEA_LENDING_CONTRACT??'',fromIndex:Number(env.RHEA_DISCOVERY_FROM_INDEX??'0'),
  maxAccounts:Number(env.RHEA_DISCOVERY_MAX_ACCOUNTS??'200'),pageSize:Number(env.RHEA_DISCOVERY_PAGE_SIZE??'25'),
  maxFindings:Number(env.RHEA_DISCOVERY_MAX_FINDINGS??'20'),
  expectedLendingCodeHash:env.RHEA_EXPECTED_LENDING_CODE_HASH||undefined,
 });
 console.log(JSON.stringify(result,null,2));
 if(result.status==='SCHEMA_ERRORS_DETECTED')proc.exitCode=2;
}
main().catch(error=>{
 console.error(JSON.stringify({mode:'READ_ONLY_DEBT_INDEX',status:'PROBE_ERROR',executionEnabled:false,
  reason:error instanceof Error ? error.message:'unknown'}));proc.exitCode=2;
});

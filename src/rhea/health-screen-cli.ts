import { NearReadOnlyRpc } from './rpc.ts';
import { inspectRheaPaperHealth } from './health-screen.ts';
const proc=(globalThis as typeof globalThis & {process:{env:Record<string,string|undefined>;exitCode:number}}).process;
const env=proc.env;
function num(name:string,fallback:string):number {
 const s=env[name]??fallback;
 if(!/^(0|[1-9][0-9]*)$/.test(s))throw Error(`invalid numeric input ${name}`);
 const n=Number(s);if(!Number.isSafeInteger(n))throw Error(`unsafe numeric input ${name}`);return n;
}
async function main(){
 if(env.EXECUTION_ENABLED!=='false'||env.NEAR_NETWORK!=='mainnet'||!env.NEAR_RPC_URL)
   throw Error('Read-only NEAR mainnet probe requires EXECUTION_ENABLED=false and explicit RPC URL');
 const report=await inspectRheaPaperHealth(new NearReadOnlyRpc(env.NEAR_RPC_URL),{
  lendingContract:env.RHEA_LENDING_CONTRACT??'',oracleContract:env.RHEA_ORACLE_CONTRACT??'',
  fromIndex:num('RHEA_HEALTH_FROM_INDEX','0'),maxAccounts:num('RHEA_HEALTH_MAX_ACCOUNTS','200'),
  pageSize:num('RHEA_HEALTH_PAGE_SIZE','25'),maxFindings:num('RHEA_HEALTH_MAX_FINDINGS','10'),
  maxDetails:num('RHEA_HEALTH_MAX_DETAILS','8'),maxFeedQueries:num('RHEA_HEALTH_MAX_FEEDS','12'),
  maxAgeMs:num('RHEA_HEALTH_MAX_AGE_MS','60000'),maxFutureSkewMs:2000,maxConfidenceBps:150,
  oracleMethod:'get_price_no_older_than',nowMs:Date.now(),maxHealthDetails:num('RHEA_HEALTH_DETAIL_BUDGET','8'),
  expectedLendingCodeHash:env.RHEA_EXPECTED_LENDING_CODE_HASH||undefined,
  expectedOracleCodeHash:env.RHEA_EXPECTED_ORACLE_CODE_HASH||undefined,
 });
 console.log(JSON.stringify(report,null,2));
 if(report.status==='INCOMPLETE_HEALTH_EVIDENCE')proc.exitCode=2;
}
main().catch(error=>{console.error(JSON.stringify({mode:'READ_ONLY_RHEA_PAPER_HEALTH',status:'PROBE_ERROR',executionEnabled:false,
  reason:error instanceof Error?'SAFE_PROBE_FAILURE':'UNKNOWN'}));proc.exitCode=2;});

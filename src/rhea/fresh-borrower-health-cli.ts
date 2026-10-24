import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {NearReadOnlyRpc} from './rpc.ts';
import {inspectFreshBorrowers} from './fresh-borrower-health.ts';
import {assessExecutionReadiness} from './execution-readiness.ts';
const proc=(globalThis as typeof globalThis & {process:{env:Record<string,string|undefined>;exitCode:number}}).process;
const env=proc.env;
function uint(key:string,fallback:string):number{
 const raw=env[key]??fallback;
 if(!/^(0|[1-9][0-9]*)$/.test(raw)||!Number.isSafeInteger(Number(raw)))throw Error('INVALID_ENV_'+key);
 return Number(raw);
}
async function main(){
 if(env.EXECUTION_ENABLED!=='false'||env.NEAR_NETWORK!=='mainnet'||!env.NEAR_RPC_URL||!env.RHEA_OBSERVED_SHARD_FILE)
  throw Error('READ_ONLY_MAINNET_WITH_SHARD_FILE_REQUIRED');
 const shard:unknown=JSON.parse(await readFile(resolve(env.RHEA_OBSERVED_SHARD_FILE),'utf8'));
 const report=await inspectFreshBorrowers(new NearReadOnlyRpc(env.NEAR_RPC_URL),shard,{
  lendingContract:env.RHEA_LENDING_CONTRACT??'',oracleContract:env.RHEA_ORACLE_CONTRACT??'',
  shardId:uint('RHEA_OBSERVED_SHARD_ID','0'),shardCount:uint('RHEA_OBSERVED_SHARD_COUNT','96'),
  fromFinding:uint('RHEA_INDEX_FINDING_CURSOR','0'),maxFindings:uint('RHEA_INDEX_MAX_FINDINGS','4'),
  maxPriceQueries:uint('RHEA_INDEX_MAX_FEEDS','16'),maxPriceAgeMs:uint('RHEA_INDEX_MAX_AGE_MS','60000'),
  nowMs:Date.now(),expectedLendingCodeHash:env.RHEA_EXPECTED_LENDING_CODE_HASH||undefined,
  expectedOracleCodeHash:env.RHEA_EXPECTED_ORACLE_CODE_HASH||undefined,
 });
 const readiness=assessExecutionReadiness({
  currentBorrowerHealthVerified:false,deployedLiquidationMathAttested:false,
  oraclePriceParityAttested:false,financingGasAttested:false,
  nearTransactionSimulationAttested:false,walletCustodyLimitsApproved:false,
  competitionAndNetProfitVerified:false,independentReleaseApproved:false,
 });
 const output=resolve(env.RHEA_FRESH_REVIEW_REPORT_PATH??'rhea-stage22-fresh-health.json');
 await mkdir(dirname(output),{recursive:true});
 await writeFile(output,JSON.stringify({report,readiness},null,2)+'\n',{encoding:'utf8',mode:0o600});
 console.log(JSON.stringify({mode:report.mode,status:report.status,oldBlock:report.sourceBlockHeight,
  currentBlock:report.freshBlockHeight,inspected:report.inspected,refreshed:report.refreshed,
  blocked:report.blocked,paperAtRisk:report.paperAtRisk,paperHealthy:report.paperHealthy,
  executionEnabled:false,canBroadcast:false,readinessBlockers:readiness.blockers.length}));
 // A healthy research diagnosis isn't permission to execute.
}
main().catch(e=>{
 console.error(JSON.stringify({mode:'NEAR_RHEA_FRESH_BORROWER_RECHECK',status:'BLOCKED',
  reason:e instanceof Error?e.message:'UNKNOWN',executionEnabled:false}));proc.exitCode=2;
});

import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {NearReadOnlyRpc} from './rpc.ts';
import {composeVerifiedDetailedCheckpoint} from './verified-shard-bridge.ts';
import {inspectIndexedRheaHealth} from './indexed-health-pipeline.ts';
const proc=(globalThis as typeof globalThis & {process:{env:Record<string,string|undefined>;exitCode:number}}).process;
const env=proc.env;
function count(name:string,otherwise:string){
 const v=env[name]??otherwise;
 if(!/^(0|[1-9][0-9]*)$/.test(v)||!Number.isSafeInteger(Number(v)))throw Error('INVALID_OPTION_'+name);
 return Number(v);
}
async function main(){
 if(env.EXECUTION_ENABLED!=='false'||env.NEAR_NETWORK!=='mainnet'||!env.NEAR_RPC_URL)
  throw Error('READ_ONLY_MAINNET_REQUIRED');
 const shardCount=count('RHEA_SHARD_COUNT','12');
 if(shardCount<1||shardCount>16)throw Error('INVALID_SHARD_COUNT');
 const root=resolve(env.RHEA_SHARD_ROOT??'shards');
 const records:unknown[]=[];
 for(let i=0;i<shardCount;i++)records.push(JSON.parse(await readFile(resolve(root,'near-rhea-shard-'+i,'shard-'+i+'.json'),'utf8')));
 const {checkpoint,aggregate}=composeVerifiedDetailedCheckpoint(records,shardCount);
 const evidence=await inspectIndexedRheaHealth(new NearReadOnlyRpc(env.NEAR_RPC_URL),checkpoint,{
  lendingContract:env.RHEA_LENDING_CONTRACT??'',oracleContract:env.RHEA_ORACLE_CONTRACT??'',
  fromFinding:count('RHEA_INDEX_FINDING_CURSOR','0'),maxFoundAccounts:count('RHEA_INDEX_MAX_FINDINGS','8'),
  maxPriceQueries:count('RHEA_INDEX_MAX_FEEDS','16'),nowMs:Date.now(),
  maxAgeMs:count('RHEA_INDEX_MAX_AGE_MS','60000'),maxFutureSkewMs:2000,maxConfidenceBps:150,
  expectedLendingCodeHash:env.RHEA_EXPECTED_LENDING_CODE_HASH||undefined,
  expectedOracleCodeHash:env.RHEA_EXPECTED_ORACLE_CODE_HASH||undefined,
 });
 const report={mode:'NEAR_RHEA_STAGE18_VERIFIED_SHARD_TO_HEALTH',aggregate,indexedHealth:evidence,
  executionEnabled:false,liquidationParityVerified:false,profitabilityVerified:false};
 const output=resolve(env.RHEA_STAGE18_REPORT_PATH??'rhea-sharded-health-evidence.json');
 await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(report,null,2)+'\n',{encoding:'utf8',mode:0o600});
 console.log(JSON.stringify({mode:report.mode,indexStatus:evidence.status,blockHeight:evidence.blockHeight,
  debtAccounts:aggregate.debtAccounts,paperAtRisk:evidence.paperAtRisk,blockedPositions:evidence.blockedPositions,
  sourceRegistry:evidence.sourceRegistry,executionEnabled:false}));
 if(evidence.status==='INCOMPLETE_EVIDENCE')proc.exitCode=2;
}
main().catch(e=>{console.error(JSON.stringify({mode:'NEAR_RHEA_STAGE18_VERIFIED_SHARD_TO_HEALTH',
 status:'UNVERIFIED_INPUT_OR_RPC_ERROR',reason:e instanceof Error?e.message:'UNKNOWN',executionEnabled:false}));proc.exitCode=2;});
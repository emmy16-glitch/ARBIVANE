import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {NearReadOnlyRpc} from './rpc.ts';
import {validateObservedDetailedShard} from './observed-shard-evidence.ts';
import {inspectIndexedRheaHealth} from './indexed-health-pipeline.ts';
const proc=(globalThis as typeof globalThis & {process:{env:Record<string,string|undefined>;exitCode:number}}).process;
const env=proc.env;
function integer(key:string,def:string):number {
 const s=env[key]??def;
 if(!/^(0|[1-9][0-9]*)$/.test(s)||!Number.isSafeInteger(Number(s)))throw Error('INVALID_INPUT_'+key);
 return Number(s);
}
async function main(){
 if(env.EXECUTION_ENABLED!=='false'||env.NEAR_NETWORK!=='mainnet'||!env.NEAR_RPC_URL||
   !env.RHEA_OBSERVED_SHARD_FILE)throw Error('READ_ONLY_MAINNET_AND_SHARD_FILE_REQUIRED');
 const id=integer('RHEA_OBSERVED_SHARD_ID','0');
 const count=integer('RHEA_OBSERVED_SHARD_COUNT','96');
 const source=JSON.parse(await readFile(resolve(env.RHEA_OBSERVED_SHARD_FILE),'utf8')) as unknown;
 const {checkpoint,evidence}=validateObservedDetailedShard(source,id,count);
 const cursor=integer('RHEA_INDEX_FINDING_CURSOR','0');
 const max=integer('RHEA_INDEX_MAX_FINDINGS','8');
 if(cursor>checkpoint.findings.length||max<1||max>20)throw Error('INVALID_RESEARCH_CURSOR');
 const rpc=new NearReadOnlyRpc(env.NEAR_RPC_URL);
 // Attest the pinned source against NEAR even when this shard has no borrowers.
 const height=Number(checkpoint.blockHeight);
 const view=await rpc.viewAccount(checkpoint.lendingContract,height);
 const countView=await rpc.view<unknown>(checkpoint.lendingContract,'get_num_accounts',{},height);
 if(view.blockHeight!==checkpoint.blockHeight||view.codeHash!==checkpoint.lendingCodeHash||
    countView.blockHeight!==checkpoint.blockHeight||Number(countView.value)!==checkpoint.totalAccounts)
  throw Error('PINNED_NEAR_SOURCE_ATTESTATION_FAILED');
 const health=checkpoint.findings.length===0?null:await inspectIndexedRheaHealth(
  rpc,checkpoint,{
   lendingContract:env.RHEA_LENDING_CONTRACT??'',oracleContract:env.RHEA_ORACLE_CONTRACT??'',
   fromFinding:cursor,maxFoundAccounts:max,maxPriceQueries:integer('RHEA_INDEX_MAX_FEEDS','16'),nowMs:Date.now(),
   maxAgeMs:integer('RHEA_INDEX_MAX_AGE_MS','60000'),maxFutureSkewMs:2000,maxConfidenceBps:150,
   expectedLendingCodeHash:env.RHEA_EXPECTED_LENDING_CODE_HASH||undefined,
   expectedOracleCodeHash:env.RHEA_EXPECTED_ORACLE_CODE_HASH||undefined,
  });
 const report={mode:'NEAR_RHEA_STAGE20_PARTIAL_SHARD_HEALTH',evidence,
  health:health?{...health,sourceSnapshotComplete:false}:null,
  marketCoverageVerified:false,executionEnabled:false,liquidationParityVerified:false,profitabilityVerified:false};
 const output=resolve(env.RHEA_OBSERVED_REPORT_PATH??'rhea-partial-shard-health.json');
 await mkdir(dirname(output),{recursive:true});
 await writeFile(output,JSON.stringify(report,null,2)+'\n',{encoding:'utf8',mode:0o600});
 console.log(JSON.stringify({mode:report.mode,status:'PARTIAL_EVIDENCE_UNAPPROVED',
  shardId:id,scannedAccounts:evidence.scannedAccounts,observedDebtAccounts:evidence.observedDebtAccounts,
  healthRecords:health?.records.length??0,paperAtRisk:health?.paperAtRisk??0,blocked:health?.blockedPositions??0,
  marketCoverageVerified:false,executionEnabled:false}));
}
main().catch(e=>{
 console.error(JSON.stringify({mode:'NEAR_RHEA_STAGE20_PARTIAL_SHARD_HEALTH',status:'BLOCKED',
  reason:e instanceof Error?e.message:'UNKNOWN',executionEnabled:false}));proc.exitCode=2;
});

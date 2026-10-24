import {readFile,readdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {verifyCompletePagedIndex} from './complete-paged-index.ts';
const proc=(globalThis as typeof globalThis&{process:{env:Record<string,string|undefined>;exitCode:number}}).process;
(async()=>{
 const e=proc.env;
 if(e.EXECUTION_ENABLED!=='false'||e.NEAR_NETWORK!=='mainnet')throw Error('READ_ONLY_AGGREGATE_REQUIRED');
 const num=Number(e.RHEA_TOTAL_ACCOUNTS),shardCount=Number(e.RHEA_SHARD_COUNT);
 if(!Number.isSafeInteger(shardCount)||shardCount!==4)throw Error('EXPECTED_FOUR_SHARDS');
 const root=e.RHEA_SHARD_ROOT??'shards';
 const dirs=await readdir(root);
 const cps=[];
 for(let i=0;i<shardCount;i++){
  const dir='rhea-full-paged-shard-'+i;
  if(!dirs.includes(dir))throw Error('MISSING_SHARD_ARTIFACT_'+i);
  cps.push(JSON.parse(await readFile(join(root,dir,'shard-'+i+'.json'),'utf8')));
 }
 const report=verifyCompletePagedIndex(cps,{
  blockHeight:e.RHEA_PINNED_BLOCK??'',
  lendingCodeHash:e.RHEA_EXPECTED_LENDING_CODE_HASH??'',
  totalAccounts:num,shardCount,
 });
 const destination=e.RHEA_AGGREGATED_REPORT_PATH??'rhea-full-paged-index.json';
 await writeFile(destination,JSON.stringify(report,null,2)+'\n',{mode:0o600});
 // Print only bounded summary; full borrower identifiers stay inside the artifact.
 const {findings,...summary}=report;
 console.log(JSON.stringify(summary,null,2));
})().catch(error=>{
 console.error(JSON.stringify({mode:'RHEA_COMPLETE_PAGED_INDEX_ATTESTATION',
  status:'BLOCKED',reason:error instanceof Error?error.message:'UNKNOWN',
  completeSnapshot:false,executionEnabled:false}));
 proc.exitCode=2;
});

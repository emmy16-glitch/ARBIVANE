import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {mergeDebtShards} from './market-shards.ts';
const proc=(globalThis as typeof globalThis & {process:{env:Record<string,string|undefined>;exitCode:number}}).process;
(async()=>{
 if(proc.env.EXECUTION_ENABLED!=='false'||proc.env.NEAR_NETWORK!=='mainnet')throw Error('READ_ONLY_MAINNET_REQUIRED');
 const n=Number(proc.env.RHEA_SHARD_COUNT??'6'),root=proc.env.RHEA_SHARD_ROOT??'shards';
 if(!Number.isSafeInteger(n)||n<1||n>16)throw Error('INVALID_SHARD_COUNT');
 const shards=[];
 for(let i=0;i<n;i++)shards.push(JSON.parse(await readFile(resolve(root,`near-rhea-shard-${i}`,`shard-${i}.json`),'utf8')));
 const report=mergeDebtShards(shards,n);const path=resolve(proc.env.RHEA_MERGED_REPORT_PATH??'merged-debt-index.json');
 await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(report,null,2)+'\n',{encoding:'utf8',mode:0o600});
 console.log(JSON.stringify(report,null,2));if(report.status!=='COMPLETE_UNAPPROVED')proc.exitCode=2;
})().catch(error=>{console.error(JSON.stringify({mode:'RHEA_FULL_MARKET_SHARDED_READ_ONLY',status:'MERGE_ERROR',reason:error instanceof Error?error.message:'UNKNOWN',executionEnabled:false}));proc.exitCode=2;});

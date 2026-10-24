import {readFile} from 'node:fs/promises';
import {selectNextShardReview} from './artifact-review-selection.ts';
const proc=(globalThis as typeof globalThis & {process:{env:Record<string,string|undefined>;exitCode:number}}).process;
(async()=>{
 const env=proc.env;
 if(env.EXECUTION_ENABLED!=='false'||env.NEAR_NETWORK!=='mainnet')throw Error('READ_ONLY_MAINNET_REQUIRED');
 const runRaw=env.RHEA_REVIEW_SOURCE_RUN_ID;
 if(!runRaw||! /^[1-9][0-9]{0,17}$/.test(runRaw)||!Number.isSafeInteger(Number(runRaw)))
  throw Error('INVALID_SOURCE_RUN_ID');
 const sourcePath=env.RHEA_REVIEW_SOURCE_ARTIFACTS_PATH,reviewedPath=env.RHEA_REVIEWED_NAMES_PATH;
 if(!sourcePath||!reviewedPath)throw Error('MISSING_REVIEW_METADATA');
 const api:unknown=JSON.parse(await readFile(sourcePath,'utf8'));
 const names=(await readFile(reviewedPath,'utf8')).split(/\r?\n/).filter(Boolean);
 const pick=selectNextShardReview(Number(runRaw),api,names);
 console.log(JSON.stringify(pick??{sourceRunId:Number(runRaw),shardId:null,
  status:'NO_UNREVIEWED_SHARD_ARTIFACT',executionEnabled:false,marketCoverageVerified:false}));
})().catch(e=>{
 console.error(JSON.stringify({mode:'STAGE21_NEAR_SHARD_REVIEW_SELECTOR',status:'BLOCKED',
  reason:e instanceof Error?e.message:'UNKNOWN',executionEnabled:false}));proc.exitCode=2;
});

/**
 * Stage 21: select one previously unreviewed detailed-position shard artifact.
 * Metadata-only selection. It cannot make any on-chain debt, health or profit claim.
 */
export interface ReviewPick {
 sourceRunId:number;shardId:number;sourceArtifactName:string;reviewArtifactName:string;
 executionEnabled:false;marketCoverageVerified:false;
}
const RUN=/^[1-9][0-9]{0,17}$/;
const SOURCE=/^near-rhea-shard-(0|[1-9][0-9]*)$/;
const idOk=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>0;
const plain=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);

/** All GitHub API metadata is untrusted. A scheduled job may review only ONE shard. */
export function selectNextShardReview(
 runId:number,api:unknown,existingNames:unknown,maxShards=96,
):ReviewPick|null {
 if(!idOk(runId)||!Number.isSafeInteger(maxShards)||maxShards<2||maxShards>128)
  throw Error('INVALID_REVIEW_SOURCE_RUN');
 if(!plain(api)||!Array.isArray(api.artifacts)||!Array.isArray(existingNames)||
    !existingNames.every(x=>typeof x==='string'))throw Error('INVALID_GITHUB_ARTIFACT_METADATA');
 const reviewed=new Set(existingNames as string[]);
 const shards=new Map<number,string>();
 for(const item of api.artifacts){
  if(!plain(item)||typeof item.name!=='string')throw Error('INVALID_GITHUB_ARTIFACT_METADATA');
  const match=SOURCE.exec(item.name);if(!match)continue;
  const shardId=Number(match[1]);
  if(!Number.isSafeInteger(shardId)||shardId>=maxShards)throw Error('OUT_OF_RANGE_SHARD_ARTIFACT');
  if(!idOk(item.id)||!plain(item.workflow_run)||item.workflow_run.id!==runId)
   throw Error('CROSS_RUN_OR_UNKNOWN_ARTIFACT_PROVENANCE');
  if(item.expired===true)continue;
  if(item.expired!==false||!idOk(item.size_in_bytes))throw Error('INVALID_SHARD_ARTIFACT_STATE');
  if(shards.has(shardId))throw Error('DUPLICATE_SHARD_ARTIFACT');
  shards.set(shardId,item.name);
 }
 for(const shardId of [...shards.keys()].sort((a,b)=>a-b)){
  const reviewArtifactName='near-rhea-stage21-reviewed-'+runId+'-shard-'+shardId;
  if(reviewed.has(reviewArtifactName))continue;
  return {sourceRunId:runId,shardId,sourceArtifactName:shards.get(shardId)!,reviewArtifactName,
   executionEnabled:false,marketCoverageVerified:false};
 }
 return null;
}

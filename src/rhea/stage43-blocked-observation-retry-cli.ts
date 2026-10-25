import {readFile,writeFile,rename} from 'node:fs/promises';
import {NearReadOnlyRpc} from './rpc.ts';
import {PacedNearReadOnlyRpc} from './paced-readonly-rpc.ts';
import {ResilientNearReadOnlyRpc} from './resilient-readonly-rpc.ts';
import type {CompletePagedIndex} from './complete-paged-index.ts';
import type {SweepCheckpoint} from './full-active-pyth-sweep.ts';
import type {Stage38Result} from './stage38-live-candidate-pipeline.ts';
import type {Stage42Shard,Stage42WindowReport} from './stage42-window-reconciliation.ts';
import {collectStage43BlockedTargets,retryStage43BlockedObservations} from './stage43-blocked-observation-retry.ts';

const proc=(globalThis as typeof globalThis&{process:{env:Record<string,string|undefined>;exitCode:number}}).process;
const env=proc.env;
const num=(name:string,defaultValue:string):number=>{
 const s=env[name]??defaultValue;
 if(!/^(0|[1-9][0-9]*)$/.test(s)||!Number.isSafeInteger(Number(s)))
  throw Error('INVALID_'+name);
 return Number(s);
};
async function json<T>(path:string):Promise<T>{
 return JSON.parse(await readFile(path,'utf8')) as T;
}
async function save(path:string,value:unknown):Promise<void>{
 const temp=path+'.tmp';
 await writeFile(temp,JSON.stringify(value,null,2)+'\n',{encoding:'utf8',mode:0o600});
 await rename(temp,path);
}
(async()=>{
 if(env.EXECUTION_ENABLED!=='false'||env.NEAR_NETWORK!=='mainnet'||!env.NEAR_RPC_URL||
  !env.RHEA_STAGE43_SOURCE_PATH||!env.RHEA_STAGE43_SHARDS_DIR||
  !env.RHEA_STAGE43_RECONCILED_PATH||!env.RHEA_STAGE43_PARENT_RUN_ID||
  !/^[1-9][0-9]{0,15}$/.test(env.RHEA_STAGE43_PARENT_RUN_ID))
  throw Error('STAGE43_REQUIRES_VERIFIED_PARENT_AND_READONLY_CONFIGURATION');
 const source=await json<CompletePagedIndex>(env.RHEA_STAGE43_SOURCE_PATH);
 const saved=await json<Stage42WindowReport>(env.RHEA_STAGE43_RECONCILED_PATH);
 const shards:Stage42Shard[]=[];
 for(let shard=0;shard<4;shard++){
  const dir=env.RHEA_STAGE43_SHARDS_DIR+'/rhea-stage42-opportunity-shard-'+shard;
  shards.push({shard,
   checkpoint:await json<SweepCheckpoint>(dir+'/stage32-reprice-report.json'),
   qualification:await json<Stage38Result>(dir+'/stage38-qualification.json'),
  });
 }
 const baseCursor=num('RHEA_STAGE43_BASE_CURSOR','972');
 // Verify all upstream records, including exact identities/counts, before ANY RPC.
 const targets=collectStage43BlockedTargets(source,shards,saved,baseCursor);
 const rpc=new ResilientNearReadOnlyRpc(
  new PacedNearReadOnlyRpc(new NearReadOnlyRpc(env.NEAR_RPC_URL),
   num('RHEA_RPC_SPACING_MS','900')));
 const lendingContract=env.RHEA_LENDING_CONTRACT??'';
 const tip=await rpc.viewAccount(lendingContract);
 if(!/^[1-9][0-9]{0,15}$/.test(tip.blockHeight)||
  !Number.isSafeInteger(Number(tip.blockHeight))||
  tip.codeHash!==env.RHEA_EXPECTED_LENDING_CODE_HASH||
  tip.codeHash!==source.lendingCodeHash)
  throw Error('STAGE43_CURRENT_LENDING_CODE_HASH_OR_BLOCK_DRIFT');
 const report=await retryStage43BlockedObservations(rpc,source,shards,saved,baseCursor,{
  fromTarget:num('RHEA_STAGE43_FROM_TARGET','0'),
  maxTargets:num('RHEA_STAGE43_MAX_TARGETS','12'),
  concurrency:1,pinnedBlockHeight:Number(tip.blockHeight),
  lendingContract,pythOracle:env.RHEA_ORACLE_CONTRACT??'',
  expectedLendingCodeHash:env.RHEA_EXPECTED_LENDING_CODE_HASH??'',
  expectedPythOracleCodeHash:env.RHEA_EXPECTED_ORACLE_CODE_HASH??'',
  maxConfidenceBps:150,sanityMaxUsd:'10000000',
 });
 if(report.targetCount!==targets.length)throw Error('STAGE43_TARGET_COUNT_DRIFT');
 await save(env.RHEA_STAGE43_REPORT_PATH??'stage43-blocked-retry.json',report);
 const {observations,...summary}=report;
 console.log(JSON.stringify(summary,null,2));
})().catch(err=>{
 console.error(JSON.stringify({
  mode:'RHEA_STAGE43_RECONCILED_BLOCKED_OBSERVATION_RETRY',status:'BLOCKED',
  reason:err instanceof Error&&/^STAGE43_|^INVALID_/.test(err.message)?err.message:'READ_OR_ATTESTATION_FAILURE',
  executionEnabled:false,maySignMainnet:false,mayBroadcastMainnet:false,
 }));
 proc.exitCode=2;
});

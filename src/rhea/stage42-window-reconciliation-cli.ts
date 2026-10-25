import {readFile,writeFile} from 'node:fs/promises';
import type {CompletePagedIndex} from './complete-paged-index.ts';
import type {SweepCheckpoint} from './full-active-pyth-sweep.ts';
import type {Stage38Result} from './stage38-live-candidate-pipeline.ts';
import {reconcileStage42Window,type Stage42Shard} from './stage42-window-reconciliation.ts';
const proc=(globalThis as typeof globalThis&{process:{env:Record<string,string|undefined>;exitCode:number}}).process;
async function readJson<T>(path:string):Promise<T>{return JSON.parse(await readFile(path,'utf8')) as T;}
async function run():Promise<void>{
 const env=proc.env;
 if(env.EXECUTION_ENABLED!=='false'||env.NEAR_NETWORK!=='mainnet'||
  !env.RHEA_STAGE42_SOURCE_PATH||!env.RHEA_STAGE42_SHARDS_DIR||
  !env.RHEA_STAGE42_OUTPUT_PATH||!/^(0|[1-9][0-9]*)$/.test(env.RHEA_STAGE42_BASE_CURSOR??''))
  throw Error('STAGE42_EXPLICIT_READ_ONLY_INPUTS_REQUIRED');
 const source=await readJson<CompletePagedIndex>(env.RHEA_STAGE42_SOURCE_PATH);
 const shards:Stage42Shard[]=[];
 for(let shard=0;shard<4;shard++){
  const dir=`${env.RHEA_STAGE42_SHARDS_DIR}/rhea-stage42-opportunity-shard-${shard}`;
  shards.push({shard,
   checkpoint:await readJson<SweepCheckpoint>(`${dir}/stage32-reprice-report.json`),
   qualification:await readJson<Stage38Result>(`${dir}/stage38-qualification.json`),
  });
 }
 const report=reconcileStage42Window(source,shards,Number(env.RHEA_STAGE42_BASE_CURSOR));
 await writeFile(env.RHEA_STAGE42_OUTPUT_PATH,JSON.stringify(report,null,2)+'\n',{encoding:'utf8',mode:0o600});
 console.log(JSON.stringify(report,null,2));
}
run().catch(error=>{
 console.error(error instanceof Error?error.message:'STAGE42_UNKNOWN_ERROR');
 proc.exitCode=2;
});

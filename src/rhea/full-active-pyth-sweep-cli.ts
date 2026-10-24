import {readFile,writeFile,rename} from 'node:fs/promises';
import {NearReadOnlyRpc} from './rpc.ts';
import {PacedNearReadOnlyRpc} from './paced-readonly-rpc.ts';
import {ResilientNearReadOnlyRpc} from './resilient-readonly-rpc.ts';
import {sweepIndexedDebtWithActivePyth,type SweepCheckpoint} from './full-active-pyth-sweep.ts';
import type {CompletePagedIndex} from './complete-paged-index.ts';
const proc=(globalThis as typeof globalThis&{process:{env:Record<string,string|undefined>;exitCode:number}}).process;
const env=proc.env;
const num=(name:string,def:string):number=>{
 const v=env[name]??def;
 if(!/^(0|[1-9][0-9]*)$/.test(v)||!Number.isSafeInteger(Number(v)))throw Error('INVALID_'+name);
 return Number(v);
};
async function atomicFile(path:string,data:unknown){
 const tmp=path+'.tmp';
 await writeFile(tmp,JSON.stringify(data,null,2)+'\n',{encoding:'utf8',mode:0o600});
 await rename(tmp,path);
}
(async()=>{
 if(env.EXECUTION_ENABLED!=='false'||env.NEAR_NETWORK!=='mainnet'||!env.NEAR_RPC_URL||
  !env.RHEA_STAGE32_VERIFIED_INDEX_PATH)throw Error('STAGE32_ONLY_MAINNET_READONLY_VERIFIED_INDEX');
 const source=JSON.parse(await readFile(env.RHEA_STAGE32_VERIFIED_INDEX_PATH,'utf8')) as CompletePagedIndex;
 const checkpointPath=env.RHEA_STAGE32_CHECKPOINT_PATH??'stage32-reprice-checkpoint.json';
 const reportPath=env.RHEA_STAGE32_REPORT_PATH??'stage32-reprice-report.json';
 const resume=env.RHEA_STAGE32_RESUME==='true'?
  JSON.parse(await readFile(checkpointPath,'utf8')) as SweepCheckpoint:undefined;
 const output=await sweepIndexedDebtWithActivePyth(new ResilientNearReadOnlyRpc(new PacedNearReadOnlyRpc(new NearReadOnlyRpc(env.NEAR_RPC_URL),Number(env.RHEA_RPC_SPACING_MS??'700'))),source,{
  startFinding:num('RHEA_STAGE32_START_FINDING','0'),
  maxFindings:num('RHEA_STAGE32_MAX_FINDINGS','80'),
  batchSize:num('RHEA_STAGE32_BATCH_SIZE','20'),
  concurrency:num('RHEA_STAGE32_CONCURRENCY','2'),
  lendingContract:env.RHEA_LENDING_CONTRACT??'',
  pythOracle:env.RHEA_ORACLE_CONTRACT??'',
  expectedLendingCodeHash:env.RHEA_EXPECTED_LENDING_CODE_HASH??'',
  expectedPythOracleCodeHash:env.RHEA_EXPECTED_ORACLE_CODE_HASH??'',
  maxConfidenceBps:150,sanityMaxUsd:'10000000',
 },resume,async(cp,report)=>{
  await atomicFile(checkpointPath,cp);
  console.error(JSON.stringify({mode:'STAGE32_SWEEP_PROGRESS',sourceBlockHeight:report.sourceBlockHeight,
   startFinding:report.startFinding,nextFinding:report.nextFinding,
   paperAtRisk:report.paperAtRisk,blocked:report.blocked}));
 });
 await atomicFile(reportPath,output);
 const {items,...summary}=output;
 console.log(JSON.stringify(summary,null,2));
})().catch(err=>{
 console.error(JSON.stringify({mode:'RHEA_STAGE32_RESUMABLE_PYTH_REPRICE_SWEEP',status:'BLOCKED',
  reason:err instanceof Error?err.message:'UNKNOWN',
  executionEnabled:false,maySign:false,mayBroadcast:false}));
 proc.exitCode=2;
});

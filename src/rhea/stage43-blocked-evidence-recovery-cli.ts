import {readFile,writeFile,appendFile} from 'node:fs/promises';
import type {CompletePagedIndex} from './complete-paged-index.ts';
import type {SweepCheckpoint} from './full-active-pyth-sweep.ts';
import type {Stage38Result} from './stage38-live-candidate-pipeline.ts';
import type {Stage42WindowReport,Stage42Shard} from './stage42-window-reconciliation.ts';
import {NearReadOnlyRpc} from './rpc.ts';
import {PacedNearReadOnlyRpc} from './paced-readonly-rpc.ts';
import {ResilientNearReadOnlyRpc} from './resilient-readonly-rpc.ts';
import {recoverStage43Blocked} from './stage43-blocked-evidence-recovery.ts';

const proc=(globalThis as typeof globalThis&{
 process:{env:Record<string,string|undefined>;exitCode:number}
}).process;
const e=proc.env;
async function json<T>(path:string):Promise<T>{
 return JSON.parse(await readFile(path,'utf8')) as T;
}
function numeric(name:string,defaultValue:string,min:number,max:number):number{
 const v=e[name]??defaultValue;
 if(!/^(0|[1-9][0-9]*)$/.test(v)||!Number.isSafeInteger(Number(v))||
 Number(v)<min||Number(v)>max)throw Error('INVALID_'+name);
 return Number(v);
}
async function run(){
 if(e.EXECUTION_ENABLED!=='false'||e.NEAR_NETWORK!=='mainnet'||
  !e.NEAR_RPC_URL||!e.RHEA_STAGE43_SOURCE_PATH||
  !e.RHEA_STAGE43_SHARDS_DIR||!e.RHEA_STAGE43_STAGE42_REPORT_PATH||
  !e.RHEA_STAGE43_STAGE42_RUN_ID||
  !/^[1-9][0-9]{0,15}$/.test(e.RHEA_STAGE43_STAGE42_RUN_ID))
  throw Error('STAGE43_ONLY_VERIFIED_READ_ONLY_ARTIFACTS');
 const source=await json<CompletePagedIndex>(e.RHEA_STAGE43_SOURCE_PATH);
 const previous=await json<Stage42WindowReport>(e.RHEA_STAGE43_STAGE42_REPORT_PATH);
 const shards:Stage42Shard[]=[];
 for(let i=0;i<4;i++){
  const dir=e.RHEA_STAGE43_SHARDS_DIR+'/rhea-stage42-opportunity-shard-'+i;
  shards.push({shard:i,
   checkpoint:await json<SweepCheckpoint>(dir+'/stage32-reprice-report.json'),
   qualification:await json<Stage38Result>(dir+'/stage38-qualification.json')});
 }
 // Stage42's aggregate base cursor is independently recomputed and verified.
 const rpc=new ResilientNearReadOnlyRpc(
  new PacedNearReadOnlyRpc(new NearReadOnlyRpc(e.NEAR_RPC_URL),
   numeric('RHEA_STAGE43_RPC_SPACING_MS','1000',100,5000)),
  {maxRetries:2,initialDelayMs:750,maxDelayMs:8000,maxCachedPinnedViews:256});
 const report=await recoverStage43Blocked(rpc,source,shards,previous,{
  baseCursor:previous.baseCursor,maxTargets:320,maxRetries:2,
  maxRetryDelayMs:30000,
  betweenAccountsMs:numeric('RHEA_STAGE43_ACCOUNT_DELAY_MS','1500',0,30000),
  maxRiskCandidates:12,concurrency:1,
  lendingContract:e.RHEA_LENDING_CONTRACT??'',pythOracle:e.RHEA_ORACLE_CONTRACT??'',
  expectedLendingCodeHash:e.RHEA_EXPECTED_LENDING_CODE_HASH??'',
  expectedPythOracleCodeHash:e.RHEA_EXPECTED_ORACLE_CODE_HASH??'',
  maxConfidenceBps:150,sanityMaxUsd:'10000000',
  minimumPaperGrossUsdE27:'1000000000000000000000000',
 },undefined,undefined,undefined,async(processed,total)=>{
  await appendFile('stage43-progress.jsonl',
   JSON.stringify({mode:'STAGE43_RETRY_PROGRESS',processed,total,
    executionEnabled:false,mayBroadcastMainnet:false})+'\n',
   {encoding:'utf8',mode:0o600});
  if(processed%10===0||processed===total)
   console.error(JSON.stringify({mode:'STAGE43_PROGRESS',processed,total}));
 });
 await writeFile('stage43-retry-report.json',JSON.stringify(report,null,2)+'\n',
  {encoding:'utf8',mode:0o600});
 if(report.bestProposal)
  await writeFile('stage43-positive-stage35-evidence.json',
   JSON.stringify(report.bestProposal,null,2)+'\n',
   {encoding:'utf8',mode:0o600});
 const {rows,bestProposal,...summary}=report;
 console.log(JSON.stringify(summary,null,2));
}
run().catch(e=>{
 // Never expose provider tokens, filesystem contents or raw HTTP errors.
 const message=e instanceof Error?e.message:'UNKNOWN';
 console.error(JSON.stringify({mode:'RHEA_STAGE43_RECOVER_BLOCKED_BORROWER_EVIDENCE',
  status:'BLOCKED',reason:/^STAGE4[23]_[A-Z0-9_]+$/.test(message)?message:'UNVERIFIED_INPUT_OR_RPC',
  mainnetExecutionEnabled:false,maySignMainnet:false,mayBroadcastMainnet:false,
  realNetProfitVerified:false}));
 proc.exitCode=2;
});

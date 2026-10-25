import {readFile,writeFile} from 'node:fs/promises';
import {NearReadOnlyRpc} from './rpc.ts';
import {PacedNearReadOnlyRpc} from './paced-readonly-rpc.ts';
import type {CompletePagedIndex} from './complete-paged-index.ts';
import type {Stage42Shard,Stage42WindowReport} from './stage42-window-reconciliation.ts';
import type {SweepCheckpoint} from './full-active-pyth-sweep.ts';
import type {Stage38Result} from './stage38-live-candidate-pipeline.ts';
import type {Stage43Report} from './stage43-blocked-observation-retry.ts';
import {qualifyStage61RecoveredRisk} from './stage61-recovered-risk-to-sandbox.ts';
const proc=(globalThis as typeof globalThis&{process:{env:Record<string,string|undefined>;exitCode:number}}).process;
const e=proc.env;
const json=async<T>(p:string)=>JSON.parse(await readFile(p,'utf8')) as T;
(async()=>{
 if(e.EXECUTION_ENABLED!=='false'||e.NEAR_NETWORK!=='mainnet'||!e.NEAR_RPC_URL||
  !e.RHEA_STAGE43_SOURCE_PATH||!e.RHEA_STAGE43_SHARDS_DIR||
  !e.RHEA_STAGE43_RECONCILED_PATH||!e.RHEA_STAGE61_STAGE43_REPORT_PATH||
  e.NEAR_PRIVATE_KEY||e.MAINNET_PRIVATE_KEY)
  throw Error('STAGE61_VERIFIED_READONLY_SOURCE_REQUIRED');
 const source=await json<CompletePagedIndex>(e.RHEA_STAGE43_SOURCE_PATH);
 const saved=await json<Stage42WindowReport>(e.RHEA_STAGE43_RECONCILED_PATH);
 const shards:Stage42Shard[]=[];
 for(let shard=0;shard<4;shard++){
  const dir=e.RHEA_STAGE43_SHARDS_DIR+'/rhea-stage42-opportunity-shard-'+shard;
  shards.push({shard,checkpoint:await json<SweepCheckpoint>(dir+'/stage32-reprice-report.json'),
   qualification:await json<Stage38Result>(dir+'/stage38-qualification.json')});
 }
 const recovered=await json<Stage43Report>(e.RHEA_STAGE61_STAGE43_REPORT_PATH);
 const output=await qualifyStage61RecoveredRisk(
  new PacedNearReadOnlyRpc(new NearReadOnlyRpc(e.NEAR_RPC_URL),900),
  source,shards,saved,recovered,{
   startFinding:saved.baseCursor,maxFindings:80,maxRiskCandidates:12,concurrency:1,
   lendingContract:e.RHEA_LENDING_CONTRACT??'',pythOracle:e.RHEA_ORACLE_CONTRACT??'',
   expectedLendingCodeHash:e.RHEA_EXPECTED_LENDING_CODE_HASH??'',
   expectedPythOracleCodeHash:e.RHEA_EXPECTED_ORACLE_CODE_HASH??'',
   maxConfidenceBps:150,sanityMaxUsd:'10000000',
   minimumPaperGrossUsdE27:'1000000000000000000000000',
  });
 await writeFile('stage61-recovered-source-evidence.json',JSON.stringify(output,null,2)+'\n',{encoding:'utf8',mode:0o600});
 if(output.bestProposal)
  await writeFile('stage61-positive-stage35-evidence.json',
   JSON.stringify(output.bestProposal,null,2)+'\n',{encoding:'utf8',mode:0o600});
 const {rows,bestProposal,...summary}=output;
 console.log(JSON.stringify(summary,null,2));
})().catch(err=>{
 console.error(JSON.stringify({mode:'RHEA_STAGE61_RECOVERED_RISK_TO_SANDBOX',status:'BLOCKED',
  reason:err instanceof Error&&/^STAGE61_/.test(err.message)?err.message:'INVALID_SOURCE_OR_RPC',
  mainnetExecutionEnabled:false,maySignMainnet:false,mayBroadcastMainnet:false}));
 proc.exitCode=2;
});

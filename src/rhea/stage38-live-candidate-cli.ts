import {readFile,writeFile} from 'node:fs/promises';
import {NearReadOnlyRpc} from './rpc.ts';
import {PacedNearReadOnlyRpc} from './paced-readonly-rpc.ts';
import type {CompletePagedIndex} from './complete-paged-index.ts';
import type {SweepCheckpoint} from './full-active-pyth-sweep.ts';
import {qualifyStage38Candidates} from './stage38-live-candidate-pipeline.ts';
const proc=(globalThis as typeof globalThis&{process:{env:Record<string,string|undefined>;exitCode:number}}).process;
const e=proc.env;
const n=(key:string,def:string)=>{
 const s=e[key]??def;if(!/^(0|[1-9][0-9]*)$/.test(s)||!Number.isSafeInteger(Number(s)))
  throw Error('INVALID_'+key);return Number(s);
};
(async()=>{
 if(e.EXECUTION_ENABLED!=='false'||e.NEAR_NETWORK!=='mainnet'||!e.NEAR_RPC_URL||
  e.RHEA_STAGE38_SOURCE_RUN!=='40128285853'||!e.RHEA_STAGE38_SOURCE_FILE||
  !e.RHEA_STAGE38_STAGE32_REPORT_FILE)throw Error('STAGE38_VERIFIED_READONLY_ARTIFACTS_REQUIRED');
 const source=JSON.parse(await readFile(e.RHEA_STAGE38_SOURCE_FILE,'utf8')) as CompletePagedIndex;
 const prior=JSON.parse(await readFile(e.RHEA_STAGE38_STAGE32_REPORT_FILE,'utf8')) as SweepCheckpoint;
 const results=await qualifyStage38Candidates(new PacedNearReadOnlyRpc(new NearReadOnlyRpc(e.NEAR_RPC_URL),Number(e.RHEA_RPC_SPACING_MS??'700')),source,prior,{
  startFinding:n('RHEA_STAGE38_START_FINDING','332'),maxFindings:n('RHEA_STAGE38_MAX_FINDINGS','80'),
  maxRiskCandidates:80,concurrency:2,
  lendingContract:e.RHEA_LENDING_CONTRACT??'',pythOracle:e.RHEA_ORACLE_CONTRACT??'',
  expectedLendingCodeHash:e.RHEA_EXPECTED_LENDING_CODE_HASH??'',
  expectedPythOracleCodeHash:e.RHEA_EXPECTED_ORACLE_CODE_HASH??'',
  maxConfidenceBps:150,sanityMaxUsd:'10000000',
  minimumPaperGrossUsdE27:'1000000000000000000000000',
 });
 await writeFile('stage38-qualification.json',JSON.stringify(results,null,2)+'\n',
  {encoding:'utf8',mode:0o600});
 if(results.bestProposal)
  await writeFile('stage38-positive-stage35-evidence.json',
   JSON.stringify(results.bestProposal,null,2)+'\n',{encoding:'utf8',mode:0o600});
 const {rows,bestProposal,...summary}=results;
 console.log(JSON.stringify(summary,null,2));
})().catch(()=>{
 console.log(JSON.stringify({mode:'RHEA_STAGE38_LIVE_CANDIDATE_TO_SANDBOX',status:'BLOCKED',
  chain:'NEAR_MAINNET',sandboxPlanReady:false,noEligibleMainnetTrades:true,
  mainnetExecutionEnabled:false,maySignMainnet:false,mayBroadcastMainnet:false,
  netProfitVerified:false},null,2));
 proc.exitCode=2;
});

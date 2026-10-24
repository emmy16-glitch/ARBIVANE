import {readFile,writeFile} from 'node:fs/promises';
import {NearReadOnlyRpc} from './rpc.ts';
import type {CompletePagedIndex} from './complete-paged-index.ts';
import type {SweepCheckpoint} from './full-active-pyth-sweep.ts';
import type {Stage38Result} from './stage38-live-candidate-pipeline.ts';
import {retryStage39Candidates} from './stage39-rate-limited-risk-retry.ts';

const proc=(globalThis as typeof globalThis&{process:{env:Record<string,string|undefined>;exitCode:number}}).process;
const e=proc.env;
(async()=>{
 if(e.NEAR_NETWORK!=='mainnet'||e.EXECUTION_ENABLED!=='false'||!e.NEAR_RPC_URL||
  e.RHEA_STAGE39_ORIGINAL_SCAN_RUN!=='40128285853'||
  !e.RHEA_STAGE39_SOURCE_PATH||!e.RHEA_STAGE39_SHARDS_DIR)
  throw Error('STAGE39_REQUIRES_ONCHAIN_FULL_SCAN_AND_REAL_PRIOR_STAGES');
 const source=JSON.parse(await readFile(e.RHEA_STAGE39_SOURCE_PATH,'utf8')) as CompletePagedIndex;
 const previous:Stage38Result[]=[];const sweeps:SweepCheckpoint[]=[];
 const dir=e.RHEA_STAGE39_SHARDS_DIR;
 for(let n=0;n<4;n++){
  const base=dir+'/rhea-stage38-opportunity-shard-'+n+'/';
  sweeps.push(JSON.parse(await readFile(base+'stage32-reprice-checkpoint.json','utf8')) as SweepCheckpoint);
  previous.push(JSON.parse(await readFile(base+'stage38-qualification.json','utf8')) as Stage38Result);
 }
 const report=await retryStage39Candidates(new NearReadOnlyRpc(e.NEAR_RPC_URL),
  source,sweeps,previous,{
   baseCursor:332,maxRetries:2,maxRetryDelayMs:60000,betweenAccountsMs:4500,maxTargetAccounts:12,
   maxRiskCandidates:12,concurrency:1,lendingContract:e.RHEA_LENDING_CONTRACT??'',
   pythOracle:e.RHEA_ORACLE_CONTRACT??'',
   expectedLendingCodeHash:e.RHEA_EXPECTED_LENDING_CODE_HASH??'',
   expectedPythOracleCodeHash:e.RHEA_EXPECTED_ORACLE_CODE_HASH??'',
   maxConfidenceBps:150,sanityMaxUsd:'10000000',
   minimumPaperGrossUsdE27:'1000000000000000000000000',
  });
 await writeFile('stage39-retry-evidence.json',JSON.stringify(report,null,2)+'\n',
  {encoding:'utf8',mode:0o600});
 if(report.bestProposal)await writeFile('stage39-positive-stage35-evidence.json',
  JSON.stringify(report.bestProposal,null,2)+'\n',{encoding:'utf8',mode:0o600});
 const {accountResults,bestProposal,...summary}=report;
 console.log(JSON.stringify(summary,null,2));
})().catch(()=>{
 // Never print upstream response, raw RPC URL, or secret-containing errors.
 console.log(JSON.stringify({mode:'RHEA_STAGE39_RATE_LIMITED_CANDIDATE_REVALIDATION',
  status:'BLOCKED_SOURCE_EVIDENCE',sandboxPlanReady:false,
  mainnetExecutionEnabled:false,maySignMainnet:false,mayBroadcastMainnet:false,
  profitVerified:false},null,2));
 proc.exitCode=2;
});

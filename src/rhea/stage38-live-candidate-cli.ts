import {readFile,writeFile} from 'node:fs/promises';
import {NearReadOnlyRpc} from './rpc.ts';
import {PacedNearReadOnlyRpc} from './paced-readonly-rpc.ts';
import {FailoverNearReadOnlyRpc} from './failover-readonly-rpc.ts';
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
 // Stage68: let source-positive, tiny-gross candidates reach local Sandbox
 // only. This is NOT a lower trading-profit requirement, wallet approval,
 // transaction parity proof, or permission to sign on NEAR mainnet.
 const sandboxGross=e.RHEA_STAGE38_SANDBOX_MIN_PAPER_GROSS_USD_E27;
 if(sandboxGross!==undefined&&
  (e.NEAR_WORKSPACES_NETWORK!=='sandbox'||e.NEAR_PRIVATE_KEY||
   e.MAINNET_PRIVATE_KEY||!/^[1-9][0-9]{0,38}$/.test(sandboxGross)))
  throw Error('STAGE68_TINY_GROSS_REQUIRES_KEYLESS_LOCAL_SANDBOX');
 const minimumPaperGrossUsdE27=sandboxGross??'1000000000000000000000000';
 // Stage159 explicitly limits the large-liquidation execution lane to its
 // independently exercised LiNEAR/LiNEAR path, without hiding other reads.
 const requiredSameTokenId=e.STAGE157_REQUIRED_ROUTE;
 if(requiredSameTokenId!==undefined&&
   (requiredSameTokenId!=='linear-protocol.near'||
    e.EXECUTION_ENABLED!=='false'||e.NEAR_WORKSPACES_NETWORK!=='sandbox'||
    e.NEAR_PRIVATE_KEY||e.MAINNET_PRIVATE_KEY))
  throw Error('STAGE159_UNTRUSTED_SOURCE_EXECUTION_ROUTE');
 const source=JSON.parse(await readFile(e.RHEA_STAGE38_SOURCE_FILE,'utf8')) as CompletePagedIndex;
 const prior=JSON.parse(await readFile(e.RHEA_STAGE38_STAGE32_REPORT_FILE,'utf8')) as SweepCheckpoint;
 const endpoints=[e.NEAR_RPC_URL,e.NEAR_RPC_FALLBACK_URL].filter((x):x is string=>Boolean(x));
 const transport=new FailoverNearReadOnlyRpc(endpoints.map(url=>new NearReadOnlyRpc(url)));
 const results=await qualifyStage38Candidates(new PacedNearReadOnlyRpc(transport,Number(e.RHEA_RPC_SPACING_MS??'700')),source,prior,{
  startFinding:n('RHEA_STAGE38_START_FINDING','332'),maxFindings:n('RHEA_STAGE38_MAX_FINDINGS','80'),
  maxRiskCandidates:80,concurrency:2,
  lendingContract:e.RHEA_LENDING_CONTRACT??'',pythOracle:e.RHEA_ORACLE_CONTRACT??'',
  expectedLendingCodeHash:e.RHEA_EXPECTED_LENDING_CODE_HASH??'',
  expectedPythOracleCodeHash:e.RHEA_EXPECTED_ORACLE_CODE_HASH??'',
  maxConfidenceBps:150,sanityMaxUsd:'10000000',
  minimumPaperGrossUsdE27,requiredSameTokenId,
 });
 await writeFile('stage38-qualification.json',JSON.stringify(results,null,2)+'\n',
  {encoding:'utf8',mode:0o600});
 if(results.bestProposal)
  await writeFile('stage38-positive-stage35-evidence.json',
   JSON.stringify(results.bestProposal,null,2)+'\n',{encoding:'utf8',mode:0o600});
 const blockedReasonCounts=Object.fromEntries([...new Set(results.rows
  .filter(x=>x.status==='BLOCKED_FRESH_READ').map(x=>x.reasonCode??'UNCLASSIFIED_READ_ERROR'))]
  .sort().map(reason=>[reason,results.rows.filter(x=>x.status==='BLOCKED_FRESH_READ'&&
   (x.reasonCode??'UNCLASSIFIED_READ_ERROR')===reason).length]));
 const sizingStatusCounts=Object.fromEntries([...new Set(results.rows
  .filter(x=>x.status!=='BLOCKED_FRESH_READ').map(x=>x.sizingStatus??'MISSING_SIZING_STATUS'))]
  .sort().map(status=>[status,results.rows.filter(x=>x.status!=='BLOCKED_FRESH_READ'&&
   (x.sizingStatus??'MISSING_SIZING_STATUS')===status).length]));
 const sizingBlockerCounts=Object.fromEntries([...new Set(results.rows.flatMap(x=>x.sizingBlockers))]
  .sort().map(blocker=>[blocker,results.rows.filter(x=>x.sizingBlockers.includes(blocker)).length]));
 const {rows,bestProposal,...summary}=results;
 console.log(JSON.stringify({...summary,blockedReasonCounts,sizingStatusCounts,sizingBlockerCounts},null,2));
})().catch(()=>{
 console.log(JSON.stringify({mode:'RHEA_STAGE38_LIVE_CANDIDATE_TO_SANDBOX',status:'BLOCKED',
  chain:'NEAR_MAINNET',sandboxPlanReady:false,noEligibleMainnetTrades:true,
  mainnetExecutionEnabled:false,maySignMainnet:false,mayBroadcastMainnet:false,
  netProfitVerified:false},null,2));
 proc.exitCode=2;
});

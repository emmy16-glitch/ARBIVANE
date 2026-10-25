import {readFile,writeFile} from 'node:fs/promises';
import {NearReadOnlyRpc} from './rpc.ts';
import {PacedNearReadOnlyRpc} from './paced-readonly-rpc.ts';
import {ResilientNearReadOnlyRpc} from './resilient-readonly-rpc.ts';
import type {CompletePagedIndex} from './complete-paged-index.ts';
import type {Stage43Report} from './stage43-blocked-observation-retry.ts';
import {preflightStage44RecoveredRisk} from './stage44-recovered-risk-sandbox-preflight.ts';
const proc=(globalThis as typeof globalThis&{
 process:{env:Record<string,string|undefined>;exitCode:number}
}).process;
const e=proc.env;
(async()=>{
 if(e.EXECUTION_ENABLED!=='false'||e.NEAR_NETWORK!=='mainnet'||
  !e.NEAR_RPC_URL||!e.RHEA_STAGE44_SOURCE_PATH||!e.RHEA_STAGE44_STAGE43_REPORT_PATH||
  !e.RHEA_STAGE44_STAGE43_RUN_ID||!/^[1-9][0-9]{0,15}$/.test(e.RHEA_STAGE44_STAGE43_RUN_ID))
  throw Error('STAGE44_VERIFIED_READ_ONLY_ARTIFACTS_REQUIRED');
 const source=JSON.parse(await readFile(e.RHEA_STAGE44_SOURCE_PATH,'utf8')) as CompletePagedIndex;
 const report=JSON.parse(await readFile(e.RHEA_STAGE44_STAGE43_REPORT_PATH,'utf8')) as Stage43Report;
 const paced=new PacedNearReadOnlyRpc(new NearReadOnlyRpc(e.NEAR_RPC_URL),1000);
 const rpc=new ResilientNearReadOnlyRpc(paced,{maxRetries:2,initialDelayMs:700,maxDelayMs:7000});
 const output=await preflightStage44RecoveredRisk(rpc,source,report,{
  maxCandidates:12,maxRiskCandidates:12,concurrency:1,
  lendingContract:e.RHEA_LENDING_CONTRACT??'',pythOracle:e.RHEA_ORACLE_CONTRACT??'',
  expectedLendingCodeHash:e.RHEA_EXPECTED_LENDING_CODE_HASH??'',
  expectedPythOracleCodeHash:e.RHEA_EXPECTED_ORACLE_CODE_HASH??'',
  maxConfidenceBps:150,sanityMaxUsd:'10000000',
  minimumPaperGrossUsdE27:'1000000000000000000000000',
 });
 await writeFile('stage44-recovered-risk-report.json',JSON.stringify(output,null,2)+'\n',
  {encoding:'utf8',mode:0o600});
 if(output.bestProposal){
  await writeFile('stage44-positive-stage35-evidence.json',
   JSON.stringify(output.bestProposal,null,2)+'\n',{encoding:'utf8',mode:0o600});
 }
 const {rows,bestProposal,...summary}=output;
 console.log(JSON.stringify(summary,null,2));
})().catch(err=>{
 const msg=err instanceof Error?err.message:'UNKNOWN';
 console.error(JSON.stringify({mode:'RHEA_STAGE44_RECOVERED_RISK_SANDBOX_PREFLIGHT',
  status:'BLOCKED',reason:/^STAGE44_[A-Z0-9_]+$/.test(msg)?msg:'UNVERIFIED_DATA_OR_RPC',
  mainnetExecutionEnabled:false,maySignMainnet:false,mayBroadcastMainnet:false,
  netProfitVerified:false}));
 proc.exitCode=2;
});

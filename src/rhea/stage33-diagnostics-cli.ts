import {readFile,writeFile} from 'node:fs/promises';
import {NearReadOnlyRpc} from './rpc.ts';
import {ResilientNearReadOnlyRpc} from './resilient-readonly-rpc.ts';
import type {CompletePagedIndex} from './complete-paged-index.ts';
import type {SweepCheckpoint} from './full-active-pyth-sweep.ts';
import {diagnoseStage32BlockedAndRisk} from './stage33-diagnostics.ts';
const proc=(globalThis as typeof globalThis&{process:{env:Record<string,string|undefined>;exitCode:number}}).process;
(async()=>{
 const e=proc.env;
 if(e.EXECUTION_ENABLED!=='false'||e.NEAR_NETWORK!=='mainnet'||!e.NEAR_RPC_URL||
  !e.RHEA_STAGE33_SOURCE_FILE||!e.RHEA_STAGE33_SHARD_DIR||
  e.RHEA_STAGE33_SOURCE_RUN!=='40128285853')
  throw Error('STAGE33_READ_ONLY_VERIFIED_SOURCE_REQUIRED');
 const source=JSON.parse(await readFile(e.RHEA_STAGE33_SOURCE_FILE,'utf8')) as CompletePagedIndex;
 const shards:SweepCheckpoint[]=[];
 for(let i=0;i<4;i++)shards.push(JSON.parse(await readFile(
  e.RHEA_STAGE33_SHARD_DIR+'/rhea-stage32-repriced-shard-'+i+'/stage32-reprice-checkpoint.json','utf8')) as SweepCheckpoint);
 const report=await diagnoseStage32BlockedAndRisk(new ResilientNearReadOnlyRpc(new NearReadOnlyRpc(e.NEAR_RPC_URL)),
  source,shards,{
   baseCursor:12,maxBlockedPerShard:3,maxCandidates:16,concurrency:2,
   lendingContract:e.RHEA_LENDING_CONTRACT??'',pythOracle:e.RHEA_ORACLE_CONTRACT??'',
   expectedLendingCodeHash:e.RHEA_EXPECTED_LENDING_CODE_HASH??'',
   expectedPythOracleCodeHash:e.RHEA_EXPECTED_ORACLE_CODE_HASH??'',
   maxConfidenceBps:150,sanityMaxUsd:'10000000',
  });
 await writeFile('stage33-oracle-diagnostics.json',JSON.stringify(report,null,2)+'\n',
  {encoding:'utf8',mode:0o600});
 const {observations,...summary}=report;
 console.log(JSON.stringify(summary,null,2));
})().catch(e=>{
 console.error(JSON.stringify({mode:'RHEA_STAGE33_ORACLE_FAILURE_DIAGNOSTICS',
  status:'BLOCKED',reason:e instanceof Error?e.message:'UNKNOWN',
  executionEnabled:false,maySign:false,mayBroadcast:false}));
 proc.exitCode=2;
});

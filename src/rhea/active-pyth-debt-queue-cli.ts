import {readFile,writeFile} from 'node:fs/promises';
import {NearReadOnlyRpc} from './rpc.ts';
import {ResilientNearReadOnlyRpc} from './resilient-readonly-rpc.ts';
import {refreshIndexedBorrowerCandidates} from './active-pyth-debt-queue.ts';
import type {CompletePagedIndex} from './complete-paged-index.ts';
const proc=(globalThis as typeof globalThis&{process:{env:Record<string,string|undefined>;exitCode:number}}).process;
const env=proc.env;
const number=(name:string,def:string):number=>{
 const v=env[name]??def;
 if(!/^(0|[1-9][0-9]*)$/.test(v)||!Number.isSafeInteger(Number(v)))throw Error('INVALID_'+name);
 return Number(v);
};
(async()=>{
 if(env.EXECUTION_ENABLED!=='false'||env.NEAR_NETWORK!=='mainnet'||!env.NEAR_RPC_URL||
 !env.RHEA_STAGE31_VERIFIED_INDEX_PATH)throw Error('STAGE31_READ_ONLY_VERIFIED_INDEX_REQUIRED');
 const raw=JSON.parse(await readFile(env.RHEA_STAGE31_VERIFIED_INDEX_PATH,'utf8')) as CompletePagedIndex;
 const results=await refreshIndexedBorrowerCandidates(new ResilientNearReadOnlyRpc(new NearReadOnlyRpc(env.NEAR_RPC_URL)),raw,{
  fromFinding:number('RHEA_STAGE31_FROM_FINDING','0'),
  maxFindings:number('RHEA_STAGE31_MAX_FINDINGS','12'),
  concurrency:number('RHEA_STAGE31_CONCURRENCY','2'),
  lendingContract:env.RHEA_LENDING_CONTRACT??'',
  pythOracle:env.RHEA_ORACLE_CONTRACT??'',
  expectedLendingCodeHash:env.RHEA_EXPECTED_LENDING_CODE_HASH??'',
  expectedPythOracleCodeHash:env.RHEA_EXPECTED_ORACLE_CODE_HASH??'',
  maxConfidenceBps:150,sanityMaxUsd:'10000000',
 });
 const dest=env.RHEA_STAGE31_REPORT_PATH??'rhea-stage31-priced-debt-queue.json';
 await writeFile(dest,JSON.stringify(results,null,2)+'\n',{encoding:'utf8',mode:0o600});
 const {items,...summary}=results;
 console.log(JSON.stringify(summary,null,2));
})().catch(e=>{
 console.error(JSON.stringify({mode:'RHEA_STAGE31_ACTIVE_PYTH_DEBT_QUEUE',status:'BLOCKED',
  reason:e instanceof Error?e.message:'UNKNOWN',
  executionEnabled:false,maySign:false,mayBroadcast:false}));
 proc.exitCode=2;
});

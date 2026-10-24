import { readFile } from 'node:fs/promises';
import { NearReadOnlyRpc } from './rpc.ts';
import { inspectIndexedRheaHealth, scoreIndexedPaperScenarios } from './indexed-health-pipeline.ts';
import type { PaperScenario } from './opportunity-simulation.ts';
const proc=(globalThis as typeof globalThis & {process:{env:Record<string,string|undefined>;exitCode:number}}).process;
const env=proc.env;
function num(key:string,def:string):number {
 const value=env[key]??def;
 if(!/^(0|[1-9][0-9]*)$/.test(value)||!Number.isSafeInteger(Number(value)))throw Error('INVALID_NUMBER_'+key);
 return Number(value);
}
async function main(){
 if(env.EXECUTION_ENABLED!=='false'||env.NEAR_NETWORK!=='mainnet'||!env.NEAR_RPC_URL||!env.RHEA_INDEX_CHECKPOINT_PATH)
  throw Error('READ_ONLY_MAINNET_AND_CHECKPOINT_REQUIRED');
 const checkpoint:unknown=JSON.parse(await readFile(env.RHEA_INDEX_CHECKPOINT_PATH,'utf8'));
 const output=await inspectIndexedRheaHealth(new NearReadOnlyRpc(env.NEAR_RPC_URL),checkpoint,{
  lendingContract:env.RHEA_LENDING_CONTRACT??'',oracleContract:env.RHEA_ORACLE_CONTRACT??'',
  fromFinding:num('RHEA_INDEX_FINDING_CURSOR','0'),maxFoundAccounts:num('RHEA_INDEX_MAX_FINDINGS','8'),
  maxPriceQueries:num('RHEA_INDEX_MAX_FEEDS','16'),nowMs:Date.now(),
  maxAgeMs:num('RHEA_INDEX_MAX_AGE_MS','60000'),maxFutureSkewMs:2000,maxConfidenceBps:150,
  expectedLendingCodeHash:env.RHEA_EXPECTED_LENDING_CODE_HASH||undefined,
  expectedOracleCodeHash:env.RHEA_EXPECTED_ORACLE_CODE_HASH||undefined,
 });
 const scenarios:PaperScenario[]|null=env.RHEA_INDEX_PAPER_SCENARIOS_JSON_PATH?
  JSON.parse(await readFile(env.RHEA_INDEX_PAPER_SCENARIOS_JSON_PATH,'utf8')) as PaperScenario[]:null;
 const scored=scenarios===null?null:scoreIndexedPaperScenarios(output,scenarios);
 console.log(JSON.stringify({mode:'NEAR_RHEA_STAGE17_INDEXED_RESEARCH',indexedHealth:output,scoredPaperScenarios:scored,
  executionEnabled:false,liquidationParityVerified:false,profitabilityVerified:false},null,2));
 if(output.status==='INCOMPLETE_EVIDENCE'||scored?.blocked)proc.exitCode=2;
}
main().catch(()=>{console.error(JSON.stringify({mode:'NEAR_RHEA_STAGE17_INDEXED_RESEARCH',status:'CHECKPOINT_OR_VIEW_ERROR',
 executionEnabled:false,liquidationParityVerified:false}));proc.exitCode=2;});

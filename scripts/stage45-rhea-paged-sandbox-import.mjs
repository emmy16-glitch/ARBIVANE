#!/usr/bin/env node
/** Stage45: archival Rhea state loaded by bounded pinned-prefix view_state,
 * then patched ONLY to a disposable local NEAR Sandbox account.
 * Does not prove a complete key set, liquidation eligibility or profit.
 */
import {open,rename,writeFile,unlink} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
import {NearReadOnlyRpc} from '../src/rhea/rpc.ts';
import {coverPinnedContractState} from './stage45-prefix-state.mjs';
import {ArchivalStateRpc} from './stage45-archival-state-rpc.mjs';

const env=process.env,BLOCK=221433162;
const LENDING='contract.main.burrow.near';
const CODE_HASH='6Nek1MZ8cwJJ2xMQAUWup9V5AToYS9rkTxJfwo6BCpFa';
const reportPath='stage45-rhea-paged-state-import.json';
const spoolPath='stage45-rhea-state-spool.ndjson';
let worker,stateRpc=null;
const report={
 mode:'ARBIVANE_STAGE45_PINNED_RHEA_PREFIX_SANDBOX_IMPORT',
 chain:'NEAR_SANDBOX',sourceNetwork:'NEAR_MAINNET_READ_ONLY',
 sourceBlockHeight:String(BLOCK),lendingContract:LENDING,
 expectedLendingCodeHash:CODE_HASH,
 status:'BLOCKED_NOT_YET_RUN',reason:null,
 codeHashVerified:false,prefixPartitionTraversalFinished:false,
 completePrefixCoverage:false,unresolvedExactBoundaryPrefixCount:null,
 dataRecordsRead:0,dataRecordsPatched:0,sourceBytesObserved:0,
 prefixQueryCount:0,oversizeResponses:0,rateLimitResponses:0,
 stateAppliedIntoSandbox:false,configMatchesPinnedSource:false,
 fullContractStorageParityVerified:false,
 realRheaLiquidationAttempted:false,transactionReplayVerified:false,
 financingVerified:false,positiveNetProfitVerified:false,
 executionEnabled:false,maySignMainnet:false,mayBroadcastMainnet:false,
 blockers:[],
};
function integer(name,defaultValue,min,max){
 const s=env[name]??String(defaultValue);
 if(!/^(0|[1-9][0-9]*)$/.test(s)||!Number.isSafeInteger(Number(s))||
  Number(s)<min||Number(s)>max)throw Error('STAGE45_INVALID_'+name);
 return Number(s);
}
async function save(){
 await writeFile(reportPath+'.tmp',JSON.stringify(report,null,2)+'\n',
  {encoding:'utf8',mode:0o600});
 await rename(reportPath+'.tmp',reportPath);
}
function reason(err){
 const msg=err instanceof Error?err.message:'';
 return /^STAGE45_[A-Z0-9_]+$/.test(msg)?msg:
  'STAGE45_UNVERIFIED_ARCHIVAL_OR_SANDBOX_FAILURE';
}
async function main(){
 if(env.EXECUTION_ENABLED!=='false'||env.NEAR_WORKSPACES_NETWORK!=='sandbox'||
  env.STAGE45_ALLOW_LOCAL_MUTATION!=='true'||env.NEAR_NETWORK!=='mainnet'||
  env.NEAR_PRIVATE_KEY||env.MAINNET_PRIVATE_KEY||env.NEAR_ACCOUNT_ID||
  !env.NEAR_RPC_URL||new URL(env.NEAR_RPC_URL).protocol!=='https:')
  throw Error('STAGE45_LOCAL_SANDBOX_ONLY');
 const rpc=new NearReadOnlyRpc(env.NEAR_RPC_URL);
 const [account,config]=await Promise.all([
  rpc.viewAccount(LENDING,BLOCK),rpc.view(LENDING,'get_config',{},BLOCK),
 ]);
 if(account.blockHeight!==String(BLOCK)||config.blockHeight!==String(BLOCK)||
  account.codeHash!==CODE_HASH)
  throw Error('STAGE45_LENDING_DEPLOYED_HASH_OR_BLOCK_DRIFT');
 report.codeHashVerified=true;
 const opts={
  blockHeight:BLOCK,
  maxQueries:integer('STAGE45_MAX_QUERIES',1536,1,12000),
  maxRecords:integer('STAGE45_MAX_RECORDS',180000,1,5000000),
  maxBytes:integer('STAGE45_MAX_STATE_BYTES',134217728,1024,1073741824),
  maxDepth:integer('STAGE45_MAX_PREFIX_DEPTH',4,1,8),
  maxLeafRecords:integer('STAGE45_MAX_LEAF_RECORDS',10000,1,20000),
 };
 stateRpc=new ArchivalStateRpc({
  endpoint:env.NEAR_RPC_URL,accountId:LENDING,blockHeight:BLOCK,
  paceMs:integer('STAGE45_RPC_GAP_MS',220,0,5000),
  timeoutMs:18000,maxRetries:2,
 });
 const spool=await open(spoolPath,'w',0o600);
 let coverage;
 try{
  coverage=await coverPinnedContractState(prefix=>stateRpc.viewState(prefix),opts,
   async rows=>{
    if(rows.length){
     await spool.writeFile(rows.map(row=>JSON.stringify(row)+'\n').join(''));
     report.dataRecordsRead+=rows.length;
    }
   });
 }finally{
  await spool.close();
  const stats=stateRpc.getStats();
  report.prefixQueryCount=stats.rpcCalls;
  report.oversizeResponses=stats.oversizeResponses;
  report.rateLimitResponses=stats.rateLimitResponses;
 }
 report.prefixPartitionTraversalFinished=true;
 report.completePrefixCoverage=coverage.completePrefixCoverage;
 report.unresolvedExactBoundaryPrefixCount=coverage.unresolvedExactBoundaryPrefixCount;
 report.dataRecordsRead=coverage.records;
 report.sourceBytesObserved=coverage.rawKeyAndValueBytes;
 report.prefixWitnessSha256=coverage.recordStreamSha256;
 report.blockHash=coverage.blockHash;
 await save();
 const {Worker}=await import('near-workspaces');
 worker=await Worker.init({network:'sandbox'});
 // Code-only import: avoid Workspaces's unbounded withData:true view_state.
 const lending=await worker.rootAccount.importContract({
  mainnetContract:LENDING,blockId:BLOCK,withData:false,
 });
 const importedAccount=await lending.accountView();
 if(importedAccount.code_hash!==CODE_HASH)
  throw Error('STAGE45_SANDBOX_WASM_CODE_HASH_MISMATCH');
 const patchBytes=integer('STAGE45_PATCH_MAX_JSON_BYTES',32000,1024,64000);
 const patchRecords=integer('STAGE45_PATCH_MAX_RECORDS',50,1,250);
 let records=[],size=0;
 async function flush(){
  if(!records.length)return;
  // Workspaces patches only local Sandbox storage (it may apply twice
  // for delayed Sandbox view propagation). Never patches mainnet.
  await lending.patchStateRecords({records});
  report.dataRecordsPatched+=records.length;
  records=[];size=0;
  if(report.dataRecordsPatched%1000<patchRecords)
   console.error(JSON.stringify({mode:'STAGE45_SANDBOX_PATCH_PROGRESS',
    patched:report.dataRecordsPatched,total:report.dataRecordsRead,
    mainnetExecutionEnabled:false}));
 }
 const reader=createInterface({input:createReadStream(spoolPath),crlfDelay:Infinity});
 for await(const line of reader){
  if(!line)continue;
  const row=JSON.parse(line);
  const entry={Data:{account_id:LENDING,data_key:row.key,value:row.value}};
  const bytes=Buffer.byteLength(JSON.stringify(entry));
  if(bytes>patchBytes)throw Error('STAGE45_SINGLE_KEY_EXCEEDS_PATCH_LIMIT');
  if(records.length>=patchRecords||size+bytes>patchBytes)await flush();
  records.push(entry);size+=bytes;
 }
 await flush();
 if(report.dataRecordsPatched!==report.dataRecordsRead)
  throw Error('STAGE45_PATCHED_RECORD_COUNT_MISMATCH');
 report.stateAppliedIntoSandbox=true;
 let sandboxConfig;
 try{sandboxConfig=await lending.view('get_config',{});}
 catch{throw Error('STAGE45_SANDBOX_CONFIG_VIEW_FAILED');}
 report.configMatchesPinnedSource=JSON.stringify(sandboxConfig)===
  JSON.stringify(config.value);
 if(!report.configMatchesPinnedSource)
  throw Error('STAGE45_IMPORTED_CONFIG_DISAGREES_WITH_PINNED_MAINNET');
 report.status=report.completePrefixCoverage?
  'SANDBOX_CONFIG_MATCH_WITH_ROOT_STORAGE_RESPONSE':
  'SANDBOX_CONFIG_MATCH_WITH_SPLIT_PREFIX_GAPS';
 report.blockers=[
  ...(!report.completePrefixCoverage?[
   'OVERSIZED_PREFIX_SPLITTING_CANNOT_RULE_OUT_KEYS_EQUAL_TO_SPLIT_BOUNDARIES']:[]),
  'TRIE_ROOT_PROOF_AND_FULL_STORAGE_KEYSET_NOT_ATTESTED',
  'DEPENDENT_ORACLE_AND_NEP141_FT_STATE_NOT_IMPORTED',
  'NO_VERIFIED_RHEA_LIQUIDATION_RECEIPTS_OR_POST_BALANCE_SETTLEMENT',
  'NO_FINANCING_SWAP_GAS_COST_OR_REALIZED_PROFIT',
  'MAINNET_SIGNING_AND_BROADCASTING_DISABLED',
 ];
 await save();
 console.log(JSON.stringify(report,null,2));
}
try{
 await save();await main();
}catch(err){
 report.status='BLOCKED_IMPORT_OR_INCOMPLETE_PREFIX_COVERAGE';
 report.reason=reason(err);
 report.blockers=[report.reason,'NO_FULL_RHEA_STATE_OR_EXECUTION_PARITY_PROVEN',
  'MAINNET_SIGNING_AND_BROADCASTING_DISABLED'];
 await save().catch(()=>{});
 console.log(JSON.stringify(report,null,2));
 process.exitCode=2;
}finally{
 if(worker)await worker.tearDown().catch(()=>{});
 await unlink(spoolPath).catch(()=>{});
}

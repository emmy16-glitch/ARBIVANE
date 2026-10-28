#!/usr/bin/env node
/** Stage187 authentic Sandbox-only autopilot.
 * Fresh Rhea reads are always readonly; mutation occurs only inside the
 * pre-existing Stage37 isolated Workspaces runner with disposable accounts.
 * Never accepts arbitrary executable paths, keys, network or token addresses.
 */
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {NearReadOnlyRpc} from '../src/rhea/rpc.ts';
import {indexPagedPositions} from '../src/rhea/paged-position-index.ts';
import {evaluateActualCandidate} from '../src/rhea/stage38-live-candidate-pipeline.ts';
import {buildStage37SandboxPlan} from '../src/rhea/stage37-sandbox-liquidation.ts';
import {stage171VerifyDashboardSourceBudget} from './stage171-dashboard-source-budget.mjs';
import {validateAutopilotEnvironment,admitAutopilotProposal,nextScanCursor} from './stage187-sandbox-autopilot-policy.mjs';

const env=process.env;
const root=resolve(new URL('..',import.meta.url).pathname);
const workspace=resolve(process.cwd());
const control=resolve(env.ARBIVANE_AUTOPILOT_CONTROL_PATH??join(workspace,'control.json'));
const resultPath=join(workspace,'stage187-results.json');
const cursorPath=join(workspace,'stage187-cursor.json');
const emit=(stage,status,message,evidence={})=>{
 const allowed={stage,status,message,evidence:{...evidence,mainnetExecutionEnabled:false}};
 process.stdout.write('@arbivane:'+JSON.stringify(allowed)+'\n');
};
const wait=ms=>new Promise(done=>setTimeout(done,ms));
const number=(value,otherwise,min,max)=>{
 if(value===undefined)return otherwise;
 if(!/^(0|[1-9][0-9]*)$/.test(value)||!Number.isSafeInteger(Number(value))||
  Number(value)<min||Number(value)>max)throw Error('STAGE187_INVALID_SCAN_LIMIT');
 return Number(value);
};
async function flag(){
 try {
  const raw=JSON.parse(await readFile(control,'utf8'));
  return raw.stop===true?'stop':raw.pause===true?'pause':null;
 }catch(err){
  if(err?.code==='ENOENT')return null;
  throw Error('STAGE187_CONTROL_STATE_UNAVAILABLE');
 }
}
async function checkpoint(path,value){
 const tmp=path+'.tmp';
 await writeFile(tmp,JSON.stringify(value,null,2)+'\n',{mode:0o600});
 await rename(tmp,path);
}
async function loadCursor(){
 try{
  const row=JSON.parse(await readFile(cursorPath,'utf8'));
  return Number.isSafeInteger(row.next)&&row.next>=0?row.next:0;
 }catch(error){
  if(error?.code==='ENOENT')return 0;
  throw Error('STAGE187_CORRUPT_SCAN_CURSOR');
 }
}
async function runSandbox(proposal,index){
 const target=join(workspace,'attempt-'+String(index).padStart(5,'0'));
 await mkdir(target,{recursive:true,mode:0o700});
 const evidence=join(target,'source-evidence.json');
 await writeFile(evidence,JSON.stringify(proposal,null,2)+'\n',{mode:0o600});
 const script=join(root,'scripts/stage37-workspaces-sandbox-replay.mjs');
 const child=spawn(process.execPath,['--experimental-strip-types',script],{
  cwd:target,stdio:['ignore','pipe','pipe'],
  env:{...env,EXECUTION_ENABLED:'false',NEAR_NETWORK:'mainnet',
   NEAR_WORKSPACES_NETWORK:'sandbox',STAGE37_ALLOW_SANDBOX_MUTATION:'true',
   STAGE49_ALLOW_SANDBOX_WRAP_NEAR_FUNDING:'true',
   STAGE37_STAGE35_EVIDENCE_PATH:evidence,NEAR_PRIVATE_KEY:'',
   MAINNET_PRIVATE_KEY:'',NEAR_ACCOUNT_ID:''}
 });
 const lastErrors=[];
 let stderrBuffer='';
 child.stderr.on('data',chunk=>{
  stderrBuffer+=String(chunk);
  const lines=stderrBuffer.split('\n');stderrBuffer=lines.pop()?.slice(-1500)??'';
  for(const line of lines)if(line.trim()){
   lastErrors.push(line.replace(/(?:ed25519:)?[A-Za-z0-9+/]{80,}={0,2}/g,'[redacted]').slice(0,180));
   if(lastErrors.length>4)lastErrors.shift();
  }
 });
 child.stdout.resume();
 const outcome=await new Promise(done=>{
  let settled=false;
  const complete=(value)=>{if(!settled){settled=true;done(value)}};
  child.on('error',error=>complete({code:1,error:error.message}));
  child.on('exit',(code,signal)=>complete({code:code??1,signal}));
 });
 return {directory:target,source:evidence,exitCode:outcome.code,
  failure:outcome.code===0?null:(outcome.error??lastErrors.at(-1)??'SANDBOX_RUNNER_EXITED')};
}
async function run(){
 validateAutopilotEnvironment(env);
 const maxAccounts=number(env.ARBIVANE_SCAN_PAGE_ACCOUNTS,150,25,1000);
 const maxEvaluations=number(env.ARBIVANE_SCAN_EVALUATIONS,8,1,25);
 const scanDelayMs=number(env.ARBIVANE_SCAN_INTERVAL_MS,8000,1000,120000);
 const maxAttempts=number(env.ARBIVANE_SESSION_ATTEMPTS,3,1,20);
 const lending=env.RHEA_LENDING_CONTRACT||'contract.main.burrow.near';
 const oracle=env.RHEA_ORACLE_CONTRACT||'aggregate-oracle.near';
 const rpc=new NearReadOnlyRpc(env.NEAR_RPC_URL);
 const budget={maxFinancingUsd:env.ARBIVANE_MAX_FINANCING_USD,
  minimumNetProfitUsd:env.ARBIVANE_MINIMUM_NET_PROFIT_USD};
 await mkdir(workspace,{recursive:true});
 let cursor=await loadCursor(),attempts=0,eligible=0,scanned=0,failedCycles=0;
 let outcome='running';
 const results=[];
 await checkpoint(resultPath,{mode:'STAGE187_SANDBOX_AUTOPILOT',outcome,attempts:results,
  mainnetExecutionEnabled:false,realizedPnlVerified:false});
 emit('system','running','Autonomous read-only Rhea discovery started.',{cursor,maximumFinancingUsd:budget.maxFinancingUsd});
 while(true){
  const requested=await flag();
  if(requested){outcome=requested;break}
  if(attempts>=maxAttempts){outcome='attempt_limit';break}
  try{
   const tip=await rpc.viewAccount(lending);
   if(tip.codeHash!==env.RHEA_EXPECTED_LENDING_CODE_HASH)throw Error('STAGE187_LENDING_CODE_HASH_DRIFT');
   const h=Number(tip.blockHeight);
   const batch=await indexPagedPositions(rpc,{
    lendingContract:lending,pinnedBlockHeight:h,expectedLendingCodeHash:tip.codeHash,
    startIndex:cursor,maxAccounts,pageSize:25,concurrency:1,maxRetries:2,
    batchDelayMs:500,retryBaseDelayMs:1200,
   });
   const next=nextScanCursor(cursor,batch.checkpoint.nextIndex,batch.checkpoint.totalAccounts);
   await checkpoint(cursorPath,{next,chain:'NEAR_MAINNET',accountSnapshotBlock:tip.blockHeight});
   cursor=next;scanned+=batch.checkpoint.scannedAccounts;
   emit('scan','info','Completed pinned Rhea borrower-index window.',{
    scanned:batch.checkpoint.scannedAccounts,totalScanned:scanned,
    debtCandidates:batch.checkpoint.findings.length,chainBlock:tip.blockHeight,nextCursor:cursor});
   let reviewed=0;
   for(const finding of batch.checkpoint.findings){
    if(reviewed>=maxEvaluations||await flag())break;
    const legs=finding.positions?.flatMap(p=>p.debtAssetIds??[])??[];
    if(!legs.includes('linear-protocol.near'))continue;
    reviewed++;
    try{
     const proposal=await evaluateActualCandidate(rpc,finding.accountId,{
      lendingContract:lending,pythOracle:oracle,
      expectedLendingCodeHash:env.RHEA_EXPECTED_LENDING_CODE_HASH,
      expectedPythOracleCodeHash:env.RHEA_EXPECTED_ORACLE_CODE_HASH,
      maxConfidenceBps:150,sanityMaxUsd:'10000000',minimumPaperGrossUsdE27:'1',
      requiredSameTokenId:'linear-protocol.near',sourceMaxRepayBps:1000,
     });
     const admission=admitAutopilotProposal(proposal,budget,{
      buildPlan:buildStage37SandboxPlan,verifyBudget:stage171VerifyDashboardSourceBudget});
     if(!admission.admitted){
      emit('screen','info','Fresh source candidate rejected.',{
       borrower: finding.accountId,reason:admission.reason});
      continue;
     }
     // Controls can arrive during expensive price/oracle validation.
     // Never begin a NEW Sandbox transaction once Pause or Stop was requested.
     if(await flag())break;
     eligible++;
     const attempt=++attempts;
     emit('screen','success','Source-backed candidate admitted for isolated Sandbox.',{
      borrower:finding.accountId,attempt,sourceBlock:proposal.blockHeight,
      sourceRepayUsdE27:proposal.repay.referenceUsdE27});
     emit('execution','running','Starting genuine isolated Workspaces transaction.',{attempt});
     const result=await runSandbox(proposal,attempt);
     results.push(result);
     await checkpoint(resultPath,{mode:'STAGE187_SANDBOX_AUTOPILOT',outcome:'running',
      attempts:results,mainnetExecutionEnabled:false,realizedPnlVerified:false});
     emit('execution',result.exitCode===0?'success':'failure',
      result.exitCode===0?'Sandbox runner finished; receipt verification pending.':'Sandbox runner failed; no verified settlement claimed.',{
       attempt,borrower:finding.accountId,exitCode:result.exitCode,
       failure:result.failure?.slice(0,180)??null});
    }catch(error){
     emit('screen','warning','Candidate failed fresh evidence or route verification.',{
      borrower:finding.accountId,reason:String(error?.message??'SCREEN_FAILED').slice(0,110)});
    }
   }
   failedCycles=0;
  }catch(error){
   failedCycles++;
   emit('scan','warning','Current source scan blocked; retrying without liquidation.',{
    failures:failedCycles,reason:String(error?.message??'SCAN_FAILED').slice(0,110)});
   if(failedCycles>=4){outcome='scan_failed';break}
  }
  for(let elapsed=0;elapsed<scanDelayMs;elapsed+=1000){
   if(await flag())break;
   await wait(Math.min(1000,scanDelayMs-elapsed));
  }
 }
 await checkpoint(resultPath,{mode:'STAGE187_SANDBOX_AUTOPILOT',outcome,
  attempts:results,scanned,eligible,attemptCount:attempts,
  mainnetExecutionEnabled:false,realizedPnlVerified:false});
 emit('system',outcome==='scan_failed'?'failure':'info','Autopilot run ended.',{
  outcome,scanned,eligible,attemptCount:attempts});
 if(outcome==='scan_failed')process.exitCode=2;
}
run().catch(error=>{
 emit('system','failure','Autopilot failed closed.',{
  reason:String(error?.message??'STAGE187_FAILED').slice(0,150)});
 process.exitCode=2;
});


/** Stage88 — durable, credential-free accounting of which authentic NEAR
 * dependency clone blocked BEFORE any real local liquidation transaction.
 * An import witness is never evidence of liquidation or realized profit.
 */
import {writeFile,rename} from 'node:fs/promises';
const ID=/^[a-z0-9._-]{2,64}$/;
const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const ERROR=/^(?:STAGE[0-9]{1,3}|SANDBOX|LOCAL_SANDBOX|NEAR_WORKSPACES)_[A-Z0-9_]{1,115}$/;
const number=v=>Number.isSafeInteger(v)&&v>=0&&v<=5000000;
export const stage88FailureCode=error=>{
 const s=error instanceof Error?error.message:'';
 return ERROR.test(s)?s:'STAGE88_UNCLASSIFIED_CLONE_FAILURE';
};
export function createStage88CloneWitness({
 contractIds,sourceBlockHeight,outputPath='stage88-sandbox-clone-witness.json',
 persist=async json=>{
  await writeFile(outputPath+'.tmp',json,{mode:0o600});
  await rename(outputPath+'.tmp',outputPath);
 }
}){
 if(!Array.isArray(contractIds)||contractIds.length<2||contractIds.length>6||
  new Set(contractIds).size!==contractIds.length||
  contractIds.some(id=>typeof id!=='string'||!ID.test(id))||
  !number(sourceBlockHeight)||sourceBlockHeight===0||
  typeof outputPath!=='string'||!/^stage88-[a-z0-9-]+\.json$/.test(outputPath)||
  typeof persist!=='function')
  throw Error('STAGE88_INVALID_LOCAL_CLONE_WITNESS_CONFIGURATION');
 const rows=new Map(contractIds.map(contractId=>[contractId,{
  contractId,status:'WAITING',recordsPatched:0,patchWriteCalls:0,
  recordsRead:null,sourceBlockHash:null,failureCode:null,
  completeSourcePagination:false,
 }]));
 let writeFault=null,queued=Promise.resolve();
 let finished=false;
 const snapshot=()=>({
  mode:'ARBIVANE_STAGE88_DEPENDENCY_CLONE_WITNESS',
  chain:'NEAR_SANDBOX',sourceNetwork:'NEAR_MAINNET_READ_ONLY',
  pinnedSourceBlockHeight:String(sourceBlockHeight),
  status:finished?'ALL_DEPENDENCIES_CLONED_NOT_LIQUIDATION':
   [...rows.values()].some(x=>x.status==='BLOCKED')?
    'BLOCKED_CLONE_OR_INCOMPLETE_PROOF':'IN_PROGRESS',
  contracts:[...rows.values()].map(row=>({...row})),
  allRequiredDependenciesCompleted:finished,
  actualRheaSettlementVerified:false,realMainnetExecuted:false,
  maySignMainnet:false,mayBroadcastMainnet:false,
  positiveNetProfitVerified:false,
 });
 const enqueue=()=>{
  const value=JSON.stringify(snapshot(),null,2)+'\n';
  queued=queued.then(async()=>{if(writeFault)throw writeFault;await persist(value);})
   .catch(e=>{writeFault=e;});
  return queued;
 };
 const update=async({contractId,status,evidence=null,failureCode=null})=>{
  const row=rows.get(contractId);
  if(!row||finished||!['STARTED','COMPLETE','BLOCKED'].includes(status))
   throw Error('STAGE88_UNTRUSTED_CLONE_WITNESS_EVENT');
  if(status==='STARTED'){
   if(row.status!=='WAITING')throw Error('STAGE88_NON_MONOTONIC_CLONE_EVENT');
   row.status='IN_PROGRESS';
  }else if(status==='COMPLETE'){
   if(row.status!=='IN_PROGRESS'||!evidence||
    evidence.contractId!==contractId||
    evidence.mainnetMutated!==false||
    !number(evidence.recordsRead)||!number(evidence.recordsPatched)||
    evidence.recordsRead!==evidence.recordsPatched||
    typeof evidence.sourceBlockHash!=='string'||!HASH.test(evidence.sourceBlockHash))
    throw Error('STAGE88_UNATTESTED_CLONE_COMPLETION');
   row.status='COMPLETE';row.recordsRead=evidence.recordsRead;
   row.recordsPatched=evidence.recordsPatched;
   row.patchWriteCalls=number(evidence.patchWriteCalls)?evidence.patchWriteCalls:0;
   row.sourceBlockHash=evidence.sourceBlockHash;
   row.completeSourcePagination=evidence.providerPaginationExhausted===true;
  }else{
   if(row.status!=='IN_PROGRESS')throw Error('STAGE88_NON_MONOTONIC_CLONE_EVENT');
   row.status='BLOCKED';row.failureCode=ERROR.test(failureCode??'')?
    failureCode:'STAGE88_UNCLASSIFIED_CLONE_FAILURE';
  }
  await enqueue();
  if(writeFault)throw Error('STAGE88_LOCAL_WITNESS_PERSISTENCE_FAILED');
 };
 // Patch-level progress is bounded: durable checkpoint every >=500 records.
 const progress=({contractId,patched,patchWrites})=>{
  const row=rows.get(contractId);
  if(!row||row.status!=='IN_PROGRESS'||!number(patched)||!number(patchWrites)||
   patched<row.recordsPatched||patchWrites<row.patchWriteCalls)return;
  const report=(patched-row.recordsPatched)>=500;
  row.recordsPatched=patched;row.patchWriteCalls=patchWrites;
  if(report)void enqueue();
 };
 const finish=async()=>{
  if([...rows.values()].some(x=>x.status!=='COMPLETE'))
   throw Error('STAGE88_INCOMPLETE_REQUIRED_CONTRACT_CLONES');
  if(new Set([...rows.values()].map(x=>x.sourceBlockHash)).size!==1)
   throw Error('STAGE88_CROSS_DEPENDENCY_PINNED_BLOCK_MISMATCH');
  finished=true;await enqueue();
  if(writeFault)throw Error('STAGE88_LOCAL_WITNESS_PERSISTENCE_FAILED');
  return snapshot();
 };
 return {initialize:async()=>{await enqueue();if(writeFault)throw Error('STAGE88_LOCAL_WITNESS_PERSISTENCE_FAILED');},
  update,progress,finish,flush:async()=>{await queued;if(writeFault)throw Error('STAGE88_LOCAL_WITNESS_PERSISTENCE_FAILED');},
  snapshot};
}

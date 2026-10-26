import test from 'node:test';
import assert from 'node:assert/strict';
import {stage130FinalizeAtomicRheaReceipts} from '../scripts/stage130-finalized-rhea-receipts.mjs';
import {summarizeStage37SandboxOutcome} from '../src/rhea/stage37-sandbox-liquidation.ts';

const actor='arbivane-replay.test.near',receiver='contract.main.burrow.near';
const tx='6Sq4VHBUvh96zkKP5AnY8J5vSzp5U6fs7tHw5uweYqc9';
const firstId='3'.repeat(43),callbackId='4'.repeat(43);
const transaction={hash:tx,signer_id:actor,receiver_id:receiver};
const outcome=(id,status)=>({id,outcome:{status,gas_burnt:1,logs:[]}});
const initial=()=>({result:{transaction,final_execution_status:'EXECUTED',
 status:{SuccessValue:''},receipts_outcome:[outcome(firstId,{SuccessReceiptId:callbackId})],receipts:[]}});
const settled=()=>({transaction,final_execution_status:'FINAL',
 status:{SuccessValue:''},
 receipts_outcome:[outcome(firstId,{SuccessReceiptId:callbackId}),
  outcome(callbackId,{SuccessValue:''})],
 receipts:[{receipt_id:callbackId,receipt:{Action:{actions:[
  {FunctionCall:{method_name:'callback_execute_with_pyth'}}
 ]}}}],
});
test('Stage130 resolves original signed Rhea transaction to actual finalized callback receipts',async()=>{
 let queries=0;
 const result=await stage130FinalizeAtomicRheaReceipts({
  raw:initial(),actorAccountId:actor,lendingContractId:receiver,
  provider:{txStatusReceipts:async(hash,who,wait)=>{
   assert.deepEqual([hash,who,wait],[tx,actor,'FINAL']);
   queries++;return settled();
  }}
 });
 assert.equal(queries,1);
 const proof=summarizeStage37SandboxOutcome(result,{
  pinnedConfigMatches:true,pinnedBorrowerMatches:true,
  importedContractCount:4,allStoredKeysAttested:false,
 });
 assert.equal(proof.status,'ISOLATED_CALLBACK_SUCCESS_NOT_MAINNET_PROOF');
 assert.equal(proof.failedReceiptCount,0);
 assert.equal(proof.callbackReceiptCount,1);
 assert.equal(proof.transactionFinal,true);
 assert.equal(proof.realMainnetExecuted,false);
});
test('Stage130 never signs again or accepts changed hash/signer/receiver and false finality',async()=>{
 for(const alter of [
  o=>{o.transaction={...transaction,hash:'5'.repeat(43)};},
  o=>{o.transaction={...transaction,signer_id:'fake.test.near'};},
  o=>{o.transaction={...transaction,receiver_id:'fake.test.near'};},
  o=>{o.final_execution_status='EXECUTED';},
  o=>{o.receipts=[];},
  o=>{o.receipts_outcome=[outcome('6'.repeat(43),{SuccessValue:''})];},
 ]){
  const final=settled();alter(final);
  await assert.rejects(stage130FinalizeAtomicRheaReceipts({
   raw:initial(),provider:{txStatusReceipts:async()=>final},
   actorAccountId:actor,lendingContractId:receiver,
  }),/STAGE130_/);
 }
});
test('Stage130 blocks actual failed child outcomes and absent callback evidence',async()=>{
 const child=settled();child.receipts_outcome[1]=outcome(callbackId,{Failure:{ActionError:'contract panicked'}});
 await assert.rejects(stage130FinalizeAtomicRheaReceipts({
  raw:initial(),provider:{txStatusReceipts:async()=>child},
  actorAccountId:actor,lendingContractId:receiver,
 }),/STAGE130_FINAL_CHILD_RECEIPT_FAILURE_OR_MISSING/);
 const noCallback=settled();noCallback.receipts[0].receipt.Action.actions[0].FunctionCall.method_name='not_callback';
 const verified=await stage130FinalizeAtomicRheaReceipts({
  raw:initial(),provider:{txStatusReceipts:async()=>noCallback},
  actorAccountId:actor,lendingContractId:receiver,
 });
 assert.throws(()=>summarizeStage37SandboxOutcome(verified,{
  pinnedConfigMatches:true,pinnedBorrowerMatches:true,
  importedContractCount:4,allStoredKeysAttested:false,
 }),/SANDBOX_CALLBACK_RECEIPT_NOT_ATTESTED/);
});
test('Stage130 is local-only and fails closed without real receipt lookup provider',async()=>{
 await assert.rejects(stage130FinalizeAtomicRheaReceipts({
  raw:initial(),provider:{txStatusReceipts:async()=>settled()},
  actorAccountId:actor,lendingContractId:receiver,network:'mainnet',
 }),/STAGE130_ONLY_LOCAL_SANDBOX_FINALITY/);
 await assert.rejects(stage130FinalizeAtomicRheaReceipts({
  raw:initial(),provider:{},actorAccountId:actor,lendingContractId:receiver,
 }),/STAGE130_ONLY_LOCAL_SANDBOX_FINALITY/);
});

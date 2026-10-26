import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveStage124RheaCallbackReceipts} from '../scripts/stage124-final-rhea-receipts.mjs';
const h='9g8AG4BvikeX5faApR9J7WJ8KS5EwRFmoUzANkMX2h5R';
const actor='arbivane-replay.test.near';
const reply=(status={SuccessValue:''},id='R'.repeat(43))=>({
 id,outcome:{status,executor_id:'contract.main.burrow.near'},
});
const raw=()=>({result:{transaction:{hash:h,signer_id:actor},
 final_execution_status:'EXECUTED',status:{SuccessValue:''},
 receipts:[],receipts_outcome:[reply()] }});
const finalized=()=>({
 transaction:{hash:h,signer_id:actor},final_execution_status:'FINAL',
 status:{SuccessValue:''},receipts_outcome:[reply(),reply({SuccessValue:''},'C'.repeat(43))],
 receipts:[{receipt_id:'C'.repeat(43),receipt:{
  Action:{actions:[{FunctionCall:{method_name:'callback_execute_with_pyth'}}]},
 }}],
});
test('Stage124 resolves only the original signed Sandbox transaction to full FINAL receipts',async()=>{
 let calls=0;
 const provider={txStatusReceipts:async(hash,who,finality)=>{
  assert.deepEqual([hash,who,finality],[h,actor,'FINAL']);calls++;return finalized();
 }};
 const proof=await resolveStage124RheaCallbackReceipts({raw:raw(),provider,
  signerAccountId:actor});
 assert.equal(calls,1);
 assert.equal(proof.result.final_execution_status,'FINAL');
 assert.equal(proof.result.receipts[0].receipt.Action.actions[0].FunctionCall.method_name,
  'callback_execute_with_pyth');
});
test('Stage124 cannot convert failed Rhea on-chain callback into settlement',async()=>{
 const bad=raw();
 bad.result.receipts_outcome.push(reply({Failure:{ActionError:{index:0}}},'F'.repeat(43)));
 await assert.rejects(()=>resolveStage124RheaCallbackReceipts({
  raw:bad,provider:{txStatusReceipts:async()=>{throw Error('SHOULD_NOT_RESEND')}},
  signerAccountId:actor,
 }),/STAGE124_RHEA_ACTION_RECEIPT_FAILED/);
});
test('Stage124 rejects a different finalized transaction, missing canonical receipts or forged signer',async()=>{
 for(const corrupt of [
  v=>{v.transaction.hash='A'.repeat(43);},
  v=>{v.transaction.signer_id='forged.near';},
  v=>{v.receipts=[];},
  v=>{v.receipts_outcome=[];},
  v=>{v.final_execution_status='EXECUTED';},
 ]){
  const result=finalized();corrupt(result);
  await assert.rejects(()=>resolveStage124RheaCallbackReceipts({raw:raw(),
   signerAccountId:actor,provider:{txStatusReceipts:async()=>result}
  }),/STAGE124_CANONICAL_CALLBACK_RECEIPTS_MISSING/);
 }
 const forged=raw();forged.result.transaction.signer_id='mainnet-wallet.near';
 await assert.rejects(()=>resolveStage124RheaCallbackReceipts({
  raw:forged,signerAccountId:actor,provider:{},
 }),/STAGE124_UNTRUSTED_SIGNED_TRANSACTION_IDENTITY/);
});
test('Stage124 fails closed when a local FINAL receipt provider is unavailable',async()=>{
 await assert.rejects(()=>resolveStage124RheaCallbackReceipts({
  raw:raw(),signerAccountId:actor,provider:{txStatus:async()=>finalized()},
 }),/STAGE124_LOCAL_FINAL_RECEIPT_PROVIDER_UNAVAILABLE/);
});

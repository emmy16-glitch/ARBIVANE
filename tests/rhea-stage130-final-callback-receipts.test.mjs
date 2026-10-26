import test from 'node:test';
import assert from 'node:assert/strict';
import {stage130ResolveFinalRheaReceipts} from '../scripts/stage130-final-rhea-receipts.mjs';
const hash='6Sq4VHBUvh96zkKP5AnY8J5vSzp5U6fs7tHw5uweYqc9';
const signer='arbivane-replay.test.near';
const receiptId='4gJKFCo8ANXfpPsxPehALvcMzoT3NLFxyJcQPiSV4LW8';
const tx=()=>({hash,signer_id:signer,receiver_id:'contract.main.burrow.near'});
const goodReceipt=()=>({
 id:receiptId,outcome:{status:{SuccessValue:''},gas_burnt:1000000},
});
const provisional=()=>({
 final_execution_status:'EXECUTED',transaction:tx(),status:{SuccessValue:''},
 receipts_outcome:[goodReceipt()],
});
const final=()=>({
 final_execution_status:'FINAL',transaction:tx(),status:{SuccessValue:''},
 receipts_outcome:[goodReceipt()],
 receipts:[{
  receipt_id:receiptId,receipt:{Action:{actions:[{
   FunctionCall:{method_name:'callback_execute_with_pyth',gas:10,deposit:'0'}
  }]}}
 }],
});
test('Stage130 reads full FINAL callback definitions for the same signed Sandbox tx without resubmission',async()=>{
 let count=0,archived=null;
 const res=await stage130ResolveFinalRheaReceipts({
  raw:{result:provisional()},signerAccountId:signer,
  provider:{txStatusReceipts:async(h,a,level)=>{
   count++;assert.equal(h,hash);assert.equal(a,signer);assert.equal(level,'FINAL');
   return final();
  }},
  onFinalEvidence:async v=>{archived=v;},
 });
 assert.equal(count,1);
 assert.equal(res.result.final_execution_status,'FINAL');
 assert.equal(res.result.receipts.length,1);
 assert.deepEqual(archived,final());
});
test('Stage130 blocks fake signed identity, non-final status, missing callback and failed child',async()=>{
 const mutations=[
  {...final(),transaction:{...tx(),signer_id:'attacker.test.near'}},
  {...final(),transaction:{...tx(),hash:'2'.repeat(43)}},
  {...final(),final_execution_status:'EXECUTED'},
  {...final(),receipts:[]},
  {...final(),receipts:[{receipt_id:receiptId,receipt:{Action:{actions:[]}}}]},
  {...final(),receipts_outcome:[{id:receiptId,outcome:{status:{Failure:{error:'failed'}}}}]},
  {...final(),receipts_outcome:[{id:'other-receipt',outcome:{status:{SuccessValue:''}}}]},
 ];
 for(const altered of mutations){
  await assert.rejects(()=>stage130ResolveFinalRheaReceipts({
   raw:provisional(),signerAccountId:signer,
   provider:{txStatusReceipts:async()=>altered},
  }),/STAGE130_/);
 }
});
test('Stage130 never elevates failed original receipt to success even when later query claims success',async()=>{
 const failed=provisional();
 failed.receipts_outcome[0].outcome.status={Failure:{message:'real failure'}};
 let read=false;
 await assert.rejects(()=>stage130ResolveFinalRheaReceipts({
  raw:failed,signerAccountId:signer,
  provider:{txStatusReceipts:async()=>{read=true;return final();}},
 }),/STAGE130_FAILED_AUTHENTIC_RHEA_RECEIPT/);
 assert.equal(read,false);
});
test('Stage130 permits already FINAL receipt definitions without another RPC call',async()=>{
 const res=await stage130ResolveFinalRheaReceipts({
  raw:final(),signerAccountId:signer,
  provider:{txStatusReceipts:async()=>{throw Error('must not requery');}},
 });
 assert.equal(res.result.transaction.hash,hash);
});
test('Stage130 refuses absent local finalized-receipt API or malformed transaction',async()=>{
 await assert.rejects(()=>stage130ResolveFinalRheaReceipts({
  raw:provisional(),signerAccountId:signer,provider:{},
 }),/STAGE130_LOCAL_FINAL_RECEIPT_PROVIDER_UNAVAILABLE/);
 const tampered=provisional();
 tampered.transaction.signer_id='other.near';
 await assert.rejects(()=>stage130ResolveFinalRheaReceipts({
  raw:tampered,signerAccountId:signer,provider:{},
 }),/STAGE130_INVALID_SIGNED_SANDBOX_TRANSACTION/);
});

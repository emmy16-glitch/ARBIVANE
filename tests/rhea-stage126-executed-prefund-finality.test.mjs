import test from 'node:test';
import assert from 'node:assert/strict';
import {stage124FinalizeSandboxTransaction} from '../scripts/stage124-rhea-supply-prefund.mjs';
const hash='6chwvSmtSWowu7Qtwi5jfQiLoxFNYheGKcZgKjYkrcGe';
const signer='arbivane-replay.test.near';
const provisional=()=>({result:{
 final_execution_status:'EXECUTED',transaction:{hash,signer_id:signer},
 status:{SuccessValue:''},
 receipts_outcome:[{id:hash,outcome:{status:{SuccessReceiptId:hash}}}],
}});
const final=()=>({final_execution_status:'FINAL',
 transaction:{hash,signer_id:signer},status:{SuccessValue:''},
 receipts_outcome:[
  {id:hash,outcome:{status:{SuccessReceiptId:hash}}},
  {id:'receipt',outcome:{status:{SuccessValue:''}}}
 ]});
test('Stage126 resolves actual SDK EXECUTED provisional local receipt to FINAL without repeat call',async()=>{
 let count=0;
 const provider={txStatus:async(h,a,wait)=>{count++;
  assert.equal(h,hash);assert.equal(a,signer);assert.equal(wait,'FINAL');
  return final();
 }};
 const settled=await stage124FinalizeSandboxTransaction(provisional(),provider,signer,'BORROW');
 assert.equal(settled.final_execution_status,'FINAL');
 assert.equal(settled.transaction.hash,hash);
 assert.equal(count,1);
});
test('Stage126 forbids receipt spoofing, signer drift and failed callbacks',async()=>{
 for(const altered of [
  {...final(),transaction:{hash:'1'.repeat(43),signer_id:signer}},
  {...final(),transaction:{hash,signer_id:'other.test.near'}},
  {...final(),receipts_outcome:[{id:'failed',outcome:{status:{Failure:'failed callback'}}}]},
  {...final(),final_execution_status:'EXECUTED'},
 ]){
  await assert.rejects(
   ()=>stage124FinalizeSandboxTransaction(provisional(),
    {txStatus:async()=>altered},signer,'BORROW'),
   /STAGE124_BORROW_UNVERIFIED_RECEIPTS/);
 }
});
test('Stage126 keeps unknown provisional statuses blocked',async()=>{
 const raw=provisional();raw.result.final_execution_status='UNKNOWN';
 await assert.rejects(
  ()=>stage124FinalizeSandboxTransaction(raw,{txStatus:async()=>final()},signer,'SUPPLY'),
  /STAGE124_SUPPLY_UNVERIFIED_RECEIPTS/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {finalizeStage124FundingReceipt} from '../scripts/stage124-rhea-supply-prefund.mjs';
const hash='9g8AG4BvikeX5faApR9J7WJ8KS5EwRFmoUzANkMX2h5R';
const actor='arbivane-replay.test.near';
const row=(status={SuccessValue:''})=>({id:'6'.repeat(43),outcome:{status}});
function result(final_execution_status='EXECUTED'){
 return {transaction:{hash,signer_id:actor},final_execution_status,
  status:{SuccessReceiptId:'6'.repeat(43)},receipts_outcome:[row()]};
}
test('Stage125 accepts real Workspaces EXECUTED only after local FINAL status resolution',async()=>{
 const raw={result:result('EXECUTED')};
 let reads=0;
 const provider={txStatus:async(h,a,finality)=>{
  assert.deepEqual([h,a,finality],[hash,actor,'FINAL');reads++;
  return {...result('FINAL'),status:{SuccessValue:''}};
 }};
 const finalized=await finalizeStage124FundingReceipt(raw,provider,actor,'BORROW');
 assert.equal(finalized.final_execution_status,'FINAL');
 assert.equal(reads,1);
});
test('Stage125 rejects forged FINAL signer, mismatched hash and failed async child receipts',async()=>{
 for(const bad of [
  {...result('FINAL'),status:{SuccessValue:''},receipts_outcome:[row({Failure:{}})]},
  {...result('EXECUTED'),receipts_outcome:[row({Failure:{}})]},
 ]){
  await assert.rejects(()=>finalizeStage124FundingReceipt(
   {result:bad},{txStatus:async()=>{throw Error('should not poll failed receipt');}},
   actor,'BORROW'),/STAGE124_BORROW_UNVERIFIED_RECEIPTS/);
 }
 for(const broken of [
  {...result('FINAL'),status:{SuccessValue:''},transaction:{hash:'4'.repeat(43),signer_id:actor}},
  {...result('FINAL'),status:{SuccessValue:''},transaction:{hash,signer_id:'wrong.near'}},
 ]){
  const provider={txStatus:async()=>broken};
  await assert.rejects(()=>finalizeStage124FundingReceipt(
   {result:result('EXECUTED')},provider,actor,'SUPPLY'),
   /STAGE124_SUPPLY_UNVERIFIED_RECEIPTS/);
 }
});
test('Stage125 rejects non-final finality, unsupported initial status and empty receipt outcomes',async()=>{
 for(const v of [
  result('NOT_STARTED'),
  {...result('EXECUTED'),receipts_outcome:[]},
 ]){
  await assert.rejects(()=>finalizeStage124FundingReceipt(
   {result:v},{txStatus:async()=>{throw Error('not reached');}},
   actor,'BORROW'),/STAGE124_BORROW_UNVERIFIED_RECEIPTS/);
 }
});

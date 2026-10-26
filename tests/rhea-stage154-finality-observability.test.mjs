import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {resolveStage124RheaCallbackReceipts} from '../scripts/stage124-final-rhea-receipts.mjs';

const hash='nu5KxAbXhnNvn9n8rLUmzaNL9uiyPh2vXhraSnnZ9dT';
const signer='arbivane-replay.test.near';
const raw={result:{transaction:{hash,signer_id:signer},final_execution_status:'EXECUTED_OPTIMISTIC',
 status:{SuccessReceiptId:'a'},receipts_outcome:[{id:'a',outcome:{status:{SuccessReceiptId:'b'}}}]}};
test('Stage154 retains fail-closed original transaction verification but distinguishes RPC error class in artifact',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'arbivane-stage154-'));
 try{
  const file=join(dir,'stage154.json');
  let queries=0;
  await assert.rejects(()=>resolveStage124RheaCallbackReceipts({
   raw,provider:{txStatusReceipts:async(...a)=>{
    queries++;
    assert.deepEqual(a,[hash,signer,'FINAL']);
    throw Error('local near sandbox RPC node refused finality query');
   }},signerAccountId:signer,evidencePath:file,writeFile
  }),/STAGE124_FINAL_RECEIPT_QUERY_FAILED/);
  assert.equal(queries,1);
  const data=JSON.parse(await readFile(file,'utf8'));
  assert.equal(data.transactionId,hash);
  assert.equal(data.finalReceiptQueryFailureClass,'LOCAL_FINAL_RECEIPT_QUERY_PROVIDER_ERROR');
  assert.equal(data.finalReceiptQueryTimeoutMs,15000);
  assert.equal(data.finalReceiptQueryReturnedCanonicalFinal,false);
  assert.equal(data.finalExecutionStatus,null);
  assert.ok(!JSON.stringify(data).includes('local near sandbox RPC'));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('Stage154 abort cannot silently settle or retry signed transaction',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'arbivane-stage154-'));
 try{
  const file=join(dir,'stage154.json');
  await assert.rejects(resolveStage124RheaCallbackReceipts({
   raw,provider:{txStatusReceipts:async()=>{const e=Error('aborted');
    e.name='AbortError';throw e;}},signerAccountId:signer,evidencePath:file,writeFile
  }),/STAGE124_FINAL_RECEIPT_QUERY_FAILED/);
  const data=JSON.parse(await readFile(file,'utf8'));
  assert.equal(data.finalReceiptQueryFailureClass,'LOCAL_FINAL_RECEIPT_QUERY_ABORTED');
  assert.notEqual(data.classification,'FINAL_RECEIPTS_AVAILABLE_FOR_INDEPENDENT_CALLBACK_CHECK');
 }finally{await rm(dir,{recursive:true,force:true});}
});

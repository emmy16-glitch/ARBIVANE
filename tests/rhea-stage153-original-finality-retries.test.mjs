import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolveStage124RheaCallbackReceipts} from '../scripts/stage124-final-rhea-receipts.mjs';
const tx={transaction:{hash:'4qcfWvK3kHx8Y2UNMHKT2cVY3cREi6S25vZfMMxcaXrq',
 signer_id:'arbivane-replay.test.near'},final_execution_status:'EXECUTED',
 status:{SuccessReceiptId:'good'},receipts_outcome:[
  {id:'r1',outcome:{status:{SuccessReceiptId:'good'}}}
 ]};
test('Stage153 never treats a failed Rhea callback as retryable missing-finality',async()=>{
 let queries=0;
 await assert.rejects(resolveStage124RheaCallbackReceipts({
  raw:{...tx,receipts_outcome:[{id:'r1',outcome:{
   status:{Failure:{ActionError:{index:0,kind:'FunctionCallError'}}}
  }}]},
  provider:{txStatusReceipts:async()=>{queries++;throw Error('not called');}},
  signerAccountId:'arbivane-replay.test.near'
 }),/STAGE124_RHEA_ACTION_RECEIPT_FAILED/);
 assert.equal(queries,0);
});
test('Stage153 retains original callback/finality enforcement; no transaction resubmissions in retry path',async()=>{
 const s=await readFile('scripts/stage146-real-workspaces-partner-lender.mjs','utf8');
 const snippet=s.slice(s.indexOf("if(method==='execute_with_pyth')"),s.indexOf("const final=await finalFtReceipt"));
 assert.match(snippet,/STAGE124_FINAL_RECEIPT_QUERY_FAILED/);
 assert.match(snippet,/STAGE124_CANONICAL_CALLBACK_RECEIPTS_MISSING/);
 assert.match(snippet,/stage153OriginalFinalityQueryAttempts/);
 assert.match(snippet,/if\(!final\)throw last/);
 assert.equal((snippet.match(/signer\.callRaw/g)||[]).length,0);
 assert.equal((snippet.match(/resolveStage124RheaCallbackReceipts/g)||[]).length,1);
 assert.ok(snippet.includes("STAGE152_ULTRA_SHORT_LOCAL_CLOCK"));
});

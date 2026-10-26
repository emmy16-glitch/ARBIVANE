import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {resolveStage124RheaCallbackReceipts} from '../scripts/stage124-final-rhea-receipts.mjs';

test('Stage154 retains original FINAL query exception without approving settlement',async()=>{
 const root=await mkdtemp(join(tmpdir(),'arbivane-stage154-'));
 try{
  const evidencePath=join(root,'finality.json');
  const raw={result:{
   transaction:{hash:'9g8AG4BvikeX5faApR9J7WJ8KS5EwRFmoUzANkMX2h5R',
    signer_id:'arbivane-replay.test.near'},
   final_execution_status:'EXECUTED_OPTIMISTIC',
   receipts_outcome:[{id:'R'.repeat(43),outcome:{status:{SuccessReceiptId:'ok'}}}]
  }};
  await assert.rejects(()=>resolveStage124RheaCallbackReceipts({
   raw,signerAccountId:'arbivane-replay.test.near',
   provider:{txStatusReceipts:async()=>{throw Error('LOCAL_FINALITY_STALLED');}},
   evidencePath,writeFile:async(path,value)=>{
    const fs=await import('node:fs/promises');await fs.writeFile(path,value);
   }
  }),/STAGE124_FINAL_RECEIPT_QUERY_FAILED/);
  const saved=JSON.parse(await readFile(evidencePath,'utf8'));
  assert.equal(saved.transactionId,raw.result.transaction.hash);
  assert.equal(saved.classification,'FINAL_RECEIPT_QUERY_FAILED');
  assert.equal(saved.finalReceiptQueryError.message,'LOCAL_FINALITY_STALLED');
  assert.equal(saved.finalExecutionStatus,null);
 }finally{await rm(root,{recursive:true,force:true});}
});

test('Stage154 only advances bounded Sandbox finality between same-hash reads',async()=>{
 const source=await readFile('scripts/stage146-real-workspaces-partner-lender.mjs','utf8');
 const scope=source.slice(source.indexOf("if(method==='execute_with_pyth')"),
  source.indexOf("const final=await finalFtReceipt"));
 assert.match(scope,/STAGE152_ULTRA_SHORT_LOCAL_CLOCK==='true'/);
 assert.match(scope,/EXECUTION_ENABLED==='false'/);
 assert.match(scope,/stage134AdvanceFinalizedSandbox\(worker\.provider,before\)/);
 assert.match(scope,/provider\.block\(\{finality:'final'\}\)/);
 assert.match(scope,/STAGE156_STAGE134_BOUNDED_FINALITY_RECOVERY/);
 assert.match(scope,/STAGE156_STAGE134_BOUNDED_FINALITY_RECOVERY/);
 assert.match(scope,/originalTransactionHash:receiptHash/);
 assert.match(scope,/resolveStage124RheaCallbackReceipts/);
 assert.doesNotMatch(scope,/signer\.callRaw/);
 assert.doesNotMatch(scope,/mayBroadcastMainnet:true/);
});
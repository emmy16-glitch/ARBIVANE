import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {attestStage44LocalContractExecution} from '../src/rhea/stage44-sandbox-contract-witness.ts';

const message='ARBIVANE_STAGE44_SANDBOX_STATE_CHANGED';
const options=()=>({
 actorAccountId:'arbivane-actor.test.near',
 contractAccountId:'arbivane-contract.test.near',
 before:null,after:message,afterFastForward:message,
 finalizedBlockBefore:15,finalizedBlockAfter:23,expectedMessage:message,
 transaction:{result:{
  final_execution_status:'FINAL',status:{SuccessValue:''},
  receipts_outcome:[
   {outcome:{status:{SuccessReceiptId:'4'.repeat(43)},gas_burnt:'200'}},
   {outcome:{status:{SuccessValue:''},gas_burnt:'300'}},
  ],
 }},
});
test('local receipt and observed contract state delta prove ONLY Sandbox contract execution',()=>{
 const report=attestStage44LocalContractExecution(options());
 assert.equal(report.status,'LOCAL_CONTRACT_STATE_VERIFIED_AFTER_FINAL_BLOCK_ADVANCE');
 assert.equal(report.persistedAtLaterFinalizedBlock,true);
 assert.equal(report.finalizedBlockAfter,23);
 assert.equal(report.chain,'NEAR_SANDBOX');
 assert.equal(report.receiptCount,2);
 assert.equal(report.failedReceiptCount,0);
 assert.equal(report.gasBurntGasUnits,'500');
 assert.equal(report.contractStateMutationVerified,true);
 assert.equal(report.transactionFinal,true);
 assert.equal(report.realRheaLiquidationAttempted,false);
 assert.equal(report.rheaContractParityVerified,false);
 assert.equal(report.profitVerified,false);
 assert.equal(report.executionEnabled,false);
 assert.equal(report.mayBroadcastMainnet,false);
});
test('optimistic Workspaces receipts can prove executed local state but never direct tx finality',()=>{
 const a=options();
 a.transaction.result.final_execution_status='EXECUTED_OPTIMISTIC';
 const report=attestStage44LocalContractExecution(a);
 assert.equal(report.transactionExecutionStatus,'EXECUTED_OPTIMISTIC');
 assert.equal(report.transactionFinal,false);
 assert.equal(report.contractStateMutationVerified,true);
 assert.equal(report.persistedAtLaterFinalizedBlock,true);
 assert.equal(report.profitVerified,false);
 assert.ok(report.blockers.some(x=>x.includes('OPTIMISTIC')));
});
test('no state change, wrong actor, bad message or forged accounts reject',()=>{
 const valid=options();
 for(const change of [
  {before:message},{after:null},{after:'not the submitted message'},
  {afterFastForward:null},{afterFastForward:'stale'},
  {finalizedBlockBefore:0},{finalizedBlockAfter:16},
  {expectedMessage:'other message'},
  {actorAccountId:'BAD ACCOUNT'},
  {contractAccountId:valid.actorAccountId},
  {expectedMessage:'ALLOWED_MAINNET_PROFIT'},
 ]){
  assert.throws(()=>attestStage44LocalContractExecution({...valid,...change}),/STAGE44_/);
 }
});
test('failed or nonfinal contract receipts must not claim transaction execution',()=>{
 const valid=options();
 const variants=[
  {...valid.transaction.result,final_execution_status:'NOT_STARTED'},
  {...valid.transaction.result,status:{Failure:{ActionError:'denied'}}},
  {...valid.transaction.result,receipts_outcome:[]},
  {...valid.transaction.result,receipts_outcome:[{outcome:{status:{Failure:'failed'},gas_burnt:'1'}}]},
  {...valid.transaction.result,receipts_outcome:[{outcome:{status:{SuccessValue:''},gas_burnt:'NaN'}}]},
  {...valid.transaction.result,receipts_outcome:[{outcome:{status:{},gas_burnt:'20'}}]},
 ];
 for(const v of variants)
  assert.throws(()=>attestStage44LocalContractExecution({...valid,transaction:{result:v}}),/STAGE44_/);
});
test('workflow starts actual near-workspaces and refuses unpinned or unaudited contract binary',async()=>{
 const wf=await readFile(new URL('../.github/workflows/rhea-stage44-executable-sandbox.yml',import.meta.url),'utf8');
 const runner=await readFile(new URL('../scripts/stage44-executable-local-sandbox.mjs',import.meta.url),'utf8');
 assert.ok(wf.includes('near-workspaces@5.0.0'));
 assert.ok(wf.includes('313f4fda3a2917739b9a76b770a57c33dcb6d0ef'));
 assert.ok(wf.includes('Stage44 executable isolated NEAR Sandbox witness'));
 assert.ok(wf.includes("EXECUTION_ENABLED: 'false'"));
 assert.ok(wf.includes('stage44-local-sandbox-execution.json'));
 assert.ok(runner.includes("Worker.init({network:'sandbox'})"));
 assert.ok(runner.includes("actor.callRaw(contract,'set_status'"));
 assert.ok(runner.includes("contract.view('get_status'"));
 assert.ok(runner.includes('provider.fastForward(8)'));
 assert.ok(wf.includes('persistedAtLaterFinalizedBlock'));
 assert.ok(wf.includes('transactionExecutionStatus'));
 assert.ok(wf.includes('transactionFinal == (.transactionExecutionStatus == "FINAL")'));
 assert.ok(runner.includes("NEAR_WORKSPACES_NETWORK!=='sandbox'"));
 assert.ok(!runner.includes('broadcast_tx'));
 assert.ok(!runner.includes('signAndSend'));
});
test('Rhea diagnostic never substitutes a smoke test for an actual liquidation',async()=>{
 const wf=await readFile(new URL('../.github/workflows/rhea-stage44-executable-sandbox.yml',import.meta.url),'utf8');
 const importScript=await readFile(new URL('../scripts/stage44-rhea-sandbox-import-probe.mjs',import.meta.url),'utf8');
 assert.ok(wf.includes('stage44-rhea-state-import-readiness.json'));
 assert.ok(importScript.includes('withData:true'));
 assert.ok(importScript.includes('allStoredKeysAttested:false'));
 assert.ok(importScript.includes('contractLiquidationAttempted:false'));
 assert.ok(importScript.includes('mayBroadcastMainnet:false'));
 assert.ok(!importScript.includes('callRaw('));
 assert.ok(!importScript.includes('broadcast_tx'));
});

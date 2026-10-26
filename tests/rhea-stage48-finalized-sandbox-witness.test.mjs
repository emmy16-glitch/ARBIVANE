import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {summarizeStage37SandboxOutcome} from '../src/rhea/stage37-sandbox-liquidation.ts';
import {attestStage48FinalizedSandboxReplay} from '../src/rhea/stage48-finalized-sandbox-witness.ts';

const HASH='4'.repeat(43);
const callback={receipt_id:HASH,receipt:{Action:{actions:[{
 FunctionCall:{method_name:'callback_execute_with_pyth',args:''}
}]}}};
const raw=(status='EXECUTED_OPTIMISTIC',failed=false)=>({
 final_execution_status:status,status:failed?{Failure:'callback denied'}:{SuccessValue:''},
 receipts:[callback],receipts_outcome:[{
  id:HASH,outcome:{status:failed?{Failure:'loan denied'}:{SuccessValue:''},
   gas_burnt:'2000000000000'}
 }]
});
const inspected={pinnedConfigMatches:true,pinnedBorrowerMatches:true,
 importedContractCount:5,allStoredKeysAttested:false};
const before={borrower:{positions:{REGULAR:{borrowed:[{balance:'100'}]}}},
 actor:{positions:{}},repayFt:'0',seizeFt:'0'};
const after={borrower:{positions:{REGULAR:{borrowed:[{balance:'80'}]}}},
 actor:{positions:{}},repayFt:'0',seizeFt:'30'};
function args(receipt=summarizeStage37SandboxOutcome(raw(),inspected)){
 return {receipt,before,immediatelyAfter:after,afterFinalBlock:after,
  finalizedBlockBefore:8,finalizedBlockAfter:10008};
}
test('optimistic callback is pending, never a completed liquidation on receipt alone',()=>{
 const receipt=summarizeStage37SandboxOutcome(raw(),inspected);
 assert.equal(receipt.status,'ISOLATED_CALLBACK_PENDING_FINALIZED_PERSISTENCE');
 assert.equal(receipt.transactionExecutionStatus,'EXECUTED_OPTIMISTIC');
 assert.equal(receipt.transactionFinal,false);
 assert.equal(receipt.persistedAtLaterFinalizedBlock,false);
 assert.equal(receipt.realMainnetExecuted,false);
 assert.ok(receipt.blockers.includes('OPTIMISTIC_TRANSACTION_REQUIRES_LATER_FINALIZED_SANDBOX_STATE_PROOF'));
});
test('a later finalized Sandbox block with stable actual state can promote callback only',()=>{
 const res=attestStage48FinalizedSandboxReplay(args());
 assert.equal(res.status,'ISOLATED_CALLBACK_SUCCESS_NOT_MAINNET_PROOF');
 assert.equal(res.transactionFinal,false);
 assert.equal(res.transactionExecutionStatus,'EXECUTED_OPTIMISTIC');
 assert.equal(res.persistedAtLaterFinalizedBlock,true);
 assert.equal(res.finalizedBlockAfter,10008);
 assert.ok(res.blockers.includes('ORIGINAL_TRANSACTION_STATUS_OPTIMISTIC_NOT_ATTESTED_AS_FINAL'));
 assert.equal(res.realProfitVerified,false);
 assert.equal(res.mayBroadcastMainnet,false);
});
test('FINAL callback also requires persisted change when Stage48 is in the execution path',()=>{
 const receipt=summarizeStage37SandboxOutcome(raw('FINAL'),inspected);
 assert.equal(receipt.transactionFinal,true);
 const confirmed=attestStage48FinalizedSandboxReplay(args(receipt));
 assert.equal(confirmed.transactionFinal,true);
 assert.equal(confirmed.persistedAtLaterFinalizedBlock,true);
});
test('failing callbacks, insufficient block movement, unchanged borrower and post-block drift reject',()=>{
 const receipt=summarizeStage37SandboxOutcome(raw(),inspected);
 const invalid=[
  {finalizedBlockAfter:9},
  {finalizedBlockBefore:0},
  {afterFinalBlock:{...after,seizeFt:'0'}},
  {immediatelyAfter:before,afterFinalBlock:before},
  {afterFinalBlock:null},
  {before:{...before,seizeFt:'1.23'}},
  {receipt:{...receipt,executionEnabled:true}},
  {receipt:{...receipt,status:'ISOLATED_CALLBACK_SUCCESS_NOT_MAINNET_PROOF'}},
  {receipt:{...receipt,failedReceiptCount:1}},
  {receipt:{...receipt,transactionFinal:true}},
 ];
 for(const patch of invalid)assert.throws(()=>attestStage48FinalizedSandboxReplay({...args(receipt),...patch}),/STAGE48_/);
 const failed=summarizeStage37SandboxOutcome(raw('EXECUTED_OPTIMISTIC',true),inspected);
 assert.equal(failed.status,'SANDBOX_RECEIPT_FAILURE');
 assert.throws(()=>attestStage48FinalizedSandboxReplay(args(failed)),/STAGE48_/);
});
test('runner uses real NEAR Sandbox finalized advancement, no unguarded promotion',async()=>{
 const script=await readFile(new URL('../scripts/stage37-workspaces-sandbox-replay.mjs',import.meta.url),'utf8');
 assert.match(script,/provider\.fastForward\(priorFinalizedHeight\+64\)/);
 assert.doesNotMatch(script,/provider\.fastForward\(10000\)/);
 assert.match(script,/stage133-bounded-finality\.json/);
 assert.match(script,/STAGE133_UNTRUSTED_FINALIZED_HEIGHT_MOVEMENT/);
 assert.match(script,/provider\.block\(\{finality:'final'\}\)/);
 assert.match(script,/attestStage48FinalizedSandboxReplay/);
 assert.match(script,/receipt:verifiedReport/);
 assert.match(script,/afterFinalBlock:post/);
 assert.match(script,/NEAR_WORKSPACES_NETWORK!=='sandbox'/);
 assert.doesNotMatch(script,/broadcast_tx|signAndSend/);
});

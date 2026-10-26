import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolveStage124RheaCallbackReceipts} from '../scripts/stage124-final-rhea-receipts.mjs';
const code=()=>readFile(new URL('../scripts/stage37-workspaces-sandbox-replay.mjs',import.meta.url),'utf8');
test('Stage129 restores the ONLY previously observed live protocol-native Borrow then Liquidate/Repay path',async()=>{
 const runner=await code();
 assert.match(runner,/actor\.callRaw\(lending,plan\.method,\{actions:plan\.actions\}/);
 assert.ok(!runner.includes('actions:plan.actions.slice(1)'));
 assert.ok(!runner.includes('prefundStage124RheaSupply('));
 assert.ok(!runner.includes('prefinancing:supplyPrefund'));
 assert.ok(runner.indexOf('sandboxTransactionSubmitted=true')<
  runner.indexOf('resolveStage124RheaCallbackReceipts({'));
 assert.ok(runner.includes('stage129-final-rhea-receipts.json'));
 assert.ok(runner.includes('stage129-finalized-transaction.json'));
 assert.ok(runner.includes('summarizeStage37SandboxOutcome(finalized'));
});
const actor='arbivane-replay.test.near',hash='9g8AG4BvikeX5faApR9J7WJ8KS5EwRFmoUzANkMX2h5R';
const outcome=(id,status={SuccessValue:''})=>({id,outcome:{status,gas_burnt:1000}});
const initial=()=>({result:{
 transaction:{hash,signer_id:actor},final_execution_status:'EXECUTED',
 status:{SuccessValue:''},receipts_outcome:[outcome('R'.repeat(43))],
}});
const complete=()=>({
 transaction:{hash,signer_id:actor},final_execution_status:'FINAL',
 status:{SuccessValue:''},
 receipts_outcome:[outcome('R'.repeat(43)),outcome('C'.repeat(43))],
 receipts:[{receipt_id:'C'.repeat(43),receipt:{
  Action:{actions:[{FunctionCall:{method_name:'callback_execute_with_pyth'}}]},
 }}],
});
test('Stage129 obtains FINAL Rhea callback definitions from original LOCAL signed hash only',async()=>{
 const r=await resolveStage124RheaCallbackReceipts({
  raw:initial(),signerAccountId:actor,
  provider:{txStatusReceipts:async(h,a,finality)=>{
   assert.deepEqual([h,a,finality],[hash,actor,'FINAL']);
   return complete();
  }},
 });
 assert.equal(r.result.final_execution_status,'FINAL');
 assert.equal(r.result.receipts.length,1);
});
test('Stage129 rejects optimistic local receipt results and never forges callback on missing proof',async()=>{
 for(const mutation of [
  d=>d.final_execution_status='EXECUTED',
  d=>d.receipts=[],
  d=>d.receipts_outcome=d.receipts_outcome.slice(1),
  d=>d.transaction.hash='9'.repeat(43),
  d=>d.receipts_outcome[1].outcome.status={Failure:{ActionError:{}}},
 ]){
  const bad=complete();mutation(bad);
  await assert.rejects(()=>resolveStage124RheaCallbackReceipts({
   raw:initial(),signerAccountId:actor,
   provider:{txStatusReceipts:async()=>bad},
  }),/STAGE124_/);
 }
});

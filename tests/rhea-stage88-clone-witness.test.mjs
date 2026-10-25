import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createStage88CloneWitness,stage88FailureCode} from '../scripts/stage88-sandbox-clone-witness.mjs';
import {cloneStage76Dependencies} from '../scripts/stage76-bounded-clone-queue.mjs';

const ids=['aggregate-oracle.near','wrap.near','token.near'];
const hash='A'.repeat(43);
function setup(){
 const writes=[];
 const witness=createStage88CloneWitness({
  contractIds:ids,sourceBlockHeight:221433162,
  persist:async json=>writes.push(JSON.parse(json)),
 });
 return {witness,writes};
}
const result=id=>({
 contract:{accountId:id},
 evidence:{contractId:id,sourceBlockHash:hash,recordsRead:900,
  recordsPatched:900,patchWriteCalls:8,
  providerPaginationExhausted:true,mainnetMutated:false},
});
test('Stage88 records distinct authentic contract successes while never claiming liquidation',async()=>{
 const {witness,writes}=setup();
 await witness.initialize();
 for(const id of ids){
  await witness.update({contractId:id,status:'STARTED'});
  witness.progress({contractId:id,patched:600,patchWrites:5});
  await witness.update({contractId:id,status:'COMPLETE',evidence:result(id).evidence});
 }
 const proof=await witness.finish();
 assert.equal(proof.status,'ALL_DEPENDENCIES_CLONED_NOT_LIQUIDATION');
 assert.equal(proof.allRequiredDependenciesCompleted,true);
 assert.deepEqual(proof.contracts.map(r=>r.contractId),ids);
 assert.ok(proof.contracts.every(r=>r.status==='COMPLETE'&&r.recordsPatched===900));
 assert.ok(writes.some(x=>x.contracts[0].recordsPatched===600));
 assert.equal(proof.actualRheaSettlementVerified,false);
 assert.equal(proof.positiveNetProfitVerified,false);
 assert.equal(proof.realMainnetExecuted,false);
 assert.equal(proof.maySignMainnet,false);
 assert.equal(proof.mayBroadcastMainnet,false);
});
test('Stage88 persists first failing dependency, waits for concurrent successful clone, no false whole-market parity',async()=>{
 const {witness,writes}=setup();
 await witness.initialize();
 await assert.rejects(()=>cloneStage76Dependencies({
  ids,concurrency:2,onStatus:e=>witness.update(e),
  clone:async (id,i)=>{
   if(i===0)throw Error('STAGE45_PAGE_QUERY_BUDGET_EXHAUSTED');
   return result(id);
  },
 }),/STAGE45_PAGE_QUERY_BUDGET_EXHAUSTED/);
 await witness.flush();
 const snapshot=witness.snapshot();
 assert.equal(snapshot.status,'BLOCKED_CLONE_OR_INCOMPLETE_PROOF');
 assert.equal(snapshot.contracts[0].status,'BLOCKED');
 assert.equal(snapshot.contracts[0].failureCode,'STAGE45_PAGE_QUERY_BUDGET_EXHAUSTED');
 assert.equal(snapshot.contracts[1].status,'COMPLETE');
 assert.equal(snapshot.contracts[2].status,'WAITING');
 assert.ok(writes.some(v=>v.contracts[0].status==='BLOCKED'));
 assert.equal(snapshot.allRequiredDependenciesCompleted,false);
 assert.equal(snapshot.actualRheaSettlementVerified,false);
 assert.equal(snapshot.realMainnetExecuted,false);
 await assert.rejects(()=>witness.finish(),/STAGE88_INCOMPLETE/);
});
test('Stage88 sanitizes hostile RPC error message and refuses forged or mismatched witness',async()=>{
 const secret='https://vault.example/api?token=SECRET_HERE';
 assert.equal(stage88FailureCode(new Error(secret)),'STAGE88_UNCLASSIFIED_CLONE_FAILURE');
 assert.equal(stage88FailureCode(new Error('STAGE77_NO_ARCHIVAL_PROVIDER_CAN_READ_PINNED_STORAGE_ENTRY')),
  'STAGE77_NO_ARCHIVAL_PROVIDER_CAN_READ_PINNED_STORAGE_ENTRY');
 const {witness,writes}=setup();
 await witness.initialize();
 await witness.update({contractId:ids[0],status:'STARTED'});
 await witness.update({contractId:ids[0],status:'BLOCKED',
  failureCode:stage88FailureCode(new Error(secret))});
 assert.ok(!JSON.stringify(writes).includes(secret));
 assert.ok(!JSON.stringify(writes).includes('SECRET_HERE'));
 const another=setup().witness;
 await another.initialize();
 await another.update({contractId:ids[0],status:'STARTED'});
 await assert.rejects(()=>another.update({contractId:ids[0],status:'COMPLETE',
  evidence:{...result(ids[0]).evidence,recordsPatched:800}
 }),/STAGE88_UNATTESTED_CLONE_COMPLETION/);
 await assert.rejects(()=>another.update({contractId:'evil.near',status:'STARTED'}),
  /STAGE88_UNTRUSTED/);
});
test('Stage88 runner saves artifact in both focused and broad execution workflows',async()=>{
 const runner=await readFile(new URL('../scripts/stage37-workspaces-sandbox-replay.mjs',import.meta.url),'utf8');
 for(const path of ['rhea-stage69-fastlane.yml','rhea-stage87-one-borrower-execution.yml']){
  const workflow=await readFile(new URL('../.github/workflows/'+path,import.meta.url),'utf8');
  assert.ok(workflow.includes('stage88-sandbox-clone-witness.json'));
  assert.ok(workflow.includes("EXECUTION_ENABLED: 'false'"));
  assert.ok(workflow.includes('stage41-sandbox-balance-settlement.json'));
 }
 assert.ok(runner.includes("onStatus:event=>cloneMonitor.update(event)"));
 assert.ok(runner.includes('cloneMonitor.progress(entry)'));
 assert.ok(runner.includes('await cloneMonitor.finish()'));
 assert.ok(runner.indexOf('await cloneMonitor.finish()')<
  runner.indexOf('sandboxTransactionSubmitted=true'));
 assert.ok(!runner.includes('broadcast_tx'));
});

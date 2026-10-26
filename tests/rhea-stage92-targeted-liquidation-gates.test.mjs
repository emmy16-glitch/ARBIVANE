import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {cloneStage76Dependencies} from '../scripts/stage76-bounded-clone-queue.mjs';

const ROOT=new URL('../scripts/stage37-workspaces-sandbox-replay.mjs',import.meta.url);
test('Stage92 executes selected same-token LiNEAR route using only historical fully checked account closure',async()=>{
 const s=await readFile(ROOT,'utf8');
 const start=s.indexOf("if(ids.includes('linear-protocol.near'))");
 const end=s.indexOf('const dependencyIds=',start);
 assert.ok(start>0&&end>start);
 const path=s.slice(start,end);
 assert.ok(path.includes('cloneStage91LinearToken({'));
 assert.ok(path.includes('lendingAccountId:plan.lendingContract'));
 assert.ok(path.includes('borrowerAccountId:plan.borrowerAccountId'));
 assert.ok(path.includes("expectedCodeHash")===false);
 assert.ok(path.includes("status:'COMPLETE'"));
 assert.ok(path.includes("status:'BLOCKED'"));
 assert.ok(path.includes("contracts.set('linear-protocol.near',linear.contract)"));
 assert.ok(path.includes("await writeFile('stage91-linear-parity.json'"));
 assert.ok(s.includes("partialLinearState:oneBorrower&&ids.includes('linear-protocol.near')"));
 const later=s.slice(end);
 assert.ok(later.includes("id!=='linear-protocol.near'"));
 assert.ok(s.indexOf('await cloneMonitor.finish()')>end);
 assert.ok(s.indexOf("markStage55('SANDBOX_PYTH_PARITY')")>
  s.indexOf('await cloneMonitor.finish()'));
 assert.ok(s.indexOf("actor.callRaw(lending,plan.method")>
  s.indexOf("markStage55('SANDBOX_PYTH_PARITY')"));
});
test('Stage92 singleton remaining aggregate oracle clone is still authenticated and mandatory',async()=>{
 const ids=['aggregate-oracle.near'];
 let calls=0;
 const result=await cloneStage76Dependencies({
  ids,concurrency:2,clone:async contractId=>{
   calls++;
   return {contract:{accountId:contractId},evidence:{
    contractId,providerPaginationExhausted:true,
    recordsRead:3,recordsPatched:3,
    sourceBlockHash:'8'.repeat(43),mainnetMutated:false,
   }};
  },
 });
 assert.equal(calls,1);
 assert.equal(result.length,1);
 await assert.rejects(()=>cloneStage76Dependencies({
  ids,clone:async contractId=>({contract:{accountId:contractId},evidence:{
   contractId,providerPaginationExhausted:false,recordsRead:3,
   recordsPatched:3,sourceBlockHash:'8'.repeat(43),mainnetMutated:false,
  }}),
 }),/STAGE76_CLONE_COMPLETION_EVIDENCE_INVALID/);
});
test('Stage92 focused and broad workflows always retain the real indexed FT parity proof',async()=>{
 for(const name of ['rhea-stage69-fastlane.yml','rhea-stage87-one-borrower-execution.yml','rhea-stage93-borrower-settlement.yml']){
  const s=await readFile(new URL('../.github/workflows/'+name,import.meta.url),'utf8');
  assert.ok(s.includes('stage91-linear-parity.json'));
  assert.ok(s.includes('stage89-wnear-parity.json'));
  assert.ok(s.includes('stage41-sandbox-balance-settlement.json'));
  assert.ok(s.includes('stage37-sandbox-execution.json'));
  if(name==='rhea-stage93-borrower-settlement.yml')
   assert.ok(s.includes('scripts/stage91-targeted-linear-token.mjs'));
  else {assert.ok(s.includes('workflow_dispatch:'));assert.ok(!s.includes('\n  push:'));}
  assert.ok(s.includes("EXECUTION_ENABLED: 'false'"));
  assert.ok(s.includes('cancel-in-progress: false'));
  assert.ok(!s.includes('MAINNET_PRIVATE_KEY:'));
 }
 const runner=await readFile(ROOT,'utf8');
 assert.ok(runner.includes('attestStage51PythParity({rpc,contracts'));
 assert.ok(runner.includes('attestStage52BorrowCollateralCapacity({'));
 assert.ok(runner.includes('attestStage41SandboxSettlement({'));
 assert.ok(runner.includes('attestStage48FinalizedSandboxReplay({'));
 assert.ok(runner.includes('stage55.finish({receipt:verifiedReport,settlement})'));
 assert.ok(!runner.includes('broadcast_tx'));
});

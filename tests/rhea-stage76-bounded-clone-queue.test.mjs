import test from 'node:test';
import assert from 'node:assert/strict';
import {cloneStage76Dependencies} from '../scripts/stage76-bounded-clone-queue.mjs';
import {readFile} from 'node:fs/promises';

const hash='A'.repeat(43);
const good=id=>({contract:{accountId:id},evidence:{
 contractId:id,providerPaginationExhausted:true,
 recordsRead:150,recordsPatched:150,sourceBlockHash:hash,mainnetMutated:false
}});

test('Stage76 overlaps at most two source-pinned Sandbox clones and preserves dependency order',async()=>{
 const ids=['contract.main.burrow.near','aggregate-oracle.near','wrap.near','linear-protocol.near'];
 let active=0,peak=0;
 const finished=[];
 const out=await cloneStage76Dependencies({ids,concurrency:2,clone:async(id,i)=>{
  active++;peak=Math.max(peak,active);
  // Make the first, longer clone finish after the second to test ordering.
  await new Promise(resolve=>setTimeout(resolve,i===0?12:1));
  active--;finished.push(id);
  return good(id);
 }});
 assert.equal(peak,2);
 assert.deepEqual(out.map(x=>x.evidence.contractId),ids);
 assert.notDeepEqual(finished,ids);
 assert.ok(out.every(x=>x.evidence.recordsRead===x.evidence.recordsPatched));
 assert.ok(out.every(x=>x.evidence.mainnetMutated===false));
});

test('Stage76 never claims success for cross-source blocks, incomplete pages, forged ids or public mutation',async()=>{
 const ids=['contract.main.burrow.near','aggregate-oracle.near'];
 for(const mutate of [
  v=>v.evidence.sourceBlockHash='B'.repeat(43),
  v=>v.evidence.recordsPatched--,
  v=>v.evidence.providerPaginationExhausted=false,
  v=>v.evidence.mainnetMutated=true,
  v=>v.evidence.contractId='fraud.near',
 ]){
  await assert.rejects(()=>cloneStage76Dependencies({ids,clone:async(id,i)=>{
   const v=good(id);if(i===1)mutate(v);return v;
  }}),/STAGE76_/);
 }
 for(const v of [
  {ids:[]},{ids:[ids[0],ids[0]]},{ids:['bad account.near',ids[1]]},
  {ids,concurrency:3},{ids,concurrency:0},{ids,clone:null}
 ])await assert.rejects(()=>cloneStage76Dependencies({clone:async id=>good(id),...v}),
  /STAGE76_UNTRUSTED/);
});

test('Stage76 waits for in-flight Sandbox imports before a failing clone can escape',async()=>{
 const ids=['contract.main.burrow.near','aggregate-oracle.near','wrap.near'];
 let releaseSecond,settled=false,startedThird=false;
 const gate=new Promise(resolve=>releaseSecond=resolve);
 const promise=cloneStage76Dependencies({ids,clone:async(id,i)=>{
  if(i===0)throw Error('PINNED_STORAGE_INVALID');
  if(i===1){await gate;settled=true;return good(id);}
  startedThird=true;return good(id);
 }});
 // Wait for the second scheduled clone to suspend at the gate.
 await Promise.resolve();
 assert.equal(settled,false);
 releaseSecond();
 await assert.rejects(promise,/PINNED_STORAGE_INVALID/);
 assert.equal(settled,true);
 assert.equal(startedThird,false);
});

test('Stage76 keeps source parity before actor funding and mainnet signing disabled',async()=>{
 const runner=await readFile(new URL('../scripts/stage37-workspaces-sandbox-replay.mjs',import.meta.url),'utf8');
 const workflow=await readFile(new URL('../.github/workflows/rhea-stage69-fastlane.yml',import.meta.url),'utf8');
 assert.ok(runner.includes('cloneStage76Dependencies({ids,concurrency:2'));
 assert.ok(runner.includes('sourceBlockHash'));
 assert.ok(runner.indexOf('cloneStage76Dependencies')<runner.indexOf('attestStage51PythParity({rpc,contracts'));
 assert.ok(runner.indexOf('attestStage51PythParity({rpc,contracts')<runner.indexOf('sandboxTransactionSubmitted=true'));
 assert.ok(runner.includes('NEAR_WORKSPACES_NETWORK'));
 assert.ok(!runner.includes('broadcast_tx'));
 assert.ok(workflow.includes("EXECUTION_ENABLED: 'false'"));
 assert.ok(workflow.includes('cancel-in-progress: false'));
 assert.ok(workflow.includes('actualRheaSettlementVerified'));
});

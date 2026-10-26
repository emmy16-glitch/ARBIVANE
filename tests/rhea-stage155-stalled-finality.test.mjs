import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stage134AdvanceFinalizedSandbox} from '../scripts/stage134-finality-fallback.mjs';

const block=n=>({header:{height:n}});

test('Stage155 reproduces observed 74 -> 74 finality stall and recovers via 10000 only locally',async()=>{
 const requested=[];
 const provider={
  fastForward:async h=>{requested.push(h);},
  block:async()=>block(requested.length<2?74:9999)
 };
 const {witness}=await stage134AdvanceFinalizedSandbox(provider,block(74));
 assert.deepEqual(requested,[138,10000]);
 assert.equal(witness.initialFinalizedHeight,74);
 assert.equal(witness.boundedObservedFinalizedHeight,74);
 assert.equal(witness.laterFinalizedHeight,9999);
 assert.equal(witness.fallbackUsed,true);
 assert.equal(witness.mainnetExecutionEnabled,false);
 assert.equal(witness.sourcePriceOrBorrowerBytesModified,false);
});

test('Stage155 refuses stalled finality without forged evidence',async()=>{
 const requested=[];
 await assert.rejects(()=>stage134AdvanceFinalizedSandbox({
  fastForward:async h=>requested.push(h),block:async()=>block(74)
 },block(74)),/STAGE134_FINALIZED_HEIGHT_DID_NOT_ADVANCE_SAFELY/);
 assert.deepEqual(requested,[138,10000]);
});

test('Stage155 recovery is confined to Sandbox-only read retries of same already signed transaction',async()=>{
 const source=await readFile('scripts/stage146-real-workspaces-partner-lender.mjs','utf8');
 const scope=source.slice(source.indexOf("if(method==='execute_with_pyth')"),
  source.indexOf("const final=await finalFtReceipt"));
 assert.match(scope,/STAGE152_ULTRA_SHORT_LOCAL_CLOCK==='true'/);
 assert.match(scope,/NEAR_WORKSPACES_NETWORK==='sandbox'/);
 assert.match(scope,/EXECUTION_ENABLED==='false'/);
 assert.match(scope,/stage134AdvanceFinalizedSandbox\(worker\.provider,before\)/);
 assert.match(scope,/originalTransactionHash:receiptHash/);
 assert.match(scope,/resolveStage124RheaCallbackReceipts/);
 assert.match(scope,/if\(!final\)throw last/);
 assert.doesNotMatch(scope,/signer\.callRaw/);
 assert.doesNotMatch(scope,/mayBroadcastMainnet:true/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {stage134AdvanceFinalizedSandbox} from '../scripts/stage134-finality-fallback.mjs';
const header=n=>({header:{height:n}});
test('recover authentic nearcore FINAL stall at 97 via previously successful 10000',async()=>{
 const calls=[],provider={
  fastForward:async h=>calls.push(h),
  block:async()=>header(calls.length===1?97:9999),
 };
 const {witness}=await stage134AdvanceFinalizedSandbox(provider,header(97));
 assert.deepEqual(calls,[161,10000]);
 assert.equal(witness.fallbackUsed,true);
 assert.equal(witness.laterFinalizedHeight,9999);
 assert.equal(witness.mainnetExecutionEnabled,false);
});
test('accept bounded local FINAL progress without needing fallback',async()=>{
 const calls=[];
 const result=await stage134AdvanceFinalizedSandbox({
  fastForward:async h=>calls.push(h),
  block:async()=>header(150),
 },header(97));
 assert.deepEqual(calls,[161]);
 assert.equal(result.witness.fallbackUsed,false);
});
test('refuse to claim finality when both genuine block queries remain stalled',async()=>{
 const calls=[];
 await assert.rejects(()=>stage134AdvanceFinalizedSandbox({
  fastForward:async h=>calls.push(h),block:async()=>header(97),
 },header(97)),/STAGE134_FINALIZED_HEIGHT_DID_NOT_ADVANCE_SAFELY/);
 assert.deepEqual(calls,[161,10000]);
});
test('reject missing provider, invalid or backwards finality and impossible leaps',async()=>{
 await assert.rejects(()=>stage134AdvanceFinalizedSandbox({},header(97)),/STAGE134_UNTRUSTED/);
 await assert.rejects(()=>stage134AdvanceFinalizedSandbox({
  fastForward:async()=>{},block:async()=>header(96),
 },header(97)),/STAGE134_INVALID_BOUNDED/);
 await assert.rejects(()=>stage134AdvanceFinalizedSandbox({
  fastForward:async()=>{},block:async()=>header(5000000),
 },header(97)),/STAGE134_FINALIZED_HEIGHT_DID_NOT_ADVANCE_SAFELY/);
});

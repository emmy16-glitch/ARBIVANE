import test from 'node:test';
import assert from 'node:assert/strict';
import {stage134AdvanceFinalizedSandbox} from '../scripts/stage134-finality-fallback.mjs';

test('Stage156 authentic local height 74 cannot be called progressed after +64',async()=>{
 let finalHeight=74;
 const targets=[];
 const provider={
  block:async({finality})=>{assert.equal(finality,'final');return {header:{height:finalHeight}};},
  fastForward:async target=>{targets.push(target);
   if(target===10000)finalHeight=9999;
  }
 };
 const r=await stage134AdvanceFinalizedSandbox(provider,{header:{height:74}});
 assert.deepEqual(targets,[138,10000]);
 assert.equal(r.witness.boundedObservedFinalizedHeight,74);
 assert.equal(r.witness.fallbackUsed,true);
 assert.equal(r.witness.laterFinalizedHeight,9999);
 assert.equal(r.witness.mainnetExecutionEnabled,false);
});
test('Stage156 must reject unchanged finality even after 10000 local blocks',async()=>{
 const targets=[];
 const provider={
  block:async()=>({header:{height:74}}),
  fastForward:async n=>{targets.push(n);}
 };
 await assert.rejects(stage134AdvanceFinalizedSandbox(provider,{header:{height:74}}),
  /STAGE134_FINALIZED_HEIGHT_DID_NOT_ADVANCE_SAFELY/);
 assert.deepEqual(targets,[138,10000]);
});

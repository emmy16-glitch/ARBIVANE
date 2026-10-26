/** Stage134: read real finalized Sandbox blocks without fabricating receipts.
 * Local nearcore kept FINAL at 97 after fastForward(161), while the authentic
 * successful run reached 9999 after fastForward(10000).
 */
const height=block=>block?.header?.height;
const valid=v=>Number.isSafeInteger(v)&&v>=1;
export async function stage134AdvanceFinalizedSandbox(provider,beforeFinalBlock){
 if(!provider||typeof provider.block!=='function'||
  typeof provider.fastForward!=='function'||
  !valid(height(beforeFinalBlock))||height(beforeFinalBlock)>Number.MAX_SAFE_INTEGER-20000)
  throw Error('STAGE134_UNTRUSTED_INITIAL_FINALIZED_HEIGHT');
 const initial=height(beforeFinalBlock);
 const boundedTarget=initial+64;
 await provider.fastForward(boundedTarget);
 const bounded=await provider.block({finality:'final'});
 const boundedHeight=height(bounded);
 if(!valid(boundedHeight)||boundedHeight<initial)
  throw Error('STAGE134_INVALID_BOUNDED_FINALIZED_BLOCK');
 let current=bounded;
 let fallbackTarget=null;
 if(boundedHeight<initial+2){
  // Only when actual FINAL remains stalled, retry with the native height
  // that already passed signed Sandbox receipts and borrower/FT deltas.
  fallbackTarget=initial<9998?10000:initial+10000;
  await provider.fastForward(fallbackTarget);
  current=await provider.block({finality:'final'});
 }
 const later=height(current);
 if(!valid(later)||later<initial+2||
  later>Math.max(fallbackTarget??boundedTarget,boundedTarget)+512)
  throw Error('STAGE134_FINALIZED_HEIGHT_DID_NOT_ADVANCE_SAFELY');
 return {afterFinalBlock:current,witness:{
  mode:'STAGE134_AUTHENTIC_SANDBOX_FINALITY_RECOVERY',chain:'NEAR_SANDBOX',
  initialFinalizedHeight:initial,boundedRequestHeight:boundedTarget,
  boundedObservedFinalizedHeight:boundedHeight,
  fallbackUsed:fallbackTarget!==null,fallbackRequestHeight:fallbackTarget,
  laterFinalizedHeight:later,
  sourcePriceOrBorrowerBytesModified:false,mainnetExecutionEnabled:false,
 }};
}

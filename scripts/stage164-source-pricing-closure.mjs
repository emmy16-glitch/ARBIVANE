/** Stage164 — close original Rhea execute_with_pyth source-derived cross-call
 * contracts before submitting any isolated Sandbox transaction. A LiNEAR
 * repayment may still cause Rhea to revalue stNEAR collateral held by an
 * existing borrower, which calls meta-pool.near.get_st_near_price.
 *
 * Every additional contract must come from the authentic pinned Rhea metadata.
 * Clone exact deployed code/state at the SAME source block; never fabricate
 * prices, use a mock contract or allow mainnet signing.
 */
const ID=/^[a-z0-9._-]{2,64}$/;
const KNOWN_EXTRA=new Set(['get_st_near_price','get_nearx_price','ft_price',
 'get_high_precision_virtual_price']);
const UNITS=/^[1-9][0-9]{0,77}$/;
// A fallback is only permitted for a recoverable read-only RPC transport
// failure, never when original code rejects its call or a quote changes.
import {isTransientNearRpcError} from '../src/rhea/resilient-readonly-rpc.ts';
function obj(x){return x!==null&&typeof x==='object'&&!Array.isArray(x);}
/** Stage165: source-pinned account position closure, not every Rhea asset. */
export function selectStage164PricingClosure({baseIds,priceInfos,borrowerPositions}){
 if(!Array.isArray(baseIds)||baseIds.length<3||baseIds.length>6||
  baseIds.some(id=>typeof id!=='string'||!ID.test(id))||
  new Set(baseIds).size!==baseIds.length||!obj(priceInfos)||
  Object.keys(priceInfos).length>256||!obj(borrowerPositions)||
  !obj(borrowerPositions.positions)||
  Object.keys(borrowerPositions.positions).length>64)
  throw Error('STAGE164_UNTRUSTED_PINNED_PRICE_DEPENDENCIES');
 // Existing Rhea callback values THIS borrower's collateral and debt,
 // plus disposable liquidator wrapped NEAR and the selected repay/seize FTs.
 // Market-wide metadata includes unrelated derived pricing accounts; importing
 // them all exceeded bounded Stage76/88 and broke previously passing Stage93.
 const needed=new Set(baseIds);
 for(const position of Object.values(borrowerPositions.positions)){
  if(!obj(position)||!Array.isArray(position.collateral)||
   !Array.isArray(position.borrowed)||position.collateral.length>128||
   position.borrowed.length>128)
   throw Error('STAGE165_INVALID_PINNED_BORROWER_POSITION');
  for(const leg of [...position.collateral,...position.borrowed]){
   if(!obj(leg)||typeof leg.token_id!=='string'||!ID.test(leg.token_id))
    throw Error('STAGE165_INVALID_PINNED_BORROWER_ASSET');
   needed.add(leg.token_id);
  }
 }
 const dependencies=[];
 for(const [tokenId,info] of Object.entries(priceInfos)){
  if(!ID.test(tokenId)||!obj(info))
   throw Error('STAGE164_INVALID_SOURCE_PRICE_METADATA');
  const method=info.extra_call;
  if(method===null||method===undefined||!needed.has(tokenId))continue;
  if(typeof method!=='string'||!KNOWN_EXTRA.has(method)||
   info.default_price!==null&&info.default_price!==undefined)
   throw Error('STAGE164_UNSUPPORTED_SOURCE_DERIVED_PRICE_METHOD');
  dependencies.push({contractId:tokenId,method});
 }
 // Stage165 only includes source metadata methods for actual borrower assets.
 // The deployed token contract ID remains the pricing cross-call receiver.
 const ids=[...new Set([...baseIds,...dependencies.map(x=>x.contractId)])];
 // Stage76 independently limits the clone closure to six pinned contracts.
 if(ids.length>6||dependencies.length>6)
  throw Error('STAGE164_UNSUPPORTED_DEPENDENCY_CLOSURE_SIZE');
 return {ids,dependencies,borrowerPositionScoped:true};
}
export async function attestStage164PricingClosure({
 rpc,contracts,blockHeight,dependencies,fallbackRpc=null,
}){
 if(!rpc||typeof rpc.view!=='function'||!contracts||
  typeof contracts.get!=='function'||!Number.isSafeInteger(blockHeight)||
  blockHeight<1||!Array.isArray(dependencies)||dependencies.length>6||
  (fallbackRpc!==null&&typeof fallbackRpc.view!=='function'))
  throw Error('STAGE164_UNTRUSTED_PINNED_PARITY_CONTEXT');
 let checks=0,sourceFallbackReads=0;
 for(const dep of dependencies){
  if(!dep||!ID.test(dep.contractId)||!KNOWN_EXTRA.has(dep.method))
   throw Error('STAGE164_INVALID_PINNED_CROSSCALL');
  const clone=contracts.get(dep.contractId);
  if(!clone||clone.accountId!==dep.contractId||typeof clone.view!=='function')
   throw Error('STAGE164_DERIVED_PRICE_DEPENDENCY_NOT_CLONED');
  let source,local;
  try{source=await rpc.view(dep.contractId,dep.method,{},blockHeight);}
  catch(error){
   // Historical source RPC can be rate-limited even after a complete source
   // clone. Use an INDEPENDENT archival endpoint for the SAME block only.
   // Contract panic, invalid view schema or other permanent errors fail shut.
   if(!fallbackRpc||!isTransientNearRpcError(error))
    throw Error('STAGE164_PINNED_SOURCE_RATIO_VIEW_FAILED');
   try{source=await fallbackRpc.view(dep.contractId,dep.method,{},blockHeight);}
   catch{throw Error('STAGE166_PINNED_ARCHIVAL_RATIO_FALLBACK_FAILED');}
   sourceFallbackReads++;
  }
  if(source?.blockHeight!==String(blockHeight))
   throw Error('STAGE164_PINNED_SOURCE_RATIO_BLOCK_DRIFT');
  try{local=await clone.view(dep.method,{});}
  catch{throw Error('STAGE164_CLONED_SOURCE_RATIO_VIEW_FAILED');}
  const s=String(source.value);
  if(!UNITS.test(s)||typeof source.value!=='string'&&
    typeof source.value!=='number'||String(local)!==s)
   throw Error('STAGE164_DERIVED_PRICE_SOURCE_CLONE_MISMATCH');
  checks++;
 }
 return {mode:'STAGE164_PINNED_RHEA_DERIVED_PRICE_CLOSURE',
  chain:'NEAR_SANDBOX',blockHeight:String(blockHeight),
  clonedPricingDependencyCount:checks,sourceFallbackReads,
  allSourceReadsPinned:true,
  sourceAndSandboxDerivedPricesMatch:true,
  mutablePricesOrOracleRulesOverridden:false,
  actualLiquidationVerified:false,financingRepaidVerified:false,
  mainnetExecutionEnabled:false,maySignMainnet:false,mayBroadcastMainnet:false};
}

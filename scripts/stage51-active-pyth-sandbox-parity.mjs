/** Stage51: attest read-only SAME-BLOCK Pyth/price-conversion parity between
 * NEAR mainnet public views and real imported local Sandbox dependencies.
 * This does NOT prove current quotes, successful liquidation, or net PNL.
 */
const ID=/^[a-z0-9._-]{2,64}$/;
const FEED=/^[a-f0-9]{64}$/;
const UINT=/^(0|[1-9][0-9]{0,38})$/;
const EXTRA=new Set(['get_nearx_price','ft_price','get_st_near_price',
 'get_high_precision_virtual_price']);
const obj=(v,code)=>{
 if(!v||typeof v!=='object'||Array.isArray(v))throw Error('STAGE51_'+code);
 return v;
};
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
async function pinned(rpc,id,method,args,block){
 let v;
 try{v=await rpc.view(id,method,args,block);}
 catch{throw Error('STAGE51_SOURCE_VIEW_UNAVAILABLE');}
 if(v?.blockHeight!==String(block))throw Error('STAGE51_SOURCE_BLOCK_DRIFT');
 return v.value;
}
async function local(contract,method,args){
 try{return await contract.view(method,args);}
 catch{throw Error('STAGE51_SANDBOX_VIEW_UNAVAILABLE');}
}
/** Stage72: trim the expensive complete state import only when the pinned
 * Rhea source config proves legacy pricing is disabled and Pyth is active.
 * Always clone lender, actual oracle, WNEAR funding and both route FTs.
 */
export function selectPinnedActivePythSandboxDependencies(config,plan){
 const c=obj(config,'INVALID_PINNED_LENDING_CONFIG');
 if(c.enable_pyth_oracle!==true||c.enable_price_oracle!==false||
  c.pyth_oracle_account_id!=='aggregate-oracle.near')
  throw Error('STAGE72_PINNED_ACTIVE_PYTH_ONLY_REQUIRED');
 if(!plan||plan.mode!=='ARBIVANE_STAGE37_ISOLATED_SANDBOX_LIQUIDATION_PLAN'||
  plan.chain!=='NEAR_SANDBOX'||plan.lendingContract!=='contract.main.burrow.near'||
  plan.method!=='execute_with_pyth'||plan.executionEnabled!==false||
  plan.maySignMainnet!==false||plan.mayBroadcastMainnet!==false)
  throw Error('STAGE72_UNTRUSTED_SANDBOX_PLAN');
 const repay=plan.actions?.[0]?.Borrow?.token_id;
 const seize=plan.actions?.at(-1)?.Withdraw?.token_id;
 if(typeof repay!=='string'||typeof seize!=='string'||!ID.test(repay)||
  !ID.test(seize)||repay==='priceoracle.near'||seize==='priceoracle.near')
  throw Error('STAGE72_INVALID_ACTIVE_PYTH_ASSET_ROUTE');
 return [...new Set([plan.lendingContract,'aggregate-oracle.near',
  'wrap.near',repay,seize])];
}

export async function attestStage51PythParity({rpc,contracts,plan,blockHeight}){
 const lender=plan?.lendingContract;
 if(!rpc||typeof rpc.view!=='function'||!contracts||
  typeof contracts.get!=='function'||!plan||
  plan.mode!=='ARBIVANE_STAGE37_ISOLATED_SANDBOX_LIQUIDATION_PLAN'||
  plan.chain!=='NEAR_SANDBOX'||lender!=='contract.main.burrow.near'||
  plan.executionEnabled!==false||plan.maySignMainnet!==false||
  plan.mayBroadcastMainnet!==false||!Number.isSafeInteger(blockHeight)||
  blockHeight<1||plan.mainnetSourceBlockHeight!==String(blockHeight))
  throw Error('STAGE51_UNTRUSTED_OR_NON_SANDBOX_CONTEXT');
 const repay=plan.actions?.[0]?.Borrow?.token_id;
 const seize=plan.actions?.at(-1)?.Withdraw?.token_id;
 const same=repay===seize;
 if(typeof repay!=='string'||typeof seize!=='string'||
  !ID.test(repay)||!ID.test(seize)||
  !Array.isArray(plan.actions)||
  (same?(plan.actions.length!==4||
    plan.actions[2]?.Repay?.token_id!==repay):plan.actions.length!==3))
  throw Error('STAGE51_INVALID_CANDIDATE_TOKENS');
 const lenderClone=contracts.get(lender),oracleClone=contracts.get('aggregate-oracle.near');
 if(!lenderClone||!oracleClone||
  lenderClone.accountId!==lender||oracleClone.accountId!=='aggregate-oracle.near'||
  typeof lenderClone.view!=='function'||typeof oracleClone.view!=='function')
  throw Error('STAGE51_PINNED_ORACLE_OR_LENDING_CLONE_MISSING');
 const remoteConfig=obj(await pinned(rpc,lender,'get_config',{},blockHeight),'BAD_LENDING_CONFIG');
 if(remoteConfig.enable_pyth_oracle!==true||
  remoteConfig.enable_price_oracle!==false||
  remoteConfig.pyth_oracle_account_id!=='aggregate-oracle.near'||
  !Number.isSafeInteger(Number(remoteConfig.pyth_price_valid_duration_sec))||
  !UINT.test(String(remoteConfig.pyth_price_valid_duration_sec))||
  Number(remoteConfig.pyth_price_valid_duration_sec)<1||
  Number(remoteConfig.pyth_price_valid_duration_sec)>180)
  throw Error('STAGE51_ACTIVE_PYTH_CONFIGURATION_REQUIRED');
 const cloneConfig=await local(lenderClone,'get_config',{});
 if(!equal(remoteConfig,cloneConfig))
  throw Error('STAGE51_LENDING_PYTH_CONFIG_DIFFERENT_IN_SANDBOX');
 const remoteInfo=obj(await pinned(rpc,lender,'get_all_token_pyth_infos',{},blockHeight),
  'BAD_TOKEN_PYTH_INFO');
 const cloneInfo=obj(await local(lenderClone,'get_all_token_pyth_infos',{}),
  'BAD_SANDBOX_PYTH_INFO');
 if(!equal(remoteInfo,cloneInfo))
  throw Error('STAGE51_TOKEN_PYTH_INFO_DIFFERENT_IN_SANDBOX');
 const tokens=[...new Set([repay,seize])],feeds=new Set(),derived=[];
 let defaultTokenCount=0;
 for(const id of tokens){
  const info=obj(remoteInfo[id],'POSITION_ASSET_HAS_NO_PYTH_INFO');
  if(!Number.isSafeInteger(Number(info.decimals))||
   !UINT.test(String(info.decimals))||Number(info.decimals)>36)
   throw Error('STAGE51_INVALID_TOKEN_PRICE_DECIMALS');
  const feed=info.price_identifier;
  const defaultPrice=info.default_price;
  if(defaultPrice!==null&&defaultPrice!==undefined){
   const p=obj(defaultPrice,'BAD_DEFAULT_PRICE');
   if(!UINT.test(String(p.multiplier))||BigInt(p.multiplier)===0n)
    throw Error('STAGE51_ZERO_OR_INVALID_DEFAULT_PRICE');
   if(info.extra_call!==null&&info.extra_call!==undefined)
    throw Error('STAGE51_DEFAULT_PRICE_WITH_EXTRA_CALL');
   defaultTokenCount++;
  }else{
   if(typeof feed!=='string'||!FEED.test(feed))
    throw Error('STAGE51_MISSING_ACTIVE_PYTH_FEED');
   feeds.add(feed);
   if(info.extra_call!==null&&info.extra_call!==undefined){
    if(!EXTRA.has(info.extra_call))
     throw Error('STAGE51_UNSUPPORTED_PRICE_RATIO_METHOD');
    derived.push({token:id,method:info.extra_call});
   }
  }
 }
 if(feeds.size>8||derived.length>2)throw Error('STAGE51_TOO_MANY_ORACLE_DEPENDENCIES');
 let quoteChecks=0,ratioChecks=0;
 const age=Number(remoteConfig.pyth_price_valid_duration_sec);
 for(const feed of [...feeds].sort()){
  const args={price_id:feed,age};
  const source=await pinned(rpc,'aggregate-oracle.near','get_price_no_older_than',
   args,blockHeight);
  const mirrored=await local(oracleClone,'get_price_no_older_than',args);
  const quote=obj(source,'INVALID_ACTIVE_PYTH_QUOTE');
  if(!/^[1-9][0-9]*$/.test(String(quote.price))||
   !UINT.test(String(quote.conf))||
   !/^(0|[1-9][0-9]*)$/.test(String(quote.publish_time))||
   !/^-?(0|[1-9][0-9]*)$/.test(String(quote.expo)))
   throw Error('STAGE51_INVALID_ACTIVE_PYTH_QUOTE');
  if(!equal(source,mirrored))
   throw Error('STAGE51_IMPORTED_PYTH_FEED_QUOTE_DIFFERENT');
  quoteChecks++;
 }
 for(const {token,method} of derived){
  const imported=contracts.get(token);
  if(!imported||imported.accountId!==token||typeof imported.view!=='function')
   throw Error('STAGE51_DERIVED_PRICE_TOKEN_NOT_IMPORTED');
  const source=await pinned(rpc,token,method,{},blockHeight);
  const mirrored=await local(imported,method,{});
  if(!UINT.test(String(source))||BigInt(source)===0n||
   !equal(source,mirrored))
   throw Error('STAGE51_IMPORTED_PRICE_RATIO_DIFFERENT');
  ratioChecks++;
 }
 return {
  mode:'ARBIVANE_STAGE51_ACTIVE_PYTH_SANDBOX_VIEW_PARITY',
  chain:'NEAR_SANDBOX',sourceNetwork:'NEAR_MAINNET_READ_ONLY',
  blockHeight:String(blockHeight),lendingContract:lender,
  activeOracleContract:'aggregate-oracle.near',
  tokensChecked:tokens,uniqueFeedsChecked:quoteChecks,
  derivedPriceRatiosChecked:ratioChecks,defaultPricesChecked:defaultTokenCount,
  pinnedSourceAndSandboxPythViewsMatch:true,
  sourceOracleCodeHashVerifiedHere:false, // verified by existing Stage37/46
  oracleWasFreshAtLiveExecutionTimeVerified:false,
  importedStorageTrieProofVerified:false,realRheaLiquidationVerified:false,
  financingVerified:false,positiveNetProfitVerified:false,
  executionEnabled:false,maySignMainnet:false,mayBroadcastMainnet:false,
 };
}

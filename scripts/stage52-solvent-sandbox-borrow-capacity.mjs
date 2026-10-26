/** Stage52: conservative actor borrow-capacity reference using actually deposited
 * WNEAR collateral, checked against pinned ACTIVE Pyth lending views.
 * This is a fail-closed SANDBOX admission rule, not deployed borrow or PNL proof.
 */
import {sourceFromBalancePrice,sourceDivRatio,sourceMulRatio}
 from '../src/rhea/source-math.ts';
import {reconstructExecutionPythPrice}
 from '../src/rhea/execution-pyth-valuation.ts';
const ID=/^[a-z0-9._-]{2,64}$/;
const FEED=/^[a-f0-9]{64}$/;
const UINT=/^(0|[1-9][0-9]{0,77})$/;
const U128=(1n<<128n)-1n;
const record=(v,code)=>{
 if(!v||typeof v!=='object'||Array.isArray(v))throw Error('STAGE52_'+code);
 return v;
};
const positive=(v,code)=>{
 if((typeof v!=='string'&&typeof v!=='number')||!UINT.test(String(v))||
  BigInt(v)===0n||BigInt(v)>U128)
  throw Error('STAGE52_'+code);
 return BigInt(v);
};
const small=(v,code,min,max)=>{
 if(!UINT.test(String(v))||!Number.isSafeInteger(Number(v))||
  Number(v)<min||Number(v)>max)throw Error('STAGE52_'+code);
 return Number(v);
};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function asset(rows,id){
 if(!Array.isArray(rows)||rows.length<1||rows.length>512)throw Error('STAGE52_INVALID_ASSETS');
 const x=rows.filter(v=>Array.isArray(v)&&v.length===2&&v[0]===id);
 if(x.length!==1)throw Error('STAGE52_MISSING_OR_DUPLICATE_ASSET');
 return record(x[0][1],'INVALID_ASSET_ROW');
}
function depositedWrappedBalance(account){
 const positions=record(record(account,'ACTOR_ACCOUNT').positions,'ACTOR_POSITIONS');
 if(Object.keys(positions).length>64)throw Error('STAGE52_TOO_MANY_ACTOR_POSITIONS');
 let sum=0n;
 for(const item of Object.values(positions)){
  const p=record(item,'ACTOR_POSITION');
  if(!Array.isArray(p.collateral)||!Array.isArray(p.borrowed))
   throw Error('STAGE52_INCOMPLETE_ACTOR_POSITION');
  if(p.borrowed.length!==0)throw Error('STAGE52_ACTOR_ALREADY_HAS_DEBT');
  for(const v of p.collateral){
   const leg=record(v,'ACTOR_COLLATERAL');
   if(leg.token_id!=='wrap.near')throw Error('STAGE52_UNEXPECTED_ACTOR_COLLATERAL_ASSET');
   const a=positive(leg.balance,'INVALID_ACTOR_COLLATERAL_AMOUNT');
   positive(leg.shares,'INVALID_ACTOR_COLLATERAL_SHARES');
   sum+=a;
  }
 }
 if(sum<=0n||sum>U128)throw Error('STAGE52_NO_VERIFIED_WNEAR_COLLATERAL');
 return sum;
}
async function source(rpc,id,method,args,height){
 let v;
 try{v=await rpc.view(id,method,args,height);}
 catch{throw Error('STAGE52_SOURCE_PRICE_VIEW_UNAVAILABLE');}
 if(v?.blockHeight!==String(height))throw Error('STAGE52_PRICE_SOURCE_BLOCK_DRIFT');
 return v.value;
}
async function mirror(contract,method,args){
 try{return await contract.view(method,args);}
 catch{throw Error('STAGE52_CLONED_PRICE_VIEW_UNAVAILABLE');}
}
export async function attestStage52BorrowCollateralCapacity({
 rpc,contracts,plan,proposal,actorPositions,pinnedAssets,blockHeight
}){
 if(!rpc||typeof rpc.view!=='function'||!contracts||
  typeof contracts.get!=='function'||!plan||
  plan.mode!=='ARBIVANE_STAGE37_ISOLATED_SANDBOX_LIQUIDATION_PLAN'||
  plan.chain!=='NEAR_SANDBOX'||plan.executionEnabled!==false||
  plan.mayBroadcastMainnet!==false||plan.maySignMainnet!==false||
  !Number.isSafeInteger(blockHeight)||blockHeight<1||
  plan.mainnetSourceBlockHeight!==String(blockHeight)||
  !proposal||proposal.mode!=='RHEA_STAGE35_PINNED_SOURCE_ONLY_LIQUIDATION_SIZING'||
  proposal.chain!=='NEAR_MAINNET'||proposal.referenceRulesPass!==true||
  proposal.executionEnabled!==false||proposal.mayBroadcast!==false||
  proposal.blockHeight!==String(blockHeight)||
  !ID.test(plan.actions?.[0]?.Borrow?.token_id)||
  proposal.repay?.tokenId!==plan.actions[0].Borrow.token_id||
  proposal.repay?.amountLendingInternalAtomic!==plan.actions[1]?.Liquidate?.in_assets?.[0]?.amount)
  throw Error('STAGE52_UNTRUSTED_SOURCE_SIZED_SANDBOX_ROUTE');
 const lender=contracts.get(plan.lendingContract);
 const oracle=contracts.get('aggregate-oracle.near');
 const wrapped=contracts.get('wrap.near');
 if(!lender||!oracle||!wrapped||lender.accountId!==plan.lendingContract||
  oracle.accountId!=='aggregate-oracle.near'||wrapped.accountId!=='wrap.near')
  throw Error('STAGE52_PINNED_PRICE_DEPENDENCY_MISSING');
 const a=asset(pinnedAssets,'wrap.near'),d=asset(pinnedAssets,plan.actions[0].Borrow.token_id);
 const wrapCfg=record(a.config,'WNEAR_CONFIG'),debtCfg=record(d.config,'REPAY_CONFIG');
 if(wrapCfg.can_use_as_collateral!==true||debtCfg.can_borrow!==true)
  throw Error('STAGE52_LENDING_ASSET_PERMISSION_CHANGED');
 const wRatio=BigInt(small(wrapCfg.volatility_ratio,'COLLATERAL_VOLATILITY',1,10000));
 const dRatio=BigInt(small(debtCfg.volatility_ratio,'DEBT_VOLATILITY',1,10000));
 const extra=small(wrapCfg.extra_decimals,'COLLATERAL_EXTRA_DECIMALS',0,36);
 const units=depositedWrappedBalance(actorPositions);
 const sourceConfig=record(await source(rpc,plan.lendingContract,'get_config',{},blockHeight),
  'SOURCE_LENDING_CONFIG');
 if(sourceConfig.enable_pyth_oracle!==true||
  sourceConfig.enable_price_oracle!==false||
  sourceConfig.pyth_oracle_account_id!=='aggregate-oracle.near')
  throw Error('STAGE52_ACTIVE_PYTH_NOT_CONFIGURED');
 const localConfig=await mirror(lender,'get_config',{});
 if(!same(localConfig,sourceConfig))throw Error('STAGE52_CLONE_CONFIG_MISMATCH');
 const age=small(sourceConfig.pyth_price_valid_duration_sec,'PYTH_MAX_AGE',1,180);
 const remoteInfo=record(await source(rpc,plan.lendingContract,
  'get_all_token_pyth_infos',{},blockHeight),'TOKEN_PYTH_INFO');
 const localInfo=await mirror(lender,'get_all_token_pyth_infos',{});
 if(!same(remoteInfo,localInfo))throw Error('STAGE52_CLONE_PRICE_METADATA_MISMATCH');
 const meta=record(remoteInfo['wrap.near'],'WNEAR_PYTH_INFO');
 const tokenDecimals=small(meta.decimals,'PRICE_TOKEN_DECIMALS',0,36);
 const fractionDigits=meta.fraction_digits===undefined||meta.fraction_digits===null?
  4:small(meta.fraction_digits,'FRACTION_DIGITS',0,18);
 let price;
 if(meta.default_price!==undefined&&meta.default_price!==null){
  const p=record(meta.default_price,'DEFAULT_COLLATERAL_PRICE');
  if(meta.extra_call!==undefined&&meta.extra_call!==null)
   throw Error('STAGE52_UNSUPPORTED_DEFAULT_DERIVED_PRICE');
  price={multiplier:positive(p.multiplier,'DEFAULT_COLLATERAL_MULTIPLIER'),
   decimals:small(p.decimals,'DEFAULT_COLLATERAL_DECIMALS',0,72)};
 }else{
  if(typeof meta.price_identifier!=='string'||!FEED.test(meta.price_identifier))
   throw Error('STAGE52_MISSING_WRAPPED_COLLATERAL_FEED');
  const args={price_id:meta.price_identifier,age};
  const quote=record(await source(rpc,'aggregate-oracle.near',
   'get_price_no_older_than',args,blockHeight),'PYTH_QUOTE');
  const localQuote=await mirror(oracle,'get_price_no_older_than',args);
  if(!same(quote,localQuote))throw Error('STAGE52_WRAPPED_PYTH_FEED_CLONE_MISMATCH');
  const conf=BigInt(String(quote.conf));
  const px=positive(quote.price,'PYTH_PRICE');
  if(!UINT.test(String(quote.conf))||conf*10000n>px*150n)
   throw Error('STAGE52_WRAPPED_PYTH_CONFIDENCE_TOO_WIDE');
  let ratio=null;
  if(meta.extra_call!==null&&meta.extra_call!==undefined){
   if(!['get_nearx_price','ft_price','get_st_near_price',
    'get_high_precision_virtual_price'].includes(meta.extra_call))
    throw Error('STAGE52_UNSUPPORTED_WRAPPED_PRICE_RATIO');
   const value=await source(rpc,'wrap.near',meta.extra_call,{},blockHeight);
   const cloned=await mirror(wrapped,meta.extra_call,{});
   if(!same(value,cloned))throw Error('STAGE52_CLONED_WRAPPED_RATIO_MISMATCH');
   ratio=positive(value,'WRAPPED_PRICE_RATIO').toString();
  }
  price=reconstructExecutionPythPrice({rawPrice:String(quote.price),
   exponent:quote.expo,tokenDecimals,fractionDigits,ratioE24:ratio});
 }
 const collateralUsd=sourceFromBalancePrice(units,price.multiplier,
  price.decimals,extra);
 const adjustedCollateral=sourceMulRatio(collateralUsd,wRatio);
 // Compute collateral sufficiency for the FULL funding borrow, including
 // the exact local 10-ppm rounding reserve; never size it from the smaller
 // liquidation input or dilute the required 12500-bps safety buffer.
 const liquidationUnits=positive(proposal.repay.amountLendingInternalAtomic,
  'SOURCE_LIQUIDATION_REPAY');
 const borrowedUnits=positive(plan.actions[0].Borrow.amount,'SANDBOX_FULL_BORROW');
 const same=proposal.repay.tokenId===proposal.seize?.tokenId;
 const cushion=same?(liquidationUnits+99999n)/100000n:0n;
 if(borrowedUnits!==liquidationUnits+cushion)
  throw Error('STAGE52_UNBOUNDED_BORROW_CUSHION');
 const sourceDebtUsd=positive(proposal.repay.referenceUsdE27,'UNVERIFIED_SOURCE_REPAY_VALUE');
 const rawDebtUsd=(sourceDebtUsd*borrowedUnits+liquidationUnits-1n)/liquidationUnits;
 const adjustedBorrow=sourceDivRatio(rawDebtUsd,dRatio);
 // Conservative headroom for intermediate Borrow before liquidation
 // (25% extra adjusted collateral), not a deployed contract guarantee.
 const safelyCovered=adjustedCollateral*4n>=adjustedBorrow*5n;
 const result={
  mode:'ARBIVANE_STAGE52_BOUNDED_ACTOR_BORROW_REFERENCE_CAPACITY',
  chain:'NEAR_SANDBOX',sourceBlockHeight:String(blockHeight),
  actorWrappedCollateralInternal:units.toString(),
  collateralReferenceUsdE27:collateralUsd.toString(),
  collateralAdjustedUsdE27:adjustedCollateral.toString(),
  borrowReferenceUsdE27:rawDebtUsd.toString(),
  borrowAdjustedUsdE27:adjustedBorrow.toString(),
  minimumCollateralBufferBps:12500,
  actorCoveredByConservativeReference:safelyCovered,
  status:safelyCovered?'REFERENCE_BORROW_BUFFER_PASS_NOT_EXECUTION_PROOF':
   'BLOCKED_ACTOR_REFERENCE_COLLATERAL_INSUFFICIENT',
  deployedRheaBorrowPermissionVerified:false,
  exactBorrowingHealthAtCallbackVerified:false,
  eligibleMainnetLiquidationVerified:false,mainnetExecutionEnabled:false,
  maySignMainnet:false,mayBroadcastMainnet:false,
  positiveNetProfitVerified:false
 };
 return result;
}

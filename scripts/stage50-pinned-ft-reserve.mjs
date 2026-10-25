/** Stage50: require observed FT vault liquidity and pool capacity at the
 * EXACT pinned Rhea block before paying for a multi-contract Sandbox clone.
 * This is public mainnet view-only evidence, NOT financing/profit proof.
 */
const UINT=/^(0|[1-9][0-9]{0,38})$/;
const ID=/^[a-z0-9._-]{2,64}$/;
const U128=(1n<<128n)-1n;
function record(v,reason){
 if(!v||typeof v!=='object'||Array.isArray(v))throw Error('STAGE50_'+reason);
 return v;
}
function amount(v,reason){
 if(typeof v!=='string'||!UINT.test(v)||BigInt(v)>U128)
  throw Error('STAGE50_'+reason);
 return BigInt(v);
}
function whole(v,reason,min,max){
 if(typeof v!=='number'||!Number.isInteger(v)||v<min||v>max)
  throw Error('STAGE50_'+reason);
 return v;
}
function matchedPool(assets,token){
 if(!Array.isArray(assets)||assets.length>512)throw Error('STAGE50_INVALID_ASSET_LIST');
 const matches=assets.filter(a=>Array.isArray(a)&&a.length===2&&a[0]===token);
 if(matches.length!==1)throw Error('STAGE50_MISSING_OR_DUPLICATE_REPAY_ASSET');
 return record(matches[0][1],'INVALID_REPAY_ASSET');
}
export function inspectStage50RepayReserve({
 plan,pinnedAssets,repayFtBalance,repayFtMetadata,sourceBlockHeight
}){
 if(!plan||plan.mode!=='ARBIVANE_STAGE37_ISOLATED_SANDBOX_LIQUIDATION_PLAN'||
  plan.chain!=='NEAR_SANDBOX'||plan.executionEnabled!==false||
  plan.maySignMainnet!==false||plan.mayBroadcastMainnet!==false||
  plan.lendingContract!=='contract.main.burrow.near'||!ID.test(plan.borrowerAccountId)||
  !Number.isSafeInteger(sourceBlockHeight)||sourceBlockHeight<1||
  plan.mainnetSourceBlockHeight!==String(sourceBlockHeight))
  throw Error('STAGE50_UNTRUSTED_CANDIDATE_OR_BLOCK');
 const repay=plan.actions?.[0]?.Borrow;
 const liquidation=plan.actions?.[1]?.Liquidate;
 if(!repay||!ID.test(repay.token_id)||!liquidation||
  liquidation.in_assets?.length!==1||
  liquidation.in_assets[0]?.token_id!==repay.token_id||
  liquidation.in_assets[0]?.amount!==repay.amount)
  throw Error('STAGE50_REPAY_ROUTE_MISMATCH');
 const requiredInternal=amount(repay.amount,'INVALID_REPAY_INTERNAL_UNITS');
 if(requiredInternal===0n)throw Error('STAGE50_ZERO_REPAY');
 const pool=matchedPool(pinnedAssets,repay.token_id);
 const config=record(pool.config,'MISSING_ASSET_CONFIG');
 if(config.can_borrow!==true)throw Error('STAGE50_REPAY_BORROW_DISABLED');
 const extra=whole(config.extra_decimals,'INVALID_EXTRA_DECIMALS',0,36);
 const ftMeta=record(repayFtMetadata,'INVALID_FT_METADATA');
 const decimals=whole(ftMeta.decimals,'INVALID_FT_DECIMALS',0,36);
 // The public Burrow/Rhea lending source converts raw NEP-141 units via
 // exactly 10**config.extra_decimals (ft_on_transfer and internal_ft_transfer).
 // It does NOT require metadata.decimals + extra_decimals == 24. Requiring 24
 // incorrectly blocks valid assets, including ones internally scaled to 18.
 // The independently pinned metadata proves token precision, while Rhea
 // config controls conversion. Deployed WASM parity is still checked later
 // through identical source-state Sandbox import and actual FT balance deltas.
 const balance=amount(repayFtBalance,'INVALID_REPAY_FT_VAULT_BALANCE');
 const supplied=amount(record(pool.supplied,'MISSING_SUPPLIED_POOL').balance,'INVALID_SUPPLIED_POOL');
 const borrowed=amount(record(pool.borrowed,'MISSING_BORROWED_POOL').balance,'INVALID_BORROWED_POOL');
 if(borrowed>supplied)throw Error('STAGE50_POOL_BORROW_EXCEEDS_SUPPLY');
 const availableInternal=supplied-borrowed;
 const scale=10n**BigInt(extra);
 const requiredFt=(requiredInternal+scale-1n)/scale;
 const reserveInternal=balance*scale;
 // The deployed pool stores u128 balances, never promote an overflowing FT
 // reserve conversion to a viable Sandbox financing claim.
 if(reserveInternal>U128)
  throw Error('STAGE50_TOKEN_VAULT_INTERNAL_SCALE_OVERFLOWS_U128');
 if(availableInternal<requiredInternal)
  throw Error('STAGE50_REPAY_EXCEEDS_PINNED_POOL_CAPACITY');
 if(balance<requiredFt)
  throw Error('STAGE50_REPAY_EXCEEDS_PINNED_TOKEN_VAULT_RESERVE');
 return {
  mode:'ARBIVANE_STAGE50_PINNED_REPAY_LIQUIDITY_PREFLIGHT',
  chain:'NEAR_MAINNET_READ_ONLY',
  blockHeight:String(sourceBlockHeight),
  lendingContract:plan.lendingContract,repayTokenId:repay.token_id,
  requiredRepayInternal:requiredInternal.toString(),
  poolCapacityInternal:availableInternal.toString(),
  tokenVaultFtAtomic:balance.toString(),
  requiredFtAtomicRoundedUp:requiredFt.toString(),
  indicativeFtReserveInternal:reserveInternal.toString(),
  tokenDecimals:decimals,extraDecimals:extra,
  internalPrecisionDecimals:decimals+extra,
  rawFtToLendingInternalScale:scale.toString(),
  sourceConversionFormula:'raw_nep141_balance_times_10_pow_extra_decimals',
  status:'PINNED_SOURCE_POOL_AND_TOKEN_VAULT_CAPACITY_OBSERVED',
  exactTokenConversionVerifiedAgainstDeployedWasm:false,
  actorCollateralAndFundingVerified:false,
  liquidationEligibilityVerified:false,
  guaranteedExecutionLiquidity:false,
  positiveNetProfitVerified:false,
  executionEnabled:false,maySignMainnet:false,mayBroadcastMainnet:false,
 };
}
export async function readStage50PinnedRepayReserve({
 rpc,plan,pinnedAssets,blockHeight
}){
 if(!rpc||typeof rpc.view!=='function'||!Number.isSafeInteger(blockHeight)||
  blockHeight<1)throw Error('STAGE50_INVALID_READONLY_RPC');
 const tokenId=plan?.actions?.[0]?.Borrow?.token_id;
 if(typeof tokenId!=='string'||!ID.test(tokenId))
  throw Error('STAGE50_INVALID_REPAY_TOKEN');
 const [balance,metadata]=await Promise.all([
  rpc.view(tokenId,'ft_balance_of',{account_id:plan.lendingContract},blockHeight),
  rpc.view(tokenId,'ft_metadata',{},blockHeight),
 ]);
 if(balance?.blockHeight!==String(blockHeight)||
  metadata?.blockHeight!==String(blockHeight))
  throw Error('STAGE50_FT_RESERVE_CROSS_BLOCK_DRIFT');
 return inspectStage50RepayReserve({
  plan,pinnedAssets,sourceBlockHeight:blockHeight,
  repayFtBalance:balance.value,repayFtMetadata:metadata.value,
 });
}

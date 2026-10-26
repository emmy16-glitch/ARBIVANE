/** Stage49: compare a genuine Stage37 plan to pinned Rhea pool limits and
 * the disposable local liquidator's actually observed collateral.
 * This is a SANDBOX borrow preflight, not deployed borrowing parity.
 */
const ID=/^[a-z0-9._-]{2,64}$/;
const UINT=/^(0|[1-9][0-9]{0,38})$/;
const U128=(1n<<128n)-1n;
const obj=(v,why)=>{
 if(!v||typeof v!=='object'||Array.isArray(v))throw Error('STAGE49_BAD_'+why);
 return v;
};
const amount=(v,why)=>{
 if(typeof v!=='string'||!UINT.test(v)||BigInt(v)>U128)
  throw Error('STAGE49_INVALID_'+why);
 return BigInt(v);
};
export function actorCollateralInternal(positions,tokenId=null){
 if(tokenId!==null&&(typeof tokenId!=='string'||!ID.test(tokenId)))
  throw Error('STAGE53_INVALID_COLLATERAL_TOKEN_FILTER');
 const all=obj(obj(positions,'ACTOR_ACCOUNT').positions,'POSITIONS');
 if(Object.keys(all).length>64)throw Error('STAGE49_TOO_MANY_POSITIONS');
 let sum=0n;
 for(const [key,value] of Object.entries(all)){
  if(!/^[A-Za-z0-9._:-]{1,100}$/.test(key))throw Error('STAGE49_BAD_POSITION_ID');
  const legs=obj(value,'POSITION').collateral;
  if(!Array.isArray(legs)||legs.length>256)throw Error('STAGE49_INVALID_COLLATERAL_LEGS');
  const unique=new Set();
  for(const x of legs){
   const row=obj(x,'COLLATERAL_LEG');
   if(typeof row.token_id!=='string'||!ID.test(row.token_id)||
    unique.has(row.token_id))throw Error('STAGE49_DUPLICATE_OR_BAD_ASSET');
   unique.add(row.token_id);
   const credited=amount(row.balance,'COLLATERAL_BALANCE');
   amount(row.shares,'COLLATERAL_SHARES');
   if(tokenId===null||row.token_id===tokenId)sum+=credited;
  }
 }
 return sum;
}
export function inspectStage49SandboxBorrow({plan,assets,actorAccountId,actorPositions}){
 if(!plan||plan.mode!=='ARBIVANE_STAGE37_ISOLATED_SANDBOX_LIQUIDATION_PLAN'||
  plan.chain!=='NEAR_SANDBOX'||plan.executionEnabled!==false||
  plan.mayBroadcastMainnet!==false||plan.maySignMainnet!==false||
  plan.method!=='execute_with_pyth'||!Array.isArray(plan.actions)||
  ![3,4].includes(plan.actions.length)||!ID.test(actorAccountId)||
  actorAccountId===plan.borrowerAccountId||
  !Array.isArray(assets)||assets.length<1||assets.length>256)
  throw Error('STAGE49_UNTRUSTED_SANDBOX_PROPOSAL');
 const token=plan.actions[0]?.Borrow?.token_id,rawQty=plan.actions[0]?.Borrow?.amount;
 const liquidation=plan.actions[1]?.Liquidate;
 const withdraw=plan.actions.at(-1)?.Withdraw;
 const same=liquidation?.out_assets?.[0]?.token_id===token;
 if(!withdraw||((withdraw.amount===undefined)===(withdraw.max_amount===undefined))||
  (same&&withdraw.max_amount===undefined)||
  (!same&&withdraw.amount===undefined))
  throw Error('STAGE125_INVALID_BOUNDED_WITHDRAW_MODE');
 if(!ID.test(token)||!liquidation||liquidation.in_assets?.length!==1||
  liquidation.out_assets?.length!==1||
  liquidation.in_assets[0]?.token_id!==token||
  ((liquidation.in_assets[0]?.amount===undefined)===
    (liquidation.in_assets[0]?.max_amount===undefined))||
   (liquidation.in_assets[0]?.amount??liquidation.in_assets[0]?.max_amount)!==rawQty||
  !withdraw||withdraw.token_id!==liquidation.out_assets[0].token_id||
  (same?(plan.actions.length!==4||
   plan.actions[2]?.Repay?.token_id!==token||
   plan.actions[2].Repay.amount!==rawQty||
   BigInt(liquidation.out_assets[0].amount??'0')-BigInt(rawQty)!==BigInt(withdraw.max_amount??'0')):
   plan.actions.length!==3)||
  liquidation.account_id!==plan.borrowerAccountId)
  throw Error('STAGE49_PLAN_REPAY_ROUTE_MISMATCH');
 const qty=amount(rawQty,'BORROW_AMOUNT');
 if(qty===0n)throw Error('STAGE49_EMPTY_BORROW_AMOUNT');
 const members=new Map();
 for(const entry of assets){
  if(!Array.isArray(entry)||entry.length!==2||!ID.test(entry[0])||
   members.has(entry[0]))throw Error('STAGE49_INVALID_OR_DUPLICATE_ASSET_ROW');
  members.set(entry[0],obj(entry[1],'ASSET_ENTRY'));
 }
 const row=members.get(token);
 if(!row)throw Error('STAGE49_REPAY_ASSET_NOT_IN_PINNED_POOL');
 const config=obj(row.config,'ASSET_CONFIG');
 if(typeof config.can_borrow!=='boolean')
  throw Error('STAGE49_BORROW_PERMISSION_UNKNOWN');
 const supplied=amount(obj(row.supplied,'POOL_SUPPLIED').balance,'POOL_SUPPLY');
 const borrowed=amount(obj(row.borrowed,'POOL_BORROWED').balance,'POOL_DEBT');
 const collateral=actorCollateralInternal(actorPositions);
 const available=supplied>borrowed?supplied-borrowed:0n;
 const status=!config.can_borrow?'BLOCKED_REPAY_ASSET_CANNOT_BORROW':
  available<qty?'BLOCKED_POOL_CAPACITY_INSUFFICIENT':
  collateral===0n?'BLOCKED_SANDBOX_ACTOR_HAS_NO_COLLATERAL':
  'SANDBOX_BORROW_ATTEMPT_NOT_MAINNET_AUTHORIZATION';
 return {
  mode:'ARBIVANE_STAGE49_SANDBOX_FUNDING_PREFLIGHT',
  chain:'NEAR_SANDBOX',status,borrowTokenId:token,
  borrowAmountInternal:qty.toString(),
  poolHeadroomReferenceInternal:available.toString(),
  actorCollateralReferenceInternal:collateral.toString(),
  actorAccountId,borrowerAccountId:plan.borrowerAccountId,
  sandboxAttemptAllowed:status==='SANDBOX_BORROW_ATTEMPT_NOT_MAINNET_AUTHORIZATION',
  deployedBorrowCapacityVerified:false,tokenDecimalsVerified:false,
  contractBorrowingParityVerified:false,financingNetProfitVerified:false,
  realMainnetExecuted:false,executionEnabled:false,maySignMainnet:false,
  mayBroadcastMainnet:false,
  blockers:[
   ...(status==='SANDBOX_BORROW_ATTEMPT_NOT_MAINNET_AUTHORIZATION'?
    ['ACTOR_BORROW_HEALTH_AND_DEPOSIT_SHARE_PARITY_NOT_PROVEN_PRECALL']:[status]),
   'POOL_HEADROOM_IS_REFERENCE_NOT_ATTESTED_AVAILABLE_BORROW_LIQUIDITY',
   'EXECUTE_WITH_PYTH_ASYNC_CALLBACK_AND_STAGE41_BALANCE_SETTLEMENT_REQUIRED',
   'MAINNET_FINANCING_SWAP_AND_REAL_NET_PROFIT_UNVERIFIED'
  ],
 };
}

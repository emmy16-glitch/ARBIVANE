/** Stage124: share-rounding-safe Rhea SAME-TOKEN financing inside NEAR Sandbox.
 * This is a pure accounting witness computed from genuine local lending.views.
 * Never edits source borrower, oracle, collateral or protocol asset state.
 */
const UINT=/^[1-9][0-9]{0,38}$/;
const U128=(1n<<128n)-1n;
function uint(v,label){
 if(typeof v!=='string'||!UINT.test(v)||BigInt(v)>U128)
  throw Error('STAGE124_INVALID_'+label);
 return BigInt(v);
}
function poolFor(assets,token){
 if(!Array.isArray(assets)||assets.length<1||assets.length>512)
  throw Error('STAGE124_UNTRUSTED_POOL_SNAPSHOT');
 const hits=assets.filter(a=>Array.isArray(a)&&a.length===2&&a[0]===token);
 if(hits.length!==1)throw Error('STAGE124_POOL_NOT_UNIQUE');
 const p=hits[0][1]?.supplied;
 return {balance:uint(p?.balance,'SUPPLIED_BALANCE'),
  shares:uint(p?.shares,'SUPPLIED_SHARES')};
}
function ceil(n,d){return (n+d-1n)/d;}
function credit(q,b,s){return q*s/b;}
function required(inAmount,q,b,s){
 const minted=credit(q,b,s);
 return ceil(inAmount*(s+minted),b+q);
}
function sourceRoute(plan){
 if(plan?.chain!=='NEAR_SANDBOX'||plan?.executionEnabled!==false||
  plan?.maySignMainnet!==false||plan?.mayBroadcastMainnet!==false||
  plan?.method!=='execute_with_pyth'||plan?.depositYocto!=='1'||
  !Array.isArray(plan?.actions)||plan.actions.length!==4)
  throw Error('STAGE124_UNTRUSTED_LOCAL_PLAN');
 const a=plan.actions,b=a[0]?.Borrow,l=a[1]?.Liquidate,
  repay=a[2]?.Repay,withdraw=a[3]?.Withdraw;
 if(typeof b?.token_id!=='string'||!l||l.account_id!==plan.borrowerAccountId||
  l.in_assets?.length!==1||l.out_assets?.length!==1||
  l.in_assets[0].token_id!==b.token_id||
  l.out_assets[0].token_id!==b.token_id||
  repay?.token_id!==b.token_id||withdraw?.token_id!==b.token_id)
  throw Error('STAGE124_MISMATCHED_TOKEN_ROUTE');
 const inAmount=uint(l.in_assets[0].amount,'REPAY'),seized=uint(l.out_assets[0].amount,'SEIZE');
 if(seized<=inAmount+4n)throw Error('STAGE124_NO_POSITIVE_FINANCING_MARGIN');
 return {inAmount,seized,token:b.token_id};
}
/** Find the smallest real incremental Borrow that credits at least two shares
 * beyond rounded-up liquidation repayment, bounded by 25% of observed gross
 * same-token collateral spread. This is NOT a fabricated loan or price.
 */
export function stage124PrepareShareSafeBorrow(plan,assets){
 if(plan?.stage124ShareFunding!==undefined)
  throw Error('STAGE124_ALREADY_ADJUSTED');
 const {inAmount,seized,token}=sourceRoute(plan);
 const b=uint(plan.actions[0]?.Borrow?.amount,'ORIGINAL_BORROW');
 if(b!==inAmount||uint(plan.actions[2]?.Repay?.amount,'ORIGINAL_SELF_REPAY')!==b||
  uint(plan.actions[3]?.Withdraw?.amount,'ORIGINAL_WITHDRAW')!==seized-b)
  throw Error('STAGE124_PREBUFFER_ROUTE_MISMATCH');
 const pool=poolFor(assets,token);
 const maxDelta=(seized-inAmount)/4n;
 if(maxDelta===0n||inAmount+maxDelta>U128)
  throw Error('STAGE124_NO_SAFE_SHARE_MARGIN');
 const matches=q=>credit(q,pool.balance,pool.shares)>=
  required(inAmount,q,pool.balance,pool.shares)+2n;
 const high=inAmount+maxDelta;
 if(!matches(high))throw Error('STAGE124_SHARE_MARGIN_CANNOT_BE_FINANCED');
 let lo=inAmount,hi=high;
 while(lo<hi){const mid=(lo+hi)/2n;if(matches(mid))hi=mid;else lo=mid+1n;}
 const borrow=lo;
 if(borrow===inAmount)throw Error('STAGE124_UNEXPECTED_ZERO_SHARE_BUFFER');
 const witness={
  mode:'STAGE124_REAL_POOL_SHARE_ROUNDING_FINANCING',chain:'NEAR_SANDBOX',
  repaymentTokenId:token,
  sourceLiquidationRepayInternal:inAmount.toString(),
  sourceLiquidationSeizeInternal:seized.toString(),
  borrowedInternal:borrow.toString(),incrementalBorrowInternal:(borrow-inAmount).toString(),
  poolSuppliedBalanceInternal:pool.balance.toString(),
  poolSuppliedShares:pool.shares.toString(),
  mintedBorrowShares:credit(borrow,pool.balance,pool.shares).toString(),
  roundedUpRequiredLiquidationShares:required(inAmount,borrow,pool.balance,pool.shares).toString(),
  maxExtraBorrowInternal:maxDelta.toString(),
  expectedRemainingAfterSelfRepayInternal:(seized-borrow).toString(),
  borrowerStateModified:false,oraclePriceModified:false,mainnetExecutionEnabled:false,
 };
 const actions=plan.actions.map(x=>structuredClone(x));
 actions[0].Borrow.amount=borrow.toString();
 actions[2].Repay.amount=borrow.toString();
 actions[3].Withdraw.amount=(seized-borrow).toString();
 return {plan:{...plan,actions,stage124ShareFunding:witness},witness};
}
/** Recompute against the same real local pool view; a caller cannot merely
 * assert that a forged buffer or arbitrary bigger loan passed preflight. */
export function stage124ValidateShareSafeBorrow(plan,assets){
 const w=plan?.stage124ShareFunding;
 if(!w||w.mode!=='STAGE124_REAL_POOL_SHARE_ROUNDING_FINANCING'||
  w.chain!=='NEAR_SANDBOX'||w.mainnetExecutionEnabled!==false)
  throw Error('STAGE124_MISSING_OR_FORGED_SHARE_PROOF');
 const {inAmount,seized}=sourceRoute(plan);
 const original={...plan,stage124ShareFunding:undefined,
  actions:plan.actions.map(x=>structuredClone(x))};
 original.actions[0].Borrow.amount=inAmount.toString();
 original.actions[2].Repay.amount=inAmount.toString();
 original.actions[3].Withdraw.amount=(seized-inAmount).toString();
 const recomputed=stage124PrepareShareSafeBorrow(original,assets);
 if(JSON.stringify(w)!==JSON.stringify(recomputed.witness)||
  JSON.stringify(plan.actions)!==JSON.stringify(recomputed.plan.actions))
  throw Error('STAGE124_SHARE_PROOF_OR_AMOUNTS_DO_NOT_MATCH_POOL');
 return w;
}

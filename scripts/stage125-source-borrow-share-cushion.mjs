/** Stage125 - evidence-backed Sandbox actor funding cushion.
 * Historical Rhea Borrow can round the actor's supplied shares DOWN, while
 * the immediately following Liquidate/Repay rounds required supply UP.
 * Preserve the authentic borrower repayment and seized collateral quantities.
 * Never change source prices, borrower storage, health rules or mainnet gates.
 */
const UINT=/^[1-9][0-9]{0,38}$/;
const CAP=(1n<<128n)-1n;
const u=(x,reason)=>{
 if(typeof x!=='string'||!UINT.test(x)||BigInt(x)>CAP)
  throw Error('STAGE125_'+reason);
 return BigInt(x);
};
export function sourceBackedBorrowShareCushion(plan,assets){
 if(!plan||plan.chain!=='NEAR_SANDBOX'||plan.executionEnabled!==false||
  plan.maySignMainnet!==false||plan.mayBroadcastMainnet!==false||
  plan.method!=='execute_with_pyth'||!Array.isArray(assets)||
  plan.actions?.length!==4)
  throw Error('STAGE125_SANDBOX_SAME_TOKEN_REQUIRED');
 const borrow=plan.actions[0]?.Borrow,liq=plan.actions[1]?.Liquidate,
  repay=plan.actions[2]?.Repay,withdraw=plan.actions[3]?.Withdraw;
 const token=borrow?.token_id;
 if(!token||token!==repay?.token_id||
  token!==liq?.in_assets?.[0]?.token_id||
  token!==liq?.out_assets?.[0]?.token_id||
  token!==withdraw?.token_id||
  !/^[a-z0-9._-]{2,64}$/.test(token)||
  !liq?.account_id||liq.account_id!==plan.borrowerAccountId)
  throw Error('STAGE125_AUTHENTIC_ROUTE_CHANGED');
 const R=u(liq.in_assets[0].amount,'REPAY_INVALID'),
  S=u(liq.out_assets[0].amount,'SEIZE_INVALID');
 if(u(borrow.amount,'BORROW_INVALID')!==R||
  u(repay.amount,'SELF_REPAY_INVALID')!==R||
  u(withdraw.amount,'WITHDRAW_INVALID')!==S-R||S<=R)
  throw Error('STAGE125_SOURCE_PLAN_NOT_BASELINE');
 const matches=assets.filter(row=>Array.isArray(row)&&row.length===2&&row[0]===token);
 if(matches.length!==1||matches[0][1]?.config?.can_borrow!==true)
  throw Error('STAGE125_PINNED_POOL_UNAVAILABLE');
 const supplied=matches[0][1].supplied;
 const balance=u(supplied?.balance,'SOURCE_SUPPLIED_BALANCE_INVALID');
 const shares=u(supplied?.shares,'SOURCE_SUPPLIED_SHARES_INVALID');
 if(shares>balance)throw Error('STAGE125_BAD_POOL_SHARE_RATIO');
 // Conservative four share-units plus four atomics; no iterative retries or
 // arbitrary gross-scenario inflation. Source snapshot determines precision.
 const quantum=(balance+shares-1n)/shares;
 const extra=4n*quantum+4n;
 if(extra===0n||extra>1000000n||extra>R/1000000000n||
  extra>(S-R)/1000n||R+extra>CAP)
  throw Error('STAGE125_ROUNDING_CUSHION_EXCEEDS_STRICT_BOUNDS');
 const borrowedPool=u(matches[0][1]?.borrowed?.balance,'SOURCE_BORROWED_INVALID');
 if(balance<=borrowedPool||R+extra>balance-borrowedPool)
  throw Error('STAGE125_PINNED_POOL_LIQUIDITY_INSUFFICIENT');
 const B=R+extra;
 borrow.amount=B.toString();
 repay.amount=B.toString();
 plan.sourceBackedBorrowCushionInternal=extra.toString();
 return {mode:'STAGE125_SOURCE_BACKED_ACTOR_SHARE_ROUNDING_ONLY',
  chain:'NEAR_SANDBOX',sourceBlockHeight:plan.mainnetSourceBlockHeight,
  liquidationRepayInternal:R.toString(),
  liquidationSeizeInternal:S.toString(),
  actorBorrowAndRepayInternal:B.toString(),
  actorCushionInternal:extra.toString(),sourceSuppliedShareQuantumCeil:quantum.toString(),
  originalBorrowerLiquidationUnchanged:true,fullContractExecutionNotYetVerified:true,
  mainnetExecutionEnabled:false,maySignMainnet:false,mayBroadcastMainnet:false};
}

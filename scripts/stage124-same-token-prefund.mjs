/** Stage124 — prove the liquidator actually owns supplied repayment assets
 * before invoking the genuine Rhea liquidation. Sandbox-only, no minted tokens,
 * source price modification, borrower mutation or mainnet signing.
 */
const DECIMAL=/^(0|[1-9][0-9]{0,38})$/;
function parse(value,label){
 if(typeof value!=='string'||!DECIMAL.test(value)||BigInt(value)>((1n<<128n)-1n))
  throw Error('STAGE124_INVALID_'+label);
 return BigInt(value);
}
export function stage124SameTokenRoute(plan){
 if(plan?.chain!=='NEAR_SANDBOX'||plan.executionEnabled!==false||
  plan.maySignMainnet!==false||plan.mayBroadcastMainnet!==false||
  plan.depositYocto!=='1'||!Array.isArray(plan.actions)||
  plan.actions.length!==4)throw Error('STAGE124_UNTRUSTED_LOCAL_SAME_TOKEN_PLAN');
 const [first,liq,repay,withdraw]=plan.actions;
 const token=first?.Borrow?.token_id;
 if(typeof token!=='string'||!/^[a-z0-9._-]{2,64}$/.test(token)||
  liq?.Liquidate?.in_assets?.[0]?.token_id!==token||
  liq.Liquidate.out_assets?.[0]?.token_id!==token||
  repay?.Repay?.token_id!==token||
  withdraw?.Withdraw?.token_id!==token)
  throw Error('STAGE124_ASSET_ROUTE_MISMATCH');
 const debt=parse(first.Borrow.amount,'BORROW');
 const liquidation=parse(liq.Liquidate.in_assets[0].amount,'LIQUIDATION');
 const selfRepay=parse(repay.Repay.amount,'SELF_REPAY');
 const seized=parse(liq.Liquidate.out_assets[0].amount,'SEIZE');
 const withdrawn=parse(withdraw.Withdraw.amount,'WITHDRAW');
 if(!debt||debt!==liquidation||debt!==selfRepay||
  seized<=debt||withdrawn!==seized-debt)
  throw Error('STAGE124_INVALID_SAME_TOKEN_ACCOUNTING');
 return {token,required:debt,borrowActions:[first],
  liquidationActions:[liq,repay,withdraw]};
}
export function stage124SuppliedBalance(position,token){
 if(!position||typeof position!=='object'||!Array.isArray(position.supplied)||
  position.supplied.length>256)throw Error('STAGE124_INVALID_ACTOR_SUPPLIED');
 const found=position.supplied.filter(row=>row?.token_id===token);
 if(found.length>1)throw Error('STAGE124_DUPLICATE_ACTOR_SUPPLY');
 return found.length===0?0n:parse(found[0].balance,'ACTOR_SUPPLIED');
}
export function stage124BorrowedBalance(position,token){
 const regular=position?.positions?.REGULAR;
 if(!regular||!Array.isArray(regular.borrowed)||regular.borrowed.length>256)
  throw Error('STAGE124_INVALID_ACTOR_DEBT');
 const found=regular.borrowed.filter(row=>row?.token_id===token);
 if(found.length>1)throw Error('STAGE124_DUPLICATE_ACTOR_DEBT');
 return found.length===0?0n:parse(found[0].balance,'ACTOR_BORROWED');
}
export function stage124AttestSuppliedBorrow({before,after,route}){
 const oldSupply=stage124SuppliedBalance(before,route.token);
 const supply=stage124SuppliedBalance(after,route.token);
 const oldDebt=stage124BorrowedBalance(before,route.token);
 const debt=stage124BorrowedBalance(after,route.token);
 if(oldSupply!==0n||oldDebt!==0n||debt<=oldDebt)
  throw Error('STAGE124_PREBORROW_UNVERIFIED_DEBT_DELTA');
 if(supply<route.required)
  throw Error('STAGE124_BORROW_NOT_CREDITED_AS_SUFFICIENT_SUPPLIED_BALANCE');
 return {mode:'STAGE124_GENUINE_SANDBOX_SUPPLIED_REPAY_PROOF',
  repayTokenId:route.token,requiredInternal:route.required.toString(),
  observedSuppliedInternal:supply.toString(),
  observedBorrowedInternal:debt.toString(),
  actorSupplyFromBorrowVerified:true,actorLiabilityOutstanding:true,
  borrowerModifiedByPrefunding:false,mainnetExecutionEnabled:false};
}

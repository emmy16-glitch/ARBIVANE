/** Stage124: fund the liquidator's genuine Rhea *supplied* LiNEAR balance.
 * Borrow creates a token withdrawal, not internal supply. After finality,
 * return the real borrowed FT via ft_transfer_call before Liquidate.
 * All calls run against the imported contracts in an isolated Sandbox.
 */
const UINT=/^(0|[1-9][0-9]{0,38})$/;
const ID=/^[a-z0-9._-]{2,64}$/;
function number(v,label){
 if(typeof v!=='string'||!UINT.test(v))throw Error('STAGE124_INVALID_'+label);
 return BigInt(v);
}
function rows(raw,kind,tokenId){
 if(!Array.isArray(raw)||raw.length>256)throw Error('STAGE124_INVALID_'+kind);
 const matches=raw.filter(x=>x&&x.token_id===tokenId);
 if(matches.length>1)throw Error('STAGE124_DUPLICATE_'+kind);
 return number(matches[0]?.balance??'0',kind+'_BALANCE');
}
function debt(account,tokenId){
 const positions=account?.positions;
 if(!positions||typeof positions!=='object'||Array.isArray(positions))
  throw Error('STAGE124_INVALID_ACTOR_POSITIONS');
 let total=0n;
 for(const p of Object.values(positions))
  total+=rows(p?.borrowed,'DEBT',tokenId);
 return total;
}
function supply(account,tokenId){
 return rows(account?.supplied,'SUPPLIED',tokenId);
}
export async function stage124FinalizeSandboxTransaction(raw,provider,actorId,label){
 let v=raw?.result??raw;
 const error=()=>Error('STAGE124_'+label+'_UNVERIFIED_RECEIPTS');
 if(!v||!['FINAL','EXECUTED_OPTIMISTIC','EXECUTED'].includes(v.final_execution_status)||
  !Array.isArray(v.receipts_outcome)||v.receipts_outcome.length===0)
  throw error();
 if((v.status&&Object.hasOwn(v.status,'Failure'))||
  v.receipts_outcome.some(x=>x.outcome?.status?.Failure))
  throw error();
 if(v.final_execution_status!=='FINAL'||!Object.hasOwn(v.status??{},'SuccessValue')){
  const hash=v.transaction?.hash;
  if(typeof hash!=='string'||!provider||typeof provider.txStatus!=='function')
   throw error();
  let timer;
  try{
   v=await Promise.race([
    provider.txStatus(hash,actorId,'FINAL'),
    new Promise((_,reject)=>{timer=setTimeout(()=>reject(error()),15000);}),
   ]);
  }finally{clearTimeout(timer);}
 }
 // Require the final response to attest the SAME signed local transaction.
 const initial=raw?.result??raw;
 if(typeof initial?.transaction?.hash!=='string'||
  v?.transaction?.hash!==initial.transaction.hash||
  v?.transaction?.signer_id!==actorId)
  throw error();
 if(v.final_execution_status!=='FINAL'||!Object.hasOwn(v.status??{},'SuccessValue')||
  !Array.isArray(v.receipts_outcome)||v.receipts_outcome.length===0||
  v.receipts_outcome.some(x=>x.outcome?.status?.Failure||
   !x.outcome?.status||(
    !Object.hasOwn(x.outcome.status,'SuccessValue')&&
    !Object.hasOwn(x.outcome.status,'SuccessReceiptId'))))
  throw error();
 return v;
}
export async function prefundStage124RheaSupply({
 actor,lending,repayToken,plan,repayReserve,provider
}){
 if(plan?.chain!=='NEAR_SANDBOX'||plan?.maySignMainnet!==false||
  plan?.executionEnabled!==false||plan?.mayBroadcastMainnet!==false||
  plan?.method!=='execute_with_pyth'||plan.actions?.length!==4||
  !actor||!ID.test(actor.accountId)||typeof actor.callRaw!=='function'||
  !lending||!ID.test(lending.accountId)||typeof lending.view!=='function'||
  !repayToken||typeof repayToken.view!=='function'||
  !provider||typeof provider.txStatus!=='function')
  throw Error('STAGE124_INVALID_SANDBOX_DEPENDENCIES');
 const tokenId=plan.actions[0]?.Borrow?.token_id;
 const amount=number(plan.actions[0]?.Borrow?.amount,'BORROW');
 if(tokenId!==repayToken.accountId||
  tokenId!==plan.actions[1]?.Liquidate?.in_assets?.[0]?.token_id||
  tokenId!==plan.actions[1]?.Liquidate?.out_assets?.[0]?.token_id||
  tokenId!==plan.actions[2]?.Repay?.token_id||
  tokenId!==plan.actions[3]?.Withdraw?.token_id||
  repayReserve?.repayTokenId!==tokenId||repayReserve?.extraDecimals!==0||
  number(repayReserve?.requiredFtAtomicRoundedUp,'SOURCE_FT_AMOUNT')!==amount)
  throw Error('STAGE124_REPAY_FT_UNITS_OR_ROUTE_UNATTESTED');
 const readPositions=()=>lending.view('get_account_all_positions',{account_id:actor.accountId});
 const readFt=()=>repayToken.view('ft_balance_of',{account_id:actor.accountId});
 const [start,ftStart]=await Promise.all([readPositions(),readFt()]);
 if(debt(start,tokenId)!==0n||supply(start,tokenId)!==0n||
  number(ftStart,'INITIAL_FT')!==0n)
  throw Error('STAGE124_REFUSE_PREEXISTING_REPAY_ASSETS_OR_DEBT');
 // The independent, signed Borrow call must actually deliver real cloned FT.
 const borrowRaw=await actor.callRaw(lending,plan.method,{
  actions:[plan.actions[0]],
 },{gas:300000000000000n,attachedDeposit:1n});
 const borrowFinal=await stage124FinalizeSandboxTransaction(borrowRaw,provider,actor.accountId,'BORROW');
 const [borrowState,borrowFt]=await Promise.all([readPositions(),readFt()]);
 const borrowedDebt=debt(borrowState,tokenId);
 if(borrowedDebt<amount||number(borrowFt,'BORROW_FT')<amount)
  throw Error('STAGE124_BORROW_NOT_FUNDED_IN_REAL_FT');
 // Standard Rhea FT deposit credits 'supplied', unlike OnlyIncreaseCollateral.
 const depositRaw=await actor.callRaw(repayToken,'ft_transfer_call',{
  receiver_id:lending.accountId,amount:amount.toString(),msg:'',
 },{gas:200000000000000n,attachedDeposit:1n});
 const depositFinal=await stage124FinalizeSandboxTransaction(depositRaw,provider,actor.accountId,'SUPPLY');
 const [funded,ftFunded]=await Promise.all([readPositions(),readFt()]);
 const debtAfter=debt(funded,tokenId);
 const suppliedAfter=supply(funded,tokenId);
 if(suppliedAfter<amount||debtAfter<amount||
  number(borrowFt,'BORROW_FT')-number(ftFunded,'FUNDED_FT')!==amount)
  throw Error('STAGE124_REPAY_SUPPLY_OR_CONSERVATION_FAILED');
 const borrowHash=borrowFinal.transaction?.hash??borrowRaw?.result?.transaction?.hash??borrowRaw?.transaction?.hash;
 const supplyHash=depositFinal.transaction?.hash??depositRaw?.result?.transaction?.hash??depositRaw?.transaction?.hash;
 if(typeof borrowHash!=='string'||typeof supplyHash!=='string'||borrowHash===supplyHash)
  throw Error('STAGE124_SIGNED_FUNDING_HASHES_MISSING');
 return {
  mode:'STAGE124_AUTHENTIC_BORROW_TO_SUPPLIED_FT_PREFUND',chain:'NEAR_SANDBOX',
  actorAccountId:actor.accountId,repayTokenId:tokenId,
  borrowAmountInternal:amount.toString(),suppliedInternal: suppliedAfter.toString(),
  actorBorrowDebtAfterSupplyInternal:debtAfter.toString(),
  priorActorBorrowDebtInternal:'0',
  actualBorrowFtCredited:true,actualFtReturnedToSupply:true,
  borrowFinalReceiptVerified:true,supplyFinalReceiptVerified:true,
  borrowTransactionHash:borrowHash,supplyTransactionHash:supplyHash,
  mainnetExecutionEnabled:false,maySignMainnet:false,mayBroadcastMainnet:false,
 };
}

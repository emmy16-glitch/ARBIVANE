import {writeFile} from 'node:fs/promises';
import {registerStage49SandboxActor} from './stage49-sandbox-route-readiness.mjs';
import {resolveStage124RheaCallbackReceipts} from './stage124-final-rhea-receipts.mjs';
import {stage134AdvanceFinalizedSandbox} from './stage134-finality-fallback.mjs';

/** Stage146: preserve EXACT observed deployed Rhea enum ABI.
 * The inner `Liquidate` parameters ARE NOT a standalone action; the deployed
 * action deserializer requires `{Liquidate:{account_id,in_assets,out_assets}}`.
 * Never send a bare `account_id` object into execute_with_pyth.
 */
export function stage146BuildPartnerFundedLiquidationActions(plan){
 const inner=plan?.actions?.[1]?.Liquidate;
 const input=inner?.in_assets?.[0],out=inner?.out_assets?.[0];
 if(plan?.chain!=='NEAR_SANDBOX'||plan?.maySignMainnet!==false||
  !inner||inner.account_id!==plan.borrowerAccountId||
  !Array.isArray(inner.in_assets)||inner.in_assets.length!==1||
  !Array.isArray(inner.out_assets)||inner.out_assets.length!==1||
  input?.token_id!=='linear-protocol.near'||
  out?.token_id!=='linear-protocol.near'||
  typeof out.amount!=='string'||!U.test(out.amount)||
  input.amount!==undefined&&input.max_amount!==undefined)
  throw Error('STAGE146_UNTRUSTED_SOURCE_LIQUIDATION_ABI');
 return [
  {Liquidate:structuredClone(inner)},
  {Withdraw:{token_id:'linear-protocol.near',max_amount:out.amount}}
 ];
}

/**
 * Stage146 — local NEAR Workspaces genuine NEP-141 financed Rhea attempt.
 * The separately controlled partner deposits disposable Workspaces wNEAR
 * collateral and borrows LiNEAR, then TRANSFERS actual LiNEAR NEP-141 to a
 * ZERO-collateral fresh liquidator. This is partner-funded, NOT flash liquidity.
 * No mainnet signer, external wallet or protocol promise-chain rollback.
 */
const U=/^(0|[1-9][0-9]{0,38})$/,NEAR=10n**24n;
const MAX_GAS=300000000000000n;
function balance(v,reason){
 if(typeof v!=='string'||!U.test(v))throw Error('STAGE146_'+reason);
 return BigInt(v);
}
function borrowedShareTotal(account,token){
 const positions=account?.positions;
 if(!positions||typeof positions!=='object'||Array.isArray(positions))
  throw Error('STAGE146_BAD_ACCOUNT_POSITIONS');
 let total=0n;
 for(const position of Object.values(positions)){
  if(!position||!Array.isArray(position.borrowed))
   throw Error('STAGE146_BAD_BORROWED_LEGS');
  for(const entry of position.borrowed){
   if(entry.token_id===token)total+=balance(entry.shares,'BAD_BORROWED_SHARES');
  }
 }
 return total;
}
const MAX_STAGE148_DUST_ATOMIC=100000n;
// Stage148: only accrued microscopic partner debt, never a second principal
// loan. The 100000 atomic LiNEAR ceiling is tiny versus 1.858e15 principal,
// but nevertheless requires genuine local FT wallet balance and actual Rhea
// debt-share and balance views before any additional signed Sandbox call.
export function stage148InspectOutstandingPartnerDebt(account,token){
 const positions=account?.positions;
 if(!positions||typeof positions!=='object'||Array.isArray(positions))
  throw Error('STAGE148_BAD_PARTNER_POSITION_VIEW');
 let shares=0n,amount=0n;
 for(const p of Object.values(positions)){
  if(!p||!Array.isArray(p.borrowed))throw Error('STAGE148_MISSING_BORROWED_LEGS');
  for(const row of p.borrowed){
   if(row.token_id!==token)continue;
   shares+=balance(row.shares,'BAD_DEBT_SHARES');
   amount+=balance(row.balance,'BAD_DEBT_BALANCE');
  }
 }
 if((shares===0n)!==(amount===0n))
  throw Error('STAGE148_MISMATCHED_DEBT_SHARES_AND_BALANCE');
 return {sharesAtomic:shares.toString(),balanceAtomic:amount.toString()};
}
export function stage148BoundDebtTopup({debtSharesAtomic,debtBalanceAtomic,
 actorBalanceAtomic,alreadySentAtomic}){
 const shares=balance(debtSharesAtomic,'DEBT_SHARES');
 const debt=balance(debtBalanceAtomic,'DEBT_BALANCE');
 const actor=balance(actorBalanceAtomic,'ACTOR_WALLET');
 const spent=balance(alreadySentAtomic,'ALREADY_SENT');
 if(shares===0n||debt===0n||shares>MAX_STAGE148_DUST_ATOMIC||
  debt>MAX_STAGE148_DUST_ATOMIC||spent>MAX_STAGE148_DUST_ATOMIC)
  throw Error('STAGE148_NOT_BOUNDED_DEBT_DUST');
 const add=debt+32n;
 if(spent+add>MAX_STAGE148_DUST_ATOMIC||actor<=add)
  throw Error('STAGE148_DUST_BUDGET_OR_ACTOR_RESIDUAL_EXCEEDED');
 return add.toString();
}
/** Large financing test: 10 or 100 genuine disposable LiNEAR token units (24
 * decimals). The source-authenticated borrower liquidation stays tiny and
 * unchanged, while all unused supplied principal must be withdrawn.
 */
export function stage150ChooseLargeLocalPrincipal({env,sourceBorrowAmountInternal}){
 const baseline=balance(sourceBorrowAmountInternal,'SOURCE_BORROW');
 if(env?.STAGE150_LARGE_SANDBOX!=='true')
  return {enabled:false,borrowInternalAtomic:baseline.toString()};
 if(env?.NEAR_WORKSPACES_NETWORK!=='sandbox'||
  env?.EXECUTION_ENABLED!=='false'||
  env?.STAGE146_ALLOW_LOCAL_NEAR_LOAN!=='true'||
  env?.NEAR_PRIVATE_KEY||env?.MAINNET_PRIVATE_KEY||env?.NEAR_ACCOUNT_ID)
  throw Error('STAGE150_NON_LOCAL_BORROW_FORBIDDEN');
 const tokens=env?.STAGE150_LARGE_SANDBOX_TOKENS==='100'?100n:
  env?.STAGE150_LARGE_SANDBOX_TOKENS===undefined||
  env?.STAGE150_LARGE_SANDBOX_TOKENS==='10'?10n:null;
 if(tokens===null)throw Error('STAGE150_UNAPPROVED_TEST_AMOUNT');
 const target=tokens*10n**24n;
 if(baseline===0n||baseline>=target)
  throw Error('STAGE150_SOURCE_BORROW_NOT_SMALLER_THAN_LARGE_TEST');
 return {enabled:true,borrowInternalAtomic:target.toString()};
}
/** Larger local principal can accrue more than the tiny Stage148 100k
 * atomic-unit threshold. Allow only genuine debt balance plus 32 units, capped
 * at 0.1% of independently observed, real locally borrowed principal.
 * This cannot invent extra tokens: the liquidator must still possess them.
 */
export function stage150BoundLargeDebtClosure({
 debtSharesAtomic,debtBalanceAtomic,actorBalanceAtomic,alreadySentAtomic,
 realBorrowedPrincipalAtomic
}){
 const shares=balance(debtSharesAtomic,'LARGE_DEBT_SHARES'),
  due=balance(debtBalanceAtomic,'LARGE_DEBT_BALANCE'),
  actor=balance(actorBalanceAtomic,'LARGE_ACTOR_FT'),
  spent=balance(alreadySentAtomic,'LARGE_ALREADY_SPENT'),
  principal=balance(realBorrowedPrincipalAtomic,'LARGE_PRINCIPAL');
 if(shares===0n||due===0n||principal<10n**24n||
  principal>100n*10n**24n)
  throw Error('STAGE150_INVALID_REAL_DEBT_OR_LOAN');
 const cap=principal/1000n,amount=due+32n;
 if(spent+amount>cap||actor<=amount)
  throw Error('STAGE150_ACCRUED_INTEREST_EXCEEDS_REAL_LIQUIDATION_PROCEEDS');
 return amount.toString();
}
function hasZeroCollateral(account){
 const positions=account?.positions;
 if(!positions||typeof positions!=='object'||Array.isArray(positions))return false;
 return Object.values(positions).every(p=>
  p&&Array.isArray(p.collateral)&&
  p.collateral.every(x=>x&&balance(x.shares,'BAD_COLLATERAL_SHARES')===0n));
}
/** Exact Rhea get_account_all_positions layout:
 * - Account.supplied is TOP LEVEL (global non-collateral deposits).
 * - Account.positions.REGULAR.collateral and .borrowed are per-position.
 * Stage93's authentic get_account_all_positions snapshots attest this.
 * Never assume position.supplied exists: it would falsely reject a real
 * successful NEP-141 supply as a zero-share deposit.
 */
export function stage146FindLegShares(account,kind,token){
 if(kind==='supplied'){
  if(!Array.isArray(account?.supplied)||account.supplied.length>256)
   throw Error('STAGE146_BAD_ACCOUNT_SUPPLIED_LEGS');
  let total=0n;
  for(const leg of account.supplied){
   if(!leg||typeof leg.token_id!=='string')
    throw Error('STAGE146_MALFORMED_SUPPLIED_LEG');
   if(leg.token_id===token)total+=balance(leg.shares,'BAD_SUPPLIED_SHARES');
  }
  return total;
 }
 if(kind!=='borrowed'&&kind!=='collateral')
  throw Error('STAGE146_UNKNOWN_POSITION_LEG_KIND');
 const positions=account?.positions;
 if(!positions||typeof positions!=='object'||Array.isArray(positions))
  throw Error('STAGE146_BAD_BORROWER_POSITIONS');
 let total=0n;
 for(const p of Object.values(positions)){
  if(!p||!Array.isArray(p[kind]))throw Error('STAGE146_BAD_BORROWER_'+kind);
  for(const row of p[kind]){
   if(row.token_id===token)total+=balance(row.shares,'BAD_BORROWER_SHARES');
  }
 }
 return total;
}
function rawReceipt(raw,step){
 const r=raw?.result??raw;
 if(!r||typeof r!=='object'||!['FINAL','EXECUTED_OPTIMISTIC'].includes(r.final_execution_status)||
  !r.status||typeof r.status!=='object'||Object.hasOwn(r.status,'Failure')||
  !Array.isArray(r.receipts_outcome)||r.receipts_outcome.length===0||
  r.receipts_outcome.some(x=>!x?.outcome?.status||
   Object.hasOwn(x.outcome.status,'Failure')))
  throw Error('STAGE146_'+step+'_RECEIPT_FAILED_OR_INCOMPLETE');
 return {
  transactionHash:typeof r.transaction?.hash==='string'?r.transaction.hash:null,
  receiptIds:r.receipts_outcome.map(x=>x.id).filter(x=>typeof x==='string'),
  finalExecutionStatus:r.final_execution_status,
  receiptsWithoutFailure:r.receipts_outcome.length
 };
}
export async function stage146AttemptRealPartnerFundedLocalRhea({
 root,partner,contracts,worker,plan,pinnedBorrower,stageReportPath='stage146-actual-partner-evidence.json'
}){
 if(process.env.NEAR_WORKSPACES_NETWORK!=='sandbox'||
  process.env.STAGE146_ALLOW_LOCAL_NEAR_LOAN!=='true'||
  process.env.EXECUTION_ENABLED!=='false'||
  process.env.NEAR_PRIVATE_KEY||process.env.MAINNET_PRIVATE_KEY||
  process.env.NEAR_ACCOUNT_ID||!root?.createSubAccount||
  !partner?.callRaw||!worker?.provider?.txStatus||!contracts?.get||
  plan?.chain!=='NEAR_SANDBOX'||plan?.maySignMainnet!==false||
  plan?.mayBroadcastMainnet!==false)
  throw Error('STAGE146_LOCAL_SIGNER_ONLY_EXPLICIT_GATE_REQUIRED');
 const loan=plan.actions?.[0]?.Borrow;
 const liquidation=plan.actions?.[1]?.Liquidate;
 const withdraw=plan.actions?.at(-1)?.Withdraw;
 if(!loan||!liquidation||!withdraw||
  loan.token_id!=='linear-protocol.near'||
  withdraw.token_id!=='linear-protocol.near'||
  plan.actions.length!==4||
  loan.token_id!==liquidation.in_assets?.[0]?.token_id||
  plan.borrowerAccountId!==liquidation.account_id)
  throw Error('STAGE146_ONLY_AUTHENTIC_SAME_TOKEN_LINEAR_RHEA_ROUTE');
 const token=contracts.get('linear-protocol.near'),lending=contracts.get(plan.lendingContract);
 if(!token||!lending||token.accountId!=='linear-protocol.near'||
  lending.accountId!=='contract.main.burrow.near')
  throw Error('STAGE146_MISSING_IMPORTED_REAL_RHEA_AND_LINEAR');
 const large=stage150ChooseLargeLocalPrincipal({
  env:process.env,sourceBorrowAmountInternal:loan.amount
 });
 const chosenBorrow=large.borrowInternalAtomic;
 const result={
  mode:'STAGE146_REAL_LOCAL_WORKSPACES_PARTNER_FINANCING_ATTEMPT',
  stage150LargeFundingEnabled:large.enabled,
  stage150TargetLoanTokenAtomic:large.enabled?chosenBorrow:null,
  stage150RemainingRheaSupplyReclaimed:false,
  stage150BorrowedFtLargeAmountVerified:false,
  stage150ActualReturnedUnusedSupplyAtomic:null,
  chain:'NEAR_SANDBOX',sourceBlock:plan.mainnetSourceBlockHeight,
  borrowerAccountId:plan.borrowerAccountId,
  partnerAccountId:partner.accountId,
  liquidatorAccountId:null,
  partnerFundingClass:'SANDBOX_WNEAR_COLLATERAL_BACKED_RHEA_BORROW',
  liquidatorInitialCollateralShares:'UNOBSERVED',
  observedPartnerIssuedLiNEARAtomic:null,
  observedPartnerToLiquidatorTransferAtomic:null,
  observedLiquidatorDepositAtomic:null,
  observedLiquidatorRheaSuppliedShares:null,
  observedLiquidatorWalletFtAfterSupplyAtomic:null,
  observedLiquidationDebtDecreaseShares:null,
  observedLiquidationCollateralDecreaseShares:null,
  observedLiquidatorToPartnerRepaymentAtomic:null,
  observedPartnerRemainingRheaDebtShares:null,
  observedPartnerDebtDustBeforeShares:null,
  observedPartnerDebtDustBeforeAtomic:null,
  observedPartnerAdditionalDebtPaymentAtomic:'0',
  partnerAccruedDebtDustClosed:false,
  finalActorWalletResidualAtomic:null,
  phase:'STARTED',status:'ATTEMPT_IN_PROGRESS',
  actualOnchainLoanAndLiquidationVerified:false,
  mainnetExecution:false,ownerFunded:false,mainnetWalletsTouched:false,
  actualFlashLoan:false,realizedNetEconomicProfitVerified:false,
  maySignMainnet:false,mayBroadcastMainnet:false,ownerPayoutPermitted:false,
  stage153SandboxOnlyOriginalFinalityReadRetries:
   process.env.STAGE152_ULTRA_SHORT_LOCAL_CLOCK==='true',
  stage153NeverResubmitTransaction:true,
  receiptProofs:{},blockers:[],
 };
 const save=()=>writeFile(stageReportPath,JSON.stringify(result,null,2)+'\n');
 const guard=async(name,fn)=>{
  result.phase=name;await save();
  try{return await fn();}
  catch(e){
   result.status='LOCAL_NEAR_TRANSACTION_OR_EVIDENCE_BLOCKED';
   result.blockers.push(typeof e?.message==='string'&&
     /^(STAGE146_|STAGE124_|STAGE153_)/.test(e.message)?
     e.message:'STAGE146_'+name+'_RPC_OR_CONTRACT_EXECUTION_FAILED');
   await save();
   throw Error(result.blockers.at(-1));
  }
 };
 const snapshot=accountId=>lending.view('get_account_all_positions',{account_id:accountId});
 const ft=accountId=>token.view('ft_balance_of',{account_id:accountId});
 // The NEAR Workspaces SDK can return EXECUTED with SuccessReceiptId
 // although later promise callbacks settle successfully. DO NOT reject that
 // pre-final response or claim it proves lending. Resolve original FINAL
 // receipts before calling rawReceipt or observing any token credit.
 const finalFtReceipt=async(raw,signerAccountId,method)=>{
  const v=raw?.result??raw;
  const hash=v?.transaction?.hash;
  if(typeof hash!=='string'||!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(hash)||
     v?.transaction?.signer_id!==signerAccountId)
   throw Error('STAGE146_'+method.toUpperCase()+'_BAD_SIGNED_LOCAL_TRANSACTION');
  let final=v;
  if(v.final_execution_status!=='FINAL'||!Array.isArray(v.receipts)||
      v.receipts.length===0){
   if(typeof worker.provider.txStatusReceipts!=='function')
    throw Error('STAGE146_LOCAL_FINAL_FT_RECEIPT_PROVIDER_UNAVAILABLE');
   let timer;
   try{
    final=await Promise.race([
     worker.provider.txStatusReceipts(hash,signerAccountId,'FINAL'),
     new Promise((_,reject)=>{timer=setTimeout(
      ()=>reject(Error('STAGE146_FINAL_FT_RECEIPT_QUERY_TIMEOUT')),15000);})
    ]);
   }finally{clearTimeout(timer);}
  }
  if(final?.final_execution_status!=='FINAL'||
     final?.transaction?.hash!==hash||
     final?.transaction?.signer_id!==signerAccountId||
     !Array.isArray(final.receipts)||final.receipts.length===0||
     !Array.isArray(final.receipts_outcome)||
     !v.receipts_outcome.every(x=>
      final.receipts_outcome.some(y=>y.id===x.id)))
   throw Error('STAGE146_'+method.toUpperCase()+'_INCOMPLETE_FINAL_FT_RECEIPTS');
  return {result:final};
 };
 const call=async(signer,contract,method,args,deposit=1n,gas=MAX_GAS)=>{
  const raw=await signer.callRaw(contract,method,args,{gas,attachedDeposit:deposit});
  if(method==='execute_with_pyth'){
   // Requery only STATUS of the already submitted original transaction,
   // never resend an action. Errors or failed callbacks are NOT recoverable.
   const retry=process.env.STAGE152_ULTRA_SHORT_LOCAL_CLOCK==='true'&&
    process.env.STAGE146_ALLOW_LOCAL_NEAR_LOAN==='true'&&
    process.env.NEAR_WORKSPACES_NETWORK==='sandbox'&&
    process.env.EXECUTION_ENABLED==='false';
   let final,last;
   const log=[];
   const receiptHash=raw?.result?.transaction?.hash??raw?.transaction?.hash??null;
   for(let attempt=1;attempt<=(retry?4:1);attempt++){
    try{
     final=await resolveStage124RheaCallbackReceipts({
      raw,provider:worker.provider,signerAccountId:signer.accountId,
      evidencePath:retry?'stage153-last-original-finality.json':null,writeFile
     });
     log.push({attempt,status:'CANONICAL_FINAL',transactionHash:receiptHash});
     break;
    }catch(e){
     last=e;
     const code=typeof e?.message==='string'?e.message:'STAGE153_FINALITY_UNCLASSIFIED';
     log.push({attempt,status:code,transactionHash:receiptHash});
     if(!retry||!['STAGE124_FINAL_RECEIPT_QUERY_FAILED',
      'STAGE124_CANONICAL_CALLBACK_RECEIPTS_MISSING'].includes(code)||
      attempt===4)break;
     // Stage155: Stage154 proved a +64 request can leave local FINAL
     // motionless (observed 74 -> 74). Use the existing Stage134 Sandbox
     // fallback: 64 first, 10000 only after independently observing a stall.
     // Never rebroadcast the original signed Borrow/Withdraw transaction.
     if(typeof worker.provider.block==='function'&&
        typeof worker.provider.fastForward==='function'){
      try{
       const before=await worker.provider.block({finality:'final'});
       const recovery=await stage134AdvanceFinalizedSandbox(worker.provider,before);
       log.push({attempt,status:'STAGE155_SANDBOX_FINALITY_RECOVERED',
        originalTransactionHash:receiptHash,...recovery.witness,
        syntheticClockAndSourceBorrowerEconomicsUnchanged:true,
        realProfitVerified:false});
      }catch(recoveryError){
       log.push({attempt,status:'STAGE155_SANDBOX_FINALITY_RECOVERY_FAILED',
        originalTransactionHash:receiptHash,
        error:String(recoveryError?.message??'UNKNOWN').slice(0,240)});
      }
     }
     await new Promise(r=>setTimeout(r,1500));
    }
   }
   if(retry){
    result.receiptProofs.stage153OriginalFinalityQueryAttempts=
     [...(result.receiptProofs.stage153OriginalFinalityQueryAttempts??[]),
      ...log];
    await save();
   }
   if(!final)throw last??Error('STAGE153_ORIGINAL_FINALITY_UNAVAILABLE');
   return {...rawReceipt(final,'RHEA_PYTH_CALLBACK'),
    finalCallbackReceiptsVerified:true};
  }
  const final=await finalFtReceipt(raw,signer.accountId,method);
  return {...rawReceipt(final,method.toUpperCase()),
   finalFtReceiptsVerified:true};
 };
 try{
  const liquidator=await guard('FRESH_ZERO_COLLATERAL_LIQUIDATOR',async()=>{
   const a=await root.createSubAccount('stage146-liquidator',{
    initialBalance:2n*NEAR});
   if(!a?.callRaw)throw Error('STAGE146_NO_LOCAL_LIQUIDATOR_SIGNER');
   result.liquidatorAccountId=a.accountId;
   result.receiptProofs.registration=await registerStage49SandboxActor({
    actor:a,contracts,plan});
   const before=await snapshot(a.accountId);
   if(!hasZeroCollateral(before)||
    borrowedShareTotal(before,'linear-protocol.near')!==0n||
    balance(await ft(a.accountId),'INITIAL_LIQUIDATOR_FT')!==0n)
    throw Error('STAGE146_LIQUIDATOR_WAS_PRE_FUNDED_OR_COLLATERALIZED');
   result.liquidatorInitialCollateralShares='0';await save();
   return a;
  });
  const beforePartner=await snapshot(partner.accountId);
  const partnerBeforeDebt=borrowedShareTotal(beforePartner,'linear-protocol.near');
  if(partnerBeforeDebt!==0n)throw Error('STAGE146_PARTNER_HAS_OLD_DEBT');
  const partnerFtBefore=balance(await ft(partner.accountId),'PARTNER_FT_BEFORE');
  const borrowerBefore=await snapshot(plan.borrowerAccountId);
  await guard('PARTNER_REAL_RHEA_BORROW_AND_WITHDRAW',async()=>{
   result.receiptProofs.partnerBorrow=await call(partner,lending,'execute_with_pyth',{
    actions:[
     {Borrow:{token_id:'linear-protocol.near',amount:chosenBorrow}},
     {Withdraw:{token_id:'linear-protocol.near',max_amount:chosenBorrow}}
    ]
   });
   const now=balance(await ft(partner.accountId),'PARTNER_FT_AFTER_BORROW');
   const debt=borrowedShareTotal(await snapshot(partner.accountId),'linear-protocol.near');
   if(now<=partnerFtBefore||debt===0n)
    throw Error('STAGE146_PARTNER_BORROW_NOT_SPENDABLE_FT');
   result.observedPartnerIssuedLiNEARAtomic=(now-partnerFtBefore).toString();
   if(large.enabled){
    const actual=now-partnerFtBefore;
    if(actual<BigInt(chosenBorrow)-10n**20n||actual>BigInt(chosenBorrow))
     throw Error('STAGE150_LARGE_RHEA_BORROW_FT_NOT_DELIVERED');
    result.stage150BorrowedFtLargeAmountVerified=true;
   }
   await save();
  });
  const principal=BigInt(result.observedPartnerIssuedLiNEARAtomic);
  await guard('ACTUAL_PARTNER_NEAR_FT_TRANSFER_TO_ZERO_COLLATERAL_EXECUTOR',async()=>{
   const before=balance(await ft(liquidator.accountId),'EXECUTOR_FT_BEFORE_TRANSFER');
   result.receiptProofs.issue=await call(partner,token,'ft_transfer',{
    receiver_id:liquidator.accountId,amount:principal.toString(),
    memo:'Stage146 local-only separately funded Rhea attempt'
   });
   const after=balance(await ft(liquidator.accountId),'EXECUTOR_FT_AFTER_TRANSFER');
   if(after-before!==principal)
    throw Error('STAGE146_REAL_FT_TRANSFER_DID_NOT_SETTLE');
   result.observedPartnerToLiquidatorTransferAtomic=principal.toString();await save();
  });
  await guard('LIQUIDATOR_SUPPLY_LOAN_TOKENS_TO_REAL_RHEA',async()=>{
   result.receiptProofs.supply=await call(liquidator,token,'ft_transfer_call',{
    receiver_id:lending.accountId,amount:principal.toString(),msg:''
   },1n,200000000000000n);
   const actorShares=stage146FindLegShares(await snapshot(liquidator.accountId),'supplied','linear-protocol.near');
   const now=balance(await ft(liquidator.accountId),'FT_AFTER_SUPPLY');
   result.observedLiquidatorRheaSuppliedShares=actorShares.toString();
   result.observedLiquidatorWalletFtAfterSupplyAtomic=now.toString();
   await save();
   if(actorShares===0n||now!==0n)
    throw Error('STAGE146_FT_DEPOSIT_NOT_RECORDED_AS_RHEA_SUPPLY');
   result.observedLiquidatorDepositAtomic=principal.toString();await save();
  });
  await guard('EXECUTE_AUTHENTIC_RHEA_LIQUIDATION_WITH_EXTERNALLY_TRANSFERRED_FT',async()=>{
   result.receiptProofs.rheaLiquidate=await call(liquidator,lending,'execute_with_pyth',{
    actions:stage146BuildPartnerFundedLiquidationActions(plan)
   });
   const afterBorrower=await snapshot(plan.borrowerAccountId);
   const debtReduction=stage146FindLegShares(borrowerBefore,'borrowed','linear-protocol.near')-
    stage146FindLegShares(afterBorrower,'borrowed','linear-protocol.near');
   const collateralReduction=stage146FindLegShares(borrowerBefore,'collateral','linear-protocol.near')-
    stage146FindLegShares(afterBorrower,'collateral','linear-protocol.near');
   if(debtReduction<=0n||collateralReduction<=0n)
    throw Error('STAGE146_REAL_BORROWER_DEBT_AND_COLLATERAL_NOT_REDUCED');
   if(borrowedShareTotal(await snapshot(liquidator.accountId),'linear-protocol.near')!==0n)
    throw Error('STAGE146_LIQUIDATOR_CREATED_UNEXPECTED_RHEA_DEBT');
   result.observedLiquidationDebtDecreaseShares=debtReduction.toString();
   result.observedLiquidationCollateralDecreaseShares=collateralReduction.toString();
   await save();
  });
  if(large.enabled)await guard('STAGE150_WITHDRAW_UNUSED_LARGE_SUPPLIED_LINEAR',async()=>{
   // Source borrower limits remain unchanged. This explicitly returns ALL
   // unused actual supplied token funding before repaying partner.
   const actorBefore=await snapshot(liquidator.accountId);
   const supplyBefore=stage146FindLegShares(
    actorBefore,'supplied','linear-protocol.near');
   if(supplyBefore===0n||!hasZeroCollateral(actorBefore)||
    borrowedShareTotal(actorBefore,'linear-protocol.near')!==0n)
    throw Error('STAGE150_ACTOR_CANNOT_RECLAIM_UNVERIFIED_SUPPLY');
   const walletBefore=balance(await ft(liquidator.accountId),'ACTOR_BEFORE_RECOVERY');
   result.receiptProofs.stage150ReturnUnusedSupply=await call(
    liquidator,lending,'execute_with_pyth',{
     actions:[{Withdraw:{token_id:'linear-protocol.near'}}]
    });
   const actorAfter=await snapshot(liquidator.accountId);
   const supplyAfter=stage146FindLegShares(
    actorAfter,'supplied','linear-protocol.near');
   const walletAfter=balance(await ft(liquidator.accountId),'ACTOR_AFTER_RECOVERY');
   if(supplyAfter!==0n||walletAfter<=walletBefore||
    walletAfter-walletBefore<principal-10n**20n||
    !hasZeroCollateral(actorAfter)||
    borrowedShareTotal(actorAfter,'linear-protocol.near')!==0n)
    throw Error('STAGE150_UNUSED_SUPPLY_NOT_RETURNED_AS_GENUINE_FT');
   result.stage150ActualReturnedUnusedSupplyAtomic=(walletAfter-walletBefore).toString();
   result.stage150RemainingRheaSupplyReclaimed=true;
   await save();
  });
  await guard('ACTUAL_FT_REPAYMENT_TO_EXTERNAL_PARTNER_ACCOUNT',async()=>{
   const before=balance(await ft(partner.accountId),'PARTNER_PRE_REPAYMENT');
   const executorBalance=balance(await ft(liquidator.accountId),'EXECUTOR_AFTER_LIQUIDATION');
   if(executorBalance<principal)
    throw Error('STAGE146_EXTERNAL_REPAYMENT_PRINCIPAL_UNAVAILABLE');
   result.receiptProofs.repayPartner=await call(liquidator,token,'ft_transfer',{
    receiver_id:partner.accountId,amount:principal.toString(),
    memo:'Stage146 repay sandbox partner principal'
   });
   const after=balance(await ft(partner.accountId),'PARTNER_AFTER_REPAYMENT');
   if(after-before!==principal)
    throw Error('STAGE146_PARTNER_NOT_ACTUALLY_REPAID');
   result.observedLiquidatorToPartnerRepaymentAtomic=principal.toString();
   await save();
  });
  await guard('PARTNER_REPAY_RHEA_COLLATERALIZED_BORROW',async()=>{
   // The lender borrowed to source its inventory. Repaying only the operator
   // wallet without settling that debt would misstate zero remaining risk.
   result.receiptProofs.repayRhea=await call(partner,token,'ft_transfer_call',{
    receiver_id:lending.accountId,amount:principal.toString(),
    msg:JSON.stringify({Execute:{actions:[{Repay:{
     token_id:'linear-protocol.near'
    }}]}})
   },1n,200000000000000n);
   let state=await snapshot(partner.accountId);
   let observed=stage148InspectOutstandingPartnerDebt(state,'linear-protocol.near');
   result.observedPartnerDebtDustBeforeShares=observed.sharesAtomic;
   result.observedPartnerDebtDustBeforeAtomic=observed.balanceAtomic;
   result.observedPartnerRemainingRheaDebtShares=observed.sharesAtomic;
   await save();
   let total=0n;
   result.receiptProofs.stage148DebtDust=[];result.receiptProofs.stage148DebtDustTransfers=[];
   for(let round=0;round<3&&BigInt(observed.sharesAtomic)>0n;round++){
    const actorSpendable=balance(await ft(liquidator.accountId),'ACTOR_DUST_SOURCE');
    const bound={
     debtSharesAtomic:observed.sharesAtomic,
     debtBalanceAtomic:observed.balanceAtomic,
     actorBalanceAtomic:actorSpendable.toString(),
     alreadySentAtomic:total.toString()
    };
    const topup=BigInt(large.enabled?
     stage150BoundLargeDebtClosure({
      ...bound,realBorrowedPrincipalAtomic:principal.toString()
     }):
     stage148BoundDebtTopup(bound));
    const partnerBefore=balance(await ft(partner.accountId),'PARTNER_BEFORE_DUST');
    const actualTransfer=await call(liquidator,token,'ft_transfer',{
     receiver_id:partner.accountId,amount:topup.toString(),
     memo:'Stage148 genuine local accrued debt closure'
    });
    result.receiptProofs.stage148DebtDustTransfers.push(actualTransfer);
    const partnerAfter=balance(await ft(partner.accountId),'PARTNER_AFTER_DUST');
    if(partnerAfter-partnerBefore!==topup)
     throw Error('STAGE148_DEBT_DUST_NE_P141_TRANSFER_NOT_CONSERVED');
    const actualRepay=await call(partner,token,'ft_transfer_call',{
     receiver_id:lending.accountId,amount:topup.toString(),
     msg:JSON.stringify({Execute:{actions:[{Repay:{
      token_id:'linear-protocol.near'
     }}]}})
    },1n,200000000000000n);
    result.receiptProofs.stage148DebtDust.push(actualRepay);
    total+=topup;
    state=await snapshot(partner.accountId);
    const next=stage148InspectOutstandingPartnerDebt(state,'linear-protocol.near');
    if(BigInt(next.sharesAtomic)>=BigInt(observed.sharesAtomic))
     throw Error('STAGE148_DEBT_DUST_NOT_REDUCED_AFTER_REAL_CALLBACK');
    observed=next;
    result.observedPartnerAdditionalDebtPaymentAtomic=total.toString();
    result.observedPartnerRemainingRheaDebtShares=observed.sharesAtomic;
    await save();
   }
   if(observed.sharesAtomic!=='0')
    throw Error('STAGE148_BOUNDED_REPAYMENT_EXHAUSTED_OPEN_RHEA_DEBT');
   const finalActor=balance(await ft(liquidator.accountId),'FINAL_ACTOR_FT_BALANCE');
   if(finalActor===0n)throw Error('STAGE148_NO_REMAINING_ACTOR_TOKEN_INVENTORY');
   result.finalActorWalletResidualAtomic=finalActor.toString();
   result.partnerAccruedDebtDustClosed=true;
   result.observedPartnerRemainingRheaDebtShares='0';
   await save();
  });
  result.phase='FINISHED';
  result.status='ACTUAL_LOCAL_PARTNER_FINANCED_RHEA_AND_FT_REPAYMENT_VERIFIED';
  result.actualOnchainLoanAndLiquidationVerified=true;
  result.blockers=[
   'SANDBOX_PARTNER_PRINCIPAL_WAS_BACKED_BY_DISPOSABLE_WNEAR_COLLATERAL',
   'MULTI_TRANSACTION_NEAR_ASYNC_ROUTE_IS_NOT_A_PERMISSIONLESS_ATOMIC_FLASH_LOAN',
   'GAS_STORAGE_AND_EXIT_SWAP_ECONOMICS_NOT_REALIZED_ON_MAINNET',
   'NO_INDEPENDENT_PRODUCTION_CAPITAL_PARTNER_OR_PROTECTED_LENDER_VAULT'
  ];
  await save();return result;
 }catch(e){
  if(result.status==='ATTEMPT_IN_PROGRESS'){
   result.status='LOCAL_PARTNER_FINANCING_FAILED';
   result.blockers.push(typeof e?.message==='string'?e.message:'STAGE146_UNCLASSIFIED_LOCAL_FAILURE');
   await save();
  }
  throw e;
 }
}

import {writeFile} from 'node:fs/promises';
import {seedSandboxLiquidatorWithWrappedNear} from './stage49-sandbox-wrap-funding.mjs';
import {registerStage49SandboxActor} from './stage49-sandbox-route-readiness.mjs';
import {stage124FinalizeSandboxTransaction} from './stage124-rhea-supply-prefund.mjs';

/**
 * Stage146: ACTUAL local NEAR Workspaces partner-funded NEP-141 transfers,
 * Rhea Liquidate and repay the independently collateralized partner.
 *
 * This is emphatically NOT a NEAR mainnet flash loan. The disposable Sandbox
 * partner funds itself via 1 SANDBOX NEAR wNEAR collateral before borrowing.
 * The separately created liquidator starts with ZERO collateral and debt.
 * Every funding/repay leg must execute the genuine imported token/Rhea Wasm.
 *
 * No synthetic FT storage patches, FT faucet, mock receipts, owner signer,
 * owner collateral, mainnet RPC mutations or payout are permitted here.
 */
const UINT=/^(0|[1-9][0-9]{0,38})$/;
const ID=/^[a-z0-9][a-z0-9._-]{1,63}$/;
const U128=(1n<<128n)-1n;
const amount=(v,label)=>{
 if(typeof v!=='string'||!UINT.test(v)||BigInt(v)>U128)
  throw Error('STAGE146_INVALID_'+label);
 return BigInt(v);
};
const signed=tx=>tx?.transaction?.hash??null;
const debt=(account,token)=>{
 if(!account||typeof account!=='object'||!account.positions||
  typeof account.positions!=='object')throw Error('STAGE146_INVALID_POSITION_VIEW');
 let total=0n;
 for(const position of Object.values(account.positions)){
  if(!Array.isArray(position?.borrowed))throw Error('STAGE146_INVALID_DEBT_ROWS');
  for(const leg of position.borrowed){
   if(leg?.token_id===token)total+=amount(leg.balance,'DEBT_BALANCE');
  }
 }
 return total;
};
const collateral=(account,token)=>{
 if(!account?.positions)throw Error('STAGE146_INVALID_COLLATERAL_ACCOUNT');
 let n=0n;
 for(const position of Object.values(account.positions)){
  if(!Array.isArray(position?.collateral))throw Error('STAGE146_INVALID_COLLATERAL_ROWS');
  for(const leg of position.collateral)
   if(leg?.token_id===token)n+=amount(leg.balance,'COLLATERAL');
 }
 return n;
};
const supplied=(account,token)=>{
 if(!Array.isArray(account?.supplied))throw Error('STAGE146_INVALID_SUPPLY_VIEW');
 return account.supplied.filter(x=>x?.token_id===token).reduce(
  (n,row)=>n+amount(row.balance,'SUPPLIED'),0n);
};
const positionLeg=(account,positionId,role,token)=>{
 const p=account?.positions?.[positionId];
 if(!p||!Array.isArray(p[role]))throw Error('STAGE146_MISSING_BORROWER_POSITION');
 return p[role].filter(x=>x?.token_id===token).reduce(
  (n,row)=>n+amount(row.balance,'BORROWER_POSITION'),0n);
};
const rawWrite=async(name,raw)=>writeFile(name,
 JSON.stringify(raw?.result??raw,null,2)+'\n',{flag:'wx'});
async function genuineCall({sender,receiver,method,args,deposit,gas,provider,label}){
 if(!ID.test(sender.accountId)||!ID.test(receiver.accountId))
  throw Error('STAGE146_UNTRUSTED_LOCAL_ACCOUNT');
 const raw=await sender.callRaw(receiver,method,args,{
  gas:BigInt(gas),attachedDeposit:BigInt(deposit)});
 await rawWrite('stage146-'+label+'-raw.json',raw);
 const receipt=await stage124FinalizeSandboxTransaction(
  raw,provider,sender.accountId,label.toUpperCase());
 await writeFile('stage146-'+label+'-final.json',
  JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
 return receipt;
}
export async function stage146RunActualLocalPartnerFinance({
 root,actor,lending,wrapped,repayToken,contracts,assetRows,plan,
 positionId,provider
}){
 if(process.env.NEAR_WORKSPACES_NETWORK!=='sandbox'||
  process.env.EXECUTION_ENABLED!=='false'||
  process.env.STAGE146_SANDBOX_PARTNER_FINANCING!=='true'||
  process.env.NEAR_PRIVATE_KEY||process.env.NEAR_ACCOUNT_ID||
  process.env.MAINNET_PRIVATE_KEY||!root||!provider||
  !ID.test(actor?.accountId??'')||
  actor.accountId!=='arbivane-replay.test.near'||
  !ID.test(lending?.accountId??'')||
  lending.accountId!=='contract.main.burrow.near'||
  wrapped?.accountId!=='wrap.near'||
  repayToken?.accountId!=='linear-protocol.near'||
  !contracts||!Array.isArray(assetRows)||
  plan?.chain!=='NEAR_SANDBOX'||plan?.maySignMainnet!==false||
  plan?.mayBroadcastMainnet!==false||
  plan?.executionEnabled!==false||
  plan?.borrowerAccountId===actor.accountId||
  !ID.test(positionId??''))
  throw Error('STAGE146_GENUINE_LOCAL_ONLY_DEPENDENCIES_REQUIRED');
 const loanToken=plan.actions?.[0]?.Borrow?.token_id;
 const inAsset=plan.actions?.[1]?.Liquidate?.in_assets?.[0];
 const outAsset=plan.actions?.[1]?.Liquidate?.out_assets?.[0];
 const withdraw=plan.actions?.at(-1)?.Withdraw;
 if(loanToken!=='linear-protocol.near'||inAsset?.token_id!==loanToken||
  outAsset?.token_id!==loanToken||withdraw?.token_id!==loanToken||
  plan.actions.length!==4||plan.actions[2]?.Repay?.token_id!==loanToken)
  throw Error('STAGE146_ONLY_SOURCE_AUTHENTICATED_SAME_LINEAR_ROUTE');
 const required=amount(plan.actions[0].Borrow.amount,'REPAY_INTERNAL');
 const plannedSeizure=amount(outAsset.amount,'SEIZE_INTERNAL');
 if(required===0n||plannedSeizure<=required)
  throw Error('STAGE146_UNPROFITABLE_SOURCE_SIZING');
 const actorPositions=()=>lending.view('get_account_all_positions',{
  account_id:actor.accountId});
 const partnerName='external-partner';
 const partner=await root.createSubAccount(partnerName,{
  initialBalance:4n*10n**24n});
 if(partner.accountId===actor.accountId||!ID.test(partner.accountId))
  throw Error('STAGE146_ACTOR_PARTNER_IDENTITY_COLLISION');
 const partnerPositions=()=>lending.view('get_account_all_positions',{
  account_id:partner.accountId});
 const ftBalance=account=>repayToken.view('ft_balance_of',{
  account_id:account.accountId});
 const [actorStart,borrowerStart,partnerStart]=await Promise.all([
  actorPositions(),lending.view('get_account_all_positions',{account_id:plan.borrowerAccountId}),
  partnerPositions()]);
 if(debt(actorStart,loanToken)!==0n||collateral(actorStart,'wrap.near')!==0n||
  debt(partnerStart,loanToken)!==0n||collateral(partnerStart,'wrap.near')!==0n||
  supplied(actorStart,loanToken)!==0n)
  throw Error('STAGE146_ACTORS_MUST_BE_UNFUNDED_AND_DEBT_FREE');
 await registerStage49SandboxActor({actor:partner,contracts,plan});
 const partnerFunding=await seedSandboxLiquidatorWithWrappedNear({
  actor:partner,lending,wrapped,assetRows,provider,
  evidencePath:'stage146-partner-wnear-collateral-transfer.json'
 });
 if(partnerFunding.actorAccountId!==partner.accountId||
  partnerFunding.wrappedNativeSandboxYocto!=='1000000000000000000000000')
  throw Error('STAGE146_PARTNER_SANDBOX_COLLATERAL_UNVERIFIED');
 const actorWalletStart=amount(await ftBalance(actor),'ACTOR_FT_START');
 const partnerWalletStart=amount(await ftBalance(partner),'PARTNER_FT_START');
 if(actorWalletStart!==0n||partnerWalletStart!==0n)
  throw Error('STAGE146_REFUSE_PREEXISTING_LINEAR_LIQUIDITY');
 // This standalone Rhea Borrow is collateralized by PARTNER's local wrapped
 // NEAR. The user and actor have no collateral.
 await genuineCall({sender:partner,receiver:lending,provider,label:'partner-borrow',
  method:'execute_with_pyth',args:{actions:[plan.actions[0]]},
  deposit:1n,gas:300000000000000n});
 const partnerBorrowed=amount(await ftBalance(partner),'PARTNER_RECEIVED_FT');
 const partnerPostBorrow=await partnerPositions();
 const partnerDebtBefore=debt(partnerPostBorrow,loanToken);
 if(partnerBorrowed<required||partnerDebtBefore===0n)
  throw Error('STAGE146_PARTNER_BORROW_PRINCIPAL_UNDELIVERED');
 // Transfer actual NEP-141 wallet tokens; never credit an arbitrary account
 // by direct storage patches. Source-token's 24 decimals are unchanged.
 await genuineCall({sender:partner,receiver:repayToken,provider,label:'partner-to-actor',
  method:'ft_transfer',args:{receiver_id:actor.accountId,
   amount:partnerBorrowed.toString()},deposit:1n,gas:100000000000000n});
 const actorReceived=amount(await ftBalance(actor),'ACTOR_FT_AFTER_TRANSFER');
 const partnerAfterSend=amount(await ftBalance(partner),'PARTNER_FT_AFTER_SEND');
 if(actorReceived!==partnerBorrowed||partnerAfterSend!==0n)
  throw Error('STAGE146_FT_LENDER_TO_ACTOR_CONSERVATION_FAILED');
 await genuineCall({sender:actor,receiver:repayToken,provider,label:'actor-rhea-deposit',
  method:'ft_transfer_call',args:{receiver_id:lending.accountId,
   amount:actorReceived.toString(),msg:''},deposit:1n,gas:200000000000000n});
 const actorSupply=await actorPositions();
 const supply= supplied(actorSupply,loanToken);
 if(supply*1000000n<required*999990n||
  debt(actorSupply,loanToken)!==0n||
  collateral(actorSupply,'wrap.near')!==0n||
  amount(await ftBalance(actor),'ACTOR_FT_AFTER_SUPPLY')!==0n)
  throw Error('STAGE146_LIQUIDATOR_RHEA_SUPPLY_NOT_CREDITED');
 const debtStart=positionLeg(borrowerStart,positionId,'borrowed',loanToken);
 const collateralStart=positionLeg(borrowerStart,positionId,'collateral',loanToken);
 // Loan capital is ALREADY Rhea supplied; do not include Borrow or
 // self-Repay in actor's liquidation. Source-capped out amount protects
 // repayment economics. max_amount lets Rhea apply available shares.
 const actions=[plan.actions[1],{
  Withdraw:{token_id:loanToken,max_amount:plannedSeizure.toString()}
 }];
 await genuineCall({sender:actor,receiver:lending,provider,label:'actor-real-liquidation',
  method:'execute_with_pyth',args:{actions},deposit:1n,gas:300000000000000n});
 const [actorAfterLiquidation,borrowerAfterLiquidation]=await Promise.all([
  actorPositions(),lending.view('get_account_all_positions',{
   account_id:plan.borrowerAccountId})]);
 const debtEnd=positionLeg(borrowerAfterLiquidation,positionId,'borrowed',loanToken);
 const collateralEnd=positionLeg(borrowerAfterLiquidation,positionId,'collateral',loanToken);
 const received=amount(await ftBalance(actor),'ACTOR_REAL_SEIZED_FT');
 if(!(debtStart>debtEnd&&collateralStart>collateralEnd)||
  debt(actorAfterLiquidation,loanToken)!==0n||
  collateral(actorAfterLiquidation,'wrap.near')!==0n||received<=partnerBorrowed)
  throw Error('STAGE146_LIQUIDATION_AND_FT_SEIZURE_NOT_PROVEN');
 // Return actual borrowed token principal to partner. Residual actor tokens
 // are UNSOLD Sandbox inventory, not wallet earnings or mainnet profit.
 await genuineCall({sender:actor,receiver:repayToken,provider,label:'actor-to-partner',
  method:'ft_transfer',args:{receiver_id:partner.accountId,
   amount:partnerBorrowed.toString()},deposit:1n,gas:100000000000000n});
 const partnerRepaid=amount(await ftBalance(partner),'PARTNER_ACTUAL_REPAID_FT');
 const actorResidual=amount(await ftBalance(actor),'ACTOR_RESIDUAL_FT');
 if(partnerRepaid!==partnerBorrowed||actorResidual!==received-partnerBorrowed)
  throw Error('STAGE146_RETURNED_LOAN_PRINCIPAL_CONSERVATION_FAILED');
 // To close the partner's Rhea-originated collateralized debt, it must
 // deposit back the actual borrowed LiNEAR then call genuine Repay.
 await genuineCall({sender:partner,receiver:repayToken,provider,label:'partner-return-to-rhea',
  method:'ft_transfer_call',args:{receiver_id:lending.accountId,
   amount:partnerRepaid.toString(),msg:''},deposit:1n,gas:200000000000000n});
 await genuineCall({sender:partner,receiver:lending,provider,label:'partner-repay-borrow',
  method:'execute_with_pyth',args:{actions:[
   {Repay:{token_id:loanToken}}
  ]},deposit:1n,gas:300000000000000n});
 const [partnerAfterDebt,actorEnd]=await Promise.all([
  partnerPositions(),actorPositions()]);
 const partnerDebtEnd=debt(partnerAfterDebt,loanToken);
 if(partnerDebtEnd!==0n||debt(actorEnd,loanToken)!==0n||
  collateral(actorEnd,'wrap.near')!==0n||
  amount(await ftBalance(actor),'ACTOR_FINAL_FT')!==actorResidual)
  throw Error('STAGE146_PARTNER_RHEA_DEBT_NOT_FULLY_REPAID');
 const evidence={
  mode:'STAGE146_ACTUAL_PARTNER_FINANCED_SANDBOX_LIQUIDATION',
  network:'NEAR_SANDBOX',fundingClassification:
    'PARTNER_COLLATERALIZED_SANDBOX_RHEA_BORROW_NOT_FLASH_LOAN',
  borrowerAccountId:plan.borrowerAccountId,
  partnerAccountId:partner.accountId,liquidatorAccountId:actor.accountId,
  loanAsset:loanToken,
  partnerSandboxWnearCollateralYocto:
    partnerFunding.wrappedNativeSandboxYocto,
  actorOwnerCollateralAtomic:'0',
  partnerBorrowedLinearWalletAtomic:partnerBorrowed.toString(),
  actualFtPartnerToActorObserved:true,
  actualFtActorSuppliedToRheaObserved:true,
  realLocalRheaLiquidationFinalized:true,
  borrowerDebtDecreaseInternal:(debtStart-debtEnd).toString(),
  borrowerCollateralDecreaseInternal:(collateralStart-collateralEnd).toString(),
  actorRealFtSeizedAtomic:received.toString(),
  realLocalLoanPrincipalReturnedToPartner:true,
  partnerRheaBorrowDebtBeforeInternal:partnerDebtBefore.toString(),
  partnerRheaBorrowDebtAfterInternal:'0',
  actorFinalResidualLinearFtAtomic:actorResidual.toString(),
  partnerCollateralStillDepositedInRhea:
    collateral(partnerAfterDebt,'wrap.near')>0n,
  partnerCollateralRecoveryNotVerified:true,
  partnerLoanFeePaidAtomic:'0',
  realUncollateralizedFlashLoanUsed:false,
  zeroCapitalForOwnerInSandbox:true,
  verifiedMainnetProfit:false,realOwnerWalletPayout:false,
  canSignMainnet:false,canBroadcastMainnet:false,
  actualRealizationAndSwapNotProven:true
 };
 await writeFile('stage146-actual-partner-funded-result.json',
  JSON.stringify(evidence,null,2)+'\n',{flag:'wx'});
 return evidence;
}

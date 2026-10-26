import {readFile,writeFile} from 'node:fs/promises';
const U=/^(0|[1-9][0-9]{0,38})$/;
const u=(v,n)=>{if(typeof v!=='string'||!U.test(v))throw Error('STAGE154_BAD_'+n);return BigInt(v);};
const assert=(c,n)=>{if(!c)throw Error('STAGE154_'+n);};
/** Independently compare original, signed, cloned-Rhea LOCAL test evidence.
 * A 100-token Borrow returning principal is NOT full debt settlement: Stage151
 * left genuine Rhea accrued debt greater than the fixed borrower's profit.
 * This cannot authorize production; it can only reject an unsafe funding size.
 */
export function stage154QualifyLargeFinance(good,bad){
 assert(good?.mode==='STAGE146_REAL_LOCAL_WORKSPACES_PARTNER_FINANCING_ATTEMPT'&&
  bad?.mode===good.mode,'WRONG_SOURCE_EVIDENCE_TYPE');
 assert(good.chain==='NEAR_SANDBOX'&&bad.chain==='NEAR_SANDBOX'&&
  good.sourceBlock===bad.sourceBlock&&
  good.borrowerAccountId===bad.borrowerAccountId&&
  good.partnerFundingClass==='SANDBOX_WNEAR_COLLATERAL_BACKED_RHEA_BORROW'&&
  bad.partnerFundingClass===good.partnerFundingClass,'NONCOMPARABLE_OR_EXTERNAL_INPUTS');
 assert(good.status==='ACTUAL_LOCAL_PARTNER_FINANCED_RHEA_AND_FT_REPAYMENT_VERIFIED'&&
  good.observedPartnerRemainingRheaDebtShares==='0'&&
  good.partnerAccruedDebtDustClosed===true&&
  good.actualOnchainLoanAndLiquidationVerified===true,'GOOD_RUN_NOT_CLOSED');
 assert(bad.status==='LOCAL_NEAR_TRANSACTION_OR_EVIDENCE_BLOCKED'&&
  bad.partnerAccruedDebtDustClosed===false&&
  bad.phase==='PARTNER_REPAY_RHEA_COLLATERALIZED_BORROW','BAD_RUN_NOT_AT_LIABILITY_GATE');
 assert(good.stage150LargeFundingEnabled===true&&bad.stage150LargeFundingEnabled===true&&
  good.stage150RemainingRheaSupplyReclaimed===true&&
  bad.stage150RemainingRheaSupplyReclaimed===true,'NOT_FULLY_RECLAIMED_LARGE_PRINCIPAL');
 assert(good.maySignMainnet===false&&bad.maySignMainnet===false&&
  good.mainnetWalletsTouched===false&&bad.mainnetWalletsTouched===false&&
  good.realizedNetEconomicProfitVerified===false&&
  bad.realizedNetEconomicProfitVerified===false,'UNTRUSTED_REAL_MONEY_CLAIM');
 const goodLoan=u(good.observedPartnerIssuedLiNEARAtomic,'GOOD_LOAN'),
  badLoan=u(bad.observedPartnerIssuedLiNEARAtomic,'BAD_LOAN'),
  goodCost=u(good.observedPartnerAdditionalDebtPaymentAtomic,'GOOD_INTEREST'),
  badCost=u(bad.observedPartnerDebtDustBeforeAtomic,'BAD_INTEREST'),
  goodResidual=u(good.finalActorWalletResidualAtomic,'GOOD_RESIDUAL'),
  unpaid=u(bad.observedPartnerRemainingRheaDebtShares,'BAD_UNPAID_SHARES');
 assert(goodLoan>0n&&badLoan>goodLoan&&goodCost>0n&&badCost>0n&&
  goodResidual>0n&&unpaid>0n,'MISSING_REAL_FINANCING_OUTCOME');
 assert(u(good.observedLiquidatorToPartnerRepaymentAtomic,'GOOD_RETURN')===goodLoan&&
  u(bad.observedLiquidatorToPartnerRepaymentAtomic,'BAD_RETURN')===badLoan,
  'PRINCIPAL_DID_NOT_RETURN_IN_BOTH_RUNS');
 const smallGross=goodResidual+goodCost;
 // Compare borrower's true risk: same original source liquidation size.
 // A 2x generous surplus allowance ensures we don't overstate precision.
 const liabilityExceedsEvenDoubleGross=badCost>2n*smallGross;
 assert(liabilityExceedsEvenDoubleGross,'ECONOMIC_UNDERSUPPLY_NOT_ESTABLISHED');
 return {
  mode:'STAGE154_EMPIRICAL_SAME_BORROWER_CAPITAL_ADMISSION',
  network:'NEAR_SANDBOX',sourceBlock:good.sourceBlock,
  borrowerAccountId:good.borrowerAccountId,
  proofClass:'TWO_AUTHENTIC_LOCAL_RHEA_WORKSPACES_RECEIPT_RUNS',
  observedSolventPrincipalAtomic:goodLoan.toString(),
  observedSolventBorrowCostAtomic:goodCost.toString(),
  observedSolventActorResidualAtomic:goodResidual.toString(),
  observedSolventGrossSurplusBeforeLoanInterestAtomic:smallGross.toString(),
  observedInsolventPrincipalAtomic:badLoan.toString(),
  observedInsolventUnpaidFinancingDebtAtomic:badCost.toString(),
  observedInsolventRemainingBorrowShares:unpaid.toString(),
  evenDoubleSmallBorrowerProceedsInsufficient:liabilityExceedsEvenDoubleGross,
  observedSameBorrowerLargeLoanFundingAllowed:false,
  empiricalLargestDirectlyVerifiedFullyRepaidLoanAtomic:goodLoan.toString(),
  realTimeOraclePerformanceVerified:false,zeroCollateralFlashLenderVerified:false,
  realisticMainnetFinancingAvailabilityVerified:false,
  actualRealizedNetProfitVerified:false,
  maySignMainnet:false,mayBroadcastMainnet:false,
  status:'BLOCK_100_LINEAR_FINANCING_FOR_THIS_ORIGINAL_SMALL_BORROWER',
  unblockCondition:'INDEPENDENTLY_VERIFY_MUCH_LARGER_ELIGIBLE_LIQUIDATION_AND_TRUE_ALL_IN_NET',
  evidenceWarning:'10-token success and 100-token debt failure used historical clock compression; do not extrapolate to mainnet financial safety'
 };
}
if(process.argv[1]?.endsWith('stage154-capital-admission.mjs')){
 const [goodFile,badFile,target]=process.argv.slice(2);
 if(!goodFile||!badFile||!target||!/^stage154-[a-z0-9-]+\.json$/.test(target))
  throw Error('STAGE154_EXPECT_TWO_GENUINE_EVIDENCE_FILES_AND_OUTPUT');
 const result=stage154QualifyLargeFinance(
  JSON.parse(await readFile(goodFile,'utf8')),
  JSON.parse(await readFile(badFile,'utf8')));
 await writeFile(target,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({status:result.status,
  worstObservedUnpaidDebt:result.observedInsolventUnpaidFinancingDebtAtomic,
  mainnetSigningEnabled:result.maySignMainnet},null,2));
}

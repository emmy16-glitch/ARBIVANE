import test from 'node:test';
import assert from 'node:assert/strict';
import {stage154QualifyLargeFinance} from '../scripts/stage154-capital-admission.mjs';
const base={
 mode:'STAGE146_REAL_LOCAL_WORKSPACES_PARTNER_FINANCING_ATTEMPT',
 chain:'NEAR_SANDBOX',sourceBlock:'221683720',
 borrowerAccountId:'9345b3ac35a96e9c9efc6effa5ed50e92ff59a5b31e7b4f2d6f19400c3232899',
 partnerFundingClass:'SANDBOX_WNEAR_COLLATERAL_BACKED_RHEA_BORROW',
 stage150LargeFundingEnabled:true,stage150RemainingRheaSupplyReclaimed:true,
 maySignMainnet:false,mainnetWalletsTouched:false,realizedNetEconomicProfitVerified:false
};
const good=()=>({...base,
 status:'ACTUAL_LOCAL_PARTNER_FINANCED_RHEA_AND_FT_REPAYMENT_VERIFIED',
 phase:'FINISHED',observedPartnerRemainingRheaDebtShares:'0',
 partnerAccruedDebtDustClosed:true,actualOnchainLoanAndLiquidationVerified:true,
 observedPartnerIssuedLiNEARAtomic:'9999999999999999999999999',
 observedLiquidatorToPartnerRepaymentAtomic:'9999999999999999999999999',
 observedPartnerAdditionalDebtPaymentAtomic:'1910726860660',
 finalActorWalletResidualAtomic:'620478795205'});
const bad=()=>({...base,
 status:'LOCAL_NEAR_TRANSACTION_OR_EVIDENCE_BLOCKED',
 phase:'PARTNER_REPAY_RHEA_COLLATERALIZED_BORROW',
 observedPartnerRemainingRheaDebtShares:'24770797019503',
 partnerAccruedDebtDustClosed:false,actualOnchainLoanAndLiquidationVerified:false,
 observedPartnerIssuedLiNEARAtomic:'99999999999999999999999999',
 observedLiquidatorToPartnerRepaymentAtomic:'99999999999999999999999999',
 observedPartnerDebtDustBeforeAtomic:'24899422835948'});
test('Stage154 compares actual real Sandbox 10-vs-100 sizes and blocks oversize for fixed authentic borrower',()=>{
 const x=stage154QualifyLargeFinance(good(),bad());
 assert.equal(x.status,'BLOCK_100_LINEAR_FINANCING_FOR_THIS_ORIGINAL_SMALL_BORROWER');
 assert.equal(x.observedSolventBorrowCostAtomic,'1910726860660');
 assert.equal(x.observedSolventGrossSurplusBeforeLoanInterestAtomic,'2531205655865');
 assert.equal(x.observedInsolventUnpaidFinancingDebtAtomic,'24899422835948');
 assert.equal(x.evenDoubleSmallBorrowerProceedsInsufficient,true);
 assert.equal(x.observedSameBorrowerLargeLoanFundingAllowed,false);
 assert.equal(x.maySignMainnet,false);
 assert.equal(x.actualRealizedNetProfitVerified,false);
});
test('Stage154 cannot mix borrowers or relabel unpaid debt as profit',()=>{
 for(const mutate of [
  (g,b)=>{b.borrowerAccountId='fake.near';},
  (g,b)=>{g.partnerAccruedDebtDustClosed=false;},
  (g,b)=>{b.observedPartnerRemainingRheaDebtShares='0';},
  (g,b)=>{b.maySignMainnet=true;},
  (g,b)=>{g.realizedNetEconomicProfitVerified=true;},
  (g,b)=>{b.stage150RemainingRheaSupplyReclaimed=false;},
  (g,b)=>{b.observedLiquidatorToPartnerRepaymentAtomic='0';},
  (g,b)=>{b.observedPartnerDebtDustBeforeAtomic='1';},
  (g,b)=>{g.finalActorWalletResidualAtomic='0';},
  (g,b)=>{b.observedPartnerIssuedLiNEARAtomic='1';}
 ]){const g=good(),b=bad();mutate(g,b);
  assert.throws(()=>stage154QualifyLargeFinance(g,b),/STAGE154_/);
 }
});

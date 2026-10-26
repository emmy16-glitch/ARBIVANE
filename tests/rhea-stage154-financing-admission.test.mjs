import test from 'node:test';
import assert from 'node:assert/strict';
import {stage154AuditOriginalLoan,stage154ExtractActorWithdrawals}
 from '../scripts/stage154-real-funding-admission.mjs';
const hash=i=>String(i).repeat(43);
const source='stage146-liquidator.test.near';
const receipt=(i,callback)=>({
 transactionHash:hash(i),receiptIds:[hash(i+1)],
 finalExecutionStatus:'FINAL',receiptsWithoutFailure:2,
 [callback?'finalCallbackReceiptsVerified':'finalFtReceiptsVerified']:true
});
const base=(large=false)=>{
 const principal=large?'99999999999999999999999999':'9999999999999999999999999';
 const unused=large?'99999999998141509999718745':'9999999998141509750951193';
 const debt=large?'24899422835948':'1910726860628';
 const proofs={
  partnerBorrow:receipt(1,true),issue:receipt(2,false),
  supply:receipt(3,false),rheaLiquidate:receipt(4,true),
  stage150ReturnUnusedSupply:receipt(5,true),
  repayPartner:receipt(6,false),repayRhea:receipt(7,false)
 };
 const e={
  mode:'STAGE146_REAL_LOCAL_WORKSPACES_PARTNER_FINANCING_ATTEMPT',
  chain:'NEAR_SANDBOX',borrowerAccountId:'borrower.near',
  liquidatorAccountId:source,stage150LargeFundingEnabled:true,
  stage150RemainingRheaSupplyReclaimed:true,
  stage150BorrowedFtLargeAmountVerified:true,
  maySignMainnet:false,mayBroadcastMainnet:false,mainnetWalletsTouched:false,
  actualFlashLoan:false,realizedNetEconomicProfitVerified:false,
  observedPartnerToLiquidatorTransferAtomic:principal,
  observedLiquidatorDepositAtomic:principal,
  observedLiquidatorToPartnerRepaymentAtomic:principal,
  observedLiquidationDebtDecreaseShares:'1848889647386371',
  observedLiquidationCollateralDecreaseShares:'1860647237424468',
  stage150ActualReturnedUnusedSupplyAtomic:unused,
  observedPartnerDebtDustBeforeAtomic:debt,
  observedPartnerAdditionalDebtPaymentAtomic:large?'0':'1910726860660',
  observedPartnerRemainingRheaDebtShares:large?'24770797019503':'0',
  partnerAccruedDebtDustClosed:!large,
  status:large?'LOCAL_NEAR_TRANSACTION_OR_EVIDENCE_BLOCKED':
   'ACTUAL_LOCAL_PARTNER_FINANCED_RHEA_AND_FT_REPAYMENT_VERIFIED',
  phase:large?'PARTNER_REPAY_RHEA_COLLATERALIZED_BORROW':'FINISHED',
  finalActorWalletResidualAtomic:large?null:'620478795205',
  receiptProofs:proofs
 };
 const log=(a)=>'Receipt: '+hash(8)+'\n Log [contract.main.burrow.near]: EVENT_JSON:'+
  JSON.stringify({event:'withdraw_succeeded',data:[{
   token_id:'linear-protocol.near',account_id:source,amount:a
  }]})+'\n';
 return {e,log:log('1861021454704671')+log(unused)};
};
test('10 genuine-receipt-shaped local example has positive tiny Sandbox residue, NOT realized mainnet profit',()=>{
 const {e,log}=base();
 const r=stage154AuditOriginalLoan({evidence:e,log,sourceRunId:'40353279895'});
 assert.equal(r.status,'HISTORICAL_LOCAL_TOKENS_SUFFICIENT_AFTER_FINANCING');
 assert.equal(r.estimatedResidualAfterRheaDebtAtomic,'620478795237');
 assert.equal(r.observedPartnerRemainingDebtShares,'0');
 assert.equal(r.realizedNetEconomicProfitVerified,false);
 assert.equal(r.mayBroadcastMainnet,false);
});
test('100 genuine-receipt-shaped local example yields explicit economic deficit, never success',()=>{
 const {e,log}=base(true);
 const r=stage154AuditOriginalLoan({evidence:e,log,sourceRunId:'40354682373'});
 assert.equal(r.status,'BLOCKED_FINANCING_COST_EXCEEDS_SOURCE_LIQUIDATION');
 assert.equal(r.accruedRheaDebtAfterPrincipalAtomic,'24899422835948');
 assert.equal(r.estimatedResidualAfterRheaDebtAtomic,'-22367968412531');
 assert.equal(r.originalLocalEndToEndRepaid,false);
 assert.equal(r.financingEconomicallyCoveredByThisBorrower,false);
});
test('original receipt audit fails closed on spoofed wallet, token, missing original receipt, or inconsistent principal',()=>{
 const {e,log}=base();
 for(const mod of [
  x=>x.chain='NEAR_MAINNET',
  x=>x.maySignMainnet=true,
  x=>x.observedLiquidatorToPartnerRepaymentAtomic='1',
  x=>x.receiptProofs.repayRhea.finalFtReceiptsVerified=false,
  x=>x.receiptProofs.repayPartner.transactionHash=x.receiptProofs.issue.transactionHash,
  x=>x.observedLiquidationDebtDecreaseShares='0',
  x=>x.stage150RemainingRheaSupplyReclaimed=false
 ]){
  const v=structuredClone(e);mod(v);
  assert.throws(()=>stage154AuditOriginalLoan({
   evidence:v,log,sourceRunId:'40353279895'
  }),/STAGE154_/);
 }
 const wrong=log.replace('linear-protocol.near','wrap.near');
 assert.throws(()=>stage154ExtractActorWithdrawals(wrong,source),/STAGE154_/);
 assert.throws(()=>stage154ExtractActorWithdrawals(log.slice(0,80),source),/STAGE154_/);
});

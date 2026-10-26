import test from 'node:test';
import assert from 'node:assert/strict';
import {stage139AuditHistoricalCollateral,stage139ReviewFlashLiquidity} from '../scripts/stage139-flash-liquidity-admission.mjs';

const actualFunding={
 mode:'ARBIVANE_STAGE49E_VERIFIED_LOCAL_FINANCING',chain:'NEAR_SANDBOX',
 collateralFunding:{
  mode:'ARBIVANE_STAGE49_FUNDED_LOCAL_LIQUIDATOR',chain:'NEAR_SANDBOX',
  actorAccountId:'arbivane-replay.test.near',
  status:'SANDBOX_WNEAR_COLLATERAL_DEPOSITED_NOT_BORROW_HEALTH_PROOF',
  wrappedNativeSandboxYocto:'1000000000000000000000000',
  observedWrappedNearCollateralShares:'946259397775418264544034',
  observedWrappedNearCollateralInternal:'1000000000219494796919355',
  wrappedTokenConservationVerified:true
 },
 boundedCapacity:{actorCoveredByConservativeReference:true},
 borrowCapacity:{borrowAmountInternal:'1858490264605801'}
};
const settlement={
 mode:'ARBIVANE_STAGE41_SANDBOX_BALANCE_SETTLEMENT_WITNESS',chain:'NEAR_SANDBOX',
 status:'POSITION_AND_FT_DELTAS_OBSERVED_UNSOLD',
 borrowerAccountId:'9345b3ac35a96e9c9efc6effa5ed50e92ff59a5b31e7b4f2d6f19400c3232899',
 repayTokenId:'linear-protocol.near',actorOutstandingDebtBeforeInternal:'0',
 actorOutstandingDebtAfterInternal:'0',actorSeizeFtIncreaseAtomic:'2531190098868',
 callbackSuccessObserved:true,borrowerMutationVerified:true,assetTransferObserved:true
};
const proposal={
 mode:'RHEA_STAGE35_PINNED_SOURCE_ONLY_LIQUIDATION_SIZING',chain:'NEAR_MAINNET',
 borrowerAccountId:settlement.borrowerAccountId,
 repay:{tokenId:'linear-protocol.near',amountLendingInternalAtomic:'1858490264605801'}
};
test('Stage139 classifies the actual Stage93 Rhea Borrow as collateralized, NOT flash financing',()=>{
 const p=stage139AuditHistoricalCollateral(actualFunding,settlement,proposal);
 assert.equal(p.financingClass,'RHEA_OVER_COLLATERALIZED_BORROW');
 assert.equal(p.observedDepositedNativeSandboxYocto,'1000000000000000000000000');
 assert.equal(p.localSeizedFtIncreaseAtomic,'2531190098868');
 assert.equal(p.noCollateralFlashLoanDemonstrated,false);
 assert.equal(p.borrowerRepaidDebtAfterActualLocalLiquidation,true);
 assert.equal(p.mainnetSigningEnabled,false);
});
test('Stage139 refuses zero or tampered actual collateral evidence, even when actor debt finished at zero',()=>{
 const bad=structuredClone(actualFunding);bad.collateralFunding.wrappedNativeSandboxYocto='0';
 assert.throws(()=>stage139AuditHistoricalCollateral(bad,settlement,proposal),/STAGE139_NO_PROVEN_COLLATERAL_DEPOSIT/);
 const other=structuredClone(proposal);other.borrowerAccountId='wrong.near';
 assert.throws(()=>stage139AuditHistoricalCollateral(actualFunding,settlement,other),/STAGE139_UNTRUSTED_OR_CROSS_LINKED/);
 const altered=structuredClone(settlement);altered.actorOutstandingDebtAfterInternal='1';
 assert.throws(()=>stage139AuditHistoricalCollateral(actualFunding,altered,proposal),/STAGE139_NO_ZERO_DEBT_TOKEN_GAIN_SETTLEMENT/);
});
const draft={
 chain:'NEAR_MAINNET',lender:{accountId:'hypothetical.near',
  sourceRepositoryUrl:'https://github.com/unknown/unknown',loanEntrypoint:'flash_loan',
  implementationNetwork:'NEAR_NATIVE',receiptCallbackModel:'NEAR_ASYNC',
  loanAssetId:'linear-protocol.near',repaymentAssetId:'linear-protocol.near'},
 principalTokenAtomic:'100000',lenderFeeTokenAtomic:'100',
 minExecutionProceedsTokenAtomic:'105000',worstSlippageAndSwapFeesTokenAtomic:'1000',
 verifiedNetworkGasInLoanTokenAtomic:'100',verifiedStorageInLoanTokenAtomic:'50',
 minimumPositiveNetTokenAtomic:'500',executableTradeIsSameAsset:true,
 collateralRequiredYocto:'0',gasSponsor:{available:true,ownerApproved:true}
};
test('No hypothetical NEAR provider or positive net spread can authorize a live flash loan',()=>{
 const p=stage139ReviewFlashLiquidity(draft);
 assert.equal(p.projectedNetLoanTokenAtomic,'3750');
 assert.equal(p.status,'RESEARCH_ONLY_NOT_CAPITAL_FREE_EXECUTION');
 assert.equal(p.feasibleWithoutUserPrincipalDemonstrated,false);
 assert.equal(p.instantLoanRepaymentEnforcementVerified,false);
 assert.equal(p.maySignMainnet,false);assert.equal(p.mayBroadcastMainnet,false);
 assert.ok(p.blockers.includes('LIVE_NEAR_FLASH_LOAN_CONTRACT_NOT_INDEPENDENTLY_ATTESTED'));
 assert.ok(p.blockers.includes('ASYNC_REPAYMENT_AND_LENDER_RECOVERY_NOT_PROVEN_IN_SANDBOX'));
});
test('No gas sponsor, incomplete cost units, collateral demands or EVM lender all explicitly block',()=>{
 for(const mutate of [
  x=>x.lender.implementationNetwork='EVM_MAINNET',
  x=>x.collateralRequiredYocto='1',
  x=>x.gasSponsor.available=false,
  x=>x.minExecutionProceedsTokenAtomic='100000',
  x=>delete x.verifiedNetworkGasInLoanTokenAtomic,
  x=>x.lender.loanAssetId='wrap.near',
  x=>x.executableTradeIsSameAsset=false,
 ]){
  const x=structuredClone(draft);mutate(x);
  const p=stage139ReviewFlashLiquidity(x);
  assert.equal(p.maySignMainnet,false);
  assert.equal(p.feasibleWithoutUserPrincipalDemonstrated,false);
  assert.ok(p.blockers.length>=6);
 }
});

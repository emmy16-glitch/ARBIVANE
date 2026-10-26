/**
 * Stage139 — flash-liquidity source inspection; strictly offline / read only.
 *
 * A Rhea Borrow repaid in the same execute_with_pyth call is NOT a flash loan
 * if the caller first deposits collateral. NEAR cross-contract receipts do not
 * share EVM transaction-wide rollback semantics. A lender must independently
 * prove enforcement of its own repayment and recovery across asynchronous
 * promises; optimistic JSON flags cannot establish those semantics.
 *
 * This module deliberately contains no wallet, RPC mutation, signing or
 * broadcasting adapter. It never marks a route executable on mainnet.
 */
const UINT=/^(0|[1-9][0-9]{0,77})$/;
const ID=/^[a-z0-9][a-z0-9._-]{1,63}$/;
const cap=(v,reason,reasons)=>{
 if(typeof v!=='string'||!UINT.test(v)||BigInt(v)>(1n<<128n)-1n){
  reasons.push(reason);return 0n;
 }
 return BigInt(v);
};
const unique=r=>[...new Set(r)];
const inactive={chain:'NEAR_MAINNET',mainnetExecutionEnabled:false,
 maySignMainnet:false,mayBroadcastMainnet:false,
 ownerWallet:'okunlola_labs.near',
 proposedExecutor:'sillywiki4201.near',
 profitTransferredToOwner:false};
export function stage139AuditHistoricalCollateral(funding,settlement,proposal){
 const reasons=[];
 if(funding?.mode!=='ARBIVANE_STAGE49E_VERIFIED_LOCAL_FINANCING'||
  funding?.chain!=='NEAR_SANDBOX'||
  funding?.collateralFunding?.mode!=='ARBIVANE_STAGE49_FUNDED_LOCAL_LIQUIDATOR'||
  funding?.collateralFunding?.chain!=='NEAR_SANDBOX'||
  funding?.collateralFunding?.actorAccountId!=='arbivane-replay.test.near'||
  funding?.collateralFunding?.status!=='SANDBOX_WNEAR_COLLATERAL_DEPOSITED_NOT_BORROW_HEALTH_PROOF'||
  settlement?.mode!=='ARBIVANE_STAGE41_SANDBOX_BALANCE_SETTLEMENT_WITNESS'||
  settlement?.chain!=='NEAR_SANDBOX'||
  settlement?.status!=='POSITION_AND_FT_DELTAS_OBSERVED_UNSOLD'||
  proposal?.mode!=='RHEA_STAGE35_PINNED_SOURCE_ONLY_LIQUIDATION_SIZING'||
  proposal?.chain!=='NEAR_MAINNET'||
  proposal?.borrowerAccountId!==settlement?.borrowerAccountId||
  proposal?.repay?.tokenId!==settlement?.repayTokenId||
  proposal?.repay?.amountLendingInternalAtomic!==funding?.borrowCapacity?.borrowAmountInternal)
  reasons.push('UNTRUSTED_OR_CROSS_LINKED_SANDBOX_ARTIFACTS');
 const wrapped=cap(funding?.collateralFunding?.wrappedNativeSandboxYocto,
  'MISSING_ACTUAL_SANDBOX_COLLATERAL',reasons);
 const shares=cap(funding?.collateralFunding?.observedWrappedNearCollateralShares,
  'MISSING_OBSERVED_COLLATERAL_SHARES',reasons);
 const balance=cap(funding?.collateralFunding?.observedWrappedNearCollateralInternal,
  'MISSING_OBSERVED_COLLATERAL_BALANCE',reasons);
 const debtBefore=cap(settlement?.actorOutstandingDebtBeforeInternal,
  'INVALID_ACTOR_DEBT_BEFORE',reasons);
 const debtAfter=cap(settlement?.actorOutstandingDebtAfterInternal,
  'INVALID_ACTOR_DEBT_AFTER',reasons);
 const ftGain=cap(settlement?.actorSeizeFtIncreaseAtomic,'INVALID_SEIZED_FT_GAIN',reasons);
 if(funding?.collateralFunding?.wrappedTokenConservationVerified!==true||
  funding?.boundedCapacity?.actorCoveredByConservativeReference!==true||
  settlement?.callbackSuccessObserved!==true||
  settlement?.borrowerMutationVerified!==true||
  settlement?.assetTransferObserved!==true)
  reasons.push('LOCAL_FUNDING_OR_CALLBACK_GATES_NOT_CONFIRMED');
 if(wrapped===0n||balance===0n||shares===0n)
  reasons.push('NO_PROVEN_COLLATERAL_DEPOSIT');
 if(debtBefore!==0n||debtAfter!==0n||ftGain===0n)
  reasons.push('NO_ZERO_DEBT_TOKEN_GAIN_SETTLEMENT');
 if(reasons.length)throw Error('STAGE139_'+unique(reasons).join('_AND_'));
 return {
  mode:'STAGE139_AUTHENTIC_SANDBOX_FUNDING_CLASSIFICATION',
  chain:'NEAR_SANDBOX',
  financingClass:'RHEA_OVER_COLLATERALIZED_BORROW',
  borrowerAccountId:settlement.borrowerAccountId,
  collateralAsset:'wrap.near',borrowAsset:proposal.repay.tokenId,
  observedDepositedNativeSandboxYocto:wrapped.toString(),
  observedCollateralShares:shares.toString(),
  observedCollateralReferenceInternal:balance.toString(),
  localSeizedFtIncreaseAtomic:ftGain.toString(),
  residualActorDebtInternal:'0',
  noCollateralFlashLoanDemonstrated:false,
  nativeFlashLoanProviderVerified:false,
  borrowerRepaidDebtAfterActualLocalLiquidation:true,
  mainnetSigningEnabled:false,
  doesNotProveMainnetEconomicProfit:true
 };
}
export function stage139ReviewFlashLiquidity(request){
 const reasons=[];
 if(request?.chain!=='NEAR_MAINNET')reasons.push('ONLY_NEAR_MAINNET_RESEARCH_ALLOWED');
 const lender=request?.lender??{};
 if(!ID.test(lender?.accountId??'')||
  typeof lender?.sourceRepositoryUrl!=='string'||
  !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/.test(lender.sourceRepositoryUrl)||
  !ID.test(lender?.loanEntrypoint??''))
  reasons.push('NO_VERIFIABLE_NATIVE_PROVIDER_IDENTITY_AND_SOURCE');
 if(lender?.implementationNetwork!=='NEAR_NATIVE')
  reasons.push('EVM_OR_CROSSCHAIN_PROVIDER_NOT_ATOMIC_WITH_RHEA');
 if(lender?.receiptCallbackModel!=='NEAR_ASYNC')
  reasons.push('NEAR_ASYNC_CALLBACK_ABI_UNCONFIRMED');
 if(lender?.loanAssetId!=='linear-protocol.near'||
  lender?.repaymentAssetId!=='linear-protocol.near')
  reasons.push('PROVIDER_DOES_NOT_SUPPORT_STUDIED_LINEAR_ROUTE');
 const requested=cap(request?.principalTokenAtomic,'INVALID_FLASH_PRINCIPAL',reasons);
 const fee=cap(request?.lenderFeeTokenAtomic,'INVALID_LENDER_FEE',reasons);
 const result=cap(request?.minExecutionProceedsTokenAtomic,
  'INVALID_EXECUTABLE_PROCEEDS',reasons);
 const swap=cap(request?.worstSlippageAndSwapFeesTokenAtomic,
  'INVALID_SWAP_AND_SLIPPAGE',reasons);
 const network=cap(request?.verifiedNetworkGasInLoanTokenAtomic,
  'MISSING_GAS_PRICE_CONVERSION_TO_TOKEN',reasons);
 const storage=cap(request?.verifiedStorageInLoanTokenAtomic,
  'MISSING_STORAGE_PRICE_CONVERSION_TO_TOKEN',reasons);
 const minNet=cap(request?.minimumPositiveNetTokenAtomic,
  'INVALID_MINIMUM_POSITIVE_NET',reasons);
 if(requested===0n||minNet===0n)reasons.push('NO_POSITIVE_REQUEST_AND_PROFIT_FLOOR');
 if(result<requested+fee+swap+network+storage+minNet)
  reasons.push('NEGATIVE_OR_INSUFFICIENT_PROPOSED_NET_RETURN');
 if(request?.executableTradeIsSameAsset!==true)
  reasons.push('CROSS_ASSET_SWAP_MUST_BE_PROVED');
 if(request?.collateralRequiredYocto!=='0')
  reasons.push('COLLATERAL_REQUIRED_NOT_CAPITAL_FREE');
 if(request?.gasSponsor?.available!==true||
  request?.gasSponsor?.ownerApproved!==true)
  reasons.push('GAS_SPONSORSHIP_NOT_PROVEN');
 // Never turn user-supplied JSON booleans into proof of WASM bytecode,
 // token transfers or NEAR promise failure compensation. Next phase must
 // produce independent receipt evidence from a real provider and Sandbox.
 reasons.push('LIVE_NEAR_FLASH_LOAN_CONTRACT_NOT_INDEPENDENTLY_ATTESTED');
 reasons.push('ASYNC_REPAYMENT_AND_LENDER_RECOVERY_NOT_PROVEN_IN_SANDBOX');
 reasons.push('PROVIDER_TOKEN_LIQUIDITY_AND_CALLBACK_GAS_UNVERIFIED');
 reasons.push('FULL_FINANCED_LIQUIDATION_AND_ATOMIC_REPAYMENT_NOT_EXECUTED');
 reasons.push('OWNER_WALLET_APPROVAL_AND_RESTRICTED_CUSTODY_MISSING');
 const projected=result-requested-fee-swap-network-storage;
 return {...inactive,
  mode:'STAGE139_NEAR_FLASH_LIQUIDITY_RESEARCH_ADMISSION',
  status:'RESEARCH_ONLY_NOT_CAPITAL_FREE_EXECUTION',
  assessedFinancingType:'UNVERIFIED_EXTERNAL_FLASH_LOAN',
  requestedPrincipalAtomic:requested.toString(),
  projectedNetLoanTokenAtomic:projected.toString(),
  feasibleWithoutUserPrincipalDemonstrated:false,
  instantLoanRepaymentEnforcementVerified:false,
  flashLenderTokenLiquidityVerified:false,
  gasSponsorshipVerified:false,
  riskFreeExecutionGuaranteed:false,
  reviewed:true,
  blockers:unique(reasons)};
}

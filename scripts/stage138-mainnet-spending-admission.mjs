/** Stage138: fail-closed, read-only mainnet operator spending admission.
 * This is a risk-policy PREVIEW, not a signer/broadcaster. A successful local
 * Sandbox liquidation cannot authorize a mainnet transfer or trade.
 * All NEAR-equivalent comparisons require a separately verified LIVE quote;
 * caller-supplied booleans/quotes are NOT cryptographic attestations.
 */
const id=/^[a-z0-9][a-z0-9._-]{1,63}$/;
const uint=x=>typeof x==='string'&&/^(0|[1-9][0-9]{0,76})$/.test(x);
const value=(x,reason,failures)=>{
 if(!uint(x)){failures.push(reason);return 0n;}
 return BigInt(x);
};
export function stage138MainnetSpendingAdmission(input,{nowMs=Date.now()}={}){
 const reasons=[];
 const p=input?.policy??{},candidate=input?.candidate??{},quote=input?.quote??{},wallet=input?.wallet??{};
 if(input?.network!=='NEAR_MAINNET')reasons.push('NETWORK_NOT_EXPLICIT_MAINNET');
 if(!id.test(wallet.accountId??'')||wallet.accountId==='arbivane-replay.test.near')
  reasons.push('REAL_FUNDED_WALLET_NOT_SELECTED');
 if(typeof wallet.authorizedOwnerPublicKey!=='string'||!wallet.authorizedOwnerPublicKey.startsWith('ed25519:'))
  reasons.push('OWNER_PUBLIC_KEY_MISSING');
 // Missing limits ALWAYS fail: there are no invented/default expenditure caps.
 const maxPerTrade=value(p.maxPerTradeYocto,'MISSING_MAX_PER_TRADE',reasons);
 const maxDailySpend=value(p.maxDailySpendYocto,'MISSING_MAX_DAILY_SPEND',reasons);
 const maxLoss=value(p.maxLossYocto,'MISSING_MAX_LOSS',reasons);
 const minProfit=value(p.minRealizedNetProfitYocto,'MISSING_MIN_NET_PROFIT',reasons);
 const requiredCapital=value(candidate.requiredCapitalYocto,'MISSING_REQUIRED_CAPITAL',reasons);
 const currentDailySpend=value(candidate.alreadySpentTodayYocto,'MISSING_DAILY_EXPOSURE',reasons);
 const worstLoss=value(candidate.worstCaseLossYocto,'MISSING_WORST_LOSS',reasons);
 const quotedProceeds=value(quote.expectedSettlementProceedsYocto,'MISSING_SETTLEMENT_PROCEEDS',reasons);
 const funding=value(quote.fundingCostYocto,'MISSING_FUNDING_COST',reasons);
 const swap=value(quote.swapAndSlippageCostYocto,'MISSING_SWAP_SLIPPAGE',reasons);
 const gas=value(quote.gasCostYocto,'MISSING_GAS_COST',reasons);
 const storage=value(quote.storageCostYocto,'MISSING_STORAGE_COST',reasons);
 if(maxPerTrade===0n||maxDailySpend===0n||maxLoss===0n||minProfit===0n)
  reasons.push('ZERO_OR_MISSING_OPERATOR_LIMITS');
 if(requiredCapital===0n||requiredCapital>maxPerTrade||
  currentDailySpend+requiredCapital>maxDailySpend)
  reasons.push('SPEND_LIMIT_EXCEEDED');
 if(worstLoss===0n||worstLoss>maxLoss)
  reasons.push('LOSS_LIMIT_EXCEEDED');
 if(quote.unit!=='NEAR_YOCTO_EQUIVALENT_USING_VERIFIED_LIVE_QUOTES')
  reasons.push('INCOMPATIBLE_ASSET_VALUATION_UNIT');
 const cost=funding+swap+gas+storage;
 const forecast=quotedProceeds-cost;
 if(quotedProceeds===0n||forecast<minProfit||forecast<=0n)
  reasons.push('NONPOSITIVE_OR_UNVERIFIED_NET_PROFIT');
 if(!Number.isSafeInteger(nowMs)||nowMs<1||
  !Number.isSafeInteger(quote.observedAtMs)||quote.observedAtMs>nowMs||
  nowMs-quote.observedAtMs>15000||
  !Number.isSafeInteger(quote.expiresAtMs)||quote.expiresAtMs<=nowMs)
  reasons.push('EXPIRED_OR_MISSING_LIVE_QUOTE');
 if(!id.test(candidate.borrowerAccountId??'')||
  candidate.borrowerAccountId===wallet.accountId||
  candidate.lendingContractId!=='contract.main.burrow.near')
  reasons.push('UNTRUSTED_LIQUIDATION_ROUTE');
 if(candidate.currentMainnetEligibilityVerified!==true||
  candidate.currentMainnetOracleVerified!==true||
  candidate.mainnetVaultCapacityVerified!==true||
  candidate.currentSourceWasmCodeHashMatches!==true)
  reasons.push('CURRENT_MAINNET_ELIGIBILITY_UNATTESTED');
 if(candidate.finalizedSandboxAccountingMatchesCurrentWasm!==true)
  reasons.push('CURRENT_WASM_SANDBOX_PARITY_UNATTESTED');
 if(quote.externalSwapFillGuaranteed!==true||
  quote.gasAndStorageIncluded!==true||
  quote.competingLiquidatorsRiskBounded!==true)
  reasons.push('REAL_EXECUTION_COSTS_OR_FILL_UNATTESTED');
 // Never allow a flag from JSON to substitute for authorized account
 // access-key verification and an operator-approved signed transaction.
 reasons.push('CHAIN_ACCESS_KEY_AND_SIGNED_OWNER_APPROVAL_UNVERIFIED');
 reasons.push('MAINNET_SIGNER_BROADCASTER_NOT_IMPLEMENTED_OR_AUDITED');
 return {
  mode:'STAGE138_MAINNET_CAPITAL_POLICY_PREVIEW',
  network:'NEAR_MAINNET',
  requestedByOperator:true,
  reviewInputsPassExceptUnimplementedGates:reasons.length===2,
  admissibleForActualMainnetBroadcast:false,
  maySignMainnet:false,mayBroadcastMainnet:false,mainnetExecutionEnabled:false,
  projectedNetYoctoEquivalent:forecast.toString(),
  issues:[...new Set(reasons)],
  noPrivateKeysInRepository:true,
 };
}

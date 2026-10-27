/** Stage171: fail-closed *research/Sandbox* ceilings from the dashboard.
 * No mainnet signing, no evidence that source paper gross is realized net PNL.
 * The financing limit is NOT a borrowed/received token balance.
 */
const MONEY=/^(?:0|[1-9][0-9]{0,8})(?:\.[0-9]{1,2})?$/;
const UINT=/^(0|[1-9][0-9]*)$/;
const E27=10n**27n;
export function stage171UsdE27(value,label,{allowZero=false}={}){
 if(typeof value!=='string'||!MONEY.test(value))
  throw Error('STAGE171_INVALID_'+label);
 const [whole,cent='']=value.split('.');
 const usd=(BigInt(whole)*100n)+BigInt(cent.padEnd(2,'0'));
 if(!allowZero&&usd===0n)throw Error('STAGE171_INVALID_'+label);
 return usd*E27/100n;
}
export function stage171VerifyDashboardSourceBudget(proposal,{
 maxFinancingUsd,minimumNetProfitUsd
}){
 if(!proposal||proposal.mode!=='RHEA_STAGE35_PINNED_SOURCE_ONLY_LIQUIDATION_SIZING'||
  proposal.chain!=='NEAR_MAINNET'||proposal.referenceRulesPass!==true||
  proposal.executionEnabled!==false||proposal.mayBroadcast!==false)
  throw Error('STAGE171_UNTRUSTED_SOURCE_PROPOSAL');
 const max=stage171UsdE27(maxFinancingUsd,'MAX_FINANCING');
 const min=stage171UsdE27(minimumNetProfitUsd,'MINIMUM_NET_TARGET',{allowZero:true});
 const repay=proposal.repay?.referenceUsdE27,gross=proposal.paperGrossUsdE27;
 if(typeof repay!=='string'||!UINT.test(repay)||BigInt(repay)===0n||
  typeof gross!=='string'||!UINT.test(gross))
  throw Error('STAGE171_SOURCE_USD_AMOUNT_UNAVAILABLE');
 if(BigInt(repay)>max)throw Error('STAGE171_SOURCE_REPAY_EXCEEDS_FINANCING_CAP');
 // Paper gross is only a necessary precondition for positive net economics,
 // NEVER sufficient evidence of realized profit or a funded flash-loan route.
 if(BigInt(gross)<min)throw Error('STAGE171_SOURCE_GROSS_BELOW_MINIMUM_NET_TARGET');
 return {
  mode:'ARBIVANE_STAGE171_SANDBOX_BUDGET_ADMISSION',
  status:'SOURCE_BUDGET_CAP_PASS_NOT_ECONOMIC_PROOF',
  maxFinancingUsdE27:max.toString(),minimumNetProfitTargetUsdE27:min.toString(),
  sourceRepayUsdE27:repay,sourcePaperGrossUsdE27:gross,
  realizedNetProfitVerified:false,flashFinancingVerified:false,
  executionEnabled:false,maySignMainnet:false,mayBroadcastMainnet:false,
 };
}

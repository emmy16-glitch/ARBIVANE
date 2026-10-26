/** Stage157: source-proven larger liquidation admission, NOT a larger loan.
 * Historical registry selects accounts for CURRENT read-only rechecks only.
 * Historical presence/diversity is NOT proof of debt size or liquidation risk.
 */
export const PREVIOUS_REPAY_INTERNAL_ATOMIC=1858490264605801n;
const uint=x=>typeof x==='string'&&/^(0|[1-9][0-9]*)$/.test(x);
export function stage157SelectHistoricalLiNearBorrowers(source,{batch=0,shard=0,perShard=12}={}){
 if(source?.mode!=='RHEA_COMPLETE_PAGED_INDEX_ATTESTATION'||
  source?.status!=='COMPLETE_DEBT_INDEX_READ_ONLY'||
  source?.chain!=='NEAR_MAINNET'||source?.completeSnapshot!==true||
  source?.zeroSchemaErrors!==true||source?.debtAccounts!==7801||
  source?.findings?.length!==7801||
  !Number.isSafeInteger(batch)||batch<0||batch>3||
  !Number.isSafeInteger(shard)||shard<0||shard>3||
  perShard!==12)throw Error('STAGE157_UNTRUSTED_HISTORICAL_SOURCE_OR_WINDOW');
 const eligible=source.findings.flatMap((finding,index)=>{
  const legs=finding?.positions?.flatMap(p=>p?.debtAssetIds??[])??[];
  if(!Array.isArray(legs)||!legs.every(x=>typeof x==='string')||
   typeof finding?.accountId!=='string'||finding.accountId.length<2)
   throw Error('STAGE157_BAD_REGISTRY_ACCOUNT_SHAPE');
  if(index===2579||!legs.includes('linear-protocol.near'))return [];
  return [{accountId:finding.accountId,index,previouslyRecordedDistinctDebtAssets:new Set(legs).size}];
 }).sort((a,b)=>b.previouslyRecordedDistinctDebtAssets-a.previouslyRecordedDistinctDebtAssets||
  a.index-b.index);
 const offset=(batch*4+shard)*perShard;
 return {sourceBlockHeight:source.blockHeight,sourceDebtAccounts:source.debtAccounts,
  totalHistoricalLiNearCandidates:eligible.length,
  batch,shard,start:offset,candidates:eligible.slice(offset,offset+perShard),
  selectionIsHistoricalNotCurrentRisk:true};
}
export function stage157AdmitSourceLargerLiquidation(evidence,accountId){
 const basic=evidence?.mode==='RHEA_STAGE35_PINNED_SOURCE_ONLY_LIQUIDATION_SIZING'&&
  evidence?.chain==='NEAR_MAINNET'&&evidence?.borrowerAccountId===accountId&&
  evidence?.status==='PAPER_SCENARIOS_FOUND_NOT_EXECUTABLE'&&
  evidence?.referenceRulesPass===true&&evidence?.executionEnabled===false&&
  evidence?.maySign===false&&evidence?.mayBroadcast===false&&
  evidence?.gasAndSwapNetProfitVerified===false&&
  evidence?.repay?.tokenId==='linear-protocol.near'&&
  evidence?.seize?.tokenId==='linear-protocol.near'&&
  uint(evidence?.repay?.amountLendingInternalAtomic)&&
  uint(evidence?.seize?.amountLendingInternalAtomic)&&
  uint(evidence?.paperGrossUsdE27);
 if(!basic)return {qualified:false,reason:'SOURCE_RULE_OR_DENOMINATION_NOT_VERIFIED'};
 // Stage160: any strictly positive, source-sized liquidation is research
 // eligible; Rhea reference rules and the actual Sandbox settlement still
 // decide whether it can repay financing. No arbitrary 10x minimum.
 if(BigInt(evidence.repay.amountLendingInternalAtomic)<=0n||
  BigInt(evidence.paperGrossUsdE27)<=0n)
  return {qualified:false,reason:'NO_POSITIVE_SOURCE_REPAYMENT_OR_GROSS'};
 if(BigInt(evidence.seize.amountLendingInternalAtomic)<=
    BigInt(evidence.repay.amountLendingInternalAtomic))
  return {qualified:false,reason:'NO_POSITIVE_SAME_TOKEN_REMAINDER'};
 return {qualified:true,reason:'CURRENT_SOURCE_POSITIVE_LIQUIDATION_SANDBOX_ONLY',
  repayLendingInternalAtomic:evidence.repay.amountLendingInternalAtomic,
  historicalReferenceRepayLendingInternalAtomic:PREVIOUS_REPAY_INTERNAL_ATOMIC.toString(),
  paperGrossUsdE27:evidence.paperGrossUsdE27,
  realWorldNetProfitVerified:false,permissionToTradeMainnet:false};
}

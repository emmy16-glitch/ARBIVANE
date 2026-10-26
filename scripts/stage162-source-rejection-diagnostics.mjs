/** Stage162: preserve safe, structured rejection evidence from the genuine
 * read-only Stage35/Pyth source pass. Never promote a rejected source into a
 * liquidation plan. No raw provider errors or URLs enter public artifacts.
 */
const STATUSES=new Set([
 'PAPER_SCENARIOS_FOUND_NOT_EXECUTABLE','NO_SAFE_SOURCE_SCENARIO','NO_CURRENT_REFERENCE_RISK',
]);
const TOKEN=/^[a-z0-9._-]{2,64}$/;
const CODE=/^[A-Z][A-Z0-9_]{2,110}$/;
export function stage162DescribeSource(candidate,admission){
 const status=STATUSES.has(candidate?.status)?candidate.status:'UNTRUSTED_SOURCE_STATUS';
 const sourceSizingBlockers=Array.isArray(candidate?.blockers)?
  [...new Set(candidate.blockers.filter(v=>typeof v==='string'&&CODE.test(v)))].slice(0,8):[];
 const rToken=TOKEN.test(candidate?.repay?.tokenId??'')?candidate.repay.tokenId:null;
 const sToken=TOKEN.test(candidate?.seize?.tokenId??'')?candidate.seize.tokenId:null;
 const pairs=Number.isSafeInteger(candidate?.consideredPairs)&&candidate.consideredPairs>=0?
  candidate.consideredPairs:null;
 let reason=admission?.reason??'SOURCE_RULE_OR_DENOMINATION_NOT_VERIFIED';
 if(admission?.qualified===true)reason='CURRENT_SOURCE_POSITIVE_LIQUIDATION_SANDBOX_ONLY';
 else if(status==='NO_CURRENT_REFERENCE_RISK')reason='CURRENT_BORROWER_NOT_AT_RISK';
 else if(status==='NO_SAFE_SOURCE_SCENARIO')
  reason=sourceSizingBlockers[0]??'NO_SOURCE_RULE_PASSING_SCENARIO';
 else if(status==='PAPER_SCENARIOS_FOUND_NOT_EXECUTABLE'&&
  (rToken!=='linear-protocol.near'||sToken!=='linear-protocol.near'))
  reason='POSITIVE_SOURCE_UNSUPPORTED_SANDBOX_ASSET_ROUTE';
 return {reason,sourceSizingStatus:status,sourceSizingBlockers,consideredPairs:pairs,
  referenceRepayTokenId:rToken,referenceSeizeTokenId:sToken};
}
export function stage162RejectionSummary(rows){
 const count=(values)=>Object.fromEntries([...new Set(values)].sort()
  .map(code=>[code,values.filter(x=>x===code).length]));
 return {sourceRejectionCounts:count(rows.flatMap(x=>x.reasons??[])),
  sourceSizingStatusCounts:count(rows.map(x=>x.sourceSizingStatus??'FRESH_READ_BLOCKED')),
  sourcePairCount:rows.reduce((n,x)=>n+(x.consideredPairs??0),0)};
}

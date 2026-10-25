/** Stage104: distinguish elapsed-time Rhea interest accrual from storage drift.
 * Only verifies a restricted, non-exact economic replay inside NEAR Sandbox.
 * Never invent, patch or silently normalize source amounts.
 */
const UINT=/^(0|[1-9][0-9]{0,38})$/;
const ORDERED=new Set(['supplied','collateral','borrowed','farms','rewards']);
const MAX_NS_DELTA=3n*60n*60n*1000000000n;
const stable=v=>JSON.stringify(v);
function canon(v,field=''){
 if(Array.isArray(v)){
  const rows=v.map(x=>canon(x));
  if(ORDERED.has(field))
   rows.sort((a,b)=>stable(a)<stable(b)?-1:stable(a)>stable(b)?1:0);
  return rows;
 }
 if(v&&typeof v==='object'){
  const isAsset=typeof v.token_id==='string'&&Object.hasOwn(v,'shares');
  const result={};
  for(const k of Object.keys(v).sort()){
   // A share-bearing borrower entry derives balance/APR from the pool.
   if(isAsset&&(k==='balance'||k==='apr'))continue;
   result[k]=canon(v[k],k);
  }
  return result;
 }
 return v;
}
const validNumber=x=>typeof x==='string'&&UINT.test(x);
const monotone=(before,after)=>validNumber(before)&&validNumber(after)&&BigInt(after)>=BigInt(before);
function marketCheck(source,observed){
 if(!Array.isArray(source)||!Array.isArray(observed)||
  source.length<1||source.length>512||observed.length!==source.length)
  return 'MARKET_COLLECTION_NOT_VERIFIABLE';
 const indexed=new Map();
 for(const row of observed){
  if(!Array.isArray(row)||row.length!==2||typeof row[0]!=='string'||
   indexed.has(row[0])||!row[1]||typeof row[1]!=='object'||Array.isArray(row[1]))
   return 'MARKET_COLLECTION_NOT_VERIFIABLE';
  indexed.set(row[0],row[1]);
 }
 let clockAdvanced=false;
 for(const row of source){
  if(!Array.isArray(row)||row.length!==2||typeof row[0]!=='string'||
   !indexed.has(row[0])||!row[1]||typeof row[1]!=='object'||Array.isArray(row[1]))
   return 'MARKET_ASSET_IDENTITY_DRIFT';
  const a=row[1],b=indexed.get(row[0]);
  // Any unrecognized top-level field must still match EXACTLY.
  const fixed=o=>Object.fromEntries(Object.entries(o).filter(([k])=>
   !['supplied','borrowed','reserved','last_update_timestamp'].includes(k)));
  if(stable(canon(fixed(a)))!==stable(canon(fixed(b))))
   return 'MARKET_NON_ACCRUAL_STATE_DRIFT';
  for(const name of ['supplied','borrowed']){
   const poolA=a[name],poolB=b[name];
   if(!poolA||!poolB||typeof poolA!=='object'||typeof poolB!=='object'||
    poolA.shares!==poolB.shares||!validNumber(poolA.shares)||
    !monotone(poolA.balance,poolB.balance))
    return 'MARKET_POOL_SHARES_OR_BALANCES_DRIFT';
   // Pool extensions are never silently waived.
   const exceptBalance=o=>Object.fromEntries(Object.entries(o).filter(([k])=>k!=='balance'));
   if(stable(canon(exceptBalance(poolA)))!==stable(canon(exceptBalance(poolB))))
    return 'MARKET_POOL_NON_ACCRUAL_STATE_DRIFT';
  }
  if(!monotone(a.reserved,b.reserved))
   return 'MARKET_RESERVED_DRIFT';
  if(!validNumber(a.last_update_timestamp)||!validNumber(b.last_update_timestamp))
   return 'MARKET_INVALID_ACCRUAL_CLOCK';
  const older=BigInt(a.last_update_timestamp),newer=BigInt(b.last_update_timestamp);
  if(newer<older||newer-older>MAX_NS_DELTA)
   return 'MARKET_UNBOUNDED_OR_BACKWARD_ACCRUAL_CLOCK';
  clockAdvanced ||= newer>older;
 }
 return clockAdvanced?'BOUNDED_TEMPORAL_ACCRUAL_ONLY':'NO_TEMPORAL_ADVANCE_TO_EXPLAIN_DRIFT';
}
/** Return safe classifier ONLY. No borrower IDs, amounts or timestamps. */
export function stage104AttestTemporalAccrual({sourceBorrower,sandboxBorrower,sourceAssets,sandboxAssets}){
 const result={verified:false,class:'UNVERIFIED_TEMPORAL_PARITY',fullHistoricalViewParity:false,
  maySignMainnet:false,mayBroadcastMainnet:false,actualRheaSettlementVerified:false};
 try{
  if(!sourceBorrower||!sandboxBorrower||typeof sourceBorrower!=='object'||
   typeof sandboxBorrower!=='object'||Array.isArray(sourceBorrower)||Array.isArray(sandboxBorrower))
   return {...result,class:'BORROWER_VIEW_INVALID'};
  if(stable(canon(sourceBorrower))!==stable(canon(sandboxBorrower)))
   return {...result,class:'BORROWER_SHARES_OR_NON_ACCRUAL_STATE_DRIFT'};
  const classification=marketCheck(sourceAssets,sandboxAssets);
  if(classification!=='BOUNDED_TEMPORAL_ACCRUAL_ONLY')
   return {...result,class:classification};
  return {...result,verified:true,class:'BOUNDED_SOURCE_BACKED_TEMPORAL_ACCRUAL_ONLY'};
 }catch{return {...result,class:'TEMPORAL_PARITY_VERIFICATION_FAILED'};}
}

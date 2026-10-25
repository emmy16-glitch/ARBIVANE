/** Stage104: distinguish elapsed-time Rhea interest accrual from storage drift.
 * Only verifies a restricted, non-exact economic replay inside NEAR Sandbox.
 * Never invent, patch or silently normalize source amounts.
 */
import {createHash} from 'node:crypto';
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
// Stage106: never publish raw market values, account IDs, token IDs, endpoints
// or even untrusted JSON field names. Hash only bounded names of fields that
// must remain exact and visibly differ. This is evidence, NOT a bypass.
const STAGE106_ACCRUAL_FIELDS=new Set([
 'supplied','borrowed','reserved','last_update_timestamp','beneficiary_fees'
]);
function stage106SafeFieldDiff(a,b){
 const shape=v=>v===undefined?'ABSENT':v===null?'NULL':
  Array.isArray(v)?'ARRAY':typeof v==='object'?'OBJECT':
  typeof v==='string'?'STRING':typeof v==='number'?'NUMBER':'OTHER';
 const differing=[];
 for(const key of new Set([...Object.keys(a),...Object.keys(b)])){
  if(STAGE106_ACCRUAL_FIELDS.has(key))continue;
  if(stable(canon(a[key]))===stable(canon(b[key])))continue;
  differing.push({
   fieldNameSha256:createHash('sha256').update('STAGE106_MARKET_FIELD:'+key).digest('hex'),
   sourceShape:shape(a[key]),sandboxShape:shape(b[key]),
   changeKind:Object.hasOwn(a,key)&&Object.hasOwn(b,key)?'VALUE_DIFFERENT':'PRESENCE_DIFFERENT',
  });
  if(differing.length===16)break;
 }
 return differing.sort((x,y)=>x.fieldNameSha256.localeCompare(y.fieldNameSha256));
}
// Stage107: beneficiary_fees are interest-linked on Rhea assets. Admit only
// authentic, bounded and monotone fee accrual for identical beneficiary IDs.
// An unrecognized field, fee reversal, new beneficiary, or excess accrual
// remains a hard block before any Sandbox funding/liquidation.
function stage107VerifiedBeneficiaryFees(before,after,borrowedBefore,borrowedAfter){
 if(before===undefined&&after===undefined)return true;
 const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
 if(!plain(before)||!plain(after)||
  !monotone(borrowedBefore,borrowedAfter))return false;
 const names=Object.keys(before),other=Object.keys(after);
 if(names.length>128||names.length!==other.length||
  names.some(k=>!Object.hasOwn(after,k)||!/^[a-z0-9._-]{2,64}$/.test(k)))
  return false;
 let accrued=0n;
 for(const id of names){
  const old=before[id],now=after[id];
  if(!monotone(old,now))return false;
  accrued+=BigInt(now)-BigInt(old);
 }
 // Beneficiary-fee growth cannot exceed the gross lending interest accrued.
 return accrued<=BigInt(borrowedAfter)-BigInt(borrowedBefore);
}
function marketCheck(source,observed,diagnostic){
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
   !['supplied','borrowed','reserved','last_update_timestamp','beneficiary_fees'].includes(k)));
  if(stable(canon(fixed(a)))!==stable(canon(fixed(b)))){
   diagnostic.stage106FieldDiffFingerprints=stage106SafeFieldDiff(a,b);
   return 'MARKET_NON_ACCRUAL_STATE_DRIFT';
  }
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
  if(!stage107VerifiedBeneficiaryFees(
    a.beneficiary_fees,b.beneficiary_fees,
    a.borrowed.balance,b.borrowed.balance))
   return 'MARKET_BENEFICIARY_FEE_ACCOUNTING_DRIFT';
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
  const diagnostic={};
  const classification=marketCheck(sourceAssets,sandboxAssets,diagnostic);
  if(classification!=='BOUNDED_TEMPORAL_ACCRUAL_ONLY')
   return {...result,class:classification,...diagnostic};
  return {...result,verified:true,class:'BOUNDED_SOURCE_BACKED_TEMPORAL_ACCRUAL_ONLY'};
 }catch{return {...result,class:'TEMPORAL_PARITY_VERIFICATION_FAILED'};}
}

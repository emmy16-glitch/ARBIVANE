import {createHash} from 'node:crypto';
import {StateResponseTooLarge} from './stage45-prefix-state.mjs';
/** Enumerate pinned NEAR view_state through limit + after_key_base64.
 * Unlike prefix partitioning, it includes empty and exact-prefix storage keys.
 * Exhausted server cursor is NOT an independently attested trie-root proof.
 */
const BASE64=/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
function decode(x){
 if(typeof x!=='string'||!BASE64.test(x)||x.length>10000000)
  throw Error('STAGE45_CURSOR_INVALID_BASE64');
 const b=Buffer.from(x,'base64');
 if(b.toString('base64')!==x)throw Error('STAGE45_CURSOR_NONCANONICAL_BASE64');
 return b;
}
const bounded=(v,min,max)=>Number.isSafeInteger(v)&&typeof v==='number'&&v>=min&&v<=max;
export async function coverPinnedPagedState(read,o,emit){
 if(!bounded(o.blockHeight,1,Number.MAX_SAFE_INTEGER)||
  !bounded(o.maxQueries,1,20000)||!bounded(o.maxRecords,1,5000000)||
  !bounded(o.maxBytes,1024,1024*1024*1024)||!bounded(o.pageSize,1,2048))
  throw Error('STAGE45_INVALID_PAGE_BUDGET');
 const hash=createHash('sha256');
 let cursor=null,blockHash=null,pages=0,tries=0,records=0,bytes=0;
 let downsizedPages=0,lastKey=null,currentSize=o.pageSize,lastSeen=null;
 for(;;){
  if(++tries>o.maxQueries)throw Error('STAGE45_PAGE_QUERY_BUDGET_EXHAUSTED');
  let page;
  try{page=await read(cursor,currentSize);}
  catch(e){
   if(!(e instanceof StateResponseTooLarge))throw e;
   if(currentSize===1)throw Error('STAGE45_INDIVIDUAL_STORAGE_ENTRY_EXCEEDS_RPC_LIMIT');
   currentSize=Math.max(1,Math.floor(currentSize/2));
   downsizedPages++;continue;
  }
  if(!page||page.blockHeight!==String(o.blockHeight)||
   typeof page.blockHash!=='string'||
   !/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(page.blockHash)||
   (blockHash!==null&&blockHash!==page.blockHash)||
   !Array.isArray(page.values)||page.values.length>currentSize)
   throw Error('STAGE45_PAGED_CROSS_BLOCK_OR_BAD_SHAPE');
  blockHash=page.blockHash;
  const hasCursor=page.lastKey!==null&&page.lastKey!==undefined;
  if(hasCursor&&typeof page.lastKey!=='string')
   throw Error('STAGE45_BAD_CONTINUATION_CURSOR');
  const rows=[];
  for(const item of page.values){
   if(!item||typeof item!=='object')throw Error('STAGE45_BAD_PAGED_RECORD');
   const key=decode(item.key),value=decode(item.value);
   if(lastSeen!==null&&Buffer.compare(key,lastSeen)<=0)
    throw Error('STAGE45_NONINCREASING_OR_DUPLICATE_STORAGE_KEY');
   lastSeen=key;
   if(++records>o.maxRecords)throw Error('STAGE45_STORAGE_RECORD_BUDGET_EXHAUSTED');
   bytes+=key.length+value.length;
   if(bytes>o.maxBytes)throw Error('STAGE45_STORAGE_BYTE_BUDGET_EXHAUSTED');
   const length=Buffer.allocUnsafe(8);
   length.writeUInt32BE(key.length,0);length.writeUInt32BE(value.length,4);
   hash.update(length);hash.update(key);hash.update(value);
   rows.push(item);
  }
  if(hasCursor){
   if(!page.values.length||lastSeen===null||
    !decode(page.lastKey).equals(lastSeen))
    throw Error('STAGE45_CONTINUATION_DOES_NOT_MATCH_LAST_STORAGE_KEY');
   if(cursor!==null&&Buffer.compare(decode(page.lastKey),decode(cursor))<=0)
    throw Error('STAGE45_NONADVANCING_CURSOR');
  }
  // A previously oversized individual entry may be recovered from a
  // different archive. Resume normal bounded page sizes AFTER that one
  // record rather than crawling all remaining state at one key per call.
  if(page.recoveredOversizedEntry===true){
   if(currentSize!==1||rows.length!==1)
    throw Error('STAGE77_INVALID_SINGLE_ENTRY_RECOVERY');
   currentSize=o.pageSize;
  }
  await emit(rows);pages++;
  if(!hasCursor)break;
  lastKey=page.lastKey;cursor=page.lastKey;
 }
 if(blockHash===null)throw Error('STAGE45_MISSING_PAGED_SOURCE_BLOCK');
 return {
  mode:'ARBIVANE_STAGE45_CURSOR_PAGED_STATE_COVERAGE',chain:'NEAR_MAINNET',
  blockHeight:String(o.blockHeight),blockHash,
  status:'PROVIDER_PAGINATION_CURSOR_EXHAUSTED',
  queryCount:tries,completedPages:pages,downsizedPages,
  initialPageSize:o.pageSize,finalPageSize:currentSize,
  records,rawKeyAndValueBytes:bytes,recordStreamSha256:hash.digest('hex'),
  completePaginationCoverage:true,
  unresolvedExactBoundaryPrefixCount:0,finalContinuationCursor:lastKey,
 };
}


import { createHash } from 'node:crypto';
/** Stage45 disjoint archival prefix enumeration at ONE pinned block.
 * Oversized view_state responses split to 256 one-byte child prefixes.
 * CRITICAL: a split prefix cannot prove absence of a key EXACTLY that prefix.
 */
export class StateResponseTooLarge extends Error {
 constructor() { super('STAGE45_VIEW_STATE_RESPONSE_TOO_LARGE'); }
}
const bounded=(v,min,max)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const BASE64=/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
function decode(x){
 if(typeof x!=='string'||!BASE64.test(x)||x.length>10000000)
  throw Error('STAGE45_BAD_BASE64_STORAGE_RECORD');
 const b=Buffer.from(x,'base64');
 if(b.toString('base64')!==x)throw Error('STAGE45_NONCANONICAL_BASE64_STORAGE_RECORD');
 return b;
}
/**
 * read(prefixBuffer): {blockHeight:string,blockHash:string,values:[{key,value}]}.
 * emit(records): asynchronously persist batches before applying any Sandbox patch.
 * A successful partition traversal is not cryptographic trie-root parity.
 */
export async function coverPinnedContractState(read,o,emit){
 if(!bounded(o.blockHeight,1,Number.MAX_SAFE_INTEGER)||
  !bounded(o.maxQueries,1,20000)||!bounded(o.maxRecords,1,5000000)||
  !bounded(o.maxBytes,1024,1024*1024*1024)||
  !bounded(o.maxDepth,1,8)||!bounded(o.maxLeafRecords,1,20000))
  throw Error('STAGE45_INVALID_PREFIX_BUDGET');
 const sha=createHash('sha256'),seen=new Set();
 let queryCount=0,subdividedPrefixes=0,leafPrefixes=0;
 let maxDepthObserved=0,records=0,bytes=0,blockHash=null;
 async function visit(prefix){
  if(++queryCount>o.maxQueries)throw Error('STAGE45_PREFIX_QUERY_BUDGET_EXHAUSTED');
  maxDepthObserved=Math.max(maxDepthObserved,prefix.length);
  let result;
  try{result=await read(prefix);}
  catch(e){
   if(!(e instanceof StateResponseTooLarge))throw e;
   if(prefix.length>=o.maxDepth)throw Error('STAGE45_PREFIX_STILL_OVERSIZE_AT_MAX_DEPTH');
   subdividedPrefixes++;
   for(let b=0;b<256;b++)await visit(Buffer.concat([prefix,Buffer.from([b])]));
   return;
  }
  if(!result||typeof result!=='object'||result.blockHeight!==String(o.blockHeight)||
   typeof result.blockHash!=='string'||
   !/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(result.blockHash)||
   (blockHash!==null&&blockHash!==result.blockHash)||
   !Array.isArray(result.values)||result.values.length>o.maxLeafRecords)
   throw Error('STAGE45_CROSS_BLOCK_OR_UNTRUSTED_STATE_CHUNK');
  blockHash=result.blockHash;
  const unique=[];
  for(const raw of result.values){
   if(!raw||typeof raw!=='object')throw Error('STAGE45_BAD_STORAGE_ROW');
   const key=decode(raw.key),value=decode(raw.value);
   if(!key.subarray(0,prefix.length).equals(prefix))throw Error('STAGE45_PREFIX_MISMATCH');
   const id=key.toString('hex');
   if(seen.has(id))throw Error('STAGE45_DUPLICATE_STATE_KEY');
   if(++records>o.maxRecords)throw Error('STAGE45_STORAGE_RECORD_BUDGET_EXHAUSTED');
   bytes+=key.length+value.length;
   if(bytes>o.maxBytes)throw Error('STAGE45_STORAGE_BYTE_BUDGET_EXHAUSTED');
   seen.add(id);unique.push({key,value,raw});
  }
  unique.sort((a,b)=>Buffer.compare(a.key,b.key));
  for(const entry of unique){
   const length=Buffer.allocUnsafe(8);
   length.writeUInt32BE(entry.key.length,0);
   length.writeUInt32BE(entry.value.length,4);
   sha.update(length);sha.update(entry.key);sha.update(entry.value);
  }
  await emit(unique.map(x=>x.raw));
  leafPrefixes++;
 }
 await visit(Buffer.alloc(0));
 if(blockHash===null)throw Error('STAGE45_NO_STATE_BLOCK_WITNESS');
 return {
  mode:'ARBIVANE_STAGE45_BOUNDED_STATE_PREFIX_COVERAGE',chain:'NEAR_MAINNET',
  blockHeight:String(o.blockHeight),blockHash,
  status:subdividedPrefixes===0?'ROOT_STATE_RESPONSE_COMPLETE':
   'PARTITIONED_PREFIX_READ_BOUNDARY_KEYS_UNPROVEN',
  queryCount,subdividedPrefixes,leafPrefixes,maxDepthObserved,
  records,rawKeyAndValueBytes:bytes,recordStreamSha256:sha.digest('hex'),
  completePrefixCoverage:subdividedPrefixes===0,
  unresolvedExactBoundaryPrefixCount:subdividedPrefixes,
 };
}

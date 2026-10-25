/** Stage82: replay one source-authenticated Rhea borrower in a disposable
 * Workspaces Sandbox without importing every lending account. Contract
 * storage layout: Burrow StorageKey + near-sdk 4.x legacy collections.
 * Partial storage is NEVER asserted as full-market or trie-root parity.
 */
import {createHash} from 'node:crypto';
import {ArchivalStateRpc} from './stage45-archival-state-rpc.mjs';
import {StateResponseTooLarge} from './stage45-prefix-state.mjs';
import {validateStage80IndependentArchive} from './stage46-paged-sandbox-clone.mjs';
const ID=/^[a-z0-9._-]{2,64}$/;
const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const raw=(...a)=>Buffer.concat(a.map(x=>Buffer.from(x)));
function borshString(s){
 const data=Buffer.from(s),size=Buffer.alloc(4);
 size.writeUInt32LE(data.length);return raw(size,data);
}
function u64(n){const b=Buffer.alloc(8);b.writeBigUInt64LE(n);return b;}
const assetKey=(prefix,id)=>raw([prefix],borshString(id));
function decode(row){
 if(typeof row?.key!=='string'||typeof row?.value!=='string')
  throw Error('STAGE82_INVALID_SOURCE_RECORD');
 const key=Buffer.from(row.key,'base64'),value=Buffer.from(row.value,'base64');
 if(key.toString('base64')!==row.key||value.toString('base64')!==row.value)
  throw Error('STAGE82_NONCANONICAL_BASE64');
 return {key,value};
}
/** Fetch EXACT borrower keys and shared market families from one pinned
 * source block. No dummy positions, invented accounts, skipped records or
 * mainnet writes. Post-import Rhea views are verified by the caller.
 */
export async function cloneStage82BorrowerLending({
 root,rpc,endpoint,contractId='contract.main.burrow.near',
 blockHeight,expectedCodeHash,borrowerAccountId,assetIds,
 fallbackEndpoint='https://archival-rpc.mainnet.near.org',
 fetcher=fetch,budgets={}
}){
 if(!root||typeof root.importContract!=='function'||!rpc||
  typeof rpc.viewAccount!=='function'||!ID.test(contractId)||
  typeof borrowerAccountId!=='string'||!ID.test(borrowerAccountId)||
  !Number.isSafeInteger(blockHeight)||blockHeight<1||
  typeof expectedCodeHash!=='string'||!HASH.test(expectedCodeHash)||
  !Array.isArray(assetIds)||assetIds.length<1||assetIds.length>512||
  new Set(assetIds).size!==assetIds.length||
  assetIds.some(x=>typeof x!=='string'||!ID.test(x)))
  throw Error('STAGE82_UNTRUSTED_BORROWER_CLONE_CONFIGURATION');
 validateStage80IndependentArchive(endpoint,fallbackEndpoint);
 const o={maxQueries:budgets.maxQueries??750,
  maxRecords:budgets.maxRecords??10000,maxBytes:budgets.maxBytes??16777216,
  maxPatchBytes:budgets.maxPatchBytes??48000,
  maxPatchRecords:budgets.maxPatchRecords??128};
 if(Object.values(o).some(x=>!Number.isSafeInteger(x)||x<1)||
  o.maxQueries>2000||o.maxRecords>50000||o.maxBytes>67108864||
  o.maxPatchBytes>64000||o.maxPatchRecords>250)
  throw Error('STAGE82_INVALID_IMPORT_BUDGET');
 const account=await rpc.viewAccount(contractId,blockHeight);
 if(account?.blockHeight!==String(blockHeight)||account.codeHash!==expectedCodeHash)
  throw Error('STAGE82_SOURCE_CODE_OR_BLOCK_DRIFT');
 const source=new ArchivalStateRpc({endpoint,accountId:contractId,blockHeight,
  maxRetries:2,paceMs:budgets.paceMs??220,timeoutMs:18000},fetcher);
 const secondary=new ArchivalStateRpc({endpoint:fallbackEndpoint,
  accountId:contractId,blockHeight,maxRetries:0,paceMs:4000,timeoutMs:18000},fetcher);
 let pinnedHash=null,queries=0,bytes=0,alternateReads=0;
 const stored=new Map();
 async function page(prefix,afterKey,limit){
  if(++queries>o.maxQueries)throw Error('STAGE82_SOURCE_QUERY_BUDGET_EXHAUSTED');
  let result;
  try{result=await source.viewState(prefix,afterKey,limit);}
  catch(e){
   if(!(e instanceof StateResponseTooLarge)||limit!==1)throw e;
   result=await secondary.viewState(prefix,afterKey,1);
   // A provider that cannot return the oversized record is NOT a completed
   // page. A zero-row success must never silently skip a source key.
   if(!Array.isArray(result?.values)||result.values.length!==1)
    throw Error('STAGE83_ALTERNATE_OVERSIZED_RECORD_NOT_RETURNED');
   result={...result,recoveredOversizedEntry:true};
   alternateReads++;
  }
  if(result.blockHeight!==String(blockHeight)||!HASH.test(result.blockHash)||
   (pinnedHash!==null&&pinnedHash!==result.blockHash)||
   !Array.isArray(result.values)||result.values.length>limit)
   throw Error('STAGE82_PINNED_BLOCK_OR_RPC_PAGE_MISMATCH');
  pinnedHash=result.blockHash;return result;
 }
 function remember(r,prefix){
  const {key,value}=decode(r);
  if(!key.subarray(0,prefix.length).equals(prefix))
   throw Error('STAGE82_STORAGE_KEY_OUTSIDE_PREFIX');
  const k=key.toString('base64');
  if(stored.has(k))throw Error('STAGE82_DUPLICATE_SOURCE_STORAGE_KEY');
  bytes+=key.length+value.length;
  if(stored.size>=o.maxRecords||bytes>o.maxBytes)
   throw Error('STAGE82_BOUNDED_SOURCE_BYTES_EXCEEDED');
  stored.set(k,{key:k,value:r.value});return {key,value};
 }
 async function exact(key){
  const result=await page(key,null,1);
  if(result.values.length!==1)throw Error('STAGE82_REQUIRED_SOURCE_KEY_MISSING');
  const row=remember(result.values[0],key);
  if(!row.key.equals(key))throw Error('STAGE82_REQUIRED_SOURCE_KEY_INEXACT');
  return row.value;
 }
 async function scan(prefix){
  let cursor=null,last=null,size=64;
  for(;;){
   let result;
   try{result=await page(prefix,cursor,size);}
   catch(e){
    if(!(e instanceof StateResponseTooLarge))throw e;
    if(size===1)throw Error('STAGE82_SINGLE_SOURCE_STORAGE_TOO_LARGE');
    size=Math.max(1,Math.floor(size/2));continue;
   }
   if(result.recoveredOversizedEntry===true){
    if(size!==1||result.values.length!==1)
     throw Error('STAGE83_INVALID_ONE_ENTRY_ARCHIVE_RECOVERY');
    // Recover one large record, not the entire remainder at limit=1.
    size=64;
   }
   for(const item of result.values){
    const row=remember(item,prefix);
    if(last!==null&&Buffer.compare(row.key,last)<=0)
     throw Error('STAGE82_NONADVANCING_SOURCE_KEYS');
    last=row.key;
   }
   if(result.lastKey===null)break;
   if(last===null||result.lastKey!==last.toString('base64')||
    (cursor!==null&&Buffer.compare(last,Buffer.from(cursor,'base64'))<=0))
    throw Error('STAGE82_UNTRUSTED_PAGINATION_CURSOR');
   cursor=result.lastKey;
  }
 }
 // The contract state ("STATE") carries original map length and prefixes.
 // near-sdk UnorderedMap: [0,'i']+Borsh(account) -> u64 index;
 // [0,'k'/'v']+index -> encoded key/value. Storage LookupMap is prefix 3.
 await exact(Buffer.from('STATE'));
 const accountKey=borshString(borrowerAccountId);
 const rawIndex=await exact(raw([0,105],accountKey));
 if(rawIndex.length!==8)throw Error('STAGE82_INVALID_BORROWER_INDEX');
 const index=rawIndex.readBigUInt64LE();
 const storedKey=await exact(raw([0,107],u64(index)));
 if(!storedKey.equals(accountKey))
  throw Error('STAGE82_BORROWER_VECTOR_KEY_MISMATCH');
 await exact(raw([0,118],u64(index)));
 await exact(assetKey(3,borrowerAccountId));
 // Shared asset index, per-market pool records and affected farm metadata.
 await scan(Buffer.from([7]));
 for(const assetId of assetIds)await exact(assetKey(4,assetId));
 await scan(Buffer.from([5]));
 await scan(Buffer.from([6]));
 await exact(Buffer.from([8]));
 const contract=await root.importContract({
  mainnetContract:contractId,blockId:blockHeight,withData:false});
 if(typeof contract?.patchStateRecords!=='function'||
  typeof contract.accountView!=='function')
  throw Error('STAGE82_LOCAL_SANDBOX_PATCH_UNAVAILABLE');
 if((await contract.accountView())?.code_hash!==expectedCodeHash)
  throw Error('STAGE82_IMPORTED_CODE_HASH_MISMATCH');
 const sorted=[...stored.values()].sort((a,b)=>Buffer.compare(
  Buffer.from(a.key,'base64'),Buffer.from(b.key,'base64')));
 const digest=createHash('sha256');
 let batch=[],batchBytes=0,patched=0,patchWrites=0;
 async function flush(){
  if(!batch.length)return;
  await contract.patchStateRecords({records:batch});
  patched+=batch.length;patchWrites++;batch=[];batchBytes=0;
 }
 for(const record of sorted){
  const item={Data:{account_id:contractId,
   data_key:record.key,value:record.value}};
  const size=Buffer.byteLength(JSON.stringify(item));
  if(size>o.maxPatchBytes)
   throw Error('STAGE82_SOURCE_RECORD_EXCEEDS_LOCAL_PATCH_LIMIT');
  if(batch.length>=o.maxPatchRecords||batchBytes+size>o.maxPatchBytes)
   await flush();
  batch.push(item);batchBytes+=size;
  const k=Buffer.from(record.key,'base64'),v=Buffer.from(record.value,'base64');
  const l=Buffer.alloc(8);l.writeUInt32BE(k.length,0);l.writeUInt32BE(v.length,4);
  digest.update(l);digest.update(k);digest.update(v);
 }
 await flush();
 if(patched!==stored.size)throw Error('STAGE82_INCOMPLETE_STATE_PATCH');
 return {contract,evidence:{
  mode:'STAGE82_PINNED_ONE_BORROWER_MARKET_CLOSURE',
  contractId,borrowerAccountId,blockHeight:String(blockHeight),
  sourceCodeHash:expectedCodeHash,sourceBlockHash:pinnedHash,
  borrowerIndex:index.toString(),sourceQueryCount:queries,
  sourceBytes:bytes,recordsRead:stored.size,recordsPatched:patched,
  patchWriteCalls:patchWrites,alternateSingleRecordReads:alternateReads,
  sourceStorageDigest:digest.digest('hex'),
  partialSourceClosure:true,fullMarketImported:false,
  providerPaginationExhausted:false,completeTrieRootParityVerified:false,
  borrowerAndMarketViewParityVerified:false,
  verifiedLiquidationReceipts:false,mainnetMutated:false,
 }};
}

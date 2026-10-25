/** Stage46: stateful, pinned Rhea dependency clone, solely into local NEAR Sandbox.
 * The archival endpoint is read-only; no mainnet signer or mutation is supported.
 * The provider's exhausted cursor is NOT independent proof of trie-root parity.
 */
import {coverPinnedPagedState} from './stage45-cursor-pages.mjs';
import {ArchivalStateRpc} from './stage45-archival-state-rpc.mjs';
import {StateResponseTooLarge} from './stage45-prefix-state.mjs';

const ID=/^[a-z0-9._-]{2,64}$/;
const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const bounded=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
/** No mainnet private key, no writes and never trust a second RPC origin by
 * textual URL equality: https://host and https://host/ are identical.
 * Deployment-owned RPC URLs may include a query token, never log that URL.
 */
export function validateStage79ArchivalFallback(endpoint,fallbackEndpoint){
 let primary,other;
 try{primary=new URL(endpoint);other=new URL(fallbackEndpoint);}
 catch{throw Error('STAGE46_INVALID_LOCAL_CLONE_CONFIGURATION');}
 const host=other.hostname.toLowerCase();
 if(other.protocol!=='https:'||other.username||other.password||other.hash||
  !host||host==='localhost'||host==='[::1]'||host.endsWith('.local')||
  /^(?:127\.|10\.|0\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)/.test(host)||
  other.port||other.origin===primary.origin||
  typeof fallbackEndpoint!=='string'||fallbackEndpoint.length>2048)
  throw Error('STAGE46_INVALID_LOCAL_CLONE_CONFIGURATION');
 return fallbackEndpoint;
}

export async function clonePinnedContractWithState({
 root,rpc,endpoint,contractId,blockHeight,expectedCodeHash=null,
 fallbackEndpoint='https://archival-rpc.mainnet.near.org',
 fetcher=fetch,onProgress=()=>{},budgets={}
}){
 if(!root||typeof root.importContract!=='function'||!rpc||
  typeof rpc.viewAccount!=='function'||!ID.test(contractId)||
  !bounded(blockHeight,1,Number.MAX_SAFE_INTEGER)||
  typeof endpoint!=='string'||new URL(endpoint).protocol!=='https:'||
  (expectedCodeHash!==null&&!HASH.test(expectedCodeHash)))
  throw Error('STAGE46_INVALID_LOCAL_CLONE_CONFIGURATION');
 validateStage79ArchivalFallback(endpoint,fallbackEndpoint);
 const o={
  maxQueries:budgets.maxQueries??1536,
  maxRecords:budgets.maxRecords??180000,
  maxBytes:budgets.maxBytes??134217728,
  pageSize:budgets.pageSize??128,
  maxPatchBytes:budgets.maxPatchBytes??48000,
  maxPatchRecords:budgets.maxPatchRecords??128,
 };
 if(!bounded(o.maxPatchBytes,1024,64000)||!bounded(o.maxPatchRecords,1,250))
  throw Error('STAGE46_INVALID_SANDBOX_PATCH_BUDGET');
 const remote=await rpc.viewAccount(contractId,blockHeight);
 if(remote.blockHeight!==String(blockHeight)||!HASH.test(remote.codeHash)||
  (expectedCodeHash!==null&&remote.codeHash!==expectedCodeHash))
  throw Error('STAGE46_SOURCE_ACCOUNT_CODE_OR_BLOCK_MISMATCH');
 const clone=await root.importContract({
  mainnetContract:contractId,blockId:blockHeight,withData:false
 });
 if(!clone||typeof clone.patchStateRecords!=='function'||
  typeof clone.accountView!=='function')
  throw Error('STAGE46_SANDBOX_PATCH_API_MISSING');
 const localAccount=await clone.accountView();
 if(localAccount.code_hash!==remote.codeHash)
  throw Error('STAGE46_CLONED_WASM_CODE_HASH_MISMATCH');
 const archive=new ArchivalStateRpc({
  endpoint,accountId:contractId,blockHeight,
  paceMs:budgets.paceMs??220,timeoutMs:18000,maxRetries:2
 },fetcher);
 // Keep a bounded patch batch across authenticated source RPC pages.
 // Source-block parity, cursor coverage and end-to-end receipt checks remain mandatory.
 // The default NEAR.org archive is deprecated and severely rate-limited.
 // Prefer a configured higher-limit archival provider for a single oversized
 // record. Both endpoints must still return the exact pinned block and keys.
 // Every alternate reply is checked by Stage45 against the exact pinned
 // source block height, hash and globally ordered storage keys.
 const fallbackArchival=new ArchivalStateRpc({
  endpoint:fallbackEndpoint,
  accountId:contractId,blockHeight,paceMs:4000,timeoutMs:18000,maxRetries:0,
 },fetcher);
 let alternateSingleEntryReads=0,alternateFailures=0;
 let patched=0,patchWrites=0,batch=[],batchBytes=0;
 async function flush(){
  if(!batch.length)return;
  await clone.patchStateRecords({records:batch});
  patched+=batch.length;patchWrites++;
  batch=[];batchBytes=0;
  onProgress({contractId,patched,patchWrites,complete:false});
 }
 const coverage=await coverPinnedPagedState(
  async(cursor,limit)=>{
   try{return await archive.viewPage(cursor,limit);}
   catch(error){
    if(!(error instanceof StateResponseTooLarge)||limit!==1)throw error;
    // Primary has exhausted adaptive paging down to one full raw record.
    // A distinct, known archival node can sometimes serve a larger record.
    // Do NOT skip, truncate or synthesize the source storage record.
    try{
     const page=await fallbackArchival.viewPage(cursor,1);
     alternateSingleEntryReads++;
     return {...page,recoveredOversizedEntry:true};
    }catch{
     alternateFailures++;
     throw Error('STAGE77_NO_ARCHIVAL_PROVIDER_CAN_READ_PINNED_STORAGE_ENTRY');
    }
   }
  },
  {blockHeight,maxQueries:o.maxQueries,maxRecords:o.maxRecords,
   maxBytes:o.maxBytes,pageSize:o.pageSize},
  async rows=>{
   for(const row of rows){
    const entry={Data:{account_id:contractId,data_key:row.key,value:row.value}};
    const bytes=Buffer.byteLength(JSON.stringify(entry));
    if(bytes>o.maxPatchBytes)throw Error('STAGE46_INDIVIDUAL_STORAGE_KEY_EXCEEDS_PATCH_LIMIT');
    if(batch.length>=o.maxPatchRecords||batchBytes+bytes>o.maxPatchBytes)
     await flush();
    batch.push(entry);batchBytes+=bytes;
   }
  }
 );
 // Finish a bounded trailing batch only once the source cursor is exhausted.
 if(coverage.completePaginationCoverage!==true)
  throw Error('STAGE46_INCOMPLETE_PINNED_SANDBOX_CLONE');
 await flush();
 if(patched!==coverage.records)
  throw Error('STAGE46_INCOMPLETE_PINNED_SANDBOX_CLONE');
 onProgress({contractId,patched,patchWrites,complete:true});
 return {
  contract:clone,
  evidence:{
   contractId,blockHeight:String(blockHeight),sourceCodeHash:remote.codeHash,
   sourceBlockHash:coverage.blockHash,
   providerPaginationExhausted:true,recordsRead:coverage.records,
   recordsPatched:patched,patchWriteCalls:patchWrites,
   sourcePageCount:coverage.completedPages,
   sourceRpcAttempts:archive.getStats().transportAttempts,
   alternateSingleEntryReads,alternateFailures,
   alternateRpcAttempts:fallbackArchival.getStats().transportAttempts,
   sourceStorageDigest:coverage.recordStreamSha256,
   completeTrieRootParityVerified:false,mainnetMutated:false,
  }
 };
}

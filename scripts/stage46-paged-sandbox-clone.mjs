/** Stage46: stateful, pinned Rhea dependency clone, solely into local NEAR Sandbox.
 * The archival endpoint is read-only; no mainnet signer or mutation is supported.
 * The provider's exhausted cursor is NOT independent proof of trie-root parity.
 */
import {coverPinnedPagedState} from './stage45-cursor-pages.mjs';
import {ArchivalStateRpc} from './stage45-archival-state-rpc.mjs';

const ID=/^[a-z0-9._-]{2,64}$/;
const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const bounded=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;

export async function clonePinnedContractWithState({
 root,rpc,endpoint,contractId,blockHeight,expectedCodeHash=null,
 fetcher=fetch,onProgress=()=>{},budgets={}
}){
 if(!root||typeof root.importContract!=='function'||!rpc||
  typeof rpc.viewAccount!=='function'||!ID.test(contractId)||
  !bounded(blockHeight,1,Number.MAX_SAFE_INTEGER)||
  typeof endpoint!=='string'||new URL(endpoint).protocol!=='https:'||
  (expectedCodeHash!==null&&!HASH.test(expectedCodeHash)))
  throw Error('STAGE46_INVALID_LOCAL_CLONE_CONFIGURATION');
 const o={
  maxQueries:budgets.maxQueries??1536,
  maxRecords:budgets.maxRecords??180000,
  maxBytes:budgets.maxBytes??134217728,
  pageSize:budgets.pageSize??128,
  maxPatchBytes:budgets.maxPatchBytes??32000,
  maxPatchRecords:budgets.maxPatchRecords??50,
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
 let patched=0,batch=[],batchBytes=0;
 async function flush(){
  if(!batch.length)return;
  await clone.patchStateRecords({records:batch});
  patched+=batch.length;
  batch=[];batchBytes=0;
  onProgress({contractId,patched,complete:false});
 }
 const coverage=await coverPinnedPagedState(
  (cursor,limit)=>archive.viewPage(cursor,limit),
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
   await flush();
  }
 );
 if(coverage.completePaginationCoverage!==true||patched!==coverage.records)
  throw Error('STAGE46_INCOMPLETE_PINNED_SANDBOX_CLONE');
 onProgress({contractId,patched,complete:true});
 return {
  contract:clone,
  evidence:{
   contractId,blockHeight:String(blockHeight),sourceCodeHash:remote.codeHash,
   sourceBlockHash:coverage.blockHash,
   providerPaginationExhausted:true,recordsRead:coverage.records,
   recordsPatched:patched,sourceStorageDigest:coverage.recordStreamSha256,
   completeTrieRootParityVerified:false,mainnetMutated:false,
  }
 };
}

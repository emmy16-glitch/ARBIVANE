/** Stage85 — patch source-authenticated NEAR Data keys ONLY into local Sandbox.
 * Ordinary entries use small bounded batches; intact oversized entries are
 * isolated singleton patches. Never cut, transform or invent source bytes.
 */
const ID=/^[a-z0-9._-]{2,64}$/;
const bounded=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const BASE64=/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
function canonical(data){
 return typeof data==='string'&&data.length<=3000000&&
  BASE64.test(data)&&Buffer.from(data,'base64').toString('base64')===data;
}
export async function patchStage85AuthenticatedData({
 contract,accountId,rows,maxPatchBytes=32000,maxPatchRecords=50,
 maxSinglePatchBytes=2097152,onProgress=()=>{}
}){
 if(!contract||typeof contract.patchStateRecords!=='function'||
  !ID.test(accountId)||!rows||typeof rows[Symbol.asyncIterator]!=='function'||
  !bounded(maxPatchBytes,1024,64000)||
  !bounded(maxPatchRecords,1,250)||
  !bounded(maxSinglePatchBytes,maxPatchBytes,2097152)||
  typeof onProgress!=='function')
  throw Error('STAGE85_INVALID_SANDBOX_PATCH_CONFIGURATION');
 let pending=[],pendingBytes=0,recordsPatched=0,patchWriteCalls=0,
  largeSingleRecordPatchCalls=0,largestPatchRecordBytes=0;
 async function apply(records,large){
  // NEAR Workspaces patchStateRecords mutates the disposable Sandbox only.
  // Increment counters only once the SDK confirms this patch returned.
  await contract.patchStateRecords({records});
  recordsPatched+=records.length;patchWriteCalls++;
  if(large)largeSingleRecordPatchCalls++;
  onProgress({recordsPatched,patchWriteCalls,largeSingleRecordPatchCalls,
   largestPatchRecordBytes});
 }
 async function flush(){
  if(!pending.length)return;
  await apply(pending,false);
  pending=[];pendingBytes=0;
 }
 for await(const row of rows){
  if(!row||!canonical(row.key)||!canonical(row.value))
   throw Error('STAGE85_INVALID_AUTHENTICATED_SOURCE_RECORD');
  const data={Data:{account_id:accountId,data_key:row.key,value:row.value}};
  const bytes=Buffer.byteLength(JSON.stringify(data));
  if(bytes>maxSinglePatchBytes)
   throw Error('STAGE85_INDIVIDUAL_SOURCE_RECORD_EXCEEDS_SINGLETON_LIMIT');
  largestPatchRecordBytes=Math.max(largestPatchRecordBytes,bytes);
  if(bytes>maxPatchBytes){
   await flush();
   await apply([data],true);
   continue;
  }
  if(pending.length>=maxPatchRecords||pendingBytes+bytes>maxPatchBytes)
   await flush();
  pending.push(data);pendingBytes+=bytes;
 }
 await flush();
 return {recordsPatched,patchWriteCalls,largeSingleRecordPatchCalls,
  largestPatchRecordBytes,mainnetMutated:false};
}

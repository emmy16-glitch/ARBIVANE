/** Stage91: exact, source-pinned LiNEAR indexed-account closure.
 * Audited layout: linear-protocol/LiNEAR contracts/linear/src/lib.rs uses
 * legacy near_sdk::collections::UnorderedMap, Accounts=first StorageKey.
 * Every indexed key is copied verbatim; no account value is synthesized.
 * Deliberately incomplete market import, not a liquidation receipt.
 */
import {createHash} from 'node:crypto';
import {ArchivalStateRpc} from './stage45-archival-state-rpc.mjs';
import {StateResponseTooLarge} from './stage45-prefix-state.mjs';
import {validateStage80IndependentArchive} from './stage46-paged-sandbox-clone.mjs';
import {NearReadOnlyRpc} from '../src/rhea/rpc.ts';
import {PacedNearReadOnlyRpc} from '../src/rhea/paced-readonly-rpc.ts';
import {ResilientNearReadOnlyRpc,isTransientNearRpcError} from '../src/rhea/resilient-readonly-rpc.ts';
const ID=/^[a-z0-9._-]{2,64}$/;
const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const UINT=/^(0|[1-9][0-9]{0,38})$/;
const u64=n=>{const out=Buffer.alloc(8);out.writeBigUInt64LE(BigInt(n));return out;};
const borshId=id=>{const b=Buffer.from(id,'utf8'),n=Buffer.alloc(4);n.writeUInt32LE(b.length);return Buffer.concat([n,b]);};
const at=(p,k)=>Buffer.concat([Buffer.from(p),k]);
const b64=b=>Buffer.from(b).toString('base64');
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// Stage105: near-workspaces importContract reads historical WASM through its
// mainnet JSON-RPC. Retry a separate archival endpoint ONLY for recoverable
// transport/oversize errors; never retry deterministic contract-state errors.
function stage105RetryableCodeImport(error){
 if(!(error instanceof Error))return false;
 return /(?:HTTP(?:Error)?[^\n]{0,40}\b(?:413|429|500|502|503|504)\b|\b(?:429|rate.limit|too.many.requests|response.too.large|payload.too.large|timeout|timed.out|ECONNRESET|ETIMEDOUT|fetch.failed|network.error|socket.hang.up|UNKNOWN_BLOCK|NOT_SYNCED)\b)/i.test(error.message);
}
function bytes(str){
 if(typeof str!=='string'||str.length>3_000_000||
  Buffer.from(str,'base64').toString('base64')!==str)
  throw Error('STAGE91_NONCANONICAL_SOURCE_STORAGE_ENCODING');
 return Buffer.from(str,'base64');
}
export async function cloneStage91LinearToken({
 root,rpc,endpoint,blockHeight,lendingAccountId,borrowerAccountId,
 fallbackEndpoint='https://archival-rpc.mainnet.near.org',fetcher=fetch,paceMs=220,
 fallbackRpc=null
}){
 const contractId='linear-protocol.near';
 if(!root||typeof root.importContract!=='function'||
  !rpc||typeof rpc.view!=='function'||typeof rpc.viewAccount!=='function'||
  !ID.test(lendingAccountId)||!ID.test(borrowerAccountId)||
  lendingAccountId===borrowerAccountId||
  !Number.isSafeInteger(blockHeight)||blockHeight<1||
  !Number.isSafeInteger(paceMs)||paceMs<0||paceMs>5000||
  typeof endpoint!=='string')
  throw Error('STAGE91_UNTRUSTED_SANDBOX_CLOSURE_CONFIGURATION');
 validateStage80IndependentArchive(endpoint,fallbackEndpoint);
 const accounts=[lendingAccountId,borrowerAccountId],height=String(blockHeight);
 const methods=[
  ['ft_total_supply',{}],['ft_metadata',{}],
  ['storage_balance_bounds',{}],['get_number_of_accounts',{}],
  ...accounts.flatMap(account_id=>[
   ['ft_balance_of',{account_id}],
   ['storage_balance_of',{account_id}],
  ]),
 ];
 // Stage101: never mix primary and fallback source values. A transient failure
 // restarts the entire pinned view group on an independent archival RPC.
 // Reject non-transient contract errors and block drift without provider hops.
 async function pinnedViews(sourceRpc){
  const paced=paceMs>=100?new PacedNearReadOnlyRpc(sourceRpc,paceMs):sourceRpc;
  const reads=new ResilientNearReadOnlyRpc(paced,{
   maxRetries:2,initialDelayMs:500,maxDelayMs:5000,maxCachedPinnedViews:32,
  });
  const sourceAccount=await reads.viewAccount(contractId,blockHeight);
  const sourceViews=[];
  for(const [method,args] of methods)
   sourceViews.push(await reads.view(contractId,method,args,blockHeight));
  return {remote:sourceAccount,views:sourceViews};
 }
 let remote,views,sourceViewFallbackUsed=false;
 try{
  ({remote,views}=await pinnedViews(rpc));
 }catch(error){
  if(!isTransientNearRpcError(error))
   throw Error('STAGE95_PINNED_LINEAR_SOURCE_VIEW_UNAVAILABLE');
  // Secondary provider is read-only and must serve the SAME historical block.
  const independent=fallbackRpc??new NearReadOnlyRpc(fallbackEndpoint);
  try{
   ({remote,views}=await pinnedViews(independent));
   sourceViewFallbackUsed=true;
  }catch(recoveryError){
   throw Error(isTransientNearRpcError(recoveryError)?
    'STAGE101_PINNED_LINEAR_FALLBACK_RETRIES_EXHAUSTED':
    'STAGE101_PINNED_LINEAR_FALLBACK_SOURCE_INVALID');
  }
 }
 if(remote?.blockHeight!==height||!HASH.test(remote.codeHash)||
  views.some(x=>x?.blockHeight!==height)||
  !UINT.test(views[0]?.value)||
  !views[1]?.value||typeof views[1].value.symbol!=='string'||
  !Number.isInteger(views[1].value.decimals)||
  !views[2]?.value||!UINT.test(views[2].value.min)||
  !Number.isSafeInteger(views[3]?.value)||views[3].value<1||
  views[3].value>5_000_000)
  throw Error('STAGE91_HISTORICAL_LINEAR_SOURCE_INVALID');
 const count=views[3].value;
 const main=new ArchivalStateRpc({
  endpoint,accountId:contractId,blockHeight,paceMs,timeoutMs:18000,maxRetries:2
 },fetcher);
 const alt=new ArchivalStateRpc({
  endpoint:fallbackEndpoint,accountId:contractId,blockHeight,
  paceMs:4000,timeoutMs:18000,maxRetries:0
 },fetcher);
 let pinnedHash=null,queries=0,alternate=0;
 const records=new Map();
 async function exact(key,mandatory=true){
  let page;
  try{page=await main.viewState(key,null,1);}
  catch(error){
   if(!(error instanceof StateResponseTooLarge))
    throw Error('STAGE95_ARCHIVAL_LINEAR_KEY_QUERY_FAILED');
   try{page=await alt.viewState(key,null,1);alternate++;}
   catch{throw Error('STAGE95_INDEPENDENT_LINEAR_KEY_RECOVERY_FAILED');}
  }
  queries++;
  if(page?.blockHeight!==height||!HASH.test(page.blockHash)||
   (pinnedHash!==null&&pinnedHash!==page.blockHash)||
   !Array.isArray(page.values)||page.values.length>1)
   throw Error('STAGE91_CROSS_BLOCK_OR_INVALID_INDEXED_STATE');
  pinnedHash=page.blockHash;
  if(page.values.length===0){
   if(mandatory)throw Error('STAGE91_REQUIRED_INDEXED_KEY_MISSING');
   return null;
  }
  const row=page.values[0];
  if(!bytes(row.key).equals(key))
   throw Error('STAGE91_ARCHIVE_RETURNED_DIFFERENT_INDEX_KEY');
  const value=bytes(row.value);
  records.set(row.key,row.value);
  return value;
 }
 const state=await exact(Buffer.from('STATE'));
 if(state.length<70||state.length>20000)
  throw Error('STAGE91_SOURCE_LINEAR_STATE_BORSH_LAYOUT_UNVERIFIED');
 for(let i=0;i<accounts.length;i++){
  const account=accounts[i],serialized=borshId(account);
  const indexBytes=await exact(at([0,105],serialized),false);
  const balance=views[4+2*i].value,registered=views[5+2*i].value;
  if(!UINT.test(balance)||BigInt(balance)>(1n<<128n)-1n)
   throw Error('STAGE91_BAD_SOURCE_FT_BALANCE');
  if(indexBytes===null){
   if(balance!=='0'||registered!==null)
    throw Error('STAGE91_MISSING_REGISTERED_ACCOUNT_INDEX');
   continue;
  }
  if(indexBytes.length!==8)
   throw Error('STAGE91_INVALID_ACCOUNT_INDEX_BYTES');
  const idx=indexBytes.readBigUInt64LE(0);
  if(idx>=BigInt(count))
   throw Error('STAGE91_INDEX_EXCEEDS_PINNED_ACCOUNT_COUNT');
  const [indexKey,indexValue]=await Promise.all([
   exact(at([0,107],u64(idx))),
   exact(at([0,118],u64(idx))),
  ]);
  if(!indexKey.equals(serialized)||indexValue.length<40||
   registered===null)
   throw Error('STAGE91_BORSH_ACCOUNT_INDEX_AND_VALUE_MISMATCH');
 }
 if(views[4].value==='0'||views[5].value===null)
  throw Error('STAGE91_RHEA_LINEAR_VAULT_UNREGISTERED_OR_EMPTY');
 let contract,codeImportFallbackUsed=false;
 const importOptions={mainnetContract:contractId,blockId:blockHeight,withData:false};
 try{contract=await root.importContract(importOptions);}
 catch(error){
  if(!stage105RetryableCodeImport(error))
   throw Error('STAGE95_LOCAL_LINEAR_WASM_IMPORT_FAILED');
  // The Workspaces SDK resolves this variable on every import. Do not leave
  // it changed for subsequent Workspaces imports or leak the endpoint in logs.
  // This function is run on the isolated, serial single-borrower import lane.
  const previous=process.env.NEAR_CLI_MAINNET_RPC_SERVER_URL;
  try{
   process.env.NEAR_CLI_MAINNET_RPC_SERVER_URL=fallbackEndpoint;
   contract=await root.importContract(importOptions);
   codeImportFallbackUsed=true;
  }catch{
   throw Error('STAGE105_PINNED_LINEAR_WASM_FALLBACK_FAILED');
  }finally{
   if(previous===undefined)delete process.env.NEAR_CLI_MAINNET_RPC_SERVER_URL;
   else process.env.NEAR_CLI_MAINNET_RPC_SERVER_URL=previous;
  }
 }
 if(contract?.accountId!==contractId||
  typeof contract.patchStateRecords!=='function'||
  typeof contract.accountView!=='function'||
  typeof contract.view!=='function'||
  (await contract.accountView())?.code_hash!==remote.codeHash)
  throw Error('STAGE91_LOCAL_DEPLOYED_LINEAR_CODE_MISMATCH');
 const stream=createHash('sha256');
 for(const [key,value] of records){
  const k=bytes(key),v=bytes(value),length=Buffer.alloc(8);
  length.writeUInt32BE(k.length,0);length.writeUInt32BE(v.length,4);
  stream.update(length);stream.update(k);stream.update(v);
  const record={Data:{account_id:contractId,data_key:key,value}};
  if(Buffer.byteLength(JSON.stringify(record))>2097152)
   throw Error('STAGE91_SINGLE_INDEXED_RECORD_TOO_LARGE');
  try{await contract.patchStateRecords({records:[record]});}
  catch{throw Error('STAGE95_LOCAL_LINEAR_INDEX_PATCH_FAILED');}
 }
 for(let i=0;i<methods.length;i++){
  const [method,args]=methods[i];
  let actual;
  try{actual=await contract.view(method,args);}
  catch{throw Error('STAGE91_LOCAL_LINEAR_VIEW_UNAVAILABLE');}
  if(!eq(actual,views[i].value))
   throw Error('STAGE91_PINNED_SOURCE_AND_SANDBOX_FT_VIEW_DIFFER');
 }
 return {contract,evidence:{
  mode:'STAGE91_AUTHENTIC_PINNED_LINEAR_ACCOUNT_CLOSURE',
  contractId,blockHeight:height,sourceCodeHash:remote.codeHash,
  sourceBlockHash:pinnedHash,sourceQueryCount:queries,
  recordsRead:records.size,recordsPatched:records.size,
  patchWriteCalls:records.size,alternateSingleEntryReads:alternate,
  sourceStorageDigest:stream.digest('hex'),
  accountCountObserved:count,sourceViewFallbackUsed,codeImportFallbackUsed,
  exactHistoricalIndexKeyValueVerified:true,
  criticalFtViewsAgreeWithSource:true,
  originalDeployedWasmVerified:true,
  // Partial by design. NEVER assert full keyspace or settlement completion.
  providerPaginationExhausted:false,fullMarketImported:false,
  completeTrieRootParityVerified:false,
  realLiquidationVerified:false,mainnetMutated:false,
 }};
}

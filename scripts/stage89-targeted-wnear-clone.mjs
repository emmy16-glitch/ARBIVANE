/** Stage89: preserve *deployed* wrap.near WASM and exact pinned wNEAR FT
 * state for a single Rhea Sandbox liquidation. This is deliberately NOT a
 * full FT-holder snapshot. Never synthesize token balances or source views.
 */
import {createHash} from 'node:crypto';
import {ArchivalStateRpc} from './stage45-archival-state-rpc.mjs';
import {StateResponseTooLarge} from './stage45-prefix-state.mjs';
import {validateStage80IndependentArchive} from './stage46-paged-sandbox-clone.mjs';

const ID=/^[a-z0-9._-]{2,64}$/;
const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const U128=(1n<<128n)-1n;
function keyOf(accountId){
 const name=Buffer.from(accountId,'utf8'),length=Buffer.alloc(4);
 length.writeUInt32LE(name.length,0);
 // Audited near/core-contracts w-near: FungibleToken::new(b"a"),
 // near-sdk legacy LookupMap appends Borsh-serialized AccountId.
 return Buffer.concat([Buffer.from('a'),length,name]);
}
function decode(v){
 if(typeof v!=='string'||v.length>3000000||
  Buffer.from(v,'base64').toString('base64')!==v)
  throw Error('STAGE89_NONCANONICAL_ARCHIVE_BASE64');
 return Buffer.from(v,'base64');
}
function exactEq(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function positiveU128(v){
 return typeof v==='string'&&/^(0|[1-9][0-9]{0,38})$/.test(v)&&
  BigInt(v)<=U128;
}
export async function cloneStage89WrappedNear({
 root,rpc,endpoint,blockHeight,lendingAccountId,borrowerAccountId,
 fallbackEndpoint='https://archival-rpc.mainnet.near.org',
 fetcher=fetch,paceMs=220
}){
 const contractId='wrap.near';
 if(!root||typeof root.importContract!=='function'||
  !rpc||typeof rpc.view!=='function'||typeof rpc.viewAccount!=='function'||
  !ID.test(lendingAccountId)||!ID.test(borrowerAccountId)||
  lendingAccountId===borrowerAccountId||
  !Number.isSafeInteger(blockHeight)||blockHeight<1||
  !Number.isSafeInteger(paceMs)||paceMs<0||paceMs>5000||
  typeof endpoint!=='string')
  throw Error('STAGE89_UNTRUSTED_LOCAL_TOKEN_CLONE_CONFIGURATION');
 validateStage80IndependentArchive(endpoint,fallbackEndpoint);
 const [account,supply,metadata,bounds,...balances]=await Promise.all([
  rpc.viewAccount(contractId,blockHeight),
  rpc.view(contractId,'ft_total_supply',{},blockHeight),
  rpc.view(contractId,'ft_metadata',{},blockHeight),
  rpc.view(contractId,'storage_balance_bounds',{},blockHeight),
  ...[lendingAccountId,borrowerAccountId].flatMap(accountId=>[
   rpc.view(contractId,'ft_balance_of',{account_id:accountId},blockHeight),
   rpc.view(contractId,'storage_balance_of',{account_id:accountId},blockHeight),
  ]),
 ]);
 const target=String(blockHeight);
 if(account?.blockHeight!==target||!HASH.test(account.codeHash)||
  [supply,metadata,bounds,...balances].some(x=>x?.blockHeight!==target)||
  !positiveU128(supply.value)||!metadata?.value||
  metadata.value.symbol!=='wNEAR'||metadata.value.decimals!==24||
  !positiveU128(bounds?.value?.min))
  throw Error('STAGE89_CROSS_BLOCK_OR_UNTRUSTED_DEPLOYED_WNEAR_SOURCE');
 const source=new ArchivalStateRpc({
  endpoint,accountId:contractId,blockHeight,paceMs,timeoutMs:18000,maxRetries:2
 },fetcher);
 const alternative=new ArchivalStateRpc({
  endpoint:fallbackEndpoint,accountId:contractId,blockHeight,
  paceMs:4000,timeoutMs:18000,maxRetries:0
 },fetcher);
 let sourceHash=null,reads=0,recoveries=0;
 const storage=[];
 async function exact(key,required){
  let page;
  try{page=await source.viewState(key,null,1);}
  catch(e){
   if(!(e instanceof StateResponseTooLarge))throw e;
   page=await alternative.viewState(key,null,1);recoveries++;
  }
  reads++;
  if(page?.blockHeight!==target||!HASH.test(page.blockHash)||
   (sourceHash!==null&&sourceHash!==page.blockHash)||
   !Array.isArray(page.values)||page.values.length>1)
   throw Error('STAGE89_CROSS_BLOCK_OR_INCONSISTENT_WNEAR_STORAGE');
  sourceHash=page.blockHash;
  if(!page.values.length){
   if(required)throw Error('STAGE89_REQUIRED_SOURCE_WNEAR_KEY_MISSING');
   return null;
  }
  const row=page.values[0],observed=decode(row.key),value=decode(row.value);
  if(!observed.equals(key))
   throw Error('STAGE89_INEXACT_SOURCE_WNEAR_STORAGE_KEY');
  if(storage.some(x=>x.key===row.key))
   throw Error('STAGE89_DUPLICATE_SOURCE_WNEAR_KEY');
  storage.push({key:row.key,value:row.value});
  return value;
 }
 // Contract state includes the historic FT total_supply, map prefix and
 // per-account storage usage; none are rewritten to seed Sandbox holdings.
 const state=await exact(Buffer.from('STATE'),true);
 if(state.length!==29||!state.subarray(0,5).equals(Buffer.from([1,0,0,0,97]))||
  state.readBigUInt64LE(21)===0n)
  throw Error('STAGE89_DEPLOYED_WNEAR_STATE_LAYOUT_NOT_ATTESTED');
 const totalSupply=BigInt('0x'+Buffer.from(state.subarray(5,21)).reverse().toString('hex'));
 if(totalSupply.toString()!==supply.value)
  throw Error('STAGE89_PINNED_WNEAR_TOTAL_SUPPLY_MISMATCH');
 const sourceAccountIds=[lendingAccountId,borrowerAccountId];
 for(let i=0;i<sourceAccountIds.length;i++){
  const accountId=sourceAccountIds[i];
  const raw=await exact(keyOf(accountId),false);
  const sourceBalance=balances[i*2].value,registration=balances[i*2+1].value;
  if(!positiveU128(sourceBalance))
   throw Error('STAGE89_INVALID_PINNED_WNEAR_BALANCE');
  if(raw===null){
   if(sourceBalance!=='0'||registration!==null)
    throw Error('STAGE89_MISSING_NONZERO_WNEAR_BALANCE');
  }else{
   if(raw.length!==16||
    BigInt('0x'+Buffer.from(raw).reverse().toString('hex')).toString()!==sourceBalance||
    registration===null)
    throw Error('STAGE89_WNEAR_ACCOUNT_RAW_BALANCE_DISAGREES_WITH_VIEW');
  }
 }
 if(balances[0].value==='0'||balances[1].value===null)
  throw Error('STAGE89_RHEA_WNEAR_VAULT_NOT_REGISTERED_OR_EMPTY');
 const contract=await root.importContract({
  mainnetContract:contractId,blockId:blockHeight,withData:false,
 });
 if(contract?.accountId!==contractId||
  typeof contract.patchStateRecords!=='function'||
  typeof contract.accountView!=='function'||typeof contract.view!=='function'||
  (await contract.accountView())?.code_hash!==account.codeHash)
  throw Error('STAGE89_DEPLOYED_WNEAR_CODE_OR_LOCAL_PATCH_MISMATCH');
 const records=storage.map(row=>({Data:{account_id:contractId,
  data_key:row.key,value:row.value}}));
 for(const record of records){
  if(Buffer.byteLength(JSON.stringify(record))>2097152)
   throw Error('STAGE89_SINGLE_SOURCE_RECORD_TOO_LARGE');
  await contract.patchStateRecords({records:[record]});
 }
 const checks=[
  ['ft_total_supply',{},supply.value],
  ['ft_metadata',{},metadata.value],
  ['storage_balance_bounds',{},bounds.value],
  ...sourceAccountIds.flatMap((accountId,i)=>[
   ['ft_balance_of',{account_id:accountId},balances[i*2].value],
   ['storage_balance_of',{account_id:accountId},balances[i*2+1].value],
  ]),
 ];
 for(const [method,args,expected] of checks){
  const actual=await contract.view(method,args);
  if(!exactEq(actual,expected))
   throw Error('STAGE89_SOURCE_AND_SANDBOX_WNEAR_VIEW_MISMATCH');
 }
 const hash=createHash('sha256');
 for(const row of storage){
  const key=decode(row.key),value=decode(row.value),lengths=Buffer.alloc(8);
  lengths.writeUInt32BE(key.length,0);lengths.writeUInt32BE(value.length,4);
  hash.update(lengths);hash.update(key);hash.update(value);
 }
 return {contract,evidence:{
  mode:'STAGE89_PINNED_RELEVANT_WNEAR_STORAGE',
  contractId,blockHeight:target,sourceCodeHash:account.codeHash,
  sourceBlockHash:sourceHash,sourceQueryCount:reads,
  recordsRead:storage.length,recordsPatched:storage.length,
  patchWriteCalls:storage.length,alternateSingleEntryReads:recoveries,
  sourceStorageDigest:hash.digest('hex'),
  relevantAccountViewParityVerified:true,
  originalFtSupplyVerified:true,originalDeployedWasmVerified:true,
  // A deliberately selective clone cannot claim full-account keyspace parity.
  providerPaginationExhausted:false,fullMarketImported:false,
  completeTrieRootParityVerified:false,
  verifiedLiquidationReceipts:false,mainnetMutated:false,
 }};
}

/**
 * Strict, read-only NEAR Testnet bridge for the public Testnet discovery UI.
 * All RPC endpoints, contract IDs and methods are fixed by the backend;
 * callers cannot supply signed transactions, arbitrary method names or URLs.
 */
export const TESTNET_RPC='https://rpc.testnet.near.org';
export const TESTNET_LENDING='contract.burrow.testnet';
// Independently checked on the actual Testnet contract on 2026-10-28.
// If upgraded, discovery fails closed until the new deployment is reviewed.
export const TESTNET_LENDING_HASH='5r4GsfdDATmriAdT6ZteFpPjDNSfPn4NneETiNuckUc6';
const MAX_PAGE=20;
const LIMIT=1500000;
const ACCOUNT=/^[a-z0-9_.-]{2,64}$/;
function errors(message){throw Error(message)}
export async function testnetRpc(method,params,{fetchImpl=fetch,timeoutMs=10000}={}){
 if(!['status','query'].includes(method))errors('TESTNET_RPC_METHOD_DENIED');
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const response=await fetchImpl(TESTNET_RPC,{
   method:'POST',headers:{'content-type':'application/json'},
   signal:controller.signal,
   body:JSON.stringify({jsonrpc:'2.0',id:'arbivane-testnet-read',method,params})});
  if(!response.ok)errors('TESTNET_RPC_HTTP_'+response.status);
  const result=await response.json();
  if(result?.error||!result?.result)errors('TESTNET_RPC_RESPONSE_ERROR');
  return result.result;
 }catch(error){
  if(error?.message?.startsWith('TESTNET_'))throw error;
  throw Error('TESTNET_RPC_UNAVAILABLE');
 }finally{clearTimeout(timer)}
}
async function callFixed(method,args,options){
 const result=await testnetRpc('query',{request_type:'call_function',
  finality:'final',account_id:TESTNET_LENDING,method_name:method,
  args_base64:Buffer.from(JSON.stringify(args)).toString('base64')},options);
 if(!Array.isArray(result?.result)||!Number.isSafeInteger(result.block_height))
  errors('TESTNET_CALL_RESULT_INVALID');
 let value;
 try{value=JSON.parse(Buffer.from(result.result).toString('utf8'))}
 catch{errors('TESTNET_CONTRACT_RESULT_MALFORMED')}
 return {value,blockHeight:result.block_height};
}
export async function inspectTestnet({fetchImpl=fetch}={}){
 const options={fetchImpl};
 const [status,contract]=await Promise.all([
  testnetRpc('status',[],options),
  testnetRpc('query',{request_type:'view_account',finality:'final',
   account_id:TESTNET_LENDING},options)]);
 if(status.chain_id!=='testnet'||!Number.isSafeInteger(status.sync_info?.latest_block_height))
  errors('WRONG_TESTNET_CHAIN');
 if(status.sync_info.syncing!==false)errors('TESTNET_RPC_SYNCING');
 if(contract.code_hash!==TESTNET_LENDING_HASH)
  errors('TESTNET_CONTRACT_CODE_HASH_CHANGED');
 const config=await callFixed('get_config',{},options);
 if(!config.value||typeof config.value.oracle_account_id!=='string'||
  typeof config.value.ref_exchange_id!=='string')
  errors('TESTNET_LENDING_CONFIG_INVALID');
 return {chainId:'testnet',status:'connected',blockHeight:status.sync_info.latest_block_height,
  contract:TESTNET_LENDING,codeHash:contract.code_hash,oracleId:config.value.oracle_account_id,
  oracleEnabled:config.value.enable_price_oracle===true,
  observations:'real_testnet',executionEnabled:false,checkedAt:new Date().toISOString()};
}
export async function getTestnetPositions(from,limit,{fetchImpl=fetch}={}){
 if(!Number.isSafeInteger(from)||from<0||from>LIMIT||
  !Number.isSafeInteger(limit)||limit<1||limit>MAX_PAGE)
  errors('INVALID_TESTNET_PAGE');
 // Reverify the deployed contract each request. One stale code hash must
 // never make incompatible contracts look like a valid lending market.
 const contract=await testnetRpc('query',{request_type:'view_account',
  finality:'final',account_id:TESTNET_LENDING},{fetchImpl});
 if(contract?.code_hash!==TESTNET_LENDING_HASH)
  errors('TESTNET_CONTRACT_CODE_HASH_CHANGED');
 const {value,blockHeight}=await callFixed('get_accounts_paged',{
  from_index:from,limit},{fetchImpl});
 if(!Array.isArray(value)||value.length>limit)errors('TESTNET_PAGE_INVALID');
 const accounts=value.map((row,index)=>{
  if(!ACCOUNT.test(row?.account_id??''))errors('TESTNET_ACCOUNT_ID_INVALID');
  const positions=row.positions??{};
  const borrowed=[];
  const collateral=[];
  for(const [kind,record] of Object.entries(positions)){
   if(!record||typeof record!=='object')continue;
   const data=record.RegularPosition??record.LPTokenPosition;
   if(!data||typeof data!=='object')continue;
   const readAmounts=(value,destination)=>{
    if(!value||typeof value!=='object')return;
    for(const [tokenId,atomic] of Object.entries(value)){
     if(!ACCOUNT.test(tokenId)||typeof atomic!=='string'||!/^[0-9]{1,90}$/.test(atomic))
      continue;
     if(BigInt(atomic)>0n)destination.push({tokenId,atomic,position:kind.slice(0,60)});
    }
   };
   readAmounts(data.borrowed,borrowed);
   readAmounts(data.collateral,collateral);
  }
  return {accountId:row.account_id,borrowed:borrowed.slice(0,30),
   collateral:collateral.slice(0,30),hasDebt:borrowed.length>0,
   sourceIndex:from+index};
 });
 return {network:'testnet',contract:TESTNET_LENDING,codeHash:contract.code_hash,
  blockHeight,from,limit,returned:accounts.length,accounts,
  hasMore:accounts.length===limit,checkedAt:new Date().toISOString(),
  eligibilityVerified:false,realizedPnlVerified:false};
}


/** Public account lookup only. Never returns access keys or mutable account state. */
export async function getTestnetAccount(accountId,{fetchImpl=fetch}={}){
 if(typeof accountId!=='string'||accountId.length>64||
   !(/^[a-z0-9][a-z0-9_.-]{0,56}\.testnet$/.test(accountId)||
     /^[a-f0-9]{64}$/.test(accountId)))
  errors('INVALID_TESTNET_ACCOUNT_ID');
 const chain=await testnetRpc('status',[],{fetchImpl});
 if(chain.chain_id!=='testnet'||chain.sync_info?.syncing!==false)
  errors('WRONG_TESTNET_CHAIN');
 const result=await testnetRpc('query',{request_type:'view_account',
  finality:'final',account_id:accountId},{fetchImpl});
 if(typeof result.amount!=='string'||!/^[0-9]{1,80}$/.test(result.amount)||
    typeof result.locked!=='string'||!/^[0-9]{1,80}$/.test(result.locked)||
    !Number.isSafeInteger(result.block_height))
  errors('TESTNET_ACCOUNT_INVALID_RESPONSE');
 return {accountId,network:'testnet',balanceYocto:result.amount,
  lockedYocto:result.locked,
  balanceNear:(Number(BigInt(result.amount)/1000000000000000000n)/1000000).toFixed(6),
  sourceBlock:result.block_height,checkedAt:new Date().toISOString(),
  canSign:false,signerConnected:false,executionEnabled:false};
}

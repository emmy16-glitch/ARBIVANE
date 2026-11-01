/**
 * Stage199: read-only owner-lab verification and unsigned owner intents.
 *
 * The server never accepts a private key and never signs. Intents are public
 * JSON descriptions that the user's connected wallet must explicitly approve.
 */
import {
 createLabManifest,validateOwner,marketTokens,SCENARIO,
} from '../../scripts/testnet-lab/spec.mjs';
import {inspectManifest} from '../../scripts/testnet-lab/verify.mjs';

const CACHE_TTL_MS=15000;
const cache=new Map();
const pending=new Map();
const TX=/^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const ACCOUNT=/^[a-z0-9][a-z0-9_.-]{0,56}\.testnet$/;

function fail(code){throw Error(code)}

function cacheKey(owner,tx,withdraw){
 return owner+':'+(tx??'')+':'+(withdraw??'');
}
export async function inspectOwnerLab(owner,{txHash=null,withdrawTxHash=null,
 fetchImpl=fetch}={}){
 validateOwner(owner);
 if(txHash!==null&&!TX.test(txHash))fail('INVALID_TESTNET_TRANSACTION_HASH');
 if(withdrawTxHash!==null&&!TX.test(withdrawTxHash))
  fail('INVALID_TESTNET_TRANSACTION_HASH');
 const key=cacheKey(owner,txHash,withdrawTxHash);
 const hit=cache.get(key);
 if(hit&&Date.now()-hit.at<CACHE_TTL_MS)return hit.value;
 if(pending.has(key))return pending.get(key);
 const job=inspectManifest(createLabManifest(owner),{
  fetchImpl,txHash,withdrawTxHash,
 }).then(value=>{
  cache.set(key,{at:Date.now(),value});
  if(cache.size>100)cache.delete(cache.keys().next().value);
  return value;
 }).finally(()=>pending.delete(key));
 pending.set(key,job);
 return job;
}

const GAS_100='100000000000000';
const GAS_200='200000000000000';
const ONE_YOCTO='1';
const ZERO='0';
const STORAGE_NEAR='100000000000000000000000';
const FT_STORAGE_NEAR='10000000000000000000000';

function call(methodName,args,{gas=GAS_100,deposit=ONE_YOCTO}={}){
 return {methodName,args,gas,deposit};
}
function tokenById(manifest,role){
 return manifest.tokens.find(token=>token.role===role);
}
function assetsPresent(state){
 const ids=new Set((state.assets??[]).map(row=>Array.isArray(row)?row[0]:row?.token_id));
 return ids;
}
function hasStorage(value){
 return Boolean(value)&&typeof value==='object'&&!value.error&&
  typeof value.total==='string';
}
function missingStorage(state,role,name){
 return !hasStorage(state.storage?.[role]?.[name]);
}
function missingLendingStorage(state,name){
 return !hasStorage(state.storage?.lending?.[name]);
}

/**
 * Build owner-signed provisioning transactions. The connected account must be
 * the manifest owner. Each transaction is returned as JSON with method names,
 * arguments, gas and deposit. No transaction is signed or sent here.
 */
export async function buildOwnerIntents(owner,accountId,{fetchImpl=fetch}={}){
 validateOwner(owner);
 if(typeof accountId!=='string'||!ACCOUNT.test(accountId))
  fail('INVALID_TESTNET_ACCOUNT_ID');
 if(accountId!==owner)fail('CONNECTED_WALLET_IS_NOT_LAB_OWNER');
 const manifest=createLabManifest(owner);
 const state=await inspectOwnerLab(owner,{fetchImpl});
 if(!state.accounts?.lending?.exists)fail('LAB_NOT_DEPLOYED');
 if(!state.codeVerified)fail('LAB_CODE_NOT_VERIFIED');
 if(!state.initialized)fail('LENDING_NOT_INITIALIZED');
 if(!state.configVerified)fail('LAB_CONFIG_MISMATCH');
 const a=manifest.accountIds,transactions=[];
 const present=assetsPresent(state);
 const missingAssets=marketTokens(manifest)
  .filter(token=>!present.has(token.accountId));
 if(missingAssets.length){
  transactions.push({label:'Add missing test assets to the lending market',
   receiverId:a.lending,
   actions:missingAssets.map(token=>call('add_asset',{
    token_id:token.accountId,asset_config:token.assetConfig,
   }))});
 }
 for(const token of manifest.tokens){
  for(const name of ['lending','owner','borrower','liquidator']){
   if(name!=='lending'&&!token.marketAsset)continue;
   if(!missingStorage(state,token.role,name))continue;
   const target=a[name];
   transactions.push({label:'Register '+token.symbol+' storage for '+name,
    receiverId:token.accountId,
    actions:[call('storage_deposit',{account_id:target},
     {gas:GAS_100,deposit:FT_STORAGE_NEAR})]});
  }
 }
 for(const name of ['owner','borrower','liquidator']){
  if(!missingLendingStorage(state,name))continue;
  transactions.push({label:'Register lending storage for '+name,
   receiverId:a.lending,
   actions:[call('storage_deposit',{account_id:a[name]},
    {gas:GAS_100,deposit:STORAGE_NEAR})]});
 }
 for(const token of manifest.tokens){
  for(const [recipient,amount] of Object.entries(token.mintTo)){
   if(amount==='0')continue;
   const name=recipient==='owner'?'owner':recipient;
   const balance=state.balances?.[token.role]?.[name];
   if(typeof balance==='string'&&BigInt(balance)>0n)continue;
   transactions.push({label:'Mint test '+token.symbol+' to '+name,
    receiverId:token.accountId,
    actions:[call('mint',{account_id:a[name],amount},
     {gas:GAS_100,deposit:ZERO})]});
  }
 }
 if(!state.reservesVerified){
  for(const token of marketTokens(manifest)){
   transactions.push({label:'Fund '+token.symbol+' lending reserve',
    receiverId:token.accountId,
    actions:[call('ft_transfer_call',{receiver_id:a.lending,
     amount:manifest.scenario.reserveFunding[token.role],
     msg:JSON.stringify('DepositToReserve')},
     {gas:GAS_200,deposit:ONE_YOCTO})]});
  }
 }
 return {network:'testnet',owner,accountId,readiness:state.readiness,
  requiresWalletApproval:true,transactions,
  next:
   transactions.length?'Approve each transaction in your wallet.':'Owner provisioning checks already pass.',
  scenario:{collateral:tokenById(manifest,SCENARIO.collateralRole)?.accountId,
   debt:tokenById(manifest,SCENARIO.debtRole)?.accountId}};
}

export async function readTokenBalance(contractId,accountId,{fetchImpl=fetch}={}){
 if(typeof contractId!=='string'||!ACCOUNT.test(contractId))
  fail('INVALID_TESTNET_TOKEN_CONTRACT');
 if(typeof accountId!=='string'||!ACCOUNT.test(accountId))
  fail('INVALID_TESTNET_ACCOUNT_ID');
 const response=await fetchImpl('https://rpc.testnet.near.org',{
  method:'POST',headers:{'content-type':'application/json'},
  signal:AbortSignal.timeout(15000),
  body:JSON.stringify({jsonrpc:'2.0',id:'arbivane-token-balance',
   method:'query',params:{request_type:'call_function',finality:'final',
    account_id:contractId,method_name:'ft_balance_of',
    args_base64:Buffer.from(JSON.stringify({account_id:accountId}))
     .toString('base64')}}),
 });
 if(!response.ok)fail('TESTNET_RPC_HTTP_'+response.status);
 const json=await response.json();
 if(json.error||!Array.isArray(json.result?.result))fail('TESTNET_RPC_BAD_RESPONSE');
 let balance;
 try{balance=JSON.parse(Buffer.from(json.result.result).toString('utf8'))}
 catch{fail('TESTNET_CONTRACT_RESULT_MALFORMED')}
 if(typeof balance!=='string'||!/^(0|[1-9][0-9]{0,89})$/.test(balance))
  fail('TESTNET_TOKEN_BALANCE_INVALID');
 return {network:'testnet',contractId,accountId,balanceAtomic:balance,
  sourceBlock:json.result.block_height,checkedAt:new Date().toISOString(),
  signerConnected:false,executionEnabled:false};
}

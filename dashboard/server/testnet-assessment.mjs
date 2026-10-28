/**
 * Stage195 read-only Testnet liquidation preflight.
 *
 * The lending index is a DISCOVERY HINT, never authoritative eligibility.
 * Re-read every indexed debtor with get_account and cross-check the lending-
 * configured oracle quotes. Missing or stale oracle prices are BLOCKERS.
 *
 * Even valid quote coverage is UNVERIFIED: full collateral-volatility health,
 * swaps, fees, signer and receipt verification remain prerequisites for
 * liquidation execution. No public transaction/signing API is exposed here.
 */
import {getTestnetPositions,inspectTestnet,testnetRpc,TESTNET_LENDING,TESTNET_LENDING_HASH} from './testnet-readonly.mjs';
const ORACLE='mock-priceoracle.testnet';
const ACCOUNT=/^[a-z0-9_.-]{2,64}$/;
const MAX_AGE_MS=180000;
const U=/^(0|[1-9][0-9]{0,89})$/;
function fail(code){throw Error(code)}
async function view(contract,method,args,options){
 const response=await testnetRpc('query',{
  request_type:'call_function',finality:'final',account_id:contract,
  method_name:method,args_base64:Buffer.from(JSON.stringify(args)).toString('base64')
 },options);
 if(!Number.isSafeInteger(response?.block_height)||!Array.isArray(response?.result))
  fail('TESTNET_ASSESSMENT_VIEW_INVALID');
 let value;try{value=JSON.parse(Buffer.from(response.result).toString('utf8'))}
 catch{fail('TESTNET_ASSESSMENT_JSON_INVALID')}
 return {value,blockHeight:response.block_height};
}
export function interpretBorrower(accountId,payload){
 if(!payload||payload.account_id!==accountId||
    !Array.isArray(payload.borrowed)||!Array.isArray(payload.collateral))
  fail('TESTNET_FRESH_ACCOUNT_INVALID');
 const mapped=(rows)=>rows.filter(x=>
  x&&typeof x.token_id==='string'&&ACCOUNT.test(x.token_id)&&
  typeof x.balance==='string'&&U.test(x.balance)&&BigInt(x.balance)>0n)
  .map(x=>({tokenId:x.token_id,atomic:x.balance})).slice(0,30);
 const borrowed=mapped(payload.borrowed),collateral=mapped(payload.collateral);
 return {accountId,borrowed,collateral,hasDebt:borrowed.length>0};
}
export function classifyTestnetAccount(account,priceMap,oracleFresh){
 if(!account.hasDebt)return {status:'NO_CURRENT_DEBT',reason:'NO_CURRENT_DEBT',missingPrices:[],eligible:false};
 if(!account.collateral.length)return {status:'BLOCKED',reason:'NO_COLLATERAL',missingPrices:[],eligible:false};
 if(!oracleFresh)return {status:'BLOCKED',reason:'ORACLE_STALE',missingPrices:[],eligible:false};
 const tokens=[...new Set([...account.borrowed,...account.collateral].map(x=>x.tokenId))];
 const missingPrices=tokens.filter(id=>!priceMap.has(id)||priceMap.get(id)!==true);
 if(missingPrices.length)return {status:'BLOCKED',reason:'MISSING_ORACLE_PRICE',
  missingPrices:missingPrices.slice(0,30),eligible:false};
 return {status:'UNVERIFIED',reason:'HEALTH_FACTOR_NOT_VERIFIED',
  missingPrices:[],eligible:false};
}
function validateOracle(value,assets,nowMs){
 if(!value||typeof value!=='object'||!Array.isArray(value.prices)||
   value.prices.length>120||!U.test(String(value.timestamp??'')))
  fail('TESTNET_ORACLE_PRICE_DATA_INVALID');
 const ageMs=nowMs-Number(BigInt(value.timestamp)/1000000n);
 const recency=value.recency_duration_sec;
 const fresh=Number.isFinite(ageMs)&&ageMs>=-30000&&
  Number.isSafeInteger(recency)&&recency>=1&&recency<=180&&
  ageMs<=Math.min(MAX_AGE_MS,recency*1000);
 const allowed=new Set(assets),prices=new Map();
 for(const row of value.prices){
  if(!row||!allowed.has(row.asset_id))continue;
  const p=row.price;
  const valid=p&&U.test(String(p.multiplier??''))&&
   BigInt(p.multiplier)>0n&&Number.isInteger(p.decimals)&&
   p.decimals>=0&&p.decimals<=36;
  prices.set(row.asset_id,Boolean(valid));
 }
 return {prices,fresh,ageMs:Math.round(ageMs),recencySec:recency};
}
export async function assessTestnetPage(from,limit,{
 fetchImpl=fetch,nowMs=Date.now(),concurrency=3,
}={}){
 const options={fetchImpl,timeoutMs:14000};
 if(!Number.isSafeInteger(from)||from<0||from>1500000||
    !Number.isSafeInteger(limit)||limit<1||limit>20||
    !Number.isInteger(concurrency)||concurrency<1||concurrency>5)
  fail('INVALID_TESTNET_ASSESSMENT_PAGE');
 const health=await inspectTestnet({fetchImpl});
 if(health.contract!==TESTNET_LENDING||health.codeHash!==TESTNET_LENDING_HASH||
    health.oracleId!==ORACLE||health.oracleEnabled!==true)
  fail('TESTNET_ORACLE_CONFIG_DRIFT');
 const page=await getTestnetPositions(from,limit,{fetchImpl});
 const indexed=page.accounts.filter(a=>a.hasDebt);
 const fresh=new Map();
 const failures=new Map();
 // Bounded parallelism, controlled fixed-method calls, never using public
 // account names for arbitrary RPC URLs or signer access.
 let cursor=0;
 const workers=Array.from({length:Math.min(concurrency,indexed.length)},async()=>{
  while(cursor<indexed.length){
   const row=indexed[cursor++];
   try{
    const result=await view(TESTNET_LENDING,'get_account',{account_id:row.accountId},options);
    fresh.set(row.accountId,{...interpretBorrower(row.accountId,result.value),
      blockHeight:result.blockHeight});
   }catch(error){failures.set(row.accountId,'FRESH_ACCOUNT_UNAVAILABLE')}
  }
 });
 await Promise.all(workers);
 const tokens=[...new Set([...fresh.values()].flatMap(a=>[...a.borrowed,...a.collateral].map(x=>x.tokenId)))].slice(0,120);
 let quote={prices:new Map(),fresh:false,ageMs:null,recencySec:null};
 let oracleError=null;
 if(tokens.length){
  try{
   const oracleAccount=await testnetRpc('query',{
    request_type:'view_account',finality:'final',account_id:ORACLE},options);
   if(!oracleAccount.code_hash||oracleAccount.code_hash==='11111111111111111111111111111111')
    fail('TESTNET_ORACLE_NOT_DEPLOYED');
   const response=await view(ORACLE,'get_price_data',{asset_ids:tokens},options);
   quote=validateOracle(response.value,tokens,nowMs);
  }catch(error){oracleError=error.message?.startsWith('TESTNET_')?
    error.message:'TESTNET_ORACLE_QUERY_FAILED'}
 }
 const accounts=page.accounts.map(row=>{
  const current=fresh.get(row.accountId);
  const indexedOnly=row.hasDebt&&!current;
  const currentPosition=current??{accountId:row.accountId,
    borrowed:[],collateral:[],hasDebt:false};
  const classification=indexedOnly?
   {status:'BLOCKED',reason:failures.get(row.accountId)||'FRESH_ACCOUNT_UNAVAILABLE',
    missingPrices:[],eligible:false}:
   classifyTestnetAccount(currentPosition,quote.prices,quote.fresh);
  return {accountId:row.accountId,sourceIndex:row.sourceIndex,
   indexHasDebt:row.hasDebt,hasDebt:currentPosition.hasDebt,
   borrowed:currentPosition.borrowed,collateral:currentPosition.collateral,
   freshBlock:current?.blockHeight??null,...classification,
   eligibilityVerified:false,executionEnabled:false};
 });
 const freshDebt=accounts.filter(a=>a.hasDebt).length;
 const blocked=accounts.filter(a=>a.status==='BLOCKED').length;
 const pending=accounts.filter(a=>a.status==='UNVERIFIED').length;
 const missingRequiredTokens=tokens.filter(x=>quote.prices.get(x)!==true);
 const marketStatus=oracleError||!quote.fresh?
  'ORACLE_UNAVAILABLE':missingRequiredTokens.length?
  'UPSTREAM_ORACLE_UNPRICED':'HEALTH_FACTOR_UNVERIFIED';
 const out={
  network:'testnet',contract:TESTNET_LENDING,codeHash:health.codeHash,
  marketStatus,blockchainExecutionReady:false,
  marketRemediation:{
   source:'DEPLOYED_LENDING_CONFIGURED_ORACLE',
   lendingOwnerId:health.lendingOwnerId??null,
   oracleContract:ORACLE,pythOracleEnabled:health.pythOracleEnabled===true,
   missingTokenIds:missingRequiredTokens,
   missingTokenCount:missingRequiredTokens.length,
   requiresUpstreamOracleRepair:marketStatus==='UPSTREAM_ORACLE_UNPRICED',
   callerSuppliedPricesPermitted:false,
   signerConnected:false,
   nextSafeAction:missingRequiredTokens.length?
    'LENDING_ORACLE_OPERATOR_MUST_RESTORE_PRICES_OR_USE_ISOLATED_TESTNET_DEPLOYMENT':
    'VERIFY_HEALTH_FACTOR_EXECUTION_SIGNER_AND_FINAL_RECEIPTS'
  },
  oracleId:ORACLE,blockHeight:page.blockHeight,from,limit,
  returned:accounts.length,hasMore:page.hasMore,
  indexedDebt:indexed.length,freshDebt,blocked,pending,
  staleIndexedDebt:accounts.filter(a=>a.indexHasDebt&&!a.hasDebt&&a.status==='NO_CURRENT_DEBT').length,
  oracle:{fresh:quote.fresh,ageMs:quote.ageMs,recencySec:quote.recencySec,
   error:oracleError,pricedTokens:tokens.filter(x=>quote.prices.get(x)===true).length,
   requiredTokens:tokens.length},
  eligibleVerified:0,transactionsExecuted:0,executionEnabled:false,
  eligibilityVerified:false,accounts,checkedAt:new Date(nowMs).toISOString()
 };
 return out;
}


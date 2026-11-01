/**
 * Stage199: shared, deterministic specification for an isolated, user-owned
 * NEAR Testnet lending lab.
 *
 * This module contains only public identifiers, pinned hashes, test token
 * metadata and simulated test prices. It never contains or accepts a private
 * key, seed phrase or password.
 */
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

export const RPC='https://rpc.testnet.near.org';
export const PURPOSE='INDEPENDENT_TEST_LAB_ONLY';
export const SOURCE=Object.freeze({
 repository:'NearDeFi/burrowland',
 commit:'0dbfa1803bf26353ffbee2ffd4f494bab23b2756',
 lendingWasm:'6b8aa59bbc20f08e8c6ef68fc992278e124f4d9dd83b2ba7afce466da4659f55',
 oracleWasm:'b775f0fade1d5b3197af2a5a81e9c9d951be268c8587f17d110dfa66a5ffd9e1',
 fungibleTokenWasm:'4bc72fa1c23742d3e06bea47b424b6e2a3f962af606401828a5841c437f5bf65',
 lendingCodeHash:'8EoF8mXSAYV3HTGyZkSJJJ65xPgzTuj9D442LAjXidXr',
 oracleCodeHash:'DM9vASPfsTAEWd72JSghTWFPx2vUuHTnojPZV33gp9Ke',
 fungibleTokenCodeHash:'66ojqJFVKGacHP6pBhwD5PqU3oMbevwuKmta6Xh3KcCC',
 rawBase:'https://raw.githubusercontent.com/NearDeFi/burrowland/0dbfa1803bf26353ffbee2ffd4f494bab23b2756/res/',
});

const BASE58='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function base58Encode(buffer){
 let value=0n;
 for(const byte of buffer)value=value*256n+BigInt(byte);
 let encoded='';
 while(value>0n){encoded=BASE58[Number(value%58n)]+encoded;value/=58n}
 for(const byte of buffer){if(byte===0)encoded='1'+encoded;else break}
 return encoded;
}
export async function wasmSha256(filename){
 const bytes=await readFile(filename);
 return createHash('sha256').update(bytes).digest('hex');
}
export async function wasmCodeHash(filename){
 const bytes=await readFile(filename);
 return base58Encode(createHash('sha256').update(bytes).digest());
}

const OWNER=/^[a-z0-9](?:[a-z0-9_-]{0,46}[a-z0-9])?\.testnet$/;
const LOST_ACCOUNTS=new Set([
 'arbivane-fixture-66971fd6.testnet',
 'lend.arbivane-fixture-66971fd6.testnet',
 'oracle.arbivane-fixture-66971fd6.testnet',
]);
const SECRET_WORDS=/(private|secret|seed|password|mnemonic)/i;
function reject(code){throw Error(code)}

export function validateOwner(owner){
 if(typeof owner!=='string'||!OWNER.test(owner)||LOST_ACCOUNTS.has(owner)||
    SECRET_WORDS.test(owner))reject('INVALID_OR_UNRECOVERABLE_TESTNET_OWNER');
 return owner;
}

const TOKEN_BASE=Object.freeze({
 decimals:18,
 totalSupply:'1000000000000000000000000',
 ownerMint:'100000000000000000000000',
 assetConfig:{
  reserve_ratio:2500,
  target_utilization:8000,
  target_utilization_rate:'1000000000002440418605283556',
  max_utilization_rate:'1000000000039724853136740579',
  volatility_ratio:9500,
  extra_decimals:0,
  can_deposit:true,
  can_withdraw:true,
  can_use_as_collateral:true,
  can_borrow:true,
  net_tvl_multiplier:10000,
 },
});

export const TOKEN_SPECS=Object.freeze([
 Object.freeze({...TOKEN_BASE,role:'booster',prefix:'booster',symbol:'TBOOST',
  name:'ARBIVANE Test Booster',marketAsset:false,
  mintTo:{owner:'100000000000000000000000',borrower:'0',liquidator:'0'},
  price:null,
  assetConfig:{...TOKEN_BASE.assetConfig,volatility_ratio:2000,
   can_use_as_collateral:false,can_borrow:false}}),
 Object.freeze({...TOKEN_BASE,role:'collateral',prefix:'tcoll',symbol:'TCOLL',
  name:'ARBIVANE Test Collateral',marketAsset:true,
  mintTo:{owner:'100000000000000000000000',borrower:'10000000000000000000000',
   liquidator:'0'},
  price:{multiplier:'2000000',decimals:6},
  assetConfig:{...TOKEN_BASE.assetConfig,volatility_ratio:6000,
   target_utilization_rate:'1000000000001547125956667610'}}),
 Object.freeze({...TOKEN_BASE,role:'debt',prefix:'tusdc',symbol:'TUSDC',
  name:'ARBIVANE Test USD',marketAsset:true,
  mintTo:{owner:'100000000000000000000000',borrower:'0',
   liquidator:'10000000000000000000000'},
  price:{multiplier:'1000000',decimals:6},
  assetConfig:{...TOKEN_BASE.assetConfig,volatility_ratio:9500}}),
]);

export const SCENARIO=Object.freeze({
 collateralRole:'collateral',
 debtRole:'debt',
 borrowerCollateral:'1000000000000000000000',
 borrowAmount:'1000000000000000000000',
 reserveFunding:{
  collateral:'10000000000000000000000',
  debt:'10000000000000000000000',
 },
 liquidatorRepaymentDeposit:'500000000000000000000',
 liquidation:{
  repay:'55000000000000000000',
  take:'50000000000000000000',
 },
 prices:{
  healthy:{
   collateral:{multiplier:'2000000',decimals:6},
   debt:{multiplier:'1000000',decimals:6},
  },
  unhealthy:{
   collateral:{multiplier:'1000000',decimals:6},
   debt:{multiplier:'1000000',decimals:6},
  },
 },
});

export function tokenAccountIds(owner){
 const result={};
 for(const token of TOKEN_SPECS)result[token.role]=token.prefix+'.'+owner;
 return result;
}

export function createLabManifest(owner){
 owner=validateOwner(owner);
 const tokens=tokenAccountIds(owner);
 const ids={root:owner,lending:'lend.'+owner,oracle:'oracle.'+owner,
  borrower:'borrower.'+owner,liquidator:'liq.'+owner,...tokens};
 if(Object.values(ids).some(id=>id.length>64))
  reject('TESTNET_SUBACCOUNT_ID_TOO_LONG');
 const tokenRows=TOKEN_SPECS.map(token=>({
  role:token.role,accountId:tokens[token.role],symbol:token.symbol,
  name:token.name,decimals:token.decimals,totalSupply:token.totalSupply,
  marketAsset:token.marketAsset,mintTo:token.mintTo,
  price:token.price,assetConfig:token.assetConfig,
 }));
 return {
  schemaVersion:1,network:'testnet',rpc:RPC,purpose:PURPOSE,
  sharedRheaContractMutationsAllowed:false,mainnetExecutionAllowed:false,
  signer:'LOCAL_NEAR_CLI_KEYCHAIN_ONLY',
  accountIds:ids,wasm:SOURCE,tokens:tokenRows,scenario:SCENARIO,
  config:{oracle_account_id:ids.oracle,owner_id:owner,
   booster_token_id:ids.booster,booster_decimals:18,max_num_assets:20,
   maximum_recency_duration_sec:90,maximum_staleness_duration_sec:30,
   minimum_staking_duration_sec:2592000,
   maximum_staking_duration_sec:7776000,
   x_booster_multiplier_at_maximum_staking_duration:30000,
   force_closing_enabled:true},
  fundingTNEAR:{lending:'6.5',oracle:'1.5',borrower:'1.0',liquidator:'1.0',
   booster:'0.8',collateral:'0.8',debt:'0.8'},
  minimumOwnerBalanceTNEAR:'14',
  noLiquidationClaim:true,executionEnabled:false,
 };
}

export function marketTokens(manifest){
 return manifest.tokens.filter(token=>token.marketAsset);
}
export function tokenByRole(manifest,role){
 const token=manifest.tokens.find(value=>value.role===role);
 if(!token)reject('UNKNOWN_TEST_TOKEN_ROLE');
 return token;
}

/** Convert a Burrow/FT test price into a rational number. */
export function priceRatio(price){
 if(!price||typeof price.multiplier!=='string'||
    !/^(0|[1-9][0-9]{0,89})$/.test(price.multiplier)||
    BigInt(price.multiplier)<=0n||!Number.isInteger(price.decimals)||
    price.decimals<0||price.decimals>36)reject('INVALID_TEST_PRICE');
 return {multiplier:BigInt(price.multiplier),decimals:price.decimals};
}

/**
 * Burrow health factor using the contract's documented formula:
 *   collateral_sum = sum(balance * price * volatility_ratio)
 *   borrowed_sum   = sum(balance * price / volatility_ratio)
 *   health         = collateral_sum / borrowed_sum
 * This is a model over explicitly labelled test prices, never a market quote.
 */
export function computeHealth({collateralAmount,debtAmount,collateralToken,
 debtToken,prices}){
 const collPrice=priceRatio(prices[collateralToken.role]);
 const debtPrice=priceRatio(prices[debtToken.role]);
 const coll=BigInt(collateralAmount),debt=BigInt(debtAmount);
 if(coll<0n||debt<=0n)reject('INVALID_HEALTH_BALANCE');
 const collVol=BigInt(collateralToken.assetConfig.volatility_ratio);
 const debtVol=BigInt(debtToken.assetConfig.volatility_ratio);
 const collDec=10n**BigInt(collateralToken.decimals);
 const debtDec=10n**BigInt(debtToken.decimals);
 const collPow=10n**BigInt(collPrice.decimals);
 const debtPow=10n**BigInt(debtPrice.decimals);
 // token amount -> whole tokens -> price -> volatility adjustment
 // health = (coll/collDec * collMult/collPow * collVol/10000)
 //        / (debt/debtDec * debtMult/debtPow / (debtVol/10000))
 const numerator=coll*collPrice.multiplier*collVol*debtDec*debtPow*debtVol;
 const denominator=debt*debtPrice.multiplier*collDec*collPow*10000n*10000n;
 const scaled=(numerator*1000000n)/denominator;
 const health=Number(scaled)/1000000;
 return {health,healthy:health>=1,healthyBps:Number((numerator*10000n)/denominator),
  source:'TEST_PRICE_MODEL',priceData:prices};
}

export function buildPriceData(manifest,kind,{timestamp='__TIMESTAMP_NS__',
 recencyDurationSec=60}={}){
 const prices=manifest.scenario.prices[kind];
 if(!prices)reject('UNKNOWN_TEST_PRICE_SCENARIO');
 if(!/^(__TIMESTAMP_NS__|[0-9]{1,30})$/.test(String(timestamp)))
  reject('INVALID_PRICE_TIMESTAMP');
 const rows=marketTokens(manifest).map(token=>({
  asset_id:token.accountId,price:prices[token.role],
 }));
 if(rows.some(row=>!row.price))reject('MISSING_TEST_PRICE');
 return {timestamp:String(timestamp),recency_duration_sec:recencyDurationSec,
  prices:rows};
}

export function buildExecuteMessage(actions){
 if(!Array.isArray(actions)||actions.length===0)reject('EMPTY_ACTION_LIST');
 return JSON.stringify({Execute:{actions}});
}

export function validateLabManifest(manifest){
 if(!manifest||manifest.network!=='testnet'||manifest.schemaVersion!==1)
  reject('INVALID_TESTNET_LAB_MANIFEST');
 const expected=createLabManifest(manifest.accountIds?.root);
 if(JSON.stringify(manifest)!==JSON.stringify(expected))
  reject('MANIFEST_TAMPERED_OR_INCOMPATIBLE');
 return manifest;
}

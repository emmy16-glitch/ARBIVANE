import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRheaPythMetadata,parseLendingPriceConfig,inspectRheaMarketMetadata} from '../src/rhea/market-metadata.ts';
import {NearReadOnlyRpc} from '../src/rhea/rpc.ts';
const a='a'.repeat(64), b='b'.repeat(64);
const basic={
 'usdc.testnet':{price_identifier:a,default_price:null,decimals:6,fraction_digits:4},
 'eth.testnet':{price_identifier:a,default_price:null,decimals:18,fraction_digits:4},
 'other.testnet':{price_identifier:'',default_price:{multiplier:'1000000',decimals:6},decimals:6},
};
const ids=Object.keys(basic);
const hash1='3'.repeat(43),hash2='4'.repeat(43);

test('deployed Pyth metadata binds feeds by contract token ID and de-duplicates shared feed IDs',()=>{
 const v=parseRheaPythMetadata(basic,ids);
 assert.equal(v.assets.length,3);
 assert.deepEqual(v.uniqueDirectFeeds,[a]);
 assert.equal(v.assets.find(x=>x.assetId==='other.testnet').source,'CONTRACT_DEFAULT');
 assert.equal(v.missingMetadata.length,0);
});
test('metadata parsing is independent of object insertion order',()=>{
 const x=parseRheaPythMetadata(basic,ids);
 const y=parseRheaPythMetadata(Object.fromEntries(Object.entries(basic).reverse()),[...ids].reverse());
 assert.deepEqual(x,y);
});
test('unknown and unlisted assets are flagged rather than assumed priced',()=>{
 const v=parseRheaPythMetadata({...basic, 'extra.testnet':basic['eth.testnet']},[...ids,'missing.testnet']);
 assert.deepEqual(v.missingMetadata,['missing.testnet']);
 assert.deepEqual(v.extraMetadata,['extra.testnet']);
 assert.equal(v.assets.find(x=>x.assetId==='missing.testnet').source,'UNRESOLVED');
});
test('no identifier and no default price is unresolved, not a zero-dollar price',()=>{
 const v=parseRheaPythMetadata({'some.testnet':{price_identifier:'',default_price:null}},['some.testnet']);
 assert.deepEqual(v.unresolvedAssets,['some.testnet']);
});
test('reject invalid/misleading fields, duplicate listed assets, malformed metadata',()=>{
 assert.throws(()=>parseRheaPythMetadata({},[]),/invalid listed/);
 assert.throws(()=>parseRheaPythMetadata({},['usdc.testnet','usdc.testnet']),/duplicate/);
 assert.throws(()=>parseRheaPythMetadata({'usdc.testnet':{price_identifier:'not-a-feed'}},['usdc.testnet']),/invalid on-chain/);
 assert.throws(()=>parseRheaPythMetadata({'usdc.testnet':{price_identifier:a,default_price:{multiplier:'1',decimals:6}}},['usdc.testnet']),/ambiguous/);
 assert.throws(()=>parseRheaPythMetadata({'usdc.testnet':{default_price:{multiplier:'0',decimals:6}}},['usdc.testnet']),/positive integer/);
 assert.throws(()=>parseRheaPythMetadata({'usdc.testnet':{price_identifier:a,decimals:99}},['usdc.testnet']),/range/);
 assert.throws(()=>parseRheaPythMetadata({'usdc.testnet':{price_identifier:a,fraction_digits:-1}},['usdc.testnet']),/integer/);
 assert.throws(()=>parseRheaPythMetadata(null,['usdc.testnet']),/object/);
});
test('lending configuration requires an actual boolean, unknown does not enable',()=>{
 assert.equal(parseLendingPriceConfig({enable_pyth_oracle:true}),true);
 assert.equal(parseLendingPriceConfig({enable_pyth_oracle:false}),false);
 assert.equal(parseLendingPriceConfig({}),null);
 assert.throws(()=>parseLendingPriceConfig({enable_pyth_oracle:'true'}),/invalid/);
});
function mockRpc({wrongBlock=false,missing=false,disable=false,badOracle=false}={}) {
 const calls=[];
 const fetcher=async(_url,options)=>{
  const e=JSON.parse(options.body),p=e.params;
  calls.push(p);
  const wrap=(data)=>({ok:true,json:async()=>({result:data})});
  if(p.request_type==='view_account')return wrap({block_height:12345,code_hash:p.account_id==='rhea.testnet'?hash1:hash2});
  const data=(value)=>wrap({block_height:wrongBlock?12346:12345,result:[...new TextEncoder().encode(JSON.stringify(value))]});
  if(p.method_name==='get_assets_paged')return data(ids.map(id=>[id,{}]));
  if(p.method_name==='get_config')return data({enable_pyth_oracle:!disable});
  if(p.method_name==='get_all_token_pyth_infos'){
   if(badOracle)return {ok:true,json:async()=>({error:{code:-32000,message:'MethodNotFound'}})};
   return data(missing?{...basic,['usdc.testnet']:undefined}:basic);
  }
  throw Error('unexpected read method '+p.method_name);
 };
 return {rpc:new NearReadOnlyRpc('https://rpc.testnet.near.org',fetcher),calls};
}
const cfg={lendingContract:'rhea.testnet',oracleContract:'pyth.testnet'};
test('live inspection pins all six reads to the same finalized block',async()=>{
 const {rpc,calls}=mockRpc(); const report=await inspectRheaMarketMetadata(rpc,cfg);
 assert.equal(report.mode,'METADATA_READ_ONLY');assert.equal(report.executionEnabled,false);
 assert.equal(report.contractParityVerified,false);assert.equal(report.priceParityVerified,false);
 assert.equal(report.status,'METADATA_PRESENT_UNAPPROVED');
 assert.deepEqual(report.uniqueDirectFeeds,[a]);
 assert.equal(report.assets.length,3);
 assert.deepEqual(calls.slice(1).map(c=>c.block_id),Array(4).fill(12345));
 assert.ok(calls.every(c=>c.request_type==='call_function'||c.request_type==='view_account'));
 assert.ok(report.warnings.includes('CODE_HASH_PINS_NOT_APPROVED'));
});
test('correct code hash pins are checked, wrong ones fail before any asset reads',async()=>{
 const ok=await inspectRheaMarketMetadata(mockRpc().rpc,{...cfg,expectedLendingCodeHash:hash1,expectedOracleCodeHash:hash2});
 assert.ok(!ok.warnings.includes('CODE_HASH_PINS_NOT_APPROVED'));
 await assert.rejects(()=>inspectRheaMarketMetadata(mockRpc().rpc,{...cfg,expectedOracleCodeHash:hash1}),/PINNED_ORACLE/);
});
test('stale or conflicting snapshot block fails closed',async()=>{
 await assert.rejects(()=>inspectRheaMarketMetadata(mockRpc({wrongBlock:true}).rpc,cfg),/inconsistent snapshot block/);
});
test('no Pyth enable config or absent mapping cannot satisfy metadata coverage',async()=>{
 const a=await inspectRheaMarketMetadata(mockRpc({disable:true}).rpc,cfg);
 assert.equal(a.status,'INCOMPLETE_METADATA');
 const b=await inspectRheaMarketMetadata(mockRpc({missing:true}).rpc,cfg);
 assert.deepEqual(b.missingMetadata,['usdc.testnet']);assert.equal(b.status,'INCOMPLETE_METADATA');
});
test('unsupported live view method rejects, rather than falling back to a price oracle',async()=>{
 await assert.rejects(()=>inspectRheaMarketMetadata(mockRpc({badOracle:true}).rpc,cfg),/NEAR RPC returned an error/);
});

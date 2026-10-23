import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAggregateOraclePrices, validateVerifiedFeedMappings, readAggregateOraclePriceBatch} from '../src/rhea/aggregate-oracle.ts';
import {probeRheaAggregateOracle} from '../src/rhea/aggregate-probe.ts';
import {NearReadOnlyRpc} from '../src/rhea/rpc.ts';

const near = 'c415de8d2efa7db216527dff4b60e8f3a5311c740dadb233e13e12547e226750';
const usdc = 'eaa020c61cc479712813461ce153894a96a6c00b21ed0cfc2798d1f9a9e9c94a';
const mappings = [{assetId:'wrap.near',priceId:near},{assetId:'usdc.near',priceId:usdc}];
const nowMs = 1792800000000;
const seconds = Math.floor(nowMs/1000);
const options = {nowMs,maxAgeMs:60_000,maxFutureSkewMs:5_000,maxConfidenceBps:250};
const quote = (price='500000000',conf='1000000',expo=-8,publish_time=seconds) => ({price,conf,expo,publish_time});
const validMap = () => ({[near]:quote(),[usdc]:quote('99988242','106758',-8)});

test('Pyth-priced feed parses exact decimal value with integer precision',()=>{
 const prices=parseAggregateOraclePrices(validMap(),mappings,options);
 assert.deepEqual(prices.prices.get('wrap.near').price,{multiplier:500000000n,decimals:8});
 assert.equal(prices.prices.get('usdc.near').price.multiplier,99988242n);
 assert.equal(prices.prices.get('usdc.near').confidenceBps,11n);
 assert.equal(prices.oldestPublishTimeMs,nowMs);
});
test('positive exponent is converted exactly and does not use JS floats',()=>{
 const prices=parseAggregateOraclePrices({[near]:quote('42','1',3)},mappings.slice(0,1),options);
 assert.deepEqual(prices.prices.get('wrap.near').price,{multiplier:42000n,decimals:0});
});
test('missing prices, added price IDs, and null prices all reject',()=>{
 assert.throws(()=>parseAggregateOraclePrices({[near]:quote()},mappings,options),/incomplete/);
 assert.throws(()=>parseAggregateOraclePrices({...validMap(),['a'.repeat(64)]:quote()},mappings,options),/unexpected/);
 assert.throws(()=>parseAggregateOraclePrices({...validMap(),[near]:null},mappings,options),/usable price/);
});
test('stale, future, and overconfident oracle data fails closed',()=>{
 assert.throws(()=>parseAggregateOraclePrices({...validMap(),[near]:quote('500000000','1000000',-8,seconds-65)},mappings,options),/stale/);
 assert.throws(()=>parseAggregateOraclePrices({...validMap(),[near]:quote('500000000','1000000',-8,seconds+10)},mappings,options),/future/);
 assert.throws(()=>parseAggregateOraclePrices({...validMap(),[near]:quote('500000000','40000000')},mappings,options),/confidence/);
});
test('invalid feeds, duplicate mappings, and malformed Pyth numeric values reject',()=>{
 assert.throws(()=>validateVerifiedFeedMappings([]),/bounded/);
 assert.throws(()=>validateVerifiedFeedMappings([{assetId:'wrap.near',priceId:'a'}]),/feed ID/);
 assert.throws(()=>validateVerifiedFeedMappings([mappings[0],mappings[0]]),/duplicate/);
 assert.throws(()=>parseAggregateOraclePrices({...validMap(),[near]:quote('-2')},mappings,options),/nonpositive/);
 assert.throws(()=>parseAggregateOraclePrices({...validMap(),[near]:quote('3','1',-40)},mappings,options),/exponent/);
 assert.throws(()=>parseAggregateOraclePrices({...validMap(),[near]:quote('3','1',-8,'abc')},mappings,options),/publish_time/);
 assert.throws(()=>parseAggregateOraclePrices({...validMap(),[near]:quote(999999999999999999)},mappings,options),/price/);
});
function createRpc({wrongBlock=false,missingAsset=false,failPrice=false}={}){
 const log=[];
 const fetcher=async(_url,options)=>{
  const {method,params}=JSON.parse(options.body);log.push({method,params});
  const response=result=>({ok:true,json:async()=>({result})});
  if(params.request_type==='view_account')return response({block_height:12345,code_hash:params.account_id==='contract.main.burrow.near'?'3'.repeat(43):'4'.repeat(43)});
  const view=value=>response({block_height:wrongBlock?12346:12345,result:[...new TextEncoder().encode(JSON.stringify(value))]});
  if(params.method_name==='get_assets_paged')return view([[missingAsset?'fake.near':'wrap.near',{test:true}],['usdc.near',{test:true}]]);
  if(params.method_name==='list_prices_no_older_than'){
    if(failPrice)return {ok:true,json:async()=>({error:{code:-32000,message:'bad feed'}})};
    const all=validMap();
    const args=JSON.parse(Buffer.from(params.args_base64,'base64').toString());
    return view(Object.fromEntries(args.price_ids.map(id=>[id,all[id]])));
  }
  throw Error('unexpected RPC method');
 };
 return {rpc:new NearReadOnlyRpc('https://rpc.test.example',fetcher),log};
}
test('read batch pins aggregate oracle call to the supplied block',async()=>{
 const {rpc,log}=createRpc();
 const data=await readAggregateOraclePriceBatch(rpc,'aggregate-oracle.near',12345,mappings,options);
 assert.equal(data.blockHeight,'12345');
 assert.deepEqual(JSON.parse(Buffer.from(log[0].params.args_base64,'base64').toString()),{price_ids:[near,usdc]});
 assert.equal(log[0].params.block_id,12345);
});
test('aggregate oracle probe reports partial coverage; never claims executable parity',async()=>{
 const {rpc,log}=createRpc();
 const result=await probeRheaAggregateOracle(rpc,{lendingContract:'contract.main.burrow.near',oracleContract:'aggregate-oracle.near',feedMappings:mappings.slice(0,1),nowMs});
 assert.equal(result.result,'PARTIAL_FEED_READS');
 assert.equal(result.executionEnabled,false);
 assert.equal(result.exactContractParityVerified,false);
 assert.ok(result.warnings.includes('PARTIAL_ASSET_COVERAGE_NOT_SUITABLE_FOR_MARKET_WIDE_VALUATION'));
 assert.ok(log.every(call=>call.method==='query'));
});
test('aggregate oracle probe reports all mapped assets while retaining parity warning',async()=>{
 const {rpc,log}=createRpc();
 const result=await probeRheaAggregateOracle(rpc,{lendingContract:'contract.main.burrow.near',oracleContract:'aggregate-oracle.near',feedMappings:mappings,nowMs});
 assert.equal(result.result,'ALL_LISTED_FEEDS_READ');
 assert.equal(result.exactContractParityVerified,false);
 assert.ok(result.warnings.includes('FEED_MAP_IS_OPERATOR_SUPPLIED_NOT_ONCHAIN_VERIFIED'));
 assert.equal(log.length,4);
 for(const row of log.slice(1))assert.equal(row.params.block_id,12345);
});
test('aggregate oracle probe refuses wrong asset feed, wrong block and code-hash pin mismatch',async()=>{
 for(const cfg of [{missingAsset:true},{wrongBlock:true},{failPrice:true}]){
  const {rpc}=createRpc(cfg);
  const report=await probeRheaAggregateOracle(rpc,{lendingContract:'contract.main.burrow.near',oracleContract:'aggregate-oracle.near',feedMappings:mappings,nowMs});
  assert.equal(report.result,'INCOMPATIBLE_READS');
  assert.equal(report.failures.length,1);
 }
 const {rpc}=createRpc();
 const pinned=await probeRheaAggregateOracle(rpc,{lendingContract:'contract.main.burrow.near',oracleContract:'aggregate-oracle.near',feedMappings:mappings,expectedOracleCodeHash:'5'.repeat(43),nowMs});
 assert.equal(pinned.failures[0],'PINNED_ORACLE_CODE_HASH_MISMATCH');
});

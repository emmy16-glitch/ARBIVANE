import test from 'node:test';
import assert from 'node:assert/strict';
import { NearReadOnlyRpc } from '../src/rhea/rpc.ts';
import { probeRheaReadCompatibility } from '../src/rhea/probe.ts';

const codeA = '3'.repeat(43);
const codeB = '4'.repeat(43);
const timeMs = 1792800000000;
const requestLog = [];
function createRpc({oracleFailure=false, invalidOracle=false}={}) {
  const fetcher=async (_url,options)=>{
    const {method, params}=JSON.parse(options.body);
    requestLog.push({method,params});
    const reply = (result) => ({ok:true,json:async()=>({jsonrpc:'2.0',id:1,result})});
    const view = value => reply({block_height:12345, result:[...new TextEncoder().encode(JSON.stringify(value))]});
    if(params.request_type==='view_account') return reply({block_height:12345,code_hash:params.account_id==='lending.near'?codeA:codeB});
    switch(params.method_name){
      case 'get_assets_paged': return view([['wrap.near',{supplied:{shares:'10000',balance:'10000'},borrowed:{shares:'10000',balance:'10000'},config:{volatility_ratio:5000,extra_decimals:0,can_borrow:true}}]]);
      case 'get_num_accounts': return view('1');
      case 'get_price_data':
        if(oracleFailure) return {ok:true,json:async()=>({jsonrpc:'2.0',id:1,error:{code:-32000,message:'method not found'}})};
        return view(invalidOracle?{}:{timestamp:String(BigInt(timeMs)*1000000n),prices:[{asset_id:'wrap.near',price:{multiplier:'7000000',decimals:6}}]});
      case 'get_accounts_paged': return view([{account_id:'alice.near',collateral:{},borrowed:{},supplied:{}}]);
      default: throw Error('unexpected RPC method');
    }
  };
  return new NearReadOnlyRpc('https://rpc.example.org',fetcher);
}
const cfg=()=>({lendingContract:'lending.near',oracleContract:'aggregate.near',nowMs:timeMs+5_000});
test('public protocol probe passes only schema and finalized-block checks; no execution authority', async()=>{
 requestLog.length=0;
 const r=await probeRheaReadCompatibility(createRpc(),cfg());
 assert.equal(r.result,'COMPATIBLE_READS');
 assert.equal(r.executionEnabled,false);
 assert.equal(r.exactContractParityVerified,false);
 assert.equal(r.lending.observedCodeHash,codeA);
 assert.equal(r.oracle.observedCodeHash,codeB);
 assert.equal(r.oracleAgeMs,5000);
 assert.equal(r.observedAccounts,1);
 assert.ok(r.warnings.includes('CODE_HASHES_OBSERVED_BUT_NOT_APPROVED'));
 assert.equal(requestLog.length,6);
 for(const item of requestLog.slice(1))assert.equal(item.params.block_id,12345);
 assert.equal(requestLog.some(x=>!['query'].includes(x.method)),false);
});
test('contract code mismatch fails closed before reading assets or prices', async()=>{
 requestLog.length=0;
 const r=await probeRheaReadCompatibility(createRpc(),{...cfg(),expectedLendingCodeHash:'5'.repeat(43)});
 assert.equal(r.result,'INCOMPATIBLE_READS');
 assert.equal(r.steps.at(-1).reason,'PINNED_CODE_HASH_MISMATCH');
 assert.equal(requestLog.length,2);
});
test('oracle method missing is reported incompatible without pretending to fall back', async()=>{
 const r=await probeRheaReadCompatibility(createRpc({oracleFailure:true}),cfg());
 assert.equal(r.result,'INCOMPATIBLE_READS');
 assert.equal(r.steps.at(-1).name,'oracle_get_price_data_schema');
 assert.equal(r.steps.at(-1).state,'FAIL');
});
test('oracle schema mismatch fails closed', async()=>{
 const r=await probeRheaReadCompatibility(createRpc({invalidOracle:true}),cfg());
 assert.equal(r.result,'INCOMPATIBLE_READS');
 assert.equal(r.steps.at(-1).name,'oracle_get_price_data_schema');
});
test('mismatched block response and no-contract accounts are rejected',async()=>{
 const different=async(_url,opts)=>{ const req=JSON.parse(opts.body); return {ok:true,json:async()=>({result:{block_height:987,code_hash:codeA}})};};
 await assert.rejects(()=>new NearReadOnlyRpc('https://example.org',different).viewAccount('lending.near',12345),/inconsistent/);
 const noCode=async()=>({ok:true,json:async()=>({result:{block_height:12345,code_hash:'11111111111111111111111111111111'}})});
 await assert.rejects(()=>new NearReadOnlyRpc('https://example.org',noCode).viewAccount('lending.near'),/code hash/);
});
test('probe refuses invalid config and unsafe oracle age',async()=>{
 await assert.rejects(()=>probeRheaReadCompatibility(createRpc(),{...cfg(),oracleContract:'lending.near'}),/differ/);
 await assert.rejects(()=>probeRheaReadCompatibility(createRpc(),{...cfg(),maxAssets:1_000_000}),/maximum assets/);
 const r=await probeRheaReadCompatibility(createRpc(),{...cfg(),nowMs:timeMs+61_000});
 assert.equal(r.result,'INCOMPATIBLE_READS');
 assert.equal(r.steps.at(-1).name,'oracle_get_price_data_schema');
});

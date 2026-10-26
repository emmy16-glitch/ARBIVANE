import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {selectStage164PricingClosure,attestStage164PricingClosure}
 from '../scripts/stage164-source-pricing-closure.mjs';

const base=['contract.main.burrow.near','aggregate-oracle.near','wrap.near',
 'linear-protocol.near'];
const metadata={
 'linear-protocol.near':{price_identifier:'f'.repeat(64),extra_call:'ft_price',default_price:null},
 'meta-pool.near':{price_identifier:'a'.repeat(64),extra_call:'get_st_near_price',default_price:null},
 'wrap.near':{price_identifier:'b'.repeat(64),extra_call:null,default_price:null},
};
const borrowerPositions={positions:{REGULAR:{
 collateral:[{token_id:'meta-pool.near'},{token_id:'linear-protocol.near'}],
 borrowed:[{token_id:'linear-protocol.near'}],
}}};
const expected={mode:'STAGE164_PINNED_RHEA_DERIVED_PRICE_CLOSURE'};
const height=221729631;
const input=(priceInfos=metadata)=>({baseIds:base,priceInfos,borrowerPositions});
function harness(sourceValue='1250000000000000000000000',localValue=sourceValue){
 const rpc={view:async(id,method,args,block)=>({
  blockHeight:String(block),value:sourceValue,
 })};
 const contracts=new Map([
  ['meta-pool.near',{accountId:'meta-pool.near',view:async()=>localValue}],
  ['linear-protocol.near',{accountId:'linear-protocol.near',view:async()=>localValue}],
 ]);
 return {rpc,contracts,blockHeight:height};
}
test('Stage164 imports deployed meta-pool collateral pricing contract beyond LiNEAR route',()=>{
 const result=selectStage164PricingClosure(input());
 assert.deepEqual(result.ids,[...base,'meta-pool.near']);
 assert.deepEqual(result.dependencies,[
  {contractId:'linear-protocol.near',method:'ft_price'},
  {contractId:'meta-pool.near',method:'get_st_near_price'},
 ]);
 assert.equal(new Set(result.ids).size,result.ids.length);
});
test('Stage164 checks exact original pinned source and cloned derived pricing views',async()=>{
 const {dependencies}=selectStage164PricingClosure(input());
 const got=await attestStage164PricingClosure({...harness(),dependencies});
 assert.equal(got.mode,expected.mode);
 assert.equal(got.clonedPricingDependencyCount,2);
 assert.equal(got.sourceAndSandboxDerivedPricesMatch,true);
 assert.equal(got.actualLiquidationVerified,false);
 assert.equal(got.mainnetExecutionEnabled,false);
});
test('Stage164 never accepts missing mock pricing contracts, ratio drift or forged block',async()=>{
 const {dependencies}=selectStage164PricingClosure(input());
 const bad=harness('123','124');
 await assert.rejects(()=>attestStage164PricingClosure({...bad,dependencies}),
  /STAGE164_DERIVED_PRICE_SOURCE_CLONE_MISMATCH/);
 const miss=harness();miss.contracts.delete('meta-pool.near');
 await assert.rejects(()=>attestStage164PricingClosure({...miss,dependencies}),
  /STAGE164_DERIVED_PRICE_DEPENDENCY_NOT_CLONED/);
 const drift=harness();drift.rpc.view=async()=>({blockHeight:String(height+1),value:'12'});
 await assert.rejects(()=>attestStage164PricingClosure({...drift,dependencies}),
  /STAGE164_PINNED_SOURCE_RATIO_BLOCK_DRIFT/);
 const zero=harness('0','0');
 await assert.rejects(()=>attestStage164PricingClosure({...zero,dependencies}),
  /STAGE164_DERIVED_PRICE_SOURCE_CLONE_MISMATCH/);
});
test('Stage164 never invents an unexpected derived method or permits unlimited imports',()=>{
 const valid=input();
 for(const extra_call of ['evil_price','delete_all','']){
  assert.throws(()=>selectStage164PricingClosure({...input(),priceInfos:{
   ...metadata,'meta-pool.near':{...metadata['meta-pool.near'],extra_call}
  }}),/STAGE164_UNSUPPORTED_SOURCE_DERIVED_PRICE_METHOD/);
 }
 assert.throws(()=>selectStage164PricingClosure({...input(),priceInfos:{
  ...metadata,'meta-pool.near':{...metadata['meta-pool.near'],
   default_price:{multiplier:'1',decimals:0}}
 }}),/STAGE164_UNSUPPORTED_SOURCE_DERIVED_PRICE_METHOD/);
 const crowded=Object.fromEntries(Array.from({length:8},(_,i)=>[
  'asset'+i+'.near',{extra_call:'ft_price',default_price:null}]));
 const manyPositions={positions:{REGULAR:{borrowed:[],
  collateral:Object.keys(crowded).map(token_id=>({token_id}))}}};
 assert.throws(()=>selectStage164PricingClosure({
  baseIds:base,priceInfos:crowded,borrowerPositions:manyPositions,
 }),/STAGE164_UNSUPPORTED_DEPENDENCY_CLOSURE_SIZE/);
 assert.throws(()=>selectStage164PricingClosure({...input(),baseIds:['contract.main.burrow.near']}),
  /STAGE164_UNTRUSTED_PINNED_PRICE_DEPENDENCIES/);
});
test('Stage164 replay clones new dependencies and checks their views before funding and Rhea callback',async()=>{
 const runner=await readFile(new URL('../scripts/stage37-workspaces-sandbox-replay.mjs',import.meta.url),'utf8');
 assert.ok(runner.includes('selectStage164PricingClosure({'));
 assert.ok(runner.includes('get_all_token_pyth_infos'));
 assert.ok(runner.includes('const ids=priceClosure.ids'));
 assert.ok(runner.includes('cloneStage76Dependencies({'));
 assert.ok(runner.includes('attestStage164PricingClosure({'));
 assert.ok(runner.indexOf('attestStage164PricingClosure({')<runner.indexOf('sandboxTransactionSubmitted=true'));
 assert.ok(runner.indexOf('attestStage164PricingClosure({')<runner.indexOf('seedSandboxLiquidatorWithWrappedNear({'));
 assert.ok(runner.includes('stage164-derived-price-parity.json'));
 assert.ok(!runner.includes('broadcast_tx'));
});


test('Stage165 skips irrelevant market-wide derived price contracts, but retains borrower stNEAR dependency',()=>{
 const market={...metadata,
  'nearx.stader-labs.near':{extra_call:'get_nearx_price',default_price:null},
  'other-price.near':{extra_call:'ft_price',default_price:null},
  'unrelated-future.near':{extra_call:'unknown_upstream_method',default_price:null},
 };
 const closure=selectStage164PricingClosure(input(market));
 assert.deepEqual(closure.ids,[...base,'meta-pool.near']);
 assert.equal(closure.borrowerPositionScoped,true);
 assert.equal(closure.dependencies.length,2);
 assert.ok(!closure.ids.includes('nearx.stader-labs.near'));
});
test('Stage165 rejects incomplete or forged pinned borrower position data before cloning',()=>{
 assert.throws(()=>selectStage164PricingClosure({...input(),borrowerPositions:null}),
  /STAGE164_UNTRUSTED_PINNED_PRICE_DEPENDENCIES/);
 assert.throws(()=>selectStage164PricingClosure({...input(),
  borrowerPositions:{positions:{REGULAR:{collateral:[],borrowed:[{token_id:'BAD SPACE'}]}}}}),
  /STAGE165_INVALID_PINNED_BORROWER_ASSET/);
 assert.throws(()=>selectStage164PricingClosure({...input(),
  borrowerPositions:{positions:{REGULAR:{collateral:[]}}}}),
  /STAGE165_INVALID_PINNED_BORROWER_POSITION/);
});


test('Stage166 transient 429 uses independent pinned archival source while retaining exact ratio parity',async()=>{
 const {NearRpcHttpError}=await import('../src/rhea/rpc.ts');
 const {dependencies}=selectStage164PricingClosure(input());
 const p=harness();
 let fallbackCalls=0,events=[];
 p.rpc.view=async()=>{throw new NearRpcHttpError(429,'0');};
 const fallbackRpc={view:async(id,method,args,block)=>{
  fallbackCalls++;assert.equal(block,height);
  return {blockHeight:String(height),value:'1250000000000000000000000'};
 }};
 const got=await attestStage164PricingClosure({...p,dependencies,
  fallbackRpc,onDiagnostic:async v=>events.push(v)});
 assert.equal(got.clonedPricingDependencyCount,2);
 assert.equal(got.transientPinnedFallbacks,2);
 assert.equal(fallbackCalls,2);
 assert.equal(got.sourceAndSandboxDerivedPricesMatch,true);
 assert.deepEqual(events.map(x=>x.status),['PINNED_RATIO_PARITY_PASS','PINNED_RATIO_PARITY_PASS']);
 assert.ok(events.every(x=>x.fallbackAttempted===true));
 assert.equal(got.realMainnetExecuted,undefined);
 assert.equal(got.mainnetExecutionEnabled,false);
});
test('Stage166 NEVER falls back on contract panics, source block drift or changed prices',async()=>{
 const {dependencies}=selectStage164PricingClosure(input());
 const panic=harness();let calls=0,events=[];
 panic.rpc.view=async()=>{throw Error('contract panicked: original source');};
 const fallbackRpc={view:async()=>{calls++;return {blockHeight:String(height),value:'1'}}};
 await assert.rejects(()=>attestStage164PricingClosure({
  ...panic,dependencies,fallbackRpc,onDiagnostic:async v=>events.push(v),
 }),/STAGE164_PINNED_SOURCE_RATIO_VIEW_FAILED/);
 assert.equal(calls,0);
 assert.equal(events[0].status,'NONTRANSIENT_SOURCE_VIEW_REJECTED');
 const altered=harness('1','2');
 await assert.rejects(()=>attestStage164PricingClosure({...altered,dependencies,fallbackRpc}),
  /STAGE164_DERIVED_PRICE_SOURCE_CLONE_MISMATCH/);
 assert.equal(calls,0);
 const cross=harness();cross.rpc.view=async()=>({blockHeight:String(height+1),
  value:'1250000000000000000000000'});
 await assert.rejects(()=>attestStage164PricingClosure({...cross,dependencies,fallbackRpc}),
  /STAGE164_PINNED_SOURCE_RATIO_BLOCK_DRIFT/);
 assert.equal(calls,0);
});
test('Stage166 fails closed when independent archival fallback is unavailable or returns different block',async()=>{
 const {NearRpcHttpError}=await import('../src/rhea/rpc.ts');
 const {dependencies}=selectStage164PricingClosure(input());
 const p=harness();let events=[];
 p.rpc.view=async()=>{throw new NearRpcHttpError(503,'0');};
 let fallbackRpc={view:async()=>{throw Error('archival is unavailable')}};
 await assert.rejects(()=>attestStage164PricingClosure({
  ...p,dependencies,fallbackRpc,onDiagnostic:async x=>events.push(x),
 }),/STAGE166_PINNED_ARCHIVAL_RATIO_FALLBACK_FAILED/);
 assert.equal(events[0].status,'PINNED_ARCHIVAL_FALLBACK_FAILED');
 fallbackRpc={view:async()=>({blockHeight:String(height+1),value:'10'})};
 await assert.rejects(()=>attestStage164PricingClosure({
  ...p,dependencies,fallbackRpc,
 }),/STAGE164_PINNED_SOURCE_RATIO_BLOCK_DRIFT/);
});
test('Stage166 runner uses archive pinned RPC and persists safe original pricing diagnostics BEFORE signing',async()=>{
 const runner=await readFile(new URL('../scripts/stage37-workspaces-sandbox-replay.mjs',import.meta.url),'utf8');
 assert.ok(runner.includes('new NearReadOnlyRpc(archivePrimary)'));
 assert.ok(runner.includes('new NearReadOnlyRpc(archiveSecondary)'));
 assert.ok(runner.includes('fallbackRpc:stage166Fallback'));
 assert.ok(runner.includes('stage166-pinned-pricing-read-diagnostics.json'));
 assert.ok(runner.indexOf('onDiagnostic,')<runner.indexOf('sandboxTransactionSubmitted=true'));
 assert.ok(!runner.includes('broadcast_tx'));
});

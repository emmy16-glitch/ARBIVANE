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

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {attestStage52BorrowCollateralCapacity,stage172WnearQuoteDifference}
 from '../scripts/stage52-solvent-sandbox-borrow-capacity.mjs';

const H=221440179,E27=10n**27n,NEAR=10n**24n;
const P='contract.main.burrow.near',O='aggregate-oracle.near';
const feed='a'.repeat(64);
const config={enable_pyth_oracle:true,enable_price_oracle:false,
 pyth_oracle_account_id:O,pyth_price_valid_duration_sec:60};
function input(patch={}){
 const plan={
  mode:'ARBIVANE_STAGE37_ISOLATED_SANDBOX_LIQUIDATION_PLAN',
  chain:'NEAR_SANDBOX',mainnetSourceBlockHeight:String(H),
  lendingContract:P,executionEnabled:false,maySignMainnet:false,
  mayBroadcastMainnet:false,actions:[{Borrow:{token_id:'usdt.tether-token.near',
   amount:'100000000000000000000'}},{Liquidate:{account_id:'debtor.near',
   in_assets:[{token_id:'usdt.tether-token.near',amount:'100000000000000000000'}],
   out_assets:[{token_id:'wrap.near',amount:'101000000000000000000'}]}},
   {Withdraw:{token_id:'wrap.near',amount:'101000000000000000000'}}]
 };
 const proposal={
  mode:'RHEA_STAGE35_PINNED_SOURCE_ONLY_LIQUIDATION_SIZING',
  chain:'NEAR_MAINNET',referenceRulesPass:true,executionEnabled:false,
  mayBroadcast:false,blockHeight:String(H),
  repay:{tokenId:'usdt.tether-token.near',amountLendingInternalAtomic:
   '100000000000000000000',referenceUsdE27:E27.toString()}
 };
 const info={'wrap.near':{decimals:24,price_identifier:feed,
  fraction_digits:4,default_price:null,extra_call:null}};
 const quote={price:'500000000',expo:-8,conf:'200',publish_time:'1792900000'};
 const assets=[
  ['wrap.near',{config:{can_use_as_collateral:true,volatility_ratio:8000,extra_decimals:0}}],
  ['usdt.tether-token.near',{config:{can_borrow:true,volatility_ratio:10000}}]
 ];
 const actorPositions={positions:{REGULAR:{borrowed:[],collateral:[
  {token_id:'wrap.near',balance:NEAR.toString(),shares:NEAR.toString()}
 ]}}};
 const fn=(id,method)=>{
  if(id===P&&method==='get_config')return config;
  if(id===P&&method==='get_all_token_pyth_infos')return info;
  if(id===O&&method==='get_price_no_older_than')return quote;
  throw Error('unexpected view');
 };
 const rpc={view:async(id,method,args,height)=>({
  value:fn(id,method),blockHeight:patch.crossBlock?'221440180':String(height)
 })};
 const contracts=new Map([P,O,'wrap.near'].map(id=>[id,{
  accountId:id,view:async(method,args)=>{
   if(patch.cloneDrift&&id===O)return {...quote,price:'999'};
   return fn(id,method,args);
  }}]));
 return {rpc,contracts,plan,proposal,actorPositions,pinnedAssets:assets,blockHeight:H,...patch};
}
test('Stage52 values real WNEAR actor collateral and compares adjusted reference borrow with 125% buffer',async()=>{
 const x=await attestStage52BorrowCollateralCapacity(input());
 assert.equal(x.actorCoveredByConservativeReference,true);
 assert.equal(x.collateralReferenceUsdE27,(5n*E27).toString());
 assert.equal(x.collateralAdjustedUsdE27,(4n*E27).toString());
 assert.equal(x.borrowAdjustedUsdE27,E27.toString());
 assert.equal(x.minimumCollateralBufferBps,12500);
 assert.equal(x.deployedRheaBorrowPermissionVerified,false);
 assert.equal(x.positiveNetProfitVerified,false);
 assert.equal(x.mayBroadcastMainnet,false);
});
test('real but insufficient local collateral blocks even when borrowed pool has supply',async()=>{
 const x=input();
 x.proposal.repay.referenceUsdE27=(4n*E27).toString();
 const a=await attestStage52BorrowCollateralCapacity(x);
 assert.equal(a.status,'BLOCKED_ACTOR_REFERENCE_COLLATERAL_INSUFFICIENT');
 assert.equal(a.actorCoveredByConservativeReference,false);
});
test('rejects borrower debt, missing collateral, unsupported collateral and mixed borrower source',async()=>{
 const inputs=[
  {actorPositions:{positions:{}}},
  {actorPositions:{positions:{REGULAR:{borrowed:[{token_id:'usdt.tether-token.near',
   balance:'1',shares:'1'}],collateral:[{token_id:'wrap.near',balance:NEAR.toString(),shares:NEAR.toString()}]}}}},
  {actorPositions:{positions:{REGULAR:{borrowed:[],collateral:[
   {token_id:'fake.near',balance:NEAR.toString(),shares:NEAR.toString()}]}}}},
  {plan:{...input().plan,mayBroadcastMainnet:true}},
  {proposal:{...input().proposal,referenceRulesPass:false}},
  {pinnedAssets:[['wrap.near',{config:{can_use_as_collateral:false,volatility_ratio:8000,extra_decimals:0}}],
   input().pinnedAssets[1]]},
  {crossBlock:true},
  {cloneDrift:true},
 ];
 for(const p of inputs)
  await assert.rejects(()=>attestStage52BorrowCollateralCapacity(input(p)),/STAGE52_/);
});
test('default price metadata works without live Pyth feed but remains a reference estimate',async()=>{
 const x=input();
 const meta={...x.contracts.get(P)};
 const m={'wrap.near':{decimals:24,default_price:{multiplier:'50000',decimals:28},
  extra_call:null,fraction_digits:4,price_identifier:null}};
 x.rpc.view=async(id,method,args,height)=>({
  value:id===P&&method==='get_all_token_pyth_infos'?m:
   id===P&&method==='get_config'?config:null,
  blockHeight:String(height)
 });
 x.contracts.get(P).view=async method=>
  method==='get_all_token_pyth_infos'?m:config;
 const a=await attestStage52BorrowCollateralCapacity(x);
 assert.equal(a.actorCoveredByConservativeReference,true);
 assert.equal(a.collateralReferenceUsdE27,(5n*E27).toString());
});
test('Stage52 gate executes after verified local funding but before Rhea call and submits no mainnet tx',async()=>{
 const script=await readFile(new URL('../scripts/stage37-workspaces-sandbox-replay.mjs',import.meta.url),'utf8');
 assert.ok(script.includes('attestStage52BorrowCollateralCapacity'));
 assert.ok(script.includes('stage52-actor-borrow-capacity.json'));
 assert.ok(script.indexOf('seedSandboxLiquidatorWithWrappedNear({')<
  script.indexOf('const boundedCapacity=await'));
 assert.ok(script.indexOf('const boundedCapacity=await')<
  script.indexOf('sandboxTransactionSubmitted=true'));
 assert.ok(script.includes("NEAR_WORKSPACES_NETWORK!=='sandbox'"));
 assert.ok(!script.includes('broadcast_tx'));
});

test('Stage172 preserves all-field oracle quote integrity but ignores insignificant JSON key order',async()=>{
 const source={price:'500000000',expo:-8,conf:'200',publish_time:'1792900000'};
 const reordered={publish_time:'1792900000',conf:'200',expo:-8,price:'500000000'};
 assert.equal(stage172WnearQuoteDifference(source,reordered).status,'PINNED_QUOTE_MATCH');
 assert.equal(stage172WnearQuoteDifference(source,null).reason,'SANDBOX_QUOTE_EXPIRED_OR_MISSING');
 const drift=stage172WnearQuoteDifference(source,{...source,publish_time:'1792900001'});
 assert.equal(drift.status,'BLOCKED_PINNED_QUOTE_DIFFERENT');
 assert.deepEqual(drift.changedFields,['publish_time']);
 assert.equal(drift.oraclePriceSubstituted,false);
 assert.equal(drift.oracleFreshnessChanged,false);
 assert.equal(drift.mainnetExecutionEnabled,false);
 assert.equal(drift.mayBroadcastMainnet,false);
 const x=input();
 x.contracts.get(O).view=async()=>reordered;
 const capacity=await attestStage52BorrowCollateralCapacity(x);
 assert.equal(capacity.actorCoveredByConservativeReference,true);
});
test('Stage172 actual changed oracle price still fails before liquidation',async()=>{
 const source={price:'500000000',expo:-8,conf:'200',publish_time:'1792900000'};
 const changed={...source,price:'900000000'};
 const difference=stage172WnearQuoteDifference(source,changed);
 assert.equal(difference.reason,'VALUE_OR_PUBLICATION_DRIFT');
 assert.deepEqual(difference.changedFields,['price']);
 const x=input();
 x.contracts.get(O).view=async()=>changed;
 await assert.rejects(()=>attestStage52BorrowCollateralCapacity(x),/STAGE52_WRAPPED_PYTH_FEED_CLONE_MISMATCH/);
});

test('Stage172 archive and bounded continuation preserve genuine failed Sandbox evidence',async()=>{
 const workflow=await readFile(new URL('../.github/workflows/rhea-stage157-larger-source-sandbox.yml',import.meta.url),'utf8');
 assert.ok(workflow.includes('stage172-wnear-pyth-parity-diagnostics.json'));
 assert.ok(workflow.includes("stage52-solvent-sandbox-borrow-capacity.mjs"));
 assert.ok(workflow.includes('actualRheaSettlementVerified == true'));
 assert.ok(workflow.includes("contains(fromJSON("));
 assert.ok(workflow.includes('settled > 0 || STAGE157_BATCH >= 3'));
 const runner=await readFile(new URL('../scripts/stage37-workspaces-sandbox-replay.mjs',import.meta.url),'utf8');
 assert.ok(runner.includes("diagnosticPath:'stage172-wnear-pyth-parity-diagnostics.json'"));
 assert.ok(runner.indexOf('attestStage52BorrowCollateralCapacity')<
  runner.indexOf('sandboxTransactionSubmitted=true'));
});

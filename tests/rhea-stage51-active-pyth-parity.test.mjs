import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {attestStage51PythParity} from '../scripts/stage51-active-pyth-sandbox-parity.mjs';

const borrower='borrower.near',lending='contract.main.burrow.near';
const oracle='aggregate-oracle.near',blockHeight=221440179;
const feedA='a'.repeat(64),feedB='b'.repeat(64);
const config={
 enable_pyth_oracle:true,enable_price_oracle:false,
 pyth_oracle_account_id:oracle,pyth_price_valid_duration_sec:60,
};
const metadata={
 'usdt.tether-token.near':{decimals:6,price_identifier:feedA,
  default_price:null,extra_call:null},
 'wrap.near':{decimals:24,price_identifier:feedB,
  default_price:null,extra_call:'ft_price'},
};
const quotes={
 [feedA]:{price:'100000000',expo:-8,conf:'200',publish_time:'1792900000'},
 [feedB]:{price:'320000000',expo:-8,conf:'100',publish_time:'1792900000'},
};
const plan=()=>({
 mode:'ARBIVANE_STAGE37_ISOLATED_SANDBOX_LIQUIDATION_PLAN',
 chain:'NEAR_SANDBOX',lendingContract:lending,borrowerAccountId:borrower,
 mainnetSourceBlockHeight:String(blockHeight),executionEnabled:false,
 maySignMainnet:false,mayBroadcastMainnet:false,
 actions:[
  {Borrow:{token_id:'usdt.tether-token.near',amount:'100'}},
  {Liquidate:{account_id:borrower,in_assets:[{token_id:'usdt.tether-token.near',amount:'100'}],
   out_assets:[{token_id:'wrap.near',amount:'111'}]}},
  {Withdraw:{token_id:'wrap.near',amount:'111'}},
 ]
});
const clone=(id,fn)=>({accountId:id,view:async(method,args)=>fn(id,method,args)});
function harness(change={}){
 const source=(id,method,args)=>{
  if(id===lending&&method==='get_config')return config;
  if(id===lending&&method==='get_all_token_pyth_infos')return metadata;
  if(id===oracle&&method==='get_price_no_older_than')return quotes[args.price_id];
  if(id==='wrap.near'&&method==='ft_price')return '1000000000000000000000000';
  throw Error('unexpected source '+id+' '+method);
 };
 const local=(id,method,args)=>source(id,method,args);
 const rpc={view:async(id,method,args,height)=>{
  if(height!==blockHeight)throw Error('un-pinned');
  const value=change.source?change.source(id,method,args,source):source(id,method,args);
  return {blockHeight:change.drift?'221440180':String(height),value};
 }};
 const contracts=new Map([lending,oracle,'wrap.near','usdt.tether-token.near'].map(id=>[
  id,clone(id,(account,method,args)=>
   change.local?change.local(account,method,args,local):local(account,method,args)),
 ]));
 if(change.drop)contracts.delete(change.drop);
 return {rpc,contracts,plan:change.plan??plan(),blockHeight};
}
test('Stage51 verifies Rhea active Pyth feeds and token conversion against real pinned source views',async()=>{
 const witness=await attestStage51PythParity(harness());
 assert.equal(witness.mode,'ARBIVANE_STAGE51_ACTIVE_PYTH_SANDBOX_VIEW_PARITY');
 assert.equal(witness.uniqueFeedsChecked,2);
 assert.equal(witness.derivedPriceRatiosChecked,1);
 assert.equal(witness.pinnedSourceAndSandboxPythViewsMatch,true);
 assert.equal(witness.oracleWasFreshAtLiveExecutionTimeVerified,false);
 assert.equal(witness.realRheaLiquidationVerified,false);
 assert.equal(witness.mayBroadcastMainnet,false);
});
test('altered cloned Pyth price and raw token conversion must reject BEFORE a liquidation',async()=>{
 const q=harness({local:(id,method,args,base)=>{
  if(id===oracle&&method==='get_price_no_older_than')
   return {...base(id,method,args),price:'999999'};
  return base(id,method,args);
 }});
 await assert.rejects(()=>attestStage51PythParity(q),/STAGE51_IMPORTED_PYTH_FEED_QUOTE_DIFFERENT/);
 const r=harness({local:(id,method,args,base)=>{
  if(id==='wrap.near'&&method==='ft_price')return '1';
  return base(id,method,args);
 }});
 await assert.rejects(()=>attestStage51PythParity(r),/STAGE51_IMPORTED_PRICE_RATIO_DIFFERENT/);
});
test('cross-block views, fake metadata, unconfigured oracle, missing clone and authorization reject',async()=>{
 const variants=[
  harness({drift:true}),
  harness({drop:oracle}),
  harness({plan:{...plan(),executionEnabled:true}}),
  harness({source:(id,method,args,base)=>id===lending&&method==='get_config'?
   {...config,enable_pyth_oracle:false}:base(id,method,args)}),
  harness({local:(id,method,args,base)=>id===lending&&method==='get_all_token_pyth_infos'?
   {}:base(id,method,args)}),
  harness({source:(id,method,args,base)=>id===lending&&method==='get_all_token_pyth_infos'?
   {...metadata,'wrap.near':{...metadata['wrap.near'],price_identifier:null}}:
   base(id,method,args)}),
 ];
 for(const input of variants)
  await assert.rejects(()=>attestStage51PythParity(input),/STAGE51_/);
});
test('default on-chain price needs neither feed lookup nor derived extra_call',async()=>{
 const both={...metadata,
  'wrap.near':{decimals:24,price_identifier:null,
   default_price:{multiplier:'100000000',decimals:8},extra_call:null}};
 const x=harness({source:(id,method,args,base)=>id===lending&&method==='get_all_token_pyth_infos'?
  both:base(id,method,args)});
 // Local clone must reflect exactly the same revised metadata.
 const copy=harness({local:(id,method,args,base)=>id===lending&&method==='get_all_token_pyth_infos'?
  both:base(id,method,args)});
 const r=await attestStage51PythParity({...x,contracts:copy.contracts});
 assert.equal(r.uniqueFeedsChecked,1);
 assert.equal(r.defaultPricesChecked,1);
 assert.equal(r.derivedPriceRatiosChecked,0);
});
test('Stage51 source-to-Sandbox price parity happens before actor funding and Rhea action',async()=>{
 const s=await readFile(new URL('../scripts/stage37-workspaces-sandbox-replay.mjs',import.meta.url),'utf8');
 assert.match(s,/attestStage51PythParity\(\{rpc,contracts,plan,blockHeight:block\}\)/);
 assert.match(s,/stage51-active-pyth-sandbox-parity\.json/);
 assert.ok(s.indexOf('const pythParity=await')<s.indexOf("root.createSubAccount('arbivane-replay'"));
 assert.ok(s.indexOf('const pythParity=await')<s.indexOf('sandboxTransactionSubmitted=true'));
 assert.match(s,/NEAR_WORKSPACES_NETWORK!=='sandbox'/);
 assert.doesNotMatch(s,/broadcast_tx|signAndSend/);
});

test('Stage71 same-token source only needs one Pyth quote and no duplicate token accounting',async()=>{
 const same=plan();
 same.actions[1].Liquidate.out_assets[0].token_id='usdt.tether-token.near';
 same.actions[2].Withdraw.token_id='usdt.tether-token.near';
 same.actions[2].Withdraw.amount='11';
 same.actions.splice(2,0,{Repay:{token_id:'usdt.tether-token.near',amount:'100'}});
 const w=await attestStage51PythParity(harness({plan:same}));
 assert.deepEqual(w.tokensChecked,['usdt.tether-token.near']);
 assert.equal(w.uniqueFeedsChecked,1);
 assert.equal(w.derivedPriceRatiosChecked,0);
 assert.equal(w.pinnedSourceAndSandboxPythViewsMatch,true);
 assert.equal(w.maySignMainnet,false);
});

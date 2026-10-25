import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inspectStage50RepayReserve,readStage50PinnedRepayReserve}
 from '../scripts/stage50-pinned-ft-reserve.mjs';
const plan={
 mode:'ARBIVANE_STAGE37_ISOLATED_SANDBOX_LIQUIDATION_PLAN',
 chain:'NEAR_SANDBOX',borrowerAccountId:'borrower.near',
 lendingContract:'contract.main.burrow.near',mainnetSourceBlockHeight:'221440179',
 executionEnabled:false,maySignMainnet:false,mayBroadcastMainnet:false,
 actions:[
  {Borrow:{token_id:'usdt.tether-token.near',amount:'95000000000000000000'}},
  {Liquidate:{account_id:'borrower.near',in_assets:[
   {token_id:'usdt.tether-token.near',amount:'95000000000000000000'}],
   out_assets:[{token_id:'wrap.near',amount:'100000000000000000000'}]}},
  {Withdraw:{token_id:'wrap.near',amount:'100000000000000000000'}}
 ],
};
const assets=[['usdt.tether-token.near',{
 config:{can_borrow:true,extra_decimals:18},supplied:{balance:'300000000000000000000'},
 borrowed:{balance:'100000000000000000000'}
}],['wrap.near',{config:{can_withdraw:true}}]];
const input=()=>({plan,pinnedAssets:assets,repayFtBalance:'200',
 repayFtMetadata:{decimals:6},sourceBlockHeight:221440179});
test('Stage50 observes actual pinned lending vault reserve and rounds required FT units UP',()=>{
 const x=inspectStage50RepayReserve(input());
 assert.equal(x.status,'PINNED_SOURCE_POOL_AND_TOKEN_VAULT_CAPACITY_OBSERVED');
 assert.equal(x.requiredRepayInternal,'95000000000000000000');
 assert.equal(x.requiredFtAtomicRoundedUp,'95');
 assert.equal(x.poolCapacityInternal,'200000000000000000000');
 assert.equal(x.tokenVaultFtAtomic,'200');
 assert.equal(x.guaranteedExecutionLiquidity,false);
 assert.equal(x.actorCollateralAndFundingVerified,false);
 assert.equal(x.exactTokenConversionVerifiedAgainstDeployedWasm,false);
 assert.equal(x.positiveNetProfitVerified,false);
 assert.equal(x.mayBroadcastMainnet,false);
});
test('Stage50 blocks insufficient actual FT vault reserves, insufficient lending liquidity and disabled markets',()=>{
 for(const patch of [
  {repayFtBalance:'94'},
  {pinnedAssets:[['usdt.tether-token.near',{
   config:{can_borrow:true,extra_decimals:18},
   supplied:{balance:'195000000000000000000'},
   borrowed:{balance:'100000000000000000001'}
  }]]},
  {pinnedAssets:[['usdt.tether-token.near',{
   config:{can_borrow:false,extra_decimals:18},
   supplied:{balance:'300000000000000000000'},
   borrowed:{balance:'0'}
  }]]},
  {repayFtMetadata:{decimals:37}},
  {repayFtBalance:'-100'},
  {sourceBlockHeight:221440178},
  {plan:{...plan,executionEnabled:true}},
 ]){
  assert.throws(()=>inspectStage50RepayReserve({...input(),...patch}),/STAGE50_/);
 }
});
test('Stage50 exact pinned RPC reads reject cross-block drift and invalid contract state',async()=>{
 const calls=[];
 const rpc={view:async(id,method,args,height)=>{
  calls.push({id,method,args,height});
  if(method==='ft_balance_of')return {blockHeight:'221440179',value:'200'};
  if(method==='ft_metadata')return {blockHeight:'221440179',value:{decimals:6}};
  throw Error('unexpected');
 }};
 const r=await readStage50PinnedRepayReserve({rpc,plan,pinnedAssets:assets,blockHeight:221440179});
 assert.equal(r.tokenVaultFtAtomic,'200');
 assert.equal(calls.length,2);
 assert.ok(calls.every(x=>x.height===221440179&&x.id==='usdt.tether-token.near'));
 assert.deepEqual(calls[0].args,{account_id:'contract.main.burrow.near'});
 const drift={view:async(_id,method)=>({
  blockHeight:method==='ft_metadata'?'221440180':'221440179',
  value:method==='ft_metadata'?{decimals:6}:'200'
 })};
 await assert.rejects(()=>readStage50PinnedRepayReserve({
  rpc:drift,plan,pinnedAssets:assets,blockHeight:221440179,
 }),/STAGE50_FT_RESERVE_CROSS_BLOCK_DRIFT/);
});
test('Stage50 reserves feed the genuine Sandbox runner and prevent mismatched cloned FT vault state',async()=>{
 const runner=await readFile(new URL('../scripts/stage37-workspaces-sandbox-replay.mjs',import.meta.url),'utf8');
 assert.ok(runner.includes('readStage50PinnedRepayReserve'));
 assert.ok(runner.includes('stage50-pinned-repay-reserve.json'));
 assert.ok(runner.includes('STAGE50_CLONED_FT_VAULT_MISMATCH'));
 assert.ok(runner.indexOf('readStage50PinnedRepayReserve')<runner.indexOf("await pkg.Worker.init"));
 assert.ok(runner.includes("NEAR_WORKSPACES_NETWORK!=='sandbox'"));
 assert.ok(!runner.includes('broadcast_tx'));
});


test('Stage77 follows actual Rhea extra_decimals FT conversion even when internal precision is NOT 24',()=>{
 const examples=[
  {decimals:6,extra:12,scale:1000000000000n}, // public Rhea USDT example: 18 internal
  {decimals:6,extra:18,scale:1000000000000000000n}, // 24 internal
  {decimals:24,extra:0,scale:1n}, // WNEAR native precision
  {decimals:5,extra:7,scale:10000000n}, // metadata precision is independent
 ];
 for(const {decimals,extra,scale} of examples){
  const amount=(100n*scale).toString();
  const data=structuredClone(input());
  data.repayFtMetadata={decimals};
  data.pinnedAssets[0][1].config.extra_decimals=extra;
  data.pinnedAssets[0][1].supplied.balance=(300n*scale).toString();
  data.pinnedAssets[0][1].borrowed.balance=(100n*scale).toString();
  data.plan={...data.plan,actions:[
   {Borrow:{token_id:'usdt.tether-token.near',amount}},
   {Liquidate:{account_id:'borrower.near',
    in_assets:[{token_id:'usdt.tether-token.near',amount}],
    out_assets:[{token_id:'wrap.near',amount}]}},
   {Withdraw:{token_id:'wrap.near',amount}},
  ]};
  const output=inspectStage50RepayReserve(data);
  assert.equal(output.requiredFtAtomicRoundedUp,'100');
  assert.equal(output.rawFtToLendingInternalScale,scale.toString());
  assert.equal(output.internalPrecisionDecimals,decimals+extra);
  assert.equal(output.exactTokenConversionVerifiedAgainstDeployedWasm,false);
  assert.equal(output.mayBroadcastMainnet,false);
 }
});

test('Stage77 never authorizes overflowing raw FT to internal balance conversion',()=>{
 const data=structuredClone(input());
 data.pinnedAssets[0][1].config.extra_decimals=36;
 data.repayFtBalance='340282366920938463463374607431768211455';
 assert.throws(()=>inspectStage50RepayReserve(data),
  /STAGE50_TOKEN_VAULT_INTERNAL_SCALE_OVERFLOWS_U128/);
});

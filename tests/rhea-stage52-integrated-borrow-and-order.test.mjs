import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {actorCollateralInternal,inspectStage49SandboxBorrow}
 from '../scripts/stage49-sandbox-borrow-preflight.mjs';

const account='arbivane-replay.test.near';
function plan(){return {
 mode:'ARBIVANE_STAGE37_ISOLATED_SANDBOX_LIQUIDATION_PLAN',
 chain:'NEAR_SANDBOX',executionEnabled:false,maySignMainnet:false,
 mayBroadcastMainnet:false,method:'execute_with_pyth',
 borrowerAccountId:'borrower.near',
 actions:[
  {Borrow:{token_id:'usdt.tether-token.near',amount:'100'}},
  {Liquidate:{account_id:'borrower.near',in_assets:[
   {token_id:'usdt.tether-token.near',amount:'100'}],
   out_assets:[{token_id:'wrap.near',amount:'110'}]}},
  {Withdraw:{token_id:'wrap.near',amount:'110'}}
 ]};
}
const assets=()=>[['usdt.tether-token.near',{
 config:{can_borrow:true},supplied:{balance:'1000'},borrowed:{balance:'300'},
}],['wrap.near',{config:{can_use_as_collateral:true}}]];
const positions=(n='200')=>({positions:{REGULAR:{
 collateral:n==='0'?[]:[{token_id:'wrap.near',balance:n,shares:n}],
 borrowed:[],
}}});
test('Stage52 uses actually observed actor collateral, but does not claim executable borrowing or profit',()=>{
 const r=inspectStage49SandboxBorrow({
  plan:plan(),assets:assets(),actorAccountId:account,actorPositions:positions()
 });
 assert.equal(r.sandboxAttemptAllowed,true);
 assert.equal(r.poolHeadroomReferenceInternal,'700');
 assert.equal(r.actorCollateralReferenceInternal,'200');
 assert.equal(r.deployedBorrowCapacityVerified,false);
 assert.equal(r.financingNetProfitVerified,false);
 assert.equal(r.mayBroadcastMainnet,false);
});
test('no collateral, disabled repay token or inadequate headroom cannot admit Sandbox liquidation',()=>{
 const inputs=[
  {actorPositions:positions('0'),status:'BLOCKED_SANDBOX_ACTOR_HAS_NO_COLLATERAL'},
  {assets:[['usdt.tether-token.near',{
   config:{can_borrow:false},supplied:{balance:'1000'},borrowed:{balance:'300'},
  }]],status:'BLOCKED_REPAY_ASSET_CANNOT_BORROW'},
  {assets:[['usdt.tether-token.near',{
   config:{can_borrow:true},supplied:{balance:'380'},borrowed:{balance:'300'},
  }]],status:'BLOCKED_POOL_CAPACITY_INSUFFICIENT'}
 ];
 for(const variant of inputs){
  const {status,...update}=variant;
  const r=inspectStage49SandboxBorrow({
   plan:plan(),assets:assets(),actorAccountId:account,actorPositions:positions(),
   ...update
  });
  assert.equal(r.status,status);
  assert.equal(r.sandboxAttemptAllowed,false);
  assert.equal(r.realMainnetExecuted,false);
 }
});
test('forged actor, borrower, internal repay units, missing positions and authorization fail closed',()=>{
 for(const diff of [
  {actorAccountId:'borrower.near'},
  {plan:{...plan(),maySignMainnet:true}},
  {plan:{...plan(),actions:[{Borrow:{token_id:'usdt.tether-token.near',amount:'999'}},...plan().actions.slice(1)]}},
  {actorPositions:{positions:[]}},
  {actorPositions:{positions:{REGULAR:{collateral:[{token_id:'wrap.near',shares:'3',balance:'bad'}],borrowed:[]}}}},
  {assets:[...assets(),assets()[0]]}
 ])assert.throws(()=>inspectStage49SandboxBorrow({
  plan:plan(),assets:assets(),actorAccountId:account,actorPositions:positions(),...diff
 }),/STAGE49_/);
 assert.equal(actorCollateralInternal(positions()),200n);
});
test('Stage52 is integrated on top of source-pinned Stage50 vault and Stage51 Pyth checks',async()=>{
 const source=await readFile(new URL('../scripts/stage37-workspaces-sandbox-replay.mjs',import.meta.url),'utf8');
 for(const pattern of [
  "e.STAGE49_ALLOW_SANDBOX_WRAP_NEAR_FUNDING!=='true'",
  "const pythParity=await attestStage51PythParity",
  "const repayReserve=await readStage50PinnedRepayReserve",
  "const collateralFunding=await seedSandboxLiquidatorWithWrappedNear",
  "const borrowCapacity=inspectStage49SandboxBorrow",
  "stage52-sandbox-collateral-and-borrow-preflight.json",
  "BigInt(plan.gasUnits),attachedDeposit:BigInt(plan.depositYocto)",
  "attestStage48FinalizedSandboxReplay",
  "attestStage41SandboxSettlement"
 ]) assert.ok(source.includes(pattern),pattern);
 assert.ok(source.indexOf('const pythParity=await')<source.indexOf('sandboxFundingAttempted=true'));
 assert.ok(source.indexOf('const repayReserve=await')<source.indexOf('sandboxFundingAttempted=true'));
 assert.ok(source.indexOf('sandboxFundingAttempted=true')<source.indexOf('sandboxTransactionSubmitted=true'));
 assert.ok(source.indexOf('if(!borrowCapacity.sandboxAttemptAllowed')<source.indexOf('sandboxTransactionSubmitted=true'));
 assert.ok(!source.includes('broadcast_tx'));
});

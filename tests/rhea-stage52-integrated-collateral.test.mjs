import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {actorCollateralInternal,inspectStage49SandboxBorrow}
 from '../scripts/stage49-sandbox-borrow-preflight.mjs';
const actorId='arbivane-replay.test.near';
const plan=()=>({mode:'ARBIVANE_STAGE37_ISOLATED_SANDBOX_LIQUIDATION_PLAN',
 chain:'NEAR_SANDBOX',executionEnabled:false,maySignMainnet:false,
 mayBroadcastMainnet:false,method:'execute_with_pyth',
 borrowerAccountId:'victim.near',
 actions:[
  {Borrow:{token_id:'usdt.tether-token.near',amount:'500000000000000000'}},
  {Liquidate:{account_id:'victim.near',in_assets:[{
   token_id:'usdt.tether-token.near',amount:'500000000000000000'
  }],out_assets:[{token_id:'wrap.near',amount:'550000000000000000'}]}},
  {Withdraw:{token_id:'wrap.near',amount:'550000000000000000'}}
 ]});
const market=(flags={})=>[
 ['usdt.tether-token.near',{
  config:{can_borrow:flags.canBorrow??true},
  supplied:{balance:flags.supplied??'2000000000000000000'},
  borrowed:{balance:flags.borrowed??'1000000000000000000'}
 }],
 ['wrap.near',{config:{can_use_as_collateral:true}}]
];
const positions=(balance='1000000000000000000000000')=>
 ({positions:{REGULAR:{borrowed:[],collateral:
  balance==='0'?[]:[{token_id:'wrap.near',balance,shares:balance}]}}});
const inspect=(changes={})=>inspectStage49SandboxBorrow({
 plan:changes.plan??plan(),assets:changes.assets??market(),
 actorAccountId:changes.actorAccountId??actorId,
 actorPositions:changes.actorPositions??positions(),
});
test('real actor position and borrowable Rhea pool are prerequisites, never net-profit proof',()=>{
 const proof=inspect();
 assert.equal(proof.sandboxAttemptAllowed,true);
 assert.equal(proof.actorCollateralReferenceInternal,'1000000000000000000000000');
 assert.equal(proof.deployedBorrowCapacityVerified,false);
 assert.equal(proof.mayBroadcastMainnet,false);
 assert.equal(proof.financingNetProfitVerified,false);
});
test('pool insufficient, disabled borrowing and unfunded actors cannot attempt Rhea liquidation',()=>{
 for(const [changes,code] of [
  [{assets:market({canBorrow:false})},'BLOCKED_REPAY_ASSET_CANNOT_BORROW'],
  [{assets:market({supplied:'1000000000000000001'})},'BLOCKED_POOL_CAPACITY_INSUFFICIENT'],
  [{actorPositions:positions('0')},'BLOCKED_SANDBOX_ACTOR_HAS_NO_COLLATERAL'],
 ]){
  const proof=inspect(changes);
  assert.equal(proof.status,code);
  assert.equal(proof.sandboxAttemptAllowed,false);
 }
});
test('no actor collateral may be fabricated from an unstructured or negative snapshot',()=>{
 for(const row of [
  {positions:[]},{positions:{}},{positions:{REGULAR:{collateral:[{
   token_id:'wrap.near',balance:'-1',shares:'10'
  }]}}},{positions:{REGULAR:{collateral:[{
   token_id:'wrap.near',balance:'1',shares:'1'
  },{token_id:'wrap.near',balance:'2',shares:'2'}]}}}
 ]){
  if(row.positions&&typeof row.positions==='object'&&!Array.isArray(row.positions)&&
   Object.keys(row.positions).length===0){
   assert.equal(actorCollateralInternal(row),0n);
  } else assert.throws(()=>actorCollateralInternal(row),/STAGE49_/);
 }
});
test('borrower impersonation, invalid source plan, contradictory repay amount fail closed',()=>{
 for(const patch of [
  {actorAccountId:'victim.near'},
  {plan:{...plan(),executionEnabled:true}},
  {plan:{...plan(),actions:[
   plan().actions[0],
   {Liquidate:{account_id:'victim.near',in_assets:[{
    token_id:'usdt.tether-token.near',amount:'9'
   }],out_assets:[{token_id:'wrap.near',amount:'10'}]}},
   plan().actions[2]]}}
 ]) assert.throws(()=>inspect(patch),/STAGE49_/);
});
test('Stage52 funding is sequenced after Stage51 Pyth parity and before any Rhea action',async()=>{
 const runner=await readFile(new URL('../scripts/stage37-workspaces-sandbox-replay.mjs',import.meta.url),'utf8');
 const p=runner.indexOf('attestStage51PythParity({rpc,contracts,plan,blockHeight:block})');
 const r=runner.indexOf('readStage50PinnedRepayReserve({');
 const f=runner.indexOf('seedSandboxLiquidatorWithWrappedNear({');
 const e=runner.indexOf('sandboxTransactionSubmitted=true');
 assert.ok(p>0&&r>0&&f>p&&f>r&&e>f);
 assert.match(runner,/STAGE49_ALLOW_SANDBOX_WRAP_NEAR_FUNDING!=='true'/);
 assert.match(runner,/inspectStage49SandboxBorrow/);
 assert.match(runner,/stage52-sandbox-collateral-funding\.json/);
 assert.match(runner,/gas:BigInt\(plan.gasUnits\),attachedDeposit:BigInt\(plan.depositYocto\)/);
 assert.doesNotMatch(runner,/broadcast_tx|signAndSend/);
});

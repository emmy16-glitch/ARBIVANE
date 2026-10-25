import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {actorCollateralInternal,inspectStage49SandboxBorrow} from '../scripts/stage49-sandbox-borrow-preflight.mjs';

const plan=()=>({
 mode:'ARBIVANE_STAGE37_ISOLATED_SANDBOX_LIQUIDATION_PLAN',
 chain:'NEAR_SANDBOX',executionEnabled:false,maySignMainnet:false,
 mayBroadcastMainnet:false,method:'execute_with_pyth',
 borrowerAccountId:'borrower.near',actions:[
  {Borrow:{token_id:'wrap.near',amount:'100'}},
  {Liquidate:{account_id:'borrower.near',in_assets:[{token_id:'wrap.near',amount:'100'}],
   out_assets:[{token_id:'usdt.near',amount:'110'}]}},
  {Withdraw:{token_id:'usdt.near',amount:'110'}}
 ]
});
const assets=(patch={})=>[
 ['wrap.near',{config:{can_borrow:true,can_use_as_collateral:true},
  supplied:{balance:'2000',shares:'2000'},
  borrowed:{balance:'800',shares:'800'},...patch}],
 ['usdt.near',{config:{can_borrow:true},supplied:{balance:'4000',shares:'4000'},
  borrowed:{balance:'1000',shares:'1000'}}]
];
const actor=(n='100')=>({positions:{
 REGULAR:{collateral:n==='0'?[]:[{token_id:'wrap.near',balance:n,shares:n}],borrowed:[]}
}});
function check(a=assets(),p=actor(),pro=plan()){
 return inspectStage49SandboxBorrow({plan:pro,assets:a,actorPositions:p,
  actorAccountId:'arbivane-replay.test.near'});
}
test('funded actor and borrow-enabled pool are permitted for local Sandbox attempt ONLY',()=>{
 const r=check();
 assert.equal(r.sandboxAttemptAllowed,true);
 assert.equal(r.status,'SANDBOX_BORROW_ATTEMPT_NOT_MAINNET_AUTHORIZATION');
 assert.equal(r.poolHeadroomReferenceInternal,'1200');
 assert.equal(r.actorCollateralReferenceInternal,'100');
 assert.equal(r.realMainnetExecuted,false);
 assert.equal(r.deployedBorrowCapacityVerified,false);
 assert.equal(r.maySignMainnet,false);
 assert.equal(r.financingNetProfitVerified,false);
});
test('unfunded disposable actor is blocked even when pinned protocol pool is healthy',()=>{
 const r=check(assets(),actor('0'));
 assert.equal(r.status,'BLOCKED_SANDBOX_ACTOR_HAS_NO_COLLATERAL');
 assert.equal(r.sandboxAttemptAllowed,false);
});
test('non-borrowable asset, zero pool headroom and insufficient capacity block before Rhea call',()=>{
 assert.equal(check(assets({config:{can_borrow:false}})).status,
  'BLOCKED_REPAY_ASSET_CANNOT_BORROW');
 assert.equal(check(assets({borrowed:{balance:'2000',shares:'2000'}})).status,
  'BLOCKED_POOL_CAPACITY_INSUFFICIENT');
 assert.equal(check(assets({supplied:{balance:'850',shares:'850'}})).status,
  'BLOCKED_POOL_CAPACITY_INSUFFICIENT');
});
test('reject unknown flags, duplicate assets, malformed actor collateral and mismatched repay route',()=>{
 for(const row of [
  {assets:[...assets(),assets()[0]]},
  {assets:assets({config:{can_use_as_collateral:true}})},
  {assets:assets({borrowed:{balance:'oops',shares:'2'}})},
  {actorPositions:{positions:{REGULAR:{collateral:[{token_id:'wrap.near',balance:'100',shares:'0'},
   {token_id:'wrap.near',balance:'100',shares:'1'}]}}}},
  {plan:{...plan(),mayBroadcastMainnet:true}},
  {plan:{...plan(),borrowerAccountId:'arbivane-replay.test.near'}},
  {plan:{...plan(),actions:[{Borrow:{token_id:'wrap.near',amount:'200'}},...plan().actions.slice(1)]}}
 ]){
  assert.throws(()=>inspectStage49SandboxBorrow({plan:row.plan??plan(),
   assets:row.assets??assets(),actorPositions:row.actorPositions??actor(),
   actorAccountId:'arbivane-replay.test.near'}),/STAGE49_/);
 }
 assert.equal(actorCollateralInternal(actor('0')),0n);
});
test('real Stage37 runner gates callback on actual collateral and pool proof with strict local funding consent',async()=>{
 const script=await readFile(new URL('../scripts/stage37-workspaces-sandbox-replay.mjs',import.meta.url),'utf8');
 assert.match(script,/STAGE49_ALLOW_SANDBOX_WRAP_NEAR_FUNDING!=='true'/);
 assert.match(script,/seedSandboxLiquidatorWithWrappedNear/);
 assert.match(script,/inspectStage49SandboxBorrow/);
 assert.match(script,/sandboxAttemptAllowed/);
 assert.match(script,/stage49-sandbox-funding\.json/);
 assert.match(script,/clonePinnedContractWithState/);
 assert.match(script,/actor\.callRaw\(lending,plan\.method/);
 assert.doesNotMatch(script,/broadcast_tx|signAndSend/);
});

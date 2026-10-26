import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stage124PrepareShareSafeBorrow,stage124ValidateShareSafeBorrow} from '../scripts/stage124-supplied-shares-safe-borrow.mjs';
import {inspectStage49SandboxBorrow} from '../scripts/stage49-sandbox-borrow-preflight.mjs';
const token='linear-protocol.near';
function p(){return {mode:'ARBIVANE_STAGE37_ISOLATED_SANDBOX_LIQUIDATION_PLAN',
 chain:'NEAR_SANDBOX',executionEnabled:false,maySignMainnet:false,mayBroadcastMainnet:false,
 method:'execute_with_pyth',depositYocto:'1',borrowerAccountId:'victim.near',
 actions:[
  {Borrow:{token_id:token,amount:'100'}},
  {Liquidate:{account_id:'victim.near',in_assets:[{token_id:token,amount:'100'}],
    out_assets:[{token_id:token,amount:'120'}]}},
  {Repay:{token_id:token,amount:'100'}},
  {Withdraw:{token_id:token,amount:'20'}}
 ]};}
const pool=()=>[[token,{config:{can_borrow:true},
 supplied:{balance:'1000',shares:'1000'},borrowed:{balance:'200'}}]];
const actorPositions=()=>({positions:{REGULAR:{collateral:[
 {token_id:'wrap.near',balance:'1000',shares:'1000'}]}}});
test('Stage124 finances EXACT source debt with only bounded authentic share difference',()=>{
 const {plan,witness}=stage124PrepareShareSafeBorrow(p(),pool());
 assert.equal(plan.actions[1].Liquidate.in_assets[0].amount,'100');
 assert.equal(plan.actions[1].Liquidate.out_assets[0].amount,'120');
 assert.equal(plan.actions[0].Borrow.amount,'102');
 assert.equal(plan.actions[2].Repay.amount,'102');
 assert.equal(plan.actions[3].Withdraw.amount,'18');
 assert.equal(witness.incrementalBorrowInternal,'2');
 assert.equal(witness.mainnetExecutionEnabled,false);
 assert.ok(BigInt(witness.incrementalBorrowInternal)<=BigInt(witness.maxExtraBorrowInternal));
 assert.deepEqual(stage124ValidateShareSafeBorrow(plan,pool()),witness);
 const admission=inspectStage49SandboxBorrow({plan,assets:pool(),
  actorAccountId:'arbivane-replay.test.near',actorPositions:actorPositions()});
 assert.equal(admission.sandboxAttemptAllowed,true);
 assert.equal(admission.borrowAmountInternal,'102');
});
test('Stage124 refuses forged share proof, changed source eligibility and arbitrary debt',()=>{
 const {plan}=stage124PrepareShareSafeBorrow(p(),pool());
 for(const changed of [
  {...plan,stage124ShareFunding:undefined},
  {...plan,stage124ShareFunding:{...plan.stage124ShareFunding,incrementalBorrowInternal:'3'}},
  {...plan,actions:[{Borrow:{token_id:token,amount:'103'}},...plan.actions.slice(1)]},
  {...plan,actions:plan.actions.map((x,i)=>i===1?
   {Liquidate:{...x.Liquidate,account_id:'forged.near'}}:x)},
 ])assert.throws(()=>stage124ValidateShareSafeBorrow(changed,pool()),/STAGE124_/);
 assert.throws(()=>stage124ValidateShareSafeBorrow(plan,
  [[token,{config:{can_borrow:true},supplied:{balance:'1100',shares:'1000'},borrowed:{balance:'200'}}]]),/STAGE124_/);
 assert.throws(()=>stage124PrepareShareSafeBorrow({...p(),actions:[
  {...p().actions[0]},...p().actions.slice(1).map((x,i)=>i===0?
    {Liquidate:{...x.Liquidate,out_assets:[{token_id:token,amount:'102'}]}}:
   x)]},pool()),/STAGE124_/);
});
test('Stage124 never mutates supplied market, sources, oracle or chain settings',async()=>{
 const source=p(),assets=pool();
 const before=JSON.stringify({source,assets});
 stage124PrepareShareSafeBorrow(source,assets);
 assert.equal(JSON.stringify({source,assets}),before);
 assert.throws(()=>stage124PrepareShareSafeBorrow({...p(),maySignMainnet:true},assets),/STAGE124_/);
 const runner=await readFile(new URL('../scripts/stage37-workspaces-sandbox-replay.mjs',import.meta.url),'utf8');
 assert.ok(runner.includes("lending.view('get_assets_paged',{})"));
 assert.ok(runner.includes('stage124PrepareShareSafeBorrow(plan,liveSandboxAssets)'));
 assert.ok(runner.includes("stage124-share-rounding-evidence.json"));
});

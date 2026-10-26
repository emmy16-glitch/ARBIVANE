import test from 'node:test';
import assert from 'node:assert/strict';
import {stage124SameTokenRoute,stage124SuppliedBalance,
 stage124BorrowedBalance,stage124AttestSuppliedBorrow}
 from '../scripts/stage124-same-token-prefund.mjs';
const plan=()=>({chain:'NEAR_SANDBOX',executionEnabled:false,
 maySignMainnet:false,mayBroadcastMainnet:false,depositYocto:'1',
 actions:[
  {Borrow:{token_id:'linear-protocol.near',amount:'100'}},
  {Liquidate:{account_id:'borrower.near',
   in_assets:[{token_id:'linear-protocol.near',amount:'100'}],
   out_assets:[{token_id:'linear-protocol.near',amount:'111'}]}},
  {Repay:{token_id:'linear-protocol.near',amount:'100'}},
  {Withdraw:{token_id:'linear-protocol.near',amount:'11'}}
 ]});
const actor=(s=[],d=[])=>({supplied:s,positions:{REGULAR:{borrowed:d}}});
const row=(amount)=>({token_id:'linear-protocol.near',balance:amount,shares:amount});
test('Stage124 only stages authentic same-token Borrow then Liquidate Repay Withdraw',()=>{
 const route=stage124SameTokenRoute(plan());
 assert.equal(route.token,'linear-protocol.near');
 assert.equal(route.required,100n);
 assert.deepEqual(route.borrowActions.map(x=>Object.keys(x)[0]),['Borrow']);
 assert.deepEqual(route.liquidationActions.map(x=>Object.keys(x)[0]),
  ['Liquidate','Repay','Withdraw']);
 assert.throws(()=>stage124SameTokenRoute({...plan(),maySignMainnet:true}),/STAGE124_UNTRUSTED/);
 assert.throws(()=>stage124SameTokenRoute({...plan(),depositYocto:'0'}),/STAGE124_UNTRUSTED/);
 const bad=plan();bad.actions[3].Withdraw.amount='12';
 assert.throws(()=>stage124SameTokenRoute(bad),/STAGE124_INVALID_SAME_TOKEN_ACCOUNTING/);
});
test('Stage124 refuses a borrowed token that is not genuinely supplied to actor',()=>{
 const route=stage124SameTokenRoute(plan()),before=actor();
 const enough=actor([row('100')],[row('100')]);
 assert.equal(stage124AttestSuppliedBorrow({before,after:enough,route})
  .actorSupplyFromBorrowVerified,true);
 assert.equal(stage124SuppliedBalance(enough,route.token),100n);
 assert.equal(stage124BorrowedBalance(enough,route.token),100n);
 assert.throws(()=>stage124AttestSuppliedBorrow({
  before,after:actor([],[row('100')]),route
 }),/STAGE124_BORROW_NOT_CREDITED/);
 assert.throws(()=>stage124AttestSuppliedBorrow({
  before,after:actor([row('99')],[row('100')]),route
 }),/STAGE124_BORROW_NOT_CREDITED/);
 assert.throws(()=>stage124AttestSuppliedBorrow({
  before:actor([row('1')],[]),after:enough,route
 }),/STAGE124_PREBORROW_UNVERIFIED/);
 assert.throws(()=>stage124AttestSuppliedBorrow({
  before,after:actor([row('100')],[]),route
 }),/STAGE124_PREBORROW_UNVERIFIED/);
 const duplicated=actor([row('100'),row('100')],[row('100')]);
 assert.throws(()=>stage124AttestSuppliedBorrow({before,after:duplicated,route}),
  /STAGE124_DUPLICATE_ACTOR_SUPPLY/);
});
test('Stage124 actual runner keeps original source borrower and receipt gates',async()=>{
 const {readFile}=await import('node:fs/promises');
 const script=await readFile(new URL('../scripts/stage37-workspaces-sandbox-replay.mjs',import.meta.url),'utf8');
 const workflow=await readFile(new URL('../.github/workflows/rhea-stage93-borrower-settlement.yml',import.meta.url),'utf8');
 assert.ok(script.includes('stage124AttestSuppliedBorrow'));
 assert.ok(script.includes('route.borrowActions'));
 assert.ok(script.includes('route.liquidationActions'));
 assert.ok(script.includes('stage124-raw-borrow-transaction.json'));
 assert.ok(script.includes('borrowFinalAfter.header.height<borrowFinalBefore.header.height+2'));
 assert.ok(script.includes('attestStage41SandboxSettlement'));
 assert.ok(script.includes('sandboxTransactionSubmitted=true'));
 assert.ok(workflow.includes("'scripts/stage124-same-token-prefund.mjs'"));
 assert.ok(workflow.includes('stage124-repay-supply-proof.json'));
});

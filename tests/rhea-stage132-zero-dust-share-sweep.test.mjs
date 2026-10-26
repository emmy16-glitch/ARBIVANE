import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inspectStage49RheaAssets} from '../scripts/stage49-sandbox-route-readiness.mjs';
import {inspectStage49SandboxBorrow} from '../scripts/stage49-sandbox-borrow-preflight.mjs';
import {attestStage41SandboxSettlement} from '../src/rhea/stage41-sandbox-settlement.ts';

const token='linear-protocol.near',borrower='borrower.near';
const plan=()=>({
 mode:'ARBIVANE_STAGE37_ISOLATED_SANDBOX_LIQUIDATION_PLAN',
 chain:'NEAR_SANDBOX',mainnetSourceBlockHeight:'221440179',
 borrowerAccountId:borrower,lendingContract:'contract.main.burrow.near',
 method:'execute_with_pyth',sourceMathOnly:true,
 executionEnabled:false,maySignMainnet:false,mayBroadcastMainnet:false,
 actions:[
  {Borrow:{token_id:token,amount:'100'}},
  {Liquidate:{account_id:borrower,
   in_assets:[{token_id:token,max_amount:'100'}],
   out_assets:[{token_id:token,amount:'110'}]}},
  {Repay:{token_id:token}},
  {Withdraw:{token_id:token,max_amount:'10'}},
 ],
});
const asset=[token,{config:{can_borrow:true,can_withdraw:true},
 supplied:{balance:'10000',shares:'9980'},
 borrowed:{balance:'1000',shares:'995'}}];
const actorPosition=()=>({positions:{REGULAR:{
 collateral:[{token_id:'wrap.near',balance:'2000',shares:'1900'}],
 borrowed:[],
}}});
const leg=(balance)=>({token_id:token,balance:String(balance),shares:String(balance)});
const borrowerPos=(debt,collateral)=>({positions:{REGULAR:{
 borrowed:[leg(debt)],collateral:[leg(collateral)]}}});
const actorDebt=(amount)=>({positions:amount?{REGULAR:{
 borrowed:[leg(amount)],collateral:[]}}:{}});
const receipt=()=>({mode:'ARBIVANE_STAGE37_SANDBOX_RESULT',
 chain:'NEAR_SANDBOX',status:'ISOLATED_CALLBACK_SUCCESS_NOT_MAINNET_PROOF',
 transactionFinal:true,attemptedTransaction:true,receiptCount:12,failedReceiptCount:0,
 realMainnetExecuted:false,realProfitVerified:false,mayBroadcastMainnet:false,
 executionEnabled:false});
const settlement=(p=plan())=>({
 plan:p,receipt:receipt(),positionId:'REGULAR',
 borrowerBefore:borrowerPos(1000,2000),
 borrowerAfter:borrowerPos(900,1890),
 actorBefore:actorDebt(0),actorAfter:actorDebt(0),
 actorRepayFtBefore:'0',actorSeizeFtBefore:'0',
 actorRepayFtAfter:'9',actorSeizeFtAfter:'9',
});

test('Stage132 permits only a protocol-native complete actor borrowed-share sweep',()=>{
 const p=plan();
 assert.deepEqual(p.actions[2],{Repay:{token_id:token}});
 assert.equal(inspectStage49RheaAssets(p,[asset],221440179).repayAndSeizeShareToken,true);
 assert.equal(inspectStage49SandboxBorrow({
  plan:p,assets:[asset],actorAccountId:'actor.test.near',
  actorPositions:actorPosition(),
 }).sandboxAttemptAllowed,true);
 const observed=attestStage41SandboxSettlement(settlement(p));
 assert.equal(observed.status,'POSITION_AND_FT_DELTAS_OBSERVED_UNSOLD');
 assert.equal(observed.actorOutstandingDebtAfterInternal,'0');
 assert.equal(observed.positiveNetProfitVerified,false);
});

test('Stage132 rejects extra repayment fields, wrong token, expanded seizure and nonzero residual debt',()=>{
 for(const change of [
  p=>p.actions[2].Repay.amount='99',
  p=>p.actions[2].Repay.max_amount='110',
  p=>p.actions[2].Repay.unchecked=true,
  p=>p.actions[2].Repay.token_id='wrap.near',
  p=>p.actions[3].Withdraw.max_amount='11',
  p=>p.actions[1].Liquidate.in_assets[0].max_amount='101',
 ]) {
  const p=plan();change(p);
  assert.throws(()=>inspectStage49RheaAssets(p,[asset],221440179),/STAGE49_/);
  assert.throws(()=>inspectStage49SandboxBorrow({
   plan:p,assets:[asset],actorAccountId:'actor.test.near',
   actorPositions:actorPosition(),
  }),/STAGE49_/);
  assert.throws(()=>attestStage41SandboxSettlement(settlement(p)),/STAGE41_/);
 }
 const rest=attestStage41SandboxSettlement({...settlement(),actorAfter:actorDebt(2)});
 assert.equal(rest.status,'BLOCKED_ACTOR_HAS_LIABILITY');
 const inherited=attestStage41SandboxSettlement({...settlement(),actorBefore:actorDebt(2)});
 assert.equal(inherited.status,'BLOCKED_ACTOR_PRIOR_LIABILITY');
});

test('Stage132 runner refuses prior debt before sending signed all-share repayment',async()=>{
 const runner=await readFile(new URL('../scripts/stage37-workspaces-sandbox-replay.mjs',import.meta.url),'utf8');
 assert.ok(runner.includes('STAGE132_REFUSE_PREEXISTING_ACTOR_BORROWED_SHARES'));
 assert.ok(runner.indexOf('STAGE132_REFUSE_PREEXISTING_ACTOR_BORROWED_SHARES')<
   runner.indexOf('sandboxTransactionSubmitted=true'));
 assert.ok(runner.includes('actor.callRaw(lending,plan.method,{actions:plan.actions}'));
 assert.ok(!runner.includes('prefundStage124RheaSupply('));
 assert.ok(runner.includes("stage131-immediate-finalized-state.json"));
});

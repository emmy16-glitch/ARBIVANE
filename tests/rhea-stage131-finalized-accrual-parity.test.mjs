import test from 'node:test';
import assert from 'node:assert/strict';
import {attestStage48FinalizedSandboxReplay} from '../src/rhea/stage48-finalized-sandbox-witness.ts';
const leg=(token,balance,shares,apr='0.003')=>({token_id:token,
 balance:String(balance),shares:String(shares),apr});
const account=(id,borrow,collateral)=>({
 account_id:id,supplied:[leg('wrap.near',1000,980)],
 positions:{REGULAR:{borrowed:borrow,collateral}},
 farms:[{farm_id:{Borrowed:'linear-protocol.near'},rewards:[]}],
 has_non_farmed_assets:false,
});
const borrowerId='9345b3ac35a96e9c9efc6effa5ed50e92ff59a5b31e7b4f2d6f19400c3232899';
const actorId='arbivane-replay.test.near',token='linear-protocol.near';
const before={
 borrower:account(borrowerId,[leg(token,10000,10000)],[leg(token,20000,20000)]),
 actor:account(actorId,[],[]),repayFt:'0',seizeFt:'0'
};
const immediate={
 borrower:account(borrowerId,[leg(token,9000,9000)],[leg(token,18000,18000)]),
 actor:account(actorId,[leg(token,2,1)],[leg('wrap.near',100000,99000)]),
 repayFt:'250',seizeFt:'250'
};
const receipt={mode:'ARBIVANE_STAGE37_SANDBOX_RESULT',chain:'NEAR_SANDBOX',
 realMainnetExecuted:false,realProfitVerified:false,mayBroadcastMainnet:false,
 executionEnabled:false,attemptedTransaction:true,receiptCount:12,
 failedReceiptCount:0,transactionExecutionStatus:'FINAL',transactionFinal:true,
 persistedAtLaterFinalizedBlock:false,status:'ISOLATED_CALLBACK_SUCCESS_NOT_MAINNET_PROOF',
 blockers:['NO_MAINNET_PROFIT_CLAIM']};
const copy=x=>JSON.parse(JSON.stringify(x));
const request=(after=copy(immediate))=>({
 receipt,before,immediatelyAfter:immediate,afterFinalBlock:after,
 finalizedBlockBefore:96,finalizedBlockAfter:9999
});
test('Stage131 real finalized time drift preserves SHARE and FT state even when authentic lending interest accrues',()=>{
 const after=copy(immediate);
 after.borrower.positions.REGULAR.borrowed[0].balance='9011';
 after.borrower.positions.REGULAR.borrowed[0].apr='0.003293';
 after.borrower.positions.REGULAR.collateral[0].balance='18013';
 after.borrower.supplied[0].balance='1011';
 after.actor.positions.REGULAR.borrowed[0].balance='3';
 after.actor.positions.REGULAR.collateral[0].balance='100100';
 after.actor.positions.REGULAR.collateral[0].apr='0.004';
 const result=attestStage48FinalizedSandboxReplay(request(after));
 assert.equal(result.persistedAtLaterFinalizedBlock,true);
 assert.equal(result.transactionFinal,true);
 assert.equal(result.realProfitVerified,false);
 assert.equal(result.finalizedBlockAfter,9999);
});
test('Stage131 rejects ANY false persistence from actual changing shares, token ID, FT, account ID or unsupported view schema',()=>{
 const altered=[
  v=>v.borrower.positions.REGULAR.borrowed[0].shares='8999',
  v=>v.borrower.positions.REGULAR.collateral[0].shares='17999',
  v=>v.actor.positions.REGULAR.borrowed[0].shares='0',
  v=>v.actor.positions.REGULAR.collateral[0].shares='98999',
  v=>v.borrower.positions.REGULAR.borrowed[0].token_id='malicious-token.near',
  v=>v.actor.account_id='different.near',
  v=>v.borrower.farms[0].farm_id.Borrowed='fake-token.near',
  v=>v.repayFt='249',
  v=>v.seizeFt='251',
  v=>v.borrower.positions.REGULAR.borrowed[0].apr='not-a-real-apr',
  v=>v.borrower.positions.REGULAR.borrowed[0].balance='not-integer',
  v=>v.borrower.positions.REGULAR.collateral=[],
 ];
 for(const mutate of altered){
  const later=copy(immediate);mutate(later);
  assert.throws(()=>attestStage48FinalizedSandboxReplay(request(later)),
   /STAGE48_STATE_CHANGE_OR_LATER_PERSISTENCE_NOT_VERIFIED/);
 }
});
test('Stage131 still blocks no borrower mutation, missing exact token inventory and short finality',()=>{
 assert.throws(()=>attestStage48FinalizedSandboxReplay({...request(),
  before:copy(immediate)}),/STAGE48_STATE_CHANGE_OR_LATER_PERSISTENCE_NOT_VERIFIED/);
 assert.throws(()=>attestStage48FinalizedSandboxReplay({...request(),
  finalizedBlockAfter:96}),/STAGE48_INCOMPLETE_FINALIZED_STATE_EVIDENCE/);
});

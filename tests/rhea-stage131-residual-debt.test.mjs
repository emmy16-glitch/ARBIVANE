import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
 stage131SelfRepayCap,attestStage131SameTokenSelfRepay,
} from '../src/rhea/stage131-self-repay-cap.ts';
import {attestStage48FinalizedSandboxReplay}
 from '../src/rhea/stage48-finalized-sandbox-witness.ts';

const R='1858490264139913',S='1861021454005210';
test('Stage131 uses exact source-approved Borrow/Liquidate and eight-atomic actor-only Repay cap',()=>{
 const cap=stage131SelfRepayCap(R,S);
 assert.equal(cap,(BigInt(R)+8n).toString());
 assert.equal(attestStage131SameTokenSelfRepay(R,S,{max_amount:cap}),true);
 assert.equal(attestStage131SameTokenSelfRepay(R,S,{amount:R}),true);
 for(const bad of [
  {max_amount:(BigInt(R)+9n).toString()},
  {max_amount:(BigInt(R)+7n).toString()},
  {max_amount:cap,amount:R},
  {amount:'0'},{max_amount:'0'},
 ]){
  assert.equal(attestStage131SameTokenSelfRepay(R,S,bad),false);
 }
 assert.throws(()=>stage131SelfRepayCap('20','30'),/STAGE131_/);
 assert.throws(()=>stage131SelfRepayCap(R,(BigInt(R)+7n).toString()),/STAGE131_/);
});
test('Stage131 production replay preserves borrower cap and uses capped self-repay',async()=>{
 const code=await readFile(new URL('../src/rhea/stage37-sandbox-liquidation.ts',import.meta.url),'utf8');
 assert.ok(code.includes('max_amount:stage131SelfRepayCap(repay,seize)'));
 assert.ok(code.includes('max_amount:repay'));
 const runner=await readFile(new URL('../scripts/stage37-workspaces-sandbox-replay.mjs',import.meta.url),'utf8');
 assert.ok(runner.includes('actions:plan.actions'));
 assert.ok(!runner.includes('actions:plan.actions.slice(1)'));
 assert.ok(!runner.includes('prefundStage124RheaSupply('));
});
const asset=(balance,shares,apr='0')=>({token_id:'linear-protocol.near',balance,shares,apr});
const account=(b,c,apr='0')=>({
 account_id:'borrower.near',supplied:[],
 positions:{REGULAR:{
  borrowed:[asset(b,'90',apr)],collateral:[asset(c,'180',apr)],
 }},
});
const actor=(borrowed=[])=>({
 account_id:'actor.test.near',supplied:[],
 positions:{REGULAR:{borrowed,collateral:[]}},
});
const receipt={
 mode:'ARBIVANE_STAGE37_SANDBOX_RESULT',chain:'NEAR_SANDBOX',
 status:'ISOLATED_CALLBACK_SUCCESS_NOT_MAINNET_PROOF',
 transactionExecutionStatus:'FINAL',transactionFinal:true,
 attemptedTransaction:true,receiptCount:12,failedReceiptCount:0,
 persistedAtLaterFinalizedBlock:false,realMainnetExecuted:false,
 realProfitVerified:false,mayBroadcastMainnet:false,executionEnabled:false,
 blockers:[],
};
test('Stage131 finality accepts only unchanged shares and FT balances, not APR text equality',()=>{
 const before={borrower:account('100','200'),actor:actor(),repayFt:'0',seizeFt:'0'};
 const immediate={borrower:{
  ...account('80','170'),positions:{REGULAR:{
   borrowed:[asset('80','72','0.01')],
   collateral:[asset('170','151','0.01')],
  }}},
  actor:actor(),repayFt:'10',seizeFt:'10'};
 const later={borrower:{
  ...immediate.borrower,positions:{REGULAR:{
   borrowed:[asset('81','72','0.02')],
   collateral:[asset('171','151','0.02')],
  }}},
  actor:actor(),repayFt:'10',seizeFt:'10'};
 const args={receipt,before,immediatelyAfter:immediate,
  afterFinalBlock:later,finalizedBlockBefore:90,finalizedBlockAfter:9999};
 assert.equal(attestStage48FinalizedSandboxReplay(args).persistedAtLaterFinalizedBlock,true);
 const bad={...later,borrower:{
  ...later.borrower,positions:{REGULAR:{
   ...later.borrower.positions.REGULAR,
   borrowed:[asset('81','73','0.02')],
  }}}};
 assert.throws(()=>attestStage48FinalizedSandboxReplay({...args,afterFinalBlock:bad}),/STAGE48_/);
 assert.throws(()=>attestStage48FinalizedSandboxReplay({...args,afterFinalBlock:{
  ...later,actor:actor([asset('2','1')]),
 }}),/STAGE48_/);
 assert.throws(()=>attestStage48FinalizedSandboxReplay({...args,afterFinalBlock:{
  ...later,repayFt:'9',
 }}),/STAGE48_/);
});

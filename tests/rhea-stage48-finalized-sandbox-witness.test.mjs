import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {summarizeStage37SandboxOutcome} from '../src/rhea/stage37-sandbox-liquidation.ts';
import {attestStage48FinalizedSandboxReplay,stage131FinancialPersistence} from '../src/rhea/stage48-finalized-sandbox-witness.ts';

const HASH='4'.repeat(43);
const callback={receipt_id:HASH,receipt:{Action:{actions:[{
 FunctionCall:{method_name:'callback_execute_with_pyth',args:''}
}]}}};
const raw=(status='EXECUTED_OPTIMISTIC',failed=false)=>({
 final_execution_status:status,status:failed?{Failure:'callback denied'}:{SuccessValue:''},
 receipts:[callback],receipts_outcome:[{
  id:HASH,outcome:{status:failed?{Failure:'loan denied'}:{SuccessValue:''},
   gas_burnt:'2000000000000'}
 }]
});
const inspected={pinnedConfigMatches:true,pinnedBorrowerMatches:true,
 importedContractCount:5,allStoredKeysAttested:false};
const before={borrower:{positions:{REGULAR:{borrowed:[{balance:'100'}]}}},
 actor:{positions:{}},repayFt:'0',seizeFt:'0'};
const after={borrower:{positions:{REGULAR:{borrowed:[{balance:'80'}]}}},
 actor:{positions:{}},repayFt:'0',seizeFt:'30'};
function args(receipt=summarizeStage37SandboxOutcome(raw(),inspected)){
 return {receipt,before,immediatelyAfter:after,afterFinalBlock:after,
  finalizedBlockBefore:8,finalizedBlockAfter:10008};
}
test('optimistic callback is pending, never a completed liquidation on receipt alone',()=>{
 const receipt=summarizeStage37SandboxOutcome(raw(),inspected);
 assert.equal(receipt.status,'ISOLATED_CALLBACK_PENDING_FINALIZED_PERSISTENCE');
 assert.equal(receipt.transactionExecutionStatus,'EXECUTED_OPTIMISTIC');
 assert.equal(receipt.transactionFinal,false);
 assert.equal(receipt.persistedAtLaterFinalizedBlock,false);
 assert.equal(receipt.realMainnetExecuted,false);
 assert.ok(receipt.blockers.includes('OPTIMISTIC_TRANSACTION_REQUIRES_LATER_FINALIZED_SANDBOX_STATE_PROOF'));
});
test('a later finalized Sandbox block with stable actual state can promote callback only',()=>{
 const res=attestStage48FinalizedSandboxReplay(args());
 assert.equal(res.status,'ISOLATED_CALLBACK_SUCCESS_NOT_MAINNET_PROOF');
 assert.equal(res.transactionFinal,false);
 assert.equal(res.transactionExecutionStatus,'EXECUTED_OPTIMISTIC');
 assert.equal(res.persistedAtLaterFinalizedBlock,true);
 assert.equal(res.finalizedBlockAfter,10008);
 assert.ok(res.blockers.includes('ORIGINAL_TRANSACTION_STATUS_OPTIMISTIC_NOT_ATTESTED_AS_FINAL'));
 assert.equal(res.realProfitVerified,false);
 assert.equal(res.mayBroadcastMainnet,false);
});
test('FINAL callback also requires persisted change when Stage48 is in the execution path',()=>{
 const receipt=summarizeStage37SandboxOutcome(raw('FINAL'),inspected);
 assert.equal(receipt.transactionFinal,true);
 const confirmed=attestStage48FinalizedSandboxReplay(args(receipt));
 assert.equal(confirmed.transactionFinal,true);
 assert.equal(confirmed.persistedAtLaterFinalizedBlock,true);
});
test('failing callbacks, insufficient block movement, unchanged borrower and post-block drift reject',()=>{
 const receipt=summarizeStage37SandboxOutcome(raw(),inspected);
 const invalid=[
  {finalizedBlockAfter:9},
  {finalizedBlockBefore:0},
  {afterFinalBlock:{...after,seizeFt:'0'}},
  {immediatelyAfter:before,afterFinalBlock:before},
  {afterFinalBlock:null},
  {before:{...before,seizeFt:'1.23'}},
  {receipt:{...receipt,executionEnabled:true}},
  {receipt:{...receipt,status:'ISOLATED_CALLBACK_SUCCESS_NOT_MAINNET_PROOF'}},
  {receipt:{...receipt,failedReceiptCount:1}},
  {receipt:{...receipt,transactionFinal:true}},
 ];
 for(const patch of invalid)assert.throws(()=>attestStage48FinalizedSandboxReplay({...args(receipt),...patch}),/STAGE48_/);
 const failed=summarizeStage37SandboxOutcome(raw('EXECUTED_OPTIMISTIC',true),inspected);
 assert.equal(failed.status,'SANDBOX_RECEIPT_FAILURE');
 assert.throws(()=>attestStage48FinalizedSandboxReplay(args(failed)),/STAGE48_/);
});
test('runner uses real NEAR Sandbox finalized advancement, no unguarded promotion',async()=>{
 const script=await readFile(new URL('../scripts/stage37-workspaces-sandbox-replay.mjs',import.meta.url),'utf8');
 assert.match(script,/provider\.fastForward\(previousFinalHeight\+64\)/);
 assert.ok(!script.includes('provider.fastForward(10000)'));
 assert.match(script,/stage131-immediate-after-state\.json/);
 assert.match(script,/provider\.block\(\{finality:'final'\}\)/);
 assert.match(script,/attestStage48FinalizedSandboxReplay/);
 assert.match(script,/receipt:verifiedReport/);
 assert.match(script,/afterFinalBlock:post/);
 assert.match(script,/NEAR_WORKSPACES_NETWORK!=='sandbox'/);
 assert.doesNotMatch(script,/broadcast_tx|signAndSend/);
});

test('Stage131 accepts only tiny passive interest with untouched borrowed/collateral shares and FT',()=>{
 const legs=(token,balance,shares)=>[{token_id:token,balance,shares}];
 const account=(id,debt,collateral,supplied='100000')=>({
  account_id:id,is_locked:false,has_non_farmed_assets:false,
  supplied:legs('wrap.near',supplied,'100000'),
  positions:{REGULAR:{
   borrowed:legs('linear-protocol.near',debt,'50000'),
   collateral:legs('linear-protocol.near',collateral,'80000'),
  }},
 });
 const initial={borrower:account('borrower.near','50000','80000'),
  actor:account('actor.near','10000','80000'),
  repayFt:'0',seizeFt:'2500'};
 const later={borrower:account('borrower.near','50001','80001','100001'),
  actor:account('actor.near','10001','80001','100001'),
  repayFt:'0',seizeFt:'2500'};
 assert.equal(stage131FinancialPersistence(initial,later),true);
 const wrong=[
  {...later,seizeFt:'2501'},
  {...later,borrower:account('changed.near','50001','80001','100001')},
  {...later,borrower:account('borrower.near','60000','80001','100001')},
  {...later,borrower:{...later.borrower,positions:{REGULAR:{
   ...later.borrower.positions.REGULAR,
   borrowed:legs('linear-protocol.near','50001','49999'),
  }}}},
  {...later,actor:{...later.actor,supplied:legs('wrap.near','100001','100001')}},
  {...later,actor:{...later.actor,positions:{}} },
 ];
 for(const item of wrong)assert.equal(stage131FinancialPersistence(initial,item),false);
});
test('Stage131 does not treat unrelated large interest/share changes as finalized persistence',()=>{
 const simple=(supplied,shares)=>({account_id:'source.near',
  supplied:[{token_id:'wrap.near',balance:supplied,shares}],
  positions:{REGULAR:{borrowed:[],collateral:[]}}});
 const initial={borrower:simple('188126388156541479289943','178016397868040044653913'),
  actor:simple('1000','1000'),repayFt:'0',seizeFt:'2500'};
 const drifted={...initial,borrower:simple('628525254359286833369346','594747250834223961107895')};
 assert.equal(stage131FinancialPersistence(initial,drifted),false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {attestStage41SandboxSettlement} from '../src/rhea/stage41-sandbox-settlement.ts';
const H='2'.repeat(43);
function plan(){return {
 mode:'ARBIVANE_STAGE37_ISOLATED_SANDBOX_LIQUIDATION_PLAN',chain:'NEAR_SANDBOX',
 mainnetSourceBlockHeight:'221440179',borrowerAccountId:'account.near',
 lendingContract:'contract.main.burrow.near',method:'execute_with_pyth',
 actions:[
  {Borrow:{token_id:'usdt.near',amount:'20'}},
  {Liquidate:{account_id:'account.near',
   in_assets:[{token_id:'usdt.near',amount:'20'}],
   out_assets:[{token_id:'wrap.near',amount:'30'}]}},
  {Withdraw:{token_id:'wrap.near',amount:'30'}}
 ],depositYocto:'0',gasUnits:'300000000000000',
 sourceCodeHash:H,sourceOracleHash:H,sourceMathOnly:true,
 realContractReplayVerified:false,fullImportedStateVerified:false,
 realWalletAuthorized:false,executionEnabled:false,
 maySignMainnet:false,mayBroadcastMainnet:false};
}
const leg=(token,amount)=>({token_id:token,balance:String(amount),shares:String(amount)});
const borrower=(debt,collateral)=>({positions:{REGULAR:{
 borrowed:debt?[leg('usdt.near',debt)]:[],
 collateral:collateral?[leg('wrap.near',collateral)]:[]
}}});
const actor=(debt=0)=>({positions:debt?{REGULAR:{borrowed:[leg('usdt.near',debt)],collateral:[]}}:{}});
const receipt=(ok=true)=>({mode:'ARBIVANE_STAGE37_SANDBOX_RESULT',chain:'NEAR_SANDBOX',
 status:ok?'ISOLATED_CALLBACK_SUCCESS_NOT_MAINNET_PROOF':'SANDBOX_RECEIPT_FAILURE',
 attemptedTransaction:true,transactionFinal:true,receiptCount:3,failedReceiptCount:ok?0:1,
 gasBurntGasUnits:'8000000000000',realMainnetExecuted:false,
 realProfitVerified:false,walletApproved:false,executionEnabled:false,
 mayBroadcastMainnet:false,blockers:[]});
const input=()=>({plan:plan(),positionId:'REGULAR',receipt:receipt(),
 borrowerBefore:borrower(100,200),borrowerAfter:borrower(80,170),
 actorBefore:actor(),actorAfter:actor(),
 actorRepayFtBefore:'100',actorRepayFtAfter:'95',
 actorSeizeFtBefore:'10',actorSeizeFtAfter:'40'});
test('Stage41 attests actual borrower debt and collateral reduction and independently observed FT proceeds, not money profit',()=>{
 const x=attestStage41SandboxSettlement(input());
 assert.equal(x.status,'POSITION_AND_FT_DELTAS_OBSERVED_UNSOLD');
 assert.equal(x.borrowerDebtDecreaseInternal,'20');
 assert.equal(x.borrowerCollateralDecreaseInternal,'30');
 assert.equal(x.actorSeizeFtIncreaseAtomic,'30');
 assert.equal(x.borrowerMutationVerified,true);
 assert.equal(x.assetTransferObserved,true);
 assert.equal(x.positiveNetProfitVerified,false);
 assert.equal(x.settlementAssetSold,false);
 assert.equal(x.mayBroadcastMainnet,false);
 assert.ok(x.blockers.includes('COLLATERAL_UNSOLD_AND_NO_REALIZED_SETTLEMENT_PNL'));
});
test('successful callback without borrower debt AND collateral movements blocks the claim',()=>{
 for(const delta of [
  {borrowerAfter:borrower(100,170)},
  {borrowerAfter:borrower(80,200)},
  {borrowerAfter:borrower(120,180)},
  {borrowerAfter:borrower(80,210)},
 ]){
  const x=attestStage41SandboxSettlement({...input(),...delta});
  assert.equal(x.status,'BLOCKED_BORROWER_DELTAS');
  assert.equal(x.borrowerMutationVerified,false);
 }
});
test('reverted callback, outstanding actor debt, preexisting actor debt, zero transfer all block',()=>{
 for(const [changes,status] of [
  [{receipt:receipt(false)},'BLOCKED_RECEIPT_OR_CALLBACK'],
  [{actorAfter:actor(2)},'BLOCKED_ACTOR_HAS_LIABILITY'],
  [{actorBefore:actor(1)},'BLOCKED_ACTOR_PRIOR_LIABILITY'],
  [{actorSeizeFtAfter:'10'},'BLOCKED_NO_FT_SEIZURE'],
 ]){
  const x=attestStage41SandboxSettlement({...input(),...changes});
  assert.equal(x.status,status);
  assert.equal(x.positiveNetProfitVerified,false);
  assert.equal(x.maySignMainnet,false);
 }
});
test('missing actor positions and malformed exact balances cannot become zero-amount evidence',()=>{
 for(const changes of [
  {actorAfter:{supplied:[]}},
  {actorSeizeFtAfter:'1.5'},
  {borrowerAfter:{positions:[]}},
  {borrowerBefore:{positions:{REGULAR:{borrowed:[{token_id:'usdt.near',shares:'12',balance:'13'}],collateral:[]}}}},
  {borrowerAfter:{positions:{REGULAR:{borrowed:[leg('usdt.near',-1)],collateral:[]}}}},
  {plan:{...plan(),mayBroadcastMainnet:true}},
 ])assert.throws(()=>attestStage41SandboxSettlement({...input(),...changes}));
});
test('zero outstanding debt after a fully liquidated position is allowed but still not PNL',()=>{
 const x=attestStage41SandboxSettlement({...input(),borrowerAfter:{positions:{}}});
 assert.equal(x.status,'POSITION_AND_FT_DELTAS_OBSERVED_UNSOLD');
 assert.equal(x.borrowerDebtAfterInternal,'0');
 assert.equal(x.positiveNetProfitVerified,false);
});
test('Stage37 runner now captures actual pre/post Sandbox borrower, actor, FT balances',async()=>{
 const {readFile}=await import('node:fs/promises');
 const script=await readFile(new URL('../scripts/stage37-workspaces-sandbox-replay.mjs',import.meta.url),'utf8');
 assert.ok(script.includes("STAGE37_ALLOW_SANDBOX_MUTATION!=='true'"));
 assert.ok(script.includes('withData:true'));
 assert.ok(script.includes('ft_balance_of'));
 assert.ok(script.includes("stage41-sandbox-balance-settlement.json"));
 assert.ok(script.includes('attestStage41SandboxSettlement'));
 assert.ok(!script.includes('broadcast_tx'));assert.ok(!script.includes('send_tx'));
});

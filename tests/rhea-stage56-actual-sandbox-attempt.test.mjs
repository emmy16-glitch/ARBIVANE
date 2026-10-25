import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {classifyStage56SandboxAttempt}
 from '../scripts/stage56-sandbox-attempt-evidence.mjs';

const blockPhase=()=>({
 mode:'ARBIVANE_STAGE55_LOCAL_RHEA_EXECUTION_PHASE_WITNESS',
 chain:'NEAR_SANDBOX',status:'BLOCKED_LOCAL_RHEA_EXECUTION',
 currentPhase:'SANDBOX_LIQUIDATION_TRANSACTION',
 completedPhases:['SOURCE_ADMISSION','SANDBOX_COLLATERAL_FUNDING','SANDBOX_LIQUIDATION_TRANSACTION'],
 localFundingAttempted:true,localLiquidationCallInvoked:true,
 observedFailureCode:'SANDBOX_CALL_REJECTED_BEFORE_FINAL_RECEIPTS',
 actualRheaSettlementVerified:false,mainnetExecutionEnabled:false,
 realMainnetExecuted:false,realProfitVerified:false,
 maySignMainnet:false,mayBroadcastMainnet:false,
});
const blocked=()=>({
 mode:'ARBIVANE_STAGE37_SANDBOX_RESULT',chain:'NEAR_SANDBOX',
 status:'BLOCKED_STATE_IMPORT_OR_INCOMPLETE_PROOF',
 attemptedTransaction:true,sandboxFundingAttempted:true,
 stage55Phase:'SANDBOX_LIQUIDATION_TRANSACTION',
 stage55ReasonCode:'SANDBOX_CALL_REJECTED_BEFORE_FINAL_RECEIPTS',
 realMainnetExecuted:false,realProfitVerified:false,mayBroadcastMainnet:false,
});
const input=()=>({exitCode:2,report:blocked(),phase:blockPhase()});
const goodReceipt=()=>({
 mode:'ARBIVANE_STAGE37_SANDBOX_RESULT',chain:'NEAR_SANDBOX',
 status:'ISOLATED_CALLBACK_SUCCESS_NOT_MAINNET_PROOF',
 persistedAtLaterFinalizedBlock:true,failedReceiptCount:0,
 realMainnetExecuted:false,realProfitVerified:false,mayBroadcastMainnet:false,
});
const goodSettlement=()=>({
 chain:'NEAR_SANDBOX',status:'POSITION_AND_FT_DELTAS_OBSERVED_UNSOLD',
 borrowerMutationVerified:true,assetTransferObserved:true,
 positiveNetProfitVerified:false,
});
function success(){
 return {
  exitCode:0,
  phase:{...blockPhase(),
   status:'LOCAL_RHEA_BALANCE_AND_CALLBACK_VERIFIED_NOT_PROFIT',
   currentPhase:'SANDBOX_BALANCE_SETTLEMENT',
   completedPhases:[...blockPhase().completedPhases,'SANDBOX_BALANCE_SETTLEMENT'],
   observedFailureCode:null,actualRheaSettlementVerified:true},
  report:{...blocked(),
   status:'ISOLATED_CALLBACK_SUCCESS_NOT_MAINNET_PROOF',
   stage55Status:'LOCAL_RHEA_BALANCE_AND_CALLBACK_VERIFIED_NOT_PROFIT',
   borrowerMutationVerified:true,assetTransferObserved:true},
  receipt:goodReceipt(),settlement:goodSettlement(),
 };
}
test('a REAL evidenced failed local call remains a failure while historical scan can reconcile',()=>{
 const out=classifyStage56SandboxAttempt(input());
 assert.equal(out.status,'BLOCKED_LOCAL_SANDBOX_EXECUTION_NOT_A_TRADE');
 assert.equal(out.readOnlyMarketContinuationAllowed,true);
 assert.equal(out.actualRheaSettlementVerified,false);
 assert.equal(out.localLiquidationCallInvoked,true);
 assert.equal(out.claimedRealProfit,false);
 assert.equal(out.mayBroadcastMainnet,false);
});
test('a failed state clone is a blocked local attempt, not a submitted liquidation',()=>{
 const phase={...blockPhase(),
  currentPhase:'SANDBOX_STATE_CLONE',
  completedPhases:['SOURCE_ADMISSION','SANDBOX_STATE_CLONE'],
  localFundingAttempted:false,localLiquidationCallInvoked:false,
  observedFailureCode:'STAGE46_INCOMPLETE_PINNED_SANDBOX_CLONE'};
 const report={...blocked(),attemptedTransaction:false,
  sandboxFundingAttempted:false,stage55Phase:phase.currentPhase,
  stage55ReasonCode:phase.observedFailureCode};
 const out=classifyStage56SandboxAttempt({exitCode:2,phase,report});
 assert.equal(out.localLiquidationCallInvoked,false);
 assert.equal(out.actualRheaSettlementVerified,false);
});
test('actual local success requires all independent Stage55, Stage48 and Stage41 receipts',()=>{
 const out=classifyStage56SandboxAttempt(success());
 assert.equal(out.status,'ACTUAL_LOCAL_RHEA_LIQUIDATION_RECEIPTS_AND_BALANCES_VERIFIED');
 assert.equal(out.actualRheaSettlementVerified,true);
 assert.equal(out.realMainnetExecuted,false);
 assert.equal(out.claimedRealProfit,false);
});
test('silently forged positive success, unknown error or incomplete proof cannot advance scanner',()=>{
 for(const changes of [
  {exitCode:1},
  {phase:{...blockPhase(),status:'LOCAL_SANDBOX_PHASE_STARTED'}},
  {phase:{...blockPhase(),observedFailureCode:'UNCLASSIFIED_RUNTIME_ERROR'}},
  {report:{...blocked(),realMainnetExecuted:true}},
  {report:{...blocked(),attemptedTransaction:false}},
  {phase:{...blockPhase(),actualRheaSettlementVerified:true}},
  {phase:{...blockPhase(),localFundingAttempted:false}},
  {phase:{...blockPhase(),currentPhase:'BOGUS'}},
  {report:null},
 ]){
  assert.throws(()=>classifyStage56SandboxAttempt({...input(),...changes}),/STAGE56_/);
 }
 const p=success();
 for(const changes of [
  {receipt:{...p.receipt,persistedAtLaterFinalizedBlock:false}},
  {settlement:{...p.settlement,borrowerMutationVerified:false}},
  {report:{...p.report,stage55Status:'BOGUS'}},
  {phase:{...p.phase,actualRheaSettlementVerified:false}},
 ])assert.throws(()=>classifyStage56SandboxAttempt({...p,...changes}),/STAGE56_/);
});
test('Stage42 launches real guarded Sandbox runner and only continues on validated terminal proof',async()=>{
 const yml=await readFile(new URL('../.github/workflows/rhea-stage42-reconciled-continuation.yml',import.meta.url),'utf8');
 assert.ok(yml.includes('STAGE37_ALLOW_SANDBOX_MUTATION=true'));
 assert.ok(yml.includes('STAGE49_ALLOW_SANDBOX_WRAP_NEAR_FUNDING=true'));
 assert.ok(yml.includes('sandbox_exit=$?'));
 assert.ok(yml.includes('stage56-sandbox-attempt-cli.mjs'));
 assert.ok(yml.includes('stage56-sandbox-attempt-evidence.json'));
 assert.ok(yml.includes('readOnlyMarketContinuationAllowed == true'));
 assert.ok(yml.includes('stage42-reconciled-window.json'));
 assert.ok(yml.includes('gh api --method POST'));
 assert.ok(!yml.includes('broadcast_tx'));
});

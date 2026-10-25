import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createStage55PhaseLedger,STAGE55_PHASES}
 from '../scripts/stage55-sandbox-execution-ledger.mjs';
const receipt=()=>({
 mode:'ARBIVANE_STAGE37_SANDBOX_RESULT',chain:'NEAR_SANDBOX',
 status:'ISOLATED_CALLBACK_SUCCESS_NOT_MAINNET_PROOF',
 failedReceiptCount:0,persistedAtLaterFinalizedBlock:true,
 realMainnetExecuted:false,realProfitVerified:false,mayBroadcastMainnet:false,
});
const settlement=()=>({
 mode:'ARBIVANE_STAGE41_SANDBOX_BALANCE_SETTLEMENT_WITNESS',
 chain:'NEAR_SANDBOX',status:'POSITION_AND_FT_DELTAS_OBSERVED_UNSOLD',
 borrowerMutationVerified:true,assetTransferObserved:true,
 callbackSuccessObserved:true,positiveNetProfitVerified:false,
 mayBroadcastMainnet:false,
});
function ready(){
 const ledger=createStage55PhaseLedger();
 for(const phase of STAGE55_PHASES){
  const v=ledger.enter(phase);
  assert.equal(v.currentPhase,phase);
  if(phase==='SANDBOX_COLLATERAL_FUNDING')ledger.fundingAttempted();
  if(phase==='SANDBOX_LIQUIDATION_TRANSACTION')ledger.transactionSubmitted();
 }
 return ledger;
}
test('Stage55 emits ordered, strictly local phase snapshots and never claims real profit',()=>{
 const a=createStage55PhaseLedger();
 const source=a.enter('SOURCE_ADMISSION');
 assert.equal(source.phaseCount,1);
 assert.equal(source.status,'LOCAL_SANDBOX_PHASE_STARTED');
 assert.equal(source.realMainnetExecuted,false);
 assert.equal(source.maySignMainnet,false);
 assert.equal(source.realProfitVerified,false);
 assert.equal(source.localLiquidationCallInvoked,false);
 assert.equal(source.localFundingAttempted,false);
 assert.throws(()=>a.enter('SOURCE_ADMISSION'),/STAGE55_NON_MONOTONIC/);
 assert.throws(()=>a.enter('NOT_A_PHASE'),/STAGE55_NON_MONOTONIC/);
});
test('Stage55 only completes real local callback plus independently attested FT and borrower settlement',()=>{
 const ledger=ready();
 const out=ledger.finish({receipt:receipt(),settlement:settlement()});
 assert.equal(out.status,'LOCAL_RHEA_BALANCE_AND_CALLBACK_VERIFIED_NOT_PROFIT');
 assert.equal(out.actualRheaSettlementVerified,true);
 assert.equal(out.localFundingAttempted,true);
 assert.equal(out.localLiquidationCallInvoked,true);
 assert.equal(out.phaseCount,STAGE55_PHASES.length);
 assert.equal(out.mainnetExecutionEnabled,false);
 assert.equal(out.realProfitVerified,false);
 assert.throws(()=>ledger.enter('SOURCE_ADMISSION'),/ALREADY_TERMINAL/);
});
test('Stage55 does not accept optimistic callback alone or a missing seized FT/debt delta',()=>{
 const bad=[
  {receipt:{...receipt(),status:'ISOLATED_CALLBACK_PENDING_FINALIZED_PERSISTENCE'}},
  {receipt:{...receipt(),persistedAtLaterFinalizedBlock:false}},
  {receipt:{...receipt(),failedReceiptCount:1}},
  {receipt:{...receipt(),mayBroadcastMainnet:true}},
  {settlement:{...settlement(),assetTransferObserved:false}},
  {settlement:{...settlement(),borrowerMutationVerified:false}},
  {settlement:{...settlement(),callbackSuccessObserved:false}},
  {settlement:{...settlement(),status:'BLOCKED_BORROWER_DELTAS'}},
  {settlement:{...settlement(),positiveNetProfitVerified:true}},
 ];
 for(const change of bad){
  const l=ready();
  assert.throws(()=>l.finish({
   receipt:change.receipt??receipt(),
   settlement:change.settlement??settlement(),
  }),/STAGE55_UNATTESTED/);
 }
});
test('Stage55 refuses local completion if funding, call or final settlement phase was skipped',()=>{
 const a=createStage55PhaseLedger();
 for(const p of STAGE55_PHASES)a.enter(p);
 assert.throws(()=>a.finish({receipt:receipt(),settlement:settlement()}),/UNATTESTED/);
 const b=createStage55PhaseLedger();b.enter('SOURCE_ADMISSION');
 assert.throws(()=>b.transactionSubmitted(),/WITHOUT_FUNDING/);
 assert.throws(()=>b.fundingAttempted(),/INVALID_COLLATERAL/);
});
test('Stage55 durable blocker excludes external RPC exception strings, URLs, tokens and keys',()=>{
 const a=createStage55PhaseLedger();
 a.enter('SANDBOX_STATE_CLONE');
 const secret='RPC rejected token=MY_PRIVATE_KEY https://example.org/auth';
 const report=a.blocked(new Error(secret));
 assert.equal(report.status,'BLOCKED_LOCAL_RHEA_EXECUTION');
 assert.equal(report.currentPhase,'SANDBOX_STATE_CLONE');
 assert.equal(report.observedFailureCode,'UNCLASSIFIED_RUNTIME_ERROR');
 assert.ok(!JSON.stringify(report).includes('MY_PRIVATE_KEY'));
 assert.equal(report.localLiquidationCallInvoked,false);
 assert.equal(report.actualRheaSettlementVerified,false);
 assert.throws(()=>a.enter('SANDBOX_PYTH_PARITY'),/ALREADY_TERMINAL/);
 const b=createStage55PhaseLedger();b.enter('PINNED_SOURCE_VIEWS');
 assert.equal(b.blocked(new Error('STAGE50_REPAY_EXCEEDS_PINNED_TOKEN_VAULT_RESERVE'))
  .observedFailureCode,'STAGE50_REPAY_EXCEEDS_PINNED_TOKEN_VAULT_RESERVE');
});
test('runner records phase evidence on every failed path and before local collateral / action',async()=>{
 const runner=await readFile(new URL('../scripts/stage37-workspaces-sandbox-replay.mjs',import.meta.url),'utf8');
 assert.ok(runner.includes("const stage55Path='stage55-sandbox-phase-evidence.json'"));
 assert.ok(runner.includes("markStage55('SANDBOX_STATE_CLONE')"));
 assert.ok(runner.includes("markStage55('SANDBOX_COLLATERAL_FUNDING')"));
 assert.ok(runner.includes("markStage55('SANDBOX_LIQUIDATION_TRANSACTION')"));
 assert.ok(runner.includes("markStage55('SANDBOX_BALANCE_SETTLEMENT')"));
 assert.ok(runner.indexOf("markStage55('SANDBOX_COLLATERAL_FUNDING')") <
  runner.indexOf('seedSandboxLiquidatorWithWrappedNear({'));
 assert.ok(runner.indexOf("markStage55('SANDBOX_LIQUIDATION_TRANSACTION')") <
  runner.indexOf('actor.callRaw(lending,plan.method'));
 assert.ok(runner.includes('const success=stage55.finish({receipt:verifiedReport,settlement});'));
 assert.ok(runner.includes('const failure=stage55.blocked(err);'));
 assert.ok(runner.includes('await recordStage55(failure)'));
 assert.ok(runner.includes('process.exitCode=2'));
 assert.ok(!runner.includes('broadcast_tx'));
});

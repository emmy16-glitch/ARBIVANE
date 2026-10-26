import test from 'node:test';
import assert from 'node:assert/strict';
import {stage142CreateFinancingIntent} from '../scripts/stage142-financing-intent.mjs';
import {stage143OpenJournal,stage143ApplyEvent,stage143Replay,
 stage143InspectJournal} from '../scripts/stage143-async-financing-journal.mjs';
import {stage144SimulatePartnerFundedRhea} from '../scripts/stage144-partner-financing-simulation.mjs';
import {stage145ProductionReview} from '../scripts/stage145-production-qualification.mjs';
const spec=()=>({
 mode:'AUTHORIZED_PARTNER_ESCROW',sourceAccountId:'partner.sandbox',
 repayAssetId:'linear-protocol.near',principalAtomic:'1000000',
 premiumAtomic:'1000',maxGasAndStorageInRepayAssetAtomic:'1000',
 maxSwapAndSlippageAtomic:'1000',minimumNetAtomic:'1000',
 observedMinProceedsAtomic:'1100000',ownerCollateralAtomic:'0',
 partnerEscrowAtomic:'1001000',operatorAccountId:'sillywiki4201.near',
 borrowerAccountId:'borrower.sandbox',evaluatedAtMs:1000,quoteExpiresAtMs:2500
});
const model=()=>({
 partnerActualSimulatedBalanceAtomic:'1500000',
 liquidationProceedsAtomic:'1100000',
 gasAndStorageCostAtomic:'1000',swapCostAtomic:'1000'
});
const action=(journal,kind,observedAtomic='0',reason)=>({
 seq:journal.sequence+1,previousHeadHash:journal.headHash,
 receiptId:'local-synthetic-'+String(journal.sequence+1).padStart(2,'0'),
 kind,observedAtomic,...(reason?{reason}:{})
});
test('Stage143 enforces a strictly sequenced hash chain with outstanding liabilities',()=>{
 const intent=stage142CreateFinancingIntent(spec());
 let s=stage143OpenJournal(intent);
 assert.equal(s.state,'CREATED');
 s=stage143ApplyEvent(s,action(s,'FUNDS_ISSUED','1000000'));
 assert.equal(s.outstandingLiabilityAtomic,'1000000');
 assert.equal(stage143InspectJournal(s).recoveryRequired,true);
 const forged={...s,outstandingLiabilityAtomic:'0'};
 assert.throws(()=>stage143ApplyEvent(forged,action(forged,'LIQUIDATION_CALLBACK_FINAL')),/STAGE143_JOURNAL_INTEGRITY_INVALID/);
 assert.throws(()=>stage143ApplyEvent(s,action(s,'RECONCILED')),/STAGE143_ILLEGAL_STATE_TRANSITION/);
 assert.throws(()=>stage143ApplyEvent(s,{...action(s,'LIQUIDATION_CALLBACK_FINAL'),seq:1}),/STAGE143_DUPLICATE_OR_OUT_OF_ORDER_EVENT/);
 const duplicate=action(s,'LIQUIDATION_CALLBACK_FINAL');
 const a=stage143ApplyEvent(s,duplicate);
 assert.throws(()=>stage143ApplyEvent(a,duplicate),/STAGE143_DUPLICATE_OR_OUT_OF_ORDER_EVENT/);
 assert.equal(a.mayBroadcastMainnet,false);
});
test('Stage143 failed callback freezes journal without forgetting loan debt',()=>{
 const intent=stage142CreateFinancingIntent(spec());
 let s=stage143OpenJournal(intent);
 s=stage143ApplyEvent(s,action(s,'FUNDS_ISSUED','1000000'));
 s=stage143ApplyEvent(s,action(s,'FAILED','0','SIMULATED_CALLBACK_FAILED'));
 assert.equal(s.state,'FAILED');
 assert.equal(s.outstandingLiabilityAtomic,'1000000');
 assert.equal(stage143InspectJournal(s).recoveryRequired,true);
 assert.throws(()=>stage143ApplyEvent(s,action(s,'REPAYMENT_TRANSFER_FINAL','1000000')),/STAGE143_ILLEGAL_STATE_TRANSITION/);
});
test('Stage143 rejects repayment shortfall, duplicate reference, forged success',()=>{
 const intent=stage142CreateFinancingIntent(spec());
 let s=stage143OpenJournal(intent);
 s=stage143ApplyEvent(s,action(s,'FUNDS_ISSUED','1000000'));
 s=stage143ApplyEvent(s,action(s,'LIQUIDATION_CALLBACK_FINAL'));
 assert.throws(()=>stage143ApplyEvent(s,action(s,'REPAYMENT_TRANSFER_FINAL','999999')),/STAGE143_UNPAID_FINANCING_LIABILITY/);
 assert.throws(()=>stage143ApplyEvent(s,{...action(s,'REPAYMENT_TRANSFER_FINAL','1001000'),receiptId:'local-synthetic-01'}),/STAGE143_MISSING_OR_REPLAYED_RECEIPT_REFERENCE/);
 let r=stage143ApplyEvent(s,action(s,'REPAYMENT_TRANSFER_FINAL','1001000'));
 r=stage143ApplyEvent(r,action(r,'ASSET_CONVERSION_FINAL'));
 r=stage143ApplyEvent(r,action(r,'RECONCILED'));
 assert.equal(stage143InspectJournal(r).offlineSimulationReconciled,true);
 assert.equal(stage143InspectJournal(r).realMoneyEarned,false);
 assert.equal(r.profitPayoutPermitted,false);
 assert.equal(stage143Replay(intent,r.events.map(e=>({seq:e.seq,previousHeadHash:e.previousHeadHash,
  receiptId:e.receiptId,kind:e.kind,observedAtomic:e.observedAtomic,
  ...(e.reason?{reason:e.reason}:{})}))).headHash,r.headHash);
});
test('Stage144 models independent simulated partner capital, liabilities and post-fee proceeds',()=>{
 const intent=stage142CreateFinancingIntent(spec());
 const sim=stage144SimulatePartnerFundedRhea(intent,model());
 assert.equal(sim.result,'SIMULATED_FULLY_RECONCILED_NOT_REAL_RHEA');
 assert.equal(sim.state,'RECONCILED');
 assert.equal(sim.simulatedPartnerInitialAtomic,'1500000');
 assert.equal(sim.simulatedPartnerClosingAtomic,'1501000');
 assert.equal(sim.simulatedRepaymentAtomic,'1001000');
 assert.equal(sim.simulatedResidualActorAtomic,'97000');
 assert.equal(sim.outstandingLiabilityAtomic,'0');
 assert.equal(sim.realNearWorkspacesExecution,false);
 assert.equal(sim.actualNetProfitVerified,false);
 assert.equal(sim.confirmedPayoutToOwner,false);
 assert.equal(sim.maySignMainnet,false);
});
test('Stage144 injected local failures preserve debt or halt payout even if repaid',()=>{
 const i=stage142CreateFinancingIntent(spec());
 for(const stop of ['LIQUIDATION_CALLBACK_FINAL','REPAYMENT_TRANSFER_FINAL',
  'ASSET_CONVERSION_FINAL']){
  const result=stage144SimulatePartnerFundedRhea(i,{...model(),injectFailureAt:stop});
  assert.equal(result.result,'SIMULATED_FAILURE_NEEDS_RECOVERY');
  assert.equal(result.state,'FAILED');
  assert.equal(result.recoveryRequired,true);
  assert.equal(result.actualNetProfitVerified,false);
  assert.equal(result.mayBroadcastMainnet,false);
  assert.equal(result.outstandingLiabilityAtomic,stop==='ASSET_CONVERSION_FINAL'?'0':'1000000');
 }
 const poor=stage144SimulatePartnerFundedRhea(i,{...model(),liquidationProceedsAtomic:'999'});
 assert.equal(poor.result,'SIMULATED_FAILURE_NEEDS_RECOVERY');
 assert.equal(poor.outstandingLiabilityAtomic,'1000000');
 assert.throws(()=>stage144SimulatePartnerFundedRhea(i,{...model(),
  partnerActualSimulatedBalanceAtomic:'1000000'}),/STAGE144_PARTNER_CANNOT_FINANCE/);
 assert.throws(()=>stage144SimulatePartnerFundedRhea(i,{...model(),
  gasAndStorageCostAtomic:'1001'}),/STAGE144_EXCEEDED_QUOTED/);
});
test('Stage145 refuses self-reported complete approvals and simulated profit',()=>{
 const intent=stage142CreateFinancingIntent(spec());
 const sim=stage144SimulatePartnerFundedRhea(intent,model());
 const claims=Object.fromEntries([
  'DEMONSTRATE_REAL_PROVIDER','PROVE_PARTNER_OR_FLASH_PRINCIPAL',
  'PROVE_ASYNC_REPAYMENT','VERIFY_REAL_RHEA_WORKSPACES',
  'VERIFY_ONCHAIN_TOKEN_DELTAS','VERIFY_TRADABLE_PROCEEDS',
  'VERIFY_GAS_SPONSOR','VERIFY_INDEPENDENT_AUDIT',
  'VERIFY_OWNER_APPROVAL','VERIFY_DEPLOYMENT_LIMITS'
 ].map(x=>[x,true]));
 const check=stage145ProductionReview({financingIntent:intent,
  localSimulation:sim,journal:sim.journal,assertions:claims});
 assert.equal(check.gates.length,10);
 assert.ok(check.gates.every(x=>x.claimedByOperator&&x.independentlyVerified===false));
 assert.equal(check.status,'BLOCKED_NO_VERIFIED_EXTERNAL_FINANCING_OR_SPEND_AUTHORIZATION');
 assert.equal(check.canActivateMainnet,false);
 assert.equal(check.canInitiateFlashLoan,false);
 assert.equal(check.canReleaseOwnerProfit,false);
 assert.equal(check.mayBroadcastMainnet,false);
 assert.throws(()=>stage145ProductionReview({
  financingIntent:intent,localSimulation:{...sim,realNearWorkspacesExecution:true},
  journal:sim.journal}),/STAGE145_UNTRUSTED_OR_NONMATCHING_PARTNER_SIMULATION/);
});

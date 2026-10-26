import test from 'node:test';
import assert from 'node:assert/strict';
import {stage157EvaluateLargeSourceLiquidation as gate} from '../scripts/stage157-large-source-liquidation-gate.mjs';
const E=10n**27n;
function fixture({repay=2000n,gross=30n}={}){
 const p={
  mode:'RHEA_STAGE35_PINNED_SOURCE_ONLY_LIQUIDATION_SIZING',
  chain:'NEAR_MAINNET',status:'PAPER_SCENARIOS_FOUND_NOT_EXECUTABLE',
  borrowerAccountId:'genuine-archived-borrower.near',blockHeight:'221600111',
  referenceRulesPass:true,referenceAfterHealthBps:'10100',
  repay:{tokenId:'wrap.near',referenceUsdE27:(repay*E).toString(),
   amountLendingInternalAtomic:'12345600000000000000',fundsAvailabilityVerified:false},
  seize:{tokenId:'wrap.near',amountLendingInternalAtomic:'12400000000000000000'},
  paperGrossUsdE27:(gross*E).toString(),executionEnabled:false,maySign:false,
  mayBroadcast:false,mainnetWalletApproved:false,sandboxStateReplaySucceeded:false,
  contractRouteParityVerified:false,gasAndSwapNetProfitVerified:false
 };
 return {mode:'RHEA_STAGE38_LIVE_CANDIDATE_TO_SANDBOX',chain:'NEAR_MAINNET',
  mainnetExecutionEnabled:false,maySignMainnet:false,mayBroadcastMainnet:false,
  netProfitVerified:false,walletApproved:false,sourceDebtAccounts:7801,
  sourceBlockHeight:'221436207',reviewed:50,refreshed:1,paperAtRiskFromPreviousScan:1,
  status:'SANDBOX_PLAN_READY_NOT_AUTHORIZED',sandboxPlanReady:true,
  bestProposal:p,rows:[{borrowerAccountId:p.borrowerAccountId,
   status:'FRESH_SOURCE_PLAN_FOR_SANDBOX_ONLY',observationBlockHeight:p.blockHeight,
   paperGrossUsdE27:p.paperGrossUsdE27,executionEligible:false,netProfitVerified:false}]};
}
test('Stage157 only admits fresh, large reference-sized sources to local Sandbox, never mainnet',()=>{
 const v=gate(fixture());
 assert.equal(v.canAttemptSandbox,true);
 assert.equal(v.status,'ELIGIBLE_FOR_SOURCE_PINNED_LOCAL_SANDBOX_REPLAY_ONLY');
 assert.equal(v.sourceRepayAsset,'wrap.near');
 assert.equal(v.maySignMainnet,false);
 assert.equal(v.realizedNetEconomicProfitVerified,false);
 assert.equal(v.partnerFullyRepaidVerified,false);
});
test('Stage157 blocks the archived 0.0035 USD gross tiny candidate and any smaller repayment',()=>{
 for(const x of [fixture({repay:100n,gross:0n}),fixture({repay:2000n,gross:1n}),
                   fixture({repay:999n,gross:500n})]){
  const v=gate(x);assert.equal(v.canAttemptSandbox,false);
  assert.equal(v.status,'BLOCKED_NO_VERIFIED_LARGE_SOURCE');
 }
});
test('Stage157 rejects unsigned/adulterated/stale reference matches',()=>{
 const cases=[
  v=>{v.mayBroadcastMainnet=true;},
  v=>{v.refreshed=0;},
  v=>{v.sourceBlockHeight=null;},
  v=>{v.bestProposal.borrowerAccountId='wrong.near';},
  v=>{v.bestProposal.blockHeight='221600112';},
  v=>{v.bestProposal.referenceRulesPass=false;},
  v=>{v.bestProposal.repay.tokenId='linear-protocol.near';},
  v=>{v.bestProposal.repay.fundsAvailabilityVerified=true;},
  v=>{v.bestProposal.gasAndSwapNetProfitVerified=true;},
  v=>{v.bestProposal.paperGrossUsdE27='1.5';},
  v=>{v.rows[0].executionEligible=true;},
 ];
 for(const corrupt of cases){
  const x=fixture();corrupt(x);assert.equal(gate(x).canAttemptSandbox,false);
 }
});
test('Stage157 hard minimums cannot be weakened by configuration',()=>{
 assert.throws(()=>gate(fixture(),{minRepayUsdE27:(999n*E).toString()}),
  /MINIMUMS_CANNOT_BE_WEAKENED/);
 assert.throws(()=>gate(fixture(),{minGrossUsdE27:(9n*E).toString()}),
  /MINIMUMS_CANNOT_BE_WEAKENED/);
});

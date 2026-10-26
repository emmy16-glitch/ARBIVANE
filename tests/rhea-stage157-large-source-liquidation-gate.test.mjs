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
  repay:{tokenId:'linear-protocol.near',referenceUsdE27:(repay*E).toString(),
   amountLendingInternalAtomic:'12345600000000000000',fundsAvailabilityVerified:false},
  seize:{tokenId:'linear-protocol.near',amountLendingInternalAtomic:'12400000000000000000'},
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
 assert.equal(v.sourceRepayAsset,'linear-protocol.near');
 assert.equal(v.maySignMainnet,false);
 assert.equal(v.realizedNetEconomicProfitVerified,false);
 assert.equal(v.partnerFullyRepaidVerified,false);
});
test('Stage160 allows any positive source-sized amount without a hardcoded dollar minimum',()=>{
 for(const x of [fixture({repay:1n,gross:1n}),fixture({repay:999n,gross:1n}),
                   fixture({repay:2000n,gross:1n})]){
  const v=gate(x);
  assert.equal(v.canAttemptSandbox,true);
  assert.equal(v.minimumRepayUsdE27,'0');
  assert.equal(v.minimumGrossUsdE27,'0');
  assert.equal(v.maySignMainnet,false);
 }
 const tiny=fixture({repay:1n,gross:1n});
 tiny.bestProposal.repay.amountLendingInternalAtomic='1';
 tiny.bestProposal.seize.amountLendingInternalAtomic='2';
 assert.equal(gate(tiny).canAttemptSandbox,true);
});
test('Stage160 refuses truly zero source debt or zero source gross at all sizes',()=>{
 for(const x of [fixture({repay:0n,gross:1n}),fixture({repay:1n,gross:0n})]){
  const result=gate(x);
  assert.equal(result.canAttemptSandbox,false);
  assert.equal(result.status,'BLOCKED_NO_VERIFIED_LARGE_SOURCE');
 }
 const x=fixture({repay:1n,gross:1n});
 x.bestProposal.repay.amountLendingInternalAtomic='0';
 assert.equal(gate(x).canAttemptSandbox,false);
});
test('Stage157 rejects unsigned/adulterated/stale reference matches',()=>{
 const cases=[
  v=>{v.mayBroadcastMainnet=true;},
  v=>{v.refreshed=0;},
  v=>{v.sourceBlockHeight=null;},
  v=>{v.bestProposal.borrowerAccountId='wrong.near';},
  v=>{v.bestProposal.blockHeight='221600112';},
  v=>{v.bestProposal.referenceRulesPass=false;},
  v=>{v.bestProposal.repay.tokenId='wrap.near';},
  v=>{v.bestProposal.repay.fundsAvailabilityVerified=true;},
  v=>{v.bestProposal.gasAndSwapNetProfitVerified=true;},
  v=>{v.bestProposal.paperGrossUsdE27='1.5';},
  v=>{v.rows[0].executionEligible=true;},
 ];
 for(const corrupt of cases){
  const x=fixture();corrupt(x);assert.equal(gate(x).canAttemptSandbox,false);
 }
});
test('Stage158 rejects even large source gross when deployed NEP141 route is unsupported',()=>{
 const x=fixture({repay:2000n,gross:40n});
 x.bestProposal.repay.tokenId='wrap.near';
 x.bestProposal.seize.tokenId='wrap.near';
 const v=gate(x);
 assert.equal(v.canAttemptSandbox,false);
 assert.deepEqual(v.blockers,['STAGE157_UNSUPPORTED_DEPLOYED_LARGE_LIQUIDATION_ASSET_ROUTE']);
 assert.equal(v.actualMainnetLoan,false);
 assert.equal(v.mayBroadcastMainnet,false);
});
test('Stage160 rejects nonpositive same-token remainder even with positive reference spread',()=>{
 const noRemainder=fixture({repay:2000n,gross:50n});
 noRemainder.bestProposal.seize.amountLendingInternalAtomic=
  noRemainder.bestProposal.repay.amountLendingInternalAtomic;
 const result=gate(noRemainder);
 assert.equal(result.canAttemptSandbox,false);
 assert.ok(result.blockers.includes('STAGE159_NONPOSITIVE_INTERNAL_SAME_TOKEN_SPREAD'));
 assert.equal(result.mayBroadcastMainnet,false);
});
test('Stage160 optional operator amount filters are preferences, not immutable floors',()=>{
 const x=fixture({repay:500n,gross:5n});
 assert.equal(gate(x).canAttemptSandbox,true);
 const v=gate(x,{minRepayUsdE27:(1000n*E).toString(),
                  minGrossUsdE27:(10n*E).toString()});
 assert.equal(v.canAttemptSandbox,false);
 assert.deepEqual(v.blockers,['STAGE160_BELOW_OPTIONAL_REQUESTED_REPAY_FILTER',
                              'STAGE160_BELOW_OPTIONAL_REQUESTED_GROSS_FILTER']);
 assert.equal(gate(x,{minRepayUsdE27:'0',minGrossUsdE27:'0'}).canAttemptSandbox,true);
 for(const invalid of ['-1','1.5','100abc']){
  assert.throws(()=>gate(x,{minRepayUsdE27:invalid}),/STAGE157_INVALID_MIN_REPAY/);
 }
});

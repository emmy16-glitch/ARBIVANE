import test from 'node:test';
import assert from 'node:assert/strict';
import {buildStage37SandboxPlan} from '../src/rhea/stage37-sandbox-liquidation.ts';
import {attestStage41SandboxSettlement} from '../src/rhea/stage41-sandbox-settlement.ts';
import {inspectStage49RheaAssets} from '../scripts/stage49-sandbox-route-readiness.mjs';
import {inspectStage49SandboxBorrow} from '../scripts/stage49-sandbox-borrow-preflight.mjs';
const token='linear-protocol.near',borrower='source-borrower.near';
const debt='1858490264040444',seize='1861021453855872';
const delta=(BigInt(debt)+999999n)/1000000n;
const proposal=()=>({
 mode:'RHEA_STAGE35_PINNED_SOURCE_ONLY_LIQUIDATION_SIZING',
 chain:'NEAR_MAINNET',status:'PAPER_SCENARIOS_FOUND_NOT_EXECUTABLE',
 borrowerAccountId:borrower,blockHeight:'221671156',
 lendingCodeHash:'2'.repeat(43),pythOracleCodeHash:'3'.repeat(43),
 referenceInitialHealthBps:'9000',positionId:'REGULAR',
 referenceRulesPass:true,contractRouteParityVerified:false,
 rawTokenDenominationsVerified:false,sandboxStateReplaySucceeded:false,
 gasAndSwapNetProfitVerified:false,walletCapitalVerified:false,
 mainnetWalletApproved:false,executionEnabled:false,maySign:false,mayBroadcast:false,
 repay:{tokenId:token,amountLendingInternalAtomic:debt,referenceUsdE27:'1',
  shareToActualTokenAtomicConversionVerified:false,fundsAvailabilityVerified:false},
 seize:{tokenId:token,amountLendingInternalAtomic:seize,referenceUsdE27:'1',
  shareToActualTokenAtomicConversionVerified:false,fundsAvailabilityVerified:false},
});
const legs=(n)=>([{token_id:token,balance:n,shares:n}]);
const pool=()=>[[token,{config:{can_borrow:true,can_withdraw:true},
 supplied:{balance:'999999999999999999999999'},borrowed:{balance:'100'}}]];
const pos=(debtValue,collValue)=>({positions:{REGULAR:{
 borrowed:debtValue?legs(debtValue):[],collateral:collValue?legs(collValue):[]}}});
test('Stage131 maximum native repay covers only <=1ppm of genuine temporary share rounding',()=>{
 const plan=buildStage37SandboxPlan(proposal());
 assert.equal(plan.actions[1].Liquidate.in_assets[0].max_amount,debt);
 assert.equal(plan.actions[2].Repay.max_amount,(BigInt(debt)+delta).toString());
 assert.equal(plan.actions[2].Repay.amount,undefined);
 assert.equal(plan.actions[3].Withdraw.max_amount,(BigInt(seize)-BigInt(debt)).toString());
 const data=pool();
 assert.equal(inspectStage49RheaAssets(plan,data,221671156).repayAndSeizeShareToken,true);
 assert.equal(inspectStage49SandboxBorrow({plan,assets:data,
  actorAccountId:'arbivane-replay.test.near',
  actorPositions:pos('0','1000000000000000000000000')}).sandboxAttemptAllowed,true);
});
test('Stage131 rejects ANY larger repayment exposure or manipulated source Liquidate cap',()=>{
 const plan=buildStage37SandboxPlan(proposal());
 const bad=structuredClone(plan);bad.actions[2].Repay.max_amount=
  (BigInt(debt)+delta+1n).toString();
 assert.throws(()=>inspectStage49RheaAssets(bad,pool(),221671156),/STAGE49_/);
 assert.throws(()=>inspectStage49SandboxBorrow({plan:bad,assets:pool(),
  actorAccountId:'arbivane-replay.test.near',actorPositions:pos('0','1000000000')}),/STAGE49_/);
 const extra=structuredClone(plan);extra.actions[2].Repay.amount=debt;
 assert.throws(()=>inspectStage49RheaAssets(extra,pool(),221671156),/STAGE49_/);
 const source=structuredClone(plan);
 source.actions[1].Liquidate.in_assets[0].max_amount=(BigInt(debt)+1n).toString();
 assert.throws(()=>inspectStage49RheaAssets(source,pool(),221671156),/STAGE49_/);
});
test('Stage131 strict settlement still rejects a single actor debt share and missing FT profit',()=>{
 const plan=buildStage37SandboxPlan(proposal());
 const before=pos('400000000000000000','800000000000000000');
 const after=pos('398000000000000000','798000000000000000');
 const receipt={mode:'ARBIVANE_STAGE37_SANDBOX_RESULT',chain:'NEAR_SANDBOX',
  status:'ISOLATED_CALLBACK_SUCCESS_NOT_MAINNET_PROOF',attemptedTransaction:true,
  transactionFinal:true,transactionExecutionStatus:'FINAL',
  receiptCount:12,failedReceiptCount:0,realMainnetExecuted:false,
  realProfitVerified:false,mayBroadcastMainnet:false,executionEnabled:false};
 const args={plan,positionId:'REGULAR',receipt,borrowerBefore:before,borrowerAfter:after,
  actorBefore:pos('0','100000000000000'),actorAfter:pos('0','100000000000000'),
  actorRepayFtBefore:'0',actorRepayFtAfter:'2530000000000',
  actorSeizeFtBefore:'0',actorSeizeFtAfter:'2530000000000'};
 assert.equal(attestStage41SandboxSettlement(args).status,'POSITION_AND_FT_DELTAS_OBSERVED_UNSOLD');
 assert.equal(attestStage41SandboxSettlement({...args,actorAfter:pos('2','100000000000000')}).status,
  'BLOCKED_ACTOR_HAS_LIABILITY');
 assert.equal(attestStage41SandboxSettlement({...args,actorSeizeFtAfter:'0',
  actorRepayFtAfter:'0'}).status,'BLOCKED_NO_FT_SEIZURE');
});

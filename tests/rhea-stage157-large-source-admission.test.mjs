import test from 'node:test';
import assert from 'node:assert/strict';
import {stage157LargeSourceAdmission} from '../scripts/stage157-large-source-admission.mjs';

const E=10n**27n;
const p=()=>({
 mode:'RHEA_STAGE35_PINNED_SOURCE_ONLY_LIQUIDATION_SIZING',
 chain:'NEAR_MAINNET',status:'PAPER_SCENARIOS_FOUND_NOT_EXECUTABLE',
 referenceRulesPass:true,borrowerAccountId:'authentic-borrower.near',
 blockHeight:'221777777',executionEnabled:false,maySign:false,mayBroadcast:false,
 gasAndSwapNetProfitVerified:false,sandboxStateReplaySucceeded:false,
 repay:{tokenId:'linear-protocol.near',referenceUsdE27:(1000n*E).toString()},
 seize:{tokenId:'linear-protocol.near'},
 paperGrossUsdE27:(20n*E).toString()
});
const q=(proposal=p())=>({
 mode:'RHEA_STAGE38_LIVE_CANDIDATE_TO_SANDBOX',chain:'NEAR_MAINNET',
 status:proposal?'SANDBOX_PLAN_READY_NOT_AUTHORIZED':'NO_EXECUTABLE_SOURCE_REFERENCE',
 sandboxPlanReady:!!proposal,positiveSourcePlans:proposal?1:0,
 sourceDebtAccounts:7801,startFinding:2537,nextFinding:2617,
 mainnetExecutionEnabled:false,maySignMainnet:false,mayBroadcastMainnet:false,
 netProfitVerified:false,bestProposal:proposal,
 rows:proposal?[{borrowerAccountId:proposal.borrowerAccountId,
  observationBlockHeight:proposal.blockHeight,status:'FRESH_SOURCE_PLAN_FOR_SANDBOX_ONLY'}]:[]
});
test('Stage157 source-sized larger paper liquidation admits only isolated Sandbox replay',()=>{
 const x=stage157LargeSourceAdmission({qualification:q()});
 assert.equal(x.status,'LARGE_SOURCE_CANDIDATE_SANDBOX_ONLY');
 assert.equal(x.sourceSizeLargeEnoughForSandbox,true);
 assert.equal(x.sourceRepayReferenceUsdE27,(1000n*E).toString());
 assert.equal(x.actualOriginalSettlementVerified,false);
 assert.equal(x.realFinancingCostsVerified,false);
 assert.equal(x.actualMainnetProfitVerified,false);
 assert.equal(x.externalLenderVerified,false);
 assert.equal(x.maySignMainnet,false);
 assert.equal(x.mayBroadcastMainnet,false);
 assert.equal(x.executionEnabled,false);
});
test('Stage157 does not enlarge a source borrower or mistake larger loan principal for liquidation',()=>{
 const x=p();x.repay.referenceUsdE27=(10n*E).toString();
 const a=stage157LargeSourceAdmission({qualification:q(x)});
 assert.equal(a.status,'NO_VERIFIED_LARGE_LIQUIDATION');
 assert.equal(a.blocker,'SOURCE_LIQUIDATION_REPAY_BELOW_LARGE_THRESHOLD');
 assert.equal(a.sourceSizeLargeEnoughForSandbox,false);
 const b=p();b.paperGrossUsdE27=(1n*E).toString();
 assert.equal(stage157LargeSourceAdmission({qualification:q(b)}).blocker,
 'SOURCE_LIQUIDATION_DISCOUNT_BELOW_LARGE_THRESHOLD');
});
test('Stage157 does not claim execution if no new large eligible borrower found',()=>{
 const x=stage157LargeSourceAdmission({qualification:q(null)});
 assert.equal(x.status,'NO_VERIFIED_LARGE_LIQUIDATION');
 assert.equal(x.actualOriginalSettlementVerified,false);
 assert.equal(x.sourceBorrowerAccountId,null);
});
test('Stage157 refuses another token route until deployed contract route parity is implemented',()=>{
 const x=p();x.repay.tokenId='wrap.near';x.seize.tokenId='wrap.near';
 const d=stage157LargeSourceAdmission({qualification:q(x)});
 assert.equal(d.blocker,'UNSUPPORTED_LARGE_SOURCE_ASSET_ROUTE');
 assert.equal(d.sourceSizeLargeEnoughForSandbox,false);
});
test('Stage157 rejects forged source, promoted settlement, missing row, numeric corruption and signing',()=>{
 const a=q();a.mainnetExecutionEnabled=true;
 assert.throws(()=>stage157LargeSourceAdmission({qualification:a}),/STAGE157_UNTRUSTED_SOURCE_QUALIFICATION/);
 const b=q();b.rows=[];
 assert.throws(()=>stage157LargeSourceAdmission({qualification:b}),/STAGE157_UNATTESTED_BEST_PROPOSAL/);
 const c=p();c.paperGrossUsdE27='20.00';
 assert.throws(()=>stage157LargeSourceAdmission({qualification:q(c)}),/STAGE157_BAD_PAPER_GROSS_USD/);
 const d=p();d.gasAndSwapNetProfitVerified=true;
 assert.throws(()=>stage157LargeSourceAdmission({qualification:q(d)}),/STAGE157_UNTRUSTED_SOURCE_PROPOSAL/);
 const e=q();e.mayBroadcastMainnet=true;
 assert.throws(()=>stage157LargeSourceAdmission({qualification:e}),/STAGE157_UNTRUSTED_SOURCE_QUALIFICATION/);
});

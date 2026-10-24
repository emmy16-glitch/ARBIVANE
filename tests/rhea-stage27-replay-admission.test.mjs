import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {assessStage27ReplayAdmission} from '../src/rhea/replay-admission.ts';
const E=10n**27n;
const C='6470256469223058373407048439157125446607770319000000';
const D='6651483918849689797371598808733861428672591513784463';
const H='221427151',L='2'.repeat(43),O='3'.repeat(43),P='4'.repeat(43);
function report(overrides={}){
 const row={positionId:'REGULAR',debtAssetIds:['wrap.near'],collateralAssetIds:['usdc.near'],
  status:'PAPER_AT_RISK_UNAPPROVED',reason:null,healthFactorBps:'9727',
  adjustedCollateralE27:C,adjustedDebtE27:D,quotes:2,executionEligible:false,profitVerified:false};
 return {mode:'RHEA_STAGE26_FRESH_SINGLE_BORROWER_HEALTH',chain:'NEAR_MAINNET',
  status:'PAPER_HEALTH_UNAPPROVED',blockHeight:H,borrowerAccountId:'tmp-owner.main.burrow.near',
  lendingCodeHash:L,oracleCodeHash:O,configuredOracleCodeHash:P,
  pythEnabled:true,positions:1,paperAtRisk:1,paperHealthy:0,blockedPositions:0,
  rows:[row],sourceModel:'ARCHIVED_BURROW_REFERENCE',
  deployedExecutionOraclePriceParityVerified:false,deployedLiquidationRulesVerified:false,
  transactionReplayVerified:false,netProfitVerified:false,executionEnabled:false,
  maySign:false,mayBroadcast:false,...overrides};
}
const opts={latestFinalizedHeight:'221427157',maxEvidenceBlockLag:30,
 maxUnverifiedAdjustedPositionUsd:'10000000'};
test('real Stage26 mainnet E27 values trigger unit anomaly, not a fake profitable trade',()=>{
 const result=assessStage27ReplayAdmission(report(),opts);
 assert.equal(result.status,'BLOCKED_VALUE_SANITY');
 assert.equal(result.implausiblyValuedPositions,1);
 assert.equal(result.positions[0].referenceDebtAboveSanityCap,true);
 assert.equal(result.positions[0].referenceNumbersReconcile,true);
 assert.equal(result.positions[0].paperAtRisk,true);
 assert.equal(result.paperAtRiskCount,1);
 assert.equal(result.referenceValuationScale,'E27_UNVERIFIED_EXECUTION_USD_EQUIVALENCE');
 assert.ok(result.blockers.includes('REFERENCE_POSITION_VALUATION_EXCEEDS_SANITY_CAP'));
 assert.equal(result.positions[0].estimatedRepayAmountAtomic,null);
 assert.equal(result.realizedProfitUsd,null);
 assert.equal(result.contractTransactionReplayed,false);
 assert.equal(result.mayBroadcast,false);
 assert.equal(result.mayAttemptStateImport,true);
});
test('bounded, mathematically consistent paper position is still not transaction simulation',()=>{
 const r=report({rows:[{...report().rows[0],adjustedCollateralE27:(90n*E).toString(),
  adjustedDebtE27:(100n*E).toString(),healthFactorBps:'9000'}]});
 const result=assessStage27ReplayAdmission(r,opts);
 assert.equal(result.status,'BLOCKED_PENDING_SANDBOX_REPLAY');
 assert.equal(result.implausiblyValuedPositions,0);
 assert.equal(result.contractTransactionReplayed,false);
 assert.equal(result.executionEnabled,false);
 assert.equal(result.mayAttemptStateImport,true);
});
test('stale stage 26 observation prohibits sandbox import attempt',()=>{
 const result=assessStage27ReplayAdmission(report(),{...opts,latestFinalizedHeight:'221427182',maxEvidenceBlockLag:15});
 assert.equal(result.status,'BLOCKED_STALE_EVIDENCE');
 assert.equal(result.mayAttemptStateImport,false);
});
test('missing quote is represented as blocked, not as healthy or profitable',()=>{
 const row={...report().rows[0],status:'BLOCKED',reason:'PRICE_STALE_OR_UNCERTAIN',
  healthFactorBps:null,adjustedCollateralE27:null,adjustedDebtE27:null};
 const r=report({status:'INCOMPLETE_PRICE_EVIDENCE',rows:[row],paperAtRisk:0,blockedPositions:1});
 const result=assessStage27ReplayAdmission(r,opts);
 assert.equal(result.status,'BLOCKED_INCOMPLETE_EVIDENCE');
 assert.equal(result.positions[0].referenceNumbersReconcile,null);
 assert.equal(result.contractTransactionReplayed,false);
});
test('fabricated health, flags, borrower count, fields and missing amounts abort',()=>{
 for(const broken of [
  {rows:[{...report().rows[0],healthFactorBps:'9999'}]},
  {rows:[{...report().rows[0],status:'PAPER_HEALTHY_UNAPPROVED'}]},
  {rows:[{...report().rows[0],adjustedDebtE27:null}]},
  {positions:2},
  {netProfitVerified:true},{executionEnabled:true},{mayBroadcast:true},
  {borrowerAccountId:'bad email!'},{paperAtRisk:0},
 ]){
  assert.throws(()=>assessStage27ReplayAdmission(report(broken),opts));
 }
});
test('unknown source E27 limit and future heights are rejected',()=>{
 for(const changes of [{maxUnverifiedAdjustedPositionUsd:'0'},
  {maxUnverifiedAdjustedPositionUsd:'100000001'},
  {maxUnverifiedAdjustedPositionUsd:'0.01'},
  {latestFinalizedHeight:'221427149'},
  {maxEvidenceBlockLag:1000}]){
  assert.throws(()=>assessStage27ReplayAdmission(report(),{...opts,...changes}));
 }
});
test('optional sandbox probe never creates mainnet transaction and requires full state import',async()=>{
 const s=await readFile(new URL('../scripts/stage27-sandbox-state-import.mjs',import.meta.url),'utf8');
 assert.ok(s.includes('STAGE27_SANDBOX_IMPORT_ONLY'));
 assert.ok(s.includes("withData:true"));
 assert.ok(s.includes("network:'sandbox'"));
 assert.ok(s.includes("contractTransactionReplayed:false"));
 assert.ok(!s.includes('broadcast_tx'));
 assert.ok(!s.includes('transact()'));
 assert.ok(!/withData\s*:\s*false\s*[,}]/.test(s));
});
test('CI executes only read-only proof and never treats matching quote as approval',async()=>{
 const s=await readFile(new URL('../.github/workflows/rhea-stage27-replay-admission.yml',import.meta.url),'utf8');
 assert.ok(s.includes("EXECUTION_ENABLED: 'false'"));
 assert.ok(s.includes('.gate.contractTransactionReplayed == false'));
 assert.ok(s.includes('.gate.mayBroadcast == false'));
 assert.ok(s.includes('.gate.status == "BLOCKED_VALUE_SANITY"'));
});

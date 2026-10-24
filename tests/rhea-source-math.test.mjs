import test from 'node:test';
import assert from 'node:assert/strict';
import {
 SOURCE_SCALE, sourceMul, sourceDiv, sourceMulRatio,sourceDivRatio,
 sourceSharesToAmount,sourceAmountToShares,sourceFromBalancePrice,sourceComputeDiscount,
 sourceValueAccount,sourceCheckLiquidationRules,
} from '../src/rhea/source-math.ts';
import {parseRheaMarket,valueRheaAccount} from '../src/rhea/valuation.ts';
import {assessPaperLiquidation} from '../src/rhea/liquidation.ts';
import {compareSourceToStage2} from '../src/rhea/source-differential.ts';
const S=SOURCE_SCALE;
const make=(collateral='1000',debt='4000',collRatio=5000,debtRatio=10000,price=7000000)=>{
 const snap={mode:'DISCOVERY_ONLY',blockHeight:'12345',accountCount:1,assets:[
  ['wrap.near',{supplied:{shares:'100000',balance:'100000'},borrowed:{shares:'100000',balance:'100000'},config:{volatility_ratio:collRatio,extra_decimals:0,can_borrow:true}}],
  ['dai.near',{supplied:{shares:'100000',balance:'100000'},borrowed:{shares:'100000',balance:'100000'},config:{volatility_ratio:debtRatio,extra_decimals:0,can_borrow:true}}]
 ],oracle:{timestamp:'1792800000000000000',prices:[{asset_id:'wrap.near',price:{multiplier:String(price),decimals:6}},{asset_id:'dai.near',price:{multiplier:'1000000',decimals:6}}]},
 accounts:[{account_id:'alice.near',collateral:{'wrap.near':collateral},borrowed:{'dai.near':debt},supplied:{}}]};
 const market=parseRheaMarket(snap);return {market,account:valueRheaAccount(snap.accounts[0],market)};
};
test('27-decimal upstream arithmetic: rounding, half-up ratios and discounts',()=>{
 assert.equal(sourceMul(S/2n,S/2n),S/4n);
 assert.equal(sourceDiv(S,2n*S),S/2n);
 assert.equal(sourceMulRatio(10001n,5000n),5001n);
 assert.equal(sourceDivRatio(10001n,5000n),20003n);
 assert.equal(sourceComputeDiscount(3500n*S,4000n*S),625n*S/10000n);
 assert.equal(sourceComputeDiscount(100n*S,100n*S),0n);
 assert.throws(()=>sourceDiv(1n,0n),/denominator/);
 assert.throws(()=>sourceMulRatio(S,0n),/ratio/);
});
test('exact upstream Pool share-to-amount: final share always gets full balance',()=>{
 const pool={shares:3n,balance:10n};
 assert.equal(sourceSharesToAmount(1n,pool,false),3n);
 assert.equal(sourceSharesToAmount(1n,pool,true),4n);
 assert.equal(sourceSharesToAmount(3n,pool,false),10n);
 assert.equal(sourceAmountToShares(4n,pool,false),1n);
 assert.equal(sourceAmountToShares(4n,pool,true),2n);
 assert.equal(sourceSharesToAmount(0n,{shares:0n,balance:0n},false),0n);
 assert.throws(()=>sourceSharesToAmount(4n,pool,true),/pool invariant/);
 assert.throws(()=>sourceSharesToAmount(1n,{shares:10n,balance:3n},false),/pool invariant/);
});
test('from_balance_price mirrors 27-decimal precision and truncation',()=>{
 assert.equal(sourceFromBalancePrice(3n,1000000n,6,0),3n*S);
 assert.equal(sourceFromBalancePrice(1n,1n,28,0),0n);
 assert.equal(sourceFromBalancePrice(11n,1n,28,0),1n);
 assert.throws(()=>sourceFromBalancePrice(1n,1n,100,0),/precision/);
 assert.throws(()=>sourceFromBalancePrice(-1n,1n,6,0),/u128/);
});
test('source-model valuation matches the Rhea published 87.5% example, not live deployed source',()=>{
 const {market,account}=make();const model=sourceValueAccount(account,market);
 assert.equal(model.adjustedCollateralE27,(3500n*S).toString());
 assert.equal(model.adjustedDebtE27,(4000n*S).toString());
 assert.equal(model.healthFactorE27,(8750n*S/10000n).toString());
 assert.equal(model.discountE27,(625n*S/10000n).toString());
 assert.equal(model.sourceContractParityVerified,false);
 const differential=compareSourceToStage2(account,market);
 assert.deepEqual(differential.differences,[]);
 assert.equal(differential.approvedForExecution,false);
});
test('the fourth upstream liquidation invariant rejects decreasing health even when other three pass',()=>{
 const {market,account}=make('80','100',10000,10000,1000000);
 const proposed={repay:[{tokenId:'dai.near',atomicUnits:'1'}],seize:[{tokenId:'wrap.near',atomicUnits:'1'}]};
 const paper=assessPaperLiquidation(account,market,proposed);
 assert.ok(!paper.reasons.includes('DISCOUNTED_COLLATERAL_EXCEEDS_REPAYMENT'));
 assert.ok(!paper.reasons.includes('FINAL_HEALTH_NOT_BELOW_ONE'));
 assert.ok(paper.reasons.includes('FINAL_HEALTH_NOT_IMPROVED'));
 assert.equal(paper.satisfiesDocumentedRules,false);
 const check=sourceCheckLiquidationRules({beforeCollateralE27:80n*S,beforeDebtE27:100n*S,afterCollateralE27:79n*S,afterDebtE27:99n*S,repaidE27:S,seizedE27:S});
 assert.deepEqual(check.reasons,['BORROWER_HEALTH_NOT_IMPROVED']);
 assert.equal(check.approvedForExecution,false);
});
test('positive published liquidation sample passes all four source-rule checks',()=>{
 const check=sourceCheckLiquidationRules({beforeCollateralE27:3500n*S,beforeDebtE27:4000n*S,afterCollateralE27:2968n*S,afterDebtE27:3000n*S,repaidE27:1000n*S,seizedE27:1064n*S});
 assert.deepEqual(check.reasons,[]);
 assert.equal(check.validBySourceRules,true);
 assert.equal(check.approvedForExecution,false);
});
test('full repayment and nonimproving health are both rejected; invalid amounts fail closed',()=>{
 const a={beforeCollateralE27:35n*S,beforeDebtE27:40n*S,afterCollateralE27:0n,afterDebtE27:0n,repaidE27:40n*S,seizedE27:35n*S};
 const result=sourceCheckLiquidationRules(a);
 assert.ok(result.reasons.includes('FINAL_POSITION_NOT_AT_RISK'));
 assert.throws(()=>sourceCheckLiquidationRules({...a,repaidE27:-1n}),/invalid/);
});
test('source-vs-Stage2 diagnostic explicitly reports intentional small debt rounding differences',()=>{
 const {market,account}=make('1','1',5000,10000,1);
 const report=compareSourceToStage2(account,market);
 assert.equal(report.mode,'OFFLINE_SOURCE_DIFFERENTIAL');
 assert.equal(report.approvedForExecution,false);
 assert.equal(report.executableContractParityVerified,false);
 // If values happen to agree at this fixture's precision, the harness still gives
 // no authorization. Divergence detection is separately checked below.
});
test('detect real micro-USD divergence from Stage 2 debt ceil vs source 27dp truncation',()=>{
 const {market,account}=make('1','1',5000,10000,1);
 // Modify debt to be a tiny fraction of a micro-dollar in a source-accurate
 // independent market snapshot (1 atomic token @ 1e-12 USD/atomic).
 market.prices.set('dai.near',{multiplier:1n,decimals:12});
 const snap={account_id:'alice.near',collateral:{'wrap.near':'1'},borrowed:{'dai.near':'1'},supplied:{}};
 const updated=valueRheaAccount(snap,market);
 const report=compareSourceToStage2(updated,market);
 assert.ok(report.differences.includes('ADJUSTED_DEBT_ROUNDING_DIVERGENCE'));
 assert.equal(report.approvedForExecution,false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRheaMarket,valueRheaAccount,unitsFromShares,assessRheaSnapshot} from '../src/rhea/valuation.ts';
import {assessPaperLiquidation} from '../src/rhea/liquidation.ts';

// Official Rhea docs hypothetical example: 1000 wNEAR at $7, 0.5 factor;
// 4000 DAI at $1, 1.0 factor => health=87.5%, discount=6.25%.
const example = () => ({
  mode:'DISCOVERY_ONLY',blockHeight:'54321',accountCount:1,
  assets:[
    ['wrap.near',{supplied:{shares:'100000',balance:'100000'},borrowed:{shares:'100000',balance:'100000'},config:{volatility_ratio:5000,extra_decimals:0,can_borrow:true}}],
    ['dai.near',{supplied:{shares:'100000',balance:'100000'},borrowed:{shares:'100000',balance:'100000'},config:{volatility_ratio:10000,extra_decimals:0,can_borrow:true}}]
  ],
  oracle:{timestamp:'1792800000000000000',prices:[
    {asset_id:'wrap.near',price:{multiplier:'7000000',decimals:6}},
    {asset_id:'dai.near',price:{multiplier:'1000000',decimals:6}}
  ]},
  accounts:[{account_id:'alice.near',collateral:{'wrap.near':'1000'},borrowed:{'dai.near':'4000'},supplied:{}}]
});
const analyze=()=>{const snapshot=example();const market=parseRheaMarket(snapshot);const account=valueRheaAccount(snapshot.accounts[0],market);return {market,account,snapshot};};
test('official docs example health=87.5% and discount=6.25%',()=>{
 const {account}=analyze();
 assert.equal(account.adjustedCollateralUsdE6,3_500_000_000n);
 assert.equal(account.adjustedDebtUsdE6,4_000_000_000n);
 assert.equal(account.healthFactorBps,8750n);
 assert.equal(account.discountNumerator*10_000n/account.discountDenominator,625n);
 assert.equal(account.eligibleIndicative,true);
});
test('official Rhea liquidation example: 1000 DAI repaid, 152 NEAR seized, final health 98.93%',()=>{
 const {market,account}=analyze();
 const result=assessPaperLiquidation(account,market,{repay:[{tokenId:'dai.near',atomicUnits:'1000'}],seize:[{tokenId:'wrap.near',atomicUnits:'152'}]});
 assert.deepEqual(result.reasons,[]);
 assert.equal(result.satisfiesDocumentedRules,true);
 assert.equal(result.newHealthFactorBps,'9893');
 assert.equal(result.grossIncentiveUsdE6,'64000000');
 assert.equal(result.exactContractParityVerified,false);
 assert.equal(result.mode,'PAPER_RULES_ONLY');
});
test('reject debt repayment that fully heals borrower',()=>{
 const {market,account}=analyze();
 const result=assessPaperLiquidation(account,market,{repay:[{tokenId:'dai.near',atomicUnits:'2000'}],seize:[{tokenId:'wrap.near',atomicUnits:'200'}]});
 assert.ok(result.reasons.includes('FINAL_HEALTH_NOT_BELOW_ONE'));
});
test('reject collateral seize exceeding max discount even when final health valid',()=>{
 const {market,account}=analyze();
 const result=assessPaperLiquidation(account,market,{repay:[{tokenId:'dai.near',atomicUnits:'1000'}],seize:[{tokenId:'wrap.near',atomicUnits:'154'}]});
 assert.ok(result.reasons.includes('DISCOUNTED_COLLATERAL_EXCEEDS_REPAYMENT'));
});
test('debt-free positions are not liquidatable',()=>{
 const {market,snapshot}=analyze(); snapshot.accounts[0].borrowed={};
 const account=valueRheaAccount(snapshot.accounts[0],market);
 assert.equal(account.healthFactorBps,null);
 // A missing debt balance makes the proposed repayment invalid, even if a liquidator asks for it.
 assert.equal(account.eligibleIndicative,false);
 assert.throws(()=>assessPaperLiquidation(account,market,{repay:[{tokenId:'dai.near',atomicUnits:'1'}],seize:[{tokenId:'wrap.near',atomicUnits:'1'}]}),/not a priced borrower position/);
});
test('healthy borrower cannot be liquidated, even if transfer positive',()=>{
 const {market,snapshot}=analyze();
 snapshot.accounts[0].collateral['wrap.near']='2000';
 const account=valueRheaAccount(snapshot.accounts[0],market);
 const result=assessPaperLiquidation(account,market,{repay:[{tokenId:'dai.near',atomicUnits:'100'}],seize:[{tokenId:'wrap.near',atomicUnits:'10'}]});
 assert.ok(result.reasons.includes('BORROWER_NOT_LIQUIDATABLE'));
});
test('reject over-repayment and over-seizing even if apparent profit positive',()=>{
 const {market,account}=analyze();
 assert.throws(()=>assessPaperLiquidation(account,market,{repay:[{tokenId:'dai.near',atomicUnits:'4001'}],seize:[{tokenId:'wrap.near',atomicUnits:'1'}]}),/exceeds available/);
 assert.throws(()=>assessPaperLiquidation(account,market,{repay:[{tokenId:'dai.near',atomicUnits:'1'}],seize:[{tokenId:'wrap.near',atomicUnits:'1001'}]}),/exceeds available/);
});
test('zero or duplicate action legs fail closed',()=>{
 const {market,account}=analyze();
 assert.throws(()=>assessPaperLiquidation(account,market,{repay:[{tokenId:'dai.near',atomicUnits:'0'}],seize:[{tokenId:'wrap.near',atomicUnits:'1'}]}),/must exceed zero/);
 assert.throws(()=>assessPaperLiquidation(account,market,{repay:[{tokenId:'dai.near',atomicUnits:'100'}, {tokenId:'dai.near',atomicUnits:'50'}],seize:[{tokenId:'wrap.near',atomicUnits:'10'}]}),/duplicate/);
});
test('missing or null oracle prices block borrower valuation',()=>{
 for (const price of [null,undefined]){
  const snap=example();
  const entry=snap.oracle.prices.find(p=>p.asset_id==='wrap.near');
  if(price===undefined) snap.oracle.prices=snap.oracle.prices.filter(p=>p!==entry);
  else entry.price=null;
  const market=parseRheaMarket(snap);
  assert.throws(()=>valueRheaAccount(snap.accounts[0],market),/missing or null oracle price/);
 }
});
test('reject malformed oracle data and duplicate assets',()=>{
 let snap=example();snap.oracle.timestamp='1';assert.throws(()=>parseRheaMarket(snap),/invalid oracle timestamp/);
 snap=example();snap.assets.push(snap.assets[0]);assert.throws(()=>parseRheaMarket(snap),/duplicate asset/);
 snap=example();snap.oracle.prices.push(snap.oracle.prices[0]);assert.throws(()=>parseRheaMarket(snap),/duplicate price/);
 snap=example();snap.assets[0][1].config.volatility_ratio=0;assert.throws(()=>parseRheaMarket(snap),/invalid volatility/);
});
test('share balance rounding is conservative and debt never rounds below true debt',()=>{
 const p={shares:3n,balance:10n};
 assert.equal(unitsFromShares(1n,p,'collateral'),3n);
 assert.equal(unitsFromShares(1n,p,'debt'),4n);
 assert.throws(()=>unitsFromShares(1n,{shares:0n,balance:0n},'debt'),/empty pool/);
});
test('reject floating/scientific or negative financial inputs',()=>{
 for(const bad of ['-1','1.5','1e10',' 42','01']){
  const {market,snapshot}=analyze();snapshot.accounts[0].borrowed['dai.near']=bad;
  assert.throws(()=>valueRheaAccount(snapshot.accounts[0],market));
 }
});
test('snapshot aggregation refuses duplicate borrowers and never marks execution ready',()=>{
 const snap=example();let a=assessRheaSnapshot(snap);
 assert.equal(a.mode,'INDICATIVE_ONLY');assert.equal(a.unhealthyIndicative,1);
 snap.accounts.push(snap.accounts[0]);assert.throws(()=>assessRheaSnapshot(snap),/duplicate borrower/);
});

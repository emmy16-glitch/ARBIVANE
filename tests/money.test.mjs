import test from 'node:test';
import assert from 'node:assert/strict';
import {parseUnits, expectedNetUsdE6, mulDivFloor, mulDivCeil} from '../src/domain/money.ts';
import {reconcileRealisedAtomic} from '../src/reconciliation/profit.ts';
const estimate={proceedsUsdE6:'520000000',repayUsdE6:'490000000',networkFeesUsdE6:'1800000',routeCostsUsdE6:'3400000',financingCostsUsdE6:'0',storageCostsUsdE6:'0',raceRiskReserveUsdE6:'4000000',inventoryRiskReserveUsdE6:'2000000'};
test('conservative illustrative net estimate with integers',()=>assert.equal(expectedNetUsdE6(estimate),18800000n));
test('losses remain negative and do not wrap',()=>assert.equal(expectedNetUsdE6({...estimate,proceedsUsdE6:'100'}),-501199900n));
test('reject JS float, notation, negative unsigned amount and whitespace',()=>{for(const x of ['1.5','1e5','-1',' 100','01',1.1,9007199254740993]) assert.throws(()=>parseUnits(x));});
test('integer arithmetic works beyond JS MAX_SAFE_INTEGER',()=>assert.equal(mulDivFloor('100000000000000000000000','7','3'),233333333333333333333333n));
test('round debt upward and proceeds downward',()=>{assert.equal(mulDivCeil('10','1','3'),4n);assert.equal(mulDivFloor('10','1','3'),3n);});
test('zero denominator is forbidden',()=>assert.throws(()=>mulDivFloor('1','1','0')));
test('cannot realise profit until execution is final AND collateral is sold',()=>{
 const e={executionFinal:false,collateralSold:false,chain:'near',txHash:'abc',settlementAsset:'usdc',openingBalanceAtomic:'100',closingBalanceAtomic:'200',ownerDepositsAtomic:'0',ownerWithdrawalsAtomic:'0',outstandingBorrowedLiabilityAtomic:'0',executionFeesAtomic:'0'};
 assert.throws(()=>reconcileRealisedAtomic(e)); assert.throws(()=>reconcileRealisedAtomic({...e,executionFinal:true}));
 assert.equal(reconcileRealisedAtomic({...e,executionFinal:true,collateralSold:true}),100n);
});
test('net accounting excludes outside deposits and outstanding debt',()=>{
 const e={executionFinal:true,collateralSold:true,chain:'near',txHash:'abc',settlementAsset:'usdc',openingBalanceAtomic:'100',closingBalanceAtomic:'250',ownerDepositsAtomic:'80',ownerWithdrawalsAtomic:'10',outstandingBorrowedLiabilityAtomic:'40',executionFeesAtomic:'5'};
 assert.equal(reconcileRealisedAtomic(e),35n);
});

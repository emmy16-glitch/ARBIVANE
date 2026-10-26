import test from 'node:test';
import assert from 'node:assert/strict';
import {stage127ObservedBorrowFunding} from '../scripts/stage124-rhea-supply-prefund.mjs';
const hash='6Sq4VHBUvh96zkKP5AnY8J5vSzp5U6fs7tHw5uweYqc9';
test('Stage127 preserves actual signed Sandbox borrower debt versus borrowed FT shortfalls',()=>{
 const x=stage127ObservedBorrowFunding({
  requiredInternal:'1858490263846083',actualDebt:'1858490263846082',
  actualFt:'1858490263846081',hash});
 assert.equal(x.borrowTransactionId,hash);
 assert.equal(x.debtShortfallInternal,'1');
 assert.equal(x.ftShortfallAtomic,'2');
 assert.equal(x.debtAtLeastRequired,false);
 assert.equal(x.ftAtLeastRequired,false);
 assert.equal(x.verifiedFundingForNextOperation,false);
 assert.equal(x.mainnetExecutionEnabled,false);
 const ok=stage127ObservedBorrowFunding({
  requiredInternal:'100',actualDebt:'100',actualFt:'101',hash});
 assert.equal(ok.verifiedFundingForNextOperation,true);
});
test('Stage127 does not treat unverified source amounts or forged transaction identity as proof',()=>{
 for(const bad of [
  {requiredInternal:'-5',actualDebt:'5',actualFt:'5',hash},
  {requiredInternal:'5',actualDebt:'5.5',actualFt:'5',hash},
  {requiredInternal:'5',actualDebt:'5',actualFt:'5',hash:'not-hash'},
 ]){
  assert.throws(()=>stage127ObservedBorrowFunding(bad),/STAGE127_|STAGE124_/);
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {stage127ObservedBorrowFunding} from '../scripts/stage124-rhea-supply-prefund.mjs';
const hash='6Sq4VHBUvh96zkKP5AnY8J5vSzp5U6fs7tHw5uweYqc9';
test('Stage127 preserves actual signed Sandbox borrower debt versus borrowed FT shortfalls',()=>{
 const x=stage127ObservedBorrowFunding({
  requiredInternal:'1858490263846083',actualDebt:'1858490263846082',
  actualFt:'1858490263846081',actualSupplied:'1858490263846083',hash});
 assert.equal(x.borrowTransactionId,hash);
 assert.equal(x.debtShortfallInternal,'1');
 assert.equal(x.ftShortfallAtomic,'2');
 assert.equal(x.actualActorSuppliedInternal,'1858490263846083');
 assert.equal(x.suppliedAtLeastRequired,true);
 assert.equal(x.observedHoldingType,'INTERNAL_RHEA_SUPPLY_ONLY_OR_PARTIAL');
 assert.equal(x.verifiedFundingForNextOperation,false);
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

test('Stage128 cannot mistake internal Rhea supplied balance for spendable external FT',()=>{
 const h='6Sq4VHBUvh96zkKP5AnY8J5vSzp5U6fs7tHw5uweYqc9';
 const internal=stage127ObservedBorrowFunding({
  requiredInternal:'100',actualDebt:'100',actualSupplied:'100',actualFt:'0',hash:h,
 });
 assert.equal(internal.suppliedAtLeastRequired,true);
 assert.equal(internal.ftAtLeastRequired,false);
 assert.equal(internal.verifiedFundingForNextOperation,false);
 assert.equal(internal.observedHoldingType,'INTERNAL_RHEA_SUPPLY_ONLY_OR_PARTIAL');
 const noRead=stage127ObservedBorrowFunding({
  requiredInternal:'100',actualDebt:'100',actualFt:'0',hash:h,
 });
 assert.equal(noRead.actualActorSuppliedInternal,null);
 assert.equal(noRead.suppliedAtLeastRequired,null);
 assert.equal(noRead.verifiedFundingForNextOperation,false);
 assert.throws(()=>stage127ObservedBorrowFunding({
  requiredInternal:'100',actualDebt:'100',actualSupplied:'-1',actualFt:'0',hash:h,
 }),/STAGE124_INVALID_ACTOR_SUPPLIED_INTERNAL/);
});

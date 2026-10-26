import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
 stage148InspectOutstandingPartnerDebt,stage148BoundDebtTopup
} from '../scripts/stage146-real-workspaces-partner-lender.mjs';

test('Stage148 derives exact leftover Rhea debt from original account-level position shares and balances',()=>{
 const p={positions:{REGULAR:{
  borrowed:[{token_id:'linear-protocol.near',shares:'286',balance:'288'}],
  collateral:[{token_id:'wrap.near',shares:'300',balance:'300'}]
 }},supplied:[]};
 assert.deepEqual(stage148InspectOutstandingPartnerDebt(p,'linear-protocol.near'),{
  sharesAtomic:'286',balanceAtomic:'288'
 });
 assert.equal(stage148BoundDebtTopup({
  debtSharesAtomic:'286',debtBalanceAtomic:'288',
  actorBalanceAtomic:'2531190098871',alreadySentAtomic:'0'
 }),'320');
 const closed={...p,positions:{REGULAR:{borrowed:[],collateral:[]}}};
 assert.deepEqual(stage148InspectOutstandingPartnerDebt(closed,'linear-protocol.near'),{
  sharesAtomic:'0',balanceAtomic:'0'
 });
});
test('Stage148 refuses unbounded loan topups, missing actor inventory, forged debt, and overbudget interest',()=>{
 const base={debtSharesAtomic:'286',debtBalanceAtomic:'288',
  actorBalanceAtomic:'2531190098871',alreadySentAtomic:'0'};
 for(const mutate of [
  v=>v.debtSharesAtomic='0',
  v=>v.debtBalanceAtomic='0',
  v=>v.debtSharesAtomic='100001',
  v=>v.debtBalanceAtomic='100001',
  v=>v.actorBalanceAtomic='320',
  v=>v.alreadySentAtomic='99999',
  v=>v.debtBalanceAtomic='01',
  v=>v.debtSharesAtomic='-2'
 ]){
  const x={...base};mutate(x);
  assert.throws(()=>stage148BoundDebtTopup(x),/STAGE14[68]_/);
 }
 assert.throws(()=>stage148InspectOutstandingPartnerDebt({
  positions:{REGULAR:{borrowed:[{token_id:'linear-protocol.near',
   shares:'286',balance:'0'}]}}
 },'linear-protocol.near'),/STAGE148_MISMATCHED_DEBT/);
});
test('Stage148 uses new genuine local NEP141 original FINAL callback for all debt-dust repayment steps',async()=>{
 const s=await readFile('scripts/stage146-real-workspaces-partner-lender.mjs','utf8');
 assert.match(s,/receiptProofs\.stage148DebtDustTransfers\.push\(actualTransfer\)/);
 assert.match(s,/receiptProofs\.stage148DebtDust\.push\(actualRepay\)/);
 assert.match(s,/if\(observed\.sharesAtomic!=='0'\)/);
 assert.match(s,/observedPartnerRemainingRheaDebtShares='0'/);
 assert.match(s,/partnerAccruedDebtDustClosed=true/);
 assert.match(s,/MAX_STAGE148_DUST_ATOMIC=100000n/);
 assert.match(s,/actualRepay=await call\(partner,token,'ft_transfer_call'/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {stage142CreateFinancingIntent,stage142VerifyIntentIntegrity} from '../scripts/stage142-financing-intent.mjs';
const quote=()=>({
 mode:'EXTERNAL_FLASH_LOAN',sourceAccountId:'hypothetical-lender.near',
 repayAssetId:'linear-protocol.near',principalAtomic:'1000000',premiumAtomic:'1000',
 maxGasAndStorageInRepayAssetAtomic:'1000',maxSwapAndSlippageAtomic:'1000',
 minimumNetAtomic:'1000',observedMinProceedsAtomic:'1010000',
 ownerCollateralAtomic:'0',partnerEscrowAtomic:'0',
 operatorAccountId:'sillywiki4201.near',borrowerAccountId:'borrower.near',
 evaluatedAtMs:10000,quoteExpiresAtMs:12000
});
test('Stage142 flash financing is an immutable offline research intent, not provider certification',()=>{
 const a=stage142CreateFinancingIntent(quote());
 const b=stage142CreateFinancingIntent(quote());
 assert.equal(a.intentHash,b.intentHash);
 assert.equal(a.indicativeNetAtomic,'7000');
 assert.equal(a.fundingSourceVerified,false);
 assert.equal(a.realExternalLoanRepaymentVerified,false);
 assert.equal(a.allowLoanExecution,false);
 assert.equal(a.allowProfitPayout,false);
 assert.equal(a.maySignMainnet,false);
 assert.equal(stage142VerifyIntentIntegrity(a),true);
 assert.equal(stage142VerifyIntentIntegrity({...a,principalAtomic:'2'}),false);
 assert.equal(stage142VerifyIntentIntegrity({...a,maySignMainnet:true}),false);
});
test('Stage142 accepts separate externally pledged escrow with liabilities covered, not a proven deposit',()=>{
 const spec={...quote(),mode:'AUTHORIZED_PARTNER_ESCROW',partnerEscrowAtomic:'1001000'};
 const a=stage142CreateFinancingIntent(spec);
 assert.equal(a.configuredPartnerEscrowAtomic,'1001000');
 assert.equal(a.indicativeNetAtomic,'7000');
 assert.equal(a.fundingSourceVerified,false);
 assert.ok(a.blockers.includes('NO_REAL_PARTNER_ESCROW_DEPOSIT_OR_SIGNED_FUNDING_AGREEMENT'));
});
test('Stage142 rejects owner capital, cross-chain asset substitution, provider same owner, silent partner insolvency',()=>{
 for(const change of [
  x=>x.ownerCollateralAtomic='1',x=>x.repayAssetId='wrap.near',
  x=>x.sourceAccountId='okunlola_labs.near',
  x=>x.sourceAccountId=x.operatorAccountId,
  x=>{x.mode='AUTHORIZED_PARTNER_ESCROW';x.partnerEscrowAtomic='1000000';},
  x=>{x.mode='EXTERNAL_FLASH_LOAN';x.partnerEscrowAtomic='1';},
  x=>x.operatorAccountId='my-wallet.near',
  x=>x.quoteExpiresAtMs=x.evaluatedAtMs,
  x=>x.principalAtomic='01',x=>x.principalAtomic='0',
  x=>x.unexpectedAuthorization=true
 ]){
  const x=quote();change(x);
  assert.throws(()=>stage142CreateFinancingIntent(x),/STAGE142_/);
 }
});
test('Stage142 never allows paper positive net to authorize signing or a payout',()=>{
 const spec=quote();spec.observedMinProceedsAtomic='0';
 const a=stage142CreateFinancingIntent(spec);
 assert.ok(BigInt(a.indicativeNetAtomic)<0n);
 assert.ok(a.blockers.includes('INDICATIVE_NET_BELOW_MINIMUM'));
 assert.equal(a.allowProfitPayout,false);
});

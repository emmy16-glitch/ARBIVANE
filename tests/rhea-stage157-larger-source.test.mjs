import test from 'node:test';
import assert from 'node:assert/strict';
import {stage157SelectHistoricalLiNearBorrowers,stage157AdmitSourceLargerLiquidation,
 PREVIOUS_REPAY_INTERNAL_ATOMIC} from '../scripts/stage157-large-source-candidates.mjs';

const source=()=>{
 const findings=Array.from({length:7801},(_,i)=>({
  accountId:'borrower-'+i+'.near',
  positions:[{debtAssetIds:['wrap.near']}]
 }));
 for(const i of [13,22,2579,2594,3116,3147])
  findings[i].positions[0].debtAssetIds.push('linear-protocol.near');
 findings[3116].positions[0].debtAssetIds.push('aurora');
 return {mode:'RHEA_COMPLETE_PAGED_INDEX_ATTESTATION',
  status:'COMPLETE_DEBT_INDEX_READ_ONLY',chain:'NEAR_MAINNET',
  debtAccounts:7801,zeroSchemaErrors:true,completeSnapshot:true,
  blockHeight:'221436207',findings};
};
const candidate=amount=>({
 mode:'RHEA_STAGE35_PINNED_SOURCE_ONLY_LIQUIDATION_SIZING',
 chain:'NEAR_MAINNET',borrowerAccountId:'genuine.near',
 status:'PAPER_SCENARIOS_FOUND_NOT_EXECUTABLE',
 referenceRulesPass:true,executionEnabled:false,maySign:false,mayBroadcast:false,
 gasAndSwapNetProfitVerified:false,paperGrossUsdE27:'123',
 repay:{tokenId:'linear-protocol.near',amountLendingInternalAtomic:amount.toString()},
 seize:{tokenId:'linear-protocol.near',amountLendingInternalAtomic:'20000000000000000'},
});
test('Stage157 ranks only historical recorded LiNEAR debt, never infers current eligibility',()=>{
 const v=stage157SelectHistoricalLiNearBorrowers(source(),{batch:0,shard:0});
 assert.equal(v.totalHistoricalLiNearCandidates,5);
 assert.equal(v.candidates[0].index,3116);
 assert.ok(!v.candidates.some(x=>x.index===2579));
 assert.equal(v.selectionIsHistoricalNotCurrentRisk,true);
 assert.equal(stage157SelectHistoricalLiNearBorrowers(source(),{batch:2,shard:3}).candidates.length,0);
});
test('Stage160 admits source-backed positive amounts below historical 10x size',()=>{
 const tiny=stage157AdmitSourceLargerLiquidation(candidate(1n),'genuine.near');
 assert.equal(tiny.qualified,true);
 assert.equal(tiny.reason,'CURRENT_SOURCE_POSITIVE_LIQUIDATION_SANDBOX_ONLY');
 assert.equal(tiny.realWorldNetProfitVerified,false);
 assert.equal(tiny.permissionToTradeMainnet,false);
 assert.equal(tiny.historicalReferenceRepayLendingInternalAtomic,
  PREVIOUS_REPAY_INTERNAL_ATOMIC.toString());
 assert.equal(stage157AdmitSourceLargerLiquidation(candidate(0n),'genuine.near').qualified,false);
 const negativeRemainder=candidate(3n);
 negativeRemainder.seize.amountLendingInternalAtomic='2';
 assert.equal(stage157AdmitSourceLargerLiquidation(negativeRemainder,'genuine.near').qualified,false);
});
test('Stage157 blocks forged source identity, wrong assets, and mainnet execution',()=>{
 const x=candidate(PREVIOUS_REPAY_INTERNAL_ATOMIC*2n);
 assert.equal(stage157AdmitSourceLargerLiquidation(x,'other.near').qualified,false);
 assert.equal(stage157AdmitSourceLargerLiquidation({...x,maySign:true},'genuine.near').qualified,false);
 assert.equal(stage157AdmitSourceLargerLiquidation({...x,
  repay:{...x.repay,tokenId:'wrap.near'}},'genuine.near').qualified,false);
 assert.equal(stage157AdmitSourceLargerLiquidation({...x,
  referenceRulesPass:false},'genuine.near').qualified,false);
 assert.equal(stage157AdmitSourceLargerLiquidation({...x,
  paperGrossUsdE27:'0'},'genuine.near').qualified,false);
});
test('Stage157 rejects altered historical provenance and unbounded cursors',()=>{
 const s=source();s.completeSnapshot=false;
 assert.throws(()=>stage157SelectHistoricalLiNearBorrowers(s),/STAGE157_UNTRUSTED/);
 assert.throws(()=>stage157SelectHistoricalLiNearBorrowers(source(),{batch:12}),/STAGE157_UNTRUSTED/);
});

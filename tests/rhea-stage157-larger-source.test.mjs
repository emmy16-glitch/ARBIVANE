import test from 'node:test';
import assert from 'node:assert/strict';
import {stage157SelectHistoricalLiNearBorrowers,stage157AdmitSourceLargerLiquidation,
 MINIMUM_LARGE_REPAY_INTERNAL_ATOMIC,PREVIOUS_REPAY_INTERNAL_ATOMIC}
 from '../scripts/stage157-large-source-candidates.mjs';

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
test('Stage157 requires >10x source-confirmed Rhea internal repay quantity',()=>{
 assert.equal(MINIMUM_LARGE_REPAY_INTERNAL_ATOMIC,PREVIOUS_REPAY_INTERNAL_ATOMIC*10n);
 assert.equal(stage157AdmitSourceLargerLiquidation(
  candidate(MINIMUM_LARGE_REPAY_INTERNAL_ATOMIC-1n),'genuine.near').qualified,false);
 const good=stage157AdmitSourceLargerLiquidation(
  candidate(MINIMUM_LARGE_REPAY_INTERNAL_ATOMIC),'genuine.near');
 assert.equal(good.qualified,true);
 assert.equal(good.realWorldNetProfitVerified,false);
 assert.equal(good.permissionToTradeMainnet,false);
});
test('Stage157 blocks forged source identity, wrong assets, and mainnet execution',()=>{
 const x=candidate(MINIMUM_LARGE_REPAY_INTERNAL_ATOMIC*100n);
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

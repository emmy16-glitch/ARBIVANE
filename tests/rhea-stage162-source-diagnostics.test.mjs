import test from 'node:test';
import assert from 'node:assert/strict';
import {stage162DescribeSource,stage162RejectionSummary}
 from '../scripts/stage162-source-rejection-diagnostics.mjs';
const base=(status,blockers=[])=>({
 status,blockers,consideredPairs:2,repay:null,seize:null,
});
test('Stage162 separates healthy current borrowers from untrusted or unsupported routes',()=>{
 const healthy=stage162DescribeSource(base('NO_CURRENT_REFERENCE_RISK'),{
  qualified:false,reason:'SOURCE_RULE_OR_DENOMINATION_NOT_VERIFIED'});
 assert.equal(healthy.reason,'CURRENT_BORROWER_NOT_AT_RISK');
 assert.equal(healthy.sourceSizingStatus,'NO_CURRENT_REFERENCE_RISK');
 assert.equal(healthy.consideredPairs,2);
 const noPair=stage162DescribeSource(
  base('NO_SAFE_SOURCE_SCENARIO',['NO_MATCHING_SUPPORTED_SAME_TOKEN_ROUTE']),
  {qualified:false,reason:'SOURCE_RULE_OR_DENOMINATION_NOT_VERIFIED'});
 assert.equal(noPair.reason,'NO_MATCHING_SUPPORTED_SAME_TOKEN_ROUTE');
 assert.deepEqual(noPair.sourceSizingBlockers,['NO_MATCHING_SUPPORTED_SAME_TOKEN_ROUTE']);
 const unsupported=stage162DescribeSource({
  ...base('PAPER_SCENARIOS_FOUND_NOT_EXECUTABLE'),
  repay:{tokenId:'wrap.near'},seize:{tokenId:'linear-protocol.near'}},
  {qualified:false,reason:'SOURCE_RULE_OR_DENOMINATION_NOT_VERIFIED'});
 assert.equal(unsupported.reason,'POSITIVE_SOURCE_UNSUPPORTED_SANDBOX_ASSET_ROUTE');
 assert.equal(unsupported.referenceRepayTokenId,'wrap.near');
 assert.equal(unsupported.referenceSeizeTokenId,'linear-protocol.near');
});
test('Stage162 preserves exact source rule blocker without exposing arbitrary error text',()=>{
 const d=stage162DescribeSource(base('NO_SAFE_SOURCE_SCENARIO',[
  'FOUR_SOURCE_RULES_REJECTED_ALL_BOUNDED_REPAY_SIZES',
  'https://private-provider/SECRET',
  'NO_SOURCE_POOL_BORROW_HEADROOM'
 ]),{qualified:false,reason:'SOURCE_RULE_OR_DENOMINATION_NOT_VERIFIED'});
 assert.equal(d.reason,'FOUR_SOURCE_RULES_REJECTED_ALL_BOUNDED_REPAY_SIZES');
 assert.deepEqual(d.sourceSizingBlockers,[
  'FOUR_SOURCE_RULES_REJECTED_ALL_BOUNDED_REPAY_SIZES',
  'NO_SOURCE_POOL_BORROW_HEADROOM']);
 assert.equal(JSON.stringify(d).includes('SECRET'),false);
});
test('Stage162 aggregates mutually visible healthy, source-blocked and read-blocked results',()=>{
 const counts=stage162RejectionSummary([
  {reasons:['CURRENT_BORROWER_NOT_AT_RISK'],sourceSizingStatus:'NO_CURRENT_REFERENCE_RISK',consideredPairs:0},
  {reasons:['NO_MATCHING_SUPPORTED_SAME_TOKEN_ROUTE'],sourceSizingStatus:'NO_SAFE_SOURCE_SCENARIO',consideredPairs:3},
  {reasons:['HTTP_RATE_LIMIT_OR_TIMEOUT'],sourceSizingStatus:null,consideredPairs:null},
 ]);
 assert.equal(counts.sourceRejectionCounts.CURRENT_BORROWER_NOT_AT_RISK,1);
 assert.equal(counts.sourceRejectionCounts.NO_MATCHING_SUPPORTED_SAME_TOKEN_ROUTE,1);
 assert.equal(counts.sourceRejectionCounts.HTTP_RATE_LIMIT_OR_TIMEOUT,1);
 assert.equal(counts.sourceSizingStatusCounts.FRESH_READ_BLOCKED,1);
 assert.equal(counts.sourcePairCount,3);
});

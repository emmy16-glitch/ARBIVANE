import test from 'node:test';
import assert from 'node:assert/strict';
import {stage98ClassifyViewFailure,attestStage96PinnedRheaViews} from '../scripts/stage96-rhea-view-parity.mjs';

test('Stage98 produces only bounded categories for common sandbox failures',()=>{
 assert.equal(stage98ClassifyViewFailure(new Error('Borsh deserialize failed')), 'STATE_DESERIALIZATION_FAILURE');
 assert.equal(stage98ClassifyViewFailure(new Error('index out of bounds')), 'COLLECTION_INDEX_FAILURE');
 assert.equal(stage98ClassifyViewFailure(new Error('Wasm trap: unreachable')), 'WASM_EXECUTION_FAILURE');
 assert.equal(stage98ClassifyViewFailure(new Error('RPC 429')), 'VIEW_TRANSPORT_FAILURE');
 assert.equal(stage98ClassifyViewFailure(new Error('Authorization: Bearer SECRET')), 'REDACTED_RUNTIME_FAILURE');
 assert.equal(stage98ClassifyViewFailure(new Error('unexpected runtime')), 'UNCLASSIFIED_LOCAL_VIEW_FAILURE');
});
test('Stage98 preserves fail-closed semantics and sanitizes persisted borrower failure',async()=>{
 const saved=[];
 const lending={accountId:'contract.main.burrow.near',view:async method=>{
  if(method==='get_config')return {ok:true};
  throw Error('Borsh deserialize failed for borrower with sensitive fixture');
 }};
 await assert.rejects(attestStage96PinnedRheaViews({
  lending,borrowerAccountId:'borrower.near',config:{ok:true},borrower:[],assets:[],
  persist:async witness=>saved.push(witness),
 }),/STAGE96_BORROWER_VIEW_CALL_FAILED/);
 const final=saved.at(-1);
 assert.equal(final.failedView,'BORROWER');
 assert.equal(final.allSourceViewsVerified,false);
 assert.equal(final.liquidationAttempted,false);
 assert.equal(final.checks.at(-1).stage98FailureClass,'STATE_DESERIALIZATION_FAILURE');
 assert.equal(JSON.stringify(final).includes('sensitive fixture'),false);
});

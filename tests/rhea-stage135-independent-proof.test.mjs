import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {verifyStage135Bundle} from '../scripts/stage135-independent-proof.mjs';

test('Stage135 never accepts empty or summary-only reports as signed settlement',()=>{
 assert.throws(()=>verifyStage135Bundle({},{}),/STAGE135_INCOMPLETE_BUNDLE/);
 assert.throws(()=>verifyStage135Bundle({status:'success'},{status:'success'}),/STAGE135_INCOMPLETE_BUNDLE/);
});
test('Stage135 requires real Ed25519 validation, original final receipts and raw state, not CI success flags',async()=>{
 const source=await readFile(new URL('../scripts/stage135-independent-proof.mjs',import.meta.url),'utf8');
 assert.match(source,/signedSandboxEvidence\(raw,/);
 assert.match(source,/final\.final_execution_status!==['"]FINAL['"]/);
 assert.match(source,/callback_execute_with_pyth/);
 assert.match(source,/Object\.hasOwn\(st,['"]Failure['"]\)/);
 assert.match(source,/sourceRepay/);
 assert.match(source,/sourceSeize/);
 assert.match(source,/debt\(after\.actor\)!==0n/);
 assert.match(source,/actorFtIncreaseAtomic/);
 assert.match(source,/outcomeMerkleProofIndependentlyVerified:false/);
 assert.match(source,/fullImportedTrieParityVerified:false/);
 assert.match(source,/mainnetExecutionEnabled:false/);
});
test('Stage93 and historic proof CI both run the same fail-closed independent verifier',async()=>{
 const stage93=await readFile(new URL('../.github/workflows/rhea-stage93-borrower-settlement.yml',import.meta.url),'utf8');
 const stage135=await readFile(new URL('../.github/workflows/stage135-independent-proof-audit.yml',import.meta.url),'utf8');
 assert.match(stage93,/stage135-independent-proof\.mjs/);
 assert.match(stage93,/node scripts\/stage135-independent-proof\.mjs "\$verified" verified/);
 assert.match(stage135,/40317139342/);
 assert.match(stage135,/FORGED_SETTLEMENT_INCORRECTLY_PASSED/);
 assert.match(stage135,/FORGED_FINALITY_INCORRECTLY_PASSED/);
 assert.match(stage135,/actions\/download-artifact@v4/);
});

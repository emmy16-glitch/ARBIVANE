import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const workflow=async()=>readFile(
 new URL('../.github/workflows/rhea-stage40-paced-borrower-continuation.yml',import.meta.url),'utf8');

test('Stage60 Stage40 refreshes every authentic at-risk finding, never silently caps at 16',async()=>{
 const w=await workflow();
 assert.ok(w.includes('.refreshed == .paperAtRiskFromPreviousScan'));
 assert.ok(w.includes('.refreshed <= 80'));
 assert.ok(w.includes('.status != "BLOCKED_CANDIDATE_LIMIT"'));
 assert.ok(!w.includes('.refreshed <= 16'));
 assert.ok(w.includes("RHEA_STAGE32_MAX_FINDINGS: '80'"));
 assert.ok(w.includes("RHEA_STAGE32_CONCURRENCY: '2'"));
 assert.ok(w.includes("RHEA_STAGE38_MAX_FINDINGS: '80'"));
});
test('Stage60 retains actual Sandbox Workspaces call failures as audited evidence, not fake callback success',async()=>{
 const w=await workflow();
 assert.ok(w.includes('if EXECUTION_ENABLED=false NEAR_WORKSPACES_NETWORK=sandbox'));
 assert.ok(w.includes('STAGE49_ALLOW_SANDBOX_WRAP_NEAR_FUNDING=true'));
 assert.ok(w.includes('stage37-workspaces-sandbox-replay.mjs > stage38-sandbox-actual.json; then'));
 assert.ok(w.includes('sandbox_exit=$?'));
 assert.ok(w.includes('node scripts/stage56-sandbox-attempt-cli.mjs "$sandbox_exit"'));
 assert.ok(w.includes('stage55-sandbox-phase-evidence.json'));
 assert.ok(w.includes('stage37-sandbox-execution.json'));
 assert.ok(w.includes('stage56-sandbox-attempt-evidence.json'));
 assert.ok(w.includes('stage60-sandbox-attempt-stdout.json'));
 assert.ok(w.includes('stage41-sandbox-balance-settlement.json'));
 assert.ok(w.includes('.readOnlyMarketContinuationAllowed == true'));
 assert.ok(w.includes('.mayBroadcastMainnet == false and .maySignMainnet == false'));
 assert.ok(w.includes('stage56-sandbox-attempt-evidence.json >> "$GITHUB_STEP_SUMMARY"'));
 assert.ok(!w.includes('broadcast_tx'));
 assert.ok(!w.includes('NEAR_PRIVATE_KEY:'));
});
test('Stage60 preserves all real receipts and sandbox phase evidence as GitHub artifacts',async()=>{
 const w=await workflow();
 for(const name of [
  'stage38-sandbox-actual.json','stage37-sandbox-execution.json',
  'stage41-sandbox-balance-settlement.json','stage46-sandbox-clone-evidence.json',
  'stage55-sandbox-phase-evidence.json','stage56-sandbox-attempt-evidence.json',
  'stage60-sandbox-attempt-stdout.json'
 ])assert.ok(w.includes('            '+name+'\n'),name+' must be uploaded');
});

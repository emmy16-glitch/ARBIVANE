import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const workflow=new URL('../.github/workflows/rhea-stage87-one-borrower-execution.yml',import.meta.url);
const legacy=new URL('../.github/workflows/rhea-stage69-fastlane.yml',import.meta.url);

test('Stage87 independently runs only one authenticated source-qualified borrower, not another eight-job queue',async()=>{
 const s=await readFile(workflow,'utf8');
 const earlier=await readFile(legacy,'utf8');
 assert.ok(s.includes('name: Rhea Stage87 focused authentic single-borrower Sandbox execution'));
 assert.ok(s.includes('group: arbivane-stage87-single-borrower'));
 assert.ok(earlier.includes('group: arbivane-stage69-fastlane'));
 assert.ok(s.includes("workflow_dispatch:"));
 assert.ok(!s.includes("\n  push:"));
 assert.ok(s.includes('| unique_by(.start) | .[:1] | {include:.}'));
 assert.ok(s.includes('max-parallel: 1'));
 assert.ok(s.includes('timeout-minutes: 105'));
 assert.ok(s.includes('run-id: \'40187579892\''));
 assert.ok(s.includes('run-id: \'40128285853\''));
 assert.ok(s.includes('RHEA_STAGE32_MAX_FINDINGS: \'1\''));
 assert.ok(s.includes('RHEA_STAGE38_MAX_FINDINGS: \'1\''));
 assert.ok(!s.includes(' | .[:8] | '));
});

test('Stage87 requests actual keyless NEAR Workspaces receipts and fails closed on missing settlement',async()=>{
 const s=await readFile(workflow,'utf8');
 assert.ok(s.includes('STAGE82_SINGLE_BORROWER: \'true\''));
 assert.ok(s.includes("EXECUTION_ENABLED: 'false'"));
 assert.ok(s.includes('NEAR_WORKSPACES_NETWORK=sandbox'));
 assert.ok(s.includes('STAGE37_ALLOW_SANDBOX_MUTATION=true'));
 assert.ok(s.includes('STAGE49_ALLOW_SANDBOX_WRAP_NEAR_FUNDING=true'));
 assert.ok(s.includes('scripts/stage37-workspaces-sandbox-replay.mjs'));
 assert.ok(s.includes('stage37-sandbox-execution.json'));
 assert.ok(s.includes('stage41-sandbox-balance-settlement.json'));
 assert.ok(s.includes('stage55-sandbox-phase-evidence.json'));
 assert.ok(s.includes('Stage87'));
 assert.ok(s.includes('stage87-authentic-borrower-${{ matrix.start }}'));
 assert.ok(s.includes('pattern: stage87-authentic-borrower-*'));
 assert.ok(s.includes('actualRheaSettlementVerified == true'));
 assert.ok(s.includes('stage56-sandbox-attempt-evidence.json'));
 assert.ok(s.includes('maySignMainnet == false'));
 assert.ok(s.includes('mayBroadcastMainnet == false'));
 assert.ok(!s.includes('broadcast_tx'));
 assert.ok(!s.includes('MAINNET_PRIVATE_KEY:'));
});

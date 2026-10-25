import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const workflow=new URL('../.github/workflows/rhea-stage63-bounded-recovery.yml',import.meta.url);

test('bounded recovery prioritizes the authentic tail then disjoint unscanned cursors',async()=>{
 const text=await readFile(workflow,'utf8');
 assert.match(text,/attempts >= 18/);
 assert.match(text,/start\":7692,\"count\":80/);
 assert.match(text,/start\":7772,\"count\":29/);
 assert.match(text,/base=\$\(\(2252\+\(attempts-1\)\*320\)\)/);
 assert.match(text,/max-parallel: 2/);
 assert.match(text,/cron: '17 \*\/6 \* \* \*'/);
 assert.match(text,/cancel-in-progress: \$\{\{ github\.event_name == 'push' \}\}/);
 assert.ok(text.includes("- '.github/workflows/rhea-stage63-bounded-recovery.yml'"));
 assert.match(text,/\.conclusion == "failure" or \.conclusion == "success"/);
 assert.doesNotMatch(text,/cancel-in-progress: false/);
 assert.ok(text.includes('branches: [main]'));
 assert.ok(text.includes("- 'src/rhea/full-active-pyth-sweep.ts'"));
 assert.ok(text.includes('.event == "push"'));

});

test('bounded recovery invokes real execute_with_pyth path but never enables mainnet signing',async()=>{
 const text=await readFile(workflow,'utf8');
 assert.match(text,/scripts\/stage37-workspaces-sandbox-replay\.mjs/);
 assert.match(text,/NEAR_WORKSPACES_NETWORK=sandbox/);
 assert.match(text,/EXECUTION_ENABLED=false/);
 assert.match(text,/maySignMainnet == false/);
 assert.match(text,/mayBroadcastMainnet == false/);
 assert.doesNotMatch(text,/MAINNET_PRIVATE_KEY|NEAR_PRIVATE_KEY|broadcast_tx/);
});

test('terminal success requires callback receipts and independently reconciled balances',async()=>{
 const text=await readFile(workflow,'utf8');
 for(const required of [
  'LOCAL_RHEA_BALANCE_AND_CALLBACK_VERIFIED_NOT_PROFIT',
  'ISOLATED_CALLBACK_SUCCESS_NOT_MAINNET_PROOF',
  'POSITION_AND_FT_DELTAS_OBSERVED_UNSOLD',
  'borrowerDebtDecreaseInternal','borrowerCollateralDecreaseInternal',
  'actorSeizeFtIncreaseAtomic','rhea-verified-sandbox-liquidation',
 ])assert.ok(text.includes(required),required);
 assert.match(text,/gh workflow run rhea-stage63-bounded-recovery\.yml/);
});

test('Stage65 rechecks authenticated prior risk windows without replacing disjoint discovery',async()=>{
 const text=await readFile(workflow,'utf8');
 for(const i of [2579,2594,3116,3147])assert.ok(text.includes(String(i)));
 assert.match(text,/shard:\(\.key\+4\)/);
 assert.match(text,/start:\.value,count:1/);
 assert.match(text,/\$a >= 4 and \$a <= 7/);
 assert.match(text,/base=\$\(\(2252\+\(attempts-1\)\*320\)\)/);
 // Rechecks are source-attested and must be paper-at-risk again at a
 // fresh finalized block before entering any optional isolated sandbox.
 assert.match(text,/rhea-full-paged-verified-market/);
 assert.match(text,/STAGE37_ALLOW_SANDBOX_MUTATION=true/);
 assert.match(text,/sandboxPlanReady == true/);
 assert.doesNotMatch(text,/MAINNET_PRIVATE_KEY|broadcast_tx/);
});

test('Stage69 preempts stale scan work on main push while keeping cancelled windows retryable',async()=>{
 const contents=await readFile(workflow,'utf8');
 assert.ok(contents.includes("cancel-in-progress: ${{ github.event_name == 'push' }}"));
 assert.ok(contents.includes("- '.github/workflows/rhea-stage63-bounded-recovery.yml'"));
 const line=contents.split('\n').find(x=>x.trim().startsWith('attempts=$(jq '));
 assert.ok(line?.includes('.conclusion == "failure"'));
 assert.ok(line?.includes('.conclusion == "success"'));
 assert.ok(!line.includes('.conclusion == "cancelled"'));
 assert.match(contents,/base=\$\(\(2252\+\(attempts-1\)\*320\)\)/);
 assert.ok(contents.includes("if (( successes > 0 || attempts >= 18 )); then"));
 assert.ok(contents.includes("EXECUTION_ENABLED: 'false'"));
 assert.ok(contents.includes('mayBroadcastMainnet == false'));
});

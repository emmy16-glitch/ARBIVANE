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
 assert.match(text,/cancel-in-progress: false/);
 assert.match(text,/push:[\\s\\S]*branches: \\[main\\][\\s\\S]*stage35-atomic-reference-sizing\\.ts/);
 assert.match(text,/\\.event == \\"push\\"/);
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

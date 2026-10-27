import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {DashboardStore} from '../dashboard/server/store.mjs';
import {validateSettings} from '../dashboard/server/automation.mjs';

test('dashboard data is durable and strictly separated by environment', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'arbivane-dashboard-'));
  t.after(() => rm(root, {recursive:true, force:true}));
  const first = new DashboardStore(root); await first.init();
  assert.equal((await first.state('sandbox')).settings.minimumNetProfitUsd,'0.00');
  await first.update('sandbox', (state) => { state.wallet.status = 'sandbox_only'; return state; });
  const event = await first.event('sandbox', {stage:'scan', status:'success', message:'real event'});
  const second = new DashboardStore(root); await second.init();
  assert.equal((await second.state('sandbox')).wallet.status, 'sandbox_only');
  assert.equal((await second.state('testnet')).wallet.status, 'not_configured');
  assert.equal((await second.state('mainnet')).wallet.status, 'not_configured');
  assert.deepEqual(await second.events('sandbox', 0), [event]);
  assert.deepEqual(await second.events('testnet', 0), []);
  assert.match(await readFile(join(root, 'sandbox', 'events.jsonl'), 'utf8'), /real event/);
});

test('event replay is ordered, cursor based, and bounded', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'arbivane-dashboard-'));
  t.after(() => rm(root, {recursive:true, force:true}));
  const store = new DashboardStore(root); await store.init();
  await Promise.all(Array.from({length: 12}, (_, index) =>
    store.event('sandbox', {stage:'scan', status:'info', message:`event-${index}`})));
  const replay = await store.events('sandbox', 7, 3);
  assert.deepEqual(replay.map((event) => event.sequence), [10, 11, 12]);
  assert.equal(new Set(replay.map((event) => event.id)).size, replay.length);
});

test('financing input is a positive bounded decimal cap', () => {
  assert.deepEqual(validateSettings({maxFinancingUsd:'2500.5', minimumNetProfitUsd:'1'}),
    {maxFinancingUsd:'2500.50', minimumNetProfitUsd:'1.00'});
  for (const value of ['0', '-1', '1.001', '1e9', '1000000000'])
    assert.throws(() => validateSettings({maxFinancingUsd:value, minimumNetProfitUsd:'1'}), /INVALID_MAX_FINANCING/);
  assert.throws(() => validateSettings({maxFinancingUsd:'1', minimumNetProfitUsd:'-1'}), /INVALID_MINIMUM_PROFIT/);
});

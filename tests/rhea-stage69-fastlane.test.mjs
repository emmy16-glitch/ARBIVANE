import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const path=new URL('../.github/workflows/rhea-stage69-fastlane.yml',import.meta.url);
const text=await readFile(path,'utf8');

test('Stage69 must independently process only authentic Stage63 tiny source-gross blockers',()=>{
 assert.ok(text.includes("run-id: '40187579892'"));
 assert.ok(text.includes('pattern: rhea-stage63-attempt-5-shard-*'));
 assert.ok(text.includes('stage38-qualification.json'));
 assert.ok(text.includes('SOURCE_VALID_SPREAD_BELOW_MINIMUM_PAPER_GROSS'));
 assert.ok(text.includes('historicalFindingIndex'));
 assert.ok(text.includes('sourceDebtAccounts == 7801'));
 assert.ok(text.includes('| unique_by(.start) | .[:8]'));
 assert.ok(text.includes('max-parallel: 2'));
 assert.ok(text.includes('group: arbivane-stage69-fastlane'));
 assert.ok(!text.includes('group: arbivane-stage63-authentic-recovery'));
});

test('Stage69 independently reattests each borrower against the immutable genuine registry before fresh risk',()=>{
 assert.ok(text.includes("run-id: '40128285853'"));
 assert.ok(text.includes('source/rhea-full-paged-index.json'));
 assert.ok(text.includes('RHEA_STAGE32_MAX_FINDINGS: \'1\''));
 assert.ok(text.includes('RHEA_STAGE38_MAX_FINDINGS: \'1\''));
 assert.ok(text.includes('RHEA_STAGE32_BATCH_SIZE: \'1\''));
 assert.ok(text.includes('RHEA_STAGE38_SANDBOX_MIN_PAPER_GROSS_USD_E27: \'1\''));
 assert.ok(text.includes('NEAR_WORKSPACES_NETWORK: sandbox'));
});

test('Stage69 genuine Workspaces execution remains keyless and never fabricates a settlement',()=>{
 assert.ok(text.includes('scripts/stage37-workspaces-sandbox-replay.mjs'));
 assert.ok(text.includes('STAGE37_ALLOW_SANDBOX_MUTATION=true'));
 assert.ok(text.includes('scripts/stage56-sandbox-attempt-cli.mjs'));
 for(const name of ['stage55-sandbox-phase-evidence.json',
  'stage37-sandbox-execution.json','stage41-sandbox-balance-settlement.json',
  'LOCAL_RHEA_BALANCE_AND_CALLBACK_VERIFIED_NOT_PROFIT',
  'ISOLATED_CALLBACK_SUCCESS_NOT_MAINNET_PROOF',
  'POSITION_AND_FT_DELTAS_OBSERVED_UNSOLD',
  'borrowerDebtDecreaseInternal','borrowerCollateralDecreaseInternal',
  'actorSeizeFtIncreaseAtomic','transactionFinal == true']){
  assert.ok(text.includes(name),name);
 }
 assert.ok(text.includes('mainnetExecutionEnabled:false'));
 assert.ok(text.includes("EXECUTION_ENABLED: 'false'"));
 assert.ok(text.includes("RHEA_STAGE38_SANDBOX_MIN_PAPER_GROSS_USD_E27: '1'"));
 assert.ok(!text.includes('NEAR_PRIVATE_KEY'));
 assert.ok(!text.includes('MAINNET_PRIVATE_KEY'));
 assert.ok(!text.includes('broadcast_tx'));
 assert.ok(!text.includes('send_tx'));
});

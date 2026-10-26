import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const s=await readFile(new URL('../.github/workflows/rhea-stage93-borrower-settlement.yml',import.meta.url),'utf8');
test('Stage93 runs one previously source-qualified borrower in a separate true execution group',()=>{
 assert.ok(s.includes('group: arbivane-stage118-source-clock-settlement'));
 assert.ok(!s.includes('group: arbivane-stage87-single-borrower'));
 assert.ok(s.includes("(.historicalFindingIndex == 2579)"));
 assert.ok(s.includes('sourceDebtAccounts == 7801'));
 assert.ok(s.includes('mainnetExecutionEnabled == false'));
 assert.ok(s.includes('max-parallel: 1'));
 assert.ok(s.includes('cancel-in-progress: false'));
 assert.ok(s.includes('run-id: \'40187579892\''));
 assert.ok(s.includes('run-id: \'40128285853\''));
 assert.ok(s.includes('RHEA_STAGE38_MAX_FINDINGS: \'1\''));
 assert.ok(s.includes('RHEA_STAGE32_MAX_FINDINGS: \'1\''));
 assert.ok(s.includes("STAGE82_SINGLE_BORROWER: 'true'"));
 assert.ok(s.includes('timeout-minutes: 20'));
 assert.ok(s.includes('timeout --kill-after=10s 12m node'));
});
test('Stage93 never treats a mock, a Pyth quote or source plan as a liquidation',()=>{
 assert.ok(s.includes('scripts/stage37-workspaces-sandbox-replay.mjs'));
 assert.ok(s.includes('scripts/stage56-sandbox-attempt-cli.mjs'));
 assert.ok(s.includes('stage88-sandbox-clone-witness.json'));
 assert.ok(s.includes('stage82-one-borrower-parity.json'));
 assert.ok(s.includes('stage89-wnear-parity.json'));
 assert.ok(s.includes('stage91-linear-parity.json'));
 assert.ok(s.includes('stage37-sandbox-execution.json'));
 assert.ok(s.includes('stage41-sandbox-balance-settlement.json'));
 assert.ok(s.includes('stage55-sandbox-phase-evidence.json'));
 assert.ok(s.includes('status == "LOCAL_RHEA_BALANCE_AND_CALLBACK_VERIFIED_NOT_PROFIT"'));
 assert.ok(s.includes('actualRheaSettlementVerified == true'));
 assert.ok(s.includes('callbackReceiptCount > 0'));
 assert.ok(s.includes('borrowerMutationVerified == true'));
 assert.ok(s.includes('assetTransferObserved == true'));
 assert.ok(s.includes('borrowerDebtDecreaseInternal != "0"'));
 assert.ok(s.includes('actorSeizeFtIncreaseAtomic != "0"'));
 assert.ok(s.includes('stage93-verified-rhea-sandbox-liquidation'));
 assert.ok(s.includes('stage93-authentic-borrower-'));
});
test('Stage93 isolates mainnet reads from disposable NEAR Sandbox mutation',()=>{
 assert.ok(s.includes("EXECUTION_ENABLED: 'false'"));
 assert.ok(s.includes('NEAR_WORKSPACES_NETWORK=sandbox'));
 assert.ok(s.includes('STAGE37_ALLOW_SANDBOX_MUTATION=true'));
 assert.ok(s.includes('STAGE49_ALLOW_SANDBOX_WRAP_NEAR_FUNDING=true'));
 assert.ok(!s.includes('NEAR_PRIVATE_KEY:'));
 assert.ok(!s.includes('MAINNET_PRIVATE_KEY:'));
 assert.ok(!s.includes('broadcast_tx'));
});

test('Stage106 reruns authentic Stage93 settlement on temporal parity diagnostic changes',()=>{
 assert.ok(s.includes("'scripts/stage104-temporal-accrual-parity.mjs'"));
 assert.ok(s.includes("'scripts/stage96-rhea-view-parity.mjs'"));
 assert.ok(s.includes('stage93-verified-rhea-sandbox-liquidation'));
 assert.ok(s.includes("EXECUTION_ENABLED: 'false'"));
});

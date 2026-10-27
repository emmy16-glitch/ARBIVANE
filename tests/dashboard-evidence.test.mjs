import assert from 'node:assert/strict';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {importVerifiedSandboxEvidence, reconcileImportedSandboxEvidence} from '../dashboard/server/evidence.mjs';
import {DashboardStore} from '../dashboard/server/store.mjs';

const transactionId = '2'.repeat(43);
const execution = {mode:'ARBIVANE_STAGE37_SANDBOX_RESULT',chain:'NEAR_SANDBOX',
  status:'ISOLATED_CALLBACK_SUCCESS_NOT_MAINNET_PROOF',attemptedTransaction:true,
  failedReceiptCount:0,receiptCount:12,persistedAtLaterFinalizedBlock:true,
  realMainnetExecuted:false,realProfitVerified:false,executionEnabled:false,mayBroadcastMainnet:false};
const settlement = {mode:'ARBIVANE_STAGE41_SANDBOX_BALANCE_SETTLEMENT_WITNESS',chain:'NEAR_SANDBOX',
  status:'POSITION_AND_FT_DELTAS_OBSERVED_UNSOLD',borrowerAccountId:'borrower.near',positionId:'REGULAR',
  repayTokenId:'linear-protocol.near',seizeTokenId:'linear-protocol.near',
  borrowerDebtDecreaseInternal:'1858',borrowerCollateralDecreaseInternal:'1861',
  actorSeizeFtIncreaseAtomic:'25',actorSeizeFtAfterAtomic:'25',actorOutstandingDebtAfterInternal:'0',
  borrowerMutationVerified:true,assetTransferObserved:true,callbackSuccessObserved:true,
  positiveNetProfitVerified:false,settlementAssetSold:false,swapProceedsVerified:false,
  gasCostInSettlementAssetVerified:false,mainnetExecutionEnabled:false,maySignMainnet:false,mayBroadcastMainnet:false};
const phase = {mode:'ARBIVANE_STAGE55_LOCAL_RHEA_EXECUTION_PHASE_WITNESS',chain:'NEAR_SANDBOX',
  status:'LOCAL_RHEA_BALANCE_AND_CALLBACK_VERIFIED_NOT_PROFIT',actualRheaSettlementVerified:true,
  localLiquidationCallInvoked:true,mainnetExecutionEnabled:false,realMainnetExecuted:false,
  realProfitVerified:false,maySignMainnet:false,mayBroadcastMainnet:false};
const transaction = {final_execution_status:'FINAL',transaction:{hash:transactionId,
  signer_id:'actor.test.near',receiver_id:'contract.main.burrow.near'},
  receipts:[{receipt_id:'receipt',receipt:{Action:{actions:[{FunctionCall:{method_name:'callback_execute_with_pyth'}}]}}}],
  receipts_outcome:Array.from({length:12},(_,index)=>({id:index===0?'receipt':`receipt-${index}`,outcome:{status:{SuccessValue:''}}}))};
const proposal = {mode:'RHEA_STAGE35_PINNED_SOURCE_ONLY_LIQUIDATION_SIZING',chain:'NEAR_MAINNET',
  borrowerAccountId:'borrower.near',blockHeight:'221440179',executionEnabled:false,
  maySign:false,mayBroadcast:false,repay:{tokenId:'linear-protocol.near'},
  seize:{tokenId:'linear-protocol.near'}};

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'arbivane-evidence-'));
  t.after(() => rm(root, {recursive:true, force:true}));
  const values = {'stage37-sandbox-execution.json':execution,
    'stage41-sandbox-balance-settlement.json':settlement,
    'stage55-sandbox-phase-evidence.json':phase,
    'stage129-finalized-transaction.json':transaction,
    'source.json':proposal};
  await Promise.all(Object.entries(values).map(([name,value]) =>
    writeFile(join(root,name), JSON.stringify(value))));
  return root;
}

test('verified Sandbox evidence records receipt identity and unsold inventory without invented P&L', async (t) => {
  const root = await fixture(t);
  const record = await importVerifiedSandboxEvidence(root, join(root,'source.json'));
  assert.equal(record.id, transactionId);
  assert.equal(record.sourceBlock, '221440179');
  assert.equal(record.borrowerDebtDecreaseInternal, '1858');
  assert.equal(record.assetIncreaseAtomic, '25');
  assert.equal(record.callbackVerified, true);
  assert.equal(record.monetaryPnlVerified, false);
  assert.match(record.evidenceDigestSha256, /^[a-f0-9]{64}$/);
});

test('reconciliation is idempotent and never converts unsold tokens into USD', async (t) => {
  const root = await fixture(t); const data = join(root,'data');
  const store = new DashboardStore(data); await store.init();
  await reconcileImportedSandboxEvidence(store, root, join(root,'source.json'));
  await reconcileImportedSandboxEvidence(store, root, join(root,'source.json'));
  const state = await store.state('sandbox');
  assert.equal(state.transactions.length, 1);
  assert.equal(state.wallet.balances[0].atomic, '25');
  assert.equal(state.wallet.balances[0].transferableOutsideEnvironment, false);
  assert.equal(state.accounting.cumulativeNetPnl, null);
  assert.equal(state.accounting.evidence.monetaryPnlVerified, false);
});

test('failed receipt, residual debt, or source mismatch blocks dashboard admission', async (t) => {
  const root = await fixture(t);
  const cases = [
    ['stage129-finalized-transaction.json', {...transaction,receipts_outcome:[{id:'r',outcome:{status:{Failure:{}}}}]}],
    ['stage41-sandbox-balance-settlement.json', {...settlement,actorOutstandingDebtAfterInternal:'1'}],
    ['source.json', {...proposal,borrowerAccountId:'different.near'}],
  ];
  for (const [name,value] of cases) {
    await writeFile(join(root,name), JSON.stringify(value));
    await assert.rejects(importVerifiedSandboxEvidence(root, join(root,'source.json')), /DASHBOARD_/);
    await writeFile(join(root,name), JSON.stringify(name==='source.json'?proposal:name.includes('stage41')?settlement:transaction));
  }
});

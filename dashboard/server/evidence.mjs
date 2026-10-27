import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';

const HASH = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const UINT = /^(0|[1-9][0-9]{0,38})$/;
const requiredFiles = Object.freeze({
  execution: 'stage37-sandbox-execution.json',
  settlement: 'stage41-sandbox-balance-settlement.json',
  phase: 'stage55-sandbox-phase-evidence.json',
  transaction: 'stage129-finalized-transaction.json',
});

function object(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(code);
  return value;
}
function uint(value, code) {
  if (typeof value !== 'string' || !UINT.test(value)) throw new Error(code);
  return value;
}
async function evidenceFile(path) {
  const bytes = await readFile(path);
  if (bytes.length < 3 || bytes.length > 25_000_000) throw new Error('DASHBOARD_EVIDENCE_FILE_SIZE_REJECTED');
  return {bytes, value: object(JSON.parse(bytes.toString('utf8')), 'DASHBOARD_EVIDENCE_OBJECT_REQUIRED')};
}
function receiptFailures(transaction) {
  if (!Array.isArray(transaction.receipts_outcome) || transaction.receipts_outcome.length < 1)
    throw new Error('DASHBOARD_FINAL_RECEIPTS_MISSING');
  return transaction.receipts_outcome.filter((row) =>
    row?.outcome?.status && typeof row.outcome.status === 'object' &&
    Object.hasOwn(row.outcome.status, 'Failure')).length;
}
function verifiedCallbackCount(transaction) {
  if (!Array.isArray(transaction.receipts)) throw new Error('DASHBOARD_CALLBACK_DEFINITIONS_MISSING');
  const callbackIds = transaction.receipts.filter((row) => row?.receipt?.Action?.actions?.some((action) =>
    action?.FunctionCall?.method_name === 'callback_execute_with_pyth')).map((row) => row.receipt_id);
  if (callbackIds.length < 1) throw new Error('DASHBOARD_CALLBACK_DEFINITIONS_MISSING');
  const outcomes = new Map(transaction.receipts_outcome.map((row) => [row.id, row.outcome?.status]));
  if (callbackIds.some((id) => !outcomes.has(id) || Object.hasOwn(outcomes.get(id) ?? {}, 'Failure')))
    throw new Error('DASHBOARD_CALLBACK_NOT_SUCCESSFUL');
  return callbackIds.length;
}

export async function importVerifiedSandboxEvidence(directory, sourceEvidencePath) {
  const entries = await Promise.all(Object.entries(requiredFiles).map(async ([key, name]) =>
    [key, await evidenceFile(join(directory, name))]));
  const files = Object.fromEntries(entries);
  const source = await evidenceFile(sourceEvidencePath);
  const execution = files.execution.value;
  const settlement = files.settlement.value;
  const phase = files.phase.value;
  const transaction = files.transaction.value;
  const proposal = source.value;
  const transactionId = transaction.transaction?.hash;
  const signerId = transaction.transaction?.signer_id;
  const receiverId = transaction.transaction?.receiver_id;

  if (execution.mode !== 'ARBIVANE_STAGE37_SANDBOX_RESULT' || execution.chain !== 'NEAR_SANDBOX' ||
    execution.status !== 'ISOLATED_CALLBACK_SUCCESS_NOT_MAINNET_PROOF' || execution.attemptedTransaction !== true ||
    execution.failedReceiptCount !== 0 || execution.persistedAtLaterFinalizedBlock !== true ||
    execution.realMainnetExecuted !== false || execution.realProfitVerified !== false ||
    execution.executionEnabled !== false || execution.mayBroadcastMainnet !== false)
    throw new Error('DASHBOARD_UNVERIFIED_EXECUTION_EVIDENCE');
  if (settlement.mode !== 'ARBIVANE_STAGE41_SANDBOX_BALANCE_SETTLEMENT_WITNESS' ||
    settlement.chain !== 'NEAR_SANDBOX' || settlement.status !== 'POSITION_AND_FT_DELTAS_OBSERVED_UNSOLD' ||
    settlement.borrowerMutationVerified !== true || settlement.assetTransferObserved !== true ||
    settlement.callbackSuccessObserved !== true || settlement.positiveNetProfitVerified !== false ||
    settlement.settlementAssetSold !== false || settlement.swapProceedsVerified !== false ||
    settlement.gasCostInSettlementAssetVerified !== false || settlement.mainnetExecutionEnabled !== false ||
    settlement.maySignMainnet !== false || settlement.mayBroadcastMainnet !== false ||
    uint(settlement.actorOutstandingDebtAfterInternal, 'DASHBOARD_INVALID_ACTOR_DEBT') !== '0')
    throw new Error('DASHBOARD_UNRECONCILED_SETTLEMENT_EVIDENCE');
  if (phase.mode !== 'ARBIVANE_STAGE55_LOCAL_RHEA_EXECUTION_PHASE_WITNESS' || phase.chain !== 'NEAR_SANDBOX' ||
    phase.status !== 'LOCAL_RHEA_BALANCE_AND_CALLBACK_VERIFIED_NOT_PROFIT' ||
    phase.actualRheaSettlementVerified !== true || phase.localLiquidationCallInvoked !== true ||
    phase.mainnetExecutionEnabled !== false || phase.realMainnetExecuted !== false ||
    phase.realProfitVerified !== false || phase.maySignMainnet !== false || phase.mayBroadcastMainnet !== false)
    throw new Error('DASHBOARD_INCOMPLETE_PHASE_EVIDENCE');
  if (transaction.final_execution_status !== 'FINAL' || !HASH.test(transactionId ?? '') ||
    typeof signerId !== 'string' || typeof receiverId !== 'string' || receiptFailures(transaction) !== 0)
    throw new Error('DASHBOARD_UNVERIFIED_FINAL_TRANSACTION');
  if (receiverId !== 'contract.main.burrow.near') throw new Error('DASHBOARD_WRONG_SETTLEMENT_CONTRACT');
  if (proposal.mode !== 'RHEA_STAGE35_PINNED_SOURCE_ONLY_LIQUIDATION_SIZING' ||
    proposal.chain !== 'NEAR_MAINNET' || proposal.borrowerAccountId !== settlement.borrowerAccountId ||
    proposal.repay?.tokenId !== settlement.repayTokenId || proposal.seize?.tokenId !== settlement.seizeTokenId ||
    typeof proposal.blockHeight !== 'string' || !/^[1-9][0-9]{0,15}$/.test(proposal.blockHeight) ||
    proposal.executionEnabled !== false || proposal.maySign !== false || proposal.mayBroadcast !== false)
    throw new Error('DASHBOARD_SOURCE_PROPOSAL_MISMATCH');
  const callbackReceiptCount = verifiedCallbackCount(transaction);
  if (execution.receiptCount !== transaction.receipts_outcome.length)
    throw new Error('DASHBOARD_RECEIPT_COUNT_MISMATCH');
  for (const key of ['borrowerDebtDecreaseInternal', 'borrowerCollateralDecreaseInternal',
    'actorSeizeFtIncreaseAtomic', 'actorSeizeFtAfterAtomic']) uint(settlement[key], `DASHBOARD_INVALID_${key.toUpperCase()}`);
  if (BigInt(settlement.borrowerDebtDecreaseInternal) <= 0n ||
    BigInt(settlement.borrowerCollateralDecreaseInternal) <= 0n ||
    BigInt(settlement.actorSeizeFtIncreaseAtomic) <= 0n)
    throw new Error('DASHBOARD_NONPOSITIVE_SETTLEMENT_DELTA');

  const digest = createHash('sha256');
  for (const key of Object.keys(requiredFiles).sort()) digest.update(files[key].bytes);
  digest.update(source.bytes);
  return {
    id: transactionId, environment: 'sandbox', network: 'NEAR_SANDBOX', type: 'liquidation',
    status: 'verified_unsold_inventory', timestamp: new Date().toISOString(), signerId, receiverId,
    borrowerAccountId: settlement.borrowerAccountId, positionId: settlement.positionId,
    repayTokenId: settlement.repayTokenId, seizeTokenId: settlement.seizeTokenId,
    borrowerDebtDecreaseInternal: settlement.borrowerDebtDecreaseInternal,
    borrowerCollateralDecreaseInternal: settlement.borrowerCollateralDecreaseInternal,
    assetIncreaseAtomic: settlement.actorSeizeFtIncreaseAtomic,
    assetBalanceAfterAtomic: settlement.actorSeizeFtAfterAtomic,
    receiptCount: execution.receiptCount, failedReceiptCount: execution.failedReceiptCount,
    callbackVerified: true, callbackReceiptCount, actorDebtAfterInternal: '0', sourceBlock: proposal.blockHeight,
    monetaryPnlVerified: false, collateralSold: false, evidenceDigestSha256: digest.digest('hex'),
    evidenceFiles: [...Object.values(requiredFiles), sourceEvidencePath],
  };
}

export async function reconcileImportedSandboxEvidence(store, directory, sourceEvidencePath) {
  const record = await importVerifiedSandboxEvidence(directory, sourceEvidencePath);
  const state = await store.update('sandbox', (value) => {
    if (!value.transactions.some((transaction) => transaction.id === record.id)) value.transactions.unshift(record);
    value.wallet = {status:'sandbox_reconciled_unsold', accountId:record.signerId,
      balances:[{tokenId:record.seizeTokenId, atomic:record.assetBalanceAfterAtomic,
        transferableOutsideEnvironment:false, evidenceTransactionId:record.id}],
      verifiedAt:record.timestamp};
    value.accounting.reconciledAt = record.timestamp;
    value.accounting.evidence = {transactionId:record.id, digestSha256:record.evidenceDigestSha256,
      monetaryPnlVerified:false, reason:'COLLATERAL_UNSOLD_AND_COSTS_NOT_DENOMINATED'};
    return value;
  });
  return {record, state};
}

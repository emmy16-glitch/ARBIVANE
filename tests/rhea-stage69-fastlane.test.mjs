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


test('Stage73 fresh main code preempts stale fast-lane runs but manual runs remain serial',()=>{
 assert.ok(text.includes("cancel-in-progress: ${{ github.event_name == 'push' }}"));
 assert.ok(text.includes("group: arbivane-stage69-fastlane"));
 assert.ok(text.includes("- '.github/workflows/rhea-stage69-fastlane.yml'"));
 assert.ok(text.includes("EXECUTION_ENABLED: 'false'"));
 assert.ok(text.includes('actualRheaSettlementVerified'));
 assert.ok(!text.includes('MAINNET_PRIVATE_KEY'));
});

test('Stage74 accepts only a later-finalized persistent optimistic Sandbox receipt or original FINAL receipt',async()=>{
 const {spawnSync}=await import('node:child_process');
 const match=text.match(/jq -e '([^']*persistedAtLaterFinalizedBlock[^']*)' "\$receipt"/);
 assert.ok(match,'Stage69 verifier must enforce later finalized state persistence');
 const filter=match[1];
 const available=spawnSync('jq',['--version'],{encoding:'utf8'});
 assert.equal(available.status,0,'GitHub Linux CI must provide jq for executable workflow gate tests');
 const base={status:'ISOLATED_CALLBACK_SUCCESS_NOT_MAINNET_PROOF',
  attemptedTransaction:true,persistedAtLaterFinalizedBlock:true,
  failedReceiptCount:0,callbackReceiptCount:1,failedCallbackReceiptCount:0,
  transactionFinal:false,transactionExecutionStatus:'EXECUTED_OPTIMISTIC',
  finalizedBlockBefore:8,finalizedBlockAfter:10008};
 const admits=(receipt)=>{
  const result=spawnSync('jq',['-e',filter],{input:JSON.stringify(receipt),encoding:'utf8'});
  assert.equal(result.error,undefined);
  return result.status===0;
 };
 assert.equal(admits(base),true,'Stage48 later-finalized persistence is an authentic local proof');
 assert.equal(admits({...base,transactionFinal:true,transactionExecutionStatus:'FINAL'}),true);
 for(const bad of [
  {...base,persistedAtLaterFinalizedBlock:false},
  {...base,persistedAtLaterFinalizedBlock:null},
  {...base,finalizedBlockAfter:9},
  {...base,finalizedBlockBefore:null},
  {...base,finalizedBlockAfter:null},
  {...base,transactionExecutionStatus:'FINAL'},
  {...base,transactionFinal:true},
  {...base,attemptedTransaction:false},
  {...base,failedReceiptCount:1},
  {...base,callbackReceiptCount:0},
  {...base,failedCallbackReceiptCount:1},
  {...base,status:'ISOLATED_CALLBACK_PENDING_FINALIZED_PERSISTENCE'},
 ])assert.equal(admits(bad),false,'untrusted or unpersisted evidence must fail closed');
 assert.ok(text.includes('borrowerDebtDecreaseInternal != "0"'));
 assert.ok(text.includes('borrowerCollateralDecreaseInternal != "0"'));
 assert.ok(text.includes('actorSeizeFtIncreaseAtomic != "0"'));
 assert.ok(text.includes('actualRheaSettlementVerified == true'));
 assert.ok(text.includes('maySignMainnet == false'));
});


test('Stage75 pins cloned state batching changes to an authentic new fast-lane run',()=>{
 assert.ok(text.includes("- 'scripts/stage46-paged-sandbox-clone.mjs'"));
 assert.ok(text.includes("cancel-in-progress: ${{ github.event_name == 'push' }}"));
 assert.ok(text.includes('stage46-sandbox-clone-evidence.json'));
 assert.ok(text.includes('stage55-sandbox-phase-evidence.json'));
 assert.ok(text.includes('borrowerDebtDecreaseInternal != "0"'));
 assert.ok(!text.includes('broadcast_tx'));
});

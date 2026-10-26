import test from 'node:test';
import assert from 'node:assert/strict';
import {buildStage37SandboxPlan,summarizeStage37SandboxOutcome} from '../src/rhea/stage37-sandbox-liquidation.ts';
const HASH='2'.repeat(43),PYTH='3'.repeat(43);
function proposal(){
 return {mode:'RHEA_STAGE35_PINNED_SOURCE_ONLY_LIQUIDATION_SIZING',chain:'NEAR_MAINNET',
  borrowerAccountId:'example.near',blockHeight:'221440179',lendingCodeHash:HASH,
  pythOracleCodeHash:PYTH,status:'PAPER_SCENARIOS_FOUND_NOT_EXECUTABLE',
  positionId:'REGULAR',referenceInitialHealthBps:'8908',referenceRulesPass:true,
  repay:{tokenId:'wrap.near',amountLendingInternalAtomic:'100000000000000000000',
   referenceUsdE27:'1',shareToActualTokenAtomicConversionVerified:false,fundsAvailabilityVerified:false},
  seize:{tokenId:'meta-pool.near',amountLendingInternalAtomic:'110000000000000000000',
   referenceUsdE27:'2',shareToActualTokenAtomicConversionVerified:false,fundsAvailabilityVerified:false},
  contractRouteParityVerified:false,rawTokenDenominationsVerified:false,
  sandboxStateReplaySucceeded:false,gasAndSwapNetProfitVerified:false,
  walletCapitalVerified:false,mainnetWalletApproved:false,executionEnabled:false,
  maySign:false,mayBroadcast:false};
}
test('stage37 builds observed Pyth 3-action route for Sandbox only from vetted positive source reference',()=>{
 const p=buildStage37SandboxPlan(proposal());
 assert.equal(p.chain,'NEAR_SANDBOX');assert.equal(p.method,'execute_with_pyth');
 assert.deepEqual(p.actions.map(a=>Object.keys(a)[0]),['Borrow','Liquidate','Withdraw']);
 assert.equal(p.actions[1].Liquidate.account_id,'example.near');
 assert.equal(p.actions[1].Liquidate.in_assets[0].max_amount,'100000000000000000000');
  assert.equal(p.actions[1].Liquidate.in_assets[0].amount,undefined);
 assert.equal(p.actions[2].Withdraw.amount,'110000000000000000000');
 assert.equal(p.depositYocto,'1');assert.equal(p.gasUnits,'300000000000000');
 assert.equal(p.executionEnabled,false);assert.equal(p.mayBroadcastMainnet,false);
 assert.equal(p.realContractReplayVerified,false);
});
test('never interpret Stage35 zero-source-spread or blocked candidate as executable sandbox proposal',()=>{
 for(const x of [{status:'NO_SAFE_SOURCE_SCENARIO'},{referenceRulesPass:false},
  {repay:null},{seize:null},{referenceInitialHealthBps:'10000'},
  {executionEnabled:true},{rawTokenDenominationsVerified:true},{mainnetWalletApproved:true},
  {sandboxStateReplaySucceeded:true},{blockHeight:'0'}, {borrowerAccountId:'invalid account'},
  {repay:{...proposal().repay,amountLendingInternalAtomic:'0'}}]){
  assert.throws(()=>buildStage37SandboxPlan({...proposal(),...x}));
 }
});
const receipt=(s,id='4'.repeat(43))=>({id,outcome:{status:s,gas_burnt:'4000000000000'}});
const callbackReceipt=(id)=>({receipt_id:id,receipt:{Action:{actions:[
 {FunctionCall:{method_name:'callback_execute_with_pyth',args:''}}]}}});
test('fail-closed on skipped async callback or failed receipt despite successful initial call',()=>{
 const success=receipt({SuccessValue:''});const failure=receipt({Failure:{ActionError:'borrow denied'}},'5'.repeat(43));
 const r=summarizeStage37SandboxOutcome({
  final_execution_status:'FINAL',status:{Failure:'callback reverted'},
  receipts_outcome:[success,failure],receipts:[callbackReceipt('5'.repeat(43))]
 },{pinnedConfigMatches:true,pinnedBorrowerMatches:true,importedContractCount:4,allStoredKeysAttested:false});
 assert.equal(r.status,'SANDBOX_RECEIPT_FAILURE');assert.equal(r.failedReceiptCount,1);
 assert.equal(r.realMainnetExecuted,false);assert.equal(r.realProfitVerified,false);
 assert.equal(r.gasBurntGasUnits,'8000000000000');
 const mixed=summarizeStage37SandboxOutcome({
  final_execution_status:'FINAL',status:{SuccessValue:''},
  receipts_outcome:[success,failure],receipts:[callbackReceipt('5'.repeat(43))],
 },{pinnedConfigMatches:true,pinnedBorrowerMatches:true,importedContractCount:4,allStoredKeysAttested:false});
 assert.equal(mixed.status,'SANDBOX_RECEIPT_FAILURE');
 assert.equal(mixed.failedReceiptCount,1);
 assert.equal(mixed.callbackReceiptCount,1);
 assert.equal(mixed.failedCallbackReceiptCount,1);
 assert.equal(mixed.topLevelFailureObserved,false);
 assert.equal(mixed.gasBurntGasUnits,'8000000000000');
 assert.ok(mixed.blockers.includes('SANDBOX_RHEA_ASYNC_CALLBACK_FAILED'));
});
test('even locally successful callback never authorizes spending or claims mainnet profits',()=>{
 const r=summarizeStage37SandboxOutcome({
  final_execution_status:'FINAL',status:{SuccessValue:''},
  receipts_outcome:[receipt({SuccessValue:''})],receipts:[callbackReceipt('4'.repeat(43))],
 },{pinnedConfigMatches:true,pinnedBorrowerMatches:true,importedContractCount:5,allStoredKeysAttested:false});
 assert.equal(r.status,'ISOLATED_CALLBACK_SUCCESS_NOT_MAINNET_PROOF');
 assert.equal(r.realProfitVerified,false);assert.equal(r.executionEnabled,false);
 assert.equal(r.mayBroadcastMainnet,false);
 assert.ok(r.blockers.includes('FULL_IMPORTED_CONTRACT_STORAGE_KEYSET_NOT_ATTESTED'));
});
test('incomplete contract clone blocks without treating a transaction as attempted',()=>{
 const r=summarizeStage37SandboxOutcome(undefined,{
  pinnedConfigMatches:true,pinnedBorrowerMatches:false,importedContractCount:2,
  allStoredKeysAttested:false,
 });
 assert.equal(r.status,'BLOCKED_STATE_IMPORT_OR_INCOMPLETE_PROOF');
 assert.equal(r.attemptedTransaction,false);
});
test('runner has no mainnet tx API and must be explicitly sandbox-gated',async()=>{
 const {readFile}=await import('node:fs/promises');
 const script=await readFile(new URL('../scripts/stage37-workspaces-sandbox-replay.mjs',import.meta.url),'utf8');
 assert.ok(script.includes("NEAR_WORKSPACES_NETWORK!=='sandbox'"));
 assert.ok(script.includes("STAGE37_ALLOW_SANDBOX_MUTATION!=='true'"));
 assert.ok(!script.includes('withData:true'));assert.ok(script.includes('clonePinnedContractWithState'));assert.ok(script.includes("callRaw("));
 assert.ok(!script.includes('broadcast_tx'));assert.ok(!script.includes('send_tx'));
});

test('Stage57 preserves top-level failure even if all child receipts return success',()=>{
 const success=receipt({SuccessValue:''});
 const r=summarizeStage37SandboxOutcome({
  final_execution_status:'FINAL',status:{Failure:{ActionError:'failed'}},
  receipts_outcome:[success],
  receipts:[callbackReceipt('4'.repeat(43))],
 },{pinnedConfigMatches:true,pinnedBorrowerMatches:true,
  importedContractCount:4,allStoredKeysAttested:false});
 assert.equal(r.status,'SANDBOX_RECEIPT_FAILURE');
 assert.equal(r.failedReceiptCount,0);
 assert.equal(r.failedCallbackReceiptCount,0);
 assert.equal(r.topLevelFailureObserved,true);
 assert.ok(r.blockers.includes('SANDBOX_TOP_LEVEL_TRANSACTION_FAILED'));
 assert.equal(r.realProfitVerified,false);
});
test('Stage57 preserves failed dependency in an otherwise successful Pyth callback',()=>{
 const callback=receipt({SuccessValue:''},'4'.repeat(43));
 const child=receipt({Failure:{ActionError:'FT callback failed'}},'5'.repeat(43));
 const r=summarizeStage37SandboxOutcome({
  final_execution_status:'EXECUTED_OPTIMISTIC',status:{SuccessValue:''},
  receipts_outcome:[callback,child],receipts:[callbackReceipt('4'.repeat(43))],
 },{pinnedConfigMatches:true,pinnedBorrowerMatches:true,
  importedContractCount:4,allStoredKeysAttested:false});
 assert.equal(r.status,'SANDBOX_RECEIPT_FAILURE');
 assert.equal(r.failedReceiptCount,1);
 assert.equal(r.failedCallbackReceiptCount,0);
 assert.equal(r.transactionExecutionStatus,'EXECUTED_OPTIMISTIC');
 assert.equal(r.transactionFinal,false);
 assert.ok(r.blockers.includes('SANDBOX_ASYNC_DEPENDENCY_RECEIPT_FAILED'));
 assert.equal(r.mayBroadcastMainnet,false);
});
test('Stage57 refuses missing unknown or duplicated receipt statuses, not promoting them',()=>{
 const base={
  final_execution_status:'FINAL',status:{SuccessValue:''},
  receipts:[callbackReceipt('4'.repeat(43))],
 };
 const cases=[
  [receipt({},'4'.repeat(43))],
  [receipt({Unknown:'opaque'},'4'.repeat(43))],
  [receipt({SuccessValue:'',Failure:'fake'},'4'.repeat(43))],
  [receipt({SuccessValue:''},'4'.repeat(43)),
   receipt({SuccessValue:''},'4'.repeat(43))],
 ];
 for(const receipts_outcome of cases)
  assert.throws(()=>summarizeStage37SandboxOutcome({...base,receipts_outcome},{
   pinnedConfigMatches:true,pinnedBorrowerMatches:true,
   importedContractCount:4,allStoredKeysAttested:false,
  }),/SANDBOX_MALFORMED_RECEIPTS/);
 assert.throws(()=>summarizeStage37SandboxOutcome({
  ...base,status:{},
  receipts_outcome:[receipt({SuccessValue:''},'4'.repeat(43))],
 },{pinnedConfigMatches:true,pinnedBorrowerMatches:true,
  importedContractCount:4,allStoredKeysAttested:false}),/SANDBOX_RECEIPT_FINALITY_CONTRADICTION/);
});
test('Stage57 tracks Rhea async callback receipt without leaking provider failure text',()=>{
 const secret='private token https://example.test/password';
 const r=summarizeStage37SandboxOutcome({
  final_execution_status:'FINAL',status:{SuccessReceiptId:'4'.repeat(43)},
  receipts_outcome:[receipt({Failure:{ActionError:secret}},'4'.repeat(43))],
  receipts:[callbackReceipt('4'.repeat(43))],
 },{pinnedConfigMatches:true,pinnedBorrowerMatches:true,
  importedContractCount:4,allStoredKeysAttested:false});
 assert.equal(r.status,'SANDBOX_RECEIPT_FAILURE');
 assert.equal(r.failedCallbackReceiptCount,1);
 assert.equal(JSON.stringify(r).includes(secret),false);
});


test('Stage71 authentic same-token liquidation repays actor in one isolated call before withdrawing surplus',()=>{
 const q=proposal();q.seize.tokenId=q.repay.tokenId;
 const p=buildStage37SandboxPlan(q);
 assert.deepEqual(p.actions.map(a=>Object.keys(a)[0]),
  ['Borrow','Liquidate','Repay','Withdraw']);
 assert.equal(p.actions[2].Repay.token_id,'wrap.near');
 assert.equal(p.actions[2].Repay.amount,p.actions[0].Borrow.amount);
 assert.equal(p.actions[3].Withdraw.token_id,'wrap.near');
 assert.equal(p.actions[3].Withdraw.amount,'10000000000000000000');
 assert.equal(p.actions[1].Liquidate.out_assets[0].amount,
  String(BigInt(p.actions[3].Withdraw.amount)+BigInt(p.actions[2].Repay.amount)));
 assert.equal(p.maySignMainnet,false);assert.equal(p.executionEnabled,false);
});

test('Stage124 bounded repay preserves source sizing without imposing unpayable exact supplied-share minimum',()=>{
  const q=proposal();q.seize.tokenId=q.repay.tokenId;
  const p=buildStage37SandboxPlan(q);
  assert.deepEqual(p.actions[1].Liquidate.in_assets,[{token_id:q.repay.tokenId,max_amount:q.repay.amountLendingInternalAtomic}]);
  assert.equal(p.actions[0].Borrow.amount,q.repay.amountLendingInternalAtomic);
  assert.equal(p.actions[2].Repay.amount,p.actions[0].Borrow.amount);
  assert.equal(p.actions[3].Withdraw.amount,'10000000000000000000');
  assert.equal(p.depositYocto,'1');assert.equal(p.maySignMainnet,false);
});

test('Stage71 cannot withdraw same-token balance with no surplus or borrow not fully repaid',()=>{
 const q=proposal();q.seize.tokenId=q.repay.tokenId;
 for(const v of ['100000000000000000000','99000000000000000000']){
  assert.throws(()=>buildStage37SandboxPlan({...q,seize:{...q.seize,
   amountLendingInternalAtomic:v}}),/STAGE71_SAME_TOKEN_REQUIRES_POSITIVE_REMAINDER/);
 }
});

test('Stage72 uses only pinned active Pyth storage clones with cross-token and Stage71 same-token routes',async()=>{
 const {selectPinnedActivePythSandboxDependencies}=await import(
  '../scripts/stage51-active-pyth-sandbox-parity.mjs');
 const config={enable_pyth_oracle:true,enable_price_oracle:false,
  pyth_oracle_account_id:'aggregate-oracle.near'};
 const cross=buildStage37SandboxPlan(proposal());
 assert.deepEqual(selectPinnedActivePythSandboxDependencies(config,cross),
  ['contract.main.burrow.near','aggregate-oracle.near','wrap.near','meta-pool.near']);
 const singleProposal=proposal();singleProposal.seize.tokenId=singleProposal.repay.tokenId;
 const same=buildStage37SandboxPlan(singleProposal);
 assert.deepEqual(same.actions.map(x=>Object.keys(x)[0]),
  ['Borrow','Liquidate','Repay','Withdraw']);
 assert.deepEqual(selectPinnedActivePythSandboxDependencies(config,same),
  ['contract.main.burrow.near','aggregate-oracle.near','wrap.near']);
 for(const bad of [
  {...config,enable_pyth_oracle:false},
  {...config,enable_price_oracle:true},
  {...config,pyth_oracle_account_id:'unexpected-oracle.near'},
 ])assert.throws(()=>selectPinnedActivePythSandboxDependencies(bad,cross),
  /STAGE72_PINNED_ACTIVE_PYTH_ONLY_REQUIRED/);
 assert.throws(()=>selectPinnedActivePythSandboxDependencies(config,
  {...cross,mayBroadcastMainnet:true}),/STAGE72_UNTRUSTED_SANDBOX_PLAN/);
 assert.throws(()=>selectPinnedActivePythSandboxDependencies(config,
  {...cross,actions:[{Borrow:{token_id:'priceoracle.near'}},...cross.actions.slice(1)]}),
  /STAGE72_INVALID_ACTIVE_PYTH_ASSET_ROUTE/);
 const script=await (await import('node:fs/promises')).readFile(
  new URL('../scripts/stage37-workspaces-sandbox-replay.mjs',import.meta.url),'utf8');
 assert.ok(script.includes('selectPinnedActivePythSandboxDependencies(config.value,plan)'));
 assert.ok(script.includes('disabledLegacyPriceOracleExcluded:true'));
 assert.ok(!script.includes("'priceoracle.near',\n  'wrap.near'"));
 assert.ok(script.includes('clonePinnedContractWithState'));
 assert.ok(script.includes('STAGE37_ALLOW_SANDBOX_MUTATION'));
});

test('Stage122 permits only attested temporal accrual when authentic source view bytes differ',()=>{
 const raw={final_execution_status:'FINAL',status:{SuccessValue:''},
  receipts_outcome:[receipt({SuccessValue:''})],
  receipts:[callbackReceipt('4'.repeat(43))]};
 const inspection={pinnedConfigMatches:true,pinnedBorrowerMatches:false,
  temporalAccrualVerified:true,importedContractCount:4,allStoredKeysAttested:false};
 const accepted=summarizeStage37SandboxOutcome(raw,inspection);
 assert.equal(accepted.status,'ISOLATED_CALLBACK_SUCCESS_NOT_MAINNET_PROOF');
 assert.ok(accepted.blockers.includes('BORROWER_TEMPORAL_ACCRUAL_PROVED_NOT_EXACT_PINNED_VIEW_PARITY'));
 for(const bad of [
  {...inspection,temporalAccrualVerified:false},
  {...inspection,temporalAccrualVerified:undefined},
  {...inspection,pinnedConfigMatches:false},
  {...inspection,importedContractCount:2},
 ]){
  const blocked=summarizeStage37SandboxOutcome(raw,bad);
  assert.equal(blocked.status,'BLOCKED_STATE_IMPORT_OR_INCOMPLETE_PROOF');
  assert.equal(blocked.attemptedTransaction,false);
 }
});

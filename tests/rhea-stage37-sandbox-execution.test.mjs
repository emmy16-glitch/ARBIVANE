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
 assert.equal(p.actions[1].Liquidate.in_assets[0].amount,'100000000000000000000');
 assert.equal(p.actions[2].Withdraw.amount,'110000000000000000000');
 assert.equal(p.depositYocto,'0');assert.equal(p.gasUnits,'300000000000000');
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
 assert.throws(()=>summarizeStage37SandboxOutcome({
  final_execution_status:'FINAL',status:{SuccessValue:''},receipts_outcome:[success,failure],receipts:[callbackReceipt('5'.repeat(43))],
 },{pinnedConfigMatches:true,pinnedBorrowerMatches:true,importedContractCount:4,allStoredKeysAttested:false}),/CONTRADICTION/);
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

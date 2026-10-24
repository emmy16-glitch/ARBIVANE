#!/usr/bin/env node
/** Stage37 execution attempt ONLY inside NEAR Workspaces local Sandbox.
 * No mainnet signer, transaction RPC method, wallet secrets or public mutations.
 * Strict pre-state checks fail closed if large lending storage cannot be imported.
 * Dynamically installed near-workspaces is intentionally NOT a default dependency.
 */
import {readFile,writeFile} from 'node:fs/promises';
import {NearReadOnlyRpc} from '../src/rhea/rpc.ts';
import {buildStage37SandboxPlan,summarizeStage37SandboxOutcome} from '../src/rhea/stage37-sandbox-liquidation.ts';
const e=process.env;
let worker;
async function main(){
 if(e.NEAR_WORKSPACES_NETWORK!=='sandbox'||e.EXECUTION_ENABLED!=='false'||
  e.STAGE37_ALLOW_SANDBOX_MUTATION!=='true'||
  !e.STAGE37_STAGE35_EVIDENCE_PATH||!e.NEAR_RPC_URL||
  e.NEAR_PRIVATE_KEY||e.NEAR_ACCOUNT_ID||e.MAINNET_PRIVATE_KEY)
  throw Error('LOCAL_SANDBOX_ONLY_EXPLICIT_REPLAY_GATE_REQUIRED');
 const proposal=JSON.parse(await readFile(e.STAGE37_STAGE35_EVIDENCE_PATH,'utf8'));
 const plan=buildStage37SandboxPlan(proposal);
 const block=Number(plan.mainnetSourceBlockHeight);
 const rpc=new NearReadOnlyRpc(e.NEAR_RPC_URL);
 const [onchainLending,onchainOracle,config,borrower]=await Promise.all([
  rpc.viewAccount(plan.lendingContract,block),
  rpc.viewAccount('aggregate-oracle.near',block),
  rpc.view(plan.lendingContract,'get_config',{},block),
  rpc.view(plan.lendingContract,'get_account_all_positions',{account_id:plan.borrowerAccountId},block),
 ]);
 if(onchainLending.codeHash!==plan.sourceCodeHash||
  onchainOracle.codeHash!==plan.sourceOracleHash||
  [onchainLending.blockHeight,onchainOracle.blockHeight,config.blockHeight,borrower.blockHeight]
   .some(h=>h!==plan.mainnetSourceBlockHeight))
  throw Error('SANDBOX_PROPOSAL_SOURCE_BLOCK_OR_CODE_CHANGED');
 let pkg;
 try{pkg=await import('near-workspaces');}catch{
  throw Error('NEAR_WORKSPACES_MUST_BE_INSTALLED_LOCALLY');
 }
 worker=await pkg.Worker.init({network:'sandbox'});
 const root=worker.rootAccount;
 if(!root||typeof root.importContract!=='function')throw Error('NO_SANDBOX_IMPORT_API');
 // withData:true is mandatory: a no-data clone is NOT a real transaction replay.
 const contracts=new Map();
 const ids=new Set([plan.lendingContract,'aggregate-oracle.near','priceoracle.near',
  plan.actions[0].Borrow.token_id,plan.actions[2].Withdraw.token_id]);
 for(const id of ids){
  contracts.set(id,await root.importContract({
   mainnetContract:id,blockId:block,withData:true,
  }));
 }
 const lending=contracts.get(plan.lendingContract);
 const [sandboxConfig,sandboxBorrower]=await Promise.all([
  lending.view('get_config',{}),
  lending.view('get_account_all_positions',{account_id:plan.borrowerAccountId}),
 ]);
 const pinnedConfigMatches=JSON.stringify(sandboxConfig)===JSON.stringify(config.value);
 const pinnedBorrowerMatches=JSON.stringify(sandboxBorrower)===JSON.stringify(borrower.value);
 if(!pinnedConfigMatches||!pinnedBorrowerMatches)
  throw Error('SANDBOX_REQUIRED_VIEWS_DISAGREE_WITH_MAINNET');
 // Public borrowed token and borrower state may require additional Ft account storage.
 // A sandbox-only disposable signer never derives from or accesses a mainnet key.
 const actor=await root.createSubAccount('arbivane-replay');
 if(!actor||typeof actor.callRaw!=='function')throw Error('MISSING_SANDBOX_RAW_RECEIPT_API');
 let raw;
 try{
  raw=await actor.callRaw(lending,plan.method,{actions:plan.actions},{
   gas:plan.gasUnits,attachedDeposit:plan.depositYocto,
  });
 }catch(error){
  // Never interpret a thrown error as a successful on-chain liquidation.
  throw Error('SANDBOX_CALL_REJECTED_BEFORE_FINAL_RECEIPTS');
 }
 const report=summarizeStage37SandboxOutcome(raw,{
  pinnedConfigMatches,pinnedBorrowerMatches,
  importedContractCount:contracts.size,allStoredKeysAttested:false,
 });
 await writeFile('stage37-sandbox-execution.json',JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));
 if(report.status!=='ISOLATED_CALLBACK_SUCCESS_NOT_MAINNET_PROOF')process.exitCode=2;
}
main().catch(err=>{
 console.log(JSON.stringify({mode:'ARBIVANE_STAGE37_SANDBOX_RESULT',chain:'NEAR_SANDBOX',
  status:'BLOCKED_STATE_IMPORT_OR_INCOMPLETE_PROOF',attemptedTransaction:false,
  reason:err instanceof Error?err.message:'UNKNOWN',
  realMainnetExecuted:false,realProfitVerified:false,mayBroadcastMainnet:false,
  blockers:['NO_VERIFIED_END_TO_END_STATEFUL_LIQUIDATION_REPLAY']},null,2));
 process.exitCode=2;
}).finally(async()=>{if(worker)await worker.tearDown().catch(()=>{});});

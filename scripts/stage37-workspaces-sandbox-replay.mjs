#!/usr/bin/env node
/** Stage37 execution attempt ONLY inside NEAR Workspaces local Sandbox.
 * No mainnet signer, transaction RPC method, wallet secrets or public mutations.
 * Strict pre-state checks fail closed if large lending storage cannot be imported.
 * Dynamically installed near-workspaces is intentionally NOT a default dependency.
 */
import {readFile,writeFile} from 'node:fs/promises';
import {NearReadOnlyRpc} from '../src/rhea/rpc.ts';
import {buildStage37SandboxPlan,summarizeStage37SandboxOutcome} from '../src/rhea/stage37-sandbox-liquidation.ts';
import {attestStage41SandboxSettlement} from '../src/rhea/stage41-sandbox-settlement.ts';
import {attestStage48FinalizedSandboxReplay} from '../src/rhea/stage48-finalized-sandbox-witness.ts';
import {clonePinnedContractWithState} from './stage46-paged-sandbox-clone.mjs';
import {inspectStage49BorrowRoute,registerStage49SandboxTokenStorage} from './stage49-sandbox-asset-storage-preflight.mjs';
const e=process.env;
let worker;
let sandboxTransactionSubmitted=false;
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
 // Reconstruct pinned lending, oracle and NEP-141 storage using bounded native
 // archival cursors. Code-only import MUST be followed by complete local patch.
 const contracts=new Map();
 const cloneEvidence=[];
 const ids=new Set([plan.lendingContract,'aggregate-oracle.near','priceoracle.near',
  plan.actions[0].Borrow.token_id,plan.actions[2].Withdraw.token_id]);
 for(const id of ids){
  const {contract,evidence}=await clonePinnedContractWithState({
   root,rpc,endpoint:e.NEAR_RPC_URL,contractId:id,blockHeight:block,
   expectedCodeHash:id===plan.lendingContract?plan.sourceCodeHash:
    id==='aggregate-oracle.near'?plan.sourceOracleHash:null,
   onProgress:entry=>console.error(JSON.stringify({mode:'STAGE46_LOCAL_CLONE_PROGRESS',...entry})),
  });
  contracts.set(id,contract);
  cloneEvidence.push(evidence);
 }
 if(new Set(cloneEvidence.map(row=>row.sourceBlockHash)).size!==1)
  throw Error('STAGE46_CROSS_CONTRACT_SOURCE_BLOCK_HASH_MISMATCH');
 await writeFile('stage46-sandbox-clone-evidence.json',JSON.stringify({
  mode:'STAGE46_PINNED_SANDBOX_DEPENDENCY_CLONES',chain:'NEAR_SANDBOX',
  contracts:cloneEvidence,completeTrieRootParityVerified:false,
  mainnetMutationEnabled:false,realRheaLiquidationVerified:false,
 },null,2)+'\n');
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
 const actor=await root.createSubAccount('arbivane-replay',{
  initialBalance:3n*10n**24n,
 });
 if(!actor||typeof actor.callRaw!=='function'||typeof actor.accountId!=='string')
  throw Error('MISSING_SANDBOX_RAW_RECEIPT_API');
 // Observe actual lending positions and NEP-141 balances BEFORE the Sandbox call.
 // No zero-balance fallback: missing storage/views must block settlement claims.
 // A disabled Rhea borrow asset is a known real historical failure.
 // Validate the imported lending pool against the SAME pinned mainnet block;
 // install only required NEP-145 storage with disposable Sandbox native NEAR.
 const pinnedAssets=await rpc.view(plan.lendingContract,'get_assets_paged',{},block);
 if(pinnedAssets.blockHeight!==plan.mainnetSourceBlockHeight)
  throw Error('STAGE49_PINNED_ASSET_VIEW_BLOCK_MISMATCH');
 const sandboxAssets=await lending.view('get_assets_paged',{});
 const stage49Route=inspectStage49BorrowRoute(plan,pinnedAssets.value,sandboxAssets);
 const stage49Storage=await registerStage49SandboxTokenStorage({
  actor,tokens:contracts,plan,
 });
 await writeFile('stage49-sandbox-asset-storage-preflight.json',JSON.stringify({
  mode:'ARBIVANE_STAGE49_SANDBOX_BORROW_AND_STORAGE_PREFLIGHT',
  chain:'NEAR_SANDBOX',sourceBlockHeight:plan.mainnetSourceBlockHeight,
  assetRoute:stage49Route,tokenStorage:stage49Storage,
  availableRealMainnetCapitalVerified:false,
  actualBorrowAndLiquidationVerified:false,positiveNetProfitVerified:false,
  mainnetExecutionEnabled:false,mayBroadcastMainnet:false,
 },null,2)+'\n');
 const repayToken=contracts.get(plan.actions[0].Borrow.token_id);
 const seizeToken=contracts.get(plan.actions[2].Withdraw.token_id);
 if(!repayToken||!seizeToken)throw Error('SANDBOX_FT_CONTRACT_NOT_IMPORTED');
 const snapshot=()=>Promise.all([
  lending.view('get_account_all_positions',{account_id:actor.accountId}),
  repayToken.view('ft_balance_of',{account_id:actor.accountId}),
  seizeToken.view('ft_balance_of',{account_id:actor.accountId}),
 ]);
 const [actorBefore,repayFtBefore,seizeFtBefore]=await snapshot();
 let raw;
 try{
  sandboxTransactionSubmitted=true;
  raw=await actor.callRaw(lending,plan.method,{actions:plan.actions},{
   gas:BigInt(plan.gasUnits),attachedDeposit:BigInt(plan.depositYocto),
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
 // Read actual AFTER state even if a callback says "success": detect false
 // positives, left-over borrow liabilities and zero seized FT inventory.
 const borrowerSnapshot=()=>lending.view('get_account_all_positions',{
  account_id:plan.borrowerAccountId,
 });
 const snapshotAll=async()=>{
  const [borrower,balances]=await Promise.all([borrowerSnapshot(),snapshot()]);
  return {borrower,actor:balances[0],repayFt:balances[1],seizeFt:balances[2]};
 };
 const immediate=await snapshotAll();
 let verifiedReport=report,post=immediate;
 if(report.status!=='SANDBOX_RECEIPT_FAILURE'){
  if(!worker?.provider||typeof worker.provider.block!=='function'||
   typeof worker.provider.fastForward!=='function')
   throw Error('STAGE48_FINALIZED_SANDBOX_PROVIDER_NOT_AVAILABLE');
  const beforeFinalBlock=await worker.provider.block({finality:'final'});
  // Stage44's actual NEAR Sandbox proof showed fastForward(8) was not
  // enough to advance finalized height; Workspaces uses 10,000.
  await worker.provider.fastForward(10000);
  const afterFinalBlock=await worker.provider.block({finality:'final'});
  post=await snapshotAll();
  verifiedReport=attestStage48FinalizedSandboxReplay({
   receipt:report,
   before:{borrower:sandboxBorrower,actor:actorBefore,
    repayFt:repayFtBefore,seizeFt:seizeFtBefore},
   immediatelyAfter:immediate,afterFinalBlock:post,
   finalizedBlockBefore:beforeFinalBlock?.header?.height,
   finalizedBlockAfter:afterFinalBlock?.header?.height,
  });
  await writeFile('stage37-sandbox-execution.json',
   JSON.stringify(verifiedReport,null,2)+'\n');
 }
 const settlement=attestStage41SandboxSettlement({
  plan,positionId:proposal.positionId,receipt:verifiedReport,
  borrowerBefore:sandboxBorrower,borrowerAfter:post.borrower,
  actorBefore,actorAfter:post.actor,
  actorRepayFtBefore:repayFtBefore,actorRepayFtAfter:post.repayFt,
  actorSeizeFtBefore:seizeFtBefore,actorSeizeFtAfter:post.seizeFt,
 });
 await writeFile('stage41-sandbox-balance-settlement.json',JSON.stringify(settlement,null,2)+'\n');
 console.log(JSON.stringify({...verifiedReport,settlementStatus:settlement.status,
  borrowerMutationVerified:settlement.borrowerMutationVerified,
  assetTransferObserved:settlement.assetTransferObserved,
  positiveNetProfitVerified:false},null,2));
 if(verifiedReport.status!=='ISOLATED_CALLBACK_SUCCESS_NOT_MAINNET_PROOF'||
  settlement.status!=='POSITION_AND_FT_DELTAS_OBSERVED_UNSOLD')process.exitCode=2;
}
main().catch(err=>{
 console.log(JSON.stringify({mode:'ARBIVANE_STAGE37_SANDBOX_RESULT',chain:'NEAR_SANDBOX',
  status:'BLOCKED_STATE_IMPORT_OR_INCOMPLETE_PROOF',attemptedTransaction:sandboxTransactionSubmitted,
  reason:err instanceof Error?err.message:'UNKNOWN',
  realMainnetExecuted:false,realProfitVerified:false,mayBroadcastMainnet:false,
  blockers:['NO_VERIFIED_END_TO_END_STATEFUL_LIQUIDATION_REPLAY']},null,2));
 process.exitCode=2;
}).finally(async()=>{if(worker)await worker.tearDown().catch(()=>{});});

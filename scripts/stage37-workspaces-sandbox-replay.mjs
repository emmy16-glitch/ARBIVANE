#!/usr/bin/env node
/** Stage37 execution attempt ONLY inside NEAR Workspaces local Sandbox.
 * No mainnet signer, transaction RPC method, wallet secrets or public mutations.
 * Strict pre-state checks fail closed if large lending storage cannot be imported.
 * Dynamically installed near-workspaces is intentionally NOT a default dependency.
 */
import {readFile,writeFile} from 'node:fs/promises';
import {NearReadOnlyRpc} from '../src/rhea/rpc.ts';
import {ResilientNearReadOnlyRpc} from '../src/rhea/resilient-readonly-rpc.ts';
import {cloneFailure} from './stage119-clone-failure.mjs';
import {buildStage37SandboxPlan,summarizeStage37SandboxOutcome} from '../src/rhea/stage37-sandbox-liquidation.ts';
import {attestStage41SandboxSettlement} from '../src/rhea/stage41-sandbox-settlement.ts';
import {attestStage48FinalizedSandboxReplay} from '../src/rhea/stage48-finalized-sandbox-witness.ts';
import {clonePinnedContractWithState} from './stage46-paged-sandbox-clone.mjs';
import {cloneStage76Dependencies} from './stage76-bounded-clone-queue.mjs';
import {createStage88CloneWitness,stage88FailureCode} from './stage88-sandbox-clone-witness.mjs';
import {cloneStage82BorrowerLending} from './stage82-targeted-lending-clone.mjs';
import {cloneStage89WrappedNear} from './stage89-targeted-wnear-clone.mjs';
import {cloneStage91LinearToken} from './stage91-targeted-linear-token.mjs';
import {attestStage96PinnedRheaViews,stage101SameBorrowerView} from './stage96-rhea-view-parity.mjs';
import {stage104AttestTemporalAccrual} from './stage104-temporal-accrual-parity.mjs';
import {inspectStage49RheaAssets,registerStage49SandboxActor} from './stage49-sandbox-route-readiness.mjs';
import {readStage50PinnedRepayReserve} from './stage50-pinned-ft-reserve.mjs';
import {attestStage51PythParity,selectPinnedActivePythSandboxDependencies} from './stage51-active-pyth-sandbox-parity.mjs';
import {inspectStage49SandboxBorrow} from './stage49-sandbox-borrow-preflight.mjs';
import {seedSandboxLiquidatorWithWrappedNear} from './stage49-sandbox-wrap-funding.mjs';
import {attestStage52BorrowCollateralCapacity} from './stage52-solvent-sandbox-borrow-capacity.mjs';
import {createStage55PhaseLedger} from './stage55-sandbox-execution-ledger.mjs';
import {readSourceClock,initHistoricalSandbox,attestReplayClock} from './stage115-historical-sandbox-clock.mjs';
import {signedSandboxEvidence} from './stage116-signed-sandbox-evidence.mjs';
const e=process.env;
let worker;
let sandboxTransactionSubmitted=false;
let sandboxFundingAttempted=false;
let cloneMonitor=null;
const stage55=createStage55PhaseLedger();
const stage55Path='stage55-sandbox-phase-evidence.json';
async function recordStage55(value){
 await writeFile(stage55Path,JSON.stringify(value,null,2)+'\n');
}
async function recordCloneFailure(contractId,sourceBlockHeight,error){
 const failure=cloneFailure(error);
 await writeFile('stage119-clone-failure.json',JSON.stringify({
  contractId,sourceBlockHeight,...failure},null,2)+'\n');
 return failure.code;
}
async function markStage55(phase){await recordStage55(stage55.enter(phase));}
async function main(){
 await markStage55('SOURCE_ADMISSION');
 if(e.NEAR_WORKSPACES_NETWORK!=='sandbox'||e.EXECUTION_ENABLED!=='false'||
  e.STAGE37_ALLOW_SANDBOX_MUTATION!=='true'||
  e.STAGE49_ALLOW_SANDBOX_WRAP_NEAR_FUNDING!=='true'||
  !e.STAGE37_STAGE35_EVIDENCE_PATH||!e.NEAR_RPC_URL||
  e.NEAR_PRIVATE_KEY||e.NEAR_ACCOUNT_ID||e.MAINNET_PRIVATE_KEY)
  throw Error('LOCAL_SANDBOX_ONLY_EXPLICIT_REPLAY_GATE_REQUIRED');
 const proposal=JSON.parse(await readFile(e.STAGE37_STAGE35_EVIDENCE_PATH,'utf8'));
 const plan=buildStage37SandboxPlan(proposal);
 const block=Number(plan.mainnetSourceBlockHeight);
 const rpc=new ResilientNearReadOnlyRpc(new NearReadOnlyRpc(e.NEAR_RPC_URL));
 await markStage55('PINNED_SOURCE_VIEWS');
 const [onchainLending,onchainOracle,config,borrower,assets]=await Promise.all([
  rpc.viewAccount(plan.lendingContract,block),
  rpc.viewAccount('aggregate-oracle.near',block),
  rpc.view(plan.lendingContract,'get_config',{},block),
  rpc.view(plan.lendingContract,'get_account_all_positions',{account_id:plan.borrowerAccountId},block),
  rpc.view(plan.lendingContract,'get_assets_paged',{},block),
 ]);
 if(onchainLending.codeHash!==plan.sourceCodeHash||
  onchainOracle.codeHash!==plan.sourceOracleHash||
  [onchainLending.blockHeight,onchainOracle.blockHeight,config.blockHeight,borrower.blockHeight,assets.blockHeight]
   .some(h=>h!==plan.mainnetSourceBlockHeight))
  throw Error('SANDBOX_PROPOSAL_SOURCE_BLOCK_OR_CODE_CHANGED');
 // Reject the known real-world failure where the Borrow leg uses a disabled
 // asset. This pinned permission check is NOT proof of actual wallet liquidity.
 const marketReadiness=inspectStage49RheaAssets(plan,assets.value,block);
 await writeFile('stage49-sandbox-route-preflight.json',
  JSON.stringify(marketReadiness,null,2)+'\n');
 // Verify that the Rhea lending contract actually controls a sufficient
 // NEP-141 reserve and reference pool capacity at the SAME pinned block.
 // Preflight comes before Sandbox imports, lowering wasted clone costs.
 await markStage55('SOURCE_REPAY_RESERVE');
 const repayReserve=await readStage50PinnedRepayReserve({
  rpc,plan,pinnedAssets:assets.value,blockHeight:block,
 });
 await writeFile('stage50-pinned-repay-reserve.json',
  JSON.stringify(repayReserve,null,2)+'\n');
 await markStage55('SANDBOX_STARTUP');
 let pkg;
 try{pkg=await import('near-workspaces');}catch{
  throw Error('NEAR_WORKSPACES_MUST_BE_INSTALLED_LOCALLY');
 }
 const sourceClock=await readSourceClock(e.NEAR_RPC_URL,block);
 const historical=await initHistoricalSandbox(pkg,sourceClock);
 worker=historical.worker;
 await writeFile('stage115-historical-clock.json',JSON.stringify(historical.witness,null,2)+'\n');
 const root=worker.rootAccount;
 if(!root||typeof root.importContract!=='function')throw Error('NO_SANDBOX_IMPORT_API');
 // Reconstruct pinned lending, oracle and NEP-141 storage using bounded native
 // archival cursors. Code-only import MUST be followed by complete local patch.
 await markStage55('SANDBOX_STATE_CLONE');
 const contracts=new Map();
 const cloneEvidence=[];
 // Complete, pinned Rhea source config must prove the legacy price oracle
 // disabled before omitting that unused full-state clone. Preserve Stage71's
 // single-token Repay+Withdraw route and all genuine dependency contracts.
 const ids=selectPinnedActivePythSandboxDependencies(config.value,plan);
 cloneMonitor=createStage88CloneWitness({contractIds:ids,sourceBlockHeight:block});
 await cloneMonitor.initialize();
 // Two completely independent archival clones at a time; 450 ms pacing per
 // RPC reader caps aggregate request pressure near previous serial pacing.
 // Keep the exact deterministic pinned dependency list and source code hashes.
 // In one-borrower mode, preserve real deployed lending WASM and only the
 // targeted borrower's indexed storage plus shared market records. Other
 // dependencies still need complete proven clones until their layouts are
 // independently authenticated. Never mislabel a partial closure as full.
 const oneBorrower=e.STAGE82_SINGLE_BORROWER==='true';
 if(oneBorrower){
  await cloneMonitor.update({contractId:plan.lendingContract,status:'STARTED'});
  let targeted;
  try{targeted=await cloneStage82BorrowerLending({
   root,rpc,endpoint:e.NEAR_RPC_URL,contractId:plan.lendingContract,
   blockHeight:block,expectedCodeHash:plan.sourceCodeHash,
   borrowerAccountId:plan.borrowerAccountId,
   assetIds:assets.value.map(row=>row[0]),
   fallbackEndpoint:e.STAGE45_ARCHIVAL_FALLBACK_URL||
    'https://archival-rpc.mainnet.near.org',
   budgets:{paceMs:450},
  });
   await cloneMonitor.update({contractId:plan.lendingContract,status:'COMPLETE',
    evidence:targeted.evidence});
  }catch(error){
   const code=await recordCloneFailure(plan.lendingContract,block,error);
   await cloneMonitor.update({contractId:plan.lendingContract,status:'BLOCKED',
    failureCode:code});
   throw Error(code);
  }
  contracts.set(plan.lendingContract,targeted.contract);
  cloneEvidence.push(targeted.evidence);
  if(ids.includes('wrap.near')){
   await cloneMonitor.update({contractId:'wrap.near',status:'STARTED'});
   let wrapped;
   try{
    wrapped=await cloneStage89WrappedNear({
     root,rpc,endpoint:e.NEAR_RPC_URL,blockHeight:block,
     lendingAccountId:plan.lendingContract,
     borrowerAccountId:plan.borrowerAccountId,
     fallbackEndpoint:e.STAGE45_ARCHIVAL_FALLBACK_URL||
      'https://archival-rpc.mainnet.near.org',
     paceMs:450,
    });
    await cloneMonitor.update({contractId:'wrap.near',status:'COMPLETE',
     evidence:wrapped.evidence});
   }catch(error){
    const code=await recordCloneFailure('wrap.near',block,error);
    await cloneMonitor.update({contractId:'wrap.near',status:'BLOCKED',
     failureCode:code});
    throw Error(code);
   }
   contracts.set('wrap.near',wrapped.contract);
   cloneEvidence.push(wrapped.evidence);
   await writeFile('stage89-wnear-parity.json',
    JSON.stringify(wrapped.evidence,null,2)+'\n');
  }
  if(ids.includes('linear-protocol.near')){
   // Source-only, non-synthetic LiNEAR UnorderedMap closure. Stage91 ran
   // against the actual historic borrower; this replay independently
   // re-verifies its pinned deployed code and ALL required token views.
   await cloneMonitor.update({contractId:'linear-protocol.near',status:'STARTED'});
   let linear;
   try{
    linear=await cloneStage91LinearToken({
     root,rpc,endpoint:e.NEAR_RPC_URL,blockHeight:block,
     lendingAccountId:plan.lendingContract,
     borrowerAccountId:plan.borrowerAccountId,
     fallbackEndpoint:e.STAGE45_ARCHIVAL_FALLBACK_URL||
      'https://archival-rpc.mainnet.near.org',
     paceMs:450,
    });
    await cloneMonitor.update({contractId:'linear-protocol.near',status:'COMPLETE',
     evidence:linear.evidence});
   }catch(error){
    const code=await recordCloneFailure('linear-protocol.near',block,error);
    await cloneMonitor.update({contractId:'linear-protocol.near',status:'BLOCKED',
     failureCode:code});
    throw Error(code);
   }
   contracts.set('linear-protocol.near',linear.contract);
   cloneEvidence.push(linear.evidence);
   await writeFile('stage91-linear-parity.json',
    JSON.stringify(linear.evidence,null,2)+'\n');
  }
 }
 const dependencyIds=oneBorrower?
  ids.filter(id=>id!==plan.lendingContract&&id!=='wrap.near'&&
   id!=='linear-protocol.near'):ids;
 const clones=await cloneStage76Dependencies({
  ids:dependencyIds,concurrency:2,
  onStatus:event=>cloneMonitor.update(event),
  clone:(id)=>clonePinnedContractWithState({
   root,rpc,endpoint:e.NEAR_RPC_URL,contractId:id,blockHeight:block,
   fallbackEndpoint:e.STAGE45_ARCHIVAL_FALLBACK_URL||
    'https://archival-rpc.mainnet.near.org',
   expectedCodeHash:id===plan.lendingContract?plan.sourceCodeHash:
    id==='aggregate-oracle.near'?plan.sourceOracleHash:null,
   budgets:{paceMs:450},
   onProgress:entry=>{
    cloneMonitor.progress(entry);
    console.error(JSON.stringify({mode:'STAGE46_LOCAL_CLONE_PROGRESS',...entry}));
   },
  }),
 });
 await cloneMonitor.finish();
 // Copying a historical snapshot must not consume the market's quote window.
 // Resume normal, forward-only chain time before source parity and all actions.
 await writeFile('stage115-historical-clock.json',JSON.stringify(
  await historical.startReplayClock(),null,2)+'\n');
 for(let i=0;i<dependencyIds.length;i++){
  contracts.set(dependencyIds[i],clones[i].contract);
  cloneEvidence.push(clones[i].evidence);
 }
 if(contracts.size!==ids.length)
  throw Error('STAGE82_MISSING_REQUIRED_DEPENDENCY_CONTRACT');
 if(new Set(cloneEvidence.map(row=>row.sourceBlockHash)).size!==1)
  throw Error('STAGE46_CROSS_CONTRACT_SOURCE_BLOCK_HASH_MISMATCH');
 await writeFile('stage46-sandbox-clone-evidence.json',JSON.stringify({
  mode:'STAGE46_PINNED_SANDBOX_DEPENDENCY_CLONES',chain:'NEAR_SANDBOX',
  contracts:cloneEvidence,pinnedActivePythOnlyConfigVerified:true,
  disabledLegacyPriceOracleExcluded:true,completeTrieRootParityVerified:false,
  partialOneBorrowerState:oneBorrower,partialWnearState:oneBorrower,
  partialLinearState:oneBorrower&&ids.includes('linear-protocol.near'),
  fullMarketImported:!oneBorrower,
  mainnetMutationEnabled:false,realRheaLiquidationVerified:false,
 },null,2)+'\n');
 const lending=contracts.get(plan.lendingContract);
 // Isolated, durable view-by-view diagnosis after authentic clone completion.
 // Never mark a clone or matching view as a successful liquidation.
 const parityWitness=await attestStage96PinnedRheaViews({
  lending,borrowerAccountId:plan.borrowerAccountId,
  config:config.value,borrower:borrower.value,assets:assets.value,
  allowSandboxTemporalAccrual:true,
 });
 // Source-vs-Sandbox comparisons are separately persisted above and
 // fail closed on the specific config, borrower or asset read.
 const [sandboxConfig,sandboxBorrower,sandboxAssets]=await Promise.all([
  lending.view('get_config',{}),
  lending.view('get_account_all_positions',{account_id:plan.borrowerAccountId}),
  lending.view('get_assets_paged',{}),
 ]);
 const pinnedConfigMatches=JSON.stringify(sandboxConfig)===JSON.stringify(config.value);
 const pinnedBorrowerMatches=stage101SameBorrowerView(borrower.value,sandboxBorrower);
 const pinnedAssetsMatch=JSON.stringify(sandboxAssets)===JSON.stringify(assets.value);
 // Source-backed partial state may accrue interest using the newer local
 // block timestamp. Never claim exact historical view parity in that case.
 // Revalidate the restricted temporal proof AFTER the probe against fresh
 // local views, rather than reusing its prior observation.
 const temporalProof=parityWitness.temporalAccrualVerified===true?
  stage104AttestTemporalAccrual({
   sourceBorrower:borrower.value,sandboxBorrower,
   sourceAssets:assets.value,sandboxAssets,
  }):null;
 const exactParity=pinnedConfigMatches&&pinnedBorrowerMatches&&pinnedAssetsMatch;
 if(!exactParity&&(!pinnedConfigMatches||
  parityWitness.temporalAccrualVerified!==true||
  temporalProof?.verified!==true))
  throw Error('STAGE96_POST_PROBE_SOURCE_VIEWS_DRIFTED');
 // Partial closure cannot be advertised as a full cloned market. The
 // original independent source-view gate above remains mandatory BEFORE
 // collateral funding or any real Rhea Sandbox liquidation call.
 if(oneBorrower){
  const witness={
   mode:'STAGE82_SOURCE_PINNED_BORROWER_VIEW_WITNESS',
   contractId:plan.lendingContract,borrowerAccountId:plan.borrowerAccountId,
   pinnedConfigMatches,pinnedBorrowerMatches,pinnedAssetsMatch,
   exactHistoricalViewParity:exactParity,
   temporalAccrualVerified:temporalProof?.verified===true,
   temporalProofClassification:temporalProof?.class??null,
   fullMarketImported:false,fullTrieRootParityVerified:false,
   mainnetExecutionEnabled:false,localLiquidationVerified:false,
  };
  await writeFile('stage82-one-borrower-parity.json',
   JSON.stringify(witness,null,2)+'\n');
 }

 // The liquidation uses Rhea's active Pyth callback, not priceoracle.near.
 // Reject source/Sandbox quote and derived-token ratio disagreement before
 // funding or attempting any local liquidation transaction.
 await markStage55('SANDBOX_PYTH_PARITY');
 await writeFile('stage115-historical-clock.json',JSON.stringify(
  {...attestReplayClock(sourceClock,(await worker.provider.block({finality:'final'})).header),
   clockPhase:'HISTORICAL_EXECUTION',reconstructionClockRate:0.01},null,2)+'\n');
 const pythParity=await attestStage51PythParity({rpc,contracts,plan,blockHeight:block,
  fallbackEndpoint:e.STAGE45_ARCHIVAL_FALLBACK_URL||
   'https://archival-rpc.mainnet.near.org',
 });
 await writeFile('stage51-active-pyth-sandbox-parity.json',
  JSON.stringify(pythParity,null,2)+'\n');
 // Public borrowed token and borrower state may require additional Ft account storage.
 // A sandbox-only disposable signer never derives from or accesses a mainnet key.
 await markStage55('SANDBOX_ACTOR_REGISTRATION');
 const actor=await root.createSubAccount('arbivane-replay',{
  initialBalance:3n*10n**24n,
 });
 if(!actor||typeof actor.callRaw!=='function'||typeof actor.accountId!=='string')
  throw Error('MISSING_SANDBOX_RAW_RECEIPT_API');
 // Register the disposable actor with Rhea lending and BOTH selected FTs.
 // Pay ONLY each contract's audited storage minimum, inside local Sandbox.
 // A missing storage API, unexpected charge, or failed callback blocks replay.
 const storageProof=await registerStage49SandboxActor({actor,contracts,plan});
 await writeFile('stage49-sandbox-registration.json',
  JSON.stringify(storageProof,null,2)+'\n');
 // Observe actual lending positions and NEP-141 balances BEFORE the Sandbox call.
 // No zero-balance fallback: missing storage/views must block settlement claims.
 const repayToken=contracts.get(plan.actions[0].Borrow.token_id);
 const seizeToken=contracts.get(plan.actions.at(-1).Withdraw.token_id);
 if(!repayToken||!seizeToken)throw Error('SANDBOX_FT_CONTRACT_NOT_IMPORTED');
 // A cursor-exhausted clone is not verified merely because the archive
 // returned all pages; require actual Sandbox vault balance to match the
 // precise observed mainnet FT vault balance before attempting Borrow.
 const localVault=await repayToken.view('ft_balance_of',{
  account_id:plan.lendingContract,
 });
 if(localVault!==repayReserve.tokenVaultFtAtomic)
  throw Error('STAGE50_CLONED_FT_VAULT_MISMATCH');
 // Strict active Pyth parity, pinned vault, and source actor registration were
 // completed before this genuinely funded (but sandbox-only) loan attempt.
 await markStage55('SANDBOX_COLLATERAL_FUNDING');
 sandboxFundingAttempted=true;
 await recordStage55(stage55.fundingAttempted());
 const collateralFunding=await seedSandboxLiquidatorWithWrappedNear({
  actor,lending,wrapped:contracts.get('wrap.near'),assetRows:sandboxAssets,
  provider:worker.provider,evidencePath:'stage49-wnear-transfer-receipt.json',
 });
 const actorPositionsForFunding=await lending.view('get_account_all_positions',{
  account_id:actor.accountId,
 });
 const borrowCapacity=inspectStage49SandboxBorrow({
  plan,assets:sandboxAssets,actorAccountId:actor.accountId,
  actorPositions:actorPositionsForFunding,
 });
 // Source-pinned, active-Pyth price accounting of the REAL actor collateral:
 // merely "positive" WNEAR is not enough to support the intermediate Borrow.
 await markStage55('SANDBOX_BORROW_CAPACITY');
 const boundedCapacity=await attestStage52BorrowCollateralCapacity({
  rpc,contracts,plan,proposal,actorPositions:actorPositionsForFunding,
  pinnedAssets:assets.value,blockHeight:block,
 });
 await writeFile('stage52-actor-borrow-capacity.json',
  JSON.stringify(boundedCapacity,null,2)+'\n');
 await writeFile('stage49-sandbox-funding.json',JSON.stringify({
  mode:'ARBIVANE_STAGE49E_VERIFIED_LOCAL_FINANCING',
  chain:'NEAR_SANDBOX',collateralFunding,borrowCapacity,boundedCapacity,
  pinnedSourceRepayVaultVerified:true,activePythParityVerified:true,
  maySignMainnet:false,mayBroadcastMainnet:false,
  positiveNetProfitVerified:false,
 },null,2)+'\n');
 if(!borrowCapacity.sandboxAttemptAllowed)
  throw Error('STAGE49_'+borrowCapacity.status);
 if(!boundedCapacity.actorCoveredByConservativeReference)
  throw Error('STAGE52_ACTOR_REFERENCE_COLLATERAL_INSUFFICIENT');
 const snapshot=()=>Promise.all([
  lending.view('get_account_all_positions',{account_id:actor.accountId}),
  repayToken.view('ft_balance_of',{account_id:actor.accountId}),
  seizeToken.view('ft_balance_of',{account_id:actor.accountId}),
 ]);
 const [actorBefore,repayFtBefore,seizeFtBefore]=await snapshot();
 await writeFile('stage116-before-state.json',JSON.stringify({
  borrower:sandboxBorrower,actor:actorBefore,repayFt:repayFtBefore,seizeFt:seizeFtBefore,
  block:await worker.provider.block({finality:'final'}),
 },null,2)+'\n');
 await markStage55('SANDBOX_LIQUIDATION_TRANSACTION');
 let raw;
 try{
  sandboxTransactionSubmitted=true;
  await recordStage55(stage55.transactionSubmitted());
  raw=await actor.callRaw(lending,plan.method,{actions:plan.actions},{
   gas:BigInt(plan.gasUnits),attachedDeposit:BigInt(plan.depositYocto),
  });
 }catch(error){
  // Never interpret a thrown error as a successful on-chain liquidation.
  throw Error('SANDBOX_CALL_REJECTED_BEFORE_FINAL_RECEIPTS');
 }
 await markStage55('SANDBOX_CALLBACK_RECEIPTS');
 // Keep the complete canonical RPC outcome, including signature and receipt
 // proof paths, even when a callback failed. Never archive SDK config or keys.
 await writeFile('stage116-raw-transaction.json',JSON.stringify(raw?.result??raw,null,2)+'\n');
 const signedEvidence=signedSandboxEvidence(raw,{signerId:actor.accountId,
  receiverId:plan.lendingContract});
 await writeFile('stage116-signed-transaction.json',JSON.stringify(signedEvidence.manifest,null,2)+'\n');
 const report=summarizeStage37SandboxOutcome(raw,{
  pinnedConfigMatches,pinnedBorrowerMatches,
  temporalAccrualVerified:temporalProof?.verified===true&&
   parityWitness.temporalAccrualVerified===true,
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
  await markStage55('SANDBOX_FINALIZED_STATE');
  const beforeFinalBlock=await worker.provider.block({finality:'final'});
  // Stage44's actual NEAR Sandbox proof showed fastForward(8) was not
  // enough to advance finalized height; Workspaces uses 10,000.
  await worker.provider.fastForward(10000);
  const afterFinalBlock=await worker.provider.block({finality:'final'});
  post=await snapshotAll();
  await writeFile('stage116-after-state.json',JSON.stringify({
   ...post,finalizedBlockBefore:beforeFinalBlock,finalizedBlockAfter:afterFinalBlock,
  },null,2)+'\n');
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
 await markStage55('SANDBOX_BALANCE_SETTLEMENT');
 const settlement=attestStage41SandboxSettlement({
  plan,positionId:proposal.positionId,receipt:verifiedReport,
  borrowerBefore:sandboxBorrower,borrowerAfter:post.borrower,
  actorBefore,actorAfter:post.actor,
  actorRepayFtBefore:repayFtBefore,actorRepayFtAfter:post.repayFt,
  actorSeizeFtBefore:seizeFtBefore,actorSeizeFtAfter:post.seizeFt,
 });
 await writeFile('stage41-sandbox-balance-settlement.json',JSON.stringify(settlement,null,2)+'\n');
 // The terminal local proof requires all independent receipt AND balance gates.
 // A healthy-looking callback without seized FT or borrower debt decrease
 // remains BLOCKED, and never produces a completed Stage55 phase artifact.
 const success=stage55.finish({receipt:verifiedReport,settlement});
 await recordStage55(success);
 console.log(JSON.stringify({...verifiedReport,settlementStatus:settlement.status,
  borrowerMutationVerified:settlement.borrowerMutationVerified,
  assetTransferObserved:settlement.assetTransferObserved,
  stage55Status:success.status,
  positiveNetProfitVerified:false},null,2));
}
main().catch(async err=>{
 if(cloneMonitor)await cloneMonitor.flush().catch(()=>{});
 const failure=stage55.blocked(err);
 await recordStage55(failure).catch(()=>{});
 // Bounded, machine-readable error taxonomy only; untrusted RPC/SDK
 // exception strings may contain credentials or hostile provider content.
 console.log(JSON.stringify({mode:'ARBIVANE_STAGE37_SANDBOX_RESULT',chain:'NEAR_SANDBOX',
  status:'BLOCKED_STATE_IMPORT_OR_INCOMPLETE_PROOF',attemptedTransaction:sandboxTransactionSubmitted,
  sandboxFundingAttempted,stage55Phase:failure.currentPhase,
  stage55ReasonCode:failure.observedFailureCode,
  realMainnetExecuted:false,realProfitVerified:false,mayBroadcastMainnet:false,
  blockers:['NO_VERIFIED_END_TO_END_STATEFUL_LIQUIDATION_REPLAY']},null,2));
 process.exitCode=2;
}).finally(async()=>{
 if(worker){
  let timer;
  await Promise.race([worker.tearDown().catch(()=>{}),new Promise(resolve=>{
   timer=setTimeout(resolve,10000);
  })]);
  clearTimeout(timer);
 }
 // Drain the result before exiting; failed SDK initialization may otherwise
 // leave a port-lock heartbeat alive until the entire CI job times out.
 process.stdout.write('',()=>process.exit(process.exitCode??0));
});

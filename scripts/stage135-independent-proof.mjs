import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {signedSandboxEvidence} from './stage116-signed-sandbox-evidence.mjs';

/** Stage135: independent OFFLINE cross-file verification of real local Sandbox
 * evidence. Ed25519 authenticates the claimed transaction hash, but NEAR
 * outcome Merkle inclusion and imported source state roots are NOT attested. */
const names=[
 'stage116-raw-transaction.json','stage116-signed-transaction.json',
 'stage129-finalized-transaction.json','stage37-sandbox-execution.json',
 'stage41-sandbox-balance-settlement.json','stage55-sandbox-phase-evidence.json',
 'stage38-positive-stage35-evidence.json','stage116-before-state.json',
 'stage116-after-state.json','stage131-immediate-finalized-state.json',
 'stage134-finality-recovery.json'
];
const fail=(code)=>{throw Error('STAGE135_'+code);};
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const uint=x=>typeof x==='string'&&/^(0|[1-9][0-9]*)$/.test(x)&&x.length<=39?BigInt(x):fail('INVALID_INTEGER');
const num=x=>Number.isSafeInteger(x)&&x>=1?x:fail('INVALID_HEIGHT');
const eq=(a,b,code)=>{if(a!==b)fail(code);};
const hash=s=>createHash('sha256').update(s).digest('hex');
const ids=a=>{if(!Array.isArray(a)||a.length===0)fail('MISSING_RECEIPTS');
 const set=new Set();
 for(const x of a){
  if(typeof x?.id!=='string'||!x.id||set.has(x.id))fail('RECEIPT_IDS_INVALID');
  set.add(x.id);
 }return set;
};
const position=(account,pos,kind,token)=>{
 if(!obj(account)||!obj(account.positions)||!obj(account.positions[pos]))fail('MISSING_POSITION');
 const rows=account.positions[pos][kind];
 if(!Array.isArray(rows)||rows.length>256)fail('MISSING_POSITION_ROWS');
 const matches=rows.filter(x=>x?.token_id===token);
 if(matches.length>1)fail('DUPLICATE_POSITION_TOKEN');
 return matches.length?uint(matches[0].balance):0n;
};
const debt=account=>{
 if(!obj(account)||!obj(account.positions))fail('ACTOR_POSITIONS_INVALID');
 let result=0n;
 for(const v of Object.values(account.positions)){
  if(!obj(v)||!Array.isArray(v.borrowed))fail('ACTOR_DEBT_INVALID');
  for(const row of v.borrowed)result+=uint(row?.balance);
 }
 return result;
};
const snapshot=(data,label)=>{
 if(!obj(data)||!obj(data.borrower)||!obj(data.actor)||
  !obj(data.finalizedBlockBefore)&&label==='later')fail('INVALID_'+label.toUpperCase()+'_STATE');
 return data;
};
function actionList(tx){
 const a=tx?.actions;
 if(!Array.isArray(a)||a.length!==1)fail('SIGNED_ACTION_COUNT');
 const call=a[0]?.FunctionCall;
 if(!obj(call)||call.method_name!=='execute_with_pyth'||
  call.deposit!=='1'||typeof call.args!=='string'||call.args.length>20000)
  fail('UNTRUSTED_SIGNED_ACTION');
 const bytes=Buffer.from(call.args,'base64');
 if(!bytes.length||bytes.toString('base64')!==call.args)fail('ACTION_ENCODING');
 const j=JSON.parse(bytes.toString('utf8'));
 if(!obj(j)||!Array.isArray(j.actions)||j.actions.length!==4)fail('ACTION_ROUTE_MISSING');
 return j.actions;
}
export function verifyStage135Bundle(d,bytes){
 if(!obj(d)||!obj(bytes)||names.some(k=>!obj(d[k])||typeof bytes[k]!=='string'))fail('INCOMPLETE_BUNDLE');
 const raw=d[names[0]],signed=d[names[1]],final=d[names[2]];
 const report=d[names[3]],settle=d[names[4]],phase=d[names[5]],proposal=d[names[6]];
 const before=snapshot(d[names[7]],'before'),after=snapshot(d[names[8]],'later'),
  immediate=snapshot(d[names[9]],'immediate'),clock=d[names[10]];
 const tx=raw.transaction;
 if(!obj(tx)||tx.signer_id!=='arbivane-replay.test.near'||
  tx.receiver_id!=='contract.main.burrow.near'||tx.signer_id===proposal.borrowerAccountId)
  fail('UNTRUSTED_SANDBOX_SIGNER');
 const check=signedSandboxEvidence(raw,{signerId:tx.signer_id,receiverId:tx.receiver_id});
 if(signed.chain!=='NEAR_SANDBOX'||signed.mode!==check.manifest.mode||
  signed.mainnetExecutionEnabled!==false||signed.settlementVerified!==false||
  signed.outcomeMerkleProofIndependentlyVerified!==false||
  signed.transactionHashSignatureVerified!==true||
  signed.transactionId!==check.manifest.transactionId||
  signed.publicKey!==check.manifest.publicKey||
  signed.transactionSignature!==check.manifest.transactionSignature||
  signed.rawResultSha256!==check.manifest.rawResultSha256||
  JSON.stringify(signed.receiptIds)!==JSON.stringify(check.manifest.receiptIds))
  fail('SIGNED_MANIFEST_MISMATCH');
 if(final.final_execution_status!=='FINAL'||final?.status?.SuccessValue===undefined||
  !obj(final.transaction)||final.transaction.hash!==tx.hash||
  final.transaction.signer_id!==tx.signer_id||
  final.transaction.receiver_id!==tx.receiver_id||
  final.transaction.signature!==tx.signature||
  final.transaction.public_key!==tx.public_key||
  final.transaction_outcome?.id!==tx.hash)
  fail('FINAL_SIGNED_IDENTITY_MISMATCH');
 if(JSON.stringify(final.transaction.actions)!==JSON.stringify(tx.actions))
  fail('FINAL_ACTION_DRIFT');
 const initialIds=ids(raw.receipts_outcome),finalIds=ids(final.receipts_outcome);
 if([...initialIds].some(id=>!finalIds.has(id)))fail('INITIAL_RECEIPT_MISSING');
 for(const row of final.receipts_outcome){
  const st=row?.outcome?.status;
  if(!obj(st)||Object.hasOwn(st,'Failure')||
   !(Object.hasOwn(st,'SuccessValue')||Object.hasOwn(st,'SuccessReceiptId')))
   fail('FAILED_OR_AMBIGUOUS_RECEIPT');
 }
 if(!Array.isArray(final.receipts)||final.receipts.length<1)fail('NO_CANONICAL_RECEIPTS');
 let callbacks=0,transfers=0;
 const definitionIds=new Set();
 for(const row of final.receipts){
  if(!obj(row)||typeof row.receipt_id!=='string'||definitionIds.has(row.receipt_id)||
   !finalIds.has(row.receipt_id))fail('INVALID_CANONICAL_DEFINITION');
  definitionIds.add(row.receipt_id);
  for(const ac of row.receipt?.Action?.actions??[]){
   const method=ac?.FunctionCall?.method_name;
   if(method==='callback_execute_with_pyth'){
    callbacks++;eq(row.receiver_id,tx.receiver_id,'FOREIGN_CALLBACK');
   }
   if(method==='ft_transfer'){
    transfers++;eq(row.receiver_id,proposal.seize?.tokenId,'FOREIGN_FT_TRANSFER');
   }
  }
 }
 if(callbacks!==1||transfers<1)fail('RHEA_CALLBACK_OR_TRANSFER_MISSING');
 if(report.mode!=='ARBIVANE_STAGE37_SANDBOX_RESULT'||report.chain!=='NEAR_SANDBOX'||
  report.status!=='ISOLATED_CALLBACK_SUCCESS_NOT_MAINNET_PROOF'||
  report.transactionFinal!==true||report.transactionExecutionStatus!=='FINAL'||
  report.persistedAtLaterFinalizedBlock!==true||
  report.attemptedTransaction!==true||report.failedReceiptCount!==0||
  report.failedCallbackReceiptCount!==0||report.receiptCount!==finalIds.size||
  report.callbackReceiptCount!==callbacks||report.realMainnetExecuted!==false)
  fail('FINAL_RECEIPT_SUMMARY_MISMATCH');
 const actions=actionList(tx);
 const [borrow,liq,repay,withdraw]=actions;
 const sourceRepay=uint(proposal.repay?.amountLendingInternalAtomic);
 const sourceSeize=uint(proposal.seize?.amountLendingInternalAtomic);
 const token=proposal.repay?.tokenId;
 if(proposal.mode!=='RHEA_STAGE35_PINNED_SOURCE_ONLY_LIQUIDATION_SIZING'||
  proposal.chain!=='NEAR_MAINNET'||proposal.executionEnabled!==false||
  proposal.maySign!==false||proposal.mayBroadcast!==false||
  typeof token!=='string'||token!==proposal.seize?.tokenId||
  borrow?.Borrow?.token_id!==token||
  uint(borrow.Borrow.amount)!==sourceRepay||
  liq?.Liquidate?.account_id!==proposal.borrowerAccountId||
  liq?.Liquidate?.in_assets?.length!==1||
  liq?.Liquidate?.out_assets?.length!==1||
  liq.Liquidate.in_assets[0].token_id!==token||
  uint(liq.Liquidate.in_assets[0].max_amount)!==sourceRepay||
  Object.hasOwn(liq.Liquidate.in_assets[0],'amount')||
  liq.Liquidate.out_assets[0].token_id!==token||
  uint(liq.Liquidate.out_assets[0].amount)!==sourceSeize||
  repay?.Repay?.token_id!==token||
  Object.keys(repay.Repay).length!==1||
  withdraw?.Withdraw?.token_id!==token||
  uint(withdraw.Withdraw.max_amount)!==sourceSeize-sourceRepay||
  Object.hasOwn(withdraw.Withdraw,'amount')||sourceSeize<=sourceRepay)
  fail('UNATTESTED_SOURCE_SIZED_ROUTE');
 if(before.borrower.account_id!==proposal.borrowerAccountId||
  after.borrower.account_id!==proposal.borrowerAccountId||
  before.actor.account_id!==tx.signer_id||
  after.actor.account_id!==tx.signer_id||
  settle.borrowerAccountId!==proposal.borrowerAccountId||
  settle.positionId!==proposal.positionId||
  settle.repayTokenId!==token||settle.seizeTokenId!==token)
  fail('POSITION_IDENTITY_MISMATCH');
 const bDebt=position(before.borrower,proposal.positionId,'borrowed',token);
 const aDebt=position(after.borrower,proposal.positionId,'borrowed',token);
 const bColl=position(before.borrower,proposal.positionId,'collateral',token);
 const aColl=position(after.borrower,proposal.positionId,'collateral',token);
 const bFt=uint(before.seizeFt),aFt=uint(after.seizeFt);
 if(bDebt<=aDebt||bColl<=aColl||aFt<=bFt||
  before.repayFt!==before.seizeFt||after.repayFt!==after.seizeFt||
  debt(before.actor)!==0n||debt(after.actor)!==0n)
  fail('ACTUAL_BALANCE_GATES_FAILED');
 const claimed=[
  ['borrowerDebtBeforeInternal',bDebt],['borrowerDebtAfterInternal',aDebt],
  ['borrowerDebtDecreaseInternal',bDebt-aDebt],
  ['borrowerCollateralBeforeInternal',bColl],['borrowerCollateralAfterInternal',aColl],
  ['borrowerCollateralDecreaseInternal',bColl-aColl],
  ['actorSeizeFtBeforeAtomic',bFt],['actorSeizeFtAfterAtomic',aFt],
  ['actorSeizeFtIncreaseAtomic',aFt-bFt],
  ['actorOutstandingDebtBeforeInternal',0n],['actorOutstandingDebtAfterInternal',0n],
  ['actorRepayFtBeforeAtomic',bFt],['actorRepayFtAfterAtomic',aFt],
 ];
 for(const [k,v] of claimed)if(uint(settle[k])!==v)fail('SETTLEMENT_DELTA_MISMATCH');
 if(settle.status!=='POSITION_AND_FT_DELTAS_OBSERVED_UNSOLD'||
  settle.borrowerMutationVerified!==true||settle.assetTransferObserved!==true||
  settle.callbackSuccessObserved!==true||
  settle.mainnetExecutionEnabled!==false||settle.positiveNetProfitVerified!==false||
  phase.status!=='LOCAL_RHEA_BALANCE_AND_CALLBACK_VERIFIED_NOT_PROFIT'||
  phase.actualRheaSettlementVerified!==true||phase.localLiquidationCallInvoked!==true||
  phase.mainnetExecutionEnabled!==false||phase.realMainnetExecuted!==false)
  fail('SETTLEMENT_PHASE_NOT_ATTESTED');
 if(!obj(immediate.borrower)||!obj(immediate.actor)||
  immediate.borrower.account_id!==proposal.borrowerAccountId||
  immediate.actor.account_id!==tx.signer_id||
  immediate.seizeFt!==after.seizeFt||immediate.repayFt!==after.repayFt)
  fail('IMMEDIATE_AND_FINAL_FT_DRIFT');
 const hBefore=num(report.finalizedBlockBefore),hAfter=num(report.finalizedBlockAfter);
 if(hAfter<hBefore+2||
  hBefore!==num(after.finalizedBlockBefore?.header?.height)||
  hAfter!==num(after.finalizedBlockAfter?.header?.height)||
  clock.mode!=='STAGE134_AUTHENTIC_SANDBOX_FINALITY_RECOVERY'||
  clock.initialFinalizedHeight!==hBefore||
  clock.laterFinalizedHeight!==hAfter||
  clock.mainnetExecutionEnabled!==false)
  fail('FINALIZED_HEIGHT_MISMATCH');
 const hashes=Object.fromEntries(names.map(k=>[k,hash(bytes[k])]));
 return {mode:'STAGE135_INDEPENDENT_OFFLINE_RHEA_SANDBOX_PROOF',
  chain:'NEAR_SANDBOX',verification:'ED25519_TRANSACTION_HASH_AND_SELF_CONSISTENT_RECEIPTS_AND_STATE',
  hashBorshPreimageIndependentlyVerified:false,
  outcomeMerkleProofIndependentlyVerified:false,
  fullImportedTrieParityVerified:false,realizedNetProfitVerified:false,
  mainnetExecutionEnabled:false,
  transactionId:tx.hash,signerId:tx.signer_id,
  sourceBlockHeight:proposal.blockHeight,
  borrowerAccountId:proposal.borrowerAccountId,
  finalReceiptCount:finalIds.size,callbackCount:callbacks,
  borrowerDebtDecreaseInternal:(bDebt-aDebt).toString(),
  borrowerCollateralDecreaseInternal:(bColl-aColl).toString(),
  actorFtIncreaseAtomic:(aFt-bFt).toString(),
  actorOutstandingDebtAfterInternal:'0',
  artifactSha256:hashes};
}
export async function verifyStage135Directory(inputDir,outputDir){
 const d={},bytes={};
 for(const n of names){
  const content=await readFile(join(inputDir,n),'utf8');
  if(content.length>10_000_000)fail('OVERSIZED_EVIDENCE');
  bytes[n]=content;d[n]=JSON.parse(content);
 }
 const verified=verifyStage135Bundle(d,bytes);
 await mkdir(outputDir,{recursive:true});
 await writeFile(join(outputDir,'stage135-independent-proof.json'),JSON.stringify(verified,null,2)+'\n');
 return verified;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [dir,dest]=process.argv.slice(2);
 if(!dir||!dest)fail('CLI_NEEDS_INPUT_AND_OUTPUT_DIRECTORIES');
 verifyStage135Directory(dir,dest).then(x=>console.log(JSON.stringify({
  mode:x.mode,transactionId:x.transactionId,finalReceiptCount:x.finalReceiptCount,
  actorFtIncreaseAtomic:x.actorFtIncreaseAtomic
 }))).catch(e=>{console.error(e.message.startsWith('STAGE135_')?e.message:'STAGE135_PROOF_FAILED');process.exitCode=1;});
}

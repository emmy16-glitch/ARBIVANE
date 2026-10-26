import type {SourceLiquidationSizing} from './stage35-atomic-reference-sizing.ts';

/** Stage37: construct an EXACT observed Rhea execute_with_pyth ABI action
 * sequence for an ISOLATED SANDBOX transaction. This is not a mainnet executor.
 * Quantities are protocol-internal lending units, NOT NEP-141 FT transfer units.
 */
const ID=/^[a-z0-9._-]{2,64}$/;
const UINT=/^[1-9][0-9]{0,38}$/;
const U128=(1n<<128n)-1n;
export interface SandboxReplayPlan {
 mode:'ARBIVANE_STAGE37_ISOLATED_SANDBOX_LIQUIDATION_PLAN';
 chain:'NEAR_SANDBOX';mainnetSourceBlockHeight:string;borrowerAccountId:string;
 lendingContract:'contract.main.burrow.near';method:'execute_with_pyth';
 actions:[
  {Borrow:{token_id:string;amount:string}},
  {Liquidate:{account_id:string;in_assets:Array<{token_id:string;amount?:string;max_amount?:string}>;
   out_assets:Array<{token_id:string;amount:string}>}},
  {Withdraw:{token_id:string;amount:string}}
 ] | [
  {Borrow:{token_id:string;amount:string}},
  {Liquidate:{account_id:string;in_assets:Array<{token_id:string;amount?:string;max_amount?:string}>;
   out_assets:Array<{token_id:string;amount:string}>}},
  {Repay:{token_id:string;amount:string}},
  {Withdraw:{token_id:string;amount:string}}
 ];
 depositYocto:'1';gasUnits:'300000000000000';
 sourceCodeHash:string;sourceOracleHash:string;
 sourceMathOnly:true;realContractReplayVerified:false;fullImportedStateVerified:false;
 realWalletAuthorized:false;executionEnabled:false;maySignMainnet:false;mayBroadcastMainnet:false;
}
function amount(v:unknown):string{
 if(typeof v!=='string'||!UINT.test(v)||BigInt(v)>U128)throw Error('INVALID_SANDBOX_INTERNAL_AMOUNT');
 return v;
}
export function buildStage37SandboxPlan(e:SourceLiquidationSizing):SandboxReplayPlan {
 if(!e||e.mode!=='RHEA_STAGE35_PINNED_SOURCE_ONLY_LIQUIDATION_SIZING'||
 e.chain!=='NEAR_MAINNET'||e.status!=='PAPER_SCENARIOS_FOUND_NOT_EXECUTABLE'||
 e.referenceRulesPass!==true||e.contractRouteParityVerified!==false||
 e.rawTokenDenominationsVerified!==false||e.sandboxStateReplaySucceeded!==false||
 e.gasAndSwapNetProfitVerified!==false||e.walletCapitalVerified!==false||
 e.mainnetWalletApproved!==false||e.executionEnabled!==false||
 e.maySign!==false||e.mayBroadcast!==false||
 !e.repay||!e.seize||!e.positionId||
 !ID.test(e.borrowerAccountId)||!ID.test(e.repay.tokenId)||!ID.test(e.seize.tokenId)||
 !/^[1-9][0-9]{0,15}$/.test(e.blockHeight)||
 !/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(e.lendingCodeHash)||
 !/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(e.pythOracleCodeHash)||
 e.repay.shareToActualTokenAtomicConversionVerified!==false||
 e.seize.shareToActualTokenAtomicConversionVerified!==false||
 e.repay.fundsAvailabilityVerified!==false||e.seize.fundsAvailabilityVerified!==false||
 typeof e.referenceInitialHealthBps!=='string'||!/^\d+$/.test(e.referenceInitialHealthBps)||
 BigInt(e.referenceInitialHealthBps)>=10000n)
  throw Error('STAGE37_REQUIRES_VALID_NONEXECUTABLE_STAGE35_REFERENCE_PROPOSAL');
 const repay=amount(e.repay.amountLendingInternalAtomic),seize=amount(e.seize.amountLendingInternalAtomic);
 const sameToken=e.repay.tokenId===e.seize.tokenId;
 // An authentic same-token route can settle the temporary Sandbox borrow
 // INSIDE the same Rhea execute_with_pyth call, then withdraw only the
 // remaining collateral. This is not a flash loan or mainnet authorisation.
 if(sameToken&&BigInt(seize)<=BigInt(repay))
  throw Error('STAGE71_SAME_TOKEN_REQUIRES_POSITIVE_REMAINDER');
 const borrowAction={Borrow:{token_id:e.repay.tokenId,amount:repay}};
 // Rhea's supplied-share conversion can truncate a Borrow of precisely N
  // units slightly below N. In the liquidation repayment leg, `amount:N`
  // is an exact minimum and reverts. `max_amount:N` is an immutable cap:
  // the real contract uses at most its available supplied balance and never
  // repays more than source-approved N; Rhea still enforces all risk rules.
  const liquidationAction={Liquidate:{account_id:e.borrowerAccountId,
  in_assets:[{token_id:e.repay.tokenId,max_amount:repay}],
  out_assets:[{token_id:e.seize.tokenId,amount:seize}]}};
 const actions:SandboxReplayPlan['actions']=sameToken?[
  borrowAction,liquidationAction,{Repay:{token_id:e.repay.tokenId,amount:repay}},
  {Withdraw:{token_id:e.seize.tokenId,amount:(BigInt(seize)-BigInt(repay)).toString()}}
 ]:[
  borrowAction,liquidationAction,{Withdraw:{token_id:e.seize.tokenId,amount:seize}}
 ];
 return {mode:'ARBIVANE_STAGE37_ISOLATED_SANDBOX_LIQUIDATION_PLAN',chain:'NEAR_SANDBOX',
  mainnetSourceBlockHeight:e.blockHeight,borrowerAccountId:e.borrowerAccountId,
  lendingContract:'contract.main.burrow.near',method:'execute_with_pyth',
  actions,
  // Deployed Rhea execute_with_pyth asserts exactly one yoctoNEAR. This is
  // paid by the disposable Sandbox signer, never a mainnet wallet.
  depositYocto:'1',gasUnits:'300000000000000',
  sourceCodeHash:e.lendingCodeHash,sourceOracleHash:e.pythOracleCodeHash,
  sourceMathOnly:true,realContractReplayVerified:false,fullImportedStateVerified:false,
  realWalletAuthorized:false,executionEnabled:false,maySignMainnet:false,mayBroadcastMainnet:false};
}
export interface SandboxResult {
 mode:'ARBIVANE_STAGE37_SANDBOX_RESULT';
 chain:'NEAR_SANDBOX';
 status:'ISOLATED_CALLBACK_SUCCESS_NOT_MAINNET_PROOF'|'SANDBOX_RECEIPT_FAILURE'|
  'BLOCKED_STATE_IMPORT_OR_INCOMPLETE_PROOF'|'ISOLATED_CALLBACK_PENDING_FINALIZED_PERSISTENCE';
 attemptedTransaction:boolean;transactionFinal:boolean;
 transactionExecutionStatus?:'FINAL'|'EXECUTED_OPTIMISTIC';
 persistedAtLaterFinalizedBlock?:boolean;
 finalizedBlockBefore?:number;finalizedBlockAfter?:number;
 receiptCount:number;failedReceiptCount:number;gasBurntGasUnits:string|null;
 callbackReceiptCount?:number;failedCallbackReceiptCount?:number;
 topLevelFailureObserved?:boolean;
 realMainnetExecuted:false;realProfitVerified:false;walletApproved:false;
 executionEnabled:false;mayBroadcastMainnet:false;blockers:string[];
}
/** Canonical NEAR Workspaces callRaw result, including all async receipts. */
export function summarizeStage37SandboxOutcome(
 raw:unknown,inspection:{pinnedConfigMatches:boolean;pinnedBorrowerMatches:boolean;
  importedContractCount:number;allStoredKeysAttested:boolean;
  temporalAccrualVerified?:boolean},
):SandboxResult{
 const base={mode:'ARBIVANE_STAGE37_SANDBOX_RESULT' as const,chain:'NEAR_SANDBOX' as const,
  realMainnetExecuted:false as const,realProfitVerified:false as const,
  walletApproved:false as const,executionEnabled:false as const,mayBroadcastMainnet:false as const};
 if(!inspection.pinnedConfigMatches||
   (!inspection.pinnedBorrowerMatches&&inspection.temporalAccrualVerified!==true)||
   inspection.importedContractCount<3)
  return {...base,status:'BLOCKED_STATE_IMPORT_OR_INCOMPLETE_PROOF' as const,
   attemptedTransaction:false,transactionFinal:false,receiptCount:0,
   failedReceiptCount:0,gasBurntGasUnits:null,
   blockers:['SANDBOX_IMPORT_CONFIG_OR_BORROWER_DID_NOT_MATCH_PINNED_MAINNET']};
 if(!raw||typeof raw!=='object')
  throw Error('INVALID_SANDBOX_CALL_RESULT');
 const v=raw as Record<string,unknown>;
 const result=(v.result&&typeof v.result==='object'?v.result:v) as Record<string,unknown>;
 const receipts=result.receipts_outcome;
 if(!Array.isArray(receipts)||!receipts.length)throw Error('SANDBOX_HAS_NO_FINAL_RECEIPTS');
 // A NEAR promise chain can contain a failed child/callback outcome even
 // when the initiating call's top-level transaction reports SuccessValue.
 // This MUST become a documented failed attempt, not a dropped exception or
 // (worse) a success. Only canonical NEAR outcome status variants are accepted.
 const statuses=new Map<string,Record<string,unknown>>();
 for(const x of receipts){
  if(!x||typeof x!=='object')throw Error('SANDBOX_MALFORMED_RECEIPTS');
  const row=x as Record<string,unknown>;
  if(typeof row.id!=='string'||!row.id||statuses.has(row.id)||
   !row.outcome||typeof row.outcome!=='object')
   throw Error('SANDBOX_MALFORMED_RECEIPTS');
  const st=(row.outcome as Record<string,unknown>).status;
  if(!st||typeof st!=='object'||Array.isArray(st))
   throw Error('SANDBOX_MALFORMED_RECEIPTS');
  const state=st as Record<string,unknown>;
  const variants=['Failure','SuccessValue','SuccessReceiptId'].filter(v=>
   Object.prototype.hasOwnProperty.call(state,v));
  if(variants.length!==1)throw Error('SANDBOX_MALFORMED_RECEIPTS');
  statuses.set(row.id,state);
 }
 const failed=[...statuses.values()].filter(st=>Object.prototype.hasOwnProperty.call(st,'Failure')).length;
 const receiptDefs=result.receipts;
 if(!Array.isArray(receiptDefs)||receiptDefs.length===0)
  throw Error('SANDBOX_CALLBACK_RECEIPT_NOT_PRESENT');
 const callbacks=new Set<string>();
 for(const x of receiptDefs){
  if(!x||typeof x!=='object')continue;
  const row=x as Record<string,unknown>;
  if(typeof row.receipt_id!=='string'||!row.receipt||typeof row.receipt!=='object')continue;
  const action=(row.receipt as Record<string,unknown>).Action;
  if(!action||typeof action!=='object')continue;
  const actions=(action as Record<string,unknown>).actions;
  if(Array.isArray(actions)&&actions.some(a=>a&&typeof a==='object'&&
   (a as Record<string,unknown>).FunctionCall&&
   typeof (a as Record<string,unknown>).FunctionCall==='object'&&
   ((a as Record<string,unknown>).FunctionCall as Record<string,unknown>).method_name==='callback_execute_with_pyth'))
   callbacks.add(row.receipt_id);
 }
 if(callbacks.size===0||[...callbacks].some(id=>!statuses.has(id)))
  throw Error('SANDBOX_CALLBACK_RECEIPT_NOT_ATTESTED');
 const failedCallbacks=[...callbacks].filter(id=>
  Object.prototype.hasOwnProperty.call(statuses.get(id)!,'Failure')).length;
 const status=result.status;
 const final=result.final_execution_status==='FINAL';
 const optimistic=result.final_execution_status==='EXECUTED_OPTIMISTIC';
 if(!final&&!optimistic)throw Error('SANDBOX_RECEIPT_FINALITY_CONTRADICTION');
 if(!status||typeof status!=='object'||Array.isArray(status))
  throw Error('SANDBOX_RECEIPT_FINALITY_CONTRADICTION');
 const variants=['Failure','SuccessValue','SuccessReceiptId'].filter(v=>
  Object.prototype.hasOwnProperty.call(status,v));
 if(variants.length!==1)throw Error('SANDBOX_RECEIPT_FINALITY_CONTRADICTION');
 const overallFail=variants[0]==='Failure';
 // A top-level failure, failed child, or failed callback is an actual rejected
 // asynchronous Sandbox transaction, regardless of the other outcome shapes.
 // Do not leak user/provider exception contents into the evidence.

 const gas=receipts.reduce((n,x)=>{
  const y=(x as {outcome:{gas_burnt:unknown}}).outcome.gas_burnt;
  if((typeof y!=='string'&&typeof y!=='number')||!/^\d+$/.test(String(y)))throw Error('INVALID_SANDBOX_GAS');
  return n+BigInt(y);
 },0n).toString();
 const success=!overallFail&&failed===0;
 return {...base,status:!success?'SANDBOX_RECEIPT_FAILURE':final?
  'ISOLATED_CALLBACK_SUCCESS_NOT_MAINNET_PROOF':'ISOLATED_CALLBACK_PENDING_FINALIZED_PERSISTENCE',
  attemptedTransaction:true,transactionFinal:final,
  transactionExecutionStatus:final?'FINAL':'EXECUTED_OPTIMISTIC',
  persistedAtLaterFinalizedBlock:false,receiptCount:receipts.length,
  failedReceiptCount:failed,callbackReceiptCount:callbacks.size,
  failedCallbackReceiptCount:failedCallbacks,
  topLevelFailureObserved:overallFail,gasBurntGasUnits:gas,
  blockers:[
   ...(!inspection.pinnedBorrowerMatches&&inspection.temporalAccrualVerified===true?
    ['BORROWER_TEMPORAL_ACCRUAL_PROVED_NOT_EXACT_PINNED_VIEW_PARITY']:[]),
   ...(!inspection.allStoredKeysAttested?['FULL_IMPORTED_CONTRACT_STORAGE_KEYSET_NOT_ATTESTED']:[]),
   ...(!success?[
    ...(overallFail?['SANDBOX_TOP_LEVEL_TRANSACTION_FAILED']:[]),
    ...(failedCallbacks>0?['SANDBOX_RHEA_ASYNC_CALLBACK_FAILED']:[]),
    ...(failed>failedCallbacks?['SANDBOX_ASYNC_DEPENDENCY_RECEIPT_FAILED']:[]),
   ]:[]),
   ...(optimistic&&success?['OPTIMISTIC_TRANSACTION_REQUIRES_LATER_FINALIZED_SANDBOX_STATE_PROOF']:[]),
   'SANDBOX_CALL_ALONE_DOES_NOT_PROVE_FINANCING_SWAP_OR_NET_PROFIT',
   'REAL_MAINNET_WALLET_CAPITAL_RISK_LIMITS_AND_SIGNER_NOT_AUTHORIZED',
  ]};
}

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
  {Liquidate:{account_id:string;in_assets:Array<{token_id:string;amount:string}>;
   out_assets:Array<{token_id:string;amount:string}>}},
  {Withdraw:{token_id:string;amount:string}}
 ];
 depositYocto:'0';gasUnits:'300000000000000';
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
 return {mode:'ARBIVANE_STAGE37_ISOLATED_SANDBOX_LIQUIDATION_PLAN',chain:'NEAR_SANDBOX',
  mainnetSourceBlockHeight:e.blockHeight,borrowerAccountId:e.borrowerAccountId,
  lendingContract:'contract.main.burrow.near',method:'execute_with_pyth',
  actions:[
   {Borrow:{token_id:e.repay.tokenId,amount:repay}},
   {Liquidate:{account_id:e.borrowerAccountId,
    in_assets:[{token_id:e.repay.tokenId,amount:repay}],
    out_assets:[{token_id:e.seize.tokenId,amount:seize}]}},
   {Withdraw:{token_id:e.seize.tokenId,amount:seize}},
  ],
  depositYocto:'0',gasUnits:'300000000000000',
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
 realMainnetExecuted:false;realProfitVerified:false;walletApproved:false;
 executionEnabled:false;mayBroadcastMainnet:false;blockers:string[];
}
/** Canonical NEAR Workspaces callRaw result, including all async receipts. */
export function summarizeStage37SandboxOutcome(
 raw:unknown,inspection:{pinnedConfigMatches:boolean;pinnedBorrowerMatches:boolean;
  importedContractCount:number;allStoredKeysAttested:boolean},
):SandboxResult{
 const base={mode:'ARBIVANE_STAGE37_SANDBOX_RESULT' as const,chain:'NEAR_SANDBOX' as const,
  realMainnetExecuted:false as const,realProfitVerified:false as const,
  walletApproved:false as const,executionEnabled:false as const,mayBroadcastMainnet:false as const};
 if(!inspection.pinnedConfigMatches||!inspection.pinnedBorrowerMatches||
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
 const failed=receipts.filter(x=>x&&typeof x==='object'&&
  (x as Record<string,unknown>).outcome&&typeof (x as Record<string,unknown>).outcome==='object'&&
  Object.prototype.hasOwnProperty.call(((x as Record<string,unknown>).outcome as Record<string,unknown>).status??{},'Failure')).length;
 const allValid=receipts.every(x=>x&&typeof x==='object'&&
  (x as Record<string,unknown>).outcome&&typeof (x as Record<string,unknown>).outcome==='object'&&
  typeof ((x as Record<string,unknown>).outcome as Record<string,unknown>).status==='object');
 if(!allValid)throw Error('SANDBOX_MALFORMED_RECEIPTS');
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
 const outcomeIds=new Set(receipts.map(x=>(x as Record<string,unknown>).id));
 if(callbacks.size===0||[...callbacks].some(id=>!outcomeIds.has(id)))
  throw Error('SANDBOX_CALLBACK_RECEIPT_NOT_ATTESTED');
 const status=result.status;
 const final=result.final_execution_status==='FINAL';
 const optimistic=result.final_execution_status==='EXECUTED_OPTIMISTIC';
 if(!final&&!optimistic)throw Error('SANDBOX_RECEIPT_FINALITY_CONTRADICTION');
 const overallFail=!!status&&typeof status==='object'&&Object.prototype.hasOwnProperty.call(status,'Failure');
 if((overallFail&&failed===0)||(!overallFail&&failed>0)||result.status===undefined)
  throw Error('SANDBOX_RECEIPT_FINALITY_CONTRADICTION');
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
  failedReceiptCount:failed,gasBurntGasUnits:gas,
  blockers:[
   ...(!inspection.allStoredKeysAttested?['FULL_IMPORTED_CONTRACT_STORAGE_KEYSET_NOT_ATTESTED']:[]),
   ...(optimistic?['OPTIMISTIC_TRANSACTION_REQUIRES_LATER_FINALIZED_SANDBOX_STATE_PROOF']:[]),
   'SANDBOX_CALL_ALONE_DOES_NOT_PROVE_FINANCING_SWAP_OR_NET_PROFIT',
   'REAL_MAINNET_WALLET_CAPITAL_RISK_LIMITS_AND_SIGNER_NOT_AUTHORIZED',
  ]};
}

/** Stage56: classify REAL Stage37 Sandbox process outcome without allowing
 * an expected, evidenced local rejection to abort authenticated borrower
 * reconciliation. This module cannot sign, send or create transactions.
 */
const PHASES=[
 'SOURCE_ADMISSION','PINNED_SOURCE_VIEWS','SOURCE_REPAY_RESERVE',
 'SANDBOX_STARTUP','SANDBOX_STATE_CLONE','SANDBOX_PYTH_PARITY',
 'SANDBOX_ACTOR_REGISTRATION','SANDBOX_COLLATERAL_FUNDING',
 'SANDBOX_BORROW_CAPACITY','SANDBOX_LIQUIDATION_TRANSACTION',
 'SANDBOX_CALLBACK_RECEIPTS','SANDBOX_FINALIZED_STATE',
 'SANDBOX_BALANCE_SETTLEMENT',
];
const one=(x)=>x&&typeof x==='object'&&!Array.isArray(x);
function safe(report){
 return one(report)&&report.chain==='NEAR_SANDBOX'&&
  report.realMainnetExecuted===false&&report.realProfitVerified===false&&
  report.mayBroadcastMainnet===false;
}
function ledgerSafe(phase){
 return one(phase)&&
  phase.mode==='ARBIVANE_STAGE55_LOCAL_RHEA_EXECUTION_PHASE_WITNESS'&&
  phase.chain==='NEAR_SANDBOX'&&
  phase.mainnetExecutionEnabled===false&&phase.realMainnetExecuted===false&&
  phase.realProfitVerified===false&&phase.maySignMainnet===false&&
  phase.mayBroadcastMainnet===false&&
  PHASES.includes(phase.currentPhase)&&
  Array.isArray(phase.completedPhases)&&phase.completedPhases.length>0&&
  phase.completedPhases.at(-1)===phase.currentPhase&&
  typeof phase.localFundingAttempted==='boolean'&&
  typeof phase.localLiquidationCallInvoked==='boolean';
}
export function classifyStage56SandboxAttempt({exitCode,report,phase,receipt=null,settlement=null}){
 if(!Number.isInteger(exitCode)||![0,2].includes(exitCode)||
  !safe(report)||report.mode!=='ARBIVANE_STAGE37_SANDBOX_RESULT'||
  !ledgerSafe(phase))throw Error('STAGE56_UNVERIFIED_LOCAL_ATTEMPT_EVIDENCE');
 const base={
  mode:'ARBIVANE_STAGE56_EVIDENCED_SANDBOX_ATTEMPT',
  chain:'NEAR_SANDBOX',
  readOnlyMarketContinuationAllowed:true,
  localFundingAttempted:phase.localFundingAttempted,
  localLiquidationCallInvoked:phase.localLiquidationCallInvoked,
  currentPhase:phase.currentPhase,
  observedFailureCode:null,
  realMainnetExecuted:false,
  realProfitVerified:false,
  maySignMainnet:false,mayBroadcastMainnet:false,
 };
 if(exitCode===2){
  if(report.status!=='BLOCKED_STATE_IMPORT_OR_INCOMPLETE_PROOF'||
   phase.status!=='BLOCKED_LOCAL_RHEA_EXECUTION'||
   phase.actualRheaSettlementVerified!==false||
   report.attemptedTransaction!==phase.localLiquidationCallInvoked||
   report.sandboxFundingAttempted!==phase.localFundingAttempted||
   report.stage55Phase!==phase.currentPhase||
   report.stage55ReasonCode!==phase.observedFailureCode||
   typeof phase.observedFailureCode!=='string'||
   !/^(?:STAGE[0-9]{1,3}|SANDBOX|ACTIVE_PYTH|LOCAL_SANDBOX|NEAR_WORKSPACES|INVALID|MISSING)_[A-Z0-9_]{1,115}$/.test(phase.observedFailureCode))
   throw Error('STAGE56_BLOCKED_ATTEMPT_LACKS_TRUSTWORTHY_TERMINAL_PROOF');
  return {...base,status:'BLOCKED_LOCAL_SANDBOX_EXECUTION_NOT_A_TRADE',
   observedFailureCode:phase.observedFailureCode,
   actualRheaSettlementVerified:false,
   claimedRealProfit:false};
 }
 if(exitCode!==0||
  phase.status!=='LOCAL_RHEA_BALANCE_AND_CALLBACK_VERIFIED_NOT_PROFIT'||
  phase.actualRheaSettlementVerified!==true||
  phase.localFundingAttempted!==true||
  phase.localLiquidationCallInvoked!==true||
  phase.currentPhase!=='SANDBOX_BALANCE_SETTLEMENT'||
  report.status!=='ISOLATED_CALLBACK_SUCCESS_NOT_MAINNET_PROOF'||
  report.stage55Status!==phase.status||
  report.borrowerMutationVerified!==true||
  report.assetTransferObserved!==true||
  !one(receipt)||!safe(receipt)||
  receipt.status!=='ISOLATED_CALLBACK_SUCCESS_NOT_MAINNET_PROOF'||
  receipt.persistedAtLaterFinalizedBlock!==true||
  receipt.failedReceiptCount!==0||
  !one(settlement)||settlement.chain!=='NEAR_SANDBOX'||
  settlement.status!=='POSITION_AND_FT_DELTAS_OBSERVED_UNSOLD'||
  settlement.borrowerMutationVerified!==true||
  settlement.assetTransferObserved!==true||
  settlement.positiveNetProfitVerified!==false)
  throw Error('STAGE56_LOCAL_LIQUIDATION_SUCCESS_NOT_PROVEN');
 return {...base,status:'ACTUAL_LOCAL_RHEA_LIQUIDATION_RECEIPTS_AND_BALANCES_VERIFIED',
  actualRheaSettlementVerified:true,claimedRealProfit:false};
}

/** Stage55: evidence-only deterministic execution phase ledger. No RPC,
 * signatures or mainnet mutation. Durable snapshots are written by the runner.
 */
const phases=[
 'SOURCE_ADMISSION',
 'PINNED_SOURCE_VIEWS',
 'SOURCE_REPAY_RESERVE',
 'SANDBOX_STARTUP',
 'SANDBOX_STATE_CLONE',
 'SANDBOX_PYTH_PARITY',
 'SANDBOX_ACTOR_REGISTRATION',
 'SANDBOX_COLLATERAL_FUNDING',
 'SANDBOX_BORROW_CAPACITY',
 'SANDBOX_LIQUIDATION_TRANSACTION',
 'SANDBOX_CALLBACK_RECEIPTS',
 'SANDBOX_FINALIZED_STATE',
 'SANDBOX_BALANCE_SETTLEMENT',
];
const allowedError=/^(STAGE[0-9]{1,3}_[A-Z0-9_]{1,115}|SANDBOX_[A-Z0-9_]{1,115}|ACTIVE_PYTH_[A-Z0-9_]{1,115}|LOCAL_SANDBOX_[A-Z0-9_]{1,115}|NEAR_WORKSPACES_[A-Z0-9_]{1,115}|INVALID_[A-Z0-9_]{1,115}|MISSING_[A-Z0-9_]{1,115})$/;
function codeOf(error){
 const original=error instanceof Error?error.message:'UNKNOWN';
 return allowedError.test(original)?original:'UNCLASSIFIED_RUNTIME_ERROR';
}
export function createStage55PhaseLedger(){
 let current=-1,failed=false,complete=false,attempted=false,funding=false;
 const visited=[];
 function snapshot(status,reasonCode=null){
  return {
   mode:'ARBIVANE_STAGE55_LOCAL_RHEA_EXECUTION_PHASE_WITNESS',
   chain:'NEAR_SANDBOX',status,
   currentPhase:current>=0?phases[current]:null,
   completedPhases:[...visited],phaseCount:visited.length,
   localFundingAttempted:funding,
   localLiquidationTransactionSubmitted:attempted,
   observedFailureCode:reasonCode,
   actualRheaSettlementVerified:complete,
   originalTransactionFinalityVerified:false,
   fullImportedTrieParityVerified:false,
   mainnetExecutionEnabled:false,realMainnetExecuted:false,
   realProfitVerified:false,maySignMainnet:false,mayBroadcastMainnet:false,
  };
 }
 return {
  enter(phase){
   if(failed||complete)throw Error('STAGE55_PHASE_LEDGER_ALREADY_TERMINAL');
   const index=phases.indexOf(phase);
   if(index<0||index<=current)throw Error('STAGE55_NON_MONOTONIC_OR_UNKNOWN_PHASE');
   current=index;visited.push(phase);
   return snapshot('LOCAL_SANDBOX_PHASE_STARTED');
  },
  fundingAttempted(){
   if(failed||complete||current<phases.indexOf('SANDBOX_COLLATERAL_FUNDING'))
    throw Error('STAGE55_INVALID_COLLATERAL_ATTEMPT');
   funding=true;return snapshot('LOCAL_SANDBOX_PHASE_STARTED');
  },
  transactionSubmitted(){
   if(failed||complete||!funding||current<phases.indexOf('SANDBOX_LIQUIDATION_TRANSACTION'))
    throw Error('STAGE55_LIQUIDATION_SUBMISSION_WITHOUT_FUNDING');
   attempted=true;return snapshot('LOCAL_SANDBOX_PHASE_STARTED');
  },
  blocked(error){
   if(complete)throw Error('STAGE55_COMPLETED_CANNOT_BE_BLOCKED');
   failed=true;return snapshot('BLOCKED_LOCAL_RHEA_EXECUTION',codeOf(error));
  },
  finish({receipt,settlement}){
   if(failed||complete||!attempted||
    current!==phases.length-1||
    receipt?.mode!=='ARBIVANE_STAGE37_SANDBOX_RESULT'||
    receipt.chain!=='NEAR_SANDBOX'||
    receipt.status!=='ISOLATED_CALLBACK_SUCCESS_NOT_MAINNET_PROOF'||
    receipt.failedReceiptCount!==0||
    receipt.persistedAtLaterFinalizedBlock!==true||
    receipt.realMainnetExecuted!==false||
    receipt.realProfitVerified!==false||
    receipt.mayBroadcastMainnet!==false||
    settlement?.mode!=='ARBIVANE_STAGE41_SANDBOX_BALANCE_SETTLEMENT_WITNESS'||
    settlement.chain!=='NEAR_SANDBOX'||
    settlement.status!=='POSITION_AND_FT_DELTAS_OBSERVED_UNSOLD'||
    settlement.borrowerMutationVerified!==true||
    settlement.assetTransferObserved!==true||
    settlement.callbackSuccessObserved!==true||
    settlement.positiveNetProfitVerified!==false||
    settlement.mayBroadcastMainnet!==false)
    throw Error('STAGE55_UNATTESTED_SANDBOX_LIQUIDATION_NOT_COMPLETED');
   complete=true;
   return snapshot('LOCAL_RHEA_BALANCE_AND_CALLBACK_VERIFIED_NOT_PROFIT');
  },
 };
}
export const STAGE55_PHASES=Object.freeze([...phases]);

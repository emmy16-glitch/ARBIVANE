import {stage142VerifyIntentIntegrity} from './stage142-financing-intent.mjs';
import {stage143OpenJournal,stage143ApplyEvent,stage143InspectJournal}
 from './stage143-async-financing-journal.mjs';

/** Stage144: a fully deterministic ISOLATED FINANCING MODEL.
 * It does NOT spin up NEAR Workspaces, move NEP-141 tokens or attest an actual
 * third-party funded Rhea transaction. True partner-funded *on-chain*
 * acceptance remains intentionally BLOCKED until a real funding source exists.
 */
const cap=(v,name)=>{
 if(typeof v!=='string'||!/^(0|[1-9][0-9]{0,38})$/.test(v)||
  BigInt(v)>(1n<<128n)-1n)throw Error('STAGE144_INVALID_'+name);
 return BigInt(v);
};
function event(journal,kind,atomic,reason){
 return stage143ApplyEvent(journal,{
  seq:journal.sequence+1,previousHeadHash:journal.headHash,
  kind,receiptId:'synthetic-step-'+String(journal.sequence+1).padStart(2,'0'),
  observedAtomic:String(atomic),...(reason?{reason}:{})
 });
}
export function stage144SimulatePartnerFundedRhea(intent,{
 partnerActualSimulatedBalanceAtomic,liquidationProceedsAtomic,
 gasAndStorageCostAtomic,swapCostAtomic,injectFailureAt=null
}){
 if(!stage142VerifyIntentIntegrity(intent)||
  intent.financingMode!=='AUTHORIZED_PARTNER_ESCROW')
  throw Error('STAGE144_REQUIRES_VALID_OFFLINE_PARTNER_ESCROW_INTENT');
 const principal=cap(intent.principalAtomic,'PRINCIPAL'),
  premium=cap(intent.premiumAtomic,'PREMIUM');
 const partner=cap(partnerActualSimulatedBalanceAtomic,'PARTNER_STARTING_BALANCE'),
  proceeds=cap(liquidationProceedsAtomic,'LIQUIDATION_PROCEEDS'),
  gas=cap(gasAndStorageCostAtomic,'ACTUAL_GAS_COST'),
  swap=cap(swapCostAtomic,'ACTUAL_SWAP_COST'),
  minimum=cap(intent.minimumNetAtomic,'MINIMUM_NET');
 if(partner<principal+premium)
  throw Error('STAGE144_PARTNER_CANNOT_FINANCE_LOAN_AND_PREMIUM');
 if(gas>cap(intent.maxGasAndStorageAtomic,'GAS_BUDGET')||
  swap>cap(intent.maxSwapAndSlippageAtomic,'SLIPPAGE_BUDGET'))
  throw Error('STAGE144_EXCEEDED_QUOTED_NETWORK_OR_SWAP_COSTS');
 if(injectFailureAt!==null&&!['LIQUIDATION_CALLBACK_FINAL',
  'REPAYMENT_TRANSFER_FINAL','ASSET_CONVERSION_FINAL'].includes(injectFailureAt))
  throw Error('STAGE144_INVALID_FAILURE_POINT');
 let j=stage143OpenJournal(intent);
 j=event(j,'FUNDS_ISSUED',principal);
 const stages=['LIQUIDATION_CALLBACK_FINAL','REPAYMENT_TRANSFER_FINAL',
  'ASSET_CONVERSION_FINAL'];
 const borrowedDue=principal+premium;
 let issued=principal;
 let repaid=0n;
 let remainingOnActor=principal;
 let recoverable=0n;
 for(const step of stages){
  if(step===injectFailureAt){
   j=event(j,'FAILED',0n,'SIMULATED_'+step+'_FAILED');
   break;
  }
  if(step==='LIQUIDATION_CALLBACK_FINAL'){
   // Model the proceeds reaching the actor; in an actual proof these are
   // multiple async FT transfer/contract receipts and must be attested.
   issued=proceeds;
   remainingOnActor=proceeds;
   j=event(j,step,0n);
  }else if(step==='REPAYMENT_TRANSFER_FINAL'){
   if(remainingOnActor<borrowedDue){
    j=event(j,'FAILED',0n,'SIMULATED_REPAYMENT_INSUFFICIENT');
    break;
   }
   remainingOnActor-=borrowedDue;
   repaid=borrowedDue;
   j=event(j,step,borrowedDue);
  }else{
   if(remainingOnActor<gas+swap+minimum){
    j=event(j,'FAILED',0n,'SIMULATED_NET_BELOW_FLOOR');
    break;
   }
   remainingOnActor-=gas+swap;
   recoverable=remainingOnActor;
   j=event(j,step,0n);
   j=event(j,'RECONCILED',0n);
  }
 }
 const inspect=stage143InspectJournal(j);
 // Simulated bookkeeping invariant: a credit out of the partner treasury
 // occurs once; repay may or may not occur. No source of real NEP141 exists.
 const partnerClosing=partner-principal+repaid;
 if(partnerClosing<0n)throw Error('STAGE144_NEGATIVE_PARTNER_BOOK');
 return {
  mode:'STAGE144_PARTNER_FINANCING_ACCOUNTING_SANDBOX',
  network:'LOCAL_IN_MEMORY_ONLY_NOT_NEAR_SANDBOX',
  financingMode:intent.financingMode,intentHash:intent.intentHash,
  result:inspect.offlineSimulationReconciled?
   'SIMULATED_FULLY_RECONCILED_NOT_REAL_RHEA':'SIMULATED_FAILURE_NEEDS_RECOVERY',
  simulatedPartnerInitialAtomic:partner.toString(),
  simulatedPartnerClosingAtomic:partnerClosing.toString(),
  simulatedRepaymentAtomic:repaid.toString(),
  simulatedResidualActorAtomic:recoverable.toString(),
  simulatedRevenueBeforeGasAndSwapAtomic:issued.toString(),
  outstandingLiabilityAtomic:inspect.outstandingLiabilityAtomic,
  recoveryRequired:inspect.recoveryRequired,
  state:inspect.state,journalHeadHash:j.headHash,
  journal:j,
  ownerSuppliedCollateralAtomic:'0',
  // A partner's initial balance plus a model cannot prove a partner
  // transferred anything to a real NEAR contract.
  realPartnerCapitalObserved:false,realNearWorkspacesExecution:false,
  actualRheaLiquidationCallbackVerified:false,
  actualExternalRepaymentVerified:false,actualNetProfitVerified:false,
  confirmedPayoutToOwner:false,maySignMainnet:false,mayBroadcastMainnet:false,
  blockers:[
   'PARTNER_TOKENS_AND_SIGNED_AGREEMENT_NOT_PRESENT',
   'NO_PARTNER_FUNDED_RHEA_WORKSPACES_RECEIPT_TREE',
   'REAL_LENDER_AND_LIQUIDATOR_FT_BALANCE_DELTAS_UNVERIFIED',
   'REAL_SWAP_GAS_AND_FINAL_NET_PROCEEDS_UNVERIFIED',
   'THIRD_PARTY_CAPITAL_AND_RECOVERY_NOT_AUDITED'
  ]
 };
}

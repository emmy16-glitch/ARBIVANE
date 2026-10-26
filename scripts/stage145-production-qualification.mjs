import {stage142VerifyIntentIntegrity} from './stage142-financing-intent.mjs';
import {stage143InspectJournal} from './stage143-async-financing-journal.mjs';

/** Stage145 production-readiness checklist. Deliberately non-authoritative:
 * NO amount of user-asserted booleans can grant wallet/signing capabilities.
 * A separate audited signer, formal owner instruction and chain attestations
 * would need independent implementations and authorizations.
 */
const REQUIRED=Object.freeze([
 ['DEMONSTRATE_REAL_PROVIDER','LIVE_PROVIDER_CODE_ABI_ASSET_AND_RESERVE_NOT_ATTESTED'],
 ['PROVE_PARTNER_OR_FLASH_PRINCIPAL','THIRD_PARTY_FUNDING_NOT_OBSERVED'],
 ['PROVE_ASYNC_REPAYMENT','LENDER_ASYNC_CALLBACK_FAILURE_RECOVERY_NOT_PROVEN'],
 ['VERIFY_REAL_RHEA_WORKSPACES','FULL_EXTERNAL_FINANCED_RHEA_SANDBOX_TRANSACTION_MISSING'],
 ['VERIFY_ONCHAIN_TOKEN_DELTAS','ORIGINAL_EXTERNAL_LOAN_AND_SETTLEMENT_RECEIPTS_MISSING'],
 ['VERIFY_TRADABLE_PROCEEDS','EXECUTABLE_SWAP_FEES_GAS_AND_FINAL_NET_NOT_ATTESTED'],
 ['VERIFY_GAS_SPONSOR','GAS_AND_STORAGE_SPONSOR_NOT_CONTRACTUALLY_CONFIRMED'],
 ['VERIFY_INDEPENDENT_AUDIT','THIRD_PARTY_VAULT_AND_SIGNER_SECURITY_AUDIT_MISSING'],
 ['VERIFY_OWNER_APPROVAL','OWNER_MAINNET_CUSTODY_RESTRICTIONS_NOT_APPROVED'],
 ['VERIFY_DEPLOYMENT_LIMITS','HARD_CODED_ONCHAIN_SPEND_CAPS_NOT_DEPLOYED']
]);
export function stage145ProductionReview({financingIntent,journal,localSimulation,
 assertions={}}){
 if(!stage142VerifyIntentIntegrity(financingIntent))
  throw Error('STAGE145_INVALID_STAGE142_FINANCING_INTENT');
 if(localSimulation?.intentHash!==financingIntent.intentHash||
  localSimulation.mode!=='STAGE144_PARTNER_FINANCING_ACCOUNTING_SANDBOX'||
  localSimulation.realNearWorkspacesExecution!==false||
  localSimulation.maySignMainnet!==false)
  throw Error('STAGE145_UNTRUSTED_OR_NONMATCHING_PARTNER_SIMULATION');
 let inspection;
 try{inspection=stage143InspectJournal(journal);}
 catch{throw Error('STAGE145_INVALID_STAGE143_JOURNAL');}
 if(journal.intentHash!==financingIntent.intentHash||
  journal.headHash!==localSimulation.journalHeadHash||
  journal.sequence!==localSimulation.journal?.sequence)
  throw Error('STAGE145_INCONSISTENT_FINANCING_PROOF_CHAIN');
 const warnings=REQUIRED.map(([gate,reason])=>({gate,
  claimedByOperator:assertions?.[gate]===true,
  independentlyVerified:false,
  status:'BLOCKED_NO_EXTERNAL_PROOF',
  reason
 }));
 if(localSimulation.recoveryRequired||inspection.recoveryRequired)
  warnings.unshift({gate:'RESOLVE_ACTIVE_SIMULATED_LIABILITY',
   claimedByOperator:false,independentlyVerified:false,status:'BLOCKED',
   reason:'SIMULATED_FINANCING_STILL_FAILED_OR_UNPAID'});
 if(financingIntent.financingMode==='EXTERNAL_FLASH_LOAN')
  warnings.unshift({gate:'GATE_TYPE_MISMATCH',claimedByOperator:false,
   independentlyVerified:false,status:'BLOCKED',reason:
    'STAGE144_ONLY_SIMULATES_PARTNER_ESCROW_NOT_NATIVE_FLASH_LOANS'});
 return {
  mode:'STAGE145_MAINNET_PRODUCTION_READINESS',
  network:'NEAR_MAINNET',financingIntentHash:financingIntent.intentHash,
  evaluatedFrom:{
   stage142OfflineIntentVerified:true,stage143OfflineHashChainVerified:true,
   stage144LocalDeterministicSimulationOnly:true,
   stage144ExternalFundsVerified:false,
   stage141VerifiedLiveLinearFlashLender:false
  },
  status:'BLOCKED_NO_VERIFIED_EXTERNAL_FINANCING_OR_SPEND_AUTHORIZATION',
  requiredGateCount:warnings.length,
  gates:warnings,canActivateMainnet:false,
  maySignMainnet:false,mayBroadcastMainnet:false,
  canInitiateFlashLoan:false,canReleaseOwnerProfit:false,
  ownerAccount:'okunlola_labs.near',
  proposedRestrictedExecutor:'sillywiki4201.near',
  neverTreatSelfReportedClaimsAsEvidence:true,
  realProfitPaid:false
 };
}

/** Stage154 — source-evidence-only loan-size economics.
 * REJECT, rather than "fix", a 100-token loan whose authentic Rhea accrued
 * interest exceeds the proven tiny borrower's seized LiNEAR surplus.
 * All inputs must be the ORIGINAL signed local Workspaces evidence, plus the
 * contract's exact withdraw_succeeded events, not illustrative fixtures.
 * Not a mainnet PnL model, validator proof, flash lender or trading authority.
 */
import {readFile,writeFile} from 'node:fs/promises';
const UINT=/^(0|[1-9][0-9]{0,38})$/;
const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const amt=(s,label)=>{
 if(typeof s!=='string'||!UINT.test(s))throw Error('STAGE154_INVALID_'+label);
 return BigInt(s);
};
const contract='contract.main.burrow.near';
export function stage154ExtractActorWithdrawals(text,accountId){
 if(typeof text!=='string'||!/^[-._a-z0-9]{2,64}$/.test(accountId))
  throw Error('STAGE154_UNTRUSTED_ORIGINAL_RECEIPT_LOG');
 const out=[];
 for(const line of text.split(/\r?\n/)){
  const marker='EVENT_JSON:';
  if(!line.includes(marker)||!line.includes('Log ['+contract+']'))continue;
  let event;
  try{event=JSON.parse(line.split(marker)[1]);}catch{
   throw Error('STAGE154_MALFORMED_ORIGINAL_RHEA_EVENT');
  }
  if(event.event!=='withdraw_succeeded')continue;
  if(!Array.isArray(event.data)||event.data.length!==1)
   throw Error('STAGE154_UNEXPECTED_RHEA_EVENT_SHAPE');
  const row=event.data[0];
  if(row.account_id===accountId){
   if(row.token_id!=='linear-protocol.near')
    throw Error('STAGE154_WRONG_WITHDRAWN_TOKEN');
   out.push(amt(row.amount,'RHEA_WITHDRAW_EVENT'));
  }
 }
 if(out.length!==2||out.some(n=>n===0n))
  throw Error('STAGE154_BORROWER_WITHDRAW_AND_UNUSED_RECLAIM_NOT_BOTH_PROVEN');
 return {seizedFtAtomic:out[0].toString(),
  returnedUnusedFtAtomic:out[1].toString()};
}
export function stage154AuditOriginalLoan({evidence,log,sourceRunId}){
 if(!evidence||typeof evidence!=='object'||evidence.chain!=='NEAR_SANDBOX'||
  evidence.mode!=='STAGE146_REAL_LOCAL_WORKSPACES_PARTNER_FINANCING_ATTEMPT'||
  evidence.stage150LargeFundingEnabled!==true||
  evidence.stage150RemainingRheaSupplyReclaimed!==true||
  evidence.stage150BorrowedFtLargeAmountVerified!==true||
  evidence.maySignMainnet!==false||evidence.mayBroadcastMainnet!==false||
  evidence.mainnetWalletsTouched!==false||evidence.actualFlashLoan!==false||
  evidence.realizedNetEconomicProfitVerified!==false||
  typeof sourceRunId!=='string'||!/^403[0-9]{8}$/.test(sourceRunId))
  throw Error('STAGE154_UNTRUSTED_SANDBOX_ECONOMIC_EVIDENCE');
 const proofs=evidence.receiptProofs??{};
 const kinds={
  partnerBorrow:'finalCallbackReceiptsVerified',
  issue:'finalFtReceiptsVerified',supply:'finalFtReceiptsVerified',
  rheaLiquidate:'finalCallbackReceiptsVerified',
  stage150ReturnUnusedSupply:'finalCallbackReceiptsVerified',
  repayPartner:'finalFtReceiptsVerified',repayRhea:'finalFtReceiptsVerified'
 };
 const txs=[];
 for(const [kind,flag] of Object.entries(kinds)){
  const proof=proofs[kind];
  if(proof?.[flag]!==true||proof?.finalExecutionStatus!=='FINAL'||
   !HASH.test(proof.transactionHash??'')||
   !Array.isArray(proof.receiptIds)||proof.receiptIds.length<1||
   !Number.isSafeInteger(proof.receiptsWithoutFailure)||proof.receiptsWithoutFailure<1)
   throw Error('STAGE154_MISSING_FINAL_SIGNED_'+kind.toUpperCase());
  txs.push(proof.transactionHash);
 }
 if(new Set(txs).size!==txs.length)
  throw Error('STAGE154_DUPLICATE_SIGNED_TRANSACTION');
 const principal=amt(evidence.observedPartnerToLiquidatorTransferAtomic,'PRINCIPAL');
 if(principal<1n*10n**24n||principal>100n*10n**24n||
  principal!==amt(evidence.observedLiquidatorDepositAtomic,'ACTOR_RHEA_SUPPLY')||
  principal!==amt(evidence.observedLiquidatorToPartnerRepaymentAtomic,'PRINCIPAL_RETURN')||
  amt(evidence.observedLiquidationDebtDecreaseShares,'BORROWER_DEBT_DECREASE')===0n||
  amt(evidence.observedLiquidationCollateralDecreaseShares,'BORROWER_COLLATERAL_DECREASE')===0n)
  throw Error('STAGE154_LIQUIDATION_OR_PRINCIPAL_NOT_CONSERVED');
 const withdrawn=stage154ExtractActorWithdrawals(log,evidence.liquidatorAccountId);
 const unused=amt(withdrawn.returnedUnusedFtAtomic,'WITHDRAWN_UNUSED');
 if(unused!==amt(evidence.stage150ActualReturnedUnusedSupplyAtomic,
  'ORIGINAL_UNUSED_SUPPLY_PROOF'))throw Error('STAGE154_RHEA_UNUSED_SUPPLY_MISMATCH');
 const seized=amt(withdrawn.seizedFtAtomic,'SEIZED');
 const accrued=amt(evidence.observedPartnerDebtDustBeforeAtomic,'FINANCING_DEBT');
 const afterPrincipal=seized+unused-principal;
 if(afterPrincipal<0n)throw Error('STAGE154_LOAN_PRINCIPAL_NOT_ACTUALLY_RETURNABLE');
 const netAfterAccrual=afterPrincipal-accrued;
 const additional=amt(evidence.observedPartnerAdditionalDebtPaymentAtomic,'ACTUAL_EXTRA_REPAY');
 const debtShares=amt(evidence.observedPartnerRemainingRheaDebtShares,'PARTNER_DEBT_SHARES');
 const observedFullClose=debtShares===0n&&
  evidence.partnerAccruedDebtDustClosed===true&&
  evidence.status==='ACTUAL_LOCAL_PARTNER_FINANCED_RHEA_AND_FT_REPAYMENT_VERIFIED'&&
  evidence.phase==='FINISHED'&&additional>0n;
 if(netAfterAccrual>0n&&!observedFullClose)
  throw Error('STAGE154_POSITIVE_ESTIMATE_WITHOUT_VERIFIED_ZERO_PARTNER_DEBT');
 if(observedFullClose){
  const actor=amt(evidence.finalActorWalletResidualAtomic,'FINAL_ACTOR_WALLET');
  if(actor===0n||actor>netAfterAccrual||additional<accrued)
   throw Error('STAGE154_FINAL_SETTLEMENT_NOT_RECONCILED');
 }
 return {
  mode:'STAGE154_GENUINE_HISTORICAL_SANDBOX_LOAN_SIZING_AUDIT',
  network:'NEAR_SANDBOX',originalGitHubRunId:sourceRunId,
  borrower:evidence.borrowerAccountId,
  originalReceiptHashes:txs,
  partnerPrincipalAtomic:principal.toString(),
  seizedFromRheaFtAtomic:seized.toString(),
  unusedSupplyReclaimedFtAtomic:unused.toString(),
  availableToRepayFundingCostAtomic:afterPrincipal.toString(),
  accruedRheaDebtAfterPrincipalAtomic:accrued.toString(),
  estimatedResidualAfterRheaDebtAtomic:netAfterAccrual.toString(),
  observedPartnerRemainingDebtShares:debtShares.toString(),
  originalLocalEndToEndRepaid:observedFullClose,
  financingEconomicallyCoveredByThisBorrower:observedFullClose&&netAfterAccrual>0n,
  status:observedFullClose&&netAfterAccrual>0n?
   'HISTORICAL_LOCAL_TOKENS_SUFFICIENT_AFTER_FINANCING':
   'BLOCKED_FINANCING_COST_EXCEEDS_SOURCE_LIQUIDATION',
  historicSyntheticTimingNotProduction:true,
  actualFlashLoan:false,realMainnetFinancing:false,
  realizedNetEconomicProfitVerified:false,
  ownerPayoutEnabled:false,mayBroadcastMainnet:false
 };
}
async function main(){
 const [mode,a,b]=process.argv.slice(2);
 if(mode!=='--original-evidence'||!a||!b||
  !a.endsWith('/stage146-actual-partner-evidence.json')||
  !b.endsWith('/stage146-workspaces-runner.log')||
  !/^403[0-9]{8}$/.test(process.env.STAGE154_ORIGINAL_RUN_ID??''))
  throw Error('STAGE154_ORIGINAL_EVIDENCE_ARTIFACT_REQUIRED');
 const [report,log]=await Promise.all([
  readFile(a,'utf8').then(JSON.parse),readFile(b,'utf8')
 ]);
 const result=stage154AuditOriginalLoan({evidence:report,log,
  sourceRunId:process.env.STAGE154_ORIGINAL_RUN_ID});
 const out='stage154-original-funding-admission.json';
 await writeFile(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({status:result.status,network:result.network,
  sourceRunId:result.originalGitHubRunId,blocker:result.status.startsWith('BLOCKED'),
  netAfterAccrual:result.estimatedResidualAfterRheaDebtAtomic}));
}
if(process.argv[1]?.endsWith('stage154-real-funding-admission.mjs'))
 main().catch(e=>{console.error(e.message);process.exitCode=1;});

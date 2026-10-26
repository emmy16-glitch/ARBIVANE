import {createHash} from 'node:crypto';
import {stage142VerifyIntentIntegrity} from './stage142-financing-intent.mjs';

/** Stage143 append-only, *offline* NEAR promise/financing state model.
 * Observations here are NOT chain-verified receipts. No event can enable
 * mainnet signing, promise refund, authorize payout or erase a liability.
 */
const flow=['CREATED','FUNDS_ISSUED','LIQUIDATION_CALLBACK_FINAL',
 'REPAYMENT_TRANSFER_FINAL','ASSET_CONVERSION_FINAL','RECONCILED'];
const transitions=Object.freeze({
 CREATED:['FUNDS_ISSUED','FAILED'],
 FUNDS_ISSUED:['LIQUIDATION_CALLBACK_FINAL','FAILED'],
 LIQUIDATION_CALLBACK_FINAL:['REPAYMENT_TRANSFER_FINAL','FAILED'],
 REPAYMENT_TRANSFER_FINAL:['ASSET_CONVERSION_FINAL','FAILED'],
 ASSET_CONVERSION_FINAL:['RECONCILED','FAILED'],
 RECONCILED:[],FAILED:[]
});
const HEX=/^[a-f0-9]{64}$/;
const sha=o=>createHash('sha256').update(JSON.stringify(o)).digest('hex');
const freeze=o=>Object.freeze(o);
export function stage143OpenJournal(intent){
 if(!stage142VerifyIntentIntegrity(intent)||intent.maySignMainnet!==false)
  throw Error('STAGE143_INVALID_OR_TAMPERED_FINANCING_INTENT');
 const seed={intentHash:intent.intentHash,financingMode:intent.financingMode,
  state:'CREATED',sequence:0,events:[],outstandingLiabilityAtomic:'0',
  simulatedReceiptsOnly:true,realReceiptsCryptographicallyVerified:false,
  mainnetExecutionApproved:false,maySignMainnet:false,mayBroadcastMainnet:false,
  profitTransferred:false,profitPayoutPermitted:false,
  failureReason:null,halted:false};
 return freeze({...seed,headHash:sha(seed)});
}
function validate(journal){
 if(!journal||journal.maySignMainnet!==false||
  journal.mayBroadcastMainnet!==false||journal.profitPayoutPermitted!==false||
  journal.simulatedReceiptsOnly!==true)throw Error('STAGE143_JOURNAL_AUTHORITY_FORGED');
 const {headHash,...body}=journal;
 if(!HEX.test(headHash??'')||sha(body)!==headHash)
  throw Error('STAGE143_JOURNAL_INTEGRITY_INVALID');
 if(!Array.isArray(journal.events)||journal.events.length!==journal.sequence)
  throw Error('STAGE143_NONCANONICAL_EVENT_SEQUENCE');
}
function amount(x,name){
 if(typeof x!=='string'||!/^(0|[1-9][0-9]{0,38})$/.test(x)||
  BigInt(x)>(1n<<128n)-1n)
  throw Error('STAGE143_INVALID_'+name);
 return BigInt(x);
}
export function stage143ApplyEvent(journal,event){
 validate(journal);
 if(!event||typeof event!=='object'||Array.isArray(event)||
  Object.keys(event).some(k=>!['seq','previousHeadHash','kind','receiptId',
   'observedAtomic','reason'].includes(k)))
  throw Error('STAGE143_INVALID_EVENT_SHAPE');
 if(event.seq!==journal.sequence+1||
  event.previousHeadHash!==journal.headHash)
  throw Error('STAGE143_DUPLICATE_OR_OUT_OF_ORDER_EVENT');
 if(!transitions[journal.state]?.includes(event.kind))
  throw Error('STAGE143_ILLEGAL_STATE_TRANSITION');
 if(typeof event.receiptId!=='string'||!/^[A-Za-z0-9._:-]{6,128}$/.test(event.receiptId)||
  journal.events.some(x=>x.receiptId===event.receiptId))
  throw Error('STAGE143_MISSING_OR_REPLAYED_RECEIPT_REFERENCE');
 if(event.kind==='FAILED'&&
  (typeof event.reason!=='string'||!/^[A-Z0-9_]{8,80}$/.test(event.reason)))
  throw Error('STAGE143_FAILURE_MUST_BE_EXPLICIT');
 if(event.kind!=='FAILED'&&event.reason!==undefined)
  throw Error('STAGE143_UNEXPECTED_FAILURE_REASON');
 let liability=amount(journal.outstandingLiabilityAtomic,'CURRENT_LIABILITY');
 const supplied=amount(event.observedAtomic,'SIMULATED_AMOUNT');
 if(event.kind==='FUNDS_ISSUED'){
  if(supplied===0n)throw Error('STAGE143_ZERO_SIMULATED_PRINCIPAL');
  liability=supplied;
 }else if(event.kind==='REPAYMENT_TRANSFER_FINAL'){
  if(liability===0n||supplied<liability)
   throw Error('STAGE143_UNPAID_FINANCING_LIABILITY');
  liability=0n;
 }else if(event.kind==='RECONCILED'){
  if(liability!==0n||journal.state!=='ASSET_CONVERSION_FINAL')
   throw Error('STAGE143_CANNOT_RECONCILE_OPEN_LIABILITY');
 }else if(event.kind==='FAILED'){
  // The outstanding debt is preserved; caller must do deliberate
  // incident response, never silently mark refunded or restart.
 }else if(supplied!==0n){
  throw Error('STAGE143_NON_MONETARY_EVENT_AMOUNT_MUST_BE_ZERO');
 }
 const record=freeze({...event,sequence:event.seq,
  headBefore:journal.headHash,context:'SIMULATION_NOT_ATTESTED_NEAR_RECEIPT'});
 const next={...journal,events:freeze([...journal.events,record]),
  state:event.kind,sequence:event.seq,
  outstandingLiabilityAtomic:liability.toString(),
  failureReason:event.kind==='FAILED'?event.reason:null,
  halted:event.kind==='FAILED',
  // No event can transfer actual profit or attest external funds.
  simulatedReceiptsOnly:true,realReceiptsCryptographicallyVerified:false,
  profitTransferred:false,profitPayoutPermitted:false,
  mainnetExecutionApproved:false,maySignMainnet:false,mayBroadcastMainnet:false};
 delete next.headHash;
 return freeze({...next,headHash:sha(next)});
}
export function stage143Replay(intent,events){
 let journal=stage143OpenJournal(intent);
 if(!Array.isArray(events)||events.length>20)throw Error('STAGE143_INVALID_EVENT_LIST');
 for(const e of events)journal=stage143ApplyEvent(journal,e);
 return journal;
}
export function stage143InspectJournal(journal){
 validate(journal);
 return {state:journal.state,sequence:journal.sequence,
  outstandingLiabilityAtomic:journal.outstandingLiabilityAtomic,
  recoveryRequired:journal.state==='FAILED'||journal.outstandingLiabilityAtomic!=='0',
  offlineSimulationReconciled:journal.state==='RECONCILED',
  realMoneyEarned:false,profitPayoutPermitted:false,
  mainnetBroadcastPermitted:false};
}

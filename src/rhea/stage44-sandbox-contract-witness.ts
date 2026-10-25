/** Stage44 attests an ACTUAL local Sandbox contract state transition.
 * No imported Rhea action, swap, signer on mainnet, or profit is involved.
 */
export interface Stage44SandboxContractReport {
 mode:'ARBIVANE_STAGE44_EXECUTABLE_LOCAL_SANDBOX_WITNESS';
 chain:'NEAR_SANDBOX';status:'LOCAL_CONTRACT_TRANSACTION_AND_STATE_CHANGE_VERIFIED';
 contractAccountId:string;actorAccountId:string;
 initialMessage:null;finalMessage:string;
 transactionFinal:true;transactionSucceeded:true;receiptCount:number;
 failedReceiptCount:0;gasBurntGasUnits:string;
 contractStateMutationVerified:true;realRheaLiquidationAttempted:false;
 rheaContractParityVerified:false;liquidationEligibilityVerified:false;
 financingVerified:false;profitVerified:false;
 executionEnabled:false;maySignMainnet:false;mayBroadcastMainnet:false;
 blockers:string[];
}
const ID=/^[a-z0-9._-]{2,64}$/;
function record(x:unknown,label:string):Record<string,unknown>{
 if(!x||typeof x!=='object'||Array.isArray(x))
  throw Error('STAGE44_INVALID_'+label);
 return x as Record<string,unknown>;
}
/** Works with the near-workspaces TransactionResult wrapper or its inner outcome. */
export function attestStage44LocalContractExecution(input:{
 transaction:unknown;actorAccountId:string;contractAccountId:string;
 before:unknown;after:unknown;expectedMessage:string;
}):Stage44SandboxContractReport {
 if(!ID.test(input.actorAccountId)||!ID.test(input.contractAccountId)||
  input.actorAccountId===input.contractAccountId||
  typeof input.expectedMessage!=='string'||
  !/^ARBIVANE_STAGE44_[A-Z0-9_]{1,60}$/.test(input.expectedMessage)||
  input.before!==null||input.after!==input.expectedMessage)
  throw Error('STAGE44_CONTRACT_STATE_TRANSITION_NOT_VERIFIED');
 const wrapper=record(input.transaction,'TRANSACTION');
 const result=record(wrapper.result??wrapper,'FINAL_OUTCOME');
 const status=record(result.status,'FINAL_STATUS');
 if(result.final_execution_status!=='FINAL'||!Object.hasOwn(status,'SuccessValue')||
  Object.hasOwn(status,'Failure'))
  throw Error('STAGE44_TRANSACTION_NOT_FINAL_SUCCESS');
 const outcomes=result.receipts_outcome;
 if(!Array.isArray(outcomes)||outcomes.length===0||outcomes.length>128)
  throw Error('STAGE44_MISSING_RECEIPTS');
 let gas=0n;
 for(const part of outcomes){
  const receipt=record(part,'RECEIPT'),outcome=record(receipt.outcome,'RECEIPT_OUTCOME');
  const state=record(outcome.status,'RECEIPT_STATUS');
  if(Object.hasOwn(state,'Failure')||
   (!Object.hasOwn(state,'SuccessValue')&&!Object.hasOwn(state,'SuccessReceiptId')))
   throw Error('STAGE44_RECEIPT_FAILED_OR_NOT_FINAL');
  const amount=outcome.gas_burnt;
  if((typeof amount!=='string'&&typeof amount!=='number')||
   !/^(0|[1-9][0-9]{0,25})$/.test(String(amount)))
   throw Error('STAGE44_INVALID_RECEIPT_GAS');
  gas+=BigInt(amount);
 }
 return {
  mode:'ARBIVANE_STAGE44_EXECUTABLE_LOCAL_SANDBOX_WITNESS',
  chain:'NEAR_SANDBOX',status:'LOCAL_CONTRACT_TRANSACTION_AND_STATE_CHANGE_VERIFIED',
  contractAccountId:input.contractAccountId,actorAccountId:input.actorAccountId,
  initialMessage:null,finalMessage:input.expectedMessage,
  transactionFinal:true,transactionSucceeded:true,
  receiptCount:outcomes.length,failedReceiptCount:0,gasBurntGasUnits:gas.toString(),
  contractStateMutationVerified:true,realRheaLiquidationAttempted:false,
  rheaContractParityVerified:false,liquidationEligibilityVerified:false,
  financingVerified:false,profitVerified:false,
  executionEnabled:false,maySignMainnet:false,mayBroadcastMainnet:false,
  blockers:[
   'LOCAL_SANDBOX_CONTRACT_IS_NOT_RHEA_LENDING_CONTRACT',
   'NO_REPRODUCIBLE_FULL_RHEA_CONTRACT_STATE_IMPORT_OR_LIQUIDATION_RECEIPT',
   'NO_FINANCING_SWAP_GAS_CONVERSION_OR_REALIZED_PROFIT',
   'NO_MAINNET_SIGNER_OR_AUTHORIZATION',
  ],
 };
}

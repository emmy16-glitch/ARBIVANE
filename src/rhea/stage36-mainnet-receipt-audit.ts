/** Stage36: observe real FINAL NEAR mainnet liquidation transaction receipts.
 * Read-only RPC. A SUCCESS on the initial execute_with_pyth receipt is NOT
 * a successful liquidation if callback_execute_with_pyth fails.
 */
const ID=/^[a-z0-9._-]{2,64}$/;
const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const UINT=/^(0|[1-9][0-9]{0,77})$/;
const U128=(1n<<128n)-1n;
function object(v:unknown,label:string):Record<string,unknown>{
 if(!v||typeof v!=='object'||Array.isArray(v))throw Error('INVALID_'+label);
 return v as Record<string,unknown>;
}
function parseActions(args:unknown):Record<string,unknown>{
 if(typeof args==='object'&&args!==null&&!Array.isArray(args))return object(args,'CALL_ARGS');
 if(typeof args!=='string'||args.length>1000000)throw Error('INVALID_TX_CALL_ARGS');
 let text:string;
 try{
  const binary=atob(args);
  const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
  text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
 }catch{throw Error('INVALID_BASE64_CALL_ARGS');}
 try{return object(JSON.parse(text),'CALL_ARGS');}catch{throw Error('INVALID_ACTIONS_JSON');}
}
function amount(v:unknown):string{
 if(typeof v!=='string'||!UINT.test(v)||BigInt(v)>U128)throw Error('INVALID_LIQUIDATE_AMOUNT');
 return v;
}
function token(v:unknown):string{
 if(typeof v!=='string'||!ID.test(v))throw Error('INVALID_LIQUIDATE_TOKEN');
 return v;
}
export interface ExecutedLiquidationReceipt {
 mode:'RHEA_STAGE36_FINALIZED_PYTH_LIQUIDATION_RECEIPT_WITNESS';chain:'NEAR_MAINNET';
 status:'FAILED_EXECUTION_CONFIRMED'|'SUCCESSFUL_CALLBACK_WITHOUT_PROFIT_PROOF';
 transactionHash:string;signerAccountId:string;borrowerAccountId:string;
 contractId:'contract.main.burrow.near';method:'execute_with_pyth';
 receiptCount:number;failedReceiptCount:number;callbackReceipts:number;
 borrowedTokenId:string;borrowedInternalAmount:string;
 repaidTokenId:string;repaidInternalAmount:string;
 seizedTokenId:string;seizedInternalAmount:string;
 callbackRejectionCategory:'BORROWED_ASSET_DISALLOWED'|'OTHER_CONTRACT_REJECTION'|null;
 overallFinalExecutionStatus:'FINAL';
 gasBurntGasUnits:string;
 mainnetLiquidationTransactionSucceeded:boolean;
 borrowerDebtDeltaVerified:false;liquidatorCollateralDeltaVerified:false;
 tokenUnitEquivalenceVerified:false;netProfitVerified:false;
 executionPermissionGranted:false;maySign:false;mayBroadcast:false;
 notes:string[];
}
function hasFailure(x:unknown):boolean{
 const row=object(x,'RECEIPT_STATUS');
 return Object.prototype.hasOwnProperty.call(row,'Failure');
}
function failureReason(v:unknown):string{
 if(!v||typeof v!=='object')return '';
 const a=JSON.stringify(v);
 return a.length>100000?'':a;
}
export function attestFinalMainnetLiquidation(
 raw:unknown,
 query:{transactionHash:string;signerAccountId:string},
):ExecutedLiquidationReceipt{
 if(!query||!HASH.test(query.transactionHash)||!ID.test(query.signerAccountId))
  throw Error('INVALID_OBSERVED_TX_ID');
 const tx=object(raw,'FINAL_TX_RESULT');
 if(tx.final_execution_status!=='FINAL')throw Error('TRANSACTION_IS_NOT_FINAL');
 const transaction=object(tx.transaction,'TRANSACTION');
 if(transaction.hash!==query.transactionHash||transaction.signer_id!==query.signerAccountId||
  transaction.receiver_id!=='contract.main.burrow.near')throw Error('TRANSACTION_IDENTITY_MISMATCH');
 const txActions=transaction.actions;
 if(!Array.isArray(txActions)||txActions.length!==1)throw Error('UNSUPPORTED_TRANSACTION_ACTIONS');
 const fn=object(object(txActions[0],'FUNCTION_CALL').FunctionCall,'FUNCTION_CALL');
 if(fn.method_name!=='execute_with_pyth')throw Error('NOT_ACTIVE_PYTH_EXECUTION');
 const payload=parseActions(fn.args);
 if(!Array.isArray(payload.actions)||payload.actions.length!==3)
  throw Error('NOT_THREE_ACTION_LIQUIDATION');
 const [b,l,w]=payload.actions.map((x:unknown)=>object(x,'LENDING_ACTION'));
 const borrow=object(b.Borrow,'BORROW');
 const liquidate=object(l.Liquidate,'LIQUIDATE');
 const withdrawal=object(w.Withdraw,'WITHDRAW');
 const inAssets=liquidate.in_assets,outAssets=liquidate.out_assets;
 if(typeof liquidate.account_id!=='string'||!ID.test(liquidate.account_id)||
  !Array.isArray(inAssets)||inAssets.length!==1||
  !Array.isArray(outAssets)||outAssets.length!==1)
  throw Error('INVALID_LIQUIDATE_ACTION_SHAPE');
 const repay=object(inAssets[0],'IN_ASSET'),seize=object(outAssets[0],'OUT_ASSET');
 const borrowedToken=token(borrow.token_id),borrowedAmount=amount(borrow.amount);
 const repaidToken=token(repay.token_id),repaidAmount=amount(repay.amount);
 const seizedToken=token(seize.token_id),seizedAmount=amount(seize.amount);
 if(borrowedToken!==repaidToken||BigInt(borrowedAmount)<BigInt(repaidAmount)||
  token(withdrawal.token_id)!==seizedToken||
  amount(withdrawal.amount??withdrawal.max_amount)!==seizedAmount||
  [borrowedAmount,repaidAmount,seizedAmount].some(x=>BigInt(x)===0n))
  throw Error('CONTRADICTORY_LIQUIDATE_ROUTE');
 const receipts=tx.receipts,outcomes=tx.receipts_outcome;
 if(!Array.isArray(receipts)||!Array.isArray(outcomes)||receipts.length===0||outcomes.length===0)
  throw Error('MISSING_FINAL_RECEIPTS');
 const callbackIds=new Set<string>();
 for(const r of receipts){
  const receipt=object(r,'RECEIPT');
  if(typeof receipt.receipt_id!=='string'||!HASH.test(receipt.receipt_id))continue;
  const content=receipt.receipt;
  if(!content||typeof content!=='object')continue;
  const rec=object(content,'RECEIPT_CONTENT');
  if(!rec.Action)continue;
  const actions=object(rec.Action,'ACTION_RECEIPT').actions;
  if(!Array.isArray(actions))continue;
  if(actions.some(x=>x&&typeof x==='object'&&
   (x as Record<string,unknown>).FunctionCall &&
   object((x as Record<string,unknown>).FunctionCall,'RECEIPT_CALL').method_name==='callback_execute_with_pyth'))
   callbackIds.add(receipt.receipt_id);
 }
 const resultMap=new Map<string,Record<string,unknown>>();
 let failed=0,totalGas=0n;
 for(const x of outcomes){
  const item=object(x,'RECEIPT_OUTCOME');
  if(typeof item.id!=='string'||!HASH.test(item.id)||resultMap.has(item.id))
   throw Error('INVALID_DUPLICATE_RECEIPT_OUTCOME');
  const y=object(item.outcome,'OUTCOME');
  if(y.status===undefined)throw Error('MISSING_RECEIPT_STATUS');
  if(hasFailure(y.status))failed++;
  if((typeof y.gas_burnt!=='number'&&typeof y.gas_burnt!=='string')||
   !UINT.test(String(y.gas_burnt)))throw Error('INVALID_GAS_BURNT');
  totalGas+=BigInt(String(y.gas_burnt));
  resultMap.set(item.id,y);
 }
 if(callbackIds.size===0||[...callbackIds].some(id=>!resultMap.has(id)))
  throw Error('UNATTESTED_PYTH_CALLBACK_RECEIPT');
 const status=object(tx.status,'FINAL_TX_STATUS');
 const overallFailed=Object.prototype.hasOwnProperty.call(status,'Failure');
 const failedCallbacks=[...callbackIds].filter(id=>hasFailure(resultMap.get(id)!.status));
 if((overallFailed&&failed===0)||(!overallFailed&&failed>0))
  throw Error('INCONSISTENT_FINAL_RECEIPT_STATUS');
 const reason=failedCallbacks.map(id=>failureReason(resultMap.get(id)?.status)).join(' ');
 const category=overallFailed?
  /(?:this|thi) asset can.t be used borrowed|asset.*can.t be used borrowed/i.test(reason)?
   'BORROWED_ASSET_DISALLOWED':'OTHER_CONTRACT_REJECTION':null;
 return {mode:'RHEA_STAGE36_FINALIZED_PYTH_LIQUIDATION_RECEIPT_WITNESS',chain:'NEAR_MAINNET',
  status:overallFailed?'FAILED_EXECUTION_CONFIRMED':'SUCCESSFUL_CALLBACK_WITHOUT_PROFIT_PROOF',
  transactionHash:query.transactionHash,signerAccountId:query.signerAccountId,
  borrowerAccountId:liquidate.account_id,contractId:'contract.main.burrow.near',
  method:'execute_with_pyth',receiptCount:outcomes.length,failedReceiptCount:failed,
  callbackReceipts:callbackIds.size,borrowedTokenId:borrowedToken,
  borrowedInternalAmount:borrowedAmount,repaidTokenId:repaidToken,
  repaidInternalAmount:repaidAmount,seizedTokenId:seizedToken,
  seizedInternalAmount:seizedAmount,callbackRejectionCategory:category,
  overallFinalExecutionStatus:'FINAL',gasBurntGasUnits:totalGas.toString(),
  mainnetLiquidationTransactionSucceeded:!overallFailed,
  borrowerDebtDeltaVerified:false,liquidatorCollateralDeltaVerified:false,
  tokenUnitEquivalenceVerified:false,netProfitVerified:false,
  executionPermissionGranted:false,maySign:false,mayBroadcast:false,
  notes:['OBSERVED_OTHER_LIQUIDATORS_HISTORICAL_TX_NOT_ARBIVANE_TRADE',
   'SUCCESSFUL_ENTRY_RECEIPT_CAN_STILL_FAIL_ASYNC_PYTH_CALLBACK',
   'NO_SIGNING_BORROWER_BALANCE_CHANGES_SWAP_GAS_COST_OR_REAL_NET_PROFIT_PROOF']};
}

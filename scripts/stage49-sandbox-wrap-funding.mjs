/** Stage49: fund only a disposable NEAR Sandbox liquidator with native
 * Sandbox NEAR, converted on the cloned real wrap.near Wasm and deposited
 * into the cloned Rhea contract as collateral.
 *
 * No mainnet signer. Never mint, rewrite balances, patch borrower state, or
 * silently substitute an unrelated FT for the actual cloned token.
 */
import {actorCollateralInternal} from './stage49-sandbox-borrow-preflight.mjs';
import {writeFile} from 'node:fs/promises';
const NEAR=10n**24n;
const DEPOSIT=NEAR; // one disposable Sandbox NEAR, not user's real money
const STORAGE=NEAR/10n; // bounded 0.1 Sandbox NEAR per storage registration
const MAX_GAS=100000000000000n;
const ID=/^[a-z0-9._-]{2,64}$/;
const UINT=/^(0|[1-9][0-9]{0,38})$/;
const U128=(1n<<128n)-1n;
/** A nonzero value without corresponding token-specific lending shares is not
 * an attested supplied position. Never accept unrelated collateral shares. */
export function wrappedNearCollateralShares(account){
 const positions=account?.positions;
 if(!positions||typeof positions!=='object'||Array.isArray(positions)||
  Object.keys(positions).length>64)
  throw Error('STAGE54_INVALID_ACTOR_POSITIONS');
 let shares=0n;
 for(const position of Object.values(positions)){
  if(!position||typeof position!=='object'||
   !Array.isArray(position.collateral)||position.collateral.length>256)
   throw Error('STAGE54_INVALID_COLLATERAL_ROWS');
  const seen=new Set();
  for(const leg of position.collateral){
   if(!leg||typeof leg!=='object'||typeof leg.token_id!=='string'||
    !ID.test(leg.token_id)||seen.has(leg.token_id))
    throw Error('STAGE54_INVALID_OR_DUPLICATE_COLLATERAL_LEG');
   seen.add(leg.token_id);
   if(leg.token_id==='wrap.near'){
    if(typeof leg.shares!=='string'||!UINT.test(leg.shares)||
     BigInt(leg.shares)>U128)
     throw Error('STAGE54_INVALID_WRAPPED_SHARE_AMOUNT');
    shares+=BigInt(leg.shares);
    if(shares>U128)throw Error('STAGE54_COLLATERAL_SHARE_OVERFLOW');
   }
  }
 }
 return shares;
}
function success(result,label){
 const v=result?.result??result;
 if(!v||!['FINAL','EXECUTED_OPTIMISTIC'].includes(v.final_execution_status)||
  !v.status||typeof v.status!=='object'||
  !Object.hasOwn(v.status,'SuccessValue')||
  Object.hasOwn(v.status,'Failure')||
  !Array.isArray(v.receipts_outcome)||v.receipts_outcome.length===0)
  throw Error('STAGE49_'+label+'_UNVERIFIED_RECEIPT');
 for(const x of v.receipts_outcome){
  const state=x?.outcome?.status;
  if(!state||typeof state!=='object'||Object.hasOwn(state,'Failure')||
   (!Object.hasOwn(state,'SuccessValue')&&!Object.hasOwn(state,'SuccessReceiptId')))
   throw Error('STAGE49_'+label+'_FAILED_CALLBACK');
 }
}
// NEAR can return an optimistic SuccessReceiptId before the asynchronous
// ft_transfer_call receiver and resolver receipts are finalized. Never
// misclassify that provisional status as successful collateral funding.
function fundingReceiptSummary(raw) {
 const v=raw?.result??raw;
 const status=v?.status;
 return {
  transactionHash:typeof v?.transaction?.hash==='string'?v.transaction.hash:null,
  finalExecutionStatus:v?.final_execution_status??null,
  transactionStatus:status&&typeof status==='object'?Object.keys(status).sort():[],
  receipts:Array.isArray(v?.receipts_outcome)?
   v.receipts_outcome.map(row=>({
    id:typeof row?.id==='string'?row.id:null,
    status:row?.outcome?.status&&typeof row.outcome.status==='object'?
     Object.keys(row.outcome.status).sort():[],
   })):[],
 };
}
async function saveFundingReceipt(path,initial,final,classification){
 if(!path)return;
 await writeFile(path,JSON.stringify({
  mode:'STAGE121_GENUINE_SANDBOX_WNEAR_TRANSFER_RECEIPTS',
  chain:'NEAR_SANDBOX',classification,
  initial:fundingReceiptSummary(initial),
  final:final?fundingReceiptSummary(final):null,
  actualLiquidationAttempted:false,mainnetExecutionEnabled:false,
 },null,2)+'\n');
}
export async function settleFundingTransferReceipt({
 raw,provider,actorAccountId,evidencePath=null
}){
 const initial=fundingReceiptSummary(raw);
 const v=raw?.result??raw;
 if(v?.status&&typeof v.status==='object'&&Object.hasOwn(v.status,'Failure')){
  await saveFundingReceipt(evidencePath,raw,null,'REJECTED_TRANSACTION_FAILURE');
  throw Error('STAGE49_WNEAR_COLLATERAL_TRANSFER_UNVERIFIED_RECEIPT');
 }
 if(Array.isArray(v?.receipts_outcome)&&v.receipts_outcome.some(
  row=>row?.outcome?.status&&typeof row.outcome.status==='object'&&
   Object.hasOwn(row.outcome.status,'Failure'))){
  await saveFundingReceipt(evidencePath,raw,null,'REJECTED_FAILED_CALLBACK');
  throw Error('STAGE49_WNEAR_COLLATERAL_TRANSFER_FAILED_CALLBACK');
 }
 let resolved=raw;
 // A SuccessReceiptId is not final proof of the FT resolver callback.
 // Query ONLY the local Sandbox provider and NEVER submit another transfer.
 if(!['SuccessValue'].some(key=>initial.transactionStatus.includes(key))||
  !['FINAL','EXECUTED_OPTIMISTIC'].includes(initial.finalExecutionStatus)){
  if(!provider||typeof provider.txStatus!=='function'||
   !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(initial.transactionHash??'')||
   typeof actorAccountId!=='string'||!ID.test(actorAccountId)){
   await saveFundingReceipt(evidencePath,raw,null,'PENDING_WITHOUT_FINAL_STATUS_PROVIDER');
   throw Error('STAGE49_WNEAR_COLLATERAL_TRANSFER_FINAL_STATUS_UNAVAILABLE');
  }
  try{
   let timeout;
   try{
    const final=await Promise.race([
     provider.txStatus(initial.transactionHash,actorAccountId,'FINAL'),
     new Promise((_,reject)=>{
      timeout=setTimeout(()=>reject(Error('SANDBOX_TX_STATUS_TIMEOUT')),15000);
     }),
    ]);
    resolved={result:final};
   }finally{clearTimeout(timeout);}
  }catch{
   await saveFundingReceipt(evidencePath,raw,null,'FINAL_STATUS_READ_FAILED');
   throw Error('STAGE49_WNEAR_COLLATERAL_TRANSFER_FINAL_STATUS_UNAVAILABLE');
  }
 }
 await saveFundingReceipt(evidencePath,raw,resolved,'FINAL_STATUS_OBSERVED');
 success(resolved,'WNEAR_COLLATERAL_TRANSFER');
 return resolved;
}
async function registerIfNeeded(actor,contract,label){
 if(typeof contract.view!=='function')throw Error('STAGE49_'+label+'_NO_STORAGE_VIEW');
 const [existing,bounds]=await Promise.all([
  contract.view('storage_balance_of',{account_id:actor.accountId}),
  contract.view('storage_balance_bounds',{}),
 ]);
 const min=bounds?.min;
 if(typeof min!=='string'||!/^(0|[1-9][0-9]{0,38})$/.test(min)||
  BigInt(min)>STORAGE)
  throw Error('STAGE49_'+label+'_STORAGE_FEE_OUT_OF_BOUNDS');
 if(existing!==null&&existing!==undefined){
  if(typeof existing.total!=='string'||
   !/^(0|[1-9][0-9]{0,38})$/.test(existing.total)||
   BigInt(existing.total)<BigInt(min))
   throw Error('STAGE49_'+label+'_EXISTING_STORAGE_INSUFFICIENT');
  return false;
 }
 const result=await actor.callRaw(contract,'storage_deposit',{
  account_id:actor.accountId,registration_only:true,
 },{gas:MAX_GAS,attachedDeposit:BigInt(min)});
 success(result,label+'_STORAGE_REGISTRATION');
 const now=await contract.view('storage_balance_of',{account_id:actor.accountId});
 if(!now||typeof now!=='object')throw Error('STAGE49_'+label+'_STORAGE_NOT_REGISTERED');
 return true;
}
export async function seedSandboxLiquidatorWithWrappedNear({
 actor,lending,wrapped,assetRows,provider=null,evidencePath=null
}){
 if(!actor||!ID.test(actor.accountId)||typeof actor.callRaw!=='function'||
  !lending||typeof lending.view!=='function'||!ID.test(lending.accountId)||
  !wrapped||typeof wrapped.view!=='function'||wrapped.accountId!=='wrap.near'||
  !Array.isArray(assetRows))
  throw Error('STAGE49_LOCAL_FUNDING_CONTRACTS_INVALID');
 const pool=assetRows.find(row=>Array.isArray(row)&&row[0]==='wrap.near');
 if(!pool||pool[1]?.config?.can_use_as_collateral!==true)
  throw Error('STAGE49_WNEAR_IS_NOT_ENABLED_COLLATERAL');
 // This actor is created by NEAR Workspaces inside the isolated Sandbox.
 // Funding is explicitly local and separate from any mainnet wallet.
 const before=await lending.view('get_account_all_positions',{account_id:actor.accountId});
 if(actorCollateralInternal(before)!==0n)
  throw Error('STAGE49_REFUSE_PREEXISTING_ACTOR_COLLATERAL');
 await registerIfNeeded(actor,lending,'LENDING');
 await registerIfNeeded(actor,wrapped,'WNEAR');
 // The local actor must start with ZERO wrapped-token inventory; never
 // accept pre-seeded FT balances as evidence that native wrapping occurred.
 const actorWnearBefore=await wrapped.view('ft_balance_of',{account_id:actor.accountId});
 const vaultWnearBefore=await wrapped.view('ft_balance_of',{account_id:lending.accountId});
 const validFt=x=>typeof x==='string'&&/^(0|[1-9][0-9]{0,38})$/.test(x);
 if(!validFt(actorWnearBefore)||BigInt(actorWnearBefore)!==0n||
  !validFt(vaultWnearBefore))
  throw Error('STAGE53_WRAPPED_TOKEN_PRESTATE_NOT_TRUSTED');
 const rawWrap=await actor.callRaw(wrapped,'near_deposit',{},{
  gas:MAX_GAS,attachedDeposit:DEPOSIT
 });
 success(rawWrap,'WNEAR_WRAP');
 const [ftBalance,vaultWnearAfterWrap]=await Promise.all([
  wrapped.view('ft_balance_of',{account_id:actor.accountId}),
  wrapped.view('ft_balance_of',{account_id:lending.accountId}),
 ]);
 if(!validFt(ftBalance)||BigInt(ftBalance)!==DEPOSIT)
  throw Error('STAGE53_WRAPPED_NATIVE_NEAR_CREDIT_NOT_EXACT');
 if(!validFt(vaultWnearAfterWrap)||vaultWnearAfterWrap!==vaultWnearBefore)
  throw Error('STAGE54_RHEA_VAULT_CHANGED_DURING_ACTOR_WRAP');
 const rawCollateral=await actor.callRaw(wrapped,'ft_transfer_call',{
  receiver_id:lending.accountId,amount:DEPOSIT.toString(),
  msg:'"OnlyIncreaseCollateral"',
 },{gas:200000000000000n,attachedDeposit:1n});
 await settleFundingTransferReceipt({raw:rawCollateral,provider,
  actorAccountId:actor.accountId,evidencePath});
 const [after,remaining,vaultWnearAfter]=await Promise.all([
  lending.view('get_account_all_positions',{account_id:actor.accountId}),
  wrapped.view('ft_balance_of',{account_id:actor.accountId}),
  wrapped.view('ft_balance_of',{account_id:lending.accountId}),
 ]);
 const balance=actorCollateralInternal(after,'wrap.near');
 const creditedShares=wrappedNearCollateralShares(after);
 const totalCollateral=actorCollateralInternal(after);
 // Wrapped NEAR has 24 decimals in this account route. The lending pool
 // can convert deposited units through interest-bearing shares. Require
 // at least 99% of the genuine transfer credited specifically as wrapped
 // collateral, not unrelated collateral or a merely positive dust leg.
 if(balance<DEPOSIT*99n/100n||balance>DEPOSIT*101n/100n||
  totalCollateral<balance||creditedShares===0n)
  throw Error('STAGE53_WRAPPED_COLLATERAL_CREDIT_NOT_RECONCILED');
 if(!validFt(remaining)||BigInt(ftBalance)-BigInt(remaining)!==DEPOSIT)
  throw Error('STAGE53_ACTOR_WRAPPED_TOKEN_DEBIT_NOT_EXACT');
 if(!validFt(vaultWnearAfter)||
  BigInt(vaultWnearAfter)-BigInt(vaultWnearBefore)!==DEPOSIT)
  throw Error('STAGE53_RHEA_WRAPPED_TOKEN_VAULT_CREDIT_NOT_EXACT');
 return {
  mode:'ARBIVANE_STAGE49_FUNDED_LOCAL_LIQUIDATOR',
  chain:'NEAR_SANDBOX',
  status:'SANDBOX_WNEAR_COLLATERAL_DEPOSITED_NOT_BORROW_HEALTH_PROOF',
  actorAccountId:actor.accountId,collateralTokenId:'wrap.near',
  wrappedNativeSandboxYocto:DEPOSIT.toString(),
  observedActorCollateralReferenceInternal:totalCollateral.toString(),
  observedWrappedNearCollateralInternal:balance.toString(),
  observedWrappedNearCollateralShares:creditedShares.toString(),
  vaultBalanceUnchangedDuringNativeWrapVerified:true,
  observedSenderWrappedTokenDecreaseAtomic:DEPOSIT.toString(),
  observedRheaWrappedTokenVaultIncreaseAtomic:DEPOSIT.toString(),
  wrappedTokenConservationVerified:true,
  realMainnetExecuted:false,mainnetFundingVerified:false,
  lendingBorrowHealthVerified:false,mainnetExecutionEnabled:false,
  maySignMainnet:false,mayBroadcastMainnet:false,
  blockers:['STAGE49_COLLATERAL_ONLY_FUNDING_NOT_BORROW_PERMISSION_OR_REPAY_CAPITAL_PROOF',
   'RHEA_ACTUAL_LIQUIDATION_CALLBACK_AND_COLLATERAL_SEIZURE_NOT_PROVEN',
   'NO_MAINNET_FUNDS_SIGNERS_OR_REALIZED_NET_PROFIT']
 };
}

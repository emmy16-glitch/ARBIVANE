/** Stage49: fund only a disposable NEAR Sandbox liquidator with native
 * Sandbox NEAR, converted on the cloned real wrap.near Wasm and deposited
 * into the cloned Rhea contract as collateral.
 *
 * No mainnet signer. Never mint, rewrite balances, patch borrower state, or
 * silently substitute an unrelated FT for the actual cloned token.
 */
import {actorCollateralInternal} from './stage49-sandbox-borrow-preflight.mjs';
const NEAR=10n**24n;
const DEPOSIT=NEAR; // one disposable Sandbox NEAR, not user's real money
const STORAGE=NEAR/10n; // bounded 0.1 Sandbox NEAR per storage registration
const MAX_GAS=100000000000000n;
const ID=/^[a-z0-9._-]{2,64}$/;
const UINT=/^(0|[1-9][0-9]{0,38})$/;
const U128=(1n<<128n)-1n;
function ft(v,label){
 if(typeof v!=='string'||!UINT.test(v)||BigInt(v)>U128)
  throw Error('STAGE52_'+label+'_INVALID_TOKEN_BALANCE');
 return BigInt(v);
}
/** Check collateral token identity and both nonzero balance and share units.
 * Total unrelated collateral cannot substitute for a wrapped-NEAR receipt. */
function wrappedCollateralPosition(account){
 const positions=account?.positions;
 if(!positions||typeof positions!=='object'||Array.isArray(positions))
  throw Error('STAGE52_INVALID_LENDING_COLLATERAL_POSITIONS');
 let balance=0n,shares=0n;
 for(const position of Object.values(positions)){
  if(!position||typeof position!=='object'||!Array.isArray(position.collateral))
   throw Error('STAGE52_INVALID_LENDING_COLLATERAL_POSITION');
  const seen=new Set();
  for(const leg of position.collateral){
   if(!leg||typeof leg!=='object'||!ID.test(leg.token_id)||seen.has(leg.token_id))
    throw Error('STAGE52_INVALID_OR_DUPLICATE_COLLATERAL_LEG');
   seen.add(leg.token_id);
   if(leg.token_id==='wrap.near'){
    balance+=ft(leg.balance,'COLLATERAL');
    shares+=ft(leg.shares,'COLLATERAL_SHARES');
   }
  }
 }
 if(balance>U128||shares>U128||(balance===0n)!==(shares===0n))
  throw Error('STAGE52_INVALID_WRAPPED_COLLATERAL_SHARES');
 return {balance,shares};
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
 actor,lending,wrapped,assetRows
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
 const beforeWrappedPosition=wrappedCollateralPosition(before);
 if(beforeWrappedPosition.balance!==0n||beforeWrappedPosition.shares!==0n)
  throw Error('STAGE52_PREEXISTING_WRAPPED_NEAR_COLLATERAL');
 await registerIfNeeded(actor,lending,'LENDING');
 await registerIfNeeded(actor,wrapped,'WNEAR');
 const [actorFtBefore,vaultFtBefore]=await Promise.all([
  wrapped.view('ft_balance_of',{account_id:actor.accountId}),
  wrapped.view('ft_balance_of',{account_id:lending.accountId}),
 ]);
 if(ft(actorFtBefore,'ACTOR_PRE_WRAP')!==0n)
  throw Error('STAGE52_DISPOSABLE_ACTOR_WNEAR_BALANCE_NOT_EMPTY');
 const vaultBaseline=ft(vaultFtBefore,'VAULT_PRE_TRANSFER');
 const rawWrap=await actor.callRaw(wrapped,'near_deposit',{},{
  gas:MAX_GAS,attachedDeposit:DEPOSIT
 });
 success(rawWrap,'WNEAR_WRAP');
 const [ftBalance,vaultAfterWrap]=await Promise.all([
  wrapped.view('ft_balance_of',{account_id:actor.accountId}),
  wrapped.view('ft_balance_of',{account_id:lending.accountId}),
 ]);
 if(ft(ftBalance,'ACTOR_AFTER_WRAP')!==DEPOSIT||
  ft(vaultAfterWrap,'VAULT_AFTER_WRAP')!==vaultBaseline)
  throw Error('STAGE52_WRAPPED_NATIVE_DEPOSIT_OR_VAULT_BALANCE_MISMATCH');
 const rawCollateral=await actor.callRaw(wrapped,'ft_transfer_call',{
  receiver_id:lending.accountId,amount:DEPOSIT.toString(),
  msg:'"OnlyIncreaseCollateral"',
 },{gas:200000000000000n,attachedDeposit:1n});
 success(rawCollateral,'WNEAR_COLLATERAL_TRANSFER');
 const after=await lending.view('get_account_all_positions',{account_id:actor.accountId});
 const balance=actorCollateralInternal(after);
 const credited=wrappedCollateralPosition(after);
 if(balance<=0n||credited.balance<=beforeWrappedPosition.balance||
  credited.shares<=beforeWrappedPosition.shares)
  throw Error('STAGE52_SPECIFIC_WRAPPED_COLLATERAL_NOT_CREDITED');
 const [remaining,vaultAfterTransfer]=await Promise.all([
  wrapped.view('ft_balance_of',{account_id:actor.accountId}),
  wrapped.view('ft_balance_of',{account_id:lending.accountId}),
 ]);
 if(ft(remaining,'ACTOR_AFTER_TRANSFER')!==0n||
  ft(vaultAfterTransfer,'VAULT_AFTER_TRANSFER')!==vaultBaseline+DEPOSIT)
  throw Error('STAGE52_EXACT_WRAPPED_TRANSFER_OR_VAULT_DELTA_UNVERIFIED');
 return {
  mode:'ARBIVANE_STAGE49_FUNDED_LOCAL_LIQUIDATOR',
  chain:'NEAR_SANDBOX',
  status:'SANDBOX_WNEAR_COLLATERAL_DEPOSITED_NOT_BORROW_HEALTH_PROOF',
  actorAccountId:actor.accountId,collateralTokenId:'wrap.near',
  wrappedNativeSandboxYocto:DEPOSIT.toString(),
  observedActorCollateralReferenceInternal:balance.toString(),
  observedWrappedNearCollateralInternal:credited.balance.toString(),
  observedWrappedNearCollateralShares:credited.shares.toString(),
  observedLendingVaultWrappedFtBeforeAtomic:vaultBaseline.toString(),
  observedLendingVaultWrappedFtAfterAtomic:(vaultBaseline+DEPOSIT).toString(),
  exactSandboxFtVaultTransferVerified:true,
  realMainnetExecuted:false,mainnetFundingVerified:false,
  lendingBorrowHealthVerified:false,mainnetExecutionEnabled:false,
  maySignMainnet:false,mayBroadcastMainnet:false,
  blockers:['STAGE49_COLLATERAL_ONLY_FUNDING_NOT_BORROW_PERMISSION_OR_REPAY_CAPITAL_PROOF',
   'RHEA_ACTUAL_LIQUIDATION_CALLBACK_AND_COLLATERAL_SEIZURE_NOT_PROVEN',
   'NO_MAINNET_FUNDS_SIGNERS_OR_REALIZED_NET_PROFIT']
 };
}

import type {SandboxReplayPlan,SandboxResult} from './stage37-sandbox-liquidation.ts';

/** Stage41: reconcile an ACTUAL local NEAR Sandbox liquidation callback against
 * borrower debt/collateral, any leftover actor debt, and raw FT inventory.
 * Success is not proof of profit, share conversion, funding or current mainnet
 * executability. No transaction creation and absolutely no wallet signing.
 */
const U128=(1n<<128n)-1n;
const UINT=/^(0|[1-9][0-9]{0,38})$/;
const ID=/^[a-z0-9._:-]{1,100}$/;
const TOKEN=/^[a-z0-9._-]{2,64}$/;
function obj(value:unknown,label:string):Record<string,unknown>{
 if(value===null||typeof value!=='object'||Array.isArray(value))
  throw Error('INVALID_STAGE41_'+label);
 return value as Record<string,unknown>;
}
function uint(value:unknown,label:string):bigint{
 if(typeof value!=='string'||!UINT.test(value)||BigInt(value)>U128)
  throw Error('INVALID_STAGE41_'+label);
 return BigInt(value);
}
function legs(raw:unknown,role:string):Map<string,{balance:bigint;shares:bigint}>{
 if(!Array.isArray(raw)||raw.length>256)throw Error('INVALID_STAGE41_'+role);
 const result=new Map<string,{balance:bigint;shares:bigint}>();
 for(const one of raw){
  const row=obj(one,role+'_ROW'),token=row.token_id;
  if(typeof token!=='string'||!TOKEN.test(token)||result.has(token))
   throw Error('INVALID_STAGE41_'+role+'_TOKEN');
  const shares=uint(row.shares,role+'_SHARES');
  const balance=uint(row.balance,role+'_BALANCE');
  if((shares===0n)!==(balance===0n))throw Error('STAGE41_INCONSISTENT_SHARES_BALANCE');
  result.set(token,{balance,shares});
 }
 return result;
}
function scoped(raw:unknown,positionId:string,role:'borrowed'|'collateral'):Map<string,{balance:bigint;shares:bigint}>{
 const all=obj(obj(raw,'BORROWER').positions,'POSITIONS');
 if(Object.keys(all).length>64)throw Error('STAGE41_TOO_MANY_POSITIONS');
 if(all[positionId]===undefined)return new Map();
 const pos=obj(all[positionId],'POSITION');
 return legs(pos[role],role);
}
function amountIn(map:Map<string,{balance:bigint;shares:bigint}>,token:string):bigint {
 return map.get(token)?.balance??0n;
}
function outstanding(raw:unknown):bigint{
 const actor=obj(raw,'ACTOR');
 let total=0n;
 const borrowed=actor.borrowed;
 if(borrowed!==undefined)total+=[...legs(borrowed,'ACTOR_BORROWED').values()].reduce((n,x)=>n+x.balance,0n);
 const positions=obj(actor.positions,'ACTOR_POSITIONS');
 if(Object.keys(positions).length>64)throw Error('STAGE41_TOO_MANY_ACTOR_POSITIONS');
 for(const pos of Object.values(positions)){
  total+=[...legs(obj(pos,'ACTOR_POSITION').borrowed,'ACTOR_POSITION_BORROWED').values()]
   .reduce((n,x)=>n+x.balance,0n);
 }
 return total;
}
export interface SandboxSettlementEvidence {
 mode:'ARBIVANE_STAGE41_SANDBOX_BALANCE_SETTLEMENT_WITNESS';
 chain:'NEAR_SANDBOX';borrowerAccountId:string;positionId:string;
 repayTokenId:string;seizeTokenId:string;
 status:'POSITION_AND_FT_DELTAS_OBSERVED_UNSOLD'|'BLOCKED_RECEIPT_OR_CALLBACK'|
  'BLOCKED_BORROWER_DELTAS'|'BLOCKED_ACTOR_HAS_LIABILITY'|
  'BLOCKED_NO_FT_SEIZURE'|'BLOCKED_ACTOR_PRIOR_LIABILITY';
 borrowerDebtBeforeInternal:string;borrowerDebtAfterInternal:string;
 borrowerDebtDecreaseInternal:string;
 borrowerCollateralBeforeInternal:string;borrowerCollateralAfterInternal:string;
 borrowerCollateralDecreaseInternal:string;
 actorOutstandingDebtBeforeInternal:string;actorOutstandingDebtAfterInternal:string;
 actorRepayFtBeforeAtomic:string;actorRepayFtAfterAtomic:string;
 actorSeizeFtBeforeAtomic:string;actorSeizeFtAfterAtomic:string;
 actorSeizeFtIncreaseAtomic:string;
 borrowerMutationVerified:boolean;assetTransferObserved:boolean;
 callbackSuccessObserved:boolean;currentMainnetAssetUnitsVerified:false;
 settlementAssetSold:false;swapProceedsVerified:false;gasCostInSettlementAssetVerified:false;
 fullContractStorageParityVerified:false;positiveNetProfitVerified:false;
 maySignMainnet:false;mayBroadcastMainnet:false;mainnetExecutionEnabled:false;
 blockers:string[];
}
export interface SandboxSettlementInput {
 plan:SandboxReplayPlan;
 positionId:string;
 receipt:SandboxResult;
 borrowerBefore:unknown;borrowerAfter:unknown;
 actorBefore:unknown;actorAfter:unknown;
 actorRepayFtBefore:unknown;actorRepayFtAfter:unknown;
 actorSeizeFtBefore:unknown;actorSeizeFtAfter:unknown;
}
export function attestStage41SandboxSettlement(e:SandboxSettlementInput):SandboxSettlementEvidence{
 const plan=e?.plan,receipt=e?.receipt;
 if(!plan||plan.mode!=='ARBIVANE_STAGE37_ISOLATED_SANDBOX_LIQUIDATION_PLAN'||
  plan.chain!=='NEAR_SANDBOX'||plan.method!=='execute_with_pyth'||
  !ID.test(e.positionId)||!TOKEN.test(plan.borrowerAccountId)||
  !Array.isArray(plan.actions)||plan.actions.length!==3||
  plan.executionEnabled!==false||plan.maySignMainnet!==false||
  plan.mayBroadcastMainnet!==false||plan.sourceMathOnly!==true||
  !receipt||receipt.mode!=='ARBIVANE_STAGE37_SANDBOX_RESULT'||
  receipt.chain!=='NEAR_SANDBOX'||receipt.realMainnetExecuted!==false||
  receipt.realProfitVerified!==false||receipt.mayBroadcastMainnet!==false)
  throw Error('STAGE41_REJECTED_UNTRUSTED_SANDBOX_REPORT');
 const repay=plan.actions[0]?.Borrow?.token_id;
 const seize=plan.actions[2]?.Withdraw?.token_id;
 if(typeof repay!=='string'||typeof seize!=='string'||!TOKEN.test(repay)||
  !TOKEN.test(seize)||repay===seize||
  plan.actions[1]?.Liquidate?.account_id!==plan.borrowerAccountId||
  plan.actions[1]?.Liquidate?.in_assets?.length!==1||
  plan.actions[1]?.Liquidate?.out_assets?.length!==1||
  plan.actions[1].Liquidate.in_assets[0]?.token_id!==repay||
  plan.actions[1].Liquidate.out_assets[0]?.token_id!==seize)
  throw Error('STAGE41_INVALID_LIQUIDATION_TOKEN_ROUTE');
 const preDebt=amountIn(scoped(e.borrowerBefore,e.positionId,'borrowed'),repay);
 const postDebt=amountIn(scoped(e.borrowerAfter,e.positionId,'borrowed'),repay);
 const preCollateral=amountIn(scoped(e.borrowerBefore,e.positionId,'collateral'),seize);
 const postCollateral=amountIn(scoped(e.borrowerAfter,e.positionId,'collateral'),seize);
 const actorDebtBefore=outstanding(e.actorBefore),actorDebtAfter=outstanding(e.actorAfter);
 const ftRepayBefore=uint(e.actorRepayFtBefore,'FT_REPAY_BEFORE');
 const ftRepayAfter=uint(e.actorRepayFtAfter,'FT_REPAY_AFTER');
 const ftSeizeBefore=uint(e.actorSeizeFtBefore,'FT_SEIZE_BEFORE');
 const ftSeizeAfter=uint(e.actorSeizeFtAfter,'FT_SEIZE_AFTER');
 const debtDecreased=preDebt>postDebt;
 const collateralDecreased=preCollateral>postCollateral;
 const validReceipt=receipt.status==='ISOLATED_CALLBACK_SUCCESS_NOT_MAINNET_PROOF'&&
  receipt.transactionFinal===true&&receipt.attemptedTransaction===true&&
  receipt.failedReceiptCount===0&&receipt.receiptCount>0;
 const actorFtReceived=ftSeizeAfter>ftSeizeBefore;
 const status:SandboxSettlementEvidence['status']=!validReceipt?'BLOCKED_RECEIPT_OR_CALLBACK':
  !(debtDecreased&&collateralDecreased)?'BLOCKED_BORROWER_DELTAS':
  actorDebtBefore>0n?'BLOCKED_ACTOR_PRIOR_LIABILITY':
  actorDebtAfter>0n?'BLOCKED_ACTOR_HAS_LIABILITY':
  !actorFtReceived?'BLOCKED_NO_FT_SEIZURE':'POSITION_AND_FT_DELTAS_OBSERVED_UNSOLD';
 const blockers=[...(validReceipt?[]:['SANDBOX_TRANSACTION_OR_ASYNC_CALLBACK_NOT_SUCCESSFUL']),
  ...(!(debtDecreased&&collateralDecreased)?['BORROWER_DEBT_AND_COLLATERAL_MOVEMENT_NOT_BOTH_OBSERVED']:[]),
  ...(actorDebtBefore>0n?['REPLAY_ACTOR_ALREADY_HAS_OUTSTANDING_DEBT']:[]),
  ...(actorDebtAfter>0n?['REPLAY_ACTOR_STILL_HAS_OUTSTANDING_DEBT']:[]),
  ...(!actorFtReceived?['NO_SANDBOX_ACTOR_FT_COLLATERAL_TRANSFER_OBSERVED']:[]),
  'COLLATERAL_UNSOLD_AND_NO_REALIZED_SETTLEMENT_PNL',
  'MAINNET_TOKEN_UNITS_GAS_AND_SWAP_COST_NOT_VERIFIED',
  'NO_VERIFIED_FULL_CONTRACT_STORAGE_PARITY_OR_WALLET_APPROVAL'];
 return {mode:'ARBIVANE_STAGE41_SANDBOX_BALANCE_SETTLEMENT_WITNESS',chain:'NEAR_SANDBOX',
  borrowerAccountId:plan.borrowerAccountId,positionId:e.positionId,
  repayTokenId:repay,seizeTokenId:seize,status,
  borrowerDebtBeforeInternal:preDebt.toString(),borrowerDebtAfterInternal:postDebt.toString(),
  borrowerDebtDecreaseInternal:(preDebt>postDebt?preDebt-postDebt:0n).toString(),
  borrowerCollateralBeforeInternal:preCollateral.toString(),
  borrowerCollateralAfterInternal:postCollateral.toString(),
  borrowerCollateralDecreaseInternal:(preCollateral>postCollateral?preCollateral-postCollateral:0n).toString(),
  actorOutstandingDebtBeforeInternal:actorDebtBefore.toString(),
  actorOutstandingDebtAfterInternal:actorDebtAfter.toString(),
  actorRepayFtBeforeAtomic:ftRepayBefore.toString(),actorRepayFtAfterAtomic:ftRepayAfter.toString(),
  actorSeizeFtBeforeAtomic:ftSeizeBefore.toString(),actorSeizeFtAfterAtomic:ftSeizeAfter.toString(),
  actorSeizeFtIncreaseAtomic:(actorFtReceived?ftSeizeAfter-ftSeizeBefore:0n).toString(),
  borrowerMutationVerified:validReceipt&&debtDecreased&&collateralDecreased,
  assetTransferObserved:validReceipt&&actorFtReceived,
  callbackSuccessObserved:validReceipt,
  currentMainnetAssetUnitsVerified:false,settlementAssetSold:false,
  swapProceedsVerified:false,gasCostInSettlementAssetVerified:false,
  fullContractStorageParityVerified:false,positiveNetProfitVerified:false,
  maySignMainnet:false,mayBroadcastMainnet:false,mainnetExecutionEnabled:false,blockers};
}

/** Stage49 — real imported Rhea pool and NEP-145 token storage checks.
 * Works only with an ephemeral NEAR Sandbox actor. Never mints/patches token
 * balances, derives wallet capital, or submits any mainnet transaction.
 */
const UINT=/^(0|[1-9][0-9]{0,38})$/;
const ID=/^[a-z0-9._-]{2,64}$/;
const U128=(1n<<128n)-1n;
const STORAGE_DEPOSIT_MAX=100000000000000000000000n; // 0.1 NEAR/token
const GAS=100000000000000n;
function amount(x,label,positive=false){
 if(typeof x!=='string'||!UINT.test(x)||BigInt(x)>U128||
  (positive&&BigInt(x)===0n))throw Error('STAGE49_INVALID_'+label);
 return BigInt(x);
}
function obj(x,label){
 if(!x||typeof x!=='object'||Array.isArray(x))
  throw Error('STAGE49_INVALID_'+label);
 return x;
}
function assetsMap(rows){
 if(!Array.isArray(rows)||rows.length===0||rows.length>1000)
  throw Error('STAGE49_BAD_ASSET_REGISTRY');
 const map=new Map();
 for(const row of rows){
  if(!Array.isArray(row)||row.length!==2||typeof row[0]!=='string'||
   !ID.test(row[0])||map.has(row[0]))
   throw Error('STAGE49_DUPLICATE_OR_INVALID_ASSET');
  map.set(row[0],obj(row[1],'ASSET'));
 }
 return map;
}
function checkReceipt(raw){
 const result=raw?.result??raw;
 if(!result||typeof result!=='object'||!['FINAL','EXECUTED_OPTIMISTIC'].includes(result.final_execution_status)||
  !result.status||typeof result.status!=='object'||
  !Object.hasOwn(result.status,'SuccessValue')||
  !Array.isArray(result.receipts_outcome)||!result.receipts_outcome.length||
  !result.receipts_outcome.every(r=>{
   const x=r?.outcome?.status;
   return x&&typeof x==='object'&&!Object.hasOwn(x,'Failure')&&
    (Object.hasOwn(x,'SuccessValue')||Object.hasOwn(x,'SuccessReceiptId'));
  }))
  throw Error('STAGE49_STORAGE_REGISTRATION_RECEIPT_FAILED');
}
function checkBalance(raw){
 if(raw===null)return false;
 const b=obj(raw,'STORAGE_BALANCE');
 amount(b.total,'STORAGE_TOTAL',true);
 amount(b.available,'STORAGE_AVAILABLE');
 if(BigInt(b.available)>BigInt(b.total))
  throw Error('STAGE49_UNRECONCILED_STORAGE_BALANCE');
 return true;
}
export function inspectStage49BorrowRoute(plan,remoteAssets,sandboxAssets){
 if(!plan||plan.mode!=='ARBIVANE_STAGE37_ISOLATED_SANDBOX_LIQUIDATION_PLAN'||
  plan.chain!=='NEAR_SANDBOX'||plan.method!=='execute_with_pyth'||
  plan.executionEnabled!==false||plan.mayBroadcastMainnet!==false||
  plan.maySignMainnet!==false||!Array.isArray(plan.actions)||plan.actions.length!==3)
  throw Error('STAGE49_UNTRUSTED_SANDBOX_PLAN');
 const borrow=plan.actions[0]?.Borrow,liq=plan.actions[1]?.Liquidate,
  withdraw=plan.actions[2]?.Withdraw;
 const repay=borrow?.token_id,seize=withdraw?.token_id;
 if(!ID.test(repay)||!ID.test(seize)||repay===seize||
  liq?.account_id!==plan.borrowerAccountId||
  liq?.in_assets?.length!==1||liq?.out_assets?.length!==1||
  liq.in_assets[0].token_id!==repay||liq.out_assets[0].token_id!==seize||
  amount(borrow.amount,'BORROW_AMOUNT',true)!==amount(liq.in_assets[0].amount,'REPAY_AMOUNT',true)||
  amount(liq.out_assets[0].amount,'SEIZE_AMOUNT',true)!==
   amount(withdraw.amount,'WITHDRAW_AMOUNT',true))
  throw Error('STAGE49_UNMATCHED_LIQUIDATION_ACTION_LEGS');
 // Do not use only the imported pool: cross-check exact pinned mainnet view.
 if(JSON.stringify(remoteAssets)!==JSON.stringify(sandboxAssets))
  throw Error('STAGE49_PINNED_MAINNET_SANDBOX_ASSETS_MISMATCH');
 const assets=assetsMap(remoteAssets),row=assets.get(repay);
 if(!row||!assets.has(seize))
  throw Error('STAGE49_REPAY_OR_SEIZE_ASSET_NOT_LISTED');
 const config=obj(row.config,'REPAY_ASSET_CONFIG');
 if(config.can_borrow!==true)throw Error('STAGE49_REPAY_ASSET_BORROW_DISABLED');
 const supplied=obj(row.supplied,'REPAY_SUPPLIED_POOL');
 const borrowed=obj(row.borrowed,'REPAY_BORROWED_POOL');
 const suppliedBalance=amount(supplied.balance,'REPAY_SUPPLIED_BALANCE',true);
 const borrowedBalance=amount(borrowed.balance,'REPAY_BORROWED_BALANCE');
 if(suppliedBalance<=borrowedBalance)
  throw Error('STAGE49_NO_INDICATIVE_POOL_BORROW_CAPACITY');
 return {
  mode:'ARBIVANE_STAGE49_SANDBOX_POOL_ROUTE_PREFLIGHT',
  chain:'NEAR_SANDBOX',borrowTokenId:repay,seizeTokenId:seize,
  borrowEnabled:true,borrowedInternalAmount:borrow.amount,
  indicativeAvailablePoolBalanceInternal:(suppliedBalance-borrowedBalance).toString(),
  exactBorrowCapacityAndSharesVerified:false,
  rawFtTokenAmountEquivalentToLendingUnitsVerified:false,
  actorBorrowPermissionVerified:false,
  mainnetTradingAllowed:false,netProfitVerified:false
 };
}
/** Executes only token-registration transactions on the imported local clone.
 * Never assumes an FT transfer amount from Rhea's internal lending units.
 */
export async function registerStage49SandboxTokenStorage({actor,tokens,plan}){
 if(!actor||typeof actor.callRaw!=='function'||!ID.test(actor.accountId)||
  !tokens||typeof tokens.get!=='function'||!plan||
  plan.chain!=='NEAR_SANDBOX'||plan.executionEnabled!==false||
  plan.mayBroadcastMainnet!==false||plan.maySignMainnet!==false)
  throw Error('STAGE49_SANDBOX_ONLY_REGISTRATION_REQUIRED');
 const ids=[plan.actions[0]?.Borrow?.token_id,plan.actions[2]?.Withdraw?.token_id];
 if(ids.some(id=>typeof id!=='string'||!ID.test(id))||ids[0]===ids[1])
  throw Error('STAGE49_INVALID_TOKEN_IDS');
 const registrations=[];
 for(const id of ids){
  const token=tokens.get(id);
  if(!token||typeof token.view!=='function')
   throw Error('STAGE49_IMPORTED_NEP141_TOKEN_REQUIRED');
  let balance;
  try{balance=await token.view('storage_balance_of',{account_id:actor.accountId});}
  catch{throw Error('STAGE49_TOKEN_STORAGE_METHOD_NOT_AVAILABLE');}
  let storageDepositYocto='0';
  if(!checkBalance(balance)){
   let bounds;
   try{bounds=await token.view('storage_balance_bounds',{});}
   catch{throw Error('STAGE49_STORAGE_BOUNDS_UNAVAILABLE');}
   const min=amount(obj(bounds,'STORAGE_BOUNDS').min,'STORAGE_MIN',true);
   if(min>STORAGE_DEPOSIT_MAX)throw Error('STAGE49_STORAGE_DEPOSIT_OVER_CAP');
   const raw=await actor.callRaw(token,'storage_deposit',
    {account_id:actor.accountId,registration_only:true},
    {gas:GAS,attachedDeposit:min});
   checkReceipt(raw);
   storageDepositYocto=min.toString();
   try{balance=await token.view('storage_balance_of',{account_id:actor.accountId});}
   catch{throw Error('STAGE49_STORAGE_POST_REGISTER_VIEW_FAILED');}
   if(!checkBalance(balance)||BigInt(balance.total)<min)
    throw Error('STAGE49_STORAGE_REGISTRATION_NOT_PERSISTED');
  }
  registrations.push({tokenId:id,registered:true,storageDepositYocto,
   sandboxMutationOnly:true});
 }
 return {mode:'ARBIVANE_STAGE49_SANDBOX_TOKEN_REGISTRATION',
  chain:'NEAR_SANDBOX',actorAccountId:actor.accountId,
  tokenRegistrations:registrations,
  totalNativeStorageDepositYocto:registrations.reduce(
   (n,r)=>n+BigInt(r.storageDepositYocto),0n).toString(),
  neP141WalletCapitalFunded:false,borrowerLiquidationExecuted:false,
  actualPoolLiquidityVerified:false,mainnetExecutionEnabled:false,
  maySignMainnet:false,mayBroadcastMainnet:false,positiveNetProfitVerified:false,
  blockers:['SANDBOX_FT_STORAGE_IS_NOT_TOKEN_FUNDING',
   'RHEA_INTERNAL_BORROW_REPAY_AND_COLLATERAL_ROUNDING_NOT_ATTESTED',
   'PENDING_REAL_RHEA_EXECUTE_WITH_PYTH_AND_SETTLEMENT_RECEIPTS']};
}

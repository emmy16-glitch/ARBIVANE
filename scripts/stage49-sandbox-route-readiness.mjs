/** Stage49 — inspect pinned Rhea asset permissions and register ONLY a fresh
 * disposable NEAR Sandbox actor. Read-only mainnet inspection; no mainnet tx.
 * NEP-145: query storage_balance_bounds / storage_balance_of, then storage_deposit.
 */
const ID=/^[a-z0-9._-]{2,64}$/;
const UINT=/^(0|[1-9][0-9]{0,38})$/;
const U128=(1n<<128n)-1n,YOCTO=10n**24n;
const MAX_PER_CONTRACT=YOCTO/10n,MAX_TOTAL=YOCTO*3n/10n;
function obj(v,reason){
 if(!v||typeof v!=='object'||Array.isArray(v))throw Error('STAGE49_'+reason);
 return v;
}
function u128(v,reason){
 if(typeof v!=='string'||!UINT.test(v)||BigInt(v)>U128)
  throw Error('STAGE49_'+reason);
 return BigInt(v);
}
function assetMap(assets){
 if(!Array.isArray(assets)||assets.length===0||assets.length>512)
  throw Error('STAGE49_INVALID_PINNED_ASSETS');
 const found=new Map();
 for(const tuple of assets){
  if(!Array.isArray(tuple)||tuple.length!==2||
   typeof tuple[0]!=='string'||!ID.test(tuple[0])||found.has(tuple[0]))
   throw Error('STAGE49_INVALID_OR_DUPLICATE_ASSET');
  found.set(tuple[0],obj(tuple[1],'INVALID_ASSET_ROW'));
 }
 return found;
}
export function inspectStage49RheaAssets(plan,assets,blockHeight){
 if(!plan||plan.mode!=='ARBIVANE_STAGE37_ISOLATED_SANDBOX_LIQUIDATION_PLAN'||
  plan.chain!=='NEAR_SANDBOX'||plan.executionEnabled!==false||
  plan.maySignMainnet!==false||plan.mayBroadcastMainnet!==false||
  !Number.isSafeInteger(blockHeight)||blockHeight<1||
  plan.mainnetSourceBlockHeight!==String(blockHeight))
  throw Error('STAGE49_UNTRUSTED_OR_CROSS_BLOCK_PLAN');
 const actions=plan.actions;
 const borrow=actions?.[0]?.Borrow;
 const liquidate=actions?.[1]?.Liquidate;
 const withdraw=actions?.at(-1)?.Withdraw;
 const repay=borrow?.token_id;
 const seize=withdraw?.token_id;
 const same=repay===seize;
 if(typeof repay!=='string'||typeof seize!=='string'||!ID.test(repay)||
  !ID.test(seize)||!Array.isArray(actions)||
  (same?actions.length!==4:actions.length!==3)||
  typeof plan.borrowerAccountId!=='string'||!ID.test(plan.borrowerAccountId)||
  liquidate?.account_id!==plan.borrowerAccountId||
  !Array.isArray(liquidate?.in_assets)||liquidate.in_assets.length!==1||
  !Array.isArray(liquidate?.out_assets)||liquidate.out_assets.length!==1||
  liquidate.in_assets[0]?.token_id!==repay||
  liquidate.out_assets[0]?.token_id!==seize)
  throw Error('STAGE49_INVALID_LIQUIDATION_ASSET_ROUTE');
 // The three actions MUST be one self-consistent route in Rhea's INTERNAL
 // lending units. This still does not prove raw FT-token units or solvency.
 const borrowedUnits=u128(borrow.amount,'INVALID_BORROW_UNITS');
 const repaidUnits=u128(liquidate.in_assets[0].amount,'INVALID_REPAY_UNITS');
 const seizedUnits=u128(liquidate.out_assets[0].amount,'INVALID_SEIZE_UNITS');
 const withdrawnUnits=u128(withdraw.amount,'INVALID_WITHDRAW_UNITS');
 const selfRepay=same?actions[2]?.Repay:null;
 if(same&&(!selfRepay||selfRepay.token_id!==repay))
  throw Error('STAGE49_SAME_TOKEN_SELF_REPAY_REQUIRED');
 const selfRepayUnits=same?u128(selfRepay.amount,'INVALID_SELF_REPAY_UNITS'):0n;
 // Non-forgeable local plan invariant: 10 ppm ceiling in excess borrowing,
 // fully self-repaid before any surplus is withdrawn. Source liquidation
 // repay/seize leg amounts themselves are never padded or repriced.
 const cushion=same?(repaidUnits+99999n)/100000n:0n;
 if(borrowedUnits===0n||repaidUnits===0n||seizedUnits===0n||withdrawnUnits===0n||
  borrowedUnits!==repaidUnits+cushion||
  (same?(selfRepayUnits!==borrowedUnits||seizedUnits<=borrowedUnits||
    withdrawnUnits!==seizedUnits-borrowedUnits):seizedUnits!==withdrawnUnits))
  throw Error('STAGE49_ACTION_AMOUNT_OR_ROUTE_CONTRADICTION');
 const market=assetMap(assets);
 const debt=market.get(repay),collateral=market.get(seize);
 if(!debt||!collateral)throw Error('STAGE49_MISSING_PINNED_REPAY_OR_SEIZE_POOL');
 const borrowConfig=obj(debt.config,'MISSING_REPAY_CONFIG');
 const withdrawConfig=obj(collateral.config,'MISSING_SEIZE_CONFIG');
 if(borrowConfig.can_borrow!==true)throw Error('STAGE49_REPAY_ASSET_NOT_BORROWABLE');
 if(withdrawConfig.can_withdraw!==true)
  throw Error('STAGE49_SEIZED_ASSET_WITHDRAWAL_DISABLED');
 const supplied=u128(obj(debt.supplied,'MISSING_REPAY_SUPPLY').balance,'INVALID_REPAY_SUPPLY');
 const borrowed=u128(obj(debt.borrowed,'MISSING_REPAY_DEBT').balance,'INVALID_POOL_BORROWED');
 if(supplied<=borrowed)throw Error('STAGE49_NO_INDICATIVE_REPAY_POOL_CAPACITY');
 // Supplied minus borrowed is ONLY a superficial pool signal; it does not
 // attest reserves, available native FT balance, share rounding or actor funds.
 return {mode:'ARBIVANE_STAGE49_PINNED_ASSET_ROUTE_PREFLIGHT',
  chain:'NEAR_MAINNET_READ_ONLY',sourceBlockHeight:String(blockHeight),
  repayTokenId:repay,seizeTokenId:seize,
  repayCanBorrow:true,seizedCanWithdraw:true,
  repayAndSeizeShareToken:repay===seize,
  grossPoolDifferenceInternal:(supplied-borrowed).toString(),
  poolAvailabilityVerified:false,actualFtUnitsVerified:false,
  realFinancingVerified:false,mainnetExecutionEnabled:false,
  maySignMainnet:false,mayBroadcastMainnet:false,
  status:'PINNED_PERMISSIONS_PASS_LIQUIDITY_UNVERIFIED'};
}
function storageBalance(v,reason){
 const r=obj(v,reason);
 return u128(r.total,'INVALID_STORAGE_TOTAL');
}
async function registerOne({actor,contract,contractId}){
 if(!contract||typeof contract.view!=='function'||typeof actor?.callRaw!=='function'||
  typeof actor.accountId!=='string'||!ID.test(actor.accountId)||!ID.test(contractId)||
  contract.accountId!==contractId)
  throw Error('STAGE49_SANDBOX_CONTRACT_OR_ACTOR_IDENTITY_MISMATCH');
 let previous,bounds;
 try {
  [previous,bounds]=await Promise.all([
   contract.view('storage_balance_of',{account_id:actor.accountId}),
   contract.view('storage_balance_bounds',{}),
  ]);
 }catch{throw Error('STAGE49_STORAGE_VIEWS_UNAVAILABLE_'+contractId);}
 const min=u128(obj(bounds,'INVALID_STORAGE_BOUNDS').min,'INVALID_STORAGE_MIN');
 if(min>MAX_PER_CONTRACT)
  throw Error('STAGE49_EXCESSIVE_CONTRACT_REGISTRATION_COST');
 let registered=previous!==null&&previous!==undefined;
 if(registered&&storageBalance(previous,'INVALID_EXISTING_STORAGE')<min)
  throw Error('STAGE49_INSUFFICIENT_EXISTING_STORAGE');
 if(!registered){
  let raw;
  try{
   raw=await actor.callRaw(contract,'storage_deposit',{
    account_id:actor.accountId,registration_only:true
   },{gas:30000000000000n,attachedDeposit:min});
  }catch{throw Error('STAGE49_SANDBOX_STORAGE_DEPOSIT_FAILED_'+contractId);}
  const result=raw?.result??raw;
  if(!result||typeof result!=='object'||!result.status||
   typeof result.status!=='object'||Object.hasOwn(result.status,'Failure')||
   !Object.hasOwn(result.status,'SuccessValue')||
   !Array.isArray(result.receipts_outcome)||
   result.receipts_outcome.length===0||
   result.receipts_outcome.some(row=>!row?.outcome?.status||
    Object.hasOwn(row.outcome.status,'Failure')))
   throw Error('STAGE49_SANDBOX_STORAGE_RECEIPT_NOT_SUCCESSFUL');
 }
 let post;
 try{post=await contract.view('storage_balance_of',{account_id:actor.accountId});}
 catch{throw Error('STAGE49_STORAGE_REGISTRATION_NOT_VISIBLE');}
 if(post===null||post===undefined||
  storageBalance(post,'INVALID_POST_REGISTRATION_BALANCE')<min)
  throw Error('STAGE49_SANDBOX_STORAGE_REGISTRATION_NOT_CONFIRMED');
 return {contractId,minimumYocto:min.toString(),paidYocto:registered?'0':min.toString(),
  alreadyRegistered:registered,postStorageConfirmed:true};
}
export async function registerStage49SandboxActor({actor,contracts,plan}){
 if(!plan||plan.chain!=='NEAR_SANDBOX'||plan.executionEnabled!==false||
  plan.maySignMainnet!==false||plan.mayBroadcastMainnet!==false||
  !contracts||typeof contracts.get!=='function')
  throw Error('STAGE49_LOCAL_SANDBOX_ONLY');
 const repay=plan.actions?.[0]?.Borrow?.token_id;
 const seize=plan.actions?.at(-1)?.Withdraw?.token_id;
 const same=repay===seize;
 if(typeof repay!=='string'||!ID.test(repay)||
  typeof seize!=='string'||!ID.test(seize)||
  !Array.isArray(plan.actions)||
  (same?(plan.actions.length!==4||
    plan.actions[2]?.Repay?.token_id!==repay):plan.actions.length!==3))
  throw Error('STAGE49_INVALID_REGISTERED_ASSET_SET');
 const ids=[plan.lendingContract,...new Set([repay,seize])];
 if(new Set(ids).size!==ids.length)
  throw Error('STAGE49_CONFLICTING_CONTRACT_ROLES');
 // Check every storage minimum BEFORE ANY local Sandbox mutation, so an
 // excessive fee in the third dependency cannot partially register the actor.
 const registered=[];
 let cost=0n;
 for(const id of ids){
  const c=contracts.get(id);
  if(!c||c.accountId!==id||typeof c.view!=='function')
   throw Error('STAGE49_REQUIRED_SANDBOX_STORAGE_CONTRACT_MISSING');
  let bounds,current;
  try{
   [bounds,current]=await Promise.all([
    c.view('storage_balance_bounds',{}),
    c.view('storage_balance_of',{account_id:actor?.accountId}),
   ]);
  }catch{throw Error('STAGE49_STORAGE_VIEWS_UNAVAILABLE_'+id);}
  const min=u128(obj(bounds,'INVALID_STORAGE_BOUNDS').min,'INVALID_STORAGE_MIN');
  if(min>MAX_PER_CONTRACT)throw Error('STAGE49_EXCESSIVE_CONTRACT_REGISTRATION_COST');
  if(current===null||current===undefined)cost+=min;
  else if(storageBalance(current,'INVALID_EXISTING_STORAGE')<min)
   throw Error('STAGE49_INSUFFICIENT_EXISTING_STORAGE');
 }
 if(cost>MAX_TOTAL)throw Error('STAGE49_EXCESSIVE_TOTAL_REGISTRATION_COST');
 for(const id of ids){
  registered.push(await registerOne({actor,contract:contracts.get(id),contractId:id}));
 }
 return {mode:'ARBIVANE_STAGE49_LOCAL_SANDBOX_REGISTRATION',
  chain:'NEAR_SANDBOX',actorAccountId:actor.accountId,
  registrations:registered,storagePaidYocto:registered.reduce(
   (n,row)=>n+BigInt(row.paidYocto),0n).toString(),
  status:'LOCAL_STORAGE_REGISTRATION_CONFIRMED',
  repayAndSeizeShareToken:repay===seize,
  borrowingCapacityVerified:false,repayLiquidityVerified:false,
  tokenConversionVerified:false,completeRheaLiquidationVerified:false,
  positiveNetProfitVerified:false,executionEnabled:false,
  maySignMainnet:false,mayBroadcastMainnet:false};
}

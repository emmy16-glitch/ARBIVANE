import {createHash} from 'node:crypto';

/** Stage142 offline-only financing intent. Input is an untrusted proposal, never
 * a signer authorization nor a deployed lender. No private keys or RPC writes.
 */
export const STAGE142_MODES=Object.freeze([
 'EXTERNAL_FLASH_LOAN','AUTHORIZED_PARTNER_ESCROW'
]);
const ID=/^[a-z0-9][a-z0-9._-]{1,63}$/;
const U128=(1n<<128n)-1n;
function uint(v,name,{positive=false}={}){
 if(typeof v!=='string'||!/^(0|[1-9][0-9]{0,38})$/.test(v)||
  BigInt(v)>U128||(positive&&v==='0'))throw Error('STAGE142_INVALID_'+name);
 return BigInt(v);
}
function acct(v,name){
 if(typeof v!=='string'||!ID.test(v))throw Error('STAGE142_INVALID_'+name);
 return v;
}
function digest(payload){return createHash('sha256').update(JSON.stringify(payload)).digest('hex');}
function exactKeys(v,allowed,name){
 if(!v||typeof v!=='object'||Array.isArray(v)||
  Object.keys(v).some(k=>!allowed.includes(k)))throw Error('STAGE142_INVALID_'+name);
}
export function stage142CreateFinancingIntent(spec){
 exactKeys(spec,['mode','sourceAccountId','repayAssetId','principalAtomic','premiumAtomic',
  'maxGasAndStorageInRepayAssetAtomic','maxSwapAndSlippageAtomic','minimumNetAtomic',
  'observedMinProceedsAtomic','ownerCollateralAtomic','partnerEscrowAtomic',
  'operatorAccountId','borrowerAccountId','quoteExpiresAtMs','evaluatedAtMs'], 'FINANCING_INPUT');
 const mode=spec.mode;
 if(!STAGE142_MODES.includes(mode))throw Error('STAGE142_UNKNOWN_FUNDING_MODE');
 const src=acct(spec.sourceAccountId,'PROVIDER_ACCOUNT');
 const operator=acct(spec.operatorAccountId,'OPERATOR_ACCOUNT');
 const borrower=acct(spec.borrowerAccountId,'BORROWER');
 if(src===operator||src==='okunlola_labs.near'||src===borrower)
  throw Error('STAGE142_FORBIDDEN_CUSTODY_ROLE_COLLISION');
 if(operator!=='sillywiki4201.near')throw Error('STAGE142_UNAUTHORIZED_EXECUTOR_PLACEHOLDER');
 if(spec.repayAssetId!=='linear-protocol.near')
  throw Error('STAGE142_UNSUPPORTED_LIQUIDATION_REPAY_ASSET');
 const principal=uint(spec.principalAtomic,'PRINCIPAL',{positive:true});
 const premium=uint(spec.premiumAtomic,'PREMIUM');
 const fees=uint(spec.maxGasAndStorageInRepayAssetAtomic,'GAS_AND_STORAGE');
 const slippage=uint(spec.maxSwapAndSlippageAtomic,'SLIPPAGE');
 const minimum=uint(spec.minimumNetAtomic,'MINIMUM_NET',{positive:true});
 const proceeds=uint(spec.observedMinProceedsAtomic,'OBSERVED_PROCEEDS');
 const user=uint(spec.ownerCollateralAtomic,'OWNER_COLLATERAL');
 const escrow=uint(spec.partnerEscrowAtomic,'PARTNER_ESCROW');
 if(user!==0n)throw Error('STAGE142_OWNER_FUNDS_ARE_NOT_AVAILABLE');
 if(mode==='EXTERNAL_FLASH_LOAN'&&escrow!==0n)
  throw Error('STAGE142_FLASH_LOAN_CANNOT_PRETEND_ESCROW');
 if(mode==='AUTHORIZED_PARTNER_ESCROW'&&escrow<principal+premium)
  throw Error('STAGE142_PARTNER_ESCROW_NOT_SUFFICIENT_TO_COVER_LIABILITY');
 for(const key of ['evaluatedAtMs','quoteExpiresAtMs']){
  if(!Number.isSafeInteger(spec[key])||spec[key]<0)
   throw Error('STAGE142_INVALID_'+key);
 }
 if(spec.quoteExpiresAtMs<=spec.evaluatedAtMs||
  spec.quoteExpiresAtMs-spec.evaluatedAtMs>300000)
  throw Error('STAGE142_EXPIRED_OR_UNBOUNDED_QUOTE');
 const fullCost=principal+premium+fees+slippage;
 if(fullCost>U128)throw Error('STAGE142_COST_OVERFLOW');
 const indicativeNet=proceeds-fullCost;
 const blockers=[
  'STAGE141_HAS_NO_ATTESTED_NEAR_NATIVE_UNCOLLATERALIZED_LINEAR_LENDER',
  'ASYNCHRONOUS_TOKEN_TRANSFER_AND_LENDER_RECOVERY_UNPROVEN',
  'FULL_EXTERNAL_FINANCING_RHEA_SANDBOX_RECEIPTS_MISSING',
  'ACTUAL_GAS_STORAGE_SWAP_AND_NET_SETTLEMENT_UNPROVEN',
  'NO_OWNER_AUTHORIZATION_FOR_MAINNET_EXECUTION'
 ];
 if(indicativeNet<minimum)blockers.push('INDICATIVE_NET_BELOW_MINIMUM');
 if(mode==='EXTERNAL_FLASH_LOAN')
  blockers.push('REAL_FLASH_LENDER_ABI_LIQUIDITY_AND_REPAYMENT_NOT_VERIFIED');
 else blockers.push('NO_REAL_PARTNER_ESCROW_DEPOSIT_OR_SIGNED_FUNDING_AGREEMENT');
 const immutable={
  mode:'STAGE142_FINANCING_INTENT',network:'NEAR_SANDBOX_RESEARCH',
  financingMode:mode,sourceAccountId:src,operatorAccountId:operator,
  borrowerAccountId:borrower,repayAssetId:spec.repayAssetId,
  principalAtomic:principal.toString(),premiumAtomic:premium.toString(),
  minimumNetAtomic:minimum.toString(),
  maxGasAndStorageAtomic:fees.toString(),maxSwapAndSlippageAtomic:slippage.toString(),
  indicativeProceedsAtomic:proceeds.toString(),
  indicativeNetAtomic:indicativeNet.toString(),
  configuredPartnerEscrowAtomic:escrow.toString(),
  quoteExpiresAtMs:spec.quoteExpiresAtMs,
  quoteEvaluatedAtMs:spec.evaluatedAtMs,
  noOwnerCollateralExpected:true,
  fundingSourceVerified:false,realLoanFundsTransferred:false,
  realExternalLoanRepaymentVerified:false,
  sandboxLiquidationWithExternalFundingExecuted:false,
  maySignMainnet:false,mayBroadcastMainnet:false,
  allowLoanExecution:false,allowProfitPayout:false,
  blockers
 };
 return Object.freeze({ ...immutable,intentHash:digest(immutable) });
}
export function stage142VerifyIntentIntegrity(intent){
 if(intent?.mode!=='STAGE142_FINANCING_INTENT')return false;
 const {intentHash,...payload}=intent;
 return typeof intentHash==='string'&&/^[a-f0-9]{64}$/.test(intentHash)&&
  digest(payload)===intentHash&&
  payload.maySignMainnet===false&&payload.allowLoanExecution===false&&
  payload.realLoanFundsTransferred===false;
}

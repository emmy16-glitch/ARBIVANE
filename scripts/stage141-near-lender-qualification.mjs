import {stage140InspectNativeAccounts} from './stage140-native-flash-provider-discovery.mjs';

/** Source-identified mainnet accounts, NOT vetted lenders.
 * Every item is independently named in a protocol's published contract
 * directory or docs; neither balances nor method names prove lending.
 */
export const STAGE141_WATCHLIST=Object.freeze([
 Object.freeze({id:'contract.main.burrow.near',role:'RHEA_COLLATERAL_LENDING',
  source:'https://guide.rhea.finance/developers/contracts'}),
 Object.freeze({id:'v2.ref-finance.near',role:'RHEA_CLASSIC_AMM',
  source:'https://github.com/ref-finance/guide/blob/main/developers/contracts.md'}),
 Object.freeze({id:'dclv2.ref-labs.near',role:'RHEA_CONCENTRATED_SWAP_LIQUIDITY',
  source:'https://github.com/ref-finance/ref-sdk'}),
 Object.freeze({id:'linear-protocol.near',role:'LINEAR_NEP141_TOKEN',
  source:'https://docs.linearprotocol.org/developer-guide/contract-overview'}),
 Object.freeze({id:'intents.near',role:'NEAR_INTENTS_SETTLEMENT',
  source:'https://docs.near-intents.org/integration/verifier-contract/account-abstraction'}),
 Object.freeze({id:'dex.intear.near',role:'INTEAR_DEX',
  source:'https://docs.intear.tech/dex-aggregator/reference/dexs/'})
]);
const RETIREMENT='NO_VERIFIED_UNCOLLATERALIZED_NATIVE_LINEAR_LOAN_SOURCE';
const REASONS=Object.freeze([
 'A_NAMED_FLASH_EXPORT_DOES_NOT_ESTABLISH_PUBLIC_LOAN_ABI',
 'NO_AUTHENTIC_UNCOLLATERALIZED_PRINCIPAL_TRANSFER_AND_REPAYMENT_RECEIPTS',
 'NEAR_ASYNC_FAILURE_RECOVERY_AND_LENDER_CAPITAL_SAFETY_UNVERIFIED',
 'AVAILABLE_ONCHAIN_BALANCE_IS_NOT_AN_OFFER_TO_LEND',
 'NO_VERIFIED_BORROW_ASSET_FEE_GAS_STORAGE_OR_POSITIVE_SETTLED_NET_PROFIT',
 'OWNER_HAS_NOT_AUTHORIZED_LIVE_MAINNET_SIGNING'
]);
function finiteBlock(n){
 return Number.isSafeInteger(n)&&n>0;
}
function canonicalU128(v){
 return typeof v==='string'&&/^(0|[1-9][0-9]{0,38})$/.test(v)&&BigInt(v)<=(1n<<128n)-1n;
}
function decodeResult(bytes){
 if(!Array.isArray(bytes)||bytes.length>8192||bytes.some(x=>!Number.isInteger(x)||x<0||x>255))
  throw Error('STAGE141_UNTRUSTED_VIEW_RESULT_BYTES');
 const str=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(bytes));
 return JSON.parse(str);
}
/** ONLY NEAR JSON-RPC query call_function for token metadata and token balance.
 * Uses source proof's exact finalized block for each queried account.
 */
async function readView(rpcUrl,fetcher,accountId,method,args,height){
 if(!finiteBlock(height))throw Error('STAGE141_UNPINNED_VIEW');
 const arg=Buffer.from(JSON.stringify(args)).toString('base64');
 const ctl=new AbortController();
 const timeout=setTimeout(()=>ctl.abort(),15000);
 try{
  const res=await fetcher(rpcUrl,{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({
    jsonrpc:'2.0',id:141,method:'query',
    params:{request_type:'call_function',account_id:accountId,
      method_name:method,args_base64:arg,block_id:height}
   }),signal:ctl.signal
  });
  if(!res.ok)throw Error('STAGE141_VIEW_RPC_HTTP_FAILURE');
  const l=res.headers?.get?.('content-length');
  if(l&&Number(l)>150000)throw Error('STAGE141_OVERSIZED_VIEW_REPLY');
  const payload=await res.json();
  if(payload?.error||!payload?.result||
   payload.result.block_height!==height)
   throw Error('STAGE141_VIEW_ERROR_OR_CROSS_BLOCK_DRIFT');
  return decodeResult(payload.result.result);
 }finally{clearTimeout(timeout);}
}
export function stage141QualifyEntry(row,{loanTokenMetadataVerified=false,
 tokenAccountBalanceAtomic=null}={}){
 if(!row||typeof row!=='object'||typeof row.accountId!=='string')
  throw Error('STAGE141_MISSING_ACCOUNT_ID');
 if(tokenAccountBalanceAtomic!==null&&!canonicalU128(tokenAccountBalanceAtomic))
  throw Error('STAGE141_UNTRUSTED_LOAN_ASSET_BALANCE');
 const hasKnownExport=row.wasmSha256MatchesChainCodeHash===true&&
  Array.isArray(row.exportedFlashCandidates)&&row.exportedFlashCandidates.length>0;
 const verifiedHash=row.wasmSha256MatchesChainCodeHash===true&&
  typeof row.verifiedDeployedCodeHash==='string';
 return {
  accountId:row.accountId,
  role:STAGE141_WATCHLIST.find(x=>x.id===row.accountId)?.role??'UNCLASSIFIED_NATIVE_ACCOUNT',
  deployedWasmHashVerified:verifiedHash,
  verifiedDeployedCodeHash:verifiedHash?row.verifiedDeployedCodeHash:null,
  finalBlockHeight:finiteBlock(row.finalBlockHeight)?row.finalBlockHeight:null,
  observedFlashNamedExports:hasKnownExport?[...row.exportedFlashCandidates]:[],
  lenderTokenMetadataVerified:loanTokenMetadataVerified,
  // An NEP-141 balance belongs to a wallet/contract, not to ARBIVANE.
  observedContractHeldLinearAtomic:tokenAccountBalanceAtomic,
  observedBalanceIsBorrowableLiquidity:false,
  observedBalanceIsFlashLoanOffer:false,
  externalLoanContractVerified:false,
  flashLoanAbiVerified:false,
  borrowerNeedsNoCollateralVerified:false,
  asynchronousRepaymentGuaranteeVerified:false,
  uncollateralizedPrincipalTransferVerified:false,
  gasSponsorshipVerified:false,
  positiveFullySettledLiquidationVerified:false,
  loanExecutionAllowed:false,
  status:!verifiedHash?'DEPLOYED_WASM_NOT_ATTESTED':
   hasKnownExport?'FLASH_NAMED_EXPORT_REQUIRES_REAL_LOAN_EVIDENCE':
   'NO_RECOGNIZED_FLASH_LOAN_EXPORT',
  blockers:[...REASONS,...(!verifiedHash?['DEPLOYED_WASM_IDENTITY_NOT_VERIFIED']:[]),
   ...(!hasKnownExport?['NO_RECOGNIZED_FLASH_METHOD_EXPORTED']:[]),
   ...(!loanTokenMetadataVerified?['LINEAR_FT_METADATA_NOT_INDEPENDENTLY_VERIFIED']:[])]
 };
}
export async function stage141Survey({
 rpcUrl='https://rpc.mainnet.near.org',fetcher=fetch,now=()=>Date.now()
}={}){
 const chain=await stage140InspectNativeAccounts({
  rpcUrl,fetcher,accounts:STAGE141_WATCHLIST.map(x=>x.id),now
 });
 const token=chain.results.find(x=>x.accountId==='linear-protocol.near');
 let loanTokenMetadataVerified=false;
 let loanTokenMetadata=null,loanTokenMetadataReason='LIQUIDATOR_LOAN_TOKEN_WASM_NOT_VERIFIED';
 if(token?.wasmSha256MatchesChainCodeHash&&finiteBlock(token.finalBlockHeight)){
  try{
   const m=await readView(rpcUrl,fetcher,'linear-protocol.near','ft_metadata',{},
    token.finalBlockHeight);
   // NEP-141 metadata is contract-reported: symbol/decimals do not themselves
   // authorize lending and may change after code upgrades.
   if(m?.spec!=='ft-1.0.0'||!Number.isInteger(m.decimals)||
    m.decimals<0||m.decimals>38||
    typeof m.name!=='string'||m.name.length>150||
    typeof m.symbol!=='string'||m.symbol.length>40)
    throw Error('STAGE141_BAD_NEP141_METADATA');
   loanTokenMetadata={spec:m.spec,symbol:m.symbol,decimals:m.decimals,
    name:m.name,codeHash:token.verifiedDeployedCodeHash,
    blockHeight:token.finalBlockHeight};
   loanTokenMetadataVerified=true;loanTokenMetadataReason=null;
  }catch(e){loanTokenMetadataReason=e?.message?.startsWith('STAGE141_')?
   e.message:'FT_METADATA_UNAVAILABLE_OR_UNTRUSTED';}
 }
 const qualified=[];
 for(const row of chain.results){
  let balance=null, balanceReason='NO_REASON_TO_ASSUME_FLASH_LOAN_LIQUIDITY';
  // Only inspect balances of contracts with a candidate export, as balance
  // is not the lender's maximum loan amount and may be allocated/locked.
  if(loanTokenMetadataVerified&&row.wasmSha256MatchesChainCodeHash&&
     row.exportedFlashCandidates.length>0&&finiteBlock(row.finalBlockHeight)){
   try{
    const val=await readView(rpcUrl,fetcher,'linear-protocol.near','ft_balance_of',
     {account_id:row.accountId},row.finalBlockHeight);
    if(!canonicalU128(val))throw Error('STAGE141_NONCANONICAL_FT_BALANCE');
    balance=val;balanceReason=null;
   }catch(e){balanceReason=e?.message?.startsWith('STAGE141_')?
    e.message:'LINEAR_BALANCE_VIEW_FAILED';}
  }
  qualified.push({...stage141QualifyEntry(row,{loanTokenMetadataVerified,
   tokenAccountBalanceAtomic:balance}),
   documentedSource:STAGE141_WATCHLIST.find(x=>x.id===row.accountId)?.source??null,
   observedContractTokenBalanceReason:balanceReason,
   rawExportDiscoveryStatus:row.status
  });
 }
 return {
  mode:'STAGE141_EXTENDED_NEAR_LENDER_QUALIFICATION',
  network:'NEAR_MAINNET',chainReadOnly:true,
  observedAtMs:now(),providerCountExamined:qualified.length,
  loanTokenId:'linear-protocol.near',
  loanTokenMetadataVerified,loanTokenMetadata,loanTokenMetadataReason,
  fundingStatus:RETIREMENT,
  qualifyingUncollateralizedProviders:[],
  deploymentInspectionIsNotLoanAvailabilityProof:true,
  lenderConnectedForBorrowing:false,
  ownerWallet:'okunlola_labs.near',
  proposedRestrictedExecutor:'sillywiki4201.near',
  maySignMainnet:false,mayBroadcastMainnet:false,
  actualFundsBorrowed:false,realizedTradingProfit:false,
  candidates:qualified
 };
}

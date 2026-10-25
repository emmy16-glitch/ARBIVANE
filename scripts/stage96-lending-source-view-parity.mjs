/** Stage96 — compare source-pinned Rhea views to the actually imported
 * deployed Wasm, one method at a time. A partial account closure can only be
 * admitted if every relevant view agrees exactly. No synthetic state.
 */
const ID=/^[a-z0-9._-]{2,64}$/;
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export async function attestStage96LendingSourceViews({
 lending,borrowerAccountId,sourceConfig,sourceBorrower,sourceAssets
}){
 if(!lending||typeof lending.view!=='function'||
  lending.accountId!=='contract.main.burrow.near'||
  !ID.test(borrowerAccountId)||
  !sourceConfig||!sourceBorrower||!Array.isArray(sourceAssets))
  throw Error('STAGE96_UNTRUSTED_LENDING_PARITY_REQUEST');
 const checks=[
  ['get_config',{},sourceConfig,'CONFIG'],
  ['get_account_all_positions',{account_id:borrowerAccountId},sourceBorrower,'BORROWER'],
  ['get_assets_paged',{},sourceAssets,'MARKET_ASSETS'],
 ];
 const verified=[];
 for(const [method,args,expected,label] of checks){
  let actual;
  try{actual=await lending.view(method,args);}
  catch{throw Error('STAGE96_SANDBOX_'+label+'_VIEW_FAILED');}
  if(!equal(actual,expected))
   throw Error('STAGE96_SANDBOX_'+label+'_SOURCE_PARITY_MISMATCH');
  verified.push(label);
 }
 return {
  pinnedConfigMatches:true,pinnedBorrowerMatches:true,
  pinnedAssetsMatch:true,verified,
  allRequiredViewsVerified:true,
  completeTrieRootParityVerified:false,
  actualRheaSettlementVerified:false,mainnetMutated:false,
 };
}

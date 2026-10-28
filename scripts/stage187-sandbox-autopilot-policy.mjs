/** Readonly-source admission for genuine NEAR Workspaces Sandbox automation. */
const CODE_HASH=/^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const MONEY=/^(?:0|[1-9][0-9]{0,8})(?:\.[0-9]{1,2})?$/;
function safeRpc(value){
 try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&!url.hash;}
 catch{return false}
}
export function validateAutopilotEnvironment(e){
 if(e.ARBIVANE_SANDBOX_AUTOPILOT_ENABLED!=='true'||
  e.EXECUTION_ENABLED!=='false'||e.NEAR_NETWORK!=='mainnet'||
  e.NEAR_WORKSPACES_NETWORK!=='sandbox'||e.NEAR_PRIVATE_KEY||
  e.MAINNET_PRIVATE_KEY||e.NEAR_ACCOUNT_ID||
  !safeRpc(e.NEAR_RPC_URL)||!CODE_HASH.test(e.RHEA_EXPECTED_LENDING_CODE_HASH??'')||
  !CODE_HASH.test(e.RHEA_EXPECTED_ORACLE_CODE_HASH??'')||
  (e.RHEA_LENDING_CONTRACT&&e.RHEA_LENDING_CONTRACT!=='contract.main.burrow.near')||
  (e.RHEA_ORACLE_CONTRACT&&e.RHEA_ORACLE_CONTRACT!=='aggregate-oracle.near')||
  !MONEY.test(e.ARBIVANE_MAX_FINANCING_USD??'')||
  Number(e.ARBIVANE_MAX_FINANCING_USD)<=0||
  !MONEY.test(e.ARBIVANE_MINIMUM_NET_PROFIT_USD??''))
  throw Error('STAGE187_KEYLESS_SANDBOX_PREREQUISITES_REQUIRED');
 return true;
}
export function admitAutopilotProposal(proposal,budget,{buildPlan,verifyBudget}){
 if(proposal?.mode!=='RHEA_STAGE35_PINNED_SOURCE_ONLY_LIQUIDATION_SIZING'||
  proposal.chain!=='NEAR_MAINNET'||proposal.referenceRulesPass!==true||
  proposal.repay?.tokenId!=='linear-protocol.near'||
  proposal.seize?.tokenId!=='linear-protocol.near'||
  proposal.executionEnabled!==false||proposal.maySign!==false||
  proposal.mayBroadcast!==false)
  return {admitted:false,reason:'SOURCE_RULE_OR_LiNEAR_ROUTE_NOT_VERIFIED'};
 try{
  buildPlan(proposal);
  verifyBudget(proposal,budget);
 }catch(error){
  return {admitted:false,reason:String(error?.message??'SOURCE_ADMISSION_DENIED').slice(0,100)};
 }
 return {admitted:true,reason:'SOURCE_PLAN_AND_FINANCING_CAP_ADMITTED_SANDBOX_ONLY'};
}
export function nextScanCursor(start,next,total){
 if(!Number.isSafeInteger(start)||start<0||!Number.isSafeInteger(next)||
  next<=start||!Number.isSafeInteger(total)||total<next||total<=0)
  throw Error('STAGE187_INVALID_PAGED_SCAN_CURSOR');
 return next===total?0:next;
}


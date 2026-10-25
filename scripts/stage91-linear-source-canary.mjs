#!/usr/bin/env node
/** Real, credential-free historical LiNEAR indexed storage closure canary.
 * Not a lending action, not a mainnet transaction or liquidation receipt.
 */
import {readFile,writeFile} from 'node:fs/promises';
import {NearReadOnlyRpc} from '../src/rhea/rpc.ts';
import {cloneStage91LinearToken} from './stage91-targeted-linear-token.mjs';
const e=process.env,output='stage91-linear-canary-evidence.json';
const ID=/^[a-z0-9._-]{2,64}$/;
const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
let worker;
const report={
 mode:'ARBIVANE_STAGE91_AUTHENTIC_LINEAR_INDEX_CANARY',
 status:'BLOCKED_UNVERIFIED_LINEAR_CLOSURE',failureCode:null,
 chain:'NEAR_SANDBOX',sourceNetwork:'NEAR_MAINNET_READ_ONLY',
 pinnedBorrower:null,sourceBlockHeight:null,tokenId:'linear-protocol.near',
 importerEvidence:null,realMainnetExecuted:false,
 localLiquidationAttempted:false,actualRheaSettlementVerified:false,
 positiveNetProfitVerified:false,maySignMainnet:false,mayBroadcastMainnet:false,
};
const safeError=x=>{
 const s=x instanceof Error?x.message:'';
 return /^STAGE(?:45|46|77|80|89|90|91)_[A-Z0-9_]{1,115}$/.test(s)?s:
 'STAGE91_UNCLASSIFIED_REAL_LINEAR_IMPORT_FAILURE';
};
try{
 if(e.EXECUTION_ENABLED!=='false'||e.NEAR_NETWORK!=='mainnet'||
  e.NEAR_WORKSPACES_NETWORK!=='sandbox'||e.STAGE91_ALLOW_LOCAL_PATCH!=='true'||
  e.NEAR_PRIVATE_KEY||e.MAINNET_PRIVATE_KEY||e.NEAR_ACCOUNT_ID||
  !e.NEAR_RPC_URL||new URL(e.NEAR_RPC_URL).protocol!=='https:'||
  e.STAGE91_PINNED_CANDIDATE_PATH!=='source/stage38-positive-stage35-evidence.json')
  throw Error('STAGE91_LOCAL_SANDBOX_READONLY_MAINNET_ONLY');
 const p=JSON.parse(await readFile(e.STAGE91_PINNED_CANDIDATE_PATH,'utf8'));
 const block=Number(p.blockHeight);
 if(p.mode!=='RHEA_STAGE35_PINNED_SOURCE_ONLY_LIQUIDATION_SIZING'||
  p.chain!=='NEAR_MAINNET'||p.referenceRulesPass!==true||
  p.executionEnabled!==false||p.maySign!==false||p.mayBroadcast!==false||
  p.repay?.tokenId!=='linear-protocol.near'||
  p.seize?.tokenId!=='linear-protocol.near'||
  !Number.isSafeInteger(block)||block<1||!HASH.test(p.lendingCodeHash)||
  !ID.test(p.borrowerAccountId))
  throw Error('STAGE91_INVALID_REAL_LINEAR_BORROWER_SOURCE');
 report.pinnedBorrower=p.borrowerAccountId;report.sourceBlockHeight=String(block);
 const rpc=new NearReadOnlyRpc(e.NEAR_RPC_URL);
 const lending=await rpc.viewAccount('contract.main.burrow.near',block);
 if(lending.blockHeight!==String(block)||lending.codeHash!==p.lendingCodeHash)
  throw Error('STAGE91_CROSS_BLOCK_RHEA_SOURCE_CODE_MISMATCH');
 const {Worker}=await import('near-workspaces');
 worker=await Worker.init({network:'sandbox'});
 const clone=await cloneStage91LinearToken({
  root:worker.rootAccount,rpc,endpoint:e.NEAR_RPC_URL,blockHeight:block,
  lendingAccountId:'contract.main.burrow.near',borrowerAccountId:p.borrowerAccountId,
  fallbackEndpoint:e.STAGE45_ARCHIVAL_FALLBACK_URL?.trim()||
   'https://archival-rpc.mainnet.near.org',paceMs:450,
 });
 if(clone.evidence.criticalFtViewsAgreeWithSource!==true||
  clone.evidence.exactHistoricalIndexKeyValueVerified!==true||
  clone.evidence.originalDeployedWasmVerified!==true||
  clone.evidence.recordsRead!==clone.evidence.recordsPatched||
  clone.evidence.mainnetMutated!==false||
  clone.evidence.realLiquidationVerified!==false)
  throw Error('STAGE91_SOURCE_CLOSURE_PARITY_UNATTESTED');
 report.importerEvidence=clone.evidence;
 report.status='HISTORICAL_LINEAR_INDEX_AND_FT_VIEWS_VERIFIED_NOT_LIQUIDATION';
}catch(error){
 report.failureCode=safeError(error);
 process.exitCode=2;
}finally{
 if(worker)await worker.tearDown().catch(()=>{});
 await writeFile(output,JSON.stringify(report,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({status:report.status,failureCode:report.failureCode,
  records:report.importerEvidence?.recordsRead??0,
  localLiquidationAttempted:false,realMainnetExecuted:false,
  mayBroadcastMainnet:false}));
}

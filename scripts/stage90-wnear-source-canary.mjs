#!/usr/bin/env node
/** Stage90 — validate the deployed historical wNEAR tiny-closure importer
 * against one genuinely source-qualified Rhea borrower, without importing
 * any other dependency, borrowing, liquidating, signing or touching mainnet.
 */
import {readFile,writeFile} from 'node:fs/promises';
import {NearReadOnlyRpc} from '../src/rhea/rpc.ts';
import {cloneStage89WrappedNear} from './stage89-targeted-wnear-clone.mjs';

const env=process.env;
const OUT='stage90-wnear-canary-evidence.json';
const ID=/^[a-z0-9._-]{2,64}$/;
const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const safeError=error=>{
 const code=error instanceof Error?error.message:'';
 return /^STAGE(?:37|45|46|77|80|82|88|89|90)_[A-Z0-9_]{1,115}$/.test(code)?
  code:'STAGE90_UNCLASSIFIED_SANDBOX_WNEAR_CANARY_FAILURE';
};
const evidence={
 mode:'ARBIVANE_STAGE90_REAL_PINNED_WNEAR_CANARY',
 chain:'NEAR_SANDBOX',sourceNetwork:'NEAR_MAINNET_READ_ONLY',
 status:'BLOCKED_NO_VERIFIED_WNEAR_PARITY',reason:null,
 borrowerAccountId:null,sourceBlockHeight:null,
 historicalRheaCodeHashVerified:false,wnearSourceViewsReconciled:false,
 wnearImportEvidence:null,
 fullLendingMarketImported:false,otherDependenciesImported:false,
 actualRheaLiquidationAttempted:false,actualRheaSettlementVerified:false,
 realMainnetExecuted:false,maySignMainnet:false,mayBroadcastMainnet:false,
 positiveNetProfitVerified:false,
};
let worker;
try{
 if(env.EXECUTION_ENABLED!=='false'||
  env.NEAR_NETWORK!=='mainnet'||
  env.NEAR_WORKSPACES_NETWORK!=='sandbox'||
  env.STAGE90_ALLOW_LOCAL_STATE_PATCH!=='true'||
  env.NEAR_PRIVATE_KEY||env.MAINNET_PRIVATE_KEY||env.NEAR_ACCOUNT_ID||
  !env.NEAR_RPC_URL||new URL(env.NEAR_RPC_URL).protocol!=='https:')
  throw Error('STAGE90_READONLY_MAINNET_SANDBOX_ONLY');
 const file=env.STAGE90_PINNED_CANDIDATE_PATH;
 if(file!=='source/stage38-positive-stage35-evidence.json')
  throw Error('STAGE90_UNTRUSTED_SOURCE_ARTIFACT_PATH');
 const proposal=JSON.parse(await readFile(file,'utf8'));
 const block=Number(proposal.blockHeight);
 if(proposal.mode!=='RHEA_STAGE35_PINNED_SOURCE_ONLY_LIQUIDATION_SIZING'||
  proposal.chain!=='NEAR_MAINNET'||
  proposal.referenceRulesPass!==true||
  proposal.executionEnabled!==false||
  proposal.maySign!==false||proposal.mayBroadcast!==false||
  !Number.isSafeInteger(block)||block<1||
  typeof proposal.borrowerAccountId!=='string'||
  !ID.test(proposal.borrowerAccountId)||
  !HASH.test(proposal.lendingCodeHash))
  throw Error('STAGE90_UNTRUSTED_AUTHENTIC_BORROWER_SOURCE');
 evidence.borrowerAccountId=proposal.borrowerAccountId;
 evidence.sourceBlockHeight=String(block);
 const rpc=new NearReadOnlyRpc(env.NEAR_RPC_URL);
 const deployed=await rpc.viewAccount('contract.main.burrow.near',block);
 if(deployed.blockHeight!==String(block)||
  deployed.codeHash!==proposal.lendingCodeHash)
  throw Error('STAGE90_HISTORICAL_RHEA_CODE_HASH_MISMATCH');
 evidence.historicalRheaCodeHashVerified=true;
 const {Worker}=await import('near-workspaces');
 worker=await Worker.init({network:'sandbox'});
 const {evidence:actual}=await cloneStage89WrappedNear({
  root:worker.rootAccount,rpc,endpoint:env.NEAR_RPC_URL,
  blockHeight:block,lendingAccountId:'contract.main.burrow.near',
  borrowerAccountId:proposal.borrowerAccountId,
  fallbackEndpoint:env.STAGE45_ARCHIVAL_FALLBACK_URL?.trim()||
   'https://archival-rpc.mainnet.near.org',
  paceMs:450,
 });
 if(actual.contractId!=='wrap.near'||
  actual.blockHeight!==String(block)||
  actual.relevantAccountViewParityVerified!==true||
  actual.originalFtSupplyVerified!==true||
  actual.originalDeployedWasmVerified!==true||
  actual.recordsRead!==actual.recordsPatched||
  actual.mainnetMutated!==false||
  actual.verifiedLiquidationReceipts!==false)
  throw Error('STAGE90_INCOMPLETE_PINNED_WNEAR_PARITY');
 evidence.wnearSourceViewsReconciled=true;
 evidence.wnearImportEvidence=actual;
 evidence.status='PINNED_WNEAR_STATE_AND_SOURCE_VIEWS_MATCH_NOT_LIQUIDATION';
}catch(error){
 evidence.reason=safeError(error);
 process.exitCode=2;
}finally{
 if(worker)await worker.tearDown().catch(()=>{});
 await writeFile(OUT,JSON.stringify(evidence,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({mode:evidence.mode,status:evidence.status,reason:evidence.reason,
  borrowerAccountId:evidence.borrowerAccountId,sourceBlockHeight:evidence.sourceBlockHeight,
  wnearSourceViewsReconciled:evidence.wnearSourceViewsReconciled,
  actualRheaSettlementVerified:false,mayBroadcastMainnet:false}));
}

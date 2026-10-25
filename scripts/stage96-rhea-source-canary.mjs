#!/usr/bin/env node
/** Stage96 real original Rhea borrower source-view replay in NEAR Sandbox.
 * No oracle/FT funding, no transactions, and no misleading profits.
 */
import {readFile,writeFile} from 'node:fs/promises';
import {NearReadOnlyRpc} from '../src/rhea/rpc.ts';
import {cloneStage82BorrowerLending} from './stage82-targeted-lending-clone.mjs';
import {attestStage96PinnedRheaViews,stage96SafeError} from './stage96-rhea-view-parity.mjs';
const env=process.env,OUT='stage96-borrower-canary-evidence.json';
const ID=/^[a-z0-9._-]{2,64}$/;
const HASH=/^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const report={mode:'STAGE96_REAL_HISTORICAL_RHEA_VIEW_CANARY',
 status:'BLOCKED_UNVERIFIED_RHEA_VIEWS',failureCode:null,
 chain:'NEAR_SANDBOX',sourceNetwork:'NEAR_MAINNET_READ_ONLY',
 sourceBlockHeight:null,borrowerAccountId:null,
 sourceCodeHashVerified:false,cloneEvidence:null,parityEvidence:null,
 actualRheaLiquidationAttempted:false,actualRheaSettlementVerified:false,
 realMainnetExecuted:false,positiveNetProfitVerified:false,
 maySignMainnet:false,mayBroadcastMainnet:false};
let worker;
try{
 if(env.NEAR_WORKSPACES_NETWORK!=='sandbox'||env.EXECUTION_ENABLED!=='false'||
  env.NEAR_NETWORK!=='mainnet'||env.STAGE96_ALLOW_SANDBOX_PATCH!=='true'||
  env.NEAR_PRIVATE_KEY||env.MAINNET_PRIVATE_KEY||env.NEAR_ACCOUNT_ID||
  env.STAGE96_SOURCE_FILE!=='source/stage38-positive-stage35-evidence.json'||
  !env.NEAR_RPC_URL||new URL(env.NEAR_RPC_URL).protocol!=='https:')
  throw Error('STAGE96_SANDBOX_READONLY_MAINNET_ONLY');
 const proposal=JSON.parse(await readFile(env.STAGE96_SOURCE_FILE,'utf8'));
 const block=Number(proposal.blockHeight);
 if(proposal.mode!=='RHEA_STAGE35_PINNED_SOURCE_ONLY_LIQUIDATION_SIZING'||
  proposal.chain!=='NEAR_MAINNET'||proposal.referenceRulesPass!==true||
  proposal.executionEnabled!==false||proposal.maySign!==false||
  proposal.mayBroadcast!==false||!Number.isSafeInteger(block)||block<1||
  !ID.test(proposal.borrowerAccountId)||!HASH.test(proposal.lendingCodeHash))
  throw Error('STAGE96_INVALID_AUTHENTIC_BORROWER_SOURCE');
 report.sourceBlockHeight=String(block);
 report.borrowerAccountId=proposal.borrowerAccountId;
 const rpc=new NearReadOnlyRpc(env.NEAR_RPC_URL);
 const contractId='contract.main.burrow.near';
 const [deployed,config,borrower,assets]=await Promise.all([
  rpc.viewAccount(contractId,block),
  rpc.view(contractId,'get_config',{},block),
  rpc.view(contractId,'get_account_all_positions',{account_id:proposal.borrowerAccountId},block),
  rpc.view(contractId,'get_assets_paged',{},block),
 ]);
 if(deployed.blockHeight!==String(block)||deployed.codeHash!==proposal.lendingCodeHash||
  [config,borrower,assets].some(v=>v.blockHeight!==String(block))||
  !Array.isArray(assets.value)||assets.value.length===0)
  throw Error('STAGE96_PINNED_SOURCE_BLOCK_OR_CODE_MISMATCH');
 report.sourceCodeHashVerified=true;
 const {Worker}=await import('near-workspaces');
 worker=await Worker.init({network:'sandbox'});
 const cloned=await cloneStage82BorrowerLending({
  root:worker.rootAccount,rpc,endpoint:env.NEAR_RPC_URL,
  blockHeight:block,contractId,expectedCodeHash:proposal.lendingCodeHash,
  borrowerAccountId:proposal.borrowerAccountId,
  assetIds:assets.value.map(v=>v[0]),
  fallbackEndpoint:env.STAGE45_ARCHIVAL_FALLBACK_URL?.trim()||
   'https://archival-rpc.mainnet.near.org',
  budgets:{paceMs:450},
 });
 report.cloneEvidence=cloned.evidence;
 report.parityEvidence=await attestStage96PinnedRheaViews({
  lending:cloned.contract,borrowerAccountId:proposal.borrowerAccountId,
  config:config.value,borrower:borrower.value,assets:assets.value,
 });
 if(report.parityEvidence.allSourceViewsVerified!==true||
  cloned.evidence.recordsRead!==cloned.evidence.recordsPatched)
  throw Error('STAGE96_UNVERIFIED_AUTHENTIC_BORROWER_STATE');
 report.status='SOURCE_PINNED_BORROWER_SANDBOX_VIEWS_MATCH_NOT_LIQUIDATION';
}catch(error){
 report.failureCode=stage96SafeError(error);
 process.exitCode=2;
}finally{
 if(worker)await worker.tearDown().catch(()=>{});
 await writeFile(OUT,JSON.stringify(report,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({mode:report.mode,status:report.status,
  failureCode:report.failureCode,
  parity:report.parityEvidence?.status??'NOT_YET_CONFIRMED',
  actualRheaLiquidationAttempted:false,mayBroadcastMainnet:false}));
}

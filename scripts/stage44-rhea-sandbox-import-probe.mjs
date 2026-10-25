#!/usr/bin/env node
/** Non-mutating preparation check for a future actual Rhea liquidation replay.
 * Reads public archival mainnet data but ONLY imports into disposable Sandbox.
 * A matching config is NOT full contract-storage parity or liquidation proof.
 */
import {writeFile,rename} from 'node:fs/promises';
import {NearReadOnlyRpc} from '../src/rhea/rpc.ts';
const env=process.env;
const outfile=env.STAGE44_IMPORT_REPORT_PATH??'stage44-rhea-state-import-readiness.json';
const base={
 mode:'ARBIVANE_STAGE44_RHEA_SANDBOX_IMPORT_DIAGNOSTIC',
 chain:'NEAR_SANDBOX',mainnetSourceBlockHeight:'221433162',
 lendingContract:'contract.main.burrow.near',
 expectedLendingCodeHash:'6Nek1MZ8cwJJ2xMQAUWup9V5AToYS9rkTxJfwo6BCpFa',
 stateImported:false,configurationMatches:false,allStoredKeysAttested:false,
 contractLiquidationAttempted:false,transactionReplayVerified:false,
 positiveNetProfitVerified:false,executionEnabled:false,maySignMainnet:false,
 mayBroadcastMainnet:false,
};
let worker;
async function save(value){
 await writeFile(outfile+'.tmp',JSON.stringify(value,null,2)+'\n',{encoding:'utf8',mode:0o600});
 await rename(outfile+'.tmp',outfile);
}
function safeReason(error){
 const msg=error instanceof Error?error.message:'';
 if(/too large|limit|response size|exceed|50.?kb|payload|body length/i.test(msg))
  return 'RPC_RESPONSE_OR_CONTRACT_STORAGE_TOO_LARGE';
 if(/timeout|timed out|ECONNRESET|429|fetch failed|connection|network/i.test(msg))
  return 'ARCHIVAL_RPC_NETWORK_OR_RATE_LIMIT';
 if(/not found|unknown block|block not available/i.test(msg))
  return 'ARCHIVAL_BLOCK_UNAVAILABLE';
 return 'RHEA_STATE_IMPORT_OR_CONFIG_VIEW_FAILED';
}
try{
 await save({...base,status:'IMPORT_IN_PROGRESS_NOT_PROVEN'});
 if(env.NEAR_WORKSPACES_NETWORK!=='sandbox'||env.EXECUTION_ENABLED!=='false'||
  !env.NEAR_RPC_URL||env.NEAR_PRIVATE_KEY||env.MAINNET_PRIVATE_KEY||env.NEAR_ACCOUNT_ID)
  throw Error('STAGE44_SANDBOX_ONLY');
 const block=221433162;
 const rpc=new NearReadOnlyRpc(env.NEAR_RPC_URL);
 const [account,config]=await Promise.all([
  rpc.viewAccount(base.lendingContract,block),
  rpc.view(base.lendingContract,'get_config',{},block),
 ]);
 if(account.blockHeight!==String(block)||config.blockHeight!==String(block)||
  account.codeHash!==base.expectedLendingCodeHash)
  throw Error('STAGE44_HISTORICAL_SOURCE_HASH_OR_BLOCK_CHANGED');
 const {Worker}=await import('near-workspaces');
 worker=await Worker.init({network:'sandbox'});
 const lending=await worker.rootAccount.importContract({
  mainnetContract:base.lendingContract,blockId:block,withData:true,
 });
 if(!lending||lending.accountId!==base.lendingContract)
  throw Error('STAGE44_IMPORT_ID_MISMATCH');
 const imported=await lending.view('get_config',{});
 if(JSON.stringify(imported)!==JSON.stringify(config.value))
  throw Error('STAGE44_CONFIG_MISMATCH');
 const report={...base,status:'RHEA_PINNED_CONFIG_IMPORTED_ONLY',
  stateImported:true,configurationMatches:true,
  blockers:['FULL_STORAGE_KEYSET_AND_ALL_DEPENDENT_FT_CONTRACTS_NOT_ATTESTED',
   'NO_BORROWER_LIQUIDATION_CALLBACK_OR_SETTLEMENT_REPLAY',
   'NO_REAL_FUNDS_SWAPS_GAS_IN_SETTLEMENT_ASSET_OR_NET_PROFIT']};
 await save(report);
 console.log(JSON.stringify(report,null,2));
}catch(error){
 const report={...base,status:'BLOCKED_RHEA_IMPORT_NOT_PROVEN',
  blocker:safeReason(error),
  blockers:['FULL_RHEA_IMPORT_AND_LIQUIDATION_REPLAY_NOT_VERIFIED',
   'NO_MAINNET_SIGNING_OR_MONEY_EXECUTION']};
 await save(report).catch(()=>{});
 console.log(JSON.stringify(report,null,2));
}finally{
 if(worker)await worker.tearDown().catch(()=>{});
}

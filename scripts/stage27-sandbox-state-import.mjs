#!/usr/bin/env node
/**
 * Optional Stage27 local-only near-workspaces Mainnet -> Sandbox *state import probe*.
 * Not a transaction replay. Never uses real private keys or a mainnet signer.
 * Usage documented in docs/RHEA_STAGE27_SANDBOX_REPLAY.md.
 */
import {readFile} from 'node:fs/promises';
const env=process.env;
const fail=(reason,detail='')=>{
 console.error(JSON.stringify({mode:'STAGE27_SANDBOX_STATE_IMPORT_PROBE',status:'BLOCKED',
  reason,detail,allContractStateImported:false,contractTransactionReplayed:false,
  executionEnabled:false,maySign:false,mayBroadcast:false}));
 process.exitCode=2;
};
async function main(){
 if(env.STAGE27_SANDBOX_IMPORT_ONLY!=='true'||env.EXECUTION_ENABLED!=='false'||
  env.NEAR_WORKSPACES_NETWORK!=='sandbox'||!env.STAGE27_GATE_FILE)
 throw Error('LOCAL_SANDBOX_IMPORT_ONLY_REQUIRED');
 const raw=JSON.parse(await readFile(env.STAGE27_GATE_FILE,'utf8'));
 const gate=raw?.gate;
 if(gate?.mode!=='RHEA_STAGE27_REPLAY_ADMISSION_GATE'||gate?.chain!=='NEAR_MAINNET'||
  gate.executionEnabled!==false||gate.maySign!==false||gate.mayBroadcast!==false||
  gate.stateImportCompleted!==false||gate.contractTransactionReplayed!==false||
  gate.mayAttemptStateImport!==true||!gate.borrowerAccountId||
  !/^[1-9][0-9]{0,15}$/.test(gate.blockHeight)||
  !Number.isSafeInteger(Number(gate.blockHeight)))
 throw Error('MISSING_FRESH_VERIFIED_REPLAY_GATE');
 const {NearReadOnlyRpc}=await import('../src/rhea/rpc.ts');
 const rpc=new NearReadOnlyRpc(env.NEAR_RPC_URL??'https://rpc.mainnet.fastnear.com');
 const blockId=Number(gate.blockHeight);
 const cfg=await rpc.view('contract.main.burrow.near','get_config',{},blockId);
 const position=await rpc.view('contract.main.burrow.near','get_account_all_positions',
  {account_id:gate.borrowerAccountId},blockId);
 if(cfg.blockHeight!==gate.blockHeight||position.blockHeight!==gate.blockHeight||
  cfg.value?.oracle_account_id!=='priceoracle.near')
 throw Error('MAINNET_PINNED_CONFIG_OR_BORROWER_UNAVAILABLE');
 let lib;
 try{lib=await import('near-workspaces');}catch{
  throw Error('INSTALL_NEAR_WORKSPACES_LOCALLY_FOR_SANDBOX_IMPORT');
 }
 let worker;
 try{
  worker=await lib.Worker.init({network:'sandbox'});
  if(!worker?.rootAccount||typeof worker.rootAccount.importContract!=='function')
   throw Error('UNSUPPORTED_NEAR_WORKSPACES_SANDBOX_API');
  // Require ALL contract data. withData:false is NEVER an acceptable substitute.
  const lending=await worker.rootAccount.importContract({
   mainnetContract:'contract.main.burrow.near',blockId,withData:true,
  });
  await worker.rootAccount.importContract({
   mainnetContract:'priceoracle.near',blockId,withData:true,
  });
  await worker.rootAccount.importContract({
   mainnetContract:'aggregate-oracle.near',blockId,withData:true,
  });
  const clonedConfig=await lending.view('get_config',{});
  const clonedAccount=await lending.view('get_account_all_positions',{
   account_id:gate.borrowerAccountId,
  });
  // Strict equality and no bypass for missing or partial storage. Upstream may
  // have extra state outside these reads; equality is necessary, not sufficient.
  if(JSON.stringify(clonedConfig)!==JSON.stringify(cfg.value)||
     JSON.stringify(clonedAccount)!==JSON.stringify(position.value))
   throw Error('SANDBOX_MAINNET_CONFIG_OR_BORROWER_STATE_NOT_IDENTICAL');
  console.log(JSON.stringify({mode:'STAGE27_SANDBOX_STATE_IMPORT_PROBE',
   status:'VIEWS_MATCH_BUT_FULL_STORAGE_COMPLETENESS_UNATTESTED',
   blockHeight:gate.blockHeight,borrowerAccountId:gate.borrowerAccountId,
   importedContracts:['contract.main.burrow.near','priceoracle.near','aggregate-oracle.near'],
   stateViewParityObserved:true,allContractStateImported:false,
   fullStorageParityVerified:false,contractTransactionReplayed:false,
   executionEnabled:false,maySign:false,mayBroadcast:false,
   blockers:['FULL_STORED_KEYSET_NOT_INDEPENDENTLY_RECONCILED',
    'NO_SANDBOX_LIQUIDATOR_FINANCING_OR_ORACLE_CALL_REPLAY',
    'ARCHIVED_PRICE_UNIT_PARITY_NOT_PROVED']},null,2));
 }finally{
  if(worker)await worker.tearDown().catch(()=>{});
 }
}
main().catch(e=>fail(e instanceof Error?e.message:'UNKNOWN'));

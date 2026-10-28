/**
 * Stage197: publicly verifiable, read-only controlled NEAR Testnet laboratory.
 *
 * These are independently deployed contracts, NOT the shared Rhea market.
 * A deployed WASM blob is not a functioning liquidation market. An initialized
 * lending contract, registered token assets, funded actors, health proof,
 * signing, and verified final transaction receipts remain separate gates.
 *
 * No mutable method, arbitrary account ID, raw wallet secret, or tx broadcast.
 */
import {testnetRpc} from './testnet-readonly.mjs';

export const TESTNET_LAB={
  account:'arbivane-fixture-66971fd6.testnet',
  lending:{
    accountId:'lend.arbivane-fixture-66971fd6.testnet',
    codeHash:'8EoF8mXSAYV3HTGyZkSJJJ65xPgzTuj9D442LAjXidXr',
    deployTx:'HPERpUsrAjYU84q8vWXo6LRxhMvsUeZkuRxGxpm57Qpk',
  },
  oracle:{
    accountId:'oracle.arbivane-fixture-66971fd6.testnet',
    codeHash:'DM9vASPfsTAEWd72JSghTWFPx2vUuHTnojPZV33gp9Ke',
    deployTx:'HTpiKBFYwTSQT5VkyZovJnKaPS6DjA4WbCZSZBAFfAvX',
  },
};
export async function inspectTestnetLab({fetchImpl=fetch}={}){
  const opt={fetchImpl,timeoutMs:14000};
  const chain=await testnetRpc('status',[],opt);
  if(chain.chain_id!=='testnet'||chain.sync_info?.syncing!==false)
    throw Error('TESTNET_LAB_WRONG_CHAIN');
  const records=await Promise.all(
    [TESTNET_LAB.lending,TESTNET_LAB.oracle].map(async contract=>{
      const view=await testnetRpc('query',{
        request_type:'view_account',account_id:contract.accountId,finality:'final'
      },opt);
      if(typeof view.code_hash!=='string'||
          !Number.isSafeInteger(view.block_height))
        throw Error('TESTNET_LAB_ACCOUNT_UNVERIFIED');
      return {accountId:contract.accountId,expectedCodeHash:contract.codeHash,
        codeHash:view.code_hash,codeVerified:view.code_hash===contract.codeHash,
        deploymentTx:contract.deployTx,sourceBlock:view.block_height};
    }));
  if(!records.every(x=>x.codeVerified))
    return {network:'testnet',status:'CODE_DRIFT',initialized:false,
      verifiedTransactions:0,executionEnabled:false,signerConnected:false,
      contracts:records,sourceBlock:Math.min(...records.map(x=>x.sourceBlock)),
      reason:'TESTNET_LAB_PINNED_WASM_MISMATCH'};
  let config=null,configBlock=null;
  let reason='LENDING_CONTRACT_NOT_INITIALIZED';
  try{
    const data=await testnetRpc('query',{
      request_type:'call_function',finality:'final',
      account_id:TESTNET_LAB.lending.accountId,
      method_name:'get_config',args_base64:Buffer.from('{}').toString('base64'),
    },opt);
    if(typeof data.error==='string'&&/not initialized/i.test(data.error)){
      reason='LENDING_CONTRACT_NOT_INITIALIZED';
    }else if(data.error){
      reason='LENDING_CONTRACT_VIEW_REJECTED';
    }else if(Array.isArray(data.result)){
      const decoded=JSON.parse(Buffer.from(data.result).toString('utf8'));
      if(decoded&&typeof decoded==='object'){
        config=decoded;configBlock=data.block_height;
      }
    }
  }catch{
    reason='LENDING_CONTRACT_VIEW_UNAVAILABLE';
  }
  const initialized=Boolean(config);
  const validConfig=initialized&&
    config.oracle_account_id===TESTNET_LAB.oracle.accountId&&
    typeof config.owner_id==='string'&&config.owner_id.length>0;
  const status=!initialized?'DEPLOYED_UNINITIALIZED':
    !validConfig?'INVALID_LENDING_CONFIGURATION':'MARKET_SETUP_REQUIRED';
  return {network:'testnet',status,initialized,
    configuredOracleId:initialized?config.oracle_account_id:null,
    ownerId:initialized?config.owner_id:null,
    verifiedTransactions:0,executionEnabled:false,signerConnected:false,
    assetsVerified:false,borrowerHealthVerified:false,
    contracts:records,
    sourceBlock:configBlock??Math.min(...records.map(x=>x.sourceBlock)),
    reason:status==='DEPLOYED_UNINITIALIZED'?reason:
      status==='INVALID_LENDING_CONFIGURATION'?'INVALID_ORACLE_OWNER':
      'NEEDS_FUNDED_ASSETS_AND_INDEPENDENT_LIQUIDATION_RECEIPT',
  };
}


import {attestFinalMainnetLiquidation} from './stage36-mainnet-receipt-audit.ts';
const proc=(globalThis as typeof globalThis&{process:{env:Record<string,string|undefined>;exitCode:number}}).process;
const e=proc.env;
const expectedHash='4zWtj3LppFhsSxY589ZqBBvVW5gKtmC6qYxRt53oezXV';
(async()=>{
 if(e.EXECUTION_ENABLED!=='false'||e.NEAR_NETWORK!=='mainnet'||!e.NEAR_RPC_URL)
  throw Error('STAGE36_READONLY_MAINNET_REQUIRED');
 const url=new URL(e.NEAR_RPC_URL);
 if(url.protocol!=='https:')throw Error('STAGE36_TLS_RPC_REQUIRED');
 // Current or historical NEAR receipt evidence, NEVER send_tx or broadcast_tx.
 const response=await fetch(url,{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({jsonrpc:'2.0',id:'stage36-historical-witness',method:'tx',
   params:{tx_hash:expectedHash,sender_account_id:'collector1.near',wait_until:'FINAL'}}),
  signal:AbortSignal.timeout(30000),
 });
 if(!response.ok)throw Error('HISTORICAL_RECEIPT_HTTP_RETRIEVAL_FAILURE');
 const body=await response.json() as Record<string,unknown>;
 if(body.error)throw Error('HISTORICAL_RECEIPT_RPC_QUERY_UNAVAILABLE');
 const outcome=attestFinalMainnetLiquidation(body.result,{
  transactionHash:expectedHash,signerAccountId:'collector1.near'});
 console.log(JSON.stringify(outcome,null,2));
})().catch(e=>{
 // Historical archived RPC evidence is optional and may be pruned by providers.
 // Never convert missing records into successful liquidation evidence.
 console.log(JSON.stringify({
  mode:'RHEA_STAGE36_FINALIZED_PYTH_LIQUIDATION_RECEIPT_WITNESS',
  chain:'NEAR_MAINNET',status:'BLOCKED_ARCHIVAL_TRANSACTION_UNAVAILABLE',
  transactionHash:expectedHash,
  rawRpcErrorExposed:false,
  independentSuccessVerified:false,netProfitVerified:false,
  executionPermissionGranted:false,maySign:false,mayBroadcast:false,
 },null,2));
});

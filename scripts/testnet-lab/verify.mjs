/**
 * Stage199: read-only verification of a user-owned isolated NEAR Testnet lab.
 *
 * No signed transactions, no caller-provided RPC endpoint and no invented
 * evidence. A liquidation is counted only after the transaction reaches
 * finality and its actual arguments, logs and post-state reconcile.
 */
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
 RPC,SOURCE,createLabManifest,marketTokens,computeHealth,
} from './spec.mjs';

const TX_HASH=/^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
const UINT=/^(0|[1-9][0-9]{0,89})$/;
const MAX_BLOCK=10_000_000_000;
function failure(code){throw Error(code)}

export async function rpc(method,params,{fetchImpl=fetch}={}){
 if(!['status','query','tx'].includes(method))failure('RPC_MUTATIONS_FORBIDDEN');
 const response=await fetchImpl(RPC,{
  method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({jsonrpc:'2.0',id:'arbivane-lab-verify',method,params}),
  signal:AbortSignal.timeout(15000),
 });
 if(!response.ok)failure('TESTNET_RPC_HTTP_'+response.status);
 const json=await response.json();
 if(json.error){
  const cause=String(json.error?.cause?.name??'');
  if(['UNKNOWN_ACCOUNT','ACCOUNT_DOES_NOT_EXIST'].includes(cause))
   failure('TESTNET_ACCOUNT_NOT_FOUND');
  if(['UNKNOWN_TRANSACTION','UNKNOWN_BLOCK'].includes(cause))
   failure('TESTNET_TRANSACTION_NOT_FOUND');
  failure('TESTNET_RPC_BAD_RESPONSE');
 }
 if(json.result===undefined||json.result===null)failure('TESTNET_RPC_BAD_RESPONSE');
 return json.result;
}

async function viewAccount(accountId,options){
 try{
  const result=await rpc('query',{request_type:'view_account',finality:'final',
   account_id:accountId},options);
  return {accountId,exists:true,codeHash:result.code_hash,
   balanceYocto:result.amount,lockedYocto:result.locked??'0',
   sourceBlock:result.block_height};
 }catch(error){
  if(error.message!=='TESTNET_ACCOUNT_NOT_FOUND')throw error;
  return {accountId,exists:false,codeHash:null,balanceYocto:null,
   lockedYocto:null,sourceBlock:null};
 }
}
async function viewFunction(contractId,method,args,options){
 const result=await rpc('query',{request_type:'call_function',finality:'final',
  account_id:contractId,method_name:method,
  args_base64:Buffer.from(JSON.stringify(args)).toString('base64')},options);
 if(typeof result?.error==='string')return {error:result.error,
  blockHeight:result.block_height??null};
 if(!Array.isArray(result?.result)||!Number.isSafeInteger(result.block_height))
  failure('TESTNET_CALL_RESULT_INVALID');
 let value;
 try{value=JSON.parse(Buffer.from(result.result).toString('utf8'))}
 catch{failure('TESTNET_CONTRACT_RESULT_MALFORMED')}
 return {value,blockHeight:result.block_height};
}

function amount(value){
 return typeof value==='string'&&UINT.test(value)?BigInt(value):0n;
}
function storagePresent(value){
 return Boolean(value)&&typeof value==='object'&&!value.error&&
  typeof value.total==='string'&&UINT.test(value.total);
}
function tokenRows(rows){
 if(!Array.isArray(rows))return [];
 return rows.filter(row=>row&&typeof row.token_id==='string'&&
  typeof row.balance==='string'&&UINT.test(row.balance))
  .map(row=>({tokenId:row.token_id,atomic:row.balance,shares:row.shares??null}));
}
function positionOf(value){
 if(!value||typeof value!=='object')return null;
 return {supplied:tokenRows(value.supplied),collateral:tokenRows(value.collateral),
  borrowed:tokenRows(value.borrowed)};
}
function findAtomic(rows,tokenId){
 const row=rows.find(value=>value.tokenId===tokenId);
 return row?BigInt(row.atomic):0n;
}

function parsePriceData(data,manifest){
 if(!data||typeof data!=='object'||!Array.isArray(data.prices)||
    !/^[0-9]{1,30}$/.test(String(data.timestamp??''))||
    !Number.isSafeInteger(data.recency_duration_sec)||
    data.recency_duration_sec<1||data.recency_duration_sec>300)
  failure('INVALID_ONCHAIN_PRICE_DATA');
 const expected=new Set(marketTokens(manifest).map(token=>token.accountId));
 const prices={};
 for(const row of data.prices){
  if(!row||!expected.has(row.asset_id)||!row.price)continue;
  const price=row.price;
  if(typeof price.multiplier!=='string'||!UINT.test(price.multiplier)||
     BigInt(price.multiplier)<=0n||!Number.isInteger(price.decimals)||
     price.decimals<0||price.decimals>36)failure('INVALID_ONCHAIN_PRICE_DATA');
  prices[row.asset_id]={multiplier:price.multiplier,decimals:price.decimals};
 }
 if(Object.keys(prices).length!==expected.size)failure('ONCHAIN_PRICE_COVERAGE_INCOMPLETE');
 return {timestamp:String(data.timestamp),
  recencyDurationSec:data.recency_duration_sec,prices};
}

function eventLogs(logs){
 const events=[];
 for(const line of logs??[]){
  if(typeof line!=='string')continue;
  const index=line.indexOf('EVENT_JSON:');
  if(index<0)continue;
  try{events.push(JSON.parse(line.slice(index+'EVENT_JSON:'.length)))}
  catch{}
 }
 return events;
}
function executionSucceeded(result){
 if(!result||result.status?.Failure)return false;
 const final=result.final_execution_status;
 if(final&&final!=='FINAL'&&final!=='EXECUTED')return false;
 return Boolean(result.status?.SuccessValue!==undefined||
  result.status?.SuccessReceiptId||result.status?.SuccessValue===null||
  result.status?.SuccessReceiptId===null);
}
function functionCall(result){
 const actions=Array.isArray(result?.transaction?.actions)?
  result.transaction.actions:[];
 for(const action of actions){
  const call=action?.FunctionCall;
  if(call&&typeof call.method_name==='string'&&typeof call.args==='string')
   return call;
 }
 return null;
}
function decodeArgs(call){
 try{return JSON.parse(Buffer.from(call.args,'base64').toString('utf8'))}
 catch{failure('TRANSACTION_ARGUMENTS_MALFORMED')}
}

export async function inspectLiquidationTransaction(txHash,manifest,{
 fetchImpl=fetch}={}){
 if(typeof txHash!=='string'||!TX_HASH.test(txHash))
  failure('INVALID_TESTNET_TRANSACTION_HASH');
 const result=await rpc('tx',{tx_hash:txHash,wait_until:'FINAL',
  sender_account_id:manifest.accountIds.liquidator},{fetchImpl});
 if(!executionSucceeded(result))failure('LIQUIDATION_TRANSACTION_FAILED');
 if(result.transaction?.receiver_id!==manifest.accountIds.oracle)
  failure('LIQUIDATION_RECEIVER_NOT_TEST_ORACLE');
 const call=functionCall(result);
 if(!call||call.method_name!=='oracle_call')
  failure('LIQUIDATION_NOT_AN_ORACLE_CALL');
 const args=decodeArgs(call);
 if(args.receiver_id!==manifest.accountIds.lending)
  failure('LIQUIDATION_NOT_SENT_TO_LENDING');
 const price=parsePriceData(args.price_data,manifest);
 let message;
 try{message=JSON.parse(args.msg)}catch{failure('LIQUIDATION_MESSAGE_MALFORMED')}
 const actions=message?.Execute?.actions;
 if(!Array.isArray(actions)||actions.length!==1||!actions[0]?.Liquidate)
  failure('LIQUIDATION_ACTION_MISSING');
 const action=actions[0].Liquidate;
 if(action.account_id!==manifest.accountIds.borrower)
  failure('LIQUIDATION_BORROWER_MISMATCH');
 const collateral=manifest.tokens.find(t=>t.role==='collateral');
 const debt=manifest.tokens.find(t=>t.role==='debt');
 if(!collateral||!debt)failure('MISSING_MARKET_TOKEN');
 const inAsset=Array.isArray(action.in_assets)?action.in_assets[0]:null;
 const outAsset=Array.isArray(action.out_assets)?action.out_assets[0]:null;
 if(!inAsset||inAsset.token_id!==debt.accountId||
    !outAsset||outAsset.token_id!==collateral.accountId)
  failure('LIQUIDATION_ASSET_MISMATCH');
 const repay=amount(inAsset.amount),take=amount(outAsset.amount);
 const maxRepay=BigInt(manifest.scenario.liquidation.repay);
 const maxTake=BigInt(manifest.scenario.liquidation.take);
 if(repay<=0n||take<=0n||repay>maxRepay||take>maxTake)
  failure('LIQUIDATION_AMOUNT_OUT_OF_BOUNDS');
 const events=eventLogs(result.receipts_outcome?.flatMap(
  receipt=>receipt?.outcome?.logs??[]));
 const liquidationEvent=events.find(event=>event?.standard==='burrow'&&
  event?.event==='liquidate'&&Array.isArray(event.data)&&
  event.data.some(row=>row?.liquidation_account_id===
   manifest.accountIds.borrower));
 if(!liquidationEvent)failure('LIQUIDATION_EVENT_NOT_VERIFIED');
 return {verified:true,txHash,finalExecutionStatus:
  result.final_execution_status??'FINAL',receiverId:result.transaction.receiver_id,
  method:call.method_name,oracleAccountId:manifest.accountIds.oracle,
  lendingAccountId:manifest.accountIds.lending,
  borrowerAccountId:manifest.accountIds.borrower,
  liquidatorAccountId:manifest.accountIds.liquidator,
  inAsset:{tokenId:inAsset.token_id,atomic:String(repay)},
  outAsset:{tokenId:outAsset.token_id,atomic:String(take)},
  priceData:price,events:liquidationEvent.data,
  receipts:Array.isArray(result.receipts_outcome)?
   result.receipts_outcome.length:0};
}

export async function inspectWithdrawTransaction(txHash,manifest,{
 fetchImpl=fetch}={}){
 if(typeof txHash!=='string'||!TX_HASH.test(txHash))
  failure('INVALID_TESTNET_TRANSACTION_HASH');
 const result=await rpc('tx',{tx_hash:txHash,wait_until:'FINAL',
  sender_account_id:manifest.accountIds.liquidator},{fetchImpl});
 if(!executionSucceeded(result))failure('WITHDRAW_TRANSACTION_FAILED');
 if(result.transaction?.receiver_id!==manifest.accountIds.lending)
  failure('WITHDRAW_RECEIVER_NOT_LENDING');
 const call=functionCall(result);
 if(!call||call.method_name!=='execute')
  failure('WITHDRAW_NOT_AN_EXECUTE_CALL');
 const args=decodeArgs(call);
 const actions=Array.isArray(args.actions)?args.actions:[];
 const withdraw=actions.find(action=>action?.Withdraw)?.Withdraw;
 const collateral=manifest.tokens.find(t=>t.role==='collateral');
 if(!withdraw||!collateral||withdraw.token_id!==collateral.accountId)
  failure('WITHDRAW_ASSET_MISMATCH');
 const requested=amount(withdraw.amount);
 if(requested<=0n||requested>BigInt(manifest.scenario.liquidation.take))
  failure('WITHDRAW_AMOUNT_OUT_OF_BOUNDS');
 const events=eventLogs(result.receipts_outcome?.flatMap(
  receipt=>receipt?.outcome?.logs??[]));
 const withdrawn=events.some(event=>event?.standard==='burrow'&&
  event?.event==='withdraw_succeeded');
 if(!withdrawn)failure('WITHDRAW_EVENT_NOT_VERIFIED');
 return {verified:true,txHash,finalExecutionStatus:
  result.final_execution_status??'FINAL',receiverId:result.transaction.receiver_id,
  method:call.method_name,tokenId:withdraw.token_id,atomic:String(requested)};
}

function testNotional(manifest,take,repay){
 const collateral=manifest.tokens.find(t=>t.role==='collateral');
 const debt=manifest.tokens.find(t=>t.role==='debt');
 const prices=manifest.scenario.prices.unhealthy;
 const collPrice=Number(prices.collateral.multiplier)/
  (10**prices.collateral.decimals);
 const debtPrice=Number(prices.debt.multiplier)/(10**prices.debt.decimals);
 const collAmount=Number(BigInt(take)/10n**BigInt(collateral.decimals));
 const debtAmount=Number(BigInt(repay)/10n**BigInt(debt.decimals));
 return {source:'TEST_PRICE_MODEL_NOT_MARKET_DATA',
  collateralTaken:collAmount,debtRepaid:debtAmount,
  notionalUsd:Number((collAmount*collPrice-debtAmount*debtPrice).toFixed(6))};
}

export async function inspectManifest(manifest,{
 fetchImpl=fetch,txHash=null,withdrawTxHash=null}={}){
 if(!manifest||manifest.network!=='testnet'||manifest.schemaVersion!==1)
  failure('INVALID_TESTNET_LAB_MANIFEST');
 const expected=createLabManifest(manifest.accountIds?.root);
 if(JSON.stringify(manifest)!==JSON.stringify(expected))
  failure('MANIFEST_TAMPERED_OR_INCOMPATIBLE');
 const options={fetchImpl};
 const status=await rpc('status',[],options);
 if(status.chain_id!=='testnet'||status.sync_info?.syncing!==false)
  failure('WRONG_CHAIN_OR_RPC_SYNCING');

 const roles=['root','lending','oracle','borrower','liquidator',
  ...manifest.tokens.map(token=>token.role)];
 const accounts={};
 for(const role of roles)
  accounts[role]=await viewAccount(manifest.accountIds[role],options);
 const chainBlock=status.sync_info?.latest_block_height??null;
 const allExist=roles.every(role=>accounts[role].exists);
 const codeExpected={lending:SOURCE.lendingCodeHash,oracle:SOURCE.oracleCodeHash};
 for(const token of manifest.tokens)
  codeExpected[token.role]=SOURCE.fungibleTokenCodeHash;
 const codeRoles=['lending','oracle',...manifest.tokens.map(token=>token.role)];
 const codeChecks=Object.fromEntries(codeRoles
  .map(role=>[role,{expected:codeExpected[role]??null,
   observed:accounts[role].codeHash,
   verified:Boolean(codeExpected[role])&&
    accounts[role].codeHash===codeExpected[role]}]));
 const codeVerified=allExist&&Object.values(codeChecks).every(row=>row.verified);

 let config=null,configBlock=null,configError=null;
 let assets=null,detailedAssets=null,metadata={},balances={},storage={};
 let positions={borrower:null,liquidator:null};
 let assetsVerified=false,reservesVerified=false,storageVerified=false;
 let tokenMetadataVerified=false;
 let readiness=allExist?'ACCOUNTS_CREATED':'ACCOUNTS_NOT_CREATED';

 if(!accounts.root.exists)readiness='OWNER_ACCOUNT_NOT_FOUND';
 else if(!allExist)readiness='ACCOUNTS_NOT_CREATED';
 else if(!codeVerified)readiness='CONTRACT_NOT_DEPLOYED_OR_CODE_MISMATCH';
 else{
  const configView=await viewFunction(manifest.accountIds.lending,'get_config',
   {},options).catch(error=>({error:error.message}));
  if(configView.error){
   configError=configView.error;
   readiness=/not initialized/i.test(configView.error)?
    'LENDING_UNINITIALIZED':'LENDING_CONFIG_UNAVAILABLE';
  }else{
   config=configView.value;configBlock=configView.blockHeight;
   const fields=Object.keys(manifest.config);
   if(fields.some(key=>config?.[key]!==manifest.config[key]))
    readiness='CONFIG_MISMATCH';
   else{
    const assetView=await viewFunction(manifest.accountIds.lending,
     'get_assets_paged',{from_index:0,limit:20},options)
     .catch(error=>({error:error.message}));
    if(assetView.error)readiness='LENDING_ASSETS_UNAVAILABLE';
    else{
     assets=Array.isArray(assetView.value)?assetView.value:[];
     const assetIds=new Set(assets.map(row=>Array.isArray(row)?row[0]:row?.token_id));
     const expectedTokens=marketTokens(manifest);
     assetsVerified=expectedTokens.every(token=>assetIds.has(token.accountId));
     readiness=assetsVerified?'ASSETS_CONFIGURED':'ASSETS_NOT_CONFIGURED';
     if(assetsVerified){
      const detail=await viewFunction(manifest.accountIds.lending,'get_assets',
       {token_ids:expectedTokens.map(token=>token.accountId)},options)
       .catch(error=>({error:error.message}));
      if(!detail.error){
       detailedAssets=detail.value;
       reservesVerified=expectedTokens.every(token=>{
        const row=(detailedAssets??[]).find(value=>value.token_id===token.accountId);
        return row&&amount(row.reserved)>0n;
       });
       readiness=reservesVerified?'RESERVES_FUNDED':
        'ASSETS_CONFIGURED_RESERVES_NOT_FUNDED';
      }
     }
    }
   }
  }
 }

 if(allExist&&codeVerified){
  for(const token of manifest.tokens){
   const meta=await viewFunction(token.accountId,'ft_metadata',{},options)
    .catch(error=>({error:error.message}));
   metadata[token.role]=meta.error?{error:meta.error}:meta.value;
  }
  tokenMetadataVerified=manifest.tokens.every(token=>{
   const meta=metadata[token.role];
   return meta&&!meta.error&&meta.symbol===token.symbol&&
    meta.decimals===token.decimals;
  });
  const actors={owner:manifest.accountIds.root,
   borrower:manifest.accountIds.borrower,liquidator:manifest.accountIds.liquidator,
   lending:manifest.accountIds.lending};
  for(const token of manifest.tokens){
   balances[token.role]={};
   storage[token.role]={};
   for(const [name,accountId] of Object.entries(actors)){
    const balance=await viewFunction(token.accountId,'ft_balance_of',
     {account_id:accountId},options).catch(error=>({error:error.message}));
    balances[token.role][name]=balance.error?{error:balance.error}:balance.value;
    const storageView=await viewFunction(token.accountId,'storage_balance_of',
     {account_id:accountId},options).catch(error=>({error:error.message}));
    storage[token.role][name]=storageView.error?{error:storageView.error}:
     storageView.value;
   }
  }
  for(const name of ['owner','borrower','liquidator']){
   storage.lending=storage.lending??{};
   const value=await viewFunction(manifest.accountIds.lending,
    'storage_balance_of',{account_id:actors[name]},options)
    .catch(error=>({error:error.message}));
   storage.lending[name]=value.error?{error:value.error}:value.value;
  }
  storageVerified=manifest.tokens.every(token=>{
   const required=token.marketAsset?['lending','owner','borrower','liquidator']:
    ['lending','owner'];
   return required.every(name=>storagePresent(storage[token.role]?.[name]));
  })&&['owner','borrower','liquidator'].every(name=>storagePresent(storage.lending?.[name]));
  if(!tokenMetadataVerified&&
     !['LENDING_UNINITIALIZED','LENDING_CONFIG_UNAVAILABLE','CONFIG_MISMATCH',
      'LENDING_ASSETS_UNAVAILABLE','ASSETS_NOT_CONFIGURED']
      .includes(readiness))readiness='TOKEN_METADATA_MISMATCH';
  if(!storageVerified&&
     !['LENDING_UNINITIALIZED','LENDING_CONFIG_UNAVAILABLE','CONFIG_MISMATCH',
      'LENDING_ASSETS_UNAVAILABLE','ASSETS_NOT_CONFIGURED']
      .includes(readiness))readiness='STORAGE_NOT_REGISTERED';
  for(const name of ['borrower','liquidator']){
   const position=await viewFunction(manifest.accountIds.lending,'get_account',
    {account_id:actors[name]},options).catch(error=>({error:error.message}));
   positions[name]=position.error?{error:position.error}:positionOf(position.value);
  }
 }

 let health=null,healthModels=null;
 const collateral=manifest.tokens.find(token=>token.role==='collateral');
 const debt=manifest.tokens.find(token=>token.role==='debt');
 if(positions.borrower&&collateral&&debt&&!positions.borrower.error){
  const collateralAmount=findAtomic(positions.borrower.collateral,
   collateral.accountId);
  const debtAmount=findAtomic(positions.borrower.borrowed,debt.accountId);
  if(collateralAmount>0n&&debtAmount>0n){
   healthModels={
    healthy:computeHealth({collateralAmount:String(collateralAmount),
     debtAmount:String(debtAmount),collateralToken:collateral,
     debtToken:debt,prices:manifest.scenario.prices.healthy}),
    unhealthy:computeHealth({collateralAmount:String(collateralAmount),
     debtAmount:String(debtAmount),collateralToken:collateral,
     debtToken:debt,prices:manifest.scenario.prices.unhealthy}),
   };
   health=healthModels;
   if(readiness==='RESERVES_FUNDED'){
    if(healthModels.healthy.health<1)
     readiness='BORROWER_POSITION_UNHEALTHY_AT_HEALTHY_PRICE';
    else if(healthModels.unhealthy.health>=1)
     readiness='BORROWER_POSITION_HEALTHY';
    else readiness='BORROWER_POSITION_READY_FOR_TEST_LIQUIDATION';
   }
  }else if(readiness==='RESERVES_FUNDED'){
   readiness='MARKET_FUNDED_NO_BORROWER_POSITION';
  }
 }

 let liquidation=null,withdraw=null;
 let liquidationVerified=false;
 if(txHash){
  try{
   liquidation=await inspectLiquidationTransaction(txHash,manifest,{fetchImpl});
   liquidationVerified=liquidation.verified;
  }catch(error){
   liquidation={verified:false,error:error.message,txHash};
  }
 }
 if(withdrawTxHash){
  try{withdraw=await inspectWithdrawTransaction(withdrawTxHash,manifest,{fetchImpl})}
  catch(error){withdraw={verified:false,error:error.message,txHash:withdrawTxHash}}
 }
 let realizedTestNotional=null,realizedTestNotionalDetail=null;
 if(liquidationVerified){
  realizedTestNotionalDetail=testNotional(manifest,liquidation.outAsset.atomic,
   liquidation.inAsset.atomic);
  realizedTestNotional=realizedTestNotionalDetail.notionalUsd;
 }
 const liquidationEligibilityModeled=Boolean(healthModels&&
  healthModels.healthy.health>=1&&healthModels.unhealthy.health<1);
 const finalReadiness=liquidationVerified?'LIQUIDATION_VERIFIED':readiness;
 const blockValues=Object.values(accounts).map(account=>account.sourceBlock)
  .filter(Number.isSafeInteger);

 return {network:'testnet',readiness:finalReadiness,
  ownerAccountId:manifest.accountIds.root,
  accounts,codeChecks,codeVerified,initialized:config!==null,
  config,configError,configVerified:Boolean(config)&&
   readiness!=='CONFIG_MISMATCH',
  configuredOracleId:config?.oracle_account_id??null,
  configuredOwnerId:config?.owner_id??null,
  assetsObserved:Array.isArray(assets)?assets.length:null,
  assets,detailedAssets,assetsVerified,reservesVerified,
  metadata,metadataVerified:tokenMetadataVerified,
  storageVerified,storage,balances,positions,
  healthModels,health,liquidationEligibilityModeled,
  liquidation,liquidationTransactionVerified:liquidationVerified,
  withdraw,withdrawVerified:withdraw?.verified===true,
  verifiedLiquidations:liquidationVerified?1:0,
  realizedTestNotional,realizedTestNotionalDetail,
  priceSource:'TEST_PRICE_MODEL',
  oracleType:'PASS_THROUGH_TEST_ORACLE',
  signerConnected:false,executionEnabled:false,
  mainnetExecutionAllowed:false,
  sourceBlock:configBlock??(blockValues.length?Math.min(...blockValues):chainBlock),
  checkedAt:new Date().toISOString()};
}

export async function verifyFile(filename,options={}){
 const text=await readFile(filename,'utf8');
 let parsed;
 try{parsed=JSON.parse(text)}catch{failure('INVALID_MANIFEST_JSON')}
 return inspectManifest(parsed,options);
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 const i=process.argv.indexOf('--manifest');
 const tx=process.argv.indexOf('--tx');
 const withdraw=process.argv.indexOf('--withdraw-tx');
 if(i<0||!process.argv[i+1]){
  console.error('Usage: node scripts/testnet-lab/verify.mjs --manifest <path> [--tx <hash>] [--withdraw-tx <hash>]');
  process.exitCode=2;
 }else verifyFile(process.argv[i+1],{
  txHash:tx>=0?process.argv[tx+1]:null,
  withdrawTxHash:withdraw>=0?process.argv[withdraw+1]:null,
 }).then(
  output=>{
   console.log(JSON.stringify(output,null,2));
   if(output.readiness==='LIQUIDATION_VERIFIED')return;
   if(['RESERVES_FUNDED','BORROWER_POSITION_READY_FOR_TEST_LIQUIDATION',
    'MARKET_FUNDED_NO_BORROWER_POSITION','BORROWER_POSITION_HEALTHY',
    'BORROWER_POSITION_UNHEALTHY_AT_HEALTHY_PRICE'].includes(output.readiness))
    return;
   process.exitCode=3;
  },
  error=>{console.error(error.message);process.exitCode=1}
 );
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
 SOURCE,SCENARIO,createLabManifest,marketTokens,computeHealth,
 buildPriceData,buildExecuteMessage,validateOwner,renderSetupBash,
 renderMarketBash,renderLiquidationBash,renderSetupPowerShell,
 renderMarketPowerShell,renderLiquidationPowerShell,writePlan,
} from '../scripts/testnet-lab/plan.mjs';
import {inspectManifest} from '../scripts/testnet-lab/verify.mjs';
import {
 buildOwnerIntents,readTokenBalance,inspectOwnerLab,
} from '../dashboard/server/testnet-lab-verify.mjs';

const TX='11111111111111111111111111111111';
const WTX='22222222222222222222222222222222';
const read=(data)=>({ok:true,json:async()=>({jsonrpc:'2.0',id:'unit',result:data})});
const b64=(value)=>Buffer.from(JSON.stringify(value)).toString('base64');

function labStub(manifest,{
 assets=true,reserves=true,metadata=true,storage=true,positions=true,
 ownerMissing=false,chain='testnet',tx=null,withdraw=null,
}= {}){
 const calls=[];
 const fetchImpl=async(uri,options)=>{
  assert.equal(uri,'https://rpc.testnet.near.org');
  const body=JSON.parse(options.body);calls.push(body);
  if(body.method==='status')return read({chain_id:chain,
   sync_info:{syncing:false,latest_block_height:275000001}});
  if(body.method==='tx'){
   if(body.params.tx_hash===withdraw)return read(withdraw===null?{}:
    withdrawResult(manifest));
   if(body.params.tx_hash===tx)return read(txResult(manifest));
   return {ok:true,json:async()=>({jsonrpc:'2.0',
    error:{cause:{name:'UNKNOWN_TRANSACTION'}}})};
  }
  assert.equal(body.method,'query');
  if(body.params.request_type==='view_account'){
   const name=body.params.account_id;
   if(ownerMissing&&name===manifest.accountIds.root)
    return {ok:true,json:async()=>({jsonrpc:'2.0',
     error:{cause:{name:'UNKNOWN_ACCOUNT'}}})};
   const expected=name===manifest.accountIds.oracle?SOURCE.oracleCodeHash:
    name===manifest.accountIds.lending?SOURCE.lendingCodeHash:
    manifest.tokens.some(token=>token.accountId===name)?
     SOURCE.fungibleTokenCodeHash:'11111111111111111111111111111111';
   return read({code_hash:expected,amount:'1000000000000000000000000',
    block_height:275000001});
  }
  const accountId=body.params.account_id;
  const method=body.params.method_name;
  const args=JSON.parse(Buffer.from(body.params.args_base64,'base64').toString());
  const token=manifest.tokens.find(value=>value.accountId===accountId);
  if(token){
   if(method==='ft_metadata')return read({result:[...Buffer.from(JSON.stringify({
    name:metadata?token.name:'wrong',symbol:metadata?token.symbol:'WRONG',
    decimals:metadata?token.decimals:token.decimals+1}))],block_height:275000001});
   if(method==='ft_balance_of')return read({result:[...Buffer.from(JSON.stringify(
    balanceFor(manifest,token,args.account_id)))],block_height:275000001});
   if(method==='storage_balance_of')return read({result:[...Buffer.from(JSON.stringify(
    storage?{total:'100000000000000000000000',available:'0'}:null))],
    block_height:275000001});
   throw Error('UNEXPECTED_TOKEN_METHOD_'+method);
  }
  assert.equal(accountId,manifest.accountIds.lending);
  if(method==='get_config')return read({result:[...Buffer.from(JSON.stringify(
   manifest.config))],block_height:275000001});
  if(method==='get_assets_paged')return read({result:[...Buffer.from(JSON.stringify(
   assets?marketTokens(manifest).map(value=>[value.accountId,{}]):[]))],
   block_height:275000001});
  if(method==='get_assets')return read({result:[...Buffer.from(JSON.stringify(
   assets?marketTokens(manifest).filter(value=>args.token_ids.includes(value.accountId))
    .map(value=>({token_id:value.accountId,reserved:reserves?'1000000000000000000000':'0'})):[]))],
   block_height:275000001});
  if(method==='storage_balance_of')return read({result:[...Buffer.from(JSON.stringify(
   storage?{total:'100000000000000000000000',available:'0'}:null))],
   block_height:275000001});
  if(method==='get_account')return read({result:[...Buffer.from(JSON.stringify(
   positions?positionFor(manifest,args.account_id):{supplied:[],collateral:[],borrowed:[]}))],
   block_height:275000001});
  throw Error('UNEXPECTED_METHOD_'+method);
 };
 return {fetchImpl,calls};
}
function balanceFor(manifest,token,accountId){
 if(!manifest)return '0';
 if(token.role==='collateral'&&accountId===manifest.accountIds.borrower)
  return SCENARIO.borrowerCollateral;
 if(token.role==='debt'&&accountId===manifest.accountIds.borrower)
  return SCENARIO.borrowAmount;
 if(token.role==='debt'&&accountId===manifest.accountIds.liquidator)
  return SCENARIO.liquidatorRepaymentDeposit;
 return '0';
}
function positionFor(manifest,accountId){
 const collateral=manifest.tokens.find(token=>token.role==='collateral');
 const debt=manifest.tokens.find(token=>token.role==='debt');
 if(accountId===manifest.accountIds.borrower)return {supplied:[],
  collateral:[{token_id:collateral.accountId,balance:SCENARIO.borrowerCollateral}],
  borrowed:[{token_id:debt.accountId,balance:SCENARIO.borrowAmount}]};
 if(accountId===manifest.accountIds.liquidator)return {supplied:[],
  collateral:[],borrowed:[]};
 return {supplied:[],collateral:[],borrowed:[]};
}
function txResult(manifest){
 const collateral=manifest.tokens.find(token=>token.role==='collateral');
 const debt=manifest.tokens.find(token=>token.role==='debt');
 return {status:{SuccessValue:''},final_execution_status:'FINAL',
  transaction:{receiver_id:manifest.accountIds.oracle,actions:[{FunctionCall:{
   method_name:'oracle_call',gas:1,deposit:'1',args:b64({
    receiver_id:manifest.accountIds.lending,
    price_data:buildPriceData(manifest,'unhealthy',{timestamp:'123456789'}),
    msg:buildExecuteMessage([{Liquidate:{
     account_id:manifest.accountIds.borrower,
     in_assets:[{token_id:debt.accountId,
      amount:SCENARIO.liquidation.repay}],
     out_assets:[{token_id:collateral.accountId,
      amount:SCENARIO.liquidation.take}],
    }}]),
   })}}]},
  receipts_outcome:[{outcome:{logs:['EVENT_JSON:'+JSON.stringify({standard:'burrow',
   event:'liquidate',data:[{liquidation_account_id:manifest.accountIds.borrower}]})]}}]};
}
function withdrawResult(manifest){
 const collateral=manifest.tokens.find(token=>token.role==='collateral');
 return {status:{SuccessValue:''},final_execution_status:'FINAL',
  transaction:{receiver_id:manifest.accountIds.lending,actions:[{FunctionCall:{
   method_name:'execute',gas:1,deposit:'1',args:b64({actions:[{Withdraw:{
    token_id:collateral.accountId,amount:SCENARIO.liquidation.take}}]})}}]},
  receipts_outcome:[{outcome:{logs:['EVENT_JSON:'+JSON.stringify({standard:'burrow',
   event:'withdraw_succeeded',data:[{}]})]}}]};
}

test('Stage199 manifest is deterministic, isolated and Testnet-only',()=>{
 const manifest=createLabManifest('stage199owner.testnet');
 assert.equal(manifest.network,'testnet');
 assert.equal(manifest.rpc,'https://rpc.testnet.near.org');
 assert.equal(manifest.executionEnabled,false);
 assert.equal(manifest.mainnetExecutionAllowed,false);
 assert.equal(manifest.sharedRheaContractMutationsAllowed,false);
 assert.equal(manifest.signer,'LOCAL_NEAR_CLI_KEYCHAIN_ONLY');
 assert.equal(manifest.accountIds.root,'stage199owner.testnet');
 assert.equal(manifest.accountIds.lending,'lend.stage199owner.testnet');
 assert.equal(manifest.tokens.length,3);
 assert.deepEqual(manifest,createLabManifest('stage199owner.testnet'));
 assert.throws(()=>validateOwner('arbivane-fixture-66971fd6.testnet'));
 assert.throws(()=>validateOwner('owner.near'));
});
test('health model separates the healthy and liquidatable test prices',()=>{
 const manifest=createLabManifest('stage199health.testnet');
 const collateral=manifest.tokens.find(token=>token.role==='collateral');
 const debt=manifest.tokens.find(token=>token.role==='debt');
 const healthy=computeHealth({collateralAmount:SCENARIO.borrowerCollateral,
  debtAmount:SCENARIO.borrowAmount,collateralToken:collateral,debtToken:debt,
  prices:manifest.scenario.prices.healthy});
 const unhealthy=computeHealth({collateralAmount:SCENARIO.borrowerCollateral,
  debtAmount:SCENARIO.borrowAmount,collateralToken:collateral,debtToken:debt,
  prices:manifest.scenario.prices.unhealthy});
 assert.ok(healthy.health>=1);
 assert.ok(unhealthy.health<1);
 assert.equal(healthy.source,'TEST_PRICE_MODEL');
});
test('generated scripts pin sources, preflight modes and no key or mainnet paths',()=>{
 const manifest=createLabManifest('stage199plan.testnet');
 for(const script of [renderSetupBash(manifest),renderMarketBash(manifest),
  renderLiquidationBash(manifest)]){
  assert.ok(!script.includes('--private-key'));
  assert.ok(!script.includes('mainnet'));
  assert.ok(!script.includes('arbivane-fixture-66971fd6.testnet'));
 }
 assert.ok(renderSetupBash(manifest).includes(SOURCE.commit));
 assert.ok(renderSetupBash(manifest).includes('--expect unused'));
 assert.ok(renderMarketBash(manifest).includes('--expect deployed'));
 assert.ok(renderLiquidationBash(manifest).includes('--expect deployed'));
 assert.ok(renderSetupPowerShell(manifest).includes('--expect \'unused\''));
 assert.ok(renderMarketPowerShell(manifest).includes('--expect \'deployed\''));
 assert.ok(renderLiquidationPowerShell(manifest).includes('--expect \'deployed\''));
});
test('writePlan is write-once and emits both preflight modes',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'arbivane-stage199-'));
 try{
  const generated=await writePlan('stage199write.testnet',dir);
  assert.equal(generated.manifest.network,'testnet');
  const preflight=await readFile(join(dir,'preflight.mjs'),'utf8');
  assert.ok(preflight.includes("'unused'"));
  assert.ok(preflight.includes("'deployed'"));
  assert.ok(preflight.includes("'Need at least '+manifest.minimumOwnerBalanceTNEAR+' TNEAR for subaccounts"));
  await assert.rejects(writePlan('stage199write.testnet',dir),/EEXIST/);
 }finally{await rm(dir,{recursive:true,force:true})}
});
test('fully provisioned lab reaches a modeled liquidation-ready state',async()=>{
 const manifest=createLabManifest('stage199ready.testnet');
 const stub=labStub(manifest);
 const state=await inspectManifest(manifest,{fetchImpl:stub.fetchImpl});
 assert.equal(state.readiness,'BORROWER_POSITION_READY_FOR_TEST_LIQUIDATION');
 assert.equal(state.codeVerified,true);
 assert.equal(state.assetsVerified,true);
 assert.equal(state.reservesVerified,true);
 assert.equal(state.storageVerified,true);
 assert.equal(state.metadataVerified,true);
 assert.equal(state.healthModels.healthy.health>=1,true);
 assert.equal(state.healthModels.unhealthy.health<1,true);
 assert.equal(state.liquidationEligibilityModeled,true);
 assert.equal(state.verifiedLiquidations,0);
 assert.equal(state.executionEnabled,false);
 assert.ok(stub.calls.every(call=>['status','query'].includes(call.method)));
});
test('metadata, storage and reserve gaps are named instead of hidden',async()=>{
 const manifest=createLabManifest('stage199gaps.testnet');
 const metadata=await inspectManifest(manifest,{fetchImpl:
  labStub(manifest,{metadata:false}).fetchImpl});
 assert.equal(metadata.readiness,'TOKEN_METADATA_MISMATCH');
 const storage=await inspectManifest(manifest,{fetchImpl:
  labStub(manifest,{storage:false}).fetchImpl});
 assert.equal(storage.readiness,'STORAGE_NOT_REGISTERED');
 const reserves=await inspectManifest(manifest,{fetchImpl:
  labStub(manifest,{reserves:false}).fetchImpl});
 assert.equal(reserves.readiness,'ASSETS_CONFIGURED_RESERVES_NOT_FUNDED');
});
test('a final liquidation and withdraw receipt are verified from arguments, logs and bounds',async()=>{
 const manifest=createLabManifest('stage199receipt.testnet');
 const stub=labStub(manifest,{tx:TX,withdraw:WTX});
 const state=await inspectManifest(manifest,{fetchImpl:stub.fetchImpl,
  txHash:TX,withdrawTxHash:WTX});
 assert.equal(state.readiness,'LIQUIDATION_VERIFIED');
 assert.equal(state.liquidationTransactionVerified,true);
 assert.equal(state.withdrawVerified,true);
 assert.equal(state.verifiedLiquidations,1);
 assert.equal(state.liquidation.inAsset.atomic,SCENARIO.liquidation.repay);
 assert.equal(state.liquidation.outAsset.atomic,SCENARIO.liquidation.take);
 assert.ok(Number.isFinite(state.realizedTestNotional));
 assert.equal(state.realizedTestNotionalDetail.source,
  'TEST_PRICE_MODEL_NOT_MARKET_DATA');
});
test('a transaction with an out-of-bounds liquidation amount is rejected',async()=>{
 const manifest=createLabManifest('stage199bounds.testnet');
 const result=txResult(manifest);
 const call=result.transaction.actions[0].FunctionCall;
 const args=JSON.parse(Buffer.from(call.args,'base64').toString());
 const message=JSON.parse(args.msg);
 message.Execute.actions[0].Liquidate.out_assets[0].amount='999999999999999999999999';
 call.args=b64({...args,msg:JSON.stringify(message)});
 const stub=labStub(manifest);
 const base=stub.fetchImpl;
 const state=await inspectManifest(manifest,{fetchImpl:async(uri,options)=>{
  const body=JSON.parse(options.body);
  if(body.method==='tx')return read(result);
  return base(uri,options);
 },txHash:TX});
 assert.equal(state.liquidationTransactionVerified,false);
 assert.match(state.liquidation.error,/LIQUIDATION_AMOUNT_OUT_OF_BOUNDS/);
 assert.equal(state.readiness,'BORROWER_POSITION_READY_FOR_TEST_LIQUIDATION');
});
test('owner intents are unsigned, owner-only and cover missing assets',async()=>{
 const manifest=createLabManifest('stage199intents.testnet');
 const stub=labStub(manifest,{assets:false});
 const intents=await buildOwnerIntents(manifest.accountIds.root,
  manifest.accountIds.root,{fetchImpl:stub.fetchImpl});
 assert.equal(intents.requiresWalletApproval,true);
 assert.equal(intents.network,'testnet');
 assert.ok(intents.transactions.length>0);
 assert.ok(intents.transactions.some(transaction=>
  transaction.actions.some(action=>action.methodName==='add_asset')));
 assert.ok(intents.transactions.every(transaction=>
  transaction.receiverId.endsWith('.testnet')));
 await assert.rejects(buildOwnerIntents(manifest.accountIds.root,
  'stranger.testnet',{fetchImpl:stub.fetchImpl}),
  /CONNECTED_WALLET_IS_NOT_LAB_OWNER/);
});
test('token balance bridge accepts only Testnet accounts and numeric atomic strings',async()=>{
 const owner='stage199balance.testnet';
 const fetchImpl=async(uri,options)=>{
  assert.equal(uri,'https://rpc.testnet.near.org');
  const body=JSON.parse(options.body);
  assert.equal(body.params.method_name,'ft_balance_of');
  return read({result:[...Buffer.from(JSON.stringify('123000000000000000000'))],
   block_height:275000001});
 };
 const result=await readTokenBalance('tcoll.'+owner,owner,{fetchImpl});
 assert.equal(result.balanceAtomic,'123000000000000000000');
 assert.equal(result.signerConnected,false);
 await assert.rejects(readTokenBalance('bad',owner,{fetchImpl}),/INVALID_/);
 await assert.rejects(readTokenBalance('tcoll.'+owner,'bad',{fetchImpl}),/INVALID_/);
});
test('owner inspection is read-only and rejects non-Testnet owners',async()=>{
 const manifest=createLabManifest('stage199inspect.testnet');
 const stub=labStub(manifest);
 const state=await inspectOwnerLab(manifest.accountIds.root,{fetchImpl:stub.fetchImpl});
 assert.equal(state.signerConnected,false);
 assert.equal(state.executionEnabled,false);
 await assert.rejects(inspectOwnerLab('owner.near',{fetchImpl:stub.fetchImpl}),
  /INVALID_OR_UNRECOVERABLE_TESTNET_OWNER/);
});

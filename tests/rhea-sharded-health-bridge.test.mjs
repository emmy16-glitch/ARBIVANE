import test from 'node:test';
import assert from 'node:assert/strict';
import {composeVerifiedDetailedCheckpoint} from '../src/rhea/verified-shard-bridge.ts';
import {inspectIndexedRheaHealth} from '../src/rhea/indexed-health-pipeline.ts';
const HASH='2'.repeat(43),LENDING='contract.main.burrow.near',ORACLE='aggregate-oracle.near',NOW=1_800_000_000_000;
const A='a'.repeat(64),B='b'.repeat(64);
const finding={accountId:'alice.near',classification:'DEBT_SHARES_DISCOVERED_UNVALUED',positions:[{positionId:'iso',debtAssetIds:['usn'],collateralRecorded:true}]};
function shard(n,override={}){
 return {version:1,mode:'NEAR_RHEA_SAME_BLOCK_BACKFILL',chain:'NEAR_MAINNET',executionEnabled:false,liquidationParityVerified:false,
 lendingContract:LENDING,blockHeight:'101',lendingCodeHash:HASH,codeHashPinProvided:true,totalAccounts:4,
 startIndex:n*2,targetEndIndex:n*2+2,nextIndex:n*2+2,scannedAccounts:2,invalidAccounts:0,schemaReasons:{},
 seenAccountIds:n===0?['alice.near','bob.near']:['charlie.near','david.near'],
 findings:n===0?[finding]:[],completeSnapshot:false,sourceView:'get_account_all_positions',borrowedPoolBalancePositive:true,...override};
}
const assets=[['usn',{supplied:{shares:'10',balance:'10'},borrowed:{shares:'10',balance:'10'},config:{extra_decimals:0,volatility_ratio:10000}}],
 ['wrap.near',{supplied:{shares:'10',balance:'20'},borrowed:{shares:'10',balance:'10'},config:{extra_decimals:0,volatility_ratio:10000}}]];
const detail={supplied:[],positions:{iso:{borrowed:[{token_id:'usn',shares:'4',balance:'4'}],collateral:[{token_id:'wrap.near',shares:'1',balance:'2'}]}}};
const cfg={lendingContract:LENDING,oracleContract:ORACLE,fromFinding:0,maxFoundAccounts:2,maxPriceQueries:3,
 nowMs:NOW,maxAgeMs:60000,maxFutureSkewMs:2000,maxConfidenceBps:150};
function rpc(options={}){
 const calls=[];
 return {calls,client:{
 async viewAccount(id,h){calls.push(['account',id,h]);return {blockHeight:'101',codeHash:HASH};},
 async view(id,method,args={},block){calls.push(['view',method,args,block]);let value;
 if(method==='get_assets_paged')value=assets;
 else if(method==='get_num_accounts')value=4;
 else if(method==='get_all_token_pyth_infos')value={'usn':{price_identifier:A},'wrap.near':{price_identifier:B}};
 else if(method==='get_config')value={enable_pyth_oracle:true};
 else if(method==='get_accounts_paged')value=[{account_id:options.id??'alice.near',positions:{}}];
 else if(method==='get_account_all_positions')value=options.detail??detail;
 else if(method==='get_price_no_older_than')value={price:'100000000',conf:'40000',expo:-8,publish_time:(NOW-20000)/1000};
 else throw Error('unexpected method '+method);
 return {blockHeight:'101',value};
 }}};
}
test('valid detailed shards combine to one same-block debt index',()=>{
 const {checkpoint,aggregate}=composeVerifiedDetailedCheckpoint([shard(0),shard(1)],2);
 assert.equal(checkpoint.sourceView,'get_account_all_positions');
 assert.equal(checkpoint.completeSnapshot,true);
 assert.equal(aggregate.scannedAccounts,4);
 assert.equal(aggregate.debtAccounts,1);
});
test('paged registry lacking debt is NOT a false negative for the detailed source',async()=>{
 const {checkpoint}=composeVerifiedDetailedCheckpoint([shard(0),shard(1)],2);
 const {client,calls}=rpc();
 const result=await inspectIndexedRheaHealth(client,checkpoint,cfg);
 assert.equal(result.sourceRegistry,'DETAILED_POSITION_SHARDS');
 assert.equal(result.paperAtRisk,1);
 assert.equal(result.records[0].liquidationEligible,false);
 assert.ok(calls.filter(c=>c[0]==='view').every(c=>c[3]===101));
});
test('same-block detailed source rejects share balance discrepancies before prices',async()=>{
 const {checkpoint}=composeVerifiedDetailedCheckpoint([shard(0),shard(1)],2);
 const {client,calls}=rpc({detail:{supplied:[],positions:{iso:{borrowed:[{token_id:'usn',shares:'4',balance:'5'}],collateral:[{token_id:'wrap.near',shares:'1',balance:'2'}]}}}});
 const result=await inspectIndexedRheaHealth(client,checkpoint,cfg);
 assert.equal(result.records[0].blockers[0],'DETAILED_SHARE_PARITY_FAILED');
 assert.equal(calls.filter(c=>c[1]==='get_price_no_older_than').length,0);
});
test('a changed account ID blocks detailed position attribution',async()=>{
 const {checkpoint}=composeVerifiedDetailedCheckpoint([shard(0),shard(1)],2);
 const {client}=rpc({id:'other.near'});
 const result=await inspectIndexedRheaHealth(client,checkpoint,cfg);
 assert.equal(result.records[0].blockers[0],'INDEX_RECORD_CHANGED');
});
test('same-block merger rejects missing, duplicate, or mismatched shards',()=>{
 assert.throws(()=>composeVerifiedDetailedCheckpoint([shard(0)],2));
 assert.throws(()=>composeVerifiedDetailedCheckpoint([shard(0),shard(1,{blockHeight:'102'})],2));
 assert.throws(()=>composeVerifiedDetailedCheckpoint([shard(0),shard(1,{seenAccountIds:['alice.near','david.near']})],2));
 assert.throws(()=>composeVerifiedDetailedCheckpoint([shard(0,{codeHashPinProvided:false}),shard(1)],2));
});
test('positive lending pool debt with no discovered borrower remains an error',()=>{
 assert.throws(()=>composeVerifiedDetailedCheckpoint([shard(0,{findings:[]}),shard(1)],2),/SHARDED_MARKET_EVIDENCE_NOT_COMPLETE/);
});
test('real zero-pool zero-borrower market may produce a valid empty research index',()=>{
 const {aggregate}=composeVerifiedDetailedCheckpoint([shard(0,{findings:[],borrowedPoolBalancePositive:false}),shard(1,{borrowedPoolBalancePositive:false})],2);
 assert.equal(aggregate.debtAccounts,0);
});

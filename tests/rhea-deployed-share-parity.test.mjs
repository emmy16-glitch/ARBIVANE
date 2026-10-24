import test from 'node:test';
import assert from 'node:assert/strict';
import {compareAccountShareParity,parseParityPools,probeDeployedShares} from '../src/rhea/deployed-share-parity.ts';
const HASH='2'.repeat(43);
const lending='contract.main.burrow.near',oracle='aggregate-oracle.near';
const raw=[
 ['wrap.near',{supplied:{shares:'10',balance:'30'},borrowed:{shares:'8',balance:'40'}}],
 ['usn',{supplied:{shares:'10',balance:'10'},borrowed:{shares:'10',balance:'10'}}],
];
const page={account_id:'alice.near',collateral:{'wrap.near':'2'},borrowed:{'usn':'3'}};
const detailed={account_id:'alice.near',collateral:[{token_id:'wrap.near',shares:'2',balance:'6'}],borrowed:[{token_id:'usn',shares:'3',balance:'3'}]};
const pools=()=>parseParityPools(raw);
const settings={lendingContract:lending,oracleContract:oracle,maxAccounts:4,pageSize:2,maxDetailedAccounts:2};
function mock(extra={}){
 const events=[];
 const rpc={
 async viewAccount(id,h){events.push(['account',id,h]);return {blockHeight:'101',codeHash:HASH};},
 async view(id,m,args,h){events.push(['view',id,m,args,h]);
  let value;
  if(m==='get_assets_paged')value=raw;
  else if(m==='get_num_accounts')value=2;
  else if(m==='get_accounts_paged')value=[page,{account_id:'bob.near',borrowed:{},collateral:{}}];
  else if(m==='get_account')value=detailed;
  else throw Error('unexpected '+m);
  return {blockHeight:'101',value};
 }};
 if(extra.patch){const old=rpc.view;rpc.view=async(...args)=>extra.patch(args,()=>old(...args));}
 if(extra.account)rpc.viewAccount=extra.account;
 return {rpc,events};
}
test('read-only same-block successful sample remains explicitly unapproved',async()=>{
 const {rpc,events}=mock();const report=await probeDeployedShares(rpc,settings);
 assert.equal(report.status,'SAMPLED_SHARE_MATCH');assert.equal(report.checkedAccounts,1);
 assert.equal(report.checkedPositions,2);assert.equal(report.executionEnabled,false);
 assert.equal(report.deployedLiquidationParityVerified,false);assert.equal(report.priceParityVerified,false);
 assert.equal(report.codeHashPinsProvided,false);
 assert.ok(events.filter(e=>e[0]==='view').every(e=>e[4]===101));
 assert.equal(events.filter(e=>e[2]==='get_account').length,1);
});
test('mismatched calculated balance cannot pass',()=>{
 const altered={...detailed,borrowed:[{token_id:'usn',shares:'3',balance:'4'}]};
 const result=compareAccountShareParity(page,altered,pools());
 assert.deepEqual(result.mismatches,[{role:'borrowed',tokenId:'usn',reason:'BALANCE_MISMATCH',expected:'3',observed:'4'}]);
});
test('mismatched borrower ID fails hard',()=>assert.throws(()=>compareAccountShareParity(page,{...detailed,account_id:'bob.near'},pools()),/BORROWER_ID_MISMATCH/));
test('missing detailed tokens register mismatch not zero',()=>{
 const r=compareAccountShareParity(page,{...detailed,borrowed:[]},pools());
 assert.equal(r.mismatches[0].reason,'SHARES_MISMATCH');
});
test('detailed share mismatch is not a balance-only discrepancy',()=>{
 const r=compareAccountShareParity(page,{...detailed,borrowed:[{token_id:'usn',shares:'4',balance:'4'}]},pools());
 assert.equal(r.mismatches[0].reason,'SHARES_MISMATCH');
});
test('array-paged shares work under strict schema',()=>{
 const p={...page,borrowed:[{token_id:'usn',shares:'3'}],collateral:[{token_id:'wrap.near',shares:'2'}]};
 assert.equal(compareAccountShareParity(p,detailed,pools()).mismatches.length,0);
});
test('isolated positions do not imply a compatible legacy source path',()=>{
 assert.throws(()=>compareAccountShareParity({...page,positions:{isolated:{borrowed:{}}}},detailed,pools()),/UNSUPPORTED_ISOLATED/);
});
test('unknown assets fail closed',()=>{
 assert.throws(()=>compareAccountShareParity({...page,borrowed:{'unknown.near':'1'}},detailed,pools()),/unknown/);
});
test('duplicate asset rows fail',()=>assert.throws(()=>parseParityPools([...raw,raw[0]]),/duplicate/));
test('balance smaller than shares fails',()=>{
 const a=[['usn',{supplied:{shares:'4',balance:'3'},borrowed:{shares:'1',balance:'2'}}]];
 assert.throws(()=>parseParityPools(a),/pool balance < shares/);
});
test('u128 overflow fails rather than rounding',()=>{
 const n=((1n<<128n)).toString();
 assert.throws(()=>parseParityPools([['usn',{supplied:{shares:n,balance:n},borrowed:{shares:'0',balance:'0'}}]]),/overflows/);
});
test('full redemption uses exact original pool branch',()=>{
 const list=parseParityPools([['usn',{supplied:{shares:'3',balance:'10'},borrowed:{shares:'3',balance:'10'}}]]);
 const a={account_id:'alice.near',collateral:{usn:'3'},borrowed:{}};
 const b={account_id:'alice.near',collateral:[{token_id:'usn',shares:'3',balance:'10'}],borrowed:[]};
 assert.equal(compareAccountShareParity(a,b,list).mismatches.length,0);
});
test('onchain mismatch propagates to read-only audit state',async()=>{
 const {rpc}=mock({patch:async(args,old)=>args[1]==='get_account'?{blockHeight:'101',value:{...detailed,collateral:[{token_id:'wrap.near',shares:'2',balance:'8'}]}}:old()});
 const r=await probeDeployedShares(rpc,settings);
 assert.equal(r.status,'SAMPLED_SHARE_MISMATCH');assert.equal(r.mismatchCount,1);
});
test('bad detailed schema becomes explicit incompatible state',async()=>{
 const {rpc}=mock({patch:async(args,old)=>args[1]==='get_account'?{blockHeight:'101',value:{...detailed,borrowed:{usn:'3'}}}:old()});
 const r=await probeDeployedShares(rpc,settings);
 assert.equal(r.status,'UNSUPPORTED_ACCOUNT_SCHEMA');assert.equal(r.schemaFailures,1);
});
test('no debt sampled cannot claim a match',async()=>{
 const {rpc}=mock({patch:async(args,old)=>args[1]==='get_accounts_paged'?{blockHeight:'101',value:[{account_id:'a.near',borrowed:{},collateral:{}},{account_id:'b.near',borrowed:{},collateral:{}}]}:old()});
 const r=await probeDeployedShares(rpc,settings);
 assert.equal(r.status,'NO_BORROWERS_SAMPLED');assert.equal(r.checkedAccounts,0);
});
test('partial or wrong-height pages reject',async()=>{
 const {rpc}=mock({patch:async(args,old)=>args[1]==='get_accounts_paged'?{blockHeight:'102',value:[page]}:old()});
 await assert.rejects(()=>probeDeployedShares(rpc,settings),/borrower page or block/);
});
test('wrong block on borrower detail rejects',async()=>{
 const {rpc}=mock({patch:async(args,old)=>args[1]==='get_account'?{blockHeight:'102',value:detailed}:old()});
 await assert.rejects(()=>probeDeployedShares(rpc,settings),/unmatched detailed borrower block/);
});
test('mismatched independently pinned contract hashes reject',async()=>{
 const {rpc}=mock();await assert.rejects(()=>probeDeployedShares(rpc,{...settings,expectedLendingCodeHash:'3'.repeat(43)}),/PINNED_LENDING_CODE_HASH_MISMATCH/);
});
test('same verified hash reads still do not approve liquidation',async()=>{
 const {rpc}=mock();const r=await probeDeployedShares(rpc,{...settings,expectedLendingCodeHash:HASH,expectedOracleCodeHash:HASH});
 assert.equal(r.codeHashPinsProvided,true);assert.equal(r.deployedLiquidationParityVerified,false);
});
test('invalid settings reject before RPC queries',async()=>{
 const {rpc,events}=mock();await assert.rejects(()=>probeDeployedShares(rpc,{...settings,maxAccounts:1000}),/maxAccounts/);assert.deepEqual(events,[]);
});
test('unknown onchain share format blocks sampled parity',async()=>{
 const {rpc}=mock({patch:async(args,old)=>args[1]==='get_accounts_paged'?{blockHeight:'101',value:[{account_id:'alice.near',borrowed:{'unknown.near':'1'},collateral:{}},{account_id:'bob.near',borrowed:{},collateral:{}}]}:old()});
 const r=await probeDeployedShares(rpc,settings);
 assert.equal(r.status,'UNSUPPORTED_ACCOUNT_SCHEMA');assert.equal(r.checkedAccounts,0);
});

test('stringified account count remains valid for legacy-compatible RPCs',async()=>{
 const {rpc}=mock({patch:async(args,old)=>args[1]==='get_num_accounts'?{blockHeight:'101',value:'2'}:old()});
 const r=await probeDeployedShares(rpc,settings);assert.equal(r.totalAccounts,2);
});
test('fractional and negative numeric account counts fail closed',async()=>{
 for(const value of [-1,1.5,Number.MAX_SAFE_INTEGER]){
  const {rpc}=mock({patch:async(args,old)=>args[1]==='get_num_accounts'?{blockHeight:'101',value}:old()});
  await assert.rejects(()=>probeDeployedShares(rpc,settings),/invalid total borrower count/);
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { discoverDebtInAccount, scanRheaDebtWindow } from '../src/rhea/debt-discovery.ts';
import { parseParityPools } from '../src/rhea/deployed-share-parity.ts';
const HASH='2'.repeat(43);
const assets=[
 ['wrap.near',{supplied:{shares:'10',balance:'20'},borrowed:{shares:'5',balance:'10'}}],
 ['usn',{supplied:{shares:'10',balance:'10'},borrowed:{shares:'10',balance:'10'}}],
];
const pools=parseParityPools(assets);
const all=[
 {account_id:'a.near',positions:{'isolated-1':{borrowed:[{token_id:'usn',shares:'2'}],collateral:[{token_id:'wrap.near',shares:'3'}]}}},
 {account_id:'b.near',positions:{'isolated-2':{borrowed:[],collateral:[{token_id:'wrap.near',shares:'2'}]}}},
 {account_id:'c.near',borrowed:{'wrap.near':'5'},collateral:{'usn':'1'}},
 {account_id:'d.near',positions:{},supplied:[]},
 {account_id:'e.near',positions:{'0':{borrowed:{'wrap.near':'0'},collateral:{}}}},
];
const cfg={lendingContract:'contract.main.burrow.near',fromIndex:0,maxAccounts:5,pageSize:2,maxFindings:10};
function mock(rows=all,options={}){
 const calls=[];
 const rpc={
  async viewAccount(id,block){calls.push({kind:'account',id,block});return {blockHeight:'101',codeHash:HASH};},
  async view(id,method,args,block){calls.push({kind:'view',id,method,args,block});
   let value;
   if(method==='get_assets_paged')value=assets;
   else if(method==='get_num_accounts')value=rows.length;
   else if(method==='get_accounts_paged')value=rows.slice(args.from_index,args.from_index+args.limit);
   else throw Error('not a read-only discovery method');
   if(options.override)value=options.override(method,args,value);
   return {blockHeight:options.wrongBlock&&method==='get_accounts_paged'?'102':'101',value};
  }
 };
 return {rpc,calls};
}
test('isolated debts are identified with their exact position scope',()=>{
 const hit=discoverDebtInAccount(all[0],pools);
 assert.deepEqual(hit,{accountId:'a.near',positions:[{positionId:'isolated-1',debtAssetIds:['usn'],collateralRecorded:true}],classification:'DEBT_SHARES_DISCOVERED_UNVALUED'});
 assert.equal(discoverDebtInAccount(all[1],pools),null);
});
test('account-wide legacy debt is not assigned isolated position 0',()=>{
 assert.deepEqual(discoverDebtInAccount(all[2],pools)?.positions,[{positionId:null,debtAssetIds:['wrap.near'],collateralRecorded:true}]);
 assert.equal(discoverDebtInAccount(all[3],pools),null);
});
test('reject ambiguous isolated and account-wide borrowed debt',()=>{
 assert.throws(()=>discoverDebtInAccount({...all[0],borrowed:{usn:'3'}},pools),/ambiguous/);
});
test('reject missing fields, unsafe numeric shares, duplicate tokens and unknown pool tokens',()=>{
 assert.throws(()=>discoverDebtInAccount({account_id:'a.near'},pools),/missing/);
 assert.throws(()=>discoverDebtInAccount({account_id:'a.near',borrowed:{usn:2}},pools),/u128/);
 assert.throws(()=>discoverDebtInAccount({account_id:'a.near',borrowed:{'ghost.near':'2'}},pools),/unknown/);
 assert.throws(()=>discoverDebtInAccount({account_id:'a.near',borrowed:[{token_id:'usn',shares:'1'},{token_id:'usn',shares:'2'}]},pools),/duplicate/);
 assert.throws(()=>discoverDebtInAccount({account_id:'a.near',borrowed:{usn:(1n<<128n).toString()}},pools),/overflow/);
});
test('read-only window scans positions and returns an exact resumption cursor',async()=>{
 const {rpc,calls}=mock();
 const res=await scanRheaDebtWindow(rpc,cfg);
 assert.equal(res.status,'WINDOW_SCANNED_UNAPPROVED');
 assert.equal(res.fromIndex,0);assert.equal(res.nextOffset,5);assert.equal(res.totalAccounts,5);
 assert.equal(res.scannedAccounts,5);assert.equal(res.findingCount,2);
 assert.equal(res.completeIndexEnumeration,true);
 assert.deepEqual(res.findings.map(v=>v.accountId),['a.near','c.near']);
 assert.equal(res.executionEnabled,false);assert.equal(res.liquidationParityVerified,false);
 assert.ok(calls.filter(v=>v.kind==='view').every(v=>v.block===101));
 assert.equal(calls.filter(v=>v.kind==='view'&&v.method==='get_accounts_paged').length,3);
});
test('bounded middle window can be resumed without skipping an index',async()=>{
 const {rpc}=mock();
 const first=await scanRheaDebtWindow(rpc,{...cfg,maxAccounts:2});
 assert.equal(first.nextOffset,2);assert.equal(first.completeIndexEnumeration,false);
 const second=await scanRheaDebtWindow(rpc,{...cfg,fromIndex:first.nextOffset,maxAccounts:2});
 assert.equal(second.nextOffset,4);assert.equal(second.findings[0]?.accountId,'c.near');
 assert.equal(second.completeIndexEnumeration,false);
});
test('finding cap stops after processed entry, not after all prefetched entries',async()=>{
 const {rpc}=mock();
 const res=await scanRheaDebtWindow(rpc,{...cfg,maxFindings:1,pageSize:5});
 assert.equal(res.status,'FINDING_LIMIT_REACHED');
 assert.equal(res.nextOffset,1);assert.equal(res.scannedAccounts,1);
 const next=await scanRheaDebtWindow(rpc,{...cfg,fromIndex:res.nextOffset});
 assert.equal(next.findings[0]?.accountId,'c.near');
});
test('invalid borrower row cannot be treated as debt-free',async()=>{
 const invalid=[all[0],{account_id:'b.near',borrowed:{'ghost.near':'3'}}];
 const {rpc}=mock(invalid);
 const r=await scanRheaDebtWindow(rpc,{...cfg,maxAccounts:2});
 assert.equal(r.status,'SCHEMA_ERRORS_DETECTED');assert.equal(r.invalidAccounts,1);
 assert.equal(r.completeIndexEnumeration,false);
 assert.equal(r.schemaReasons.UNKNOWN_OR_DUPLICATE_ASSET,1);
});
test('duplicate account IDs across pages reject entire scan',async()=>{
 const {rpc}=mock([all[0],all[0]]);
 await assert.rejects(()=>scanRheaDebtWindow(rpc,{...cfg,maxAccounts:2,pageSize:1}),/duplicate borrower/);
});
test('mismatched pinned block and bad page reject entire scan',async()=>{
 const a=mock(all,{wrongBlock:true});
 await assert.rejects(()=>scanRheaDebtWindow(a.rpc,cfg),/pinned block/);
 const b=mock(all,{override:(method,args,value)=>method==='get_accounts_paged'?value.slice(1):value});
 await assert.rejects(()=>scanRheaDebtWindow(b.rpc,cfg),/borrower page/);
});
test('pin mismatch aborts before reading the market',async()=>{
 const {rpc,calls}=mock();
 await assert.rejects(()=>scanRheaDebtWindow(rpc,{...cfg,expectedLendingCodeHash:'3'.repeat(43)}),/CODE_HASH_MISMATCH/);
 assert.equal(calls.filter(v=>v.kind==='view').length,0);
});
test('reject unsafe scan budgets and cursors before RPC reads',async()=>{
 for(const k of [{...cfg,maxAccounts:1001},{...cfg,fromIndex:-1},{...cfg,pageSize:0},{...cfg,maxFindings:101},{...cfg,fromIndex:5_000_000.5}]){
  const {rpc,calls}=mock();await assert.rejects(()=>scanRheaDebtWindow(rpc,k),/invalid|must be/);assert.equal(calls.length,0);
 }
});
test('account count cursor bounds and empty end cursor',async()=>{
 const {rpc}=mock();
 await assert.rejects(()=>scanRheaDebtWindow(rpc,{...cfg,fromIndex:6}),/cursor exceeds/);
 const r=await scanRheaDebtWindow(rpc,{...cfg,fromIndex:5});
 assert.equal(r.scannedAccounts,0);assert.equal(r.nextOffset,5);assert.equal(r.completeIndexEnumeration,false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {NearRpcHttpError} from '../src/rhea/rpc.ts';
import {FailoverNearReadOnlyRpc} from '../src/rhea/failover-readonly-rpc.ts';

test('429 rotates to fallback and keeps it preferred for subsequent pinned reads',async()=>{
 const calls=[];
 const primary={
  async viewAccount(){calls.push('primary-account');throw new NearRpcHttpError(429,'0');},
  async view(){calls.push('primary-view');throw new NearRpcHttpError(429,'0');},
 };
 const fallback={
  async viewAccount(_id,block){calls.push('fallback-account');return {blockHeight:String(block),codeHash:'2'.repeat(43)};},
  async view(_id,_method,_args,block){calls.push('fallback-view');return {blockHeight:String(block),value:{ok:true}};},
 };
 const rpc=new FailoverNearReadOnlyRpc([primary,fallback]);
 assert.equal((await rpc.viewAccount('contract.near',123)).blockHeight,'123');
 assert.deepEqual((await rpc.view('contract.near','get_value',{},123)).value,{ok:true});
 assert.deepEqual(calls,['primary-account','fallback-account','fallback-view']);
 assert.deepEqual(rpc.getStats(),{endpointCount:2,preferredEndpoint:1,failovers:1});
});

test('contract and snapshot errors fail closed without changing providers',async()=>{
 let fallbackCalls=0;
 const rpc=new FailoverNearReadOnlyRpc([{
  async viewAccount(){throw Error('inconsistent snapshot block');},
  async view(){throw Error('NEAR RPC returned an error');},
 },{
  async viewAccount(){fallbackCalls++;return {blockHeight:'1',codeHash:'2'.repeat(43)};},
  async view(){fallbackCalls++;return {blockHeight:'1',value:null};},
 }]);
 await assert.rejects(()=>rpc.viewAccount('contract.near',1),/inconsistent snapshot block/);
 await assert.rejects(()=>rpc.view('contract.near','get_value',{},1),/returned an error/);
 assert.equal(fallbackCalls,0);
});

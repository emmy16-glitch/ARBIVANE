import assert from 'node:assert/strict';
import test from 'node:test';
import {environmentReadiness} from '../dashboard/server/readiness.mjs';

const response = (value, ok = true) => ({ok, json:async()=>value});

test('testnet readiness reports only authentic matching RPC status', async () => {
  const ready = await environmentReadiness('testnet', {env:{NEAR_TESTNET_RPC_URL:'https://rpc.testnet.near.org'},
    fetchImpl:async()=>response({result:{chain_id:'testnet',sync_info:{latest_block_height:123,syncing:false}}})});
  assert.equal(ready.status, 'connected');
  assert.equal(ready.blockHeight, 123);
  assert.equal(ready.capabilities.read, true);
  assert.equal(ready.capabilities.wallet, false);
  assert.equal(ready.capabilities.transfer, false);
});

test('wrong chain, unsafe URL, and unavailable provider fail closed', async () => {
  const wrong = await environmentReadiness('mainnet', {env:{NEAR_RPC_URL:'https://rpc.mainnet.near.org'},
    fetchImpl:async()=>response({result:{chain_id:'testnet',sync_info:{latest_block_height:1,syncing:false}}})});
  assert.equal(wrong.status, 'unavailable'); assert.equal(wrong.error, 'RPC_STATUS_INVALID');
  const unsafe = await environmentReadiness('mainnet', {env:{NEAR_RPC_URL:'http://localhost:3030'},fetchImpl:fetch});
  assert.equal(unsafe.status, 'unavailable'); assert.equal(unsafe.error, 'UNSAFE_RPC_ENDPOINT');
  const down = await environmentReadiness('testnet', {env:{},fetchImpl:async()=>{throw Error('secret provider failure')}});
  assert.equal(down.status, 'unavailable'); assert.equal(down.error, 'RPC_UNAVAILABLE');
  assert.equal(JSON.stringify(down).includes('secret'), false);
});

test('mainnet readiness can never advertise signing or spending', async () => {
  const result = await environmentReadiness('mainnet', {env:{},fetchImpl:async()=>response({result:{
    chain_id:'mainnet',sync_info:{latest_block_height:999,syncing:false}}})});
  assert.equal(result.status, 'connected');
  assert.equal(result.capabilities.automate, false);
  assert.equal(result.capabilities.wallet, false);
  assert.equal(result.capabilities.mainnetSpending, false);
  assert.match(result.requirements.note, /disabled/i);
});

import {access} from 'node:fs/promises';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const allowed = {
  testnet: {chainId:'testnet', defaultUrl:'https://rpc.testnet.near.org'},
  mainnet: {chainId:'mainnet', defaultUrl:'https://rpc.mainnet.near.org'},
};

function endpoint(environment, env) {
  const raw = environment === 'testnet' ? env.NEAR_TESTNET_RPC_URL : env.NEAR_RPC_URL;
  const url = new URL(raw || allowed[environment].defaultUrl);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('UNSAFE_RPC_ENDPOINT');
  return url.toString();
}

async function rpcStatus(environment, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);
  try {
    const url = endpoint(environment, options.env);
    const response = await options.fetchImpl(url, {method:'POST', signal:controller.signal,
      headers:{'content-type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id:'arbivane-readiness',method:'status',params:[]})});
    if (!response.ok) throw new Error('RPC_HTTP_FAILURE');
    const payload = await response.json();
    const chainId = payload?.result?.chain_id;
    const blockHeight = payload?.result?.sync_info?.latest_block_height;
    const syncing = payload?.result?.sync_info?.syncing;
    if (chainId !== allowed[environment].chainId || !Number.isSafeInteger(blockHeight) ||
      typeof syncing !== 'boolean') throw new Error('RPC_STATUS_INVALID');
    return {status:syncing?'syncing':'connected', chainId, blockHeight, checkedAt:new Date().toISOString()};
  } catch (error) {
    const code = error instanceof Error && ['UNSAFE_RPC_ENDPOINT','RPC_HTTP_FAILURE','RPC_STATUS_INVALID'].includes(error.message)
      ? error.message : 'RPC_UNAVAILABLE';
    return {status:'unavailable', chainId:allowed[environment].chainId, blockHeight:null,
      checkedAt:new Date().toISOString(), error:code};
  } finally { clearTimeout(timer); }
}

export async function environmentReadiness(environment, options = {}) {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  if (environment === 'sandbox') {
    let evidenceConfigured = false; let workspacesInstalled = false;
    if (env.ARBIVANE_SANDBOX_EVIDENCE_PATH) {
      try { await access(env.ARBIVANE_SANDBOX_EVIDENCE_PATH); evidenceConfigured = true; } catch {}
    }
    try { require.resolve('near-workspaces'); workspacesInstalled = true; } catch {}
    const configured = evidenceConfigured && workspacesInstalled && Boolean(env.NEAR_RPC_URL);
    return {environment, status:configured?'ready':'not_configured', chainId:'localnet', blockHeight:null,
      checkedAt:new Date().toISOString(), capabilities:{read:true, automate:configured,
        disposableSigning:workspacesInstalled, externalTransfer:false, mainnetSpending:false},
      requirements:{evidenceConfigured, workspacesInstalled, sourceRpcConfigured:Boolean(env.NEAR_RPC_URL)}};
  }
  if (!Object.hasOwn(allowed, environment)) throw new Error('INVALID_ENVIRONMENT');
  const rpc = await rpcStatus(environment, {env, fetchImpl, timeoutMs:options.timeoutMs});
  return {...rpc, environment, capabilities:{read:rpc.status==='connected', automate:false,
    wallet:false, transfer:false, mainnetSpending:false},
    requirements:{walletConfigured:false, executionAdapterConfigured:false,
      note:environment==='testnet'?'Compatible Testnet wallet adapter not configured':'Mainnet execution is disabled'}};
}

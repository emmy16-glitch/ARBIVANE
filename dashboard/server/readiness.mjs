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
    let workspacesInstalled=false;
    try { require.resolve('near-workspaces'); workspacesInstalled=true; } catch {}
    const hashesConfigured=/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(env.RHEA_EXPECTED_LENDING_CODE_HASH??'')&&
      /^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(env.RHEA_EXPECTED_ORACLE_CODE_HASH??'');
    const keyless=!env.NEAR_PRIVATE_KEY&&!env.MAINNET_PRIVATE_KEY&&!env.NEAR_ACCOUNT_ID;
    let rpcConfigured=false;
    try{
      const url=new URL(env.NEAR_RPC_URL);
      rpcConfigured=url.protocol==='https:'&&!url.username&&!url.password&&!url.hash;
    }catch{}
    const explicitSandbox=env.ARBIVANE_SANDBOX_AUTOPILOT_ENABLED==='true';
    const configured=workspacesInstalled&&rpcConfigured&&hashesConfigured&&keyless&&explicitSandbox&&
      env.EXECUTION_ENABLED==='false';
    return {environment,status:configured?'ready':'not_configured',chainId:'localnet',
      blockHeight:null,checkedAt:new Date().toISOString(),
      capabilities:{read:rpcConfigured,automate:configured,disposableSigning:workspacesInstalled,
        externalTransfer:false,mainnetSpending:false},
      requirements:{autopilotOptIn:explicitSandbox,workspacesInstalled,
        sourceRpcConfigured:rpcConfigured,codeHashesPinned:hashesConfigured,
        noMainnetKeys:keyless,executionSafetyLock:env.EXECUTION_ENABLED==='false',
        note:'Source discovery reads Rhea mainnet; execution and accounts stay in a disposable local Sandbox.'}};
  }
  if (!Object.hasOwn(allowed, environment)) throw new Error('INVALID_ENVIRONMENT');
  const rpc = await rpcStatus(environment, {env, fetchImpl, timeoutMs:options.timeoutMs});
  return {...rpc, environment, capabilities:{read:rpc.status==='connected', automate:false,
    wallet:false, transfer:false, mainnetSpending:false},
    requirements:{walletConfigured:false, executionAdapterConfigured:false,
      note:environment==='testnet'?'Compatible Testnet wallet adapter not configured':'Mainnet execution is disabled'}};
}

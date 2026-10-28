/**
 * Stage198: generate an opt-in user-owned NEAR Testnet lab plan.
 * No transaction is signed here; private keys never enter ARBIVANE.
 */
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';

export const SOURCE=Object.freeze({
 repository:'NearDeFi/burrowland',
 commit:'0dbfa1803bf26353ffbee2ffd4f494bab23b2756',
 lendingWasm:'6b8aa59bbc20f08e8c6ef68fc992278e124f4d9dd83b2ba7afce466da4659f55',
 oracleWasm:'b775f0fade1d5b3197af2a5a81e9c9d951be268c8587f17d110dfa66a5ffd9e1',
 lendingCodeHash:'8EoF8mXSAYV3HTGyZkSJJJ65xPgzTuj9D442LAjXidXr',
 oracleCodeHash:'DM9vASPfsTAEWd72JSghTWFPx2vUuHTnojPZV33gp9Ke',
});
const OWNER=/^[a-z0-9](?:[a-z0-9_-]{0,46}[a-z0-9])?\.testnet$/;
const LOST='arbivane-fixture-66971fd6.testnet';
function reject(code){throw Error(code)}
export function validateOwner(owner){
 if(typeof owner!=='string'||!OWNER.test(owner)||owner===LOST)
  reject('INVALID_OR_UNRECOVERABLE_TESTNET_OWNER');
 if(/(private|secret|seed|password)/i.test(owner))reject('DO_NOT_PASS_SECRETS');
 return owner;
}
export function createLabManifest(owner){
 owner=validateOwner(owner);
 const ids={root:owner,lending:'lend.'+owner,oracle:'oracle.'+owner,
  borrower:'borrower.'+owner,liquidator:'liq.'+owner};
 if(Object.values(ids).some(id=>id.length>64))
  reject('TESTNET_SUBACCOUNT_ID_TOO_LONG');
 return {
  schemaVersion:1,network:'testnet',rpc:'https://rpc.testnet.near.org',
  purpose:'INDEPENDENT_TEST_LAB_ONLY',sharedRheaContractMutationsAllowed:false,
  mainnetExecutionAllowed:false,signer:'LOCAL_NEAR_CLI_KEYCHAIN_ONLY',
  accountIds:ids,wasm:SOURCE,
  config:{oracle_account_id:ids.oracle,owner_id:owner,booster_token_id:'booster.'+owner,
   booster_decimals:18,max_num_assets:20,maximum_recency_duration_sec:90,
   maximum_staleness_duration_sec:30,minimum_staking_duration_sec:2592000,
   maximum_staking_duration_sec:7776000,
   x_booster_multiplier_at_maximum_staking_duration:30000,force_closing_enabled:true},
  fundingTNEAR:{lending:'6.5',oracle:'1.5',borrower:'0.4',liquidator:'0.4'},
  noLiquidationClaim:true,executionEnabled:false
 };
}
function quote(x){
 if(typeof x!=='string'||x.includes("'"))reject('INVALID_SCRIPT_ARGUMENT');
 return "'"+x+"'";
}
function cli(...args){return '& near '+args.join(' ');}
export function renderSetupPowerShell(manifest){
 const a=manifest.accountIds,c=manifest.config,w=manifest.wasm,f=manifest.fundingTNEAR;
 const baseUrl='https://raw.githubusercontent.com/'+w.repository+'/'+w.commit+'/res/';
 const lines=[
  '# Stage198: EXECUTE ONLY ON YOUR OWN WINDOWS COMPUTER. Testnet funds only.',
  '# This creates four funded subaccounts and two smart contracts using LOCAL keychain.',
  '# Do not enter a private key or seed phrase into this file, ChatGPT or GitHub.',
  '$ErrorActionPreference = "Stop"',
  '$ProgressPreference = "SilentlyContinue"',
  'if (-not (Get-Command near -ErrorAction SilentlyContinue)) { throw "Install near-cli-rs first" }',
  '$base = Split-Path -Parent $MyInvocation.MyCommand.Path',
  '$wasm = Join-Path $base "wasm"',
  'New-Item -ItemType Directory -Force -Path $wasm | Out-Null',
  'Invoke-WebRequest -Uri '+quote(baseUrl+'burrowland.wasm')+' -OutFile (Join-Path $wasm "burrowland.wasm")',
  'Invoke-WebRequest -Uri '+quote(baseUrl+'test_oracle.wasm')+' -OutFile (Join-Path $wasm "test_oracle.wasm")',
  'if ((Get-FileHash (Join-Path $wasm "burrowland.wasm") -Algorithm SHA256).Hash.ToLowerInvariant() -ne '+quote(w.lendingWasm)+') { throw "Lending WASM hash mismatch" }',
  'if ((Get-FileHash (Join-Path $wasm "test_oracle.wasm") -Algorithm SHA256).Hash.ToLowerInvariant() -ne '+quote(w.oracleWasm)+') { throw "Oracle WASM hash mismatch" }',
  'Write-Host "Pinned WASM verified. Testnet owner: '+a.root+'"',
  '$ownerQuery = @{ jsonrpc="2.0"; id="arbivane-preflight"; method="query"; params=@{ request_type="view_account"; finality="final"; account_id='+quote(a.root)+' } } | ConvertTo-Json -Depth 5',
  '$ownerResult = Invoke-RestMethod -Uri "https://rpc.testnet.near.org" -Method Post -Body $ownerQuery -ContentType "application/json"',
  'if (-not $ownerResult.result -or $ownerResult.error) { throw "Owner account not verifiable on NEAR Testnet" }',
  '$ownerBalance = [System.Numerics.BigInteger]::Parse([string]$ownerResult.result.amount)',
  'if ($ownerBalance -lt [System.Numerics.BigInteger]::Parse("9000000000000000000000000")) { throw "Need at least 9 TNEAR to proceed with account funding and fees" }',
  '$confirm = Read-Host "Type DEPLOY-TESTNET to authorize Testnet setup"',
  'if ($confirm -cne "DEPLOY-TESTNET") { throw "Cancelled without sending transactions" }'
 ];
 for(const role of ['lending','oracle','borrower','liquidator']){
  lines.push('Write-Host '+quote('Creating '+role+' subaccount: '+a[role]));
  lines.push(cli('account','create-account','fund-myself',a[role],quote(f[role]+' NEAR'),
   'autogenerate-new-keypair','save-to-keychain','sign-as',a.root,
   'network-config','testnet','sign-with-keychain','send'));
  lines.push('if ($LASTEXITCODE -ne 0) { throw "Account creation failed; stop and inspect on-chain receipts" }');
 }
 lines.push('Write-Host "Deploying test oracle"',
  cli('contract','deploy',a.oracle,'use-file','(Join-Path $wasm "test_oracle.wasm")',
   'without-init-call','network-config','testnet','sign-with-keychain','send'),
  'if ($LASTEXITCODE -ne 0) { throw "Oracle deployment failed" }',
  'Write-Host "Deploying and initializing test-only lending contract"',
  cli('contract','deploy',a.lending,'use-file','(Join-Path $wasm "burrowland.wasm")',
   'with-init-call','new','json-args',quote(JSON.stringify({config:c})),
   'prepaid-gas',quote('100 TGas'),'attached-deposit',quote('0 NEAR'),
   'network-config','testnet','sign-with-keychain','send'),
  'if ($LASTEXITCODE -ne 0) { throw "Lending deployment/init failed" }',
  'Write-Host "Run the repo read-only verifier using the generated manifest.json"',
 );
 return lines.join('\n')+'\n';
}
export async function writePlan(owner,out){
 const manifest=createLabManifest(owner),dir=resolve(out);
 await mkdir(dir,{recursive:true});
 await writeFile(join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
 await writeFile(join(dir,'setup-testnet.ps1'),renderSetupPowerShell(manifest),{flag:'wx'});
 return {dir,manifest};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 const oi=process.argv.indexOf('--owner'),di=process.argv.indexOf('--out');
 if(oi<0||di<0||!process.argv[oi+1]||!process.argv[di+1]){
  console.error('Usage: node scripts/testnet-lab/plan.mjs --owner <you.testnet> --out <new-directory>');
  process.exitCode=2;
 }else writePlan(process.argv[oi+1],process.argv[di+1]).then(
  result=>console.log(JSON.stringify({status:'PLAN_WRITTEN',dir:result.dir,
   accountIds:result.manifest.accountIds,transactionsExecuted:0})),
  error=>{console.error(error.message);process.exitCode=1});
}


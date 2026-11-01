/**
 * Stage199: generate an opt-in, user-owned NEAR Testnet lab plan.
 *
 * No transaction is signed here and private keys never enter ARBIVANE.
 * The generated scripts use the operator's LOCAL NEAR CLI keychain only.
 */
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
 SOURCE,validateOwner,createLabManifest,marketTokens,computeHealth,buildPriceData,
 buildExecuteMessage,SCENARIO,TOKEN_SPECS,
} from './spec.mjs';

export {SOURCE,validateOwner,createLabManifest,marketTokens,computeHealth,
 buildPriceData,buildExecuteMessage,SCENARIO};

const WASM_FILES={lending:'burrowland.wasm',oracle:'test_oracle.wasm',
 fungibleToken:'fungible_token.wasm'};

function reject(code){throw Error(code)}

function bashQuote(value){
 return "'"+String(value).replaceAll("'","'\\''")+"'";
}
function psQuote(value){
 return "'"+String(value).replaceAll("'","''")+"'";
}
function json(value){
 if(typeof value==='string')return value;
 return JSON.stringify(value);
}

function account(role,accountId,amountNear){
 return {kind:'account',role,accountId,amountNear};
}
function deploy(accountId,wasmKey,{initMethod=null,initArgs=null}={}){
 return {kind:'deploy',accountId,wasmKey,initMethod,initArgs};
}
function call({contractId,method,args,signer,deposit='1 yoctoNEAR',
 gas='100 TGas',capture=null}){
 return {kind:'call',contractId,method,args:json(args),signer,deposit,gas,capture};
}
function storageDeposit(tokenId,accountId,amount='0.01 NEAR'){
 return call({contractId:tokenId,method:'storage_deposit',
  args:{account_id:accountId},signer:accountId,deposit:amount,gas:'30 TGas'});
}
function lendingStorage(accountId){
 return call({contractId:null,method:'storage_deposit',
  args:{account_id:accountId},signer:accountId,deposit:'0.1 NEAR',gas:'50 TGas'});
}

export function buildSetupSteps(manifest){
 const a=manifest.accountIds,f=manifest.fundingTNEAR;
 const steps=[
  account('lending',a.lending,f.lending),
  account('oracle',a.oracle,f.oracle),
  account('borrower',a.borrower,f.borrower),
  account('liquidator',a.liquidator,f.liquidator),
 ];
 for(const token of manifest.tokens)
  steps.push(account(token.role,token.accountId,f[token.role]));
 for(const token of manifest.tokens)
  steps.push(deploy(token.accountId,'fungibleToken',{initMethod:'new',initArgs:{
   owner_id:a.root,total_supply:token.totalSupply,
   metadata:{spec:'ft-1.0.0',name:token.name,symbol:token.symbol,
    decimals:token.decimals},
  }}));
 steps.push(deploy(a.oracle,'oracle'));
 steps.push(deploy(a.lending,'lending',{initMethod:'new',
  initArgs:{config:manifest.config}}));
 return steps;
}

export function buildMarketSteps(manifest){
 const a=manifest.accountIds,scenario=manifest.scenario;
 const steps=[];
 for(const token of manifest.tokens){
  steps.push(storageDeposit(token.accountId,a.lending));
  steps.push(storageDeposit(token.accountId,a.root));
  if(token.marketAsset){
   steps.push(storageDeposit(token.accountId,a.borrower));
   steps.push(storageDeposit(token.accountId,a.liquidator));
  }
 }
 for(const accountId of [a.root,a.borrower,a.liquidator])
  steps.push({...lendingStorage(accountId),contractId:a.lending});
 for(const token of manifest.tokens){
  for(const [recipient,amount] of Object.entries(token.mintTo)){
   if(amount==='0')continue;
   const accountId=recipient==='owner'?a.root:a[recipient];
   steps.push(call({contractId:token.accountId,method:'mint',
    args:{account_id:accountId,amount},signer:a.root,deposit:'0 yoctoNEAR',
    gas:'50 TGas'}));
  }
 }
 for(const token of marketTokens(manifest))
  steps.push(call({contractId:a.lending,method:'add_asset',
   args:{token_id:token.accountId,asset_config:token.assetConfig},
   signer:a.root,deposit:'1 yoctoNEAR',gas:'100 TGas'}));
 for(const token of marketTokens(manifest))
  steps.push(call({contractId:token.accountId,method:'ft_transfer_call',
   args:{receiver_id:a.lending,
    amount:scenario.reserveFunding[token.role],
    msg:JSON.stringify('DepositToReserve')},
   signer:a.root,deposit:'1 yoctoNEAR',gas:'150 TGas'}));
 const collateral=manifest.tokens.find(t=>t.role===SCENARIO.collateralRole);
 const debt=manifest.tokens.find(t=>t.role===SCENARIO.debtRole);
 if(!collateral||!debt)reject('MISSING_MARKET_TOKEN');
 steps.push(call({contractId:collateral.accountId,method:'ft_transfer_call',
  args:{receiver_id:a.lending,amount:scenario.borrowerCollateral,
   msg:buildExecuteMessage([{IncreaseCollateral:{
    token_id:collateral.accountId,amount:scenario.borrowerCollateral}}])},
  signer:a.borrower,deposit:'1 yoctoNEAR',gas:'200 TGas'}));
 steps.push(call({contractId:a.oracle,method:'oracle_call',
  args:{receiver_id:a.lending,
   price_data:buildPriceData(manifest,'healthy'),
   msg:buildExecuteMessage([{Borrow:{token_id:debt.accountId,
    amount:scenario.borrowAmount}}])},
  signer:a.borrower,deposit:'1 yoctoNEAR',gas:'300 TGas'}));
 return steps;
}

export function buildLiquidationSteps(manifest){
 const a=manifest.accountIds,scenario=manifest.scenario;
 const collateral=manifest.tokens.find(t=>t.role===SCENARIO.collateralRole);
 const debt=manifest.tokens.find(t=>t.role===SCENARIO.debtRole);
 if(!collateral||!debt)reject('MISSING_MARKET_TOKEN');
 return [
  call({contractId:debt.accountId,method:'ft_transfer_call',
   args:{receiver_id:a.lending,
    amount:scenario.liquidatorRepaymentDeposit,msg:''},
   signer:a.liquidator,deposit:'1 yoctoNEAR',gas:'200 TGas'}),
  call({contractId:a.oracle,method:'oracle_call',
   args:{receiver_id:a.lending,
    price_data:buildPriceData(manifest,'unhealthy'),
    msg:buildExecuteMessage([{Liquidate:{
     account_id:a.borrower,
     in_assets:[{token_id:debt.accountId,
      amount:scenario.liquidation.repay}],
     out_assets:[{token_id:collateral.accountId,
      amount:scenario.liquidation.take}],
    }}])},
   signer:a.liquidator,deposit:'1 yoctoNEAR',gas:'300 TGas',
   capture:'liquidation'}),
  call({contractId:a.lending,method:'execute',
   args:{actions:[{Withdraw:{token_id:collateral.accountId,
    amount:scenario.liquidation.take}}]},
   signer:a.liquidator,deposit:'1 yoctoNEAR',gas:'200 TGas',
   capture:'withdraw'}),
 ];
}

function renderWasmDownloadsBash(manifest){
 const w=manifest.wasm;
 const lines=[];
 for(const [key,file] of Object.entries(WASM_FILES)){
  lines.push('curl -fsSL '+bashQuote(w.rawBase+file)+' -o "$WASM/'+file+'"');
 }
 lines.push('if [ "$(sha256sum "$WASM/burrowland.wasm" | cut -d\' \' -f1)" != '+
  bashQuote(w.lendingWasm)+' ]; then echo "Lending WASM hash mismatch" >&2; exit 1; fi');
 lines.push('if [ "$(sha256sum "$WASM/test_oracle.wasm" | cut -d\' \' -f1)" != '+
  bashQuote(w.oracleWasm)+' ]; then echo "Oracle WASM hash mismatch" >&2; exit 1; fi');
 lines.push('if [ "$(sha256sum "$WASM/fungible_token.wasm" | cut -d\' \' -f1)" != '+
  bashQuote(w.fungibleTokenWasm)+' ]; then echo "Fungible token WASM hash mismatch" >&2; exit 1; fi');
 return lines.join('\n');
}

function renderPreambleBash(manifest,{confirm,title,expect='unused'}){
 const a=manifest.accountIds;
 return [
  '#!/usr/bin/env bash',
  '# '+title,
  '# EXECUTE ONLY ON YOUR OWN COMPUTER. NEAR TESTNET ONLY.',
  '# Uses the LOCAL NEAR CLI keychain. Never paste a private key or seed phrase here.',
  'set -euo pipefail',
  'umask 077',
  'DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"',
  'REPO="${ARBIVANE_ROOT:-$(pwd)}"',
  'MANIFEST="$DIR/manifest.json"',
  'WASM="$DIR/wasm"',
  'LOG="$DIR/lab.log"',
  'mkdir -p "$WASM"',
  'if ! command -v near >/dev/null 2>&1; then echo "Install near-cli-rs (the near command) first: https://near.cli.rs/" >&2; exit 127; fi',
  'if ! command -v node >/dev/null 2>&1; then echo "Node.js 22 or newer is required" >&2; exit 127; fi',
  'if [ ! -f "$REPO/scripts/testnet-lab/verify.mjs" ]; then echo "Run this script from the ARBIVANE repository root or set ARBIVANE_ROOT" >&2; exit 1; fi',
  'echo "Owner account: '+a.root+'"',
  'node "$DIR/preflight.mjs" --manifest "$MANIFEST" --expect '+expect,
  'read -r -p "Type '+confirm+' to authorize Testnet-only transactions: " APPROVAL',
  'if [ "$APPROVAL" != '+bashQuote(confirm)+' ]; then echo "Cancelled without sending transactions." >&2; exit 1; fi',
  'near_call(){',
  '  local contract="$1" method="$2" args="$3" deposit="$4" gas="$5" signer="$6"',
  '  if [[ "$args" == *__TIMESTAMP_NS__* ]]; then',
  '    args="${args//__TIMESTAMP_NS__/$(date +%s%N)}"',
  '  fi',
  '  near contract call-function as-transaction "$contract" "$method" json-args "$args" prepaid-gas "$gas" attached-deposit "$deposit" sign-as "$signer" network-config testnet sign-with-keychain send 2>&1 | tee -a "$LOG"',
  '}',
  'near_deploy(){',
  '  local account="$1" wasm="$2" init="$3" args="$4"',
  '  if [ -n "$init" ]; then',
  '    near contract deploy "$account" use-file "$wasm" with-init-call "$init" json-args "$args" prepaid-gas "100 TGas" attached-deposit "0 NEAR" network-config testnet sign-with-keychain send 2>&1 | tee -a "$LOG"',
  '  else',
  '    near contract deploy "$account" use-file "$wasm" without-init-call network-config testnet sign-with-keychain send 2>&1 | tee -a "$LOG"',
  '  fi',
  '}',
  'near_account(){',
  '  local account="$1" amount="$2"',
  '  near account create-account fund-myself "$account" "$amount NEAR" autogenerate-new-keypair save-to-keychain sign-as '+bashQuote(a.root)+' network-config testnet sign-with-keychain send 2>&1 | tee -a "$LOG"',
  '}',
  '',
 ].join('\n');
}

function renderStepsBash(manifest,steps){
 const a=manifest.accountIds;
 const lines=[];
 for(const step of steps){
  if(step.kind==='account'){
   lines.push('echo '+bashQuote('Creating '+step.role+' account '+step.accountId));
   lines.push('near_account '+bashQuote(step.accountId)+' '+bashQuote(step.amountNear));
  }else if(step.kind==='deploy'){
   const file='$WASM/'+WASM_FILES[step.wasmKey];
   lines.push('echo '+bashQuote('Deploying '+step.wasmKey+' to '+step.accountId));
   if(step.initMethod){
    lines.push('near_deploy '+bashQuote(step.accountId)+' "'+file+'" '+
     bashQuote(step.initMethod)+' '+bashQuote(JSON.stringify(step.initArgs)));
   }else{
    lines.push('near_deploy '+bashQuote(step.accountId)+' "'+file+'" "" ""');
   }
  }else if(step.kind==='call'){
   const contract=step.contractId??a.lending;
   const capture=step.capture?
    ' | tee -a "$LOG" | sed -n \'s/.*Transaction ID: //p\' | tail -1 > "$DIR/'+
    step.capture+'-tx.txt"':'';
   lines.push('echo '+bashQuote('Calling '+step.method+' on '+contract));
   lines.push('near_call '+bashQuote(contract)+' '+bashQuote(step.method)+' '+
    bashQuote(step.args)+' '+bashQuote(step.deposit)+' '+bashQuote(step.gas)+' '+
    bashQuote(step.signer)+capture);
  }
 }
 return lines.join('\n');
}

export function renderSetupBash(manifest){
 const download=renderWasmDownloadsBash(manifest);
 const steps=renderStepsBash(manifest,buildSetupSteps(manifest));
 return renderPreambleBash(manifest,{confirm:'DEPLOY-TESTNET',
  title:'Stage199: create the isolated NEAR Testnet lending lab'})+
  '\n'+download+'\n\n'+steps+
  '\n\necho "Base lab deployed. Next: ./setup-market.sh"\n'+
  'node "$REPO/scripts/testnet-lab/verify.mjs" --manifest "$MANIFEST" || true\n';
}
export function renderMarketBash(manifest){
 const steps=renderStepsBash(manifest,buildMarketSteps(manifest));
 return renderPreambleBash(manifest,{confirm:'SETUP-MARKET',
  title:'Stage199: provision test assets, reserves and a borrower position',expect:'deployed'})+
  '\n'+steps+
  '\n\necho "Market setup submitted. Run the read-only verifier next."\n'+
  'node "$REPO/scripts/testnet-lab/verify.mjs" --manifest "$MANIFEST"\n';
}
export function renderLiquidationBash(manifest){
 const steps=renderStepsBash(manifest,buildLiquidationSteps(manifest));
 return renderPreambleBash(manifest,{confirm:'LIQUIDATE-TESTNET',
  title:'Stage199: trigger one bounded Testnet liquidation',expect:'deployed'})+
  '\n'+steps+
  '\n\necho "Liquidation and withdrawal submitted."\n'+
  'TX="$(cat "$DIR/liquidation-tx.txt" 2>/dev/null || true)"\n'+
  'WITHDRAW="$(cat "$DIR/withdraw-tx.txt" 2>/dev/null || true)"\n'+
  'node "$REPO/scripts/testnet-lab/verify.mjs" --manifest "$MANIFEST"'+
  ' ${TX:+--tx "$TX"} ${WITHDRAW:+--withdraw-tx "$WITHDRAW"}\n';
}

function renderStepsPowerShell(manifest,steps){
 const a=manifest.accountIds;
 const lines=[];
 for(const step of steps){
  if(step.kind==='account'){
   lines.push('Write-Host '+psQuote('Creating '+step.role+' account '+step.accountId));
   lines.push('Near-Account '+psQuote(step.accountId)+' '+psQuote(step.amountNear));
  }else if(step.kind==='deploy'){
   const file='(Join-Path $wasm "'+WASM_FILES[step.wasmKey]+'")';
   lines.push('Write-Host '+psQuote('Deploying '+step.wasmKey+' to '+step.accountId));
   if(step.initMethod){
    lines.push('Near-Deploy '+psQuote(step.accountId)+' '+file+' '+
     psQuote(step.initMethod)+' '+psQuote(JSON.stringify(step.initArgs)));
   }else{
    lines.push('Near-Deploy '+psQuote(step.accountId)+' '+file+' $null $null');
   }
  }else if(step.kind==='call'){
   const contract=step.contractId??a.lending;
   const capture=step.capture?
    ' -Capture '+psQuote(step.capture):'';
   lines.push('Write-Host '+psQuote('Calling '+step.method+' on '+contract));
   lines.push('Near-Call '+psQuote(contract)+' '+psQuote(step.method)+' '+
    psQuote(step.args)+' '+psQuote(step.deposit)+' '+psQuote(step.gas)+' '+
    psQuote(step.signer)+capture);
  }
 }
 return lines.join('\n');
}

function renderPreamblePowerShell(manifest,{confirm,title,expect='unused'}){
 const a=manifest.accountIds;
 return [
  '# '+title,
  '# EXECUTE ONLY ON YOUR OWN WINDOWS COMPUTER. NEAR TESTNET ONLY.',
  '# Uses the LOCAL NEAR CLI keychain. Never paste a private key or seed phrase here.',
  '$ErrorActionPreference = "Stop"',
  '$ProgressPreference = "SilentlyContinue"',
  'if (-not (Get-Command near -ErrorAction SilentlyContinue)) { throw "Install near-cli-rs first: https://near.cli.rs/" }',
  'if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js 22 or newer is required" }',
  '$base = Split-Path -Parent $MyInvocation.MyCommand.Path',
  '$manifest = Join-Path $base "manifest.json"',
  '$wasm = Join-Path $base "wasm"',
  '$log = Join-Path $base "lab.log"',
  'New-Item -ItemType Directory -Force -Path $wasm | Out-Null',
  'Write-Host '+psQuote('Owner account: '+a.root),
  'node (Join-Path $base "preflight.mjs") --manifest $manifest --expect '+psQuote(expect),
  'if ($LASTEXITCODE -ne 0) { throw "Preflight failed" }',
  '$confirm = Read-Host "Type '+confirm+' to authorize Testnet-only transactions"',
  'if ($confirm -cne '+psQuote(confirm)+') { throw "Cancelled without sending transactions" }',
  'function Near-Call($contract,$method,$jsonArgs,$deposit,$gas,$signer,$capture) {',
  '  if ($jsonArgs -like "*__TIMESTAMP_NS__*") {',
  '    $jsonArgs = $jsonArgs.Replace("__TIMESTAMP_NS__", (([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) * 1000000).ToString())',
  '  }',
  '  $output = & near contract call-function as-transaction $contract $method json-args $jsonArgs prepaid-gas $gas attached-deposit $deposit sign-as $signer network-config testnet sign-with-keychain send 2>&1',
  '  $code = $LASTEXITCODE',
  '  $output | Tee-Object -FilePath $log -Append',
  '  if ($code -ne 0) { throw "Transaction failed: $method on $contract" }',
  '  if ($capture) {',
  '    $line = $output | Select-String -Pattern "Transaction ID: " | Select-Object -Last 1',
  '    if ($line) { ($line.ToString() -replace ".*Transaction ID: ","").Trim() | Set-Content -LiteralPath (Join-Path $base "$capture-tx.txt") }',
  '  }',
  '}',
  'function Near-Deploy($account,$wasmFile,$init,$jsonArgs) {',
  '  if ($init) {',
  '    $output = & near contract deploy $account use-file $wasmFile with-init-call $init json-args $jsonArgs prepaid-gas "100 TGas" attached-deposit "0 NEAR" network-config testnet sign-with-keychain send 2>&1',
  '  } else {',
  '    $output = & near contract deploy $account use-file $wasmFile without-init-call network-config testnet sign-with-keychain send 2>&1',
  '  }',
  '  $code = $LASTEXITCODE',
  '  $output | Tee-Object -FilePath $log -Append',
  '  if ($code -ne 0) { throw "Deployment failed: $account" }',
  '}',
  'function Near-Account($account,$amount) {',
  '  $output = & near account create-account fund-myself $account "$amount NEAR" autogenerate-new-keypair save-to-keychain sign-as '+psQuote(a.root)+' network-config testnet sign-with-keychain send 2>&1',
  '  $code = $LASTEXITCODE',
  '  $output | Tee-Object -FilePath $log -Append',
  '  if ($code -ne 0) { throw "Account creation failed: $account" }',
  '}',
  '',
 ].join('\n');
}

function renderWasmDownloadsPowerShell(manifest){
 const w=manifest.wasm;
 return Object.entries(WASM_FILES).map(([key,file])=>
  'Invoke-WebRequest -Uri '+psQuote(w.rawBase+file)+
  ' -OutFile (Join-Path $wasm "'+file+'")').join('\n')+'\n'+
  'if ((Get-FileHash (Join-Path $wasm "burrowland.wasm") -Algorithm SHA256).Hash.ToLowerInvariant() -ne '+
   psQuote(w.lendingWasm)+') { throw "Lending WASM hash mismatch" }\n'+
  'if ((Get-FileHash (Join-Path $wasm "test_oracle.wasm") -Algorithm SHA256).Hash.ToLowerInvariant() -ne '+
   psQuote(w.oracleWasm)+') { throw "Oracle WASM hash mismatch" }\n'+
  'if ((Get-FileHash (Join-Path $wasm "fungible_token.wasm") -Algorithm SHA256).Hash.ToLowerInvariant() -ne '+
   psQuote(w.fungibleTokenWasm)+') { throw "Fungible token WASM hash mismatch" }';
}

export function renderSetupPowerShell(manifest){
 return renderPreamblePowerShell(manifest,{confirm:'DEPLOY-TESTNET',
  title:'Stage199: create the isolated NEAR Testnet lending lab'})+
  '\n'+renderWasmDownloadsPowerShell(manifest)+'\n\n'+
  renderStepsPowerShell(manifest,buildSetupSteps(manifest))+
  '\n\nWrite-Host "Base lab deployed. Next: .\\setup-market.ps1"\n';
}
export function renderMarketPowerShell(manifest){
 return renderPreamblePowerShell(manifest,{confirm:'SETUP-MARKET',
  title:'Stage199: provision test assets, reserves and a borrower position',
  expect:'deployed'})+
  '\n'+renderStepsPowerShell(manifest,buildMarketSteps(manifest))+
  '\n\nWrite-Host "Market setup submitted. Run scripts/testnet-lab/verify.mjs next."\n';
}
export function renderLiquidationPowerShell(manifest){
 return renderPreamblePowerShell(manifest,{confirm:'LIQUIDATE-TESTNET',
  title:'Stage199: trigger one bounded Testnet liquidation',expect:'deployed'})+
  '\n'+renderStepsPowerShell(manifest,buildLiquidationSteps(manifest))+
  '\n\n$tx = Get-Content -LiteralPath (Join-Path $base "liquidation-tx.txt") -ErrorAction SilentlyContinue\n'+
  '$withdraw = Get-Content -LiteralPath (Join-Path $base "withdraw-tx.txt") -ErrorAction SilentlyContinue\n'+
  '$verifyArgs = @("scripts/testnet-lab/verify.mjs","--manifest",$manifest)\n'+
  'if ($tx) { $verifyArgs += @("--tx",$tx) }\n'+
  'if ($withdraw) { $verifyArgs += @("--withdraw-tx",$withdraw) }\n'+
  'node @verifyArgs\n';
}

export const README_TEXT=(manifest)=>`# ARBIVANE isolated NEAR Testnet lab

Owner: \`${manifest.accountIds.root}\`
Network: NEAR Testnet only. Mainnet is never used.

This directory was generated by \`scripts/testnet-lab/plan.mjs\`. It contains public
account IDs, pinned WASM hashes and simulated test prices. It contains no private key.

## Order

1. Review \`manifest.json\` and the generated scripts.
2. Fund the owner account with at least ${manifest.minimumOwnerBalanceTNEAR} TNEAR:
   https://near-faucet.io/ (manual browser flow; verify the on-chain balance).
3. \`./setup-testnet.sh\` (or \`setup-testnet.ps1\` on Windows) and type \`DEPLOY-TESTNET\`.
4. \`./setup-market.sh\` (or \`setup-market.ps1\`) and type \`SETUP-MARKET\`.
5. \`./run-liquidation.sh\` (or \`run-liquidation.ps1\`) and type \`LIQUIDATE-TESTNET\`.
6. Verify read-only: \`node scripts/testnet-lab/verify.mjs --manifest ${'<'}this-dir${'>'}/manifest.json\`.
7. Open the ARBIVANE dashboard in Testnet mode, connect the owner wallet, and
   paste the liquidation and withdraw hashes printed by the scripts into the
   receipt panel. The dashboard re-reads the same evidence read-only.

The oracle shipped by the pinned Burrow commit is a pass-through oracle: it does
not store a price. Test prices are supplied inside each approved transaction and
are labelled simulated. The verifier reads the actual transaction arguments and
receipts; it never invents a price.

All transactions require explicit typed confirmation and the local NEAR CLI
keychain. Never put a seed phrase or private key in this directory or in ARBIVANE.
`;

export async function writePlan(owner,out){
 const manifest=createLabManifest(owner),dir=resolve(out);
 await mkdir(dir,{recursive:true});
 await writeFile(join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
 await writeFile(join(dir,'setup-testnet.sh'),renderSetupBash(manifest),{flag:'wx',mode:0o700});
 await writeFile(join(dir,'setup-market.sh'),renderMarketBash(manifest),{flag:'wx',mode:0o700});
 await writeFile(join(dir,'run-liquidation.sh'),renderLiquidationBash(manifest),{flag:'wx',mode:0o700});
 await writeFile(join(dir,'setup-testnet.ps1'),renderSetupPowerShell(manifest),{flag:'wx'});
 await writeFile(join(dir,'setup-market.ps1'),renderMarketPowerShell(manifest),{flag:'wx'});
 await writeFile(join(dir,'run-liquidation.ps1'),renderLiquidationPowerShell(manifest),{flag:'wx'});
 await writeFile(join(dir,'preflight.mjs'),PREFLIGHT_SOURCE,{flag:'wx'});
 await writeFile(join(dir,'README.md'),README_TEXT(manifest),{flag:'wx'});
 return {dir,manifest};
}

const PREFLIGHT_SOURCE=`#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const i=process.argv.indexOf('--manifest');
const e=process.argv.indexOf('--expect');
if(i<0||!process.argv[i+1]){console.error('Usage: node preflight.mjs --manifest <path> --expect unused|deployed');process.exit(2)}
const expect=e>=0?process.argv[e+1]:'unused';
if(!['unused','deployed'].includes(expect)){console.error('Invalid --expect value');process.exit(2)}
const manifest=JSON.parse(await readFile(resolve(process.argv[i+1]),'utf8'));
const rpc=async(method,params)=>{
 const response=await fetch(manifest.rpc,{method:'POST',
  headers:{'content-type':'application/json'},signal:AbortSignal.timeout(15000),
  body:JSON.stringify({jsonrpc:'2.0',id:'arbivane-preflight',method,params})});
 const json=await response.json();
 if(!response.ok||json.error)throw Error(json.error?.cause?.name??'RPC_ERROR');
 return json.result;
};
const status=await rpc('status',[]);
if(status.chain_id!=='testnet'||status.sync_info?.syncing!==false)
 throw Error('WRONG_CHAIN_OR_RPC_SYNCING');
const owner=await rpc('query',{request_type:'view_account',finality:'final',
 account_id:manifest.accountIds.root});
const balance=BigInt(owner.amount);
const minimum=BigInt(manifest.minimumOwnerBalanceTNEAR)*1000000000000000000000000n;
const near=(balance/1000000000000000000000000n).toString();
console.log('Verified NEAR Testnet owner '+manifest.accountIds.root+' balance: '+near+' TNEAR');
if(balance<minimum){
 console.error('Need at least '+manifest.minimumOwnerBalanceTNEAR+' TNEAR for subaccounts, storage and fees.');
 console.error('Request testnet NEAR manually at https://near-faucet.io/ and wait for finality.');
 process.exit(1);
}
let unused=0,existing=0;
for(const [role,accountId] of Object.entries(manifest.accountIds)){
 if(role==='root')continue;
 try{
  await rpc('query',{request_type:'view_account',finality:'final',account_id:accountId});
  existing++;
  if(expect==='unused'){
   console.error('Account already exists: '+accountId+' ('+role+').');
   console.error('Refusing to overwrite or reuse an existing lab account. Inspect it first.');
   process.exit(1);
  }
 }catch(error){
  if(error.message!=='UNKNOWN_ACCOUNT'&&error.message!=='ACCOUNT_DOES_NOT_EXIST')throw error;
  unused++;
  if(expect==='deployed'){
   console.error('Required lab account is missing: '+accountId+' ('+role+').');
   process.exit(1);
  }
 }
}
console.log('Preflight complete: '+existing+' lab accounts exist, '+unused+' are unused.');
console.log('Proceeding only after typed approval.');
`;

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

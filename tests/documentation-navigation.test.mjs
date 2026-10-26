import test from 'node:test';
import assert from 'node:assert/strict';
import {access,readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const authored=[
 'README.md',
 'docs/INDEX.md','docs/STATUS_AND_EVIDENCE.md','docs/PROTOCOL_AND_ECONOMICS.md',
 'docs/OPERATIONS.md','docs/WALLET_AND_MAINNET.md','docs/STAGE139_FLASH_LIQUIDITY_FINANCING.md','docs/STAGE140_NATIVE_PROVIDER_DISCOVERY.md','docs/ARCHITECTURE.md',
 'docs/SECURITY.md','docs/ROADMAP.md','docs/HACKATHON_CHECKLIST.md',
 'contracts/policy-treasury/README.md',
];
test('Every primary documentation page is readable, current and internally linked',async()=>{
 const files=await Promise.all(authored.map(async path=>({path,text:await readFile(resolve(root,path),'utf8')})));
 for(const {path,text} of files){
  assert.ok(text.length>350,path+' too short or missing');
  assert.match(text,/ARBIVANE|Sandbox|Rhea|NEAR/i,path+' lacks project identity');
  const paths=[...text.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)].map(m=>m[1]);
  for(const dest of paths){
   if(/^(https?:\/\/|mailto:)/.test(dest))continue;
   await assert.doesNotReject(access(resolve(root,dirname(path),decodeURIComponent(dest))),
    path+' has broken link '+dest);
  }
 }
});
test('The canonical README does not revert to historical pre-liquidation wording',async()=>{
 const readme=await readFile(resolve(root,'README.md'),'utf8');
 assert.match(readme,/Stage93/);
 assert.match(readme,/NEAR Sandbox/);
 assert.match(readme,/Borsh/);
 assert.match(readme,/Mainnet signing and spending|mainnet trading is enabled|mainnet trading/i);
 assert.doesNotMatch(readme,/Status: Stage 11 read-only/i);
});
test('Wallet/operator documents never advertise active unbounded mainnet spending',async()=>{
 const wallet=await readFile(resolve(root,'docs/WALLET_AND_MAINNET.md'),'utf8');
 const security=await readFile(resolve(root,'docs/SECURITY.md'),'utf8');
 assert.match(wallet,/seed phrase|recovery phrase/i);
 assert.match(wallet,/wallet\.near\.org/);
 assert.match(wallet,/mayBroadcastMainnet.*false/);
 assert.match(security,/Mainnet execution is not enabled/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {hasFinancialEvidence} from '../dashboard/web/src/workspace.ts';

const state=()=>({
 environment:'sandbox',revision:0,session:null,
 settings:{maxFinancingUsd:'',minimumNetProfitUsd:'0.00'},
 wallet:{status:'not_configured',accountId:null,balances:[],verifiedAt:null},
 accounting:{
  available:null, pending:null, grossProceeds:null,financingFees:null,swapCosts:null,
  gasFees:null,realizedProfit:null,realizedLoss:null,cumulativeNetPnl:null
 },
 transactions:[],opportunities:[]
});
test('Stage182 empty Sandbox/Testnet/Mainnet show no financial sidebar',()=>{
 assert.equal(hasFinancialEvidence(null),false);
 for(const network of ['sandbox','testnet','mainnet']){
  const s=state();s.environment=network;
  assert.equal(hasFinancialEvidence(s),false);
 }
});
test('Stage182 zero is a genuine reported value, unknown is hidden',()=>{
 const s=state();s.accounting.available='0';
 assert.equal(hasFinancialEvidence(s),true);
 s.accounting.available=null;
 s.accounting.gasFees='0.00';
 assert.equal(hasFinancialEvidence(s),true);
 s.accounting.gasFees=null;
 s.wallet.balances=[{tokenId:'wrap.near',atomic:'100'}];
 assert.equal(hasFinancialEvidence(s),true);
});
test('Stage182 mode and view hierarchy never invent balances, PNL or a graph',async()=>{
 const s=await readFile(new URL('../dashboard/web/src/App.tsx',import.meta.url),'utf8');
 assert.ok(s.includes('<EnvironmentContext.Provider'));
 assert.ok(s.includes('<EnvironmentPicker/>'));
 assert.ok(s.includes('const hasAside=hasFinancialEvidence(state)'));
 assert.ok(s.includes("environment==='sandbox'&&<ResearchActivity/>"));
 assert.ok(s.includes("workspace-idle"));
 assert.ok(s.includes('PerformanceWorkspace accounting={data.state.accounting}'));
 assert.ok(s.includes('reconciledAt?'));
 assert.ok(!s.includes('No balance available'));
 assert.ok(!s.includes('samplePnl'));
});

test('Stage183 automation controls use available card width without oversized idle margins',async()=>{
 const app=await readFile(new URL('../dashboard/web/src/App.tsx',import.meta.url),'utf8');
 const css=await readFile(new URL('../dashboard/web/src/styles.css',import.meta.url),'utf8');
 assert.ok(app.includes('className="automation-layout"'));
 assert.ok(app.includes('className="automation-actions"'));
 assert.ok(css.includes('.workspace-idle .workspace-primary { max-width:none; width:100%; }'));
 assert.match(css,/\.workspace \.automation-layout \{[\s\S]*?grid-template-columns:minmax\(0,1\.45fr\) minmax\(265px,\.85fr\)/);
 assert.ok(css.includes('.workspace .automation-layout .money-label,'));
 assert.ok(css.includes('.workspace .automation-actions .controls .primary'));
 assert.ok(css.includes('@media(max-width:970px)'));
 assert.ok(css.includes('grid-template-columns:minmax(0,1fr);'));
});

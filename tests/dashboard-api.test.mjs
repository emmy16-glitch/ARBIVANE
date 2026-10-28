import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp, rm} from 'node:fs/promises';
import net from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';

async function freePort() {
  const server=net.createServer(); await new Promise((resolve)=>server.listen(0,'127.0.0.1',resolve));
  const {port}=server.address(); await new Promise((resolve)=>server.close(resolve)); return port;
}
async function boot(t) {
  const port=await freePort(),data=await mkdtemp(join(tmpdir(),'arbivane-api-'));
  const origin=`http://127.0.0.1:${port}`,token='dashboard-test-token-with-sufficient-length';
  const child=spawn(process.execPath,['dashboard/server/index.mjs'],{cwd:new URL('..',import.meta.url),
    env:{...process.env,PORT:String(port),HOST:'127.0.0.1',ARBIVANE_DASHBOARD_DATA_DIR:data,
      ARBIVANE_DASHBOARD_TOKEN:token,ARBIVANE_DASHBOARD_ORIGIN:origin,NEAR_RPC_URL:''},
    stdio:['ignore','pipe','pipe']});
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('SERVER_START_TIMEOUT')),5000);
    child.stdout.on('data',(chunk)=>{if(String(chunk).includes('dashboard listening')){clearTimeout(timer);resolve()}});
    child.once('exit',(code)=>reject(Error(`SERVER_EXIT_${code}`)));});
  t.after(async()=>{child.kill('SIGTERM');await rm(data,{recursive:true,force:true})});
  return {origin,token};
}

test('dashboard HTTP boundary authenticates, isolates and denies unsupported execution', async (t) => {
  const {origin,token}=await boot(t);
  const health=await fetch(`${origin}/api/health`); assert.equal(health.status,200);
  assert.deepEqual(await health.json(),{status:'ok',mainnetExecutionEnabled:false});
  const denied=await fetch(`${origin}/api/environments/sandbox`); assert.equal(denied.status,401);

  const auth=await fetch(`${origin}/api/auth/session`,{method:'POST',headers:{origin,authorization:`Bearer ${token}`}});
  assert.equal(auth.status,201); const cookie=auth.headers.get('set-cookie').split(';')[0];
  assert.match(auth.headers.get('set-cookie'),/HttpOnly/); assert.match(auth.headers.get('set-cookie'),/SameSite=Strict/);
  const sandbox=await fetch(`${origin}/api/environments/sandbox`,{headers:{cookie}});
  assert.equal(sandbox.status,200); const body=await sandbox.json();
  assert.equal(body.state.environment,'sandbox'); assert.deepEqual(body.state.transactions,[]);
  assert.equal(body.readiness.capabilities.mainnetSpending,false);

  const settings={maxFinancingUsd:'1000.00',minimumNetProfitUsd:'1.00'};
  const missing=await fetch(`${origin}/api/environments/sandbox/start`,{method:'POST',
    headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify({settings})});
  assert.equal(missing.status,400); assert.equal((await missing.json()).error,'SANDBOX_EVIDENCE_NOT_CONFIGURED');
  const mainnet=await fetch(`${origin}/api/environments/mainnet/start`,{method:'POST',
    headers:{cookie,origin,'content-type':'application/json'},body:JSON.stringify({settings})});
  assert.equal(mainnet.status,400); assert.equal((await mainnet.json()).error,'MAINNET_EXECUTION_DISABLED');
  const unchanged=await fetch(`${origin}/api/environments/sandbox`,{headers:{cookie}}).then((value)=>value.json());
  assert.equal(unchanged.state.session,null);
});

test('dashboard rejects cross-origin mutation and serves hardened production shell', async (t) => {
  const {origin,token}=await boot(t);
  const auth=await fetch(`${origin}/api/auth/session`,{method:'POST',headers:{origin,authorization:`Bearer ${token}`}});
  const cookie=auth.headers.get('set-cookie').split(';')[0];
  const rejected=await fetch(`${origin}/api/environments/sandbox/stop`,{method:'POST',
    headers:{cookie,origin:'https://attacker.invalid','content-type':'application/json'},body:'{}'});
  assert.equal(rejected.status,403); assert.equal((await rejected.json()).error,'ORIGIN_REJECTED');
  const page=await fetch(origin); assert.equal(page.status,200);
  assert.match(page.headers.get('content-security-policy'),/default-src 'self'/);
  assert.equal(page.headers.get('x-content-type-options'),'nosniff');
  assert.match(await page.text(),/ARBIVANE — Operations Terminal/);
});

test('Stage174 token is never stored in browser code and signed cookies reject alteration',async(t)=>{
 const {origin,token}=await boot(t);
 const auth=await fetch(`${origin}/api/auth/session`,{method:'POST',headers:{
  origin,authorization:`Bearer ${token}`,'x-forwarded-proto':'https'}});
 assert.equal(auth.status,201);
 assert.match(auth.headers.get('set-cookie'),/; Secure/);
 const cookie=auth.headers.get('set-cookie').split(';')[0];
 const ok=await fetch(`${origin}/api/environments/sandbox`,{headers:{cookie}});
 assert.equal(ok.status,200);
 const modified=cookie.slice(0,-1)+(cookie.endsWith('A')?'B':'A');
 const denied=await fetch(`${origin}/api/environments/sandbox`,{headers:{cookie:modified}});
 assert.equal(denied.status,401);
 const api=await import('node:fs/promises').then(fs=>
  fs.readFile(new URL('../dashboard/web/src/api.ts',import.meta.url),'utf8'));
 assert.ok(!api.includes('sessionStorage'));
 assert.ok(!api.includes('localStorage'));
});

test('Stage176 production rejects missing or weak operator secret even over loopback',async(t)=>{
 for(const secret of ['', 'too-short']){
  const port=await freePort();
  const data=await mkdtemp(join(tmpdir(),'arbivane-production-auth-'));
  const child=spawn(process.execPath,['dashboard/server/index.mjs'],{
   cwd:new URL('..',import.meta.url),
   env:{...process.env,PORT:String(port),HOST:'127.0.0.1',
    NODE_ENV:'production',ARBIVANE_DASHBOARD_DATA_DIR:data,
    ARBIVANE_DASHBOARD_TOKEN:secret},
   stdio:['ignore','pipe','pipe']
  });
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('SERVER_START_TIMEOUT')),5000);
   child.stdout.on('data',chunk=>{
    if(String(chunk).includes('dashboard listening')){clearTimeout(timer);resolve()}
   });
   child.once('exit',code=>reject(Error('SERVER_EXIT_'+code)));
  });
  const origin=`http://127.0.0.1:${port}`;
  const health=await fetch(origin+'/api/health');
  assert.equal(health.status,503);
  assert.equal((await health.json()).status,'auth_not_configured');
  const auth=await fetch(origin+'/api/auth/session',{method:'POST',
   headers:{origin,authorization:'Bearer '+secret}});
  assert.equal(auth.status,503);
  assert.equal(auth.headers.get('set-cookie'),null);
  child.kill('SIGTERM');
  t.after(()=>rm(data,{recursive:true,force:true}));
 }
});

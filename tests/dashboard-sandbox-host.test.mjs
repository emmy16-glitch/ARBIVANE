import test from 'node:test';
import assert from 'node:assert/strict';
import {assessSandboxHost} from '../dashboard/server/sandbox-host.mjs';
import {readFile} from 'node:fs/promises';
const GB=1024**3;
const prod={NODE_ENV:'production',ARBIVANE_DASHBOARD_DATA_DIR:'/var/data/arbivane-dashboard',ARBIVANE_REQUIRED_PERSISTENT_MOUNT:'/var/data'};
test('Stage188 Free ephemeral storage and low memory deny execution',()=>{
 const free=assessSandboxHost({env:{NODE_ENV:'production',RENDER:'true',ARBIVANE_DASHBOARD_DATA_DIR:'/tmp/arbivane-dashboard'},
  platform:'linux',memoryBytes:512*1024*1024,compiler:false,mounts:[]});
 assert.equal(free.persistentStorageReady,false);
 assert.equal(free.memoryReady,false);
 assert.equal(free.nativeToolchainReady,false);
});
test('Stage188 paid host requires a real mounted disk, not a similarly named folder',()=>{
 const good=assessSandboxHost({env:prod,platform:'linux',memoryBytes:4*GB,compiler:true,mounts:['/','/proc','/var/data']});
 assert.equal(good.persistentStorageReady,true);
 assert.equal(good.memoryReady,true);
 assert.equal(good.nativeToolchainReady,true);
 const missing=assessSandboxHost({env:prod,platform:'linux',memoryBytes:4*GB,compiler:true,mounts:['/']});
 assert.equal(missing.persistentStorageReady,false);
 const wrong=assessSandboxHost({env:{...prod,ARBIVANE_DASHBOARD_DATA_DIR:'/var/data-insecure/records'},
  platform:'linux',memoryBytes:4*GB,compiler:true,mounts:['/var/data']});
 assert.equal(wrong.persistentStorageReady,false);
});
test('Stage188 local development is allowed, production requires a mount and sufficient RAM',()=>{
 const local=assessSandboxHost({env:{NODE_ENV:'development'},platform:'linux',
  memoryBytes:4*GB,compiler:true,mounts:[]});
 assert.equal(local.persistentStorageReady,true);
 const ephemeral=assessSandboxHost({env:{RENDER:'true'},platform:'linux',
  memoryBytes:4*GB,compiler:true,mounts:[]});
 assert.equal(ephemeral.persistentStorageReady,false);
 const small=assessSandboxHost({env:prod,platform:'linux',memoryBytes:GB,
  compiler:true,mounts:['/var/data']});
 assert.equal(small.memoryReady,false);
});
test('Stage188 Free Render blueprint remains preview-only; paid example requires owner action',async()=>{
 const free=await readFile(new URL('../render.yaml',import.meta.url),'utf8');
 const paid=await readFile(new URL('../render-autopilot.example.yaml',import.meta.url),'utf8');
 assert.match(free,/plan: free/);
 assert.match(free,/ARBIVANE_SANDBOX_AUTOPILOT_ENABLED\n\s+value: "false"/);
 assert.match(paid,/plan: 2c-4g/);
 assert.match(paid,/mountPath: \/var\/data/);
 assert.match(paid,/ARBIVANE_REQUIRED_PERSISTENT_MOUNT/);
 assert.match(paid,/ARBIVANE_SANDBOX_AUTOPILOT_ENABLED\n\s+value: "false"/);
});

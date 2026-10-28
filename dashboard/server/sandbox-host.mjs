import {access,readFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {sep,resolve,delimiter,join} from 'node:path';
import {totalmem} from 'node:os';

/** A working Node module is not proof that the host can run NEAR Sandbox.
 * Readiness fails closed on low-memory hosts and ephemeral production storage.
 * This never reads secrets or calls chain-changing RPC endpoints.
 */
const TWO_GIB=2*1024*1024*1024;
function bytes(value) {
 if(value===undefined||value===null)return null;
 const raw=String(value).trim();
 if(!/^[1-9][0-9]{0,19}$/.test(raw))return null;
 const n=BigInt(raw);
 return n>BigInt(Number.MAX_SAFE_INTEGER)?null:Number(n);
}
async function cgroupMemory(read=readFile) {
 for(const path of ['/sys/fs/cgroup/memory.max','/sys/fs/cgroup/memory/memory.limit_in_bytes']){
  try{
   const n=bytes(await read(path,'utf8'));
   if(n!==null)return n;
  }catch{}
 }
 return null;
}
async function mountPoints(read=readFile){
 try{
  const info=await read('/proc/self/mountinfo','utf8');
  return info.split('\n').filter(Boolean).map(line=>line.split(' ')[4])
   .filter(Boolean).map(path=>path.replace(/\\040/g,' ').replace(/\\011/g,'\t'));
 }catch{return []}
}
async function compilerAvailable(pathEnv=process.env.PATH) {
 for(const dir of (pathEnv??'').split(delimiter).filter(Boolean)){
  try{await access(join(dir,'cc'),constants.X_OK);return true}catch{}
 }
 return false;
}
export function assessSandboxHost({env,platform,memoryBytes,compiler,mounts}){
 const production=env.NODE_ENV==='production'||env.RENDER==='true';
 const configuredMount=env.ARBIVANE_REQUIRED_PERSISTENT_MOUNT??'';
 const dataDir=resolve(env.ARBIVANE_DASHBOARD_DATA_DIR??'.arbivane-dashboard');
 const disk=configuredMount?resolve(configuredMount):null;
 // The data directory must actually live under an independent mount, not
 // merely a directory named /var/data on the ephemeral container filesystem.
 const mounted=Boolean(disk&&mounts.includes(disk)&&
  (dataDir===disk||dataDir.startsWith(disk+sep)));
 const persistentStorageReady=!production&&!configuredMount?true:mounted;
 const memoryReady=Number.isSafeInteger(memoryBytes)&&memoryBytes>=TWO_GIB;
 const nativeToolchainReady=Boolean(compiler&&platform==='linux');
 return {persistentStorageReady,memoryReady,nativeToolchainReady,
  storageRequirement:production?'separate persistent volume required':'local development only',
  minimumRecommendedMemoryGiB:2,workspaceDirUnderPersistentMount:mounted};
}
export async function sandboxHostReadiness({env=process.env,read=readFile,
 platform=process.platform,systemMemory=totalmem()}={}){
 const [limit,mounts,compiler]=await Promise.all([
  cgroupMemory(read),mountPoints(read),compilerAvailable(env.PATH)]);
 return assessSandboxHost({env,platform,memoryBytes:Math.min(systemMemory,limit??systemMemory),
  compiler,mounts});
}


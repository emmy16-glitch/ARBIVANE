import {access, mkdtemp, readFile, writeFile, rm, copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

// A historical replay must use the source chain's time, not the CI runner's
// wall clock. Only the disposable near-sandbox process receives libfaketime.
// Its clock advances at normal speed; prices and freshness rules are untouched.
export function sourceClock(header, blockHeight) {
 if(header?.height!==blockHeight||!Number.isSafeInteger(blockHeight)||blockHeight<1||
  !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(header?.hash??'')||
  typeof header?.timestamp_nanosec!=='string'||
  !/^[1-9][0-9]{18}$/.test(header.timestamp_nanosec))
  throw Error('STAGE115_INVALID_PINNED_SOURCE_CLOCK');
 const ns=BigInt(header.timestamp_nanosec);
 // Round UP to a whole second, never replay before the source snapshot.
 const startMs=Number((ns+999999999n)/1000000000n)*1000;
 return {sourceBlockHeight:blockHeight,sourceBlockHash:header.hash,
  sourceTimestampNanosec:ns.toString(),startMs,
  startIso:new Date(startMs).toISOString()};
}
export async function readSourceClock(endpoint, blockHeight, fetcher=fetch) {
 if(new URL(endpoint).protocol!=='https:')throw Error('STAGE115_SOURCE_HTTPS_REQUIRED');
 const response=await fetcher(endpoint,{method:'POST',headers:{'content-type':'application/json'},
  body:JSON.stringify({jsonrpc:'2.0',id:'stage115-clock',method:'block',params:{block_id:blockHeight}}),
  signal:AbortSignal.timeout(18000)});
 if(!response.ok)throw Error('STAGE115_SOURCE_CLOCK_HTTP_FAILED');
 const body=await response.json();
 return sourceClock(body?.result?.header,blockHeight);
}
export function attestReplayClock(clock, header) {
 const stamp=header?.timestamp_nanosec;
 if(typeof stamp!=='string'||!/^[1-9][0-9]{18}$/.test(stamp)||
  BigInt(stamp)<BigInt(clock.sourceTimestampNanosec)||
  BigInt(stamp)>BigInt(clock.sourceTimestampNanosec)+180000000000n)
  throw Error('STAGE115_SANDBOX_CLOCK_OUTSIDE_HISTORICAL_WINDOW');
 return {...clock,sandboxTimestampNanosec:stamp,clockRate:1,
  freshnessLimitsModified:false,storedPricesModified:false,mainnetExecutionEnabled:false};
}
const shell=value=>"'"+value.replaceAll("'","'\\''")+"'";
export async function initHistoricalSandbox(pkg, clock, env=process.env) {
 if(env.NEAR_WORKSPACES_NETWORK!=='sandbox'||env.EXECUTION_ENABLED!=='false'||
  env.STAGE37_ALLOW_SANDBOX_MUTATION!=='true')throw Error('STAGE115_SANDBOX_ONLY');
 const library=env.STAGE115_FAKETIME_LIBRARY||'/usr/lib/x86_64-linux-gnu/faketime/libfaketime.so.1';
 await access(library);
 const dir=await mkdtemp(join(tmpdir(),'arbivane-clock-'));
 const Server=pkg.SandboxServer, originalInit=Server.init;
 let worker,serverRef,timer,expired=false;
 try {
  Server.init=async function(config) {
   const server=await originalInit.call(this,config);
   serverRef=server;
   const genesisPath=join(server.homeDir,'genesis.json');
   const genesis=JSON.parse(await readFile(genesisPath,'utf8'));
   genesis.genesis_time=clock.startIso;
   await writeFile(genesisPath,JSON.stringify(genesis));
   const binary=Server.binPath, wrapper=join(dir,'near-sandbox');
   await writeFile(wrapper,'#!/bin/sh\nexec env TZ=UTC LD_PRELOAD='+shell(library)+
    ' FAKETIME_DONT_FAKE_MONOTONIC=1 FAKETIME='+shell('@'+clock.startIso.slice(0,19).replace('T',' '))+
    ' '+shell(binary)+' "$@"\n',{mode:0o700});
   const start=server.start;
   server.start=async function() {
    Server.binPath=wrapper;
    const debug=process.env.NEAR_WORKSPACES_DEBUG;
    process.env.NEAR_WORKSPACES_DEBUG='1';
    try{return await start.call(this);}finally{
     Server.binPath=binary;
     if(debug===undefined)delete process.env.NEAR_WORKSPACES_DEBUG;
     else process.env.NEAR_WORKSPACES_DEBUG=debug;
    }
   };
   return server;
  };
  const pending=pkg.Worker.init({network:'sandbox'});
  // The SDK can retain its port-lock heartbeat after an initialization error.
  // Bound startup and close any native server, including a late successful init.
  pending.then(w=>{if(expired)return w.tearDown().catch(()=>{});},()=>{});
  worker=await Promise.race([pending,new Promise((resolve,reject)=>{
   timer=setTimeout(()=>{expired=true;reject(Error('STAGE117_SANDBOX_STARTUP_TIMEOUT'));},90000);
  })]);
  const witness=attestReplayClock(clock,(await worker.provider.block({finality:'final'})).header);
  return {worker,witness};
 } catch(error) {
  if(worker)await worker.tearDown().catch(()=>{});
  else if(serverRef)await serverRef.close().catch(()=>{});
  throw error;
 } finally {
  clearTimeout(timer);
  if(serverRef)await copyFile(join(serverRef.homeDir,'sandboxServer.log'),
   'stage115-native-startup.log').catch(()=>{});
  Server.init=originalInit;
  await rm(dir,{recursive:true,force:true});
 }
}

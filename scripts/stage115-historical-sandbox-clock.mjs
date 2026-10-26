import {access, mkdtemp, readFile, writeFile, rm, copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

// A historical replay must use the source chain's time, not the CI runner's
// wall clock. Only the disposable near-sandbox process receives the adapter.
// Reconstruction uses 1/100 speed, then execution resumes normal speed without
// rewinding. No quote, freshness rule or copied contract state is changed.
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
 const dir=await mkdtemp(join(tmpdir(),'arbivane-clock-'));
 const phaseFile=join(dir,'phase');
 await writeFile(phaseFile,'0');
 const library=env.STAGE118_CLOCK_LIBRARY||join(dir,'replay-clock.so');
 if(!env.STAGE118_CLOCK_LIBRARY){
  try{await promisify(execFile)('cc',['-std=c11','-O2','-shared','-fPIC',
   fileURLToPath(new URL('./stage118-replay-clock.c',import.meta.url)),'-o',library],{timeout:15000});}
  catch{await rm(dir,{recursive:true,force:true});throw Error('STAGE118_CLOCK_ADAPTER_BUILD_FAILED');}
 }
 await access(library);
 const Server=pkg.SandboxServer, originalInit=Server.init;
 let worker,serverRef,timer,expired=false,ready=false;
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
    ' ARBIVANE_REPLAY_START_NS='+shell((BigInt(clock.startMs)*1000000n).toString())+
    ' ARBIVANE_REPLAY_PHASE_FILE='+shell(phaseFile)+
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
  const witness={...attestReplayClock(clock,(await worker.provider.block({finality:'final'})).header),
   clockRate:0.01,clockPhase:'AUTHENTIC_STATE_RECONSTRUCTION',reconstructionClockRate:0.01};
  const tearDown=worker.tearDown.bind(worker);
  worker.tearDown=async()=>{try{return await tearDown();}finally{await rm(dir,{recursive:true,force:true});}};
  ready=true;
  return {worker,witness,startReplayClock:async({localPartnerTimeCompression=false,ultraShortLocalFinancingWindow=false}={})=>{
   if(localPartnerTimeCompression && (
     env.STAGE146_ALLOW_LOCAL_NEAR_LOAN!=='true'||
     env.STAGE147_LOCAL_CLOCK_COMPRESSION!=='true'||
     env.NEAR_WORKSPACES_NETWORK!=='sandbox'||
     env.EXECUTION_ENABLED!=='false'))
    throw Error('STAGE147_REALTIME_OR_MAINNET_TIME_COMPRESSION_FORBIDDEN');
   if(ultraShortLocalFinancingWindow && (
     !localPartnerTimeCompression||
     env.STAGE152_ULTRA_SHORT_LOCAL_CLOCK!=='true'||
     env.STAGE150_LARGE_SANDBOX!=='true'||
     env.STAGE150_LARGE_SANDBOX_TOKENS!=='100'||
     env.STAGE146_ALLOW_LOCAL_NEAR_LOAN!=='true'||
     env.NEAR_WORKSPACES_NETWORK!=='sandbox'||
     env.EXECUTION_ENABLED!=='false'||
     env.NEAR_PRIVATE_KEY||env.MAINNET_PRIVATE_KEY||env.NEAR_ACCOUNT_ID))
    throw Error('STAGE152_ARTIFICIAL_LOCAL_CLOCK_NOT_AUTHORIZED');
   // Stage152 specifically investigates whether the previously measured
   // negative 100-token interest margin disappears under IMPOSSIBLY favorable
   // elapsed time. It is a mechanics-only sensitivity experiment, NOT an
   // economic fix, market viability proof or realistic execution benchmark.
   // A deliberate and bounded historical-Sandbox ONLY test. Without this
   // explicit opt-in Stage93 keeps its old 1x/normal-time replay semantics.
   // Real Pyth quote bytes and freshness contract configuration are unchanged.
   await writeFile(phaseFile,ultraShortLocalFinancingWindow?'3':
    (localPartnerTimeCompression?'2':'1'));
   return {...attestReplayClock(clock,(await worker.provider.block({finality:'final'})).header),
    clockPhase:ultraShortLocalFinancingWindow?
     'STAGE152_ARTIFICIAL_ULTRASHORT_SANDBOX_FINANCING':
     (localPartnerTimeCompression?
      'STAGE147_HISTORICAL_LOCAL_MULTITX_COMPRESSED_TIME':'HISTORICAL_EXECUTION'),
    reconstructionClockRate:0.01,
    clockRate:ultraShortLocalFinancingWindow?0.001:
     (localPartnerTimeCompression?0.05:1),
    localTimeCompressionEnabled:localPartnerTimeCompression,
    nominalTimeCompressionRatio:ultraShortLocalFinancingWindow?1000:
     (localPartnerTimeCompression?20:1),
    stage152AssumesNonRealizableNearZeroFinancingTime:ultraShortLocalFinancingWindow,
    syntheticTimeMayUnderstateBorrowInterest:ultraShortLocalFinancingWindow,
    originalStage151HundredTokenEconomicFailureRetained:ultraShortLocalFinancingWindow,
    realisticEconomicsAndMainnetViabilityVerified:false,
    oracleQuoteAndFreshnessRulesUnmodified:true,
    timingPerformanceOnRealMainnetNotProven:localPartnerTimeCompression,
    fullLenderRepaymentNotYetProven:true};
  }};
 } catch(error) {
  if(worker)await worker.tearDown().catch(()=>{});
  else if(serverRef)await serverRef.close().catch(()=>{});
  throw error;
 } finally {
  clearTimeout(timer);
  if(serverRef)await copyFile(join(serverRef.homeDir,'sandboxServer.log'),
   'stage115-native-startup.log').catch(()=>{});
  Server.init=originalInit;
  if(!ready)await rm(dir,{recursive:true,force:true});
 }
}

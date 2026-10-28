import {spawn} from 'node:child_process';
import {resolve,join,sep} from 'node:path';
import {mkdir,readFile,writeFile,rename,readlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {createInterface} from 'node:readline';
import {reconcileImportedSandboxEvidence} from './evidence.mjs';
import {environmentReadiness} from './readiness.mjs';

const MONEY = /^(?:0|[1-9]\d{0,8})(?:\.\d{1,2})?$/;

export function validateSettings(value) {
  if (!value || !MONEY.test(String(value.maxFinancingUsd)) || Number(value.maxFinancingUsd) <= 0)
    throw new Error('INVALID_MAX_FINANCING');
  if (!MONEY.test(String(value.minimumNetProfitUsd)) || Number(value.minimumNetProfitUsd) < 0)
    throw new Error('INVALID_MINIMUM_PROFIT');
  return {maxFinancingUsd: Number(value.maxFinancingUsd).toFixed(2),
    minimumNetProfitUsd: Number(value.minimumNetProfitUsd).toFixed(2)};
}

export class AutomationManager {
  constructor({store, repoRoot, publish}) {
    this.store = store; this.repoRoot = repoRoot; this.publish = publish;
    this.startingEnvironments = new Set();
  }

  async start(environment, rawSettings) {
    // An atomic in-process start guard closes the race between concurrent
    // HTTP requests reading idle state and both spawning Sandbox children.
    if (this.startingEnvironments.has(environment)) throw new Error('SESSION_ALREADY_ACTIVE');
    this.startingEnvironments.add(environment);
    try {
    const settings = validateSettings(rawSettings);
    const current = await this.store.state(environment);
    if (current.session && ['starting', 'running', 'pause_requested', 'stopping'].includes(current.session.status))
      throw new Error('SESSION_ALREADY_ACTIVE');
    if (await this.#orphanWorkerRunning(current.session))
      throw new Error('ORPHANED_SANDBOX_WORKER_STILL_RUNNING');
    if (environment !== 'sandbox')
      throw new Error(environment === 'mainnet' ? 'MAINNET_EXECUTION_DISABLED' : 'TESTNET_EXECUTION_NOT_CONFIGURED');

    // UI availability is advisory; the authenticated API is authoritative.
    // Refuse to claim an execution session until every actual prerequisite
    // is present, regardless of stale browser state or direct API calls.
    const readiness = await environmentReadiness('sandbox');
    if (!readiness.capabilities.automate) throw new Error('SANDBOX_RUNTIME_NOT_READY');

    const session = this.store.newSession(environment, settings);
    const workDir=resolve(this.store.root,environment,'sessions',session.id);
    const controlPath=join(workDir,'control.json');
    await mkdir(workDir,{recursive:true,mode:0o700});
    await writeFile(controlPath,'{"pause":false,"stop":false}\n',{mode:0o600});
    session.workDir=workDir; session.controlPath=controlPath;
    await this.store.update(environment,(state)=>({...state,settings,session}));
    await this.#emit(environment,{stage:'system',status:'starting',
      message:'Sandbox discovery and liquidation worker accepted.',
      evidence:{sessionId:session.id}});
    const runner=resolve(this.repoRoot,'scripts/stage187-sandbox-autopilot.mjs');
    const child=spawn(process.execPath,['--experimental-strip-types',runner],{
      cwd:workDir,stdio:['ignore','pipe','pipe'],
      env:{...process.env,EXECUTION_ENABLED:'false',NEAR_NETWORK:'mainnet',
        NEAR_WORKSPACES_NETWORK:'sandbox',ARBIVANE_AUTOPILOT_CONTROL_PATH:controlPath,
        ARBIVANE_MAX_FINANCING_USD:settings.maxFinancingUsd,
        ARBIVANE_MINIMUM_NET_PROFIT_USD:settings.minimumNetProfitUsd,
        NEAR_PRIVATE_KEY:'',MAINNET_PRIVATE_KEY:'',NEAR_ACCOUNT_ID:''},
    });
    await this.store.update(environment,(state)=>{
      state.session.status='running';state.session.startedAt=new Date().toISOString();
      state.session.pid=child.pid??null;return state;
    });
    await this.#emit(environment,{stage:'execution',status:'running',
      message:'Authentic NEAR read-only discovery started. Isolated Workspaces transactions only for verified candidates.'});
    this.#stream(environment,child.stdout,'operation','info');
    this.#stream(environment,child.stderr,'diagnostic','warning');
    let ended=false;
    child.once('exit',(code,signal)=>{
      if(!ended){ended=true;void this.#finish(environment,code,signal).catch(()=>{});}
    });
    child.once('error',(error)=>{
      if(!ended){ended=true;void this.#fail(environment,error).catch(()=>{});}
    });
    return (await this.store.state(environment)).session;
    } finally { this.startingEnvironments.delete(environment); }
  }

  async pause(environment) {
    const state = await this.store.state(environment);
    if (!state.session || !['starting', 'running'].includes(state.session.status)) throw new Error('NO_RUNNING_SESSION');
    const next = await this.store.update(environment, (value) => { value.session.pauseRequested = true;
      value.session.status = 'pause_requested'; return value; });
    await this.#control(next.session,{pause:true});
    await this.#emit(environment, {stage: 'control', status: 'pending',
      message: 'Pause requested. In-flight Sandbox settlement will finish; no follow-up run will start.'});
    return next.session;
  }

  async resume(environment) {
    const state = await this.store.state(environment);
    if (!state.session || state.session.status !== 'paused') throw new Error('SESSION_NOT_PAUSED');
    return this.start(environment, state.settings);
  }

  async stop(environment) {
    const state = await this.store.state(environment);
    if (!state.session || !['starting', 'running', 'pause_requested'].includes(state.session.status))
      throw new Error('NO_ACTIVE_SESSION');
    const next = await this.store.update(environment, (value) => { value.session.stopRequested = true;
      value.session.status = 'stopping'; return value; });
    await this.#control(next.session,{stop:true});
    await this.#emit(environment, {stage: 'control', status: 'pending',
      message: 'Stop requested. No new work will begin; in-flight Sandbox settlement may reconcile.'});
    return next.session;
  }

  #stream(environment, stream, stage, status) {
    createInterface({input: stream}).on('line', (line) => {
      const safe = line.replace(/(?:ed25519:)?[A-Za-z0-9+/]{80,}={0,2}/g, '[redacted]').slice(0, 2000);
      if (line.startsWith('@arbivane:')) {
        try{
          const event=JSON.parse(line.slice(10));
          if(!['scan','screen','execution','system'].includes(event.stage)||
             !['info','warning','failure','success','running'].includes(event.status)||
             typeof event.message!=='string'||event.message.length>300)throw Error('INVALID_WORKER_EVENT');
          void this.#emit(environment,{stage:event.stage,status:event.status,
            message:event.message,evidence:event.evidence}).catch(()=>{});
          return;
        }catch{}
      }
      void this.#emit(environment,{stage,status,message:safe}).catch(()=>{});
    });
  }

  async #orphanWorkerRunning(session){
    if(session?.failure?.code!=='SERVER_RESTART_INTERRUPTED_SESSION')return false;
    const pid=session.interruptedPid;
    if(!Number.isSafeInteger(pid)||pid<=0)return false;
    try{
      const [cmd,cwd]=await Promise.all([
        readFile('/proc/'+pid+'/cmdline','utf8'),readlink('/proc/'+pid+'/cwd')]);
      return cmd.includes('stage187-sandbox-autopilot.mjs')&&
        cwd===session.workDir;
    }catch{return false}
  }

  async recoverInterruptedSandbox(){
    const state=await this.store.state('sandbox');
    const session=state.session;
    if(session?.failure?.code!=='SERVER_RESTART_INTERRUPTED_SESSION'||
      session.recoveryCheckedAt)return;
    // Never race an orphan still finishing local callbacks.
    if(await this.#orphanWorkerRunning(session))return;
    let imported=0,errors=0;
    try{
      const root=resolve(this.store.root,'sandbox','sessions')+sep;
      if(typeof session.workDir!=='string'||!session.workDir.startsWith(root))
        throw Error('RECOVERY_SESSION_PATH_INVALID');
      const manifest=JSON.parse(await readFile(join(session.workDir,'stage187-results.json'),'utf8'));
      if(manifest.mode!=='STAGE187_SANDBOX_AUTOPILOT'||
        manifest.mainnetExecutionEnabled!==false||!Array.isArray(manifest.attempts)||
        manifest.attempts.length>20)throw Error('RECOVERY_MANIFEST_INVALID');
      for(let i=0;i<manifest.attempts.length;i++){
        const attempt=manifest.attempts[i];
        if(attempt.exitCode!==0)continue;
        const dir=join(session.workDir,'attempt-'+String(i+1).padStart(5,'0'));
        if(attempt.directory!==dir||attempt.source!==join(dir,'source-evidence.json')){
          errors++;continue;
        }
        try{
          await reconcileImportedSandboxEvidence(this.store,dir,attempt.source);
          imported++;
        }catch{errors++}
      }
    }catch{errors++}
    await this.store.update('sandbox',value=>{
      if(value.session?.id===session.id){
        value.session.recoveryCheckedAt=new Date().toISOString();
        value.session.recovery={verifiedReceiptBundles:imported,unverifiedOrMissing:errors,
          sessionStillFailed:true,realizedPnlVerified:false};
      }
      return value;
    });
    await this.#emit('sandbox',{stage:'recovery',status:errors?'warning':'info',
      message:'Interrupted Sandbox session checked for independently verified final receipts; it was not restarted.',
      evidence:{verifiedReceiptBundles:imported,unverifiedOrMissing:errors,
        sessionStillFailed:true,realizedPnlVerified:false}});
  }

  async #finish(environment,code,signal){
    const current=await this.store.state(environment);
    const directory=current.session?.workDir;
    let manifest=null,imported=0,errors=[];
    try{
      if(!directory||!directory.startsWith(resolve(this.store.root,environment,'sessions')+sep))
        throw Error('AUTOPILOT_SESSION_DIRECTORY_INVALID');
      manifest=JSON.parse(await readFile(join(directory,'stage187-results.json'),'utf8'));
      if(manifest.mode!=='STAGE187_SANDBOX_AUTOPILOT'||!Array.isArray(manifest.attempts)||
        manifest.attempts.length>20||manifest.mainnetExecutionEnabled!==false)
        throw Error('AUTOPILOT_MANIFEST_UNTRUSTED');
      for(const row of manifest.attempts){
        if(row.exitCode!==0)continue;
        if(typeof row.directory!=='string'||row.directory!==join(directory,'attempt-'+
          String(manifest.attempts.indexOf(row)+1).padStart(5,'0'))||
          row.source!==join(row.directory,'source-evidence.json'))
          throw Error('AUTOPILOT_EVIDENCE_DIRECTORY_INVALID');
        try{
          const result=await reconcileImportedSandboxEvidence(this.store,row.directory,row.source);
          imported++;
          await this.#emit(environment,{stage:'settlement',status:'success',
            message:'Original Sandbox FINAL receipts and inventory independently reconciled.',
            evidence:{transactionId:result.record.id,monetaryPnlVerified:false}});
        }catch(error){
          errors.push(String(error?.message??'EVIDENCE_IMPORT_FAILED').slice(0,100));
          await this.#emit(environment,{stage:'settlement',status:'failure',
            message:'Sandbox receipt admission rejected. No transaction credited.'});
        }
      }
    }catch(error){errors.push(String(error?.message??'AUTOPILOT_RESULTS_UNAVAILABLE').slice(0,100))}
    const valid=code===0&&errors.length===0&&!!manifest;
    const requestedStop=current.session?.stopRequested;
    const requestedPause=current.session?.pauseRequested;
    const status=!valid?'failed':requestedStop?'stopped':requestedPause?'paused':
      manifest.outcome==='attempt_limit'?(imported>0?'completed':'failed'):
      manifest.outcome==='stop'?'stopped':manifest.outcome==='pause'?'paused':'failed';
    await this.store.update(environment,state=>{
      state.session.status=status;state.session.endedAt=new Date().toISOString();
      state.session.pid=null;state.session.failure=status==='failed'?
        {code,signal,errors,reason:manifest?.outcome??'NO_MANIFEST'}:null;
      return state;
    });
    await this.#emit(environment,{stage:'system',
      status:status==='failed'?'failure':'success',
      message:status==='failed'?'Sandbox automation stopped without verified completion.':
        'Sandbox automation session ended.',
      evidence:{sessionStatus:status,verifiedSettlements:imported,
        attempted:manifest?.attempts?.length??0,observedAccounts:manifest?.scanned??0,
        realizedPnlVerified:false,mainnetExecutionEnabled:false,errors}});
  }

  async #control(session,patch){
    if(!session?.controlPath)throw Error('AUTOPILOT_CONTROL_UNAVAILABLE');
    const control=await readFile(session.controlPath,'utf8').then(JSON.parse);
    const target=session.controlPath+'.'+randomUUID()+'.tmp';
    await writeFile(target,JSON.stringify({...control,...patch})+'\n',{mode:0o600});
    await rename(target,session.controlPath);
  }

  async #fail(environment, error) {
    await this.store.update(environment, (state) => { if (state.session) { state.session.status = 'failed';
      state.session.failure = {message: error.message}; } return state; });
    await this.#emit(environment, {stage: 'system', status: 'failure', message: error.message});
  }

  async #emit(environment, event) {
    const saved = await this.store.event(environment, event); this.publish(saved); return saved;
  }
}

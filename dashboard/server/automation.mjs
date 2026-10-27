import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {createInterface} from 'node:readline';
import {reconcileImportedSandboxEvidence} from './evidence.mjs';

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
  }

  async start(environment, rawSettings) {
    const settings = validateSettings(rawSettings);
    const current = await this.store.state(environment);
    if (current.session && ['starting', 'running', 'pause_requested', 'stopping'].includes(current.session.status))
      throw new Error('SESSION_ALREADY_ACTIVE');
    if (environment !== 'sandbox')
      throw new Error(environment === 'mainnet' ? 'MAINNET_EXECUTION_DISABLED' : 'TESTNET_EXECUTION_NOT_CONFIGURED');
    const evidence = process.env.ARBIVANE_SANDBOX_EVIDENCE_PATH;
    if (!evidence) throw new Error('SANDBOX_EVIDENCE_NOT_CONFIGURED');

    const session = this.store.newSession(environment, settings);
    await this.store.update(environment, (state) => ({...state, settings, session}));
    await this.#emit(environment, {stage: 'system', status: 'starting',
      message: 'Sandbox automation session accepted.', evidence: {sessionId: session.id}});
    const runner = resolve(this.repoRoot, 'scripts/stage37-workspaces-sandbox-replay.mjs');
    const child = spawn(process.execPath, ['--experimental-strip-types', runner], {
      cwd: resolve(this.store.root, environment), stdio: ['ignore', 'pipe', 'pipe'],
      env: {...process.env, EXECUTION_ENABLED: 'false', NEAR_NETWORK: 'mainnet',
        NEAR_WORKSPACES_NETWORK: 'sandbox', STAGE37_ALLOW_SANDBOX_MUTATION: 'true',
        STAGE49_ALLOW_SANDBOX_WRAP_NEAR_FUNDING: 'true', STAGE37_STAGE35_EVIDENCE_PATH: resolve(evidence),
        ARBIVANE_MAX_FINANCING_USD: settings.maxFinancingUsd,
        NEAR_PRIVATE_KEY: '', MAINNET_PRIVATE_KEY: '', NEAR_ACCOUNT_ID: ''},
    });
    await this.store.update(environment, (state) => { state.session.status = 'running';
      state.session.startedAt = new Date().toISOString(); state.session.pid = child.pid; return state; });
    await this.#emit(environment, {stage: 'execution', status: 'running',
      message: 'Genuine NEAR Workspaces Sandbox runner started.',
      evidence: {pid: child.pid, runner: 'stage37-workspaces-sandbox-replay.mjs'}});
    this.#stream(environment, child.stdout, 'operation', 'info');
    this.#stream(environment, child.stderr, 'diagnostic', 'warning');
    child.once('exit', (code, signal) => void this.#finish(environment, code, signal));
    child.once('error', (error) => void this.#fail(environment, error));
    return (await this.store.state(environment)).session;
  }

  async pause(environment) {
    const state = await this.store.state(environment);
    if (!state.session || !['starting', 'running'].includes(state.session.status)) throw new Error('NO_RUNNING_SESSION');
    const next = await this.store.update(environment, (value) => { value.session.pauseRequested = true;
      value.session.status = 'pause_requested'; return value; });
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
    await this.#emit(environment, {stage: 'control', status: 'pending',
      message: 'Stop requested. No new work will begin; in-flight Sandbox settlement may reconcile.'});
    return next.session;
  }

  #stream(environment, stream, stage, status) {
    createInterface({input: stream}).on('line', (line) => {
      const safe = line.replace(/(?:ed25519:)?[A-Za-z0-9+/]{80,}={0,2}/g, '[redacted]').slice(0, 2000);
      void this.#emit(environment, {stage, status, message: safe});
    });
  }

  async #finish(environment, code, signal) {
    let evidenceFailure = null;
    let imported = null;
    if (code === 0 && environment === 'sandbox') {
      try { imported = await reconcileImportedSandboxEvidence(this.store,
        resolve(this.store.root, environment), resolve(process.env.ARBIVANE_SANDBOX_EVIDENCE_PATH)); }
      catch (error) { const code = error instanceof Error ? error.message : '';
        evidenceFailure = /^DASHBOARD_[A-Z0-9_]{1,120}$/.test(code) ? code : 'DASHBOARD_EVIDENCE_IMPORT_FAILED'; }
    }
    await this.store.update(environment, (state) => {
      const paused = state.session?.pauseRequested && code === 0 && !evidenceFailure;
      const stopped = state.session?.stopRequested && code === 0 && !evidenceFailure;
      state.session.status = stopped ? 'stopped' : paused ? 'paused' : code === 0 && !evidenceFailure ? 'completed' : 'failed';
      state.session.endedAt = new Date().toISOString(); state.session.pid = null;
      state.session.failure = code === 0 && !evidenceFailure ? null : {code, signal, evidenceFailure}; return state;
    });
    await this.#emit(environment, {stage: imported ? 'settlement' : 'system',
      status: code === 0 && !evidenceFailure ? 'success' : 'failure',
      message: imported ? 'Sandbox receipts and balance deltas independently reconciled; unsold token inventory recorded.'
        : evidenceFailure ? `Sandbox process completed but evidence admission failed: ${evidenceFailure}.`
        : `Sandbox workflow exited with code ${code ?? 'unknown'}.`,
      evidence: imported ? {transactionId:imported.record.id, evidenceDigestSha256:imported.record.evidenceDigestSha256,
        monetaryPnlVerified:false} : {exitCode: code, signal, evidenceFailure}});
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

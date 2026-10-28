import {appendFile, mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';

export const ENVIRONMENTS = Object.freeze(['sandbox', 'testnet', 'mainnet']);

const initialState = (environment) => ({
  environment,
  revision: 0,
  session: null,
  settings: {maxFinancingUsd: '1000.00', minimumNetProfitUsd: '0.00'},
  accounting: {
    currency: 'USD', available: null, pending: null, grossProceeds: null,
    financingFees: null, gasFees: null, swapCosts: null, realizedProfit: null,
    realizedLoss: null, cumulativeNetPnl: null, reconciledAt: null, evidence: null,
  },
  wallet: {status: 'not_configured', accountId: null, balances: [], verifiedAt: null},
  transactions: [], opportunities: [], nextEventSequence: 1,
});

export class DashboardStore {
  constructor(root) { this.root = root; this.queues = new Map(); }

  async init() {
    await mkdir(this.root, {recursive: true, mode: 0o700});
    for (const environment of ENVIRONMENTS) {
      await mkdir(join(this.root, environment), {recursive: true, mode: 0o700});
      try { await readFile(join(this.root, environment, 'state.json')); }
      catch { await this.#writeState(environment, initialState(environment)); }
    }
  }

  async state(environment) {
    this.#assertEnvironment(environment);
    return JSON.parse(await readFile(join(this.root, environment, 'state.json'), 'utf8'));
  }

  #queue(environment, action) {
    this.#assertEnvironment(environment);
    const previous = this.queues.get(environment) ?? Promise.resolve();
    const next = previous.then(action);
    this.queues.set(environment, next.catch(() => {}));
    return next;
  }

  async update(environment, change) {
    return this.#queue(environment, async () => {
      const state = await this.state(environment);
      const updated = await change(structuredClone(state));
      updated.revision = state.revision + 1;
      await this.#writeState(environment, updated);
      return updated;
    });
  }

  async event(environment, event) {
    // Serialize the state change AND append in the same environment queue.
    // Concurrent Sandbox logs must never be stored or streamed out of order.
    return this.#queue(environment, async () => {
      const state = await this.state(environment);
      const sequence = state.nextEventSequence++;
      const committed = {id: `${environment}:${sequence}`, sequence, environment,
        timestamp: new Date().toISOString(), sessionId: state.session?.id ?? null,
        stage: event.stage, status: event.status, message: event.message,
        evidence: event.evidence ?? null, detail: event.detail ?? null};
      await appendFile(join(this.root, environment, 'events.jsonl'),
        `${JSON.stringify(committed)}\n`, {mode: 0o600});
      state.revision++;
      await this.#writeState(environment, state);
      return committed;
    });
  }

  async events(environment, after = 0, limit = 250, {forward = false} = {}) {
    this.#assertEnvironment(environment);
    if (!Number.isSafeInteger(after) || after < 0 ||
      !Number.isSafeInteger(limit) || limit < 1 || limit > 500)
      throw new Error('INVALID_EVENT_CURSOR');
    let text = '';
    try { text = await readFile(join(this.root, environment, 'events.jsonl'), 'utf8'); }
    catch { return []; }
    const filtered = text.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line))
      .filter((event) => event.sequence > after);
    return forward ? filtered.slice(0, limit) : filtered.slice(-limit);
  }

  newSession(environment, settings) {
    return {id: randomUUID(), environment, status: 'starting', createdAt: new Date().toISOString(),
      startedAt: null, endedAt: null, stopRequested: false, pauseRequested: false,
      settings, pid: null, failure: null};
  }

  #assertEnvironment(environment) {
    if (!ENVIRONMENTS.includes(environment)) throw new Error('INVALID_ENVIRONMENT');
  }

  async #writeState(environment, state) {
    const path = join(this.root, environment, 'state.json');
    const temporary = `${path}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, {mode: 0o600});
    await rename(temporary, path);
  }
}

export type Stage = "DISCOVERED" | "REVALIDATING" | "ANALYSED" | "RISK_APPROVED" |
  "POLICY_APPROVED" | "SUBMITTED" | "FINAL" | "RECONCILED" | "SETTLEMENT_PENDING" |
  "SETTLED" | "REJECTED" | "EXPIRED" | "PREFLIGHT_FAILED" | "EXECUTION_FAILED" | "SETTLEMENT_FAILED";

export interface Transition { id: string; from: Stage; to: Stage; atMs: number; note: string }
const transitions: Record<Stage, readonly Stage[]> = {
  DISCOVERED: ["REVALIDATING", "REJECTED", "EXPIRED"],
  REVALIDATING: ["ANALYSED", "REJECTED", "EXPIRED"],
  ANALYSED: ["RISK_APPROVED", "REJECTED", "EXPIRED"],
  RISK_APPROVED: ["POLICY_APPROVED", "REJECTED", "EXPIRED", "PREFLIGHT_FAILED"],
  POLICY_APPROVED: ["SUBMITTED", "REJECTED", "EXPIRED", "PREFLIGHT_FAILED"],
  SUBMITTED: ["FINAL", "EXECUTION_FAILED"],
  FINAL: ["RECONCILED", "EXECUTION_FAILED"],
  RECONCILED: ["SETTLEMENT_PENDING"],
  SETTLEMENT_PENDING: ["SETTLED", "SETTLEMENT_FAILED"],
  SETTLED: [], REJECTED: [], EXPIRED: [], PREFLIGHT_FAILED: [], EXECUTION_FAILED: [],
  SETTLEMENT_FAILED: ["SETTLEMENT_PENDING"],
};

/** Pure transition validator; persistence and finality verification are separate boundaries. */
export function advance(stage: Stage, next: Stage, id: string, atMs: number, note: string): Transition {
  if (!transitions[stage].includes(next)) throw new Error(`illegal transition: ${stage} -> ${next}`);
  if (!id.trim() || !note.trim() || !Number.isSafeInteger(atMs)) throw new Error("missing audit identifiers");
  return { id, from: stage, to: next, atMs, note };
}

/** In-memory guard for tests/demos only. Production must use a durable UNIQUE constraint. */
export class InMemoryIdempotencyGuard {
  readonly #keys = new Set<string>();
  claim(key: string): void {
    if (!key.trim()) throw new Error("empty idempotency key");
    if (this.#keys.has(key)) throw new Error("duplicate idempotency key");
    this.#keys.add(key);
  }
  releaseForFailedPreflight(key: string): void { this.#keys.delete(key); }
}

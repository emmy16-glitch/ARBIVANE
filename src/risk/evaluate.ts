import { expectedNetUsdE6, parseUnits } from "../domain/money.ts";
import type { Candidate, ExecutionPrerequisites, RiskDecision, RiskPolicy } from "../domain/types.ts";

export const SAFE_DEFAULT_POLICY: Readonly<RiskPolicy> = Object.freeze({
  enabled: false,
  network: "testnet",
  allowedProtocols: ["rhea" as const],
  allowedLendingContracts: [],
  maxSnapshotAgeMs: 30_000,
  maxOracleAgeMs: 30_000,
  maxRepayUsdE6: "0",
  minNetProfitUsdE6: "1000000",
  maxCompetitionPressureBps: 5000,
  minCompetitionConfidenceBps: 8000,
});

const allPrerequisites: (keyof ExecutionPrerequisites)[] = [
  "liquidatorFundingVerified", "policyActuallyControlsFunds", "preflightPassed",
  "idempotencyKeyUnused", "rpcAtFinalBlock",
];

/** Fail-closed gate. Never accepts an AI answer as an execution authorization. */
export function evaluateCandidate(
  candidate: Candidate,
  policy: RiskPolicy,
  prerequisites: ExecutionPrerequisites,
  nowMs: number,
): RiskDecision {
  const reasons: string[] = [];
  let net: bigint | null = null;
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) throw new Error("invalid evaluation time");
  if (!candidate.id.trim() || !candidate.snapshot.targetAccount.trim() || !candidate.snapshot.blockHeight.trim()) reasons.push("MISSING_CANDIDATE_IDENTITY");
  if (!policy.enabled) reasons.push("EXECUTION_DISABLED");
  if (candidate.snapshot.network !== policy.network) reasons.push("WRONG_NETWORK");
  if (!policy.allowedProtocols.includes(candidate.snapshot.protocol)) reasons.push("PROTOCOL_NOT_ALLOWED");
  if (!policy.allowedLendingContracts.includes(candidate.snapshot.lendingContract)) reasons.push("CONTRACT_NOT_ALLOWED");
  if (candidate.snapshot.source !== "rpc") reasons.push("NOT_LIVE_CHAIN_DATA");
  if (!candidate.snapshot.liquidationEligibilityVerified) reasons.push("LIQUIDATION_NOT_VERIFIED");
  if (!candidate.exactCallVerified) reasons.push("EXACT_CALL_NOT_VERIFIED");
  if (candidate.expiresAtMs <= nowMs) reasons.push("CANDIDATE_EXPIRED");
  if (candidate.snapshot.observedAtMs > nowMs || nowMs - candidate.snapshot.observedAtMs > policy.maxSnapshotAgeMs) reasons.push("STALE_SNAPSHOT");
  if (candidate.snapshot.oracleObservedAtMs === null || candidate.snapshot.oracleObservedAtMs > nowMs || nowMs - candidate.snapshot.oracleObservedAtMs > policy.maxOracleAgeMs) reasons.push("STALE_OR_MISSING_ORACLE");
  if (candidate.competition.pressureBps === null || candidate.competition.confidenceBps < policy.minCompetitionConfidenceBps) reasons.push("INSUFFICIENT_COMPETITION_EVIDENCE");
  else if (candidate.competition.pressureBps > policy.maxCompetitionPressureBps) reasons.push("COMPETITION_TOO_HIGH");
  if (candidate.competition.confidenceBps < 0 || candidate.competition.confidenceBps > 10_000 ||
      (candidate.competition.pressureBps !== null && (candidate.competition.pressureBps < 0 || candidate.competition.pressureBps > 10_000))) reasons.push("INVALID_COMPETITION_SCORE");
  for (const required of allPrerequisites) if (!prerequisites[required]) reasons.push(`PREREQUISITE_${required.toUpperCase()}_MISSING`);
  try {
    net = expectedNetUsdE6(candidate.estimate);
    if (parseUnits(candidate.repayUsdE6, "repay") !== parseUnits(candidate.estimate.repayUsdE6, "estimated repay")) reasons.push("REPAY_ESTIMATE_MISMATCH");
    if (parseUnits(candidate.repayUsdE6, "repay") > parseUnits(policy.maxRepayUsdE6, "max repay")) reasons.push("REPAY_LIMIT_EXCEEDED");
    if (net < parseUnits(policy.minNetProfitUsdE6, "min profit")) reasons.push("PROFIT_BELOW_THRESHOLD");
  } catch {
    reasons.push("INVALID_FINANCIAL_VALUES");
  }
  const allow = reasons.length === 0;
  return {
    candidateId: candidate.id,
    allow,
    reasons,
    computedNetUsdE6: net?.toString() ?? null,
    evaluatedAtMs: nowMs,
    mode: allow ? "EXECUTION_ALLOWED" : "DETECTION_ONLY",
  };
}

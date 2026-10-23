import { evaluateCandidate, SAFE_DEFAULT_POLICY } from "../risk/evaluate.ts";
import type { Candidate, ExecutionPrerequisites } from "../domain/types.ts";
const now = 1_800_000_000_000;
const candidate: Candidate = {
  id: "fixture-rhea-1",
  snapshot: { protocol: "rhea", network: "testnet", chainId: "near-testnet", lendingContract: "example.testnet", targetAccount: "borrower.testnet", blockHeight: "123", observedAtMs: now - 1000, oracleObservedAtMs: now - 1000, liquidationEligibilityVerified: false, source: "fixture" },
  repayUsdE6: "490000000",
  estimate: { proceedsUsdE6: "520000000", repayUsdE6: "490000000", networkFeesUsdE6: "1800000", routeCostsUsdE6: "3400000", financingCostsUsdE6: "0", storageCostsUsdE6: "0", raceRiskReserveUsdE6: "4000000", inventoryRiskReserveUsdE6: "2000000" },
  competition: { pressureBps: null, confidenceBps: 0, observations: ["No verified history"] },
  expiresAtMs: now + 60_000, exactCallVerified: false,
};
const prerequisites: ExecutionPrerequisites = { liquidatorFundingVerified: false, policyActuallyControlsFunds: false, preflightPassed: false, idempotencyKeyUnused: true, rpcAtFinalBlock: false };
const decision = evaluateCandidate(candidate, SAFE_DEFAULT_POLICY, prerequisites, now);
console.log(JSON.stringify({ demoMode: "FIXTURE_NO_TRANSACTIONS", estimateNetMicroUsd: decision.computedNetUsdE6, decision }, null, 2));

import type { CompetitionEvidence } from "../domain/types.ts";

export interface HistoricalCompetitionObservations {
  successfulLiquidations: number;
  examinedWindows: number;
  distinctObservedLiquidators: number;
  failedContestedAttempts: number;
}

/** An explainable pressure proxy, not a count of live competitors. */
export function assessHistoricalPressure(
  o: HistoricalCompetitionObservations,
): CompetitionEvidence {
  const numbers = Object.values(o);
  if (numbers.some(v => !Number.isSafeInteger(v) || v < 0)) throw new Error("invalid observation counts");
  if (o.examinedWindows === 0) return { pressureBps: null, confidenceBps: 0, observations: ["NO_OBSERVATION_WINDOWS"] };
  const densityBps = Math.min(10_000, Math.floor(o.successfulLiquidations * 10_000 / o.examinedWindows));
  const diversityBps = Math.min(10_000, o.distinctObservedLiquidators * 1_000);
  const contestBps = o.successfulLiquidations + o.failedContestedAttempts === 0 ? 0 :
    Math.floor(10_000 * o.failedContestedAttempts / (o.successfulLiquidations + o.failedContestedAttempts));
  return {
    pressureBps: Math.floor((densityBps * 5 + diversityBps * 3 + contestBps * 2) / 10),
    // Never imply full confidence from historical counts alone.
    confidenceBps: Math.min(7_500, o.examinedWindows * 200),
    observations: [
      `windows=${o.examinedWindows}`, `successful=${o.successfulLiquidations}`,
      `actors_observed=${o.distinctObservedLiquidators}`, `contested_failures=${o.failedContestedAttempts}`,
      "Historical pressure only; hidden competitors are unobservable",
    ],
  };
}

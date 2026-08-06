import type { DecisionMetrics, DecisionMode } from "./types";
import { clampScore } from "./utils";

export function calculateInvestmentScore(
  opportunityScore: number,
  riskScore: number,
  liquidityScore: number,
  confidenceScore: number,
  annualChange: number,
) {
  return clampScore(
    opportunityScore * 0.34
      + (100 - riskScore) * 0.24
      + liquidityScore * 0.18
      + confidenceScore * 0.16
      + clampScore(50 + annualChange) * 0.08,
  );
}

export function calculateDecisionScore(
  confidenceScore: number,
  investmentScore: number,
  opportunityScore: number,
  riskScore: number,
  liquidityScore: number,
) {
  return clampScore(
    confidenceScore * 0.28
      + investmentScore * 0.24
      + opportunityScore * 0.18
      + (100 - riskScore) * 0.17
      + liquidityScore * 0.13,
  );
}

export function recommendDecision(metrics: Pick<DecisionMetrics,
  "confidenceLevel" | "decisionScore" | "opportunityScore" | "riskScore" | "investmentScore"
>): DecisionMode {
  if (metrics.confidenceLevel < 59) return "DOĞRULAMA BEKLİYOR";
  if (metrics.riskScore >= 78 || metrics.decisionScore < 38) return "UZAK DUR";
  if (metrics.decisionScore >= 86 && metrics.opportunityScore >= 76 && metrics.riskScore <= 35) return "GÜÇLÜ AL";
  if (metrics.decisionScore >= 74 && metrics.investmentScore >= 70 && metrics.riskScore <= 48) return "KOŞULLU AL";
  if (metrics.decisionScore >= 58 && metrics.riskScore <= 65) return "PAZARLIK YAP";
  return "BEKLE";
}

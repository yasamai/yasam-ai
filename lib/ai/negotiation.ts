import { clampScore } from "./utils";

export function calculateBargainingPower(
  priceDifferencePct: number,
  grossYieldPct: number,
  propertyType: string,
  transportScore: number,
  riskScore: number,
) {
  return clampScore(
    42
      + (priceDifferencePct > 0 ? Math.min(25, priceDifferencePct * 0.6) : 5)
      + (grossYieldPct > 5 ? 6 : 0)
      + (propertyType === "Konut" ? 5 : 2)
      + transportScore * 0.06
      + riskScore * 0.14,
  );
}

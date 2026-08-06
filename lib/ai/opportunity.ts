import { clampScore } from "./utils";

export function calculateOpportunityScore(
  marketM2: number,
  grossYieldPct: number,
  buildingAge: number,
  priceDifferencePct: number,
  transportScore: number,
  infrastructureScore: number,
) {
  const discountAdvantage = priceDifferencePct < 0 ? Math.min(24, Math.abs(priceDifferencePct) * 0.45) : 0;
  const overpricingPenalty = priceDifferencePct > 0 ? Math.min(30, priceDifferencePct * 0.65) : 0;
  return clampScore(
    36
      + (marketM2 > 0 ? 8 : 0)
      + discountAdvantage
      + (grossYieldPct >= 6 ? 12 : grossYieldPct >= 4 ? 7 : 0)
      + (buildingAge <= 15 ? 5 : 0)
      + transportScore * 0.08
      + infrastructureScore * 0.08
      - overpricingPenalty,
  );
}

import type { DecisionFormInput } from "./types";
import { clampScore } from "./utils";

export function calculateLiquidityScore(
  input: DecisionFormInput,
  marketLiquidity: number,
  grossYieldPct: number,
  priceDifferencePct: number,
) {
  return clampScore(
    38
      + (input.propertyType === "Konut" ? 12 : input.propertyType === "Dükkan" ? 7 : 4)
      + marketLiquidity * 0.3
      + (grossYieldPct >= 5 ? 7 : grossYieldPct >= 3 ? 3 : 0)
      - Math.max(0, priceDifferencePct) * 0.45,
  );
}

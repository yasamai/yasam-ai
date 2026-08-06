import type { DecisionFormInput } from "./types";
import { clampScore } from "./utils";

export function calculateRiskScore(
  input: DecisionFormInput,
  marketM2: number,
  buildingAge: number,
  priceDifferencePct: number,
  amortizationMonths: number,
  warnings: string[],
) {
  const titleText = input.titleStatus.toLocaleLowerCase("tr-TR");
  const zoningText = input.zoningStatus.toLocaleLowerCase("tr-TR");
  return clampScore(
    18
      + (titleText.includes("hisseli") ? 20 : 0)
      + (!input.titleVerified ? 9 : 0)
      + (!input.zoningVerified ? 9 : 0)
      + (!input.technicalReportVerified ? 7 : 0)
      + ((input.comparableSalesCount ?? 0) < 3 ? 8 : 0)
      + (zoningText.includes("belirsiz") ? 8 : 0)
      + (buildingAge > 20 ? 10 : 0)
      + (buildingAge > 35 ? 8 : 0)
      + (marketM2 <= 0 ? 8 : 0)
      + warnings.length * 2
      + (Math.abs(priceDifferencePct) > 45 ? 8 : 0)
      + (amortizationMonths > 240 ? 5 : 0),
  );
}

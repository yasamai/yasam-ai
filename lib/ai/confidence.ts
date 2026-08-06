import type { ConfidenceBreakdown, DecisionFormInput, RegionalMarketContext } from "./types";
import { clampScore } from "./utils";

export function calculateConfidenceScore(
  input: DecisionFormInput,
  warnings: string[],
  market: RegionalMarketContext | null,
): ConfidenceBreakdown {
  const required = [
    input.city,
    input.district,
    input.neighborhood,
    input.propertyType,
    input.area,
    input.askingPrice,
    input.monthlyRent,
    input.titleStatus,
    input.zoningStatus,
    input.buildingAge,
  ];
  const completeness = clampScore((required.filter((value) => String(value ?? "").trim()).length / required.length) * 20);
  const marketData = clampScore((market?.dataConfidence ?? 0) * 0.2);
  const title = input.titleVerified ? 15 : input.titleStatus.trim() ? 4 : 0;
  const zoning = input.zoningVerified ? 15 : input.zoningStatus.trim() ? 4 : 0;
  const technical = input.technicalReportVerified ? 10 : 0;
  const comparableSales = Math.min(20, Math.max(0, input.comparableSalesCount ?? 0) * 7);
  const location = input.locationVerified ? 10 : (input.city && input.district && input.neighborhood ? 4 : 0);
  const documents = input.photosProvided ? 5 : 0;

  let total = completeness + marketData + title + zoning + technical + comparableSales + location + documents;
  total -= Math.min(12, warnings.length * 2);

  const hasOfficialVerification = Boolean(input.titleVerified && input.zoningVerified);
  const hasVerifiedComparables = (input.comparableSalesCount ?? 0) >= 3;
  if (!hasOfficialVerification || !hasVerifiedComparables) total = Math.min(total, 58);

  return {
    completeness,
    marketData,
    title,
    zoning,
    technical,
    comparableSales,
    location,
    documents,
    total: clampScore(total),
  };
}

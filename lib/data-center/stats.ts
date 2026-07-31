import type { DataCenterStats, MarketDataRecord } from "./types";
export function calculateDataCenterStats(records: MarketDataRecord[]): DataCenterStats {
  const averageConfidence = records.length ? Math.round(records.reduce((sum, r) => sum + r.confidenceScore, 0) / records.length) : 0;
  return {
    totalRecords: records.length,
    verifiedRecords: records.filter((r) => r.verificationStatus === "verified").length,
    reviewRecords: records.filter((r) => r.verificationStatus === "review").length,
    rejectedRecords: records.filter((r) => r.verificationStatus === "rejected").length,
    cityCount: new Set(records.map((r) => r.city).filter(Boolean)).size,
    districtCount: new Set(records.map((r) => `${r.city}/${r.district}`).filter(Boolean)).size,
    neighborhoodCount: new Set(records.map((r) => `${r.city}/${r.district}/${r.neighborhood}`).filter(Boolean)).size,
    averageConfidence,
  };
}

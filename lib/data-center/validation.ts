import type { MarketDataRecord } from "./types";

export type ValidationIssue = { field: keyof MarketDataRecord | "record"; message: string };

export function validateMarketRecord(record: MarketDataRecord): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!record.city.trim()) issues.push({ field: "city", message: "İl zorunludur." });
  if (!record.district.trim()) issues.push({ field: "district", message: "İlçe zorunludur." });
  if (!record.neighborhood.trim()) issues.push({ field: "neighborhood", message: "Mahalle zorunludur." });
  if (!record.periodDate) issues.push({ field: "periodDate", message: "Dönem tarihi zorunludur." });
  if (!record.sourceName.trim()) issues.push({ field: "sourceName", message: "Veri kaynağı zorunludur." });
  if (record.listingCount < 0) issues.push({ field: "listingCount", message: "İlan sayısı negatif olamaz." });
  if (record.salePriceM2 < 0) issues.push({ field: "salePriceM2", message: "Satış m² fiyatı negatif olamaz." });
  if (record.rentPriceM2 < 0) issues.push({ field: "rentPriceM2", message: "Kira m² fiyatı negatif olamaz." });
  for (const key of ["confidenceScore", "liquidityScore", "infrastructureScore", "transportScore"] as const) {
    if (record[key] < 0 || record[key] > 100) issues.push({ field: key, message: `${key} 0–100 arasında olmalıdır.` });
  }
  if (record.salePriceM2 === 0 && record.rentPriceM2 === 0) {
    issues.push({ field: "record", message: "Satış veya kira m² değerlerinden en az biri girilmelidir." });
  }
  return issues;
}

export function detectOutlier(record: MarketDataRecord, peers: MarketDataRecord[]): string[] {
  const sameArea = peers.filter((item) => item.city === record.city && item.district === record.district && item.id !== record.id);
  if (sameArea.length < 4) return [];
  const median = (values: number[]) => {
    const sorted = values.filter((v) => v > 0).sort((a, b) => a - b);
    if (!sorted.length) return 0;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };
  const warnings: string[] = [];
  const saleMedian = median(sameArea.map((i) => i.salePriceM2));
  const rentMedian = median(sameArea.map((i) => i.rentPriceM2));
  if (saleMedian && (record.salePriceM2 > saleMedian * 2.2 || record.salePriceM2 < saleMedian * 0.45)) warnings.push("Satış m² fiyatı bölge medyanından belirgin biçimde ayrılıyor.");
  if (rentMedian && (record.rentPriceM2 > rentMedian * 2.2 || record.rentPriceM2 < rentMedian * 0.45)) warnings.push("Kira m² fiyatı bölge medyanından belirgin biçimde ayrılıyor.");
  return warnings;
}

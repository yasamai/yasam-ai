export type V30MarketRecord = {
  city?: string | null;
  district?: string | null;
  neighborhood?: string | null;
  propertyType?: string | null;
  averageM2?: number | null;
  rentM2?: number | null;
  annualChange?: number | null;
  liquidityScore?: number | null;
  infrastructureScore?: number | null;
  transportScore?: number | null;
  dataConfidence?: number | null;
  sampleSize?: number | null;
  source?: string | null;
  updatedAt?: string | null;
  periodDate?: string | null;
};

export type V30CitySignal = {
  city: string;
  recordCount: number;
  averageM2: number;
  rentM2: number;
  annualChange: number;
  liquidityScore: number;
  dataConfidence: number;
  grossYield: number | null;
  signalScore: number;
};

export type V30MarketIntelligence = {
  recordCount: number;
  cityCount: number;
  averageM2: number;
  averageRentM2: number;
  averageAnnualChange: number;
  averageLiquidity: number;
  averageConfidence: number;
  totalSampleSize: number;
  trendLabel: "Pozitif" | "Yatay" | "Negatif" | "Veri yetersiz";
  qualityLabel: "Yüksek" | "Orta" | "Düşük" | "Veri yok";
  topSignals: V30CitySignal[];
  warnings: string[];
};

function n(value: unknown) {
  const x = Number(value);
  return Number.isFinite(x) ? x : 0;
}

function avg(values: number[]) {
  const usable = values.filter((value) => Number.isFinite(value) && value > 0);
  if (!usable.length) return 0;
  return usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

function weightedAvg(items: Array<{ value: number; weight: number }>) {
  const usable = items.filter((item) => item.value > 0);
  if (!usable.length) return 0;
  const totalWeight = usable.reduce((sum, item) => sum + Math.max(1, item.weight), 0);
  return usable.reduce((sum, item) => sum + item.value * Math.max(1, item.weight), 0) / totalWeight;
}

function round(value: number, digits = 0) {
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

export function buildV30MarketIntelligence(records: V30MarketRecord[]): V30MarketIntelligence {
  const clean = Array.isArray(records) ? records.filter(Boolean) : [];
  const grouped = new Map<string, V30MarketRecord[]>();

  for (const record of clean) {
    const city = String(record.city || "").trim();
    if (!city) continue;
    const list = grouped.get(city) ?? [];
    list.push(record);
    grouped.set(city, list);
  }

  const citySignals: V30CitySignal[] = Array.from(grouped.entries()).map(([city, rows]) => {
    const weightOf = (row: V30MarketRecord) => Math.max(1, n(row.sampleSize));
    const averageM2 = weightedAvg(rows.map((row) => ({ value: n(row.averageM2), weight: weightOf(row) })));
    const rentM2 = weightedAvg(rows.map((row) => ({ value: n(row.rentM2), weight: weightOf(row) })));
    const annualChange = weightedAvg(rows.map((row) => ({ value: n(row.annualChange), weight: weightOf(row) })));
    const liquidityScore = weightedAvg(rows.map((row) => ({ value: n(row.liquidityScore), weight: weightOf(row) })));
    const dataConfidence = weightedAvg(rows.map((row) => ({ value: n(row.dataConfidence), weight: weightOf(row) })));
    const grossYield = averageM2 > 0 && rentM2 > 0 ? (rentM2 * 12 / averageM2) * 100 : null;

    const growthComponent = Math.max(0, Math.min(100, 50 + annualChange));
    const yieldComponent = grossYield == null ? 50 : Math.max(0, Math.min(100, grossYield * 10));
    const signalScore =
      dataConfidence * 0.35 +
      liquidityScore * 0.30 +
      growthComponent * 0.20 +
      yieldComponent * 0.15;

    return {
      city,
      recordCount: rows.length,
      averageM2: round(averageM2),
      rentM2: round(rentM2),
      annualChange: round(annualChange, 1),
      liquidityScore: round(liquidityScore),
      dataConfidence: round(dataConfidence),
      grossYield: grossYield == null ? null : round(grossYield, 2),
      signalScore: round(signalScore),
    };
  });

  const averageAnnualChange = avg(clean.map((row) => n(row.annualChange)));
  const averageConfidence = avg(clean.map((row) => n(row.dataConfidence)));

  const warnings: string[] = [];
  if (!clean.length) warnings.push("Kayıtlı piyasa verisi yok.");
  if (clean.length && averageConfidence < 60) warnings.push("Ortalama veri güveni %60'ın altında; sıralamalar temkinli okunmalıdır.");
  if (clean.some((row) => n(row.sampleSize) <= 0)) warnings.push("Bazı kayıtlarda örneklem büyüklüğü yok; ağırlıklı karşılaştırma sınırlıdır.");
  if (clean.some((row) => n(row.averageM2) <= 0)) warnings.push("Bazı kayıtlarda satış m² değeri eksik veya sıfır.");
  if (clean.some((row) => !row.source)) warnings.push("Bazı kayıtların kaynak adı eksik.");

  const trendLabel =
    !clean.length ? "Veri yetersiz" :
    averageAnnualChange > 3 ? "Pozitif" :
    averageAnnualChange < -3 ? "Negatif" : "Yatay";

  const qualityLabel =
    !clean.length ? "Veri yok" :
    averageConfidence >= 80 ? "Yüksek" :
    averageConfidence >= 60 ? "Orta" : "Düşük";

  return {
    recordCount: clean.length,
    cityCount: grouped.size,
    averageM2: round(avg(clean.map((row) => n(row.averageM2)))),
    averageRentM2: round(avg(clean.map((row) => n(row.rentM2)))),
    averageAnnualChange: round(averageAnnualChange, 1),
    averageLiquidity: round(avg(clean.map((row) => n(row.liquidityScore)))),
    averageConfidence: round(averageConfidence),
    totalSampleSize: clean.reduce((sum, row) => sum + Math.max(0, n(row.sampleSize)), 0),
    trendLabel,
    qualityLabel,
    topSignals: citySignals.sort((a, b) => b.signalScore - a.signalScore).slice(0, 5),
    warnings: warnings.slice(0, 4),
  };
}
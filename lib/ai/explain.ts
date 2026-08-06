import type { DecisionFormInput, DecisionMetrics } from "./types";
import { formatNumber } from "./utils";

export function buildExplanations(metrics: DecisionMetrics, input: DecisionFormInput) {
  const reasons = [
    `Tahmini matematiksel piyasa referansı ${formatNumber(metrics.estimatedMarketValue)} TL olarak hesaplandı.`,
    `Talep fiyatının referansa göre farkı %${metrics.priceDifferencePct.toFixed(1).replace(".", ",")} seviyesindedir.`,
    metrics.grossYieldPct > 0
      ? `Talep fiyatına göre brüt kira getirisi %${metrics.grossYieldPct.toFixed(2).replace(".", ",")} ve amortisman süresi yaklaşık ${(metrics.amortizationMonths / 12).toFixed(1).replace(".", ",")} yıldır.`
      : "Kira verisi bulunmadığı için nakit akışı analizi sınırlıdır.",
    `Veri güveni ${metrics.confidenceLevel}/100, risk seviyesi ${metrics.riskScore}/100 ve likidite ${metrics.liquidityScore}/100 olarak hesaplandı.`,
  ];

  if (!input.titleVerified) reasons.push("Tapu kaydı resmî kaynaktan doğrulanmadı.");
  if (!input.zoningVerified) reasons.push("İmar durumu resmî kaynaktan doğrulanmadı.");
  if ((input.comparableSalesCount ?? 0) < 3) reasons.push("En az üç doğrulanmış karşılaştırılabilir satış bulunmuyor.");
  if (!input.technicalReportVerified) reasons.push("Teknik ekspertiz veya yapı incelemesi tamamlanmadı.");

  return reasons;
}

export function buildDecisionPromptContext(metrics: DecisionMetrics) {
  return [
    "YAŞAM AI KARAR MOTORU ÇIKTISI:",
    `Tahmini Piyasa Değeri: ${formatNumber(metrics.estimatedMarketValue)} TL`,
    `Fiyat Farkı: %${metrics.priceDifferencePct.toFixed(1).replace(".", ",")}`,
    `Karar / Yatırım / Fırsat / Risk / Likidite: ${metrics.decisionScore} / ${metrics.investmentScore} / ${metrics.opportunityScore} / ${metrics.riskScore} / ${metrics.liquidityScore}`, 
    `Veri Güveni: ${metrics.confidenceLevel}/100`,
    `Brüt Kira Getirisi: %${metrics.grossYieldPct.toFixed(2).replace(".", ",")}`,
    `Nihai Karar: ${metrics.decision}`,
    `Uyarılar: ${metrics.warnings.length ? metrics.warnings.join(" ") : "Yok"}`,
    `Açıklama: ${metrics.reasons.join(" ")}`,
  ].join("\n");
}

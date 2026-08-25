export type V29AnalysisDiagnostics = {
  completenessScore: number;
  askingPrice: number;
  areaM2: number;
  askingM2: number | null;
  monthlyRent: number | null;
  grossRentalYield: number | null;
  priceToAnnualRent: number | null;
  missingCritical: string[];
  warnings: string[];
};

function numberValue(value: unknown) {
  const normalized = String(value ?? "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function textValue(value: unknown) {
  return String(value ?? "").trim();
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function calculateV29Diagnostics(input: unknown): V29AnalysisDiagnostics {
  const form = objectValue(input);
  const askingPrice = Math.max(0, numberValue(form.askingPrice));
  const areaM2 = Math.max(0, numberValue(form.area));
  const monthlyRentRaw = Math.max(0, numberValue(form.monthlyRent));
  const monthlyRent = monthlyRentRaw > 0 ? monthlyRentRaw : null;
  const askingM2 = askingPrice > 0 && areaM2 > 0 ? Math.round(askingPrice / areaM2) : null;
  const grossRentalYield =
    askingPrice > 0 && monthlyRent
      ? Number((((monthlyRent * 12) / askingPrice) * 100).toFixed(2))
      : null;
  const priceToAnnualRent =
    askingPrice > 0 && monthlyRent
      ? Number((askingPrice / (monthlyRent * 12)).toFixed(1))
      : null;

  const criticalFields: Array<[string, string]> = [
    ["city", "İl"],
    ["district", "İlçe"],
    ["propertyType", "Taşınmaz türü"],
    ["area", "Alan"],
    ["askingPrice", "Talep fiyatı"],
  ];
  const secondaryFields: Array<[string, string]> = [
    ["neighborhood", "Mahalle"],
    ["monthlyRent", "Kira beklentisi"],
    ["buildingAge", "Bina yaşı"],
    ["titleStatus", "Tapu durumu"],
    ["zoningStatus", "İmar durumu"],
  ];

  const missingCritical = criticalFields
    .filter(([key]) => !textValue(form[key]) || (["area", "askingPrice"].includes(key) && numberValue(form[key]) <= 0))
    .map(([, label]) => label);

  const filledCritical = criticalFields.length - missingCritical.length;
  const filledSecondary = secondaryFields.filter(([key]) => textValue(form[key])).length;
  const completenessScore = Math.max(
    0,
    Math.min(100, Math.round((filledCritical / criticalFields.length) * 70 + (filledSecondary / secondaryFields.length) * 30)),
  );

  const warnings: string[] = [];
  if (!textValue(form.neighborhood)) warnings.push("Mahalle bilgisi yok; mikro-konum karşılaştırmasının güveni düşer.");
  if (!monthlyRent) warnings.push("Kira verisi yok; kira getirisi ve nakit akışı sonucu sınırlıdır.");
  if (!textValue(form.titleStatus)) warnings.push("Tapu durumu belirtilmemiş; işlem öncesi resmî doğrulama gerekir.");
  if (!textValue(form.zoningStatus) && ["Arsa", "Ticari"].includes(textValue(form.propertyType))) {
    warnings.push("İmar bilgisi belirtilmemiş; özellikle arsa/ticari taşınmazda karar öncesi doğrulanmalıdır.");
  }
  if (askingPrice <= 0 || areaM2 <= 0) warnings.push("Fiyat veya alan geçersiz; m² karşılaştırması üretilemez.");

  return {
    completenessScore,
    askingPrice,
    areaM2,
    askingM2,
    monthlyRent,
    grossRentalYield,
    priceToAnnualRent,
    missingCritical,
    warnings,
  };
}

export function buildV29AnalysisContext(input: unknown, decisionMetrics: unknown) {
  const diagnostics = calculateV29Diagnostics(input);
  const metrics = objectValue(decisionMetrics);

  const safeMetricEntries = Object.entries(metrics)
    .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value) || value == null)
    .slice(0, 30);
  const safeMetrics = Object.fromEntries(safeMetricEntries);

  return `
V29 HİBRİT KARAR MOTORU - ZORUNLU KONTROL KATMANI

GİRDİ TAMLIK SKORU: ${diagnostics.completenessScore}/100
KRİTİK EKSİKLER: ${diagnostics.missingCritical.length ? diagnostics.missingCritical.join(", ") : "Yok"}
TALEP m²: ${diagnostics.askingM2 != null ? diagnostics.askingM2.toLocaleString("tr-TR") + " TL/m²" : "Hesaplanamadı"}
BRÜT KİRA GETİRİSİ: ${diagnostics.grossRentalYield != null ? "%" + diagnostics.grossRentalYield : "Hesaplanamadı"}
FİYAT / YILLIK KİRA ÇARPANI: ${diagnostics.priceToAnnualRent != null ? diagnostics.priceToAnnualRent + "x" : "Hesaplanamadı"}
UYARILAR:
${diagnostics.warnings.length ? diagnostics.warnings.map((item, index) => `${index + 1}. ${item}`).join("\n") : "1. Temel girdi kontrollerinde ek uyarı yok."}

KARAR MOTORU SAYISAL ÇIKTILARI:
${JSON.stringify(safeMetrics, null, 2)}

V29 KARAR PROTOKOLÜ
- Önce veri yeterliliğini değerlendir; eksik veri varsa güven skorunu buna göre düşür.
- Talep fiyatı/m², kira getirisi ve mevcut karar motoru metrikleri birbiriyle çelişiyorsa çelişkiyi açıkça yaz.
- Bölgesel veri yoksa piyasa değerini kesinmiş gibi üretme.
- Tapu, imar, hukuki uygunluk, deprem performansı veya gerçekleşmiş satış verisi doğrulanmamışsa doğrulanmış gibi sunma.
- Fiyat önerisi verirken tek rakamı kesin gerçek olarak değil, mevcut girdilerden türetilmiş karar aralığı olarak açıkla.
- Nihai kararın her ana gerekçesini hangi girdiye veya hesaplanan metriğe dayandırdığını belirt.
- Kullanıcıya karar vermeden önce doğrulanması gereken en kritik 3 eksik veriyi ayrıca göster.
`;
}
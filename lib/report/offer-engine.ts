export type OfferStrategyInput = {
  askingPrice: number;
  referenceValue: number;
  trustScore: number;
  riskScore: number;
  liquidityScore: number | null;
  hasOfficialVerification: boolean;
  hasVerifiedComparableSales: boolean;
  neighborhoodExactMatch: boolean;
  rentalYield: number;
};

export type OfferStrategy = {
  openingOffer: number;
  upperLimit: number;
  discountRate: number;
  negotiationScore: number;
  explanation: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function calculateOfferStrategy(input: OfferStrategyInput): OfferStrategy {
  if (input.askingPrice <= 0) {
    return { openingOffer: 0, upperLimit: 0, discountRate: 0, negotiationScore: 0, explanation: "Talep fiyatı girilmediği için teklif aralığı üretilemedi." };
  }

  const verificationPenalty = (!input.hasOfficialVerification ? 3 : 0) + (!input.hasVerifiedComparableSales ? 3 : 0);
  const scopePenalty = input.neighborhoodExactMatch ? 0 : 2;
  const riskPenalty = clamp((input.riskScore - 45) / 10, 0, 4);
  const trustPenalty = clamp((60 - input.trustScore) / 15, 0, 3);
  const liquidityPenalty = input.liquidityScore == null ? 1.5 : clamp((55 - input.liquidityScore) / 20, 0, 2);
  const yieldAdjustment = input.rentalYield >= 6 ? -1 : input.rentalYield > 0 && input.rentalYield < 3 ? 1.5 : 0;
  const rawDiscount = 5 + verificationPenalty + scopePenalty + riskPenalty + trustPenalty + liquidityPenalty + yieldAdjustment;
  const discountRate = clamp(rawDiscount, 5, 18);

  const askingBasedOpening = input.askingPrice * (1 - discountRate / 100);
  const verifiedReferenceCap = input.referenceValue > 0 && input.hasVerifiedComparableSales
    ? input.referenceValue * 0.98
    : Number.POSITIVE_INFINITY;
  const openingOffer = Math.round(Math.min(askingBasedOpening, verifiedReferenceCap));

  const upperDiscount = clamp(discountRate * 0.45, 2, 8);
  const askingBasedUpper = input.askingPrice * (1 - upperDiscount / 100);
  const upperLimit = Math.round(Math.max(openingOffer, Math.min(askingBasedUpper, verifiedReferenceCap)));
  const negotiationScore = Math.round(clamp(discountRate * 6, 0, 100));

  const reasons = [
    `veri güveni ${input.trustScore}/100`,
    `risk ${input.riskScore}/100`,
    input.hasVerifiedComparableSales ? "doğrulanmış emsal mevcut" : "doğrulanmış emsal eksik",
    input.hasOfficialVerification
  ? "resmî belge doğrulaması tamamlandı"
  : "resmî belge doğrulaması henüz tamamlanmamış",
    input.neighborhoodExactMatch ? "mahalle bazlı veri" : "geniş bölge referansı",
  ];

  return {
    openingOffer,
    upperLimit,
    discountRate: Math.round(discountRate * 10) / 10,
    negotiationScore,
    explanation: `Teklif aralığı sabit bir yüzdeyle değil; ${reasons.join(", ")} bileşenleri birlikte değerlendirilerek üretildi. Başlangıç indirimi yaklaşık %${discountRate.toFixed(1)}.`
  };
}

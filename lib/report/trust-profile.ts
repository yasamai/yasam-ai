export type ReportTrustInput = {
  verificationSaved: boolean;
  hasOfficialVerification: boolean;
  hasVerifiedComparableSales: boolean;
  trustScore: number;
  dataScope: string;
};

export type ReportTrustProfile = {
  score: number;
  level: "Kayıtlı" | "Ön Doğrulama" | "Uzman Doğrulaması Gerekli" | "Doğrulanmış";
  explanation: string;
};

export function buildReportTrustProfile(input: ReportTrustInput): ReportTrustProfile {
  let score = Math.max(0, Math.min(100, input.trustScore));
  if (input.verificationSaved) score = Math.min(100, score + 5);
  if (input.hasOfficialVerification) score = Math.min(100, score + 18);
  if (input.hasVerifiedComparableSales) score = Math.min(100, score + 17);

  if (input.hasOfficialVerification && input.hasVerifiedComparableSales && score >= 75) {
    return { score, level: "Doğrulanmış", explanation: `Dijital kayıt, resmî doğrulama ve karşılaştırılabilir emsal kontrolleri tamamlandı. Veri kapsamı: ${input.dataScope}.` };
  }
  if (score >= 55) {
    return { score, level: "Ön Doğrulama", explanation: `Rapor kimliği ve hesaplama izi kayıtlıdır; resmî belge veya emsal doğrulamalarının bir bölümü eksiktir. Veri kapsamı: ${input.dataScope}.` };
  }
  if (input.verificationSaved) {
    return { score, level: "Kayıtlı", explanation: `Dijital rapor kaydı oluşturuldu. Bu durum taşınmazın resmî olarak doğrulandığı anlamına gelmez. Veri kapsamı: ${input.dataScope}.` };
  }
  return { score, level: "Uzman Doğrulaması Gerekli", explanation: `Rapor ön değerlendirme niteliğindedir. Tapu, imar, teknik durum ve emsal satışlar yetkili kaynaklardan doğrulanmalıdır. Veri kapsamı: ${input.dataScope}.` };
}

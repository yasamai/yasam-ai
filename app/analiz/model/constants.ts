import type { FormState, RegionalDataRecord, ScoreMap } from "./types";

export const TURKIYE_DATA_SEED: RegionalDataRecord[] = [
  {
    id: "turkiye-veri-baslangic",
    city: "Türkiye",
    district: "Tüm İlçeler",
    neighborhood: "Veri bekleniyor",
    propertyType: "Konut",
    averageM2: 0,
    rentM2: 0,
    annualChange: 0,
    liquidityScore: 0,
    infrastructureScore: 0,
    transportScore: 0,
    dataConfidence: 0,
    sourceNote: "Bu kayıt yalnızca sistem başlangıç kaydıdır. Doğrulanmış piyasa verisi yüklenmeden fiyat hesabında kullanılmaz.",
    updatedAt: new Date().toISOString().slice(0, 10),
    source: "system",
    sampleSize: 0,
    periodDate: new Date().toISOString().slice(0, 10),
  },
];

export const initialForm: FormState = {
  city: "Adana",
  district: "Ceyhan",
  neighborhood: "",
  propertyType: "Konut",
  area: "",
  askingPrice: "",
  monthlyRent: "",
  buildingAge: "",
  floor: "",
  totalFloors: "",
  titleStatus: "Kat mülkiyeti",
  zoningStatus: "",
  notes: "",
};

export const emptyScores: ScoreMap = {
  trust: null,
  investment: null,
  opportunity: null,
  risk: null,
  liquidity: null,
};

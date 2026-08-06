import type { VerificationStatus } from "../../../lib/data-center/types";

export type ViewMode = "dashboard" | "reports" | "compare" | "data" | "verification" | "ecosystem" | "new";
export type HistoryMode = "active" | "favorites" | "archive";
export type ScoreKey = "trust" | "investment" | "opportunity" | "risk" | "liquidity";
export type ScoreMap = Record<ScoreKey, number | null>;

export type RegionalDataRecord = {
  id: string;
  city: string;
  district: string;
  neighborhood: string;
  propertyType: string;
  averageM2: number;
  rentM2: number;
  annualChange: number;
  liquidityScore: number;
  infrastructureScore: number;
  transportScore: number;
  dataConfidence: number;
  sourceNote: string;
  updatedAt: string;
  source: string;
  sampleSize: number;
  periodDate: string;
  verificationStatus?: VerificationStatus;
  databaseId?: string;
};

export type MarketDataPayload = {
  city?: string;
  district?: string;
  neighborhood?: string | null;
  liquidityScore?: number;
  infrastructureScore?: number;
  transportScore?: number;
  sourceNote?: string;
  sourceUrl?: string;
  methodology?: string;
  sampleSize?: number;
  verificationStatus?: string;
};

export type TurkiyeLocationOption = {
  id: number;
  name: string;
  provinceId?: number;
  districtId?: number;
  postalCode?: string | null;
  postalCodeStatus?: "official" | "derived" | "estimated" | null;
};

export type TurkiyeApiListResponse = {
  data?: TurkiyeLocationOption[];
  meta?: {
    count?: number;
    total?: number;
    datasetVersion?: string;
    lastUpdated?: string;
  };
  error?: { message?: string };
};

export type LocationCacheEnvelope = {
  savedAt: number;
  data: TurkiyeLocationOption[];
  meta?: TurkiyeApiListResponse["meta"];
};

export type MarketDataRow = {
  id?: string;
  location_key?: string | null;
  property_type?: string | null;
  period_date?: string | null;
  sale_price_m2?: number | string | null;
  rent_price_m2?: number | string | null;
  listing_count?: number | string | null;
  days_on_market?: number | string | null;
  annual_change_percent?: number | string | null;
  confidence_score?: number | string | null;
  source_name?: string | null;
  payload?: MarketDataPayload | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type FormState = {
  city: string;
  district: string;
  neighborhood: string;
  propertyType: string;
  area: string;
  askingPrice: string;
  monthlyRent: string;
  buildingAge: string;
  floor: string;
  totalFloors: string;
  titleStatus: string;
  zoningStatus: string;
  notes: string;
};

export type CloudRecord = {
  id: string;
  created_at: string;
  updated_at?: string | null;
  city: string | null;
  district: string | null;
  neighborhood: string | null;
  property_type: string | null;
  area: string | null;
  asking_price: string | null;
  notes: string | null;
  report: string | null;
  decision: string | null;
  is_favorite: boolean;
  is_archived: boolean;
};

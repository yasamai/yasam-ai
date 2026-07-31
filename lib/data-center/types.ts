export type VerificationStatus = "verified" | "review" | "rejected";

export type MarketDataRecord = {
  id?: string;
  city: string;
  district: string;
  neighborhood: string;
  propertyType: string;
  periodDate: string;
  sourceName: string;
  sourceNote?: string;
  listingCount: number;
  salePriceM2: number;
  rentPriceM2: number;
  annualChangePercent: number;
  confidenceScore: number;
  liquidityScore: number;
  infrastructureScore: number;
  transportScore: number;
  verificationStatus: VerificationStatus;
  createdAt?: string;
  updatedAt?: string;
};

export type DataCenterStats = {
  totalRecords: number;
  verifiedRecords: number;
  reviewRecords: number;
  rejectedRecords: number;
  cityCount: number;
  districtCount: number;
  neighborhoodCount: number;
  averageConfidence: number;
};

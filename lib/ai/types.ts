export type DecisionMode =
  | "GÜÇLÜ AL"
  | "KOŞULLU AL"
  | "PAZARLIK YAP"
  | "BEKLE"
  | "UZAK DUR"
  | "DOĞRULAMA BEKLİYOR";

export type DecisionFormInput = {
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
  titleVerified?: boolean;
  zoningVerified?: boolean;
  technicalReportVerified?: boolean;
  comparableSalesCount?: number;
  locationVerified?: boolean;
  photosProvided?: boolean;
};

export type RegionalMarketContext = {
  averageM2: number;
  rentM2: number;
  annualChange: number;
  liquidityScore: number;
  infrastructureScore: number;
  transportScore: number;
  dataConfidence: number;
  propertyType: string;
  sampleSize?: number;
  source?: string;
  updatedAt?: string;
};

export type ConfidenceBreakdown = {
  completeness: number;
  marketData: number;
  title: number;
  zoning: number;
  technical: number;
  comparableSales: number;
  location: number;
  documents: number;
  total: number;
};

export type DecisionChainStep = {
  key: "confidence" | "risk" | "liquidity" | "investment" | "opportunity" | "negotiation" | "decision";
  label: string;
  score?: number;
  outcome: string;
};

export type DecisionMetrics = {
  askingM2: number;
  marketM2: number;
  estimatedMarketValue: number;
  priceDifferencePct: number;
  grossYieldPct: number;
  amortizationMonths: number;
  year1Estimate: number;
  year3Estimate: number;
  year5Estimate: number;
  confidenceLevel: number;
  confidenceBreakdown: ConfidenceBreakdown;
  decisionScore: number;
  investmentScore: number;
  opportunityScore: number;
  riskScore: number;
  liquidityScore: number;
  bargainingPower: number;
  decision: DecisionMode;
  reasons: string[];
  warnings: string[];
  lowValue: number;
  highValue: number;
  firstOffer: number;
  targetPrice: number;
  maxPrice: number;
  decisionChain: DecisionChainStep[];
};

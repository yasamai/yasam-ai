import type { DecisionChainStep, DecisionFormInput, DecisionMetrics, RegionalMarketContext } from "./types";
import { parseNumeric, clampScore } from "./utils";
import { calculateMarketValue, calculatePriceBands } from "./valuation";
import { calculateCashflowMetrics } from "./rental";
import { calculateConfidenceScore } from "./confidence";
import { calculateRiskScore } from "./risk";
import { calculateLiquidityScore } from "./liquidity";
import { calculateOpportunityScore } from "./opportunity";
import { calculateBargainingPower } from "./negotiation";
import { calculateDecisionScore, calculateInvestmentScore, recommendDecision } from "./recommendation";
import { calculateProjectionRange } from "./projection";
import { buildExplanations } from "./explain";

function collectWarnings(input: DecisionFormInput, area: number, askingPrice: number, monthlyRent: number, buildingAge: number, floor: number, totalFloors: number) {
  const warnings: string[] = [];
  if (!input.city.trim()) warnings.push("İl bilgisi eksik.");
  if (!input.district.trim()) warnings.push("İlçe bilgisi eksik.");
  if (!input.neighborhood.trim()) warnings.push("Mahalle bilgisi eksik.");
  if (!area) warnings.push("Alan bilgisi eksik.");
  if (!askingPrice) warnings.push("Talep fiyatı eksik.");
  if (!input.titleStatus.trim()) warnings.push("Tapu durumu eksik.");
  if (!input.zoningStatus.trim()) warnings.push("İmar durumu eksik.");
  if (!monthlyRent) warnings.push("Aylık kira beklentisi eksik; kira getirisi hesaplanamadı.");
  if (buildingAge > 25) warnings.push("Bina yaşı yüksek risk sinyali oluşturuyor.");
  if (totalFloors > 0 && floor > totalFloors) warnings.push("Kat bilgisi tutarsız görünüyor.");
  if (!input.titleVerified) warnings.push("Tapu resmî olarak doğrulanmadı.");
  if (!input.zoningVerified) warnings.push("İmar resmî olarak doğrulanmadı.");
  if ((input.comparableSalesCount ?? 0) < 3) warnings.push("Üç doğrulanmış emsal satış bulunmuyor.");
  return warnings;
}

function buildDecisionChain(metrics: DecisionMetrics): DecisionChainStep[] {
  return [
    { key: "confidence", label: "Veri Güveni", score: metrics.confidenceLevel, outcome: metrics.confidenceLevel >= 70 ? "Güçlü" : metrics.confidenceLevel >= 50 ? "Orta" : "Doğrulama gerekli" },
    { key: "risk", label: "Risk Seviyesi", score: metrics.riskScore, outcome: metrics.riskScore <= 35 ? "Düşük" : metrics.riskScore <= 60 ? "Orta" : "Yüksek" },
    { key: "liquidity", label: "Likidite", score: metrics.liquidityScore, outcome: metrics.liquidityScore >= 70 ? "Güçlü" : metrics.liquidityScore >= 50 ? "Orta" : "Zayıf" },
    { key: "investment", label: "Yatırım", score: metrics.investmentScore, outcome: metrics.investmentScore >= 70 ? "Olumlu" : metrics.investmentScore >= 50 ? "Temkinli" : "Zayıf" },
    { key: "opportunity", label: "Fırsat", score: metrics.opportunityScore, outcome: metrics.opportunityScore >= 70 ? "Güçlü" : metrics.opportunityScore >= 50 ? "Orta" : "Zayıf" },
    { key: "negotiation", label: "Pazarlık Gücü", score: metrics.bargainingPower, outcome: metrics.bargainingPower >= 70 ? "Yüksek" : metrics.bargainingPower >= 50 ? "Orta" : "Düşük" },
    { key: "decision", label: "Nihai Karar", outcome: metrics.decision },
  ];
}

export function calculateDecisionMetrics(input: DecisionFormInput, market: RegionalMarketContext | null): DecisionMetrics {
  const askingPrice = parseNumeric(input.askingPrice);
  const area = parseNumeric(input.area);
  const monthlyRent = parseNumeric(input.monthlyRent);
  const buildingAge = parseNumeric(input.buildingAge);
  const floor = parseNumeric(input.floor);
  const totalFloors = parseNumeric(input.totalFloors);
  const warnings = collectWarnings(input, area, askingPrice, monthlyRent, buildingAge, floor, totalFloors);

  const marketM2 = Math.max(0, market?.averageM2 ?? 0);
  const marketLiquidity = clampScore(market?.liquidityScore ?? 0);
  const transport = clampScore(market?.transportScore ?? 0);
  const infrastructure = clampScore(market?.infrastructureScore ?? 0);

  const valuation = calculateMarketValue(area, marketM2, askingPrice);
  const cashflow = calculateCashflowMetrics(askingPrice, monthlyRent);
  const confidenceBreakdown = calculateConfidenceScore(input, warnings, market);
  const riskScore = calculateRiskScore(input, marketM2, buildingAge, valuation.priceDifferencePct, cashflow.amortizationMonths, warnings);
  const liquidityScore = calculateLiquidityScore(input, marketLiquidity, cashflow.grossYieldPct, valuation.priceDifferencePct);
  const opportunityScore = calculateOpportunityScore(marketM2, cashflow.grossYieldPct, buildingAge, valuation.priceDifferencePct, transport, infrastructure);
  const investmentScore = calculateInvestmentScore(opportunityScore, riskScore, liquidityScore, confidenceBreakdown.total, market?.annualChange ?? 0);
  const decisionScore = calculateDecisionScore(confidenceBreakdown.total, investmentScore, opportunityScore, riskScore, liquidityScore);
  const bargainingPower = calculateBargainingPower(valuation.priceDifferencePct, cashflow.grossYieldPct, input.propertyType, transport, riskScore);
  const projections = calculateProjectionRange(valuation.estimatedMarketValue, market?.annualChange ?? 0);
  const priceBands = calculatePriceBands(valuation.estimatedMarketValue, askingPrice, riskScore);

  const base: DecisionMetrics = {
    ...valuation,
    ...cashflow,
    ...projections,
    marketM2,
    confidenceLevel: confidenceBreakdown.total,
    confidenceBreakdown,
    decisionScore,
    investmentScore,
    opportunityScore,
    riskScore,
    liquidityScore,
    bargainingPower,
    decision: "BEKLE",
    reasons: [],
    warnings,
    ...priceBands,
    decisionChain: [],
  };

  const decision = recommendDecision(base);
  const withDecision = { ...base, decision };
  const reasons = buildExplanations(withDecision, input);
  const complete = { ...withDecision, reasons };
  return { ...complete, decisionChain: buildDecisionChain(complete) };
}

export function calculateProjectionRange(estimatedMarketValue: number, annualChange: number) {
  if (estimatedMarketValue <= 0 || !Number.isFinite(annualChange) || annualChange === 0) {
    return { year1Estimate: 0, year3Estimate: 0, year5Estimate: 0 };
  }
  const rate = Math.max(-20, Math.min(40, annualChange)) / 100;
  return {
    year1Estimate: estimatedMarketValue * (1 + rate),
    year3Estimate: estimatedMarketValue * Math.pow(1 + rate, 3),
    year5Estimate: estimatedMarketValue * Math.pow(1 + rate, 5),
  };
}

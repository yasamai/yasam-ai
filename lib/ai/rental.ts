export function calculateCashflowMetrics(askingPrice: number, monthlyRent: number) {
  const annualRent = monthlyRent * 12;
  const grossYieldPct = askingPrice > 0 && annualRent > 0 ? (annualRent / askingPrice) * 100 : 0;
  const amortizationMonths = askingPrice > 0 && monthlyRent > 0 ? Math.round(askingPrice / monthlyRent) : 0;
  return { annualRent, grossYieldPct, amortizationMonths };
}

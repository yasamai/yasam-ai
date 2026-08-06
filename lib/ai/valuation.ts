export function calculateMarketValue(area: number, marketM2: number, askingPrice: number) {
  const estimatedMarketValue = area > 0 && marketM2 > 0 ? area * marketM2 : askingPrice;
  const askingM2 = area > 0 && askingPrice > 0 ? askingPrice / area : 0;
  const priceDifferencePct = estimatedMarketValue > 0 && askingPrice > 0
    ? ((askingPrice - estimatedMarketValue) / estimatedMarketValue) * 100
    : 0;

  return { askingM2, estimatedMarketValue, priceDifferencePct };
}

export function calculatePriceBands(estimatedMarketValue: number, askingPrice: number, riskScore = 50) {
  const riskDiscount = Math.min(0.12, Math.max(0, riskScore - 45) / 500);
  const anchor = estimatedMarketValue > 0 ? estimatedMarketValue : askingPrice;
  const lowValue = anchor * 0.92;
  const highValue = anchor * 1.08;
  const firstOffer = Math.min(askingPrice || anchor, anchor * (0.92 - riskDiscount));
  const targetPrice = Math.min(askingPrice || anchor, anchor * (0.96 - riskDiscount / 2));
  const maxPrice = Math.min(askingPrice || anchor, anchor * (1 - riskDiscount / 3));
  return { lowValue, highValue, firstOffer, targetPrice, maxPrice };
}

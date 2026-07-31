import type { MarketDataRecord, VerificationStatus } from "./types";

const headers = ["city","district","neighborhood","property_type","period_date","source_name","source_note","listing_count","sale_price_m2","rent_price_m2","annual_change_percent","confidence_score","liquidity_score","infrastructure_score","transport_score","verification_status"];

function numberValue(value: string | undefined) {
  const normalized = String(value ?? "").trim().replace(/\./g, "").replace(",", ".");
  const result = Number(normalized);
  return Number.isFinite(result) ? result : 0;
}

function splitCsvLine(line: string) {
  const delimiter = line.includes(";") ? ";" : ",";
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"' && line[i + 1] === '"') { current += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) { values.push(current.trim()); current = ""; }
    else current += char;
  }
  values.push(current.trim());
  return values;
}

export function parseMarketCsv(text: string): MarketDataRecord[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const inputHeaders = splitCsvLine(lines[0]).map((item) => item.toLowerCase());
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    const row = Object.fromEntries(inputHeaders.map((key, index) => [key, values[index] ?? ""]));
    const status = (["verified", "review", "rejected"].includes(row.verification_status) ? row.verification_status : "review") as VerificationStatus;
    return {
      city: row.city ?? "", district: row.district ?? "", neighborhood: row.neighborhood ?? "",
      propertyType: row.property_type || "Konut", periodDate: row.period_date || new Date().toISOString().slice(0, 10),
      sourceName: row.source_name ?? "", sourceNote: row.source_note ?? "",
      listingCount: numberValue(row.listing_count), salePriceM2: numberValue(row.sale_price_m2), rentPriceM2: numberValue(row.rent_price_m2),
      annualChangePercent: numberValue(row.annual_change_percent), confidenceScore: numberValue(row.confidence_score),
      liquidityScore: numberValue(row.liquidity_score), infrastructureScore: numberValue(row.infrastructure_score), transportScore: numberValue(row.transport_score),
      verificationStatus: status,
    };
  });
}

export function exportMarketCsv(records: MarketDataRecord[]) {
  const escape = (value: unknown) => { const raw = String(value ?? ""); return /[;"\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw; };
  const rows = records.map((r) => [r.city,r.district,r.neighborhood,r.propertyType,r.periodDate,r.sourceName,r.sourceNote,r.listingCount,r.salePriceM2,r.rentPriceM2,r.annualChangePercent,r.confidenceScore,r.liquidityScore,r.infrastructureScore,r.transportScore,r.verificationStatus].map(escape).join(";"));
  return `\uFEFF${headers.join(";")}\n${rows.join("\n")}`;
}

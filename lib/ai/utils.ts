export const clampScore = (value: number) => Math.round(Math.min(100, Math.max(0, value)));

export function parseNumeric(value: string | number | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^0-9.]/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

export function formatNumber(value: number) {
  return Math.round(value).toLocaleString("tr-TR");
}

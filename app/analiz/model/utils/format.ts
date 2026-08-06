export function formatMoney(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? new Intl.NumberFormat("tr-TR").format(Number(digits)) : "";
}

export function parseMoney(value: string | null | undefined) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

export function formatCurrency(value: string | null | undefined) {
  const number = parseMoney(value);
  return number ? new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(number) : "—";
}

export function parseNumeric(value: string | null | undefined) {
  const normalized = String(value ?? "").replace(/\./g, "").replace(",", ".").replace(/[^0-9.]/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

export function safeDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Tarih bilinmiyor";
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export function monthKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

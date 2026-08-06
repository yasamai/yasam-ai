import type { CloudRecord, MarketDataRow } from "../types";

export function normalizeLocationPart(value: string) {
  return value.trim().toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u")
    .replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function buildLocationKey(city: string, district: string, neighborhood: string) {
  return ["tr", city, district, neighborhood === "İlçe Geneli" ? "" : neighborhood]
    .map(normalizeLocationPart).filter(Boolean).join("/");
}

export function titleCaseLocation(value: string) {
  return value.split(/[-_ ]+/).filter(Boolean)
    .map((part) => part.charAt(0).toLocaleUpperCase("tr-TR") + part.slice(1)).join(" ");
}

export function locationFromMarketRow(row: MarketDataRow) {
  const payload = row.payload ?? {};
  if (payload.city || payload.district || payload.neighborhood) {
    return { city: payload.city ?? "", district: payload.district ?? "", neighborhood: payload.neighborhood || "İlçe Geneli" };
  }
  const parts = String(row.location_key ?? "").split(/[\/|>]+/).map((part) => part.trim()).filter(Boolean);
  const clean = parts[0]?.toLocaleLowerCase("tr-TR") === "tr" ? parts.slice(1) : parts;
  return {
    city: titleCaseLocation(clean[0] ?? ""),
    district: titleCaseLocation(clean[1] ?? ""),
    neighborhood: clean[2] ? titleCaseLocation(clean.slice(2).join(" ")) : "İlçe Geneli",
  };
}

export function locationText(item: CloudRecord) {
  return [item.city, item.district, item.neighborhood].filter(Boolean).join(" / ");
}

export function googleMapsUrl(item: CloudRecord) {
  const query = encodeURIComponent([item.neighborhood, item.district, item.city].filter(Boolean).join(" "));
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

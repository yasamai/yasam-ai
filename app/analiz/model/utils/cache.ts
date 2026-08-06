import type { LocationCacheEnvelope, TurkiyeApiListResponse, TurkiyeLocationOption } from "../types";

const LOCATION_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export function readLocationCache(key: string): LocationCacheEnvelope | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocationCacheEnvelope;
    if (!Array.isArray(parsed.data) || !parsed.savedAt) return null;
    if (Date.now() - parsed.savedAt > LOCATION_CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeLocationCache(key: string, data: TurkiyeLocationOption[], meta?: TurkiyeApiListResponse["meta"]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data, meta } satisfies LocationCacheEnvelope));
  } catch {
    // Tarayıcı depolaması kapalıysa sistem canlı servisle çalışmaya devam eder.
  }
}

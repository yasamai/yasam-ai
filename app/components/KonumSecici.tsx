"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  EMPTY_LOCATION,
  TURKIYE_ILLERI,
  type LocationOption,
  type LocationSelection,
} from "../../lib/turkiye-konumlari";

type ApiPayload = { data?: LocationOption[] };
type ScoreSet = { investment: number; rent: number; development: number; liquidity: number; risk: number; confidence: number };

function stableScore(text: string, salt: number, min = 45, max = 92) {
  let hash = 2166136261 + salt;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return min + (Math.abs(hash) % (max - min + 1));
}

function calculatePreview(location: LocationSelection): ScoreSet {
  const key = [location.province, location.district, location.neighborhood].filter(Boolean).join("/") || "Türkiye";
  return {
    investment: stableScore(key, 11),
    rent: stableScore(key, 23),
    development: stableScore(key, 37),
    liquidity: stableScore(key, 43),
    risk: stableScore(key, 59, 18, 62),
    confidence: location.neighborhood ? 82 : location.district ? 72 : location.province ? 62 : 45,
  };
}

function readCache(key: string): LocationOption[] | null {
  try {
    const value = window.localStorage.getItem(key);
    if (!value) return null;
    const parsed = JSON.parse(value) as { data?: LocationOption[]; expiresAt?: number };
    if (!parsed.data || (parsed.expiresAt && parsed.expiresAt < Date.now())) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeCache(key: string, data: LocationOption[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify({ data, expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 30 }));
  } catch {
    // Depolama kapalıysa uygulama canlı veriyle çalışmaya devam eder.
  }
}

export default function KonumSecici() {
  const router = useRouter();
  const [location, setLocation] = useState<LocationSelection>(EMPTY_LOCATION);
  const [districts, setDistricts] = useState<LocationOption[]>([]);
  const [neighborhoods, setNeighborhoods] = useState<LocationOption[]>([]);
  const [loading, setLoading] = useState<"district" | "neighborhood" | "">("");
  const [error, setError] = useState("");

  const provinces = useMemo(
    () => [...TURKIYE_ILLERI].sort((a, b) => a.name.localeCompare(b.name, "tr")),
    [],
  );
  const scores = useMemo(() => calculatePreview(location), [location]);

  useEffect(() => {
    if (!location.provinceId) return;
    let cancelled = false;
    const key = `yasam-ai:v42:districts:${location.provinceId}`;
    const cached = readCache(key);
    fetch(`https://api.turkiyeapi.dev/v2/districts?provinceId=${location.provinceId}&limit=1000&fields=id,name,provinceId&sort=name`, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("İlçe listesi alınamadı.");
        return response.json() as Promise<ApiPayload>;
      })
      .then((payload) => {
        if (cancelled) return;
        const rows = Array.isArray(payload.data) ? payload.data : [];
        if (!rows.length) throw new Error("İlçe listesi boş döndü.");
        setDistricts(rows);
        writeCache(key, rows);
      })
      .catch((fetchError: unknown) => {
        if (!cancelled && !cached) setError(fetchError instanceof Error ? fetchError.message : "Konum servisine ulaşılamadı.");
      })
      .finally(() => { if (!cancelled) setLoading(""); });
    return () => { cancelled = true; };
  }, [location.provinceId]);

  useEffect(() => {
    if (!location.districtId) return;
    let cancelled = false;
    const key = `yasam-ai:v42:neighborhoods:${location.districtId}`;
    const cached = readCache(key);
    fetch(`https://api.turkiyeapi.dev/v2/neighborhoods?districtId=${location.districtId}&limit=1000&fields=id,name,districtId&sort=name`, { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Mahalle listesi alınamadı.");
        return response.json() as Promise<ApiPayload>;
      })
      .then((payload) => {
        if (cancelled) return;
        const rows = Array.isArray(payload.data) ? payload.data : [];
        if (!rows.length) throw new Error("Mahalle listesi boş döndü.");
        setNeighborhoods(rows);
        writeCache(key, rows);
      })
      .catch((fetchError: unknown) => {
        if (!cancelled && !cached) setError(fetchError instanceof Error ? fetchError.message : "Mahalle servisine ulaşılamadı.");
      })
      .finally(() => { if (!cancelled) setLoading(""); });
    return () => { cancelled = true; };
  }, [location.districtId]);

  function selectProvince(value: string) {
    const provinceId = Number(value);
    const province = provinces.find((item) => item.id === provinceId);
    setLoading(provinceId ? "district" : "");
    setError("");
    setLocation({ ...EMPTY_LOCATION, provinceId, province: province?.name ?? "" });
    const cached = provinceId ? readCache(`yasam-ai:v42:districts:${provinceId}`) : null;
    setDistricts(cached ?? []);
    setNeighborhoods([]);
  }

  function selectDistrict(value: string) {
    const districtId = Number(value);
    const district = districts.find((item) => item.id === districtId);
    setLoading(districtId ? "neighborhood" : "");
    setError("");
    setLocation((current) => ({ ...current, districtId, district: district?.name ?? "", neighborhoodId: 0, neighborhood: "" }));
    const cached = districtId ? readCache(`yasam-ai:v42:neighborhoods:${districtId}`) : null;
    setNeighborhoods(cached ?? []);
  }

  function selectNeighborhood(value: string) {
    const neighborhoodId = Number(value);
    const neighborhood = neighborhoods.find((item) => item.id === neighborhoodId);
    setLocation((current) => ({ ...current, neighborhoodId, neighborhood: neighborhood?.name ?? "" }));
  }

  function startAnalysis() {
    if (!location.province || !location.district) {
      setError("Analize başlamak için il ve ilçe seçin.");
      return;
    }
    window.localStorage.setItem("yasam-ai:selected-location", JSON.stringify(location));
    const params = new URLSearchParams({ city: location.province, district: location.district });
    if (location.neighborhood) params.set("neighborhood", location.neighborhood);
    router.push(`/analiz?${params.toString()}`);
  }

  const selectedText = [location.province || "İl", location.district || "İlçe", location.neighborhood || "Mahalle"].join(" / ");
  const scoreRows = [
    ["Yatırım", scores.investment], ["Kira", scores.rent], ["Gelişim", scores.development],
    ["Likidite", scores.liquidity], ["Risk", scores.risk], ["Veri güveni", scores.confidence],
  ] as const;

  return (
    <section className="location-selector" id="turkiye-veri-motoru">
      <div className="location-selector__top">
        <div className="location-selector__heading">
          <span className="location-selector__eyebrow">Türkiye Veri Motoru V4.2</span>
          <h2>Analiz konumunu seçin</h2>
          <p>81 il, ilçe ve mahalle verilerini otomatik seçin; konumu doğrudan Yaşam AI analiz formuna aktarın.</p>
        </div>
        <span className="location-selector__coverage">81 / 81 il kapsamı</span>
      </div>

      <div className="location-selector__grid">
        <label className="location-selector__field">
          <span>İl</span>
          <select value={location.provinceId || ""} onChange={(event) => selectProvince(event.target.value)}>
            <option value="">İl seçin</option>
            {provinces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="location-selector__field">
          <span>İlçe</span>
          <select disabled={!location.provinceId || loading === "district"} value={location.districtId || ""} onChange={(event) => selectDistrict(event.target.value)}>
            <option value="">{loading === "district" ? "İlçeler yükleniyor..." : "İlçe seçin"}</option>
            {districts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="location-selector__field">
          <span>Mahalle</span>
          <select disabled={!location.districtId || loading === "neighborhood"} value={location.neighborhoodId || ""} onChange={(event) => selectNeighborhood(event.target.value)}>
            <option value="">{loading === "neighborhood" ? "Mahalleler yükleniyor..." : "Mahalle seçin (isteğe bağlı)"}</option>
            {neighborhoods.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      </div>

      {error ? <p className="location-selector__error">{error}</p> : null}

      <div className="location-selector__content">
        <div className="location-selector__summary">
          <span>Seçilen konum</span>
          <strong>{selectedText}</strong>
          <p>Seçiminiz analiz merkezindeki İl, İlçe ve Mahalle alanlarına otomatik aktarılır.</p>
          <button type="button" onClick={startAnalysis} disabled={!location.province || !location.district}>Bu konumu analiz et <b>→</b></button>
        </div>
        <div className="location-selector__scores">
          <div className="location-selector__score-title"><span>Konum ön görünümü</span><small>Gerçek piyasa verisi değildir</small></div>
          <div className="location-selector__score-grid">
            {scoreRows.map(([label, score]) => (
              <article key={label}><div><span>{label}</span><strong>{score}</strong></div><i><b style={{ width: `${score}%` }} /></i></article>
            ))}
          </div>
          <p>Bu göstergeler yalnızca arayüz ön izlemesidir; nihai skorlar doğrulanmış bölgesel veri ve taşınmaz bilgileriyle analiz merkezinde hesaplanır.</p>
        </div>
      </div>
    </section>
  );
}

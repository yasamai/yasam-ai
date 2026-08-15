"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";
import { buildDecisionPromptContext, calculateDecisionMetrics } from "../../lib/decision-engine";
import { calculateOfferStrategy } from "../../lib/report/offer-engine";
import { buildReportTrustProfile } from "../../lib/report/trust-profile";
import type { DecisionMetrics, RegionalMarketContext } from "../../lib/decision-engine";
import TurkiyeDataCenter from "../components/data-center/TurkiyeDataCenter";
import type { MarketDataRecord, VerificationStatus } from "../../lib/data-center/types";
import { TURKIYE_DATA_SEED, emptyScores, initialForm } from "./model/constants";
import type {
  CloudRecord,
  FormState,
  HistoryMode,
  MarketDataRow,
  RegionalDataRecord,
  ScoreMap,
  TurkiyeApiListResponse,
  TurkiyeLocationOption,
  ViewMode,
} from "./model/types";
import { readLocationCache, writeLocationCache } from "./model/utils/cache";
import {
  buildLocationKey,
  googleMapsUrl,
  locationFromMarketRow,
  locationText,
  normalizeLocationPart,
  titleCaseLocation,
} from "./model/utils/location";
import {
  average,
  decisionFromReport,
  decisionTone,
  extractText,
  scoreTone,
  scoresFromReport,
} from "./model/utils/report";
import {
  formatCurrency,
  formatMoney,
  monthKey,
  parseMoney,
  parseNumeric,
  safeDate,
} from "./model/utils/format";

export default function AnalysisPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("dashboard");
  const [dashboardMode, setDashboardMode] = useState<"personal" | "professional">("personal");
  const [aiCommand, setAiCommand] = useState("");
  const [aiCommandResult, setAiCommandResult] = useState("");
  const [aiCommandLoading, setAiCommandLoading] = useState(false);
  const [scenarioPrice, setScenarioPrice] = useState("");
  const [scenarioRent, setScenarioRent] = useState("");
  const [scenarioHorizon, setScenarioHorizon] = useState<"1" | "3" | "5">("3");
  const [memorySaved, setMemorySaved] = useState(false);
  const [userMemory, setUserMemory] = useState({
    investmentGoal: "Dengeli getiri",
    riskTolerance: "Orta",
    maxBuildingAge: "",
    minRentalYield: "",
  });
  const [historyMode, setHistoryMode] = useState<HistoryMode>("active");
  const [form, setForm] = useState<FormState>(initialForm);
  const [records, setRecords] = useState<CloudRecord[]>([]);
  const [report, setReport] = useState("");
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);
  const [comparisonIds, setComparisonIds] = useState<[string, string]>(["", ""]);
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisStage, setAnalysisStage] = useState("Hazırlanıyor...");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mapRecordId, setMapRecordId] = useState("");
  const [regionalData, setRegionalData] = useState<RegionalDataRecord[]>(TURKIYE_DATA_SEED);
  const [regionalSearch, setRegionalSearch] = useState("");
  const [regionalEditorId, setRegionalEditorId] = useState("");
  const [regionalLoading, setRegionalLoading] = useState(false);
  const [regionalSaving, setRegionalSaving] = useState(false);
  const [regionalError, setRegionalError] = useState("");
  const [regionalNotice, setRegionalNotice] = useState("");
  const [mapType, setMapType] = useState<"roadmap" | "satellite">("roadmap");

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const savedRaw = window.localStorage.getItem("yasam-ai:selected-location");
      const saved = savedRaw ? JSON.parse(savedRaw) as { province?: string; district?: string; neighborhood?: string } : null;
      const city = params.get("city") || saved?.province || "";
      const district = params.get("district") || saved?.district || "";
      const neighborhood = params.get("neighborhood") || saved?.neighborhood || "";
      if (!city && !district && !neighborhood) return;
      window.queueMicrotask(() => {
        setForm((current) => ({
          ...current,
          city: city || current.city,
          district: district || current.district,
          neighborhood: neighborhood || current.neighborhood,
        }));
        setView("new");
        setNotice(`${[city, district, neighborhood].filter(Boolean).join(" / ")} konumu ana sayfadan aktarıldı.`);
      });
      window.localStorage.removeItem("yasam-ai:selected-location");
    } catch {
      // Geçersiz yerel veri analiz ekranını durdurmaz.
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!loading) {
      const resetTimer = window.setTimeout(() => {
        setAnalysisProgress(0);
        setAnalysisStage("Hazırlanıyor...");
      }, 0);
      return () => window.clearTimeout(resetTimer);
    }

    const startedAt = Date.now();
    setAnalysisProgress(8);
    setAnalysisStage("Bilgiler kontrol ediliyor...");

    const timer = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      if (elapsed < 5) {
        setAnalysisProgress(18);
        setAnalysisStage("Taşınmaz verileri hazırlanıyor...");
      } else if (elapsed < 12) {
        setAnalysisProgress(38);
        setAnalysisStage("Piyasa ve karar skorları hesaplanıyor...");
      } else if (elapsed < 22) {
        setAnalysisProgress(58);
        setAnalysisStage("Yapay zekâ değerlendirmesi oluşturuluyor...");
      } else if (elapsed < 35) {
        setAnalysisProgress(76);
        setAnalysisStage("Rapor bölümleri yazılıyor...");
      } else if (elapsed < 50) {
        setAnalysisProgress(88);
        setAnalysisStage("Son kontroller yapılıyor, bitmek üzere...");
      } else {
        setAnalysisProgress(94);
        setAnalysisStage("Rapor kaydediliyor, lütfen birkaç saniye daha bekleyin...");
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [loading]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    try {
      const savedMemory = window.localStorage.getItem("yasam-ai:user-memory");
      if (savedMemory) {
        const parsed = JSON.parse(savedMemory) as Partial<typeof userMemory>;
        window.queueMicrotask(() => setUserMemory((current) => ({ ...current, ...parsed })));
      }
    } catch {
      // Kişisel tercih hafızası isteğe bağlıdır; geçersiz yerel veri ekranı durdurmaz.
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      if (!data.user) router.replace("/giris");
      else setUser(data.user);
      setAuthLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) router.replace("/giris");
      else setUser(session.user);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    if (user) {
      void loadHistory();
      void loadRegionalData();
    }
  // Fonksiyonlar bileşen içinde tanımlı; kullanıcı değiştiğinde veriler yeniden yüklenir.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function loadRegionalData() {
    setRegionalLoading(true);
    setRegionalError("");

    const { data, error: marketError } = await supabase
      .from("market_data")
      .select("*")
      .order("period_date", { ascending: false })
      .limit(5000);

    if (marketError) {
      setRegionalError(
        `Türkiye veri tabanı okunamadı: ${marketError.message}. market_data tablosunun kurulu ve erişilebilir olduğundan emin olun.`,
      );
      setRegionalData(TURKIYE_DATA_SEED);
    } else {
      const mapped: RegionalDataRecord[] = (data ?? []).map((row: MarketDataRow) => {
        const location = locationFromMarketRow(row);
        const payload = row.payload ?? {};
        return {
          id:
            row.id ??
            `${row.location_key ?? "konum"}-${row.property_type ?? "Konut"}-${row.period_date ?? "tarih"}`,
          databaseId: row.id,
          city: location.city,
          district: location.district,
          neighborhood: location.neighborhood,
          propertyType: row.property_type ?? "Konut",
          averageM2: Number(row.sale_price_m2 ?? 0),
          rentM2: Number(row.rent_price_m2 ?? 0),
          annualChange: Number(row.annual_change_percent ?? 0),
          liquidityScore: Number(payload.liquidityScore ?? 0),
          infrastructureScore: Number(payload.infrastructureScore ?? 0),
          transportScore: Number(payload.transportScore ?? 0),
          dataConfidence: Number(row.confidence_score ?? 0),
          sourceNote: String(payload.sourceNote ?? ""),
          updatedAt: String(row.updated_at ?? row.created_at ?? row.period_date ?? ""),
          source: String(row.source_name ?? "unknown"),
          sampleSize: Number(payload.sampleSize ?? row.listing_count ?? 0),
          periodDate: String(row.period_date ?? new Date().toISOString().slice(0, 10)),
          verificationStatus: (["verified", "review", "rejected"].includes(String(payload.verificationStatus))
            ? String(payload.verificationStatus)
            : "review") as VerificationStatus,
        };
      });

      setRegionalData(mapped.length ? mapped : TURKIYE_DATA_SEED);
    }

    setRegionalLoading(false);
  }

  async function saveRegionalRecord(record: RegionalDataRecord) {
    setRegionalSaving(true);
    setRegionalError("");
    setRegionalNotice("");

    const payload = {
      location_key: buildLocationKey(record.city, record.district, record.neighborhood),
      property_type: record.propertyType,
      period_date: record.periodDate || new Date().toISOString().slice(0, 10),
      sale_price_m2: record.averageM2 || null,
      rent_price_m2: record.rentM2 || null,
      listing_count: Math.max(0, record.sampleSize),
      annual_change_percent: record.annualChange || null,
      confidence_score: Math.max(0, Math.min(100, record.dataConfidence)),
      source_name: record.source.trim() || "manual_verified",
      payload: {
        city: record.city.trim(),
        district: record.district.trim(),
        neighborhood:
          record.neighborhood.trim() === "İlçe Geneli" ? null : record.neighborhood.trim(),
        liquidityScore: Math.max(0, Math.min(100, record.liquidityScore)),
        infrastructureScore: Math.max(0, Math.min(100, record.infrastructureScore)),
        transportScore: Math.max(0, Math.min(100, record.transportScore)),
        sourceNote: record.sourceNote,
        sampleSize: Math.max(0, record.sampleSize),
        verificationStatus: record.verificationStatus ?? "review",
      },
    };

    const query = record.databaseId
      ? supabase.from("market_data").update(payload).eq("id", record.databaseId)
      : supabase.from("market_data").insert(payload);

    const { error: saveError } = await query;

    if (saveError) {
      setRegionalError(`Veri kaydedilemedi: ${saveError.message}`);
    } else {
      setRegionalNotice("Türkiye veri kaydı mevcut location_key yapısıyla Supabase'e kaydedildi.");
      await loadRegionalData();
    }

    setRegionalSaving(false);
  }

  function createRegionalDraft() {
    const today = new Date().toISOString().slice(0, 10);
    const draft: RegionalDataRecord = {
      id: `draft-${Date.now()}`,
      city: "Adana",
      district: "Ceyhan",
      neighborhood: "İlçe Geneli",
      propertyType: "Konut",
      averageM2: 0,
      rentM2: 0,
      annualChange: 0,
      liquidityScore: 0,
      infrastructureScore: 0,
      transportScore: 0,
      dataConfidence: 0,
      sourceNote: "Kaynak adı, bağlantısı, yöntem, tarih ve örneklem açıklaması yazılmalıdır.",
      updatedAt: today,
      source: "manual_verified",
      sampleSize: 0,
      periodDate: today,
      verificationStatus: "review",
    };
    setRegionalData((current) => [draft, ...current.filter((item) => item.source !== "system")]);
    setRegionalEditorId(draft.id);
    setRegionalNotice("Yeni veri kaydı açıldı. Rakamları yalnızca doğrulanabilir kaynaktan girin.");
  }

  async function importRegionalCsv(file: File) {
    setRegionalSaving(true);
    setRegionalError("");
    setRegionalNotice("");

    try {
      const content = (await file.text()).replace(/^\uFEFF/, "");
      const lines = content.split(/\r?\n/).filter((line) => line.trim());
      if (lines.length < 2) throw new Error("CSV dosyasında başlık ve en az bir veri satırı olmalıdır.");

      const delimiter = lines[0].includes(";") ? ";" : ",";
      const parseLine = (line: string) => {
        const cells: string[] = [];
        let value = "";
        let quoted = false;
        for (let index = 0; index < line.length; index += 1) {
          const char = line[index];
          if (char === '"') {
            if (quoted && line[index + 1] === '"') {
              value += '"';
              index += 1;
            } else quoted = !quoted;
          } else if (char === delimiter && !quoted) {
            cells.push(value.trim());
            value = "";
          } else value += char;
        }
        cells.push(value.trim());
        return cells;
      };

      const headerAliases: Record<string, string> = {
        city: "city",
        il: "city",
        district: "district",
        ilce: "district",
        "ilçe": "district",
        neighborhood: "neighborhood",
        mahalle: "neighborhood",
        property_type: "property_type",
        tasinmaz_turu: "property_type",
        "taşınmaz_türü": "property_type",
        period_date: "period_date",
        veri_tarihi: "period_date",
        source_name: "source_name",
        source: "source_name",
        kaynak: "source_name",
        source_url: "source_url",
        kaynak_url: "source_url",
        listing_count: "listing_count",
        sample_size: "listing_count",
        orneklem: "listing_count",
        sale_price_m2: "sale_price_m2",
        average_price_m2: "sale_price_m2",
        satis_m2: "sale_price_m2",
        "satış_m2": "sale_price_m2",
        rent_price_m2: "rent_price_m2",
        average_rent_m2: "rent_price_m2",
        kira_m2: "rent_price_m2",
        annual_change_percent: "annual_change_percent",
        yillik_degisim: "annual_change_percent",
        "yıllık_değişim": "annual_change_percent",
        confidence_score: "confidence_score",
        confidence: "confidence_score",
        guven_puani: "confidence_score",
        "güven_puanı": "confidence_score",
        liquidity_score: "liquidity_score",
        infrastructure_score: "infrastructure_score",
        transport_score: "transport_score",
        methodology: "methodology",
        source_note: "source_note",
        kaynak_notu: "source_note",
      };
      const rawHeaders = parseLine(lines[0]).map((header) => header.trim().toLocaleLowerCase("tr-TR"));
      const headers = rawHeaders.map((header) => headerAliases[header] ?? header);
      const required = ["city", "district", "property_type", "period_date", "source_name"];
      const missing = required.filter((column) => !headers.includes(column));
      if (missing.length) throw new Error(`Eksik zorunlu sütunlar: ${missing.join(", ")}`);

      const toNumber = (value: string | undefined) => {
        const normalized = String(value ?? "").replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
        const number = Number(normalized);
        return Number.isFinite(number) ? number : 0;
      };

      const rows = lines.slice(1).map((line, rowIndex) => {
        const cells = parseLine(line);
        const row = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
        if (!row.city || !row.district || !row.property_type || !row.period_date || !row.source_name) {
          throw new Error(`${rowIndex + 2}. satırda zorunlu alan eksik.`);
        }
        const confidence = Math.max(0, Math.min(100, toNumber(row.confidence_score)));
        const sampleSize = Math.max(0, Math.round(toNumber(row.listing_count)));
        if (!row.source_note || sampleSize <= 0 || confidence <= 0) {
          throw new Error(`${rowIndex + 2}. satır için source_note, listing_count ve confidence_score zorunludur.`);
        }
        const neighborhood = row.neighborhood || "İlçe Geneli";
        return {
          location_key: buildLocationKey(row.city, row.district, neighborhood),
          property_type: row.property_type,
          period_date: row.period_date,
          source_name: row.source_name,
          listing_count: sampleSize,
          sale_price_m2: toNumber(row.sale_price_m2) || null,
          rent_price_m2: toNumber(row.rent_price_m2) || null,
          annual_change_percent: toNumber(row.annual_change_percent) || null,
          confidence_score: confidence,
          payload: {
            city: row.city,
            district: row.district,
            neighborhood: row.neighborhood || null,
            liquidityScore: Math.max(0, Math.min(100, toNumber(row.liquidity_score))),
            infrastructureScore: Math.max(0, Math.min(100, toNumber(row.infrastructure_score))),
            transportScore: Math.max(0, Math.min(100, toNumber(row.transport_score))),
            sourceNote: row.source_note,
            sourceUrl: row.source_url || "",
            methodology: row.methodology || "",
            sampleSize,
            verificationStatus: "verified",
          },
        };
      });

      const { error: importError } = await supabase.from("market_data").insert(rows);
      if (importError) throw importError;

      setRegionalNotice(`${rows.length} gerçek veri kaydı mevcut location_key yapısıyla Supabase'e aktarıldı.`);
      await loadRegionalData();
    } catch (csvError) {
      setRegionalError(csvError instanceof Error ? csvError.message : "CSV içe aktarma başarısız oldu.");
    } finally {
      setRegionalSaving(false);
    }
  }

  const v67MarketRecords = useMemo<MarketDataRecord[]>(() =>
    regionalData
      .filter((item) => item.source !== "system")
      .map((item) => ({
        id: item.databaseId ?? item.id,
        city: item.city,
        district: item.district,
        neighborhood: item.neighborhood || "İlçe Geneli",
        propertyType: item.propertyType,
        periodDate: item.periodDate,
        sourceName: item.source,
        sourceNote: item.sourceNote,
        listingCount: item.sampleSize,
        salePriceM2: item.averageM2,
        rentPriceM2: item.rentM2,
        annualChangePercent: item.annualChange,
        confidenceScore: item.dataConfidence,
        liquidityScore: item.liquidityScore,
        infrastructureScore: item.infrastructureScore,
        transportScore: item.transportScore,
        verificationStatus: item.verificationStatus ?? "review",
        updatedAt: item.updatedAt,
      })),
    [regionalData],
  );

  async function saveV67MarketRecord(record: MarketDataRecord) {
    await saveRegionalRecord({
      id: record.id ?? `draft-${Date.now()}`,
      databaseId: record.id,
      city: record.city,
      district: record.district,
      neighborhood: record.neighborhood || "İlçe Geneli",
      propertyType: record.propertyType,
      averageM2: record.salePriceM2,
      rentM2: record.rentPriceM2,
      annualChange: record.annualChangePercent,
      liquidityScore: record.liquidityScore,
      infrastructureScore: record.infrastructureScore,
      transportScore: record.transportScore,
      dataConfidence: record.confidenceScore,
      sourceNote: record.sourceNote ?? "",
      updatedAt: record.updatedAt ?? new Date().toISOString(),
      source: record.sourceName,
      sampleSize: record.listingCount,
      periodDate: record.periodDate,
      verificationStatus: record.verificationStatus,
    });
  }

  async function importV67MarketRecords(imported: MarketDataRecord[]) {
    if (!imported.length) {
      setRegionalError("CSV içinde doğrulamadan geçen kayıt bulunamadı.");
      return;
    }
    setRegionalSaving(true);
    setRegionalError("");
    setRegionalNotice("");
    const rows = imported.map((record) => ({
      location_key: buildLocationKey(record.city, record.district, record.neighborhood || "İlçe Geneli"),
      property_type: record.propertyType,
      period_date: record.periodDate,
      source_name: record.sourceName,
      listing_count: Math.max(0, Math.round(record.listingCount)),
      sale_price_m2: record.salePriceM2 || null,
      rent_price_m2: record.rentPriceM2 || null,
      annual_change_percent: record.annualChangePercent || null,
      confidence_score: Math.max(0, Math.min(100, record.confidenceScore)),
      payload: {
        city: record.city,
        district: record.district,
        neighborhood: record.neighborhood || null,
        liquidityScore: Math.max(0, Math.min(100, record.liquidityScore)),
        infrastructureScore: Math.max(0, Math.min(100, record.infrastructureScore)),
        transportScore: Math.max(0, Math.min(100, record.transportScore)),
        sourceNote: record.sourceNote ?? "",
        sampleSize: Math.max(0, Math.round(record.listingCount)),
        verificationStatus: record.verificationStatus,
      },
    }));
    const { error: importError } = await supabase.from("market_data").insert(rows);
    if (importError) setRegionalError(`CSV kayıtları yüklenemedi: ${importError.message}`);
    else {
      setRegionalNotice(`${rows.length} kayıt V67 Veri Merkezi üzerinden yüklendi.`);
      await loadRegionalData();
    }
    setRegionalSaving(false);
  }

  async function changeV67VerificationStatus(id: string, status: VerificationStatus) {
    const current = v67MarketRecords.find((item) => item.id === id);
    if (!current) return;
    await saveV67MarketRecord({ ...current, verificationStatus: status });
  }

  async function loadHistory() {
    if (!user) return;
    setHistoryLoading(true);
    setError("");

    const { data, error: historyError } = await supabase
      .from("analysis_reports")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(500);

    if (historyError) {
      setError(historyError.message);
    } else {
      const next = (data ?? []) as CloudRecord[];
      setRecords(next);
      if (!comparisonIds[0] && next.length >= 1) {
        setComparisonIds([next[0].id, next[1]?.id ?? ""]);
      }
    }

    setHistoryLoading(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;

    setLoading(true);
    setError("");
    setNotice("");
    setReport("");
    setActiveRecordId(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          prompt: `Sen Yaşam AI Bütünleşik Gayrimenkul Karar Ekosistemi'sin.

TAŞINMAZ
İl: ${form.city}
İlçe: ${form.district}
Mahalle: ${form.neighborhood}
Tür: ${form.propertyType}
Alan: ${form.area} m²
Talep fiyatı: ${form.askingPrice} TL
Aylık kira beklentisi: ${form.monthlyRent || "Belirtilmedi"} TL
Bina yaşı: ${form.buildingAge || "Belirtilmedi"}
Kat / toplam kat: ${form.floor || "Belirtilmedi"} / ${form.totalFloors || "Belirtilmedi"}
Tapu durumu: ${form.titleStatus || "Belirtilmedi"}
İmar durumu: ${form.zoningStatus || "Belirtilmedi"}
Ek bilgiler: ${form.notes || "Yok"}

${buildDecisionPromptContext(localMetrics)}

RAPOR ZORUNLU BAŞLIKLARI
1. Yönetici Özeti
2. Veri Güven Skoru: X/100
3. Yatırım Puanı: X/100
4. Fırsat Puanı: X/100
5. Risk Puanı: X/100
6. Likidite Puanı: X/100
7. Tahmini Değer Aralığı
8. Fiyat ve m² Analizi
9. Kira Getirisi ve Nakit Akışı
10. Konum ve Bölge Değerlendirmesi
11. Hukuki, İmar ve Teknik Kontrol Listesi
12. Güçlü Yönler
13. Kritik Riskler
14. Pazarlık Stratejisi
15. Önerilen İlk Teklif, Hedef Anlaşma ve Maksimum Fiyat
16. 5 Maddelik Eylem Planı
17. Nihai Karar: yalnızca AL, PAZARLIK YAP, BEKLE veya RİSKLİ

KURALLAR
- Gerçek zamanlı resmî veriye erişimin varmış gibi davranma.
- Verilmeyen bilgiyi uydurma.
- Bölge verisi yoksa bunu açıkça belirt.
- Türkçe, profesyonel ve anlaşılır yaz.
- Kesin ekspertiz, hukuk veya yatırım tavsiyesi verdiğini söyleme.
- Sayısal çıktıları önceki hesaplama motorundan gelen verilerle tutarlı kur.
- Eksik veri varsa veri güven skorunu düşür ve uyarıları açıkla.`,
        }),
      });

      const data: unknown = await response.json();
      if (!response.ok) throw new Error(extractText(data) || "AI raporu üretilemedi.");

      const text = extractText(data);
      if (!text) throw new Error("API yanıtı boş geldi.");

      const decision = decisionFromReport(text);
      setReport(text);

      const { data: inserted, error: saveError } = await supabase
        .from("analysis_reports")
        .insert({
          user_id: user.id,
          city: form.city.trim(),
          district: form.district.trim(),
          neighborhood: form.neighborhood.trim(),
          property_type: form.propertyType,
          area: form.area,
          asking_price: form.askingPrice,
          notes: form.notes.trim(),
          report: text,
          decision,
          is_favorite: false,
          is_archived: false,
        })
        .select("id")
        .single();

      if (saveError) throw saveError;

      setActiveRecordId(inserted?.id ?? null);
      setNotice("Rapor üretildi ve Yaşam AI bulut hafızasına kaydedildi.");
      await loadHistory();
      setView("reports");
      window.setTimeout(() => {
        document.getElementById("premium-report")?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "İşlem tamamlanamadı.");
    } finally {
      setLoading(false);
    }
  }

  function openRecord(item: CloudRecord) {
    setForm({
      city: item.city ?? "",
      district: item.district ?? "",
      neighborhood: item.neighborhood ?? "",
      propertyType: item.property_type ?? "Arsa",
      area: item.area ?? "",
      askingPrice: item.asking_price ?? "",
      monthlyRent: "",
      buildingAge: "",
      floor: "",
      totalFloors: "",
      titleStatus: "Kat mülkiyeti",
      zoningStatus: "",
      notes: item.notes ?? "",
    });
    setReport(item.report ?? "");
    setActiveRecordId(item.id);
    setNotice("Bulut raporu yeniden açıldı.");
    setError("");
    setView("reports");
    window.setTimeout(() => {
      document.getElementById("premium-report")?.scrollIntoView({ behavior: "smooth" });
    }, 80);
  }

  function reAnalyze(item: CloudRecord) {
    setForm({
      city: item.city ?? "",
      district: item.district ?? "",
      neighborhood: item.neighborhood ?? "",
      propertyType: item.property_type ?? "Arsa",
      area: item.area ?? "",
      askingPrice: item.asking_price ?? "",
      monthlyRent: "",
      buildingAge: "",
      floor: "",
      totalFloors: "",
      titleStatus: "Kat mülkiyeti",
      zoningStatus: "",
      notes: item.notes ?? "",
    });
    setReport("");
    setActiveRecordId(null);
    setView("new");
    setNotice("Bilgiler yeni analiz formuna aktarıldı.");
    window.setTimeout(() => {
      document.getElementById("analysis-form")?.scrollIntoView({ behavior: "smooth" });
    }, 60);
  }

  async function updateRecord(
    item: CloudRecord,
    changes: Partial<Pick<CloudRecord, "is_favorite" | "is_archived">>,
    successMessage: string,
  ) {
    if (!user) return;
    setError("");

    const { error: updateError } = await supabase
      .from("analysis_reports")
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq("id", item.id)
      .eq("user_id", user.id);

    if (updateError) setError(updateError.message);
    else {
      setNotice(successMessage);
      await loadHistory();
    }
  }

  async function deleteRecord(item: CloudRecord) {
    if (!user) return;
    if (!window.confirm("Bu rapor kalıcı olarak silinecek. İşlem geri alınamaz. Devam edilsin mi?")) {
      return;
    }

    const { error: deleteError } = await supabase
      .from("analysis_reports")
      .delete()
      .eq("id", item.id)
      .eq("user_id", user.id);

    if (deleteError) {
      setError(deleteError.message);
    } else {
      if (activeRecordId === item.id) {
        setReport("");
        setActiveRecordId(null);
      }
      setNotice("Rapor kalıcı olarak silindi.");
      await loadHistory();
    }
  }

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(report);
      setNotice("Rapor panoya kopyalandı.");
    } catch {
      setError("Rapor kopyalanamadı.");
    }
  }

  async function shareReport() {
    const title = `Yaşam AI Karar Raporu · ${form.city}/${form.district}`;
    try {
      if (navigator.share) await navigator.share({ title, text: report });
      else await copyReport();
    } catch (shareError) {
      if (shareError instanceof Error && shareError.name !== "AbortError") {
        setError("Rapor paylaşılırken bir sorun oluştu.");
      }
    }
  }

  function startNewAnalysis() {
    setForm(initialForm);
    setReport("");
    setActiveRecordId(null);
    setView("new");
    setNotice("");
    setError("");
  }


  function openPlatformModule(section: string, role?: string) {
    setView("ecosystem");
    const dispatchModule = () =>
      window.dispatchEvent(new CustomEvent("yasam-module-nav", { detail: { section, role } }));
    dispatchModule();
    window.setTimeout(dispatchModule, 80);
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/giris");
  }

  function saveUserMemory() {
    try {
      window.localStorage.setItem("yasam-ai:user-memory", JSON.stringify(userMemory));
      setMemorySaved(true);
      window.setTimeout(() => setMemorySaved(false), 2200);
    } catch {
      setError("Akıllı hafıza tercihleri bu tarayıcıda kaydedilemedi.");
    }
  }

  function extractMoneyFromReportText(value: string, label: string) {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = value.match(new RegExp(`${escapedLabel}\\s*:?\\s*₺?([0-9.]+)`, "i"));
    if (!match?.[1]) return 0;
    const numeric = Number(match[1].replace(/\./g, ""));
    return Number.isFinite(numeric) ? numeric : 0;
  }

  async function runAiCommand(record: CloudRecord | null, preset?: string) {
    const question = (preset ?? aiCommand).trim();
    if (!question) {
      setError("AI Karar Komutanı için bir soru yazın.");
      return;
    }
    if (!record) {
      setError("AI değerlendirmesi için önce aktif bir rapor oluşturun.");
      return;
    }

    setAiCommandLoading(true);
    setAiCommandResult("");
    setError("");
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `Sen Yaşam AI Karar Komutanı'sın. Aşağıdaki mevcut gayrimenkul raporunu değiştirmeden, yalnızca kullanıcının sorusuna kısa, sayısal ve açıklanabilir karar desteği ver. Verilmeyen bilgiyi uydurma. Resmî doğrulama yapılmış gibi davranma.

KULLANICI HAFIZASI
Yatırım amacı: ${userMemory.investmentGoal}
Risk toleransı: ${userMemory.riskTolerance}
Maksimum bina yaşı tercihi: ${userMemory.maxBuildingAge || "Belirtilmedi"}
Minimum kira getirisi tercihi: ${userMemory.minRentalYield || "Belirtilmedi"}

DOSYA
Konum: ${[record.city, record.district, record.neighborhood].filter(Boolean).join(" / ")}
Tür: ${record.property_type || "Belirtilmedi"}
Alan: ${record.area || "Belirtilmedi"}
Talep fiyatı: ${record.asking_price || "Belirtilmedi"}
Karar: ${record.decision || decisionFromReport(record.report || "")}

PORTFÖY BAĞLAMI
${activeRecords.slice(0, 8).map((item, index) => {
  const scores = scoresFromReport(item.report || "");
  return `${index + 1}. ${[item.city, item.district, item.neighborhood].filter(Boolean).join(" / ") || "Konum yok"} · ${item.property_type || "Tür yok"} · ${item.asking_price || "Fiyat yok"} · Karar: ${item.decision || decisionFromReport(item.report || "") || "—"} · Yatırım: ${scores.investment ?? "—"} · Fırsat: ${scores.opportunity ?? "—"} · Risk: ${scores.risk ?? "—"} · Güven: ${scores.trust ?? "—"}`;
}).join("\n")}

MEVCUT RAPOR
${record.report || "Rapor metni yok"}

SORU
${question}

Yanıtı MUTLAKA şu dört başlıkla ver:
NET KARAR: tek cümlelik sonuç
NEDEN: en önemli 3 gerekçeyi kısa maddeler halinde yaz
ÖNERİLEN AKSİYON: kullanıcının şimdi yapması gereken tek en doğru hareket
KRİTİK UYARI: kararı değiştirebilecek en önemli eksik veri veya risk; yoksa "Kritik uyarı yok" yaz.`,
        }),
      });
      const data: unknown = await response.json();
      if (!response.ok) throw new Error(extractText(data) || "AI komutu çalıştırılamadı.");
      setAiCommandResult(extractText(data) || "AI yanıtı boş geldi.");
    } catch (commandError) {
      setError(commandError instanceof Error ? commandError.message : "AI komutu çalıştırılamadı.");
    } finally {
      setAiCommandLoading(false);
    }
  }

  const activeRecords = useMemo(() => records.filter((item) => !item.is_archived), [records]);

  const selectedMapRecord = useMemo(
    () => activeRecords.find((item) => item.id === mapRecordId) ?? activeRecords[0] ?? null,
    [activeRecords, mapRecordId],
  );
  const archivedRecords = useMemo(() => records.filter((item) => item.is_archived), [records]);
  const favoriteRecords = useMemo(
    () => activeRecords.filter((item) => item.is_favorite),
    [activeRecords],
  );

  const currentMonth = new Date();
  const currentMonthKey = `${currentMonth.getFullYear()}-${String(
    currentMonth.getMonth() + 1,
  ).padStart(2, "0")}`;

  const thisMonthCount = useMemo(
    () => activeRecords.filter((item) => monthKey(item.created_at) === currentMonthKey).length,
    [activeRecords, currentMonthKey],
  );

  const avgScores = useMemo(() => {
    const all = activeRecords.map((item) => scoresFromReport(item.report ?? ""));
    return {
      trust: average(all.map((score) => score.trust)),
      investment: average(all.map((score) => score.investment)),
      opportunity: average(all.map((score) => score.opportunity)),
      risk: average(all.map((score) => score.risk)),
      liquidity: average(all.map((score) => score.liquidity)),
    };
  }, [activeRecords]);

  const decisionStats = useMemo(() => {
    const stats = { AL: 0, PAZARLIK: 0, BEKLE: 0, UZAK: 0, DIGER: 0 };
    activeRecords.forEach((item) => {
      const decision = (item.decision ?? "").toLocaleUpperCase("tr-TR");
      if (decision === "AL") stats.AL += 1;
      else if (decision.includes("PAZARLIK")) stats.PAZARLIK += 1;
      else if (decision.includes("BEKLE")) stats.BEKLE += 1;
      else if (decision.includes("UZAK")) stats.UZAK += 1;
      else stats.DIGER += 1;
    });
    return stats;
  }, [activeRecords]);

  const portfolioInsights = useMemo(() => {
    const scored = activeRecords.map((item) => scoresFromReport(item.report ?? ""));
    const strongOpportunities = scored.filter((score) => (score.opportunity ?? 0) >= 65).length;
    const highRiskFiles = scored.filter((score) => (score.risk ?? 0) >= 65).length;
    const lowTrustFiles = scored.filter((score) => (score.trust ?? 100) < 50).length;
    const actionableFiles = decisionStats.AL + decisionStats.PAZARLIK;

    const priority =
      highRiskFiles > 0
        ? `${highRiskFiles} dosyada yüksek risk var. Önce doğrulama ve risk kontrolü önerilir.`
        : lowTrustFiles > 0
          ? `${lowTrustFiles} dosyada veri güveni düşük. Eksik verileri tamamlamak en doğru sonraki adım.`
          : strongOpportunities > 0
            ? `${strongOpportunities} güçlü fırsat adayı var. Karşılaştırma ekranında önceliklendirebilirsiniz.`
            : activeRecords.length
              ? "Portföy dengeli görünüyor. Yeni analiz veya karşılaştırma ile karar kalitesini artırabilirsiniz."
              : "Henüz aktif rapor yok. İlk gayrimenkul analizinizi oluşturarak başlayın.";

    return {
      strongOpportunities,
      highRiskFiles,
      lowTrustFiles,
      actionableFiles,
      priority,
    };
  }, [activeRecords, decisionStats]);

  const priorityRecords = useMemo(() => {
    return activeRecords
      .map((item) => {
        const scores = scoresFromReport(item.report ?? "");
        const decision = (item.decision ?? "").toLocaleUpperCase("tr-TR");
        const decisionBoost = decision === "AL" ? 30 : decision.includes("PAZARLIK") ? 20 : decision.includes("BEKLE") ? 5 : 0;
        const opportunity = scores.opportunity ?? 0;
        const investment = scores.investment ?? 0;
        const trust = scores.trust ?? 0;
        const risk = scores.risk ?? 50;
        const priorityScore = decisionBoost + opportunity * 0.35 + investment * 0.25 + trust * 0.2 - risk * 0.2;
        return { item, scores, decision, priorityScore };
      })
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, 3);
  }, [activeRecords]);

  const professionalPortfolio = useMemo(() => {
    const enriched = activeRecords.map((item) => {
      const scores = scoresFromReport(item.report ?? "");
      const decision = (item.decision ?? decisionFromReport(item.report ?? "") ?? "BEKLE").toLocaleUpperCase("tr-TR");
      const trust = scores.trust ?? 0;
      const investment = scores.investment ?? 0;
      const opportunity = scores.opportunity ?? 0;
      const risk = scores.risk ?? 50;
      const liquidity = scores.liquidity ?? 0;
      const opportunityScore = opportunity * 0.42 + investment * 0.28 + trust * 0.18 + liquidity * 0.12 - risk * 0.22;
      const riskScore = risk * 0.55 + Math.max(0, 65 - trust) * 0.45;
      const needsVerification = trust < 65 || risk >= 65;
      return { item, scores, decision, trust, investment, opportunity, risk, liquidity, opportunityScore, riskScore, needsVerification };
    });

    const opportunityLeaders = [...enriched].sort((a, b) => b.opportunityScore - a.opportunityScore).slice(0, 3);
    const riskLeaders = [...enriched].sort((a, b) => b.riskScore - a.riskScore).slice(0, 3);
    const verificationQueue = enriched.filter((entry) => entry.needsVerification).sort((a, b) => a.trust - b.trust || b.risk - a.risk).slice(0, 4);
    const avgHealth = enriched.length
      ? Math.round(enriched.reduce((total, entry) => total + Math.max(0, Math.min(100, entry.investment * 0.34 + entry.opportunity * 0.24 + entry.trust * 0.24 + entry.liquidity * 0.10 + (100 - entry.risk) * 0.08)), 0) / enriched.length)
      : 0;
    const decisionReady = enriched.filter((entry) => (entry.decision === "AL" || entry.decision.includes("PAZARLIK")) && entry.trust >= 65 && entry.risk < 65).length;
    const criticalCount = enriched.filter((entry) => entry.risk >= 75 || entry.trust < 40).length;

    return { opportunityLeaders, riskLeaders, verificationQueue, avgHealth, decisionReady, criticalCount };
  }, [activeRecords]);

  const commandRecord = priorityRecords[0]?.item ?? activeRecords[0] ?? null;
  const commandScores = commandRecord ? scoresFromReport(commandRecord.report ?? "") : emptyScores;
  const commandDecision = commandRecord
    ? (commandRecord.decision || decisionFromReport(commandRecord.report ?? "") || "BEKLE").toLocaleUpperCase("tr-TR")
    : "—";

  const actionBuckets = useMemo(() => {
    const buckets = { immediate: [] as CloudRecord[], watch: [] as CloudRecord[], clear: [] as CloudRecord[] };
    activeRecords.forEach((item) => {
      const scores = scoresFromReport(item.report ?? "");
      const decision = (item.decision ?? decisionFromReport(item.report ?? "")).toLocaleUpperCase("tr-TR");
      if ((scores.risk ?? 0) >= 65 || (scores.trust ?? 100) < 50) buckets.immediate.push(item);
      else if (decision.includes("BEKLE") || (scores.risk ?? 0) >= 50 || (scores.trust ?? 100) < 65) buckets.watch.push(item);
      else buckets.clear.push(item);
    });
    return buckets;
  }, [activeRecords]);

  const commandReasons = useMemo(() => {
    if (!commandRecord) return ["Aktif rapor bulunmuyor."];
    const reasons: string[] = [];
    if ((commandScores.risk ?? 0) >= 65) reasons.push(`Risk puanı ${commandScores.risk}/100; doğrulama önceliği yüksek.`);
    if ((commandScores.trust ?? 100) < 50) reasons.push(`Veri güveni ${commandScores.trust}/100; eksik kanıtlar tamamlanmalı.`);
    if ((commandScores.opportunity ?? 0) >= 65) reasons.push(`Fırsat puanı ${commandScores.opportunity}/100; fiyat avantajı incelemeye değer.`);
    if ((commandScores.investment ?? 0) >= 65) reasons.push(`Yatırım puanı ${commandScores.investment}/100; dosya güçlü adaylar arasında.`);
    if (commandDecision.includes("PAZARLIK")) reasons.push("Mevcut karar pazarlık; teklif sınırı ve kanıtlar birlikte kontrol edilmeli.");
    if (commandDecision.includes("BEKLE")) reasons.push("Mevcut karar bekle; karar vermeden önce veri kalitesi artırılmalı.");
    return reasons.length ? reasons.slice(0, 4) : ["Rapor dengeli; yeni veri veya karşılaştırma karar kalitesini artırabilir."];
  }, [commandDecision, commandRecord, commandScores]);

  const negotiationSnapshot = useMemo(() => {
    if (!commandRecord) return { opening: 0, ceiling: 0 };
    const text = commandRecord.report ?? "";
    return {
      opening: extractMoneyFromReportText(text, "Başlangıç teklif önerisi"),
      ceiling: extractMoneyFromReportText(text, "üst teklif sınırı"),
    };
  }, [commandRecord]);

  const workflowSteps = useMemo(() => {
    const trust = commandScores.trust ?? 0;
    const decision = commandDecision;
    return [
      { label: "Analiz", status: commandRecord ? "Tamam" : "Bekliyor" },
      { label: "Emsal", status: trust >= 65 ? "Güçlü" : "Kontrol" },
      { label: "Doğrulama", status: trust >= 80 ? "Güçlü" : "Bekliyor" },
      { label: "Teklif", status: decision.includes("AL") || decision.includes("PAZARLIK") ? "Hazır" : "Bekliyor" },
      { label: "Karar", status: decision === "—" ? "Bekliyor" : decision },
    ];
  }, [commandDecision, commandRecord, commandScores.trust]);

  const recentSevenDayRecords = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return activeRecords.filter((item) => {
      const timestamp = new Date(item.updated_at || item.created_at || 0).getTime();
      return Number.isFinite(timestamp) && timestamp >= cutoff;
    });
  }, [activeRecords]);

  const commandRegionalData = useMemo(() => {
    if (!commandRecord) return null;
    const city = (commandRecord.city ?? "").toLocaleLowerCase("tr-TR");
    const district = (commandRecord.district ?? "").toLocaleLowerCase("tr-TR");
    const neighborhood = (commandRecord.neighborhood ?? "").toLocaleLowerCase("tr-TR");
    return regionalData
      .map((item) => {
        let score = 0;
        if (item.city.toLocaleLowerCase("tr-TR") === city) score += 40;
        if (item.district.toLocaleLowerCase("tr-TR") === district) score += 35;
        if (item.neighborhood.toLocaleLowerCase("tr-TR") === neighborhood) score += 25;
        return { item, score };
      })
      .sort((a, b) => b.score - a.score)[0]?.item ?? null;
  }, [commandRecord, regionalData]);

  const aiStructuredResult = useMemo(() => {
    const raw = aiCommandResult.trim();
    if (!raw) return null;
    const section = (label: string, nextLabels: string[]) => {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const next = nextLabels.map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
      const rx = new RegExp(`${escaped}\\s*:?\\s*([\\s\\S]*?)(?=\\n(?:${next})\\s*:|$)`, "i");
      return raw.match(rx)?.[1]?.trim() || "";
    };
    const net = section("NET KARAR", ["NEDEN", "ÖNERİLEN AKSİYON", "KRİTİK UYARI"]);
    const why = section("NEDEN", ["ÖNERİLEN AKSİYON", "KRİTİK UYARI"]);
    const action = section("ÖNERİLEN AKSİYON", ["KRİTİK UYARI"]);
    const warning = section("KRİTİK UYARI", []);
    return {
      net: net || raw.split(/\r?\n/).find(Boolean) || "AI değerlendirmesi hazır.",
      why: why || raw,
      action: action || "Raporun en kritik doğrulama adımını tamamlayın ve kararı yeniden kontrol edin.",
      warning: warning || ((commandScores.trust ?? 0) < 65 ? "Veri güveni güçlendirilmeden nihai karar vermeyin." : "Kritik uyarı yok."),
    };
  }, [aiCommandResult, commandScores.trust]);

  const decisionConfidence = useMemo(() => {
    const trust = commandScores.trust ?? 0;
    const risk = commandScores.risk ?? 50;
    const missing: string[] = [];
    if (!commandRecord) missing.push("aktif rapor");
    if (!commandRecord?.asking_price) missing.push("talep fiyatı");
    if (!commandRecord?.area) missing.push("alan");
    if (!commandRegionalData || (commandRegionalData.dataConfidence ?? 0) < 65) missing.push("güçlü bölgesel veri");
    if (trust < 65) missing.push("kanıt / doğrulama");
    const level = trust >= 78 && risk < 55 ? "Yüksek" : trust >= 55 && risk < 72 ? "Orta" : "Düşük";
    const tone = level === "Yüksek" ? "#148653" : level === "Orta" ? "#b07800" : "#b83c3c";
    return { level, tone, missing: Array.from(new Set(missing)).slice(0, 4) };
  }, [commandRecord, commandRegionalData, commandScores.risk, commandScores.trust]);

  const scenarioResult = useMemo(() => {
    const basePrice = commandRecord ? parseMoney(commandRecord.asking_price) : 0;
    const price = scenarioPrice.trim() ? parseMoney(scenarioPrice) : basePrice;
    const rent = scenarioRent.trim() ? parseMoney(scenarioRent) : 0;
    const priceAdvantage = basePrice > 0 && price > 0 ? (basePrice - price) / basePrice : 0;
    const grossYield = price > 0 && rent > 0 ? (rent * 12 / price) * 100 : 0;
    const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
    const investment = clamp((commandScores.investment ?? 50) + priceAdvantage * 38 + (grossYield ? (grossYield - 4.5) * 4 : 0));
    const opportunity = clamp((commandScores.opportunity ?? 50) + priceAdvantage * 52 + (grossYield ? (grossYield - 4.5) * 3 : 0));
    const risk = clamp((commandScores.risk ?? 50) - priceAdvantage * 22 + (grossYield > 0 && grossYield < 3 ? 8 : 0));
    const horizon = Number(scenarioHorizon);
    const annualRate = commandRegionalData && Number.isFinite(commandRegionalData.annualChange) && commandRegionalData.annualChange !== 0
      ? Math.max(-0.2, Math.min(0.4, commandRegionalData.annualChange / 100))
      : null;
    const projectedValue = annualRate != null && price > 0 ? price * Math.pow(1 + annualRate, horizon) : 0;
    return { basePrice, price, rent, grossYield, investment, opportunity, risk, horizon, annualRate, projectedValue };
  }, [commandRecord, commandRegionalData, commandScores.investment, commandScores.opportunity, commandScores.risk, scenarioHorizon, scenarioPrice, scenarioRent]);

  const visibleRecords = useMemo(() => {
    const source =
      historyMode === "archive"
        ? archivedRecords
        : historyMode === "favorites"
          ? favoriteRecords
          : activeRecords;

    const query = searchText.trim().toLocaleLowerCase("tr-TR");
    if (!query) return source;

    return source.filter((item) =>
      [
        item.city,
        item.district,
        item.neighborhood,
        item.property_type,
        item.decision,
        item.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("tr-TR")
        .includes(query),
    );
  }, [activeRecords, archivedRecords, favoriteRecords, historyMode, searchText]);

  const regionalMatch = useMemo(() => {
    const city = form.city.trim().toLocaleLowerCase("tr-TR");
    const district = form.district.trim().toLocaleLowerCase("tr-TR");
    const neighborhood = form.neighborhood.trim().toLocaleLowerCase("tr-TR");
    const propertyType = form.propertyType.trim().toLocaleLowerCase("tr-TR");

    return regionalData
      .filter((item) => item.averageM2 > 0)
      .map((item) => {
        let matchScore = 0;
        if (item.city.toLocaleLowerCase("tr-TR") === city) matchScore += 35;
        if (item.district.toLocaleLowerCase("tr-TR") === district) matchScore += 30;
        if (item.neighborhood.toLocaleLowerCase("tr-TR") === neighborhood) matchScore += 25;
        if (item.propertyType.toLocaleLowerCase("tr-TR") === propertyType) matchScore += 10;
        return { item, matchScore };
      })
      .sort((a, b) => b.matchScore - a.matchScore)[0]?.item ?? null;
  }, [form.city, form.district, form.neighborhood, form.propertyType, regionalData]);

  const localMetrics = useMemo<DecisionMetrics>(() => {
    const marketContext: RegionalMarketContext | null = regionalMatch
      ? {
          averageM2: regionalMatch.averageM2,
          rentM2: regionalMatch.rentM2,
          annualChange: regionalMatch.annualChange,
          liquidityScore: regionalMatch.liquidityScore,
          infrastructureScore: regionalMatch.infrastructureScore,
          transportScore: regionalMatch.transportScore,
          dataConfidence: regionalMatch.dataConfidence,
          propertyType: regionalMatch.propertyType,
        }
      : null;

    return calculateDecisionMetrics(form, marketContext);
  }, [form, regionalMatch]);

  const currentScores = useMemo(() => scoresFromReport(report), [report]);
  const currentDecision = useMemo(() => decisionFromReport(report), [report]);

  const comparisonA = useMemo(
    () => activeRecords.find((item) => item.id === comparisonIds[0]) ?? null,
    [activeRecords, comparisonIds],
  );
  const comparisonB = useMemo(
    () => activeRecords.find((item) => item.id === comparisonIds[1]) ?? null,
    [activeRecords, comparisonIds],
  );

  function escapePremiumPdfHtml(value: string) {
    const repairedValue = value
      .replace(/�l�e/gi, "İlçe")
      .replace(/�rneklemi/gi, "örneklemi")
      .replace(/piyasas�/gi, "piyasası")
      .replace(/do�rulama/gi, "doğrulama")
      .replace(/do�rulan/gi, "doğrulan")
      .replace(/g�ven/gi, "güven")
      .replace(/T�rkiye/gi, "Türkiye");
    return repairedValue
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function premiumReportToHtml(value: string) {
    const normalizedValue = (value || "Rapor metni bulunamadı.").replace(/17\s*ay/gi, "17 yıl");
    const lines = escapePremiumPdfHtml(normalizedValue).split(/\r?\n/);
    const output: string[] = [];
    let list: "ul" | "ol" | null = null;
    const closeList = () => {
      if (list) output.push(`</${list}>`);
      list = null;
    };

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) { closeList(); continue; }
      const heading = line.match(/^(#{1,3})\s+(.+)$/);
      if (heading) {
        closeList();
        output.push(`<h2>${heading[2]}</h2>`);
        continue;
      }
      const ordered = line.match(/^\d+[.)]\s+(.+)$/);
      if (ordered) {
        if (list !== "ol") { closeList(); list = "ol"; output.push("<ol>"); }
        output.push(`<li>${ordered[1]}</li>`);
        continue;
      }
      const unordered = line.match(/^[-•]\s+(.+)$/);
      if (unordered) {
        if (list !== "ul") { closeList(); list = "ul"; output.push("<ul>"); }
        output.push(`<li>${unordered[1]}</li>`);
        continue;
      }
      closeList();
      output.push(`<p>${line.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")}</p>`);
    }
    closeList();
    return output.join("");
  }

  const PREMIUM_REPORT_VERSION = "Premium Karar Motoru v2.5";

  function stableReportCode(seed: string) {
    let hash = 2166136261;
    for (let index = 0; index < seed.length; index += 1) {
      hash ^= seed.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash >>> 0).toString(36).toUpperCase().padStart(7, "0").slice(0, 7);
  }

  async function openCurrentPremiumPdf() {
    if (!report) return;
    const popup = window.open("", "_blank", "width=1180,height=900");
    if (!popup) {
      window.print();
      return;
    }

    const safeNumber = (value: string | number | null | undefined) => {
      const numeric = Number(String(value ?? "").replace(/[^0-9,.-]/g, "").replace(/\./g, "").replace(",", "."));
      return Number.isFinite(numeric) ? numeric : 0;
    };
    const location = [form.city, form.district, form.neighborhood].filter(Boolean).map(titleCaseLocation).join(" / ");
    const reportSeed = [form.city, form.district, form.neighborhood, form.propertyType, form.area, form.askingPrice, report].join("|");
    const reportNo = `YAI-${new Date().getFullYear()}-${stableReportCode(reportSeed)}`;
    const reportDateIso = new Date().toISOString();
    const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
    const verificationBaseUrl = configuredAppUrl || (window.location.hostname === "localhost" ? "https://yasam-ai.vercel.app" : window.location.origin);
    const verificationUrl = `${verificationBaseUrl}/dogrula/${encodeURIComponent(reportNo)}`;
    const askingPrice = safeNumber(form.askingPrice);
    const monthlyRent = safeNumber(form.monthlyRent);
    const area = safeNumber(form.area);
    const annualRent = monthlyRent * 12;
    const askingGrossYield = askingPrice > 0 && annualRent > 0 ? (annualRent / askingPrice) * 100 : 0;
    const askingAmortization = annualRent > 0 && askingPrice > 0 ? askingPrice / annualRent : 0;

    const hasRegionalReference = Boolean(regionalMatch && regionalMatch.averageM2 > 0 && regionalMatch.sampleSize > 0);
    const hasOfficialVerification = regionalMatch?.verificationStatus === "verified";
    const hasVerifiedComparableSales = false;
    const referenceValue = hasRegionalReference && area > 0 ? regionalMatch!.averageM2 * area : 0;
    const referenceRangeLow = referenceValue > 0 ? referenceValue * 0.95 : 0;
    const referenceRangeHigh = referenceValue > 0 ? referenceValue * 1.05 : 0;
    const referenceGrossYield = referenceValue > 0 && annualRent > 0 ? (annualRent / referenceValue) * 100 : 0;
    const referenceAmortization = referenceValue > 0 && annualRent > 0 ? referenceValue / annualRent : 0;

    const currentDecisionText = String(currentDecision || "BEKLE").toUpperCase();
    const hasCriticalVerificationGap = !hasOfficialVerification || !hasVerifiedComparableSales;
    const effectiveDecision = hasCriticalVerificationGap
      ? (currentDecisionText.includes("RİSK") ? "UZAK DUR" : "DOĞRULAMA BEKLİYOR")
      : currentDecisionText === "AL" || currentDecisionText === "KOŞULLU AL"
        ? "KOŞULLU AL"
        : currentDecisionText;
    const effectiveRiskScore = Math.max(50, currentScores.risk ?? 50);
    const effectiveOpportunityScore = hasVerifiedComparableSales
      ? (currentScores.opportunity ?? 0)
      : Math.min(currentScores.opportunity ?? 0, 64);

    const scoreLabel = (value: number | null) => {
      if (value == null) return "Veri yok";
      if (value >= 80) return "Çok güçlü";
      if (value >= 65) return "Güçlü";
      if (value >= 50) return "Orta";
      if (value >= 35) return "Zayıf";
      return "Kritik";
    };
    const riskLabel = (value: number | null) => {
      if (value == null) return "Veri yok";
      if (value <= 20) return "Çok düşük risk";
      if (value <= 35) return "Düşük risk";
      if (value <= 55) return "Orta risk";
      if (value <= 75) return "Yüksek risk";
      return "Kritik risk";
    };

    const confidenceCount = [form.city, form.district, form.neighborhood, form.propertyType, form.area, form.askingPrice, form.monthlyRent, form.titleStatus, form.zoningStatus, form.buildingAge].filter(Boolean).length;
    const confidenceTotal = 10;
    const rawTrustScore = currentScores.trust ?? 0;
    const trustScore = hasOfficialVerification && hasVerifiedComparableSales
      ? rawTrustScore
      : Math.min(rawTrustScore, 58);
    const sourceConfidence = regionalMatch?.dataConfidence ?? trustScore;
    const regionalSource = regionalMatch?.sourceNote || regionalMatch?.source || "Doğrulanmış bölgesel veri bulunamadı";
    const sourceDate = regionalMatch?.updatedAt ? safeDate(regionalMatch.updatedAt) : "—";

    const hasGrowthData = Boolean(regionalMatch && regionalMatch.sampleSize > 0 && Number.isFinite(regionalMatch.annualChange) && regionalMatch.annualChange !== 0);
    const baseAnnualRate = hasGrowthData ? Math.max(-0.2, Math.min(0.4, regionalMatch!.annualChange / 100)) : null;
    const scenarioRows = baseAnnualRate == null || referenceValue <= 0
      ? []
      : [
          ["Temkinli", Math.max(-0.25, baseAnnualRate - 0.08)],
          ["Baz", baseAnnualRate],
          ["Olumlu", Math.min(0.45, baseAnnualRate + 0.08)],
        ].map(([name, rate]) => {
          const numericRate = Number(rate);
          return [name, referenceValue * Math.pow(1 + numericRate, 1), referenceValue * Math.pow(1 + numericRate, 3), referenceValue * Math.pow(1 + numericRate, 5), numericRate];
        });

    const decisionSummary = effectiveDecision === "DOĞRULAMA BEKLİYOR"
      ? "Talep fiyatı ile ilan tabanlı matematiksel referans arasında olağan dışı fark bulunmaktadır. Alan niteliği, tapu, imar, teknik durum ve en az üç benzer gerçekleşmiş satış doğrulanmadan alım kararı verilmemelidir."
      : effectiveDecision === "KOŞULLU AL"
        ? "Bölgesel referans ve doğrulanmış emsaller fiyat avantajını desteklemektedir. Yine de tapu, imar ve teknik kontroller tamamlanmadan işlem sonuçlandırılmamalıdır."
      : effectiveDecision.includes("PAZARLIK")
        ? "Taşınmaz yalnızca güvenli teklif aralığında ve doğrulamalar tamamlandıktan sonra değerlendirilebilir."
        : effectiveDecision === "BEKLE"
          ? "Karar için veri yeterli değildir. Piyasa, hukuki ve teknik doğrulamalar tamamlanana kadar beklenmelidir."
          : "Mevcut bilgiler risk-getiri dengesini desteklememektedir; doğrulama yapılmadan işlem önerilmez.";

    const neighborhoodExactMatch = Boolean(
      regionalMatch &&
      form.neighborhood.trim() &&
      regionalMatch.neighborhood.trim().toLocaleLowerCase("tr-TR") === form.neighborhood.trim().toLocaleLowerCase("tr-TR")
    );
    const dataScopeLabel = neighborhoodExactMatch
      ? "Mahalle bazlı kayıt"
      : regionalMatch
        ? regionalMatch.neighborhood === "İlçe Geneli"
          ? "İlçe geneli referans"
          : "Yakın bölge referansı"
        : "Bölgesel veri yok";
    const offerStrategy = calculateOfferStrategy({
      askingPrice,
      referenceValue,
      trustScore,
      riskScore: effectiveRiskScore,
      liquidityScore: currentScores.liquidity,
      hasOfficialVerification,
      hasVerifiedComparableSales,
      neighborhoodExactMatch,
      rentalYield: askingGrossYield,
    });
    const safeOffer = offerStrategy.openingOffer;
    const maxOffer = offerStrategy.upperLimit;
    const fiveYearBase = scenarioRows.length ? Number(scenarioRows[1][3]) : 0;
    const reportDate = new Intl.DateTimeFormat("tr-TR", { dateStyle: "long", timeStyle: "short" }).format(new Date(reportDateIso));
    const negotiationPotential = offerStrategy.negotiationScore;
    const valueScore = referenceValue > 0 && askingPrice > 0 ? Math.max(0, Math.min(100, Math.round((referenceValue / askingPrice) * 50))) : 0;
    const rentScore = askingGrossYield > 0 ? Math.max(0, Math.min(100, Math.round(askingGrossYield * 12))) : 0;
    const trustClass = trustScore >= 80 ? "A" : trustScore >= 65 ? "B" : trustScore >= 50 ? "C" : trustScore >= 35 ? "D" : "E";
    const decisionTone = effectiveDecision.includes("UZAK") ? "danger" : effectiveDecision.includes("BEKLE") || effectiveDecision.includes("DOĞRULAMA") ? "warning" : effectiveDecision.includes("PAZARLIK") ? "accent" : "success";
    let trustProfile = buildReportTrustProfile({
      verificationSaved: false,
      hasOfficialVerification,
      hasVerifiedComparableSales,
      trustScore,
      dataScope: dataScopeLabel,
    });
    const radarValues = [currentScores.investment ?? 0, 100 - effectiveRiskScore, currentScores.liquidity ?? 0, rentScore, trustScore, valueScore];
    const radarPoints = radarValues.map((value, index) => {
      const angle = (-90 + index * 60) * Math.PI / 180;
      const radius = 72 * (Math.max(0, Math.min(100, Number(value))) / 100);
      return `${110 + Math.cos(angle) * radius},${110 + Math.sin(angle) * radius}`;
    }).join(" ");

    let verificationSaved = false;
    let verificationSaveMessage = "";
    if (!user) {
      verificationSaveMessage = "Doğrulama kaydı için oturum açılması gerekiyor.";
    } else {
      const { error: verificationSaveError } = await supabase
        .from("report_verifications")
        .upsert(
          {
            report_id: reportNo,
            user_id: user.id,
            report_date: reportDateIso,
            report_version: PREMIUM_REPORT_VERSION,
            verification_status: "active",
            location: location || null,
            property_type: form.propertyType || null,
            decision: effectiveDecision,
            updated_at: reportDateIso,
          },
          { onConflict: "report_id" },
        );

      if (verificationSaveError) verificationSaveMessage = verificationSaveError.message;
      else verificationSaved = true;
    }

    trustProfile = buildReportTrustProfile({
      verificationSaved,
      hasOfficialVerification,
      hasVerifiedComparableSales,
      trustScore,
      dataScope: dataScopeLabel,
    });

    const qrImageUrl = verificationSaved
      ? `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=12&data=${encodeURIComponent(verificationUrl)}`
      : "";

    const aiAnalysisHtml = `
      <h2>1. Veri Güven Skoru</h2>
      <p><strong>Puan:</strong> ${trustScore}/100 · ${scoreLabel(trustScore)}</p>
      <p>Form alanları ${confidenceCount}/${confidenceTotal} oranında doldurulmuştur. Bu oran veri girişinin tamamlanmasını gösterir; resmî doğrulama anlamına gelmez. Tapu, imar, teknik durum ve emsal satışlar yetkili kaynaklardan teyit edilmelidir.</p>
      <h2>2. Yatırım Görünümü</h2>
      <p><strong>Puan:</strong> ${currentScores.investment ?? "—"}/100 · ${scoreLabel(currentScores.investment)}</p>
      <p>Talep fiyatına göre kira getirisi ve amortisman görünümü hesaplanabilmektedir. Ancak yatırım kararı, yalnızca ilan tabanlı bölgesel m² referansına dayandırılamaz.</p>
      <h2>3. Fırsat Görünümü</h2>
      <p><strong>Puan:</strong> ${effectiveOpportunityScore}/100 · ${scoreLabel(effectiveOpportunityScore)}</p>
      <p>${hasRegionalReference ? "Talep fiyatı ile bölgesel ilan m² verisinden üretilen matematiksel referans arasında fark bulunmaktadır." : "Yeterli bölgesel fiyat referansı bulunmamaktadır."} Gerçekleşmiş satış ve en az üç karşılaştırılabilir emsal doğrulanmadığı için kesin indirim oranı veya kesin fırsat hükmü verilmemiştir.</p>
      <h2>4. Risk Görünümü</h2>
      <p><strong>Puan:</strong> ${effectiveRiskScore}/100 · ${riskLabel(effectiveRiskScore)}</p>
      <p>Tapu ve imar bilgileri kullanıcı beyanına dayalıdır. Teknik ekspertiz, takyidat kontrolü ve resmî belge teyidi tamamlanmadığından risk seviyesi ${riskLabel(effectiveRiskScore).toLocaleLowerCase("tr-TR")} olarak değerlendirilmiştir.</p>
      <h2>5. Likidite Görünümü</h2>
      <p><strong>Puan:</strong> ${currentScores.liquidity ?? "—"}/100 · ${scoreLabel(currentScores.liquidity)}</p>
      <p>Likidite puanı ön değerlendirmedir. Bölgedeki gerçek satış süresi, işlem adedi ve güncel talep verisi doğrulanmadan kesin satış süresi öngörülmez.</p>
      <h2>6. Değerleme Çerçevesi</h2>
      <p>${referenceValue > 0 ? `Bölgesel ilan m² verisine göre matematiksel referans aralığı ${formatCurrency(String(Math.round(referenceRangeLow)))} – ${formatCurrency(String(Math.round(referenceRangeHigh)))} olarak hesaplanmıştır.` : "Matematiksel bölgesel referans hesaplanamamıştır."} Bu değer resmî ekspertiz veya gerçekleşmiş satış değeri değildir.</p>
      <p><strong>Başlangıç teklif önerisi:</strong> ${safeOffer ? formatCurrency(String(Math.round(safeOffer))) : "—"}<br><strong>Mevcut verilere göre üst teklif sınırı:</strong> ${maxOffer ? formatCurrency(String(Math.round(maxOffer))) : "—"}</p><p><strong>Teklif yöntemi:</strong> ${escapePremiumPdfHtml(offerStrategy.explanation)}</p>
      <!--AI_PAGE_BREAK-->
      <h2>7. Güçlü Yönler</h2>
      <ul><li>Form bilgilerinin büyük ölçüde tamamlanmış olması</li><li>Talep fiyatına göre ölçülebilir kira nakit akışı</li><li>Karar öncesi doğrulama adımlarının açık biçimde tanımlanması</li></ul>
      <h2>8. Kritik Riskler</h2>
      <ul><li>En az üç gerçek ve karşılaştırılabilir emsal bulunmaması</li><li>Tapu, imar ve takyidatın resmî kaynaktan teyit edilmemesi</li><li>Teknik yapı ve bakım durumunun uzman tarafından incelenmemesi</li><li>Bölgesel satış süresi ve işlem adedi verisinin sınırlı olması</li></ul>
      <h2>9. Nihai Karar</h2>
      <p><strong>Karar: ${effectiveDecision}</strong></p><p>${decisionSummary}</p>
      <h2>10. Eylem Planı</h2>
      <ol><li>Tapu, takyidat ve imar belgelerini resmî kaynaktan doğrula.</li><li>En az üç güncel ve karşılaştırılabilir emsal topla.</li><li>Teknik ekspertiz ve yapı incelemesi yaptır.</li><li>Kira sözleşmesi ve gelir sürekliliğini kontrol et.</li><li>Doğrulama sonuçlarına göre güvenli teklif sınırını yeniden hesapla.</li></ol>`;

    const [aiAnalysisMainHtml, aiAnalysisFinalHtml] = aiAnalysisHtml.split("<!--AI_PAGE_BREAK-->");

    popup.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${reportNo} · Yaşam AI</title>
<style>
@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0;font-family:Inter,"Segoe UI",Arial,sans-serif;color:#17324d;background:#eef3f8;-webkit-print-color-adjust:exact;print-color-adjust:exact}.sheet{width:210mm;height:297mm;margin:14px auto;background:#fff;box-shadow:0 14px 45px rgba(12,45,77,.18);overflow:hidden}.cover{height:297mm;padding:24mm 20mm;background:linear-gradient(145deg,#071d35,#0b477d 62%,#0876c9);color:#fff;position:relative;overflow:hidden}.cover:after{content:"";position:absolute;width:92mm;height:92mm;border:1px solid rgba(255,255,255,.20);border-radius:50%;right:-11mm;top:18mm}.brand{font-family:Georgia,"Times New Roman",serif;font-size:38px;font-weight:800}.gold{color:#f0c66f}.kicker{font-size:11px;font-weight:800;letter-spacing:2px;opacity:.82}.trust-seal{position:absolute;right:9mm;top:26mm;width:72mm;height:72mm;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;z-index:2;padding:5mm}.shield{display:grid;place-items:center;width:55px;height:62px;background:linear-gradient(145deg,#f7dc91,#d2a94f);color:#082b4c;font-weight:1000;font-size:31px;filter:drop-shadow(0 7px 14px rgba(0,0,0,.22));clip-path:polygon(50% 0,92% 16%,85% 70%,50% 100%,15% 70%,8% 16%)}.trust-seal small{display:block;margin-top:4.5mm;font-family:Georgia,"Times New Roman",serif;font-size:12.5px;line-height:1.35;color:#f5d98f;font-weight:800;max-width:62mm;text-shadow:0 2px 8px rgba(0,0,0,.28)}.cover h1{font-family:Georgia,"Times New Roman",serif;font-size:50px;line-height:1.08;margin:76mm 0 5mm;max-width:118mm}.cover-grid{position:absolute;left:20mm;right:20mm;bottom:22mm;display:grid;grid-template-columns:1fr 1fr;gap:10px}.cover-grid div{padding:14px;border:1px solid rgba(255,255,255,.25);border-radius:12px;background:rgba(255,255,255,.09)}.content{height:297mm;padding:14mm 16mm}.title{font-family:Georgia,"Times New Roman",serif;font-size:25px;color:#092f55;margin:0 0 7mm;padding:0 0 4mm 12px;border-left:6px solid #d2a94f;border-bottom:2px solid #d8b45e}.summary{display:grid;grid-template-columns:1.5fr .8fr;gap:12px;margin-bottom:8mm}.card{border:1px solid #dbe6ef;border-radius:14px;padding:15px;background:#f9fbfd;break-inside:avoid}.decision{background:linear-gradient(135deg,#092d50,#0876c9);color:#fff}.decision strong{display:block;font-family:Georgia,"Times New Roman",serif;font-size:34px;margin:8px 0}.decision p{font-size:13.5px;line-height:1.5}.meta-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-bottom:8mm}.label{font-size:9.5px;font-weight:900;letter-spacing:.8px;color:#71869a}.value{font-size:15px;font-weight:800;margin-top:5px}.scores{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:8mm}.score{text-align:center;border:1px solid #dbe6ef;border-top:4px solid #d2a94f;border-radius:12px;padding:11px;background:#fff}.score b{display:block;font-family:Georgia,"Times New Roman",serif;font-size:27px;color:#0876c9;margin:5px 0}.score em{display:block;font-size:9px;color:#5f7487;font-style:normal;font-weight:800}.badge{display:inline-flex;padding:5px 9px;border-radius:999px;background:#e7f5ee;color:#177153;font-size:10px;font-weight:900}.table{width:100%;border-collapse:collapse;font-size:11.5px}.table th,.table td{padding:8px;border-bottom:1px solid #dbe6ef;text-align:left;vertical-align:top}.table th{background:#eef5fb;color:#0a3f70;font-size:9.5px;letter-spacing:.4px}.money{font-weight:900;color:#0a3f70}.two-col{display:grid;grid-template-columns:1fr 1fr;gap:10px}.three-col{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.metric strong{display:block;font-family:Georgia,"Times New Roman",serif;font-size:23px;color:#0876c9;margin-top:6px}.risk-critical{border-left:5px solid #c93545}.risk-medium{border-left:5px solid #d49b2f}.checklist{display:grid;grid-template-columns:1fr 1fr;gap:7px}.check{display:flex;gap:8px;align-items:flex-start;padding:8px;font-size:11px;border:1px solid #dbe6ef;border-radius:10px}.box{width:15px;height:15px;border:2px solid #0876c9;border-radius:3px;flex:0 0 auto}.report{font-family:Georgia,"Times New Roman",serif;font-size:12.4px;line-height:1.55;color:#263f56}.report h2{font-family:"Segoe UI",Arial,sans-serif;font-size:17px;color:#0a3f70;background:linear-gradient(90deg,#eef5fb,#fff);border-left:5px solid #d2a94f;border-bottom:1px solid #cbdbe8;padding:7px 10px;margin:12px 0 7px}.report p{margin:0 0 7px}.report ul,.report ol{margin:0 0 8px;padding-left:22px}.report li{margin-bottom:4px}.source-pill{display:inline-block;padding:4px 8px;border-radius:999px;background:#edf4fa;color:#355b7c;font-size:9px;font-weight:800;margin:2px}.review-notes{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:8mm}.note-box{min-height:27mm;border:1px dashed #a9bfd1;border-radius:12px;padding:10px;background:#fbfdff}.note-box.wide{grid-column:1/-1}.approval{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:10mm}.approval div{border-top:1px solid #9eb3c5;padding-top:5px;font-size:10px;color:#60788d}.notice{font-size:9.5px;line-height:1.5;color:#71869a;border-top:1px solid #dbe6ef;margin-top:8mm;padding-top:5mm}.toolbar{position:fixed;right:18px;top:18px;z-index:5;display:flex;gap:8px}.toolbar button{border:0;border-radius:10px;padding:12px 16px;font-weight:800;cursor:pointer}.primary{background:#0876c9;color:#fff}.secondary{background:#fff;color:#153a65}.verification-grid{display:grid;grid-template-columns:1fr 280px;gap:24px;align-items:center}.qr-box{text-align:center;padding:14px;border:1px solid #dbe7f3;border-radius:16px;background:#fff}.qr-box img{width:220px;height:220px;display:block;margin:0 auto 10px}.verify-link{word-break:break-all;color:#0756a5;font-weight:800}.verify-ok{color:#16794a}.verify-warn{color:#8a5a00}.visual-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:12px;margin-bottom:7mm}.radar-card{display:grid;grid-template-columns:230px 1fr;gap:12px;align-items:center}.radar-svg{width:220px;height:220px}.radar-axis{stroke:#c9d8e5;stroke-width:1;fill:none}.radar-shape{fill:rgba(8,118,201,.22);stroke:#0876c9;stroke-width:3}.radar-label{font-size:10px;font-weight:800;fill:#355b7c}.price-stack{display:grid;gap:10px}.price-row{display:grid;grid-template-columns:125px 1fr 110px;gap:8px;align-items:center}.price-track{height:12px;border-radius:999px;background:#e7eef5;overflow:hidden}.price-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,#0876c9,#d2a94f)}.decision-chain{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;align-items:center}.chain-item{padding:10px 5px;border:1px solid #dbe6ef;border-radius:12px;text-align:center;background:#fff;font-size:9px;font-weight:900}.chain-arrow{text-align:center;color:#d2a94f;font-size:18px}.trust-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.trust-card{padding:12px;border-radius:12px;border:1px solid #dbe6ef;background:#f9fbfd}.trust-grade{display:inline-grid;place-items:center;width:46px;height:46px;border-radius:50%;background:#092f55;color:#f0c66f;font-size:24px;font-weight:1000}.final-sheet{height:297mm;padding:20mm;background:linear-gradient(145deg,#061a30,#0a467c 70%,#0876c9);color:white;position:relative}.final-panel{margin-top:28mm;padding:18mm;border:1px solid rgba(255,255,255,.25);border-radius:26px;background:rgba(255,255,255,.08);text-align:center}.final-decision{font-family:Georgia,"Times New Roman",serif;font-size:44px;margin:7mm 0;color:#f5d98f}.final-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:12mm 0}.final-metric{padding:12px;border-radius:14px;background:rgba(255,255,255,.10)}.final-metric b{display:block;font-size:26px;margin-top:5px}.tone-danger{border-left:7px solid #c93545}.tone-warning{border-left:7px solid #d49b2f}.tone-accent{border-left:7px solid #d2a94f}.tone-success{border-left:7px solid #2b9b6f}.watermark{position:absolute;inset:auto 0 20mm;text-align:center;font-size:52px;font-weight:1000;letter-spacing:7px;color:rgba(255,255,255,.035);transform:rotate(-7deg);pointer-events:none}@media(max-width:760px){.visual-grid,.radar-card{grid-template-columns:1fr}.decision-chain{grid-template-columns:1fr}.verification-grid{grid-template-columns:1fr}}@media print{html,body{background:#fff}.sheet{margin:0;box-shadow:none;break-after:page;page-break-after:always}.sheet:last-child{break-after:auto;page-break-after:auto}.toolbar{display:none}} 
</style></head><body><div class="toolbar"><button class="secondary" onclick="window.close()">Kapat</button><button class="primary" onclick="window.print()">PDF Olarak Kaydet</button></div>
<section class="sheet cover"><div class="kicker">TÜRKİYE'NİN GAYRİMENKUL KARAR PLATFORMU</div><div class="brand">Yaşam <span class="gold">AI</span></div><div class="trust-seal"><div class="shield">✓</div><small>Doğrulama odaklı yapay zekâ destekli gayrimenkul karar motoru</small></div><h1>Premium<br>Gayrimenkul Karar<br>Motoru</h1><div class="cover-grid"><div><span class="kicker">RAPOR NUMARASI</span><br><strong>${reportNo}</strong></div><div><span class="kicker">KONUM</span><br><strong>${escapePremiumPdfHtml(location || "—")}</strong></div><div><span class="kicker">TAŞINMAZ</span><br><strong>${escapePremiumPdfHtml(form.propertyType || "—")}</strong></div><div><span class="kicker">TARİH</span><br><strong>${safeDate(new Date().toISOString())}</strong></div></div></section>
<section class="sheet"><div class="content"><h2 class="title">Yönetici Özeti</h2><div class="summary"><div class="card decision"><span class="kicker">YAŞAM AI NİHAİ KARARI</span><strong>${escapePremiumPdfHtml(effectiveDecision)}</strong><p>${escapePremiumPdfHtml(decisionSummary)}</p></div><div class="card"><div class="label">VERİ GÜVENİ</div><div style="margin:8px 0"><span class="badge">${trustScore}/100 · ${scoreLabel(trustScore)}</span></div><div class="label">FORM TAMAMLANMA DURUMU</div><div class="value">${confidenceCount}/${confidenceTotal}</div><div class="label" style="margin-top:12px">DOĞRULAMA DURUMU</div><div class="value">Resmî teyit bekliyor</div><div class="label" style="margin-top:12px">RAPOR NO</div><div class="value">${reportNo}</div></div></div><div class="meta-grid"><div class="card"><div class="label">KONUM</div><div class="value">${escapePremiumPdfHtml(location || "—")}</div></div><div class="card"><div class="label">TÜR</div><div class="value">${escapePremiumPdfHtml(form.propertyType || "—")}</div></div><div class="card"><div class="label">ALAN</div><div class="value">${escapePremiumPdfHtml(form.area || "—")} m²</div></div><div class="card"><div class="label">TALEP FİYATI</div><div class="value">${formatCurrency(form.askingPrice)}</div></div></div><h2 class="title">Karar Skorları</h2><div class="scores">${[["Veri Güveni",trustScore,scoreLabel(trustScore)],["Yatırım",currentScores.investment,scoreLabel(currentScores.investment)],["Fırsat",effectiveOpportunityScore,scoreLabel(effectiveOpportunityScore)],["Risk Seviyesi",effectiveRiskScore,riskLabel(effectiveRiskScore)],["Likidite",currentScores.liquidity,scoreLabel(currentScores.liquidity)]].map(([label,value,text])=>`<div class="score"><span class="label">${label}</span><b>${value ?? "—"}</b><small>/100</small><em>${text}</em></div>`).join("")}</div><h2 class="title">Değerleme ve Teklif Özeti</h2><table class="table"><tbody><tr><th>Matematiksel bölgesel referans</th><td class="money">${referenceValue ? `${formatCurrency(String(Math.round(referenceRangeLow)))} – ${formatCurrency(String(Math.round(referenceRangeHigh)))}` : "Veri yok"}</td><th>Referans niteliği</th><td>İlan m² verisi · resmî satış değil</td></tr><tr><th>Başlangıç teklif önerisi</th><td class="money">${safeOffer ? formatCurrency(String(Math.round(safeOffer))) : "—"}</td><th>Üst teklif sınırı</th><td class="money">${maxOffer ? formatCurrency(String(Math.round(maxOffer))) : "—"}</td></tr><tr><th>Pazarlık yaklaşımı</th><td>Doğrulama sonuçlarına göre</td><th>5 yıllık baz senaryo</th><td>${fiveYearBase ? formatCurrency(String(Math.round(fiveYearBase))) : "Yeterli büyüme verisi yok"}</td></tr></tbody></table></div></section>
<section class="sheet"><div class="content"><h2 class="title">Karar Görselleştirme Merkezi</h2><div class="visual-grid"><div class="card radar-card"><svg class="radar-svg" viewBox="0 0 220 220" aria-label="Karar güven radarı"><polygon class="radar-axis" points="110,30 179,70 179,150 110,190 41,150 41,70"/><polygon class="radar-axis" points="110,55 157,82 157,138 110,165 63,138 63,82"/><line class="radar-axis" x1="110" y1="110" x2="110" y2="30"/><line class="radar-axis" x1="110" y1="110" x2="179" y2="70"/><line class="radar-axis" x1="110" y1="110" x2="179" y2="150"/><line class="radar-axis" x1="110" y1="110" x2="110" y2="190"/><line class="radar-axis" x1="110" y1="110" x2="41" y2="150"/><line class="radar-axis" x1="110" y1="110" x2="41" y2="70"/><polygon class="radar-shape" points="${radarPoints}"/><text class="radar-label" x="110" y="18" text-anchor="middle">Yatırım</text><text class="radar-label" x="193" y="66">Risk Güvenliği</text><text class="radar-label" x="190" y="164">Likidite</text><text class="radar-label" x="110" y="210" text-anchor="middle">Kira</text><text class="radar-label" x="5" y="164">Veri Güveni</text><text class="radar-label" x="7" y="66">Değer</text></svg><div><div class="label">KARAR GÜVEN RADARI</div><div class="value">Altı boyutlu görünüm</div><p>Radar; yatırım, risk güvenliği, likidite, kira, veri güveni ve değerleme bileşenlerini aynı eksende gösterir.</p><div class="trust-grade">${trustClass}</div><strong style="margin-left:8px">${trustScore}/100 güven sınıfı</strong></div></div><div class="card"><div class="label">FİYAT KARŞILAŞTIRMASI</div><div class="price-stack"><div class="price-row"><span>Talep fiyatı</span><div class="price-track"><div class="price-fill" style="width:100%"></div></div><strong>${formatCurrency(String(Math.round(askingPrice)))}</strong></div><div class="price-row"><span>Başlangıç teklif önerisi</span><div class="price-track"><div class="price-fill" style="width:${askingPrice ? Math.min(100,(safeOffer/askingPrice)*100) : 0}%"></div></div><strong>${safeOffer ? formatCurrency(String(Math.round(safeOffer))) : "—"}</strong></div><div class="price-row"><span>Referans orta</span><div class="price-track"><div class="price-fill" style="width:${Math.min(100, askingPrice && referenceValue ? (referenceValue/Math.max(referenceValue,askingPrice))*100 : 0)}%"></div></div><strong>${referenceValue ? formatCurrency(String(Math.round(referenceValue))) : "—"}</strong></div></div><div class="notice"><strong>Metodoloji notu:</strong> Referans değer, ilan tabanlı m² verisinden üretilen matematiksel ön göstergedir; gerçekleşmiş satış veya resmî ekspertiz değildir.<br><strong>Veri kapsamı:</strong> ${escapePremiumPdfHtml(dataScopeLabel)}. ${neighborhoodExactMatch ? "Seçilen mahalleye doğrudan kayıt bulundu." : "Mahalleye özgü veri bulunmadığı için daha geniş bölge referansı kullanılmıştır; bu değer kesin mahalle fiyatı sayılmaz."}</div></div></div><h2 class="title">Karar Zinciri</h2><div class="decision-chain"><div class="chain-item">Veri Güveni<br>${trustScore}</div><div class="chain-arrow">→</div><div class="chain-item">Risk<br>${effectiveRiskScore}</div><div class="chain-arrow">→</div><div class="chain-item">Likidite<br>${currentScores.liquidity ?? "—"}</div><div class="chain-arrow">→</div><div class="chain-item">${escapePremiumPdfHtml(effectiveDecision)}</div></div><div class="card tone-${decisionTone}" style="margin-top:9mm"><div class="label">AI TASARIM MOTORU V1</div><div class="value">Önem sırasına göre dinamik vurgu</div><p>Bu sayfadaki karar rengi ve vurgu seviyesi, risk, veri güveni ve nihai karar bileşimine göre otomatik belirlenmiştir.</p></div></div></section>
<section class="sheet"><div class="content"><h2 class="title">Kira ve Amortisman Performansı</h2><div class="three-col"><div class="card metric"><div class="label">AYLIK KİRA</div><strong>${monthlyRent ? formatCurrency(String(monthlyRent)) : "—"}</strong></div><div class="card metric"><div class="label">YILLIK KİRA</div><strong>${annualRent ? formatCurrency(String(annualRent)) : "—"}</strong></div><div class="card metric"><div class="label">TALEP FİYATINA GÖRE GETİRİ</div><strong>${askingGrossYield ? `%${askingGrossYield.toFixed(2).replace(".", ",")}` : "—"}</strong></div><div class="card metric"><div class="label">TALEP FİYATINA GÖRE AMORTİSMAN</div><strong>${askingAmortization ? `${askingAmortization.toFixed(1).replace(".", ",")} yıl` : "—"}</strong></div><div class="card metric"><div class="label">REFERANSA GÖRE GETİRİ</div><strong>${referenceGrossYield ? `%${referenceGrossYield.toFixed(2).replace(".", ",")}` : "—"}</strong></div><div class="card metric"><div class="label">REFERANSA GÖRE AMORTİSMAN</div><strong>${referenceAmortization ? `${referenceAmortization.toFixed(1).replace(".", ",")} yıl` : "—"}</strong></div></div><h2 class="title" style="margin-top:10mm">1–3–5 Yıllık Senaryo Analizi</h2>${scenarioRows.length ? `<table class="table"><thead><tr><th>Senaryo</th><th>1 yıl</th><th>3 yıl</th><th>5 yıl</th><th>Yıllık varsayım</th></tr></thead><tbody>${scenarioRows.map(([name,y1,y3,y5,rate])=>`<tr><td><strong>${name}</strong></td><td>${formatCurrency(String(Math.round(Number(y1))))}</td><td>${formatCurrency(String(Math.round(Number(y3))))}</td><td>${formatCurrency(String(Math.round(Number(y5))))}</td><td>%${(Number(rate)*100).toFixed(1).replace(".",",")}</td></tr>`).join("")}</tbody></table>` : `<div class="card"><strong>Senaryo üretilemedi.</strong><p>Bölgesel yıllık değişim verisi yeterli veya doğrulanmış olmadığı için 1–3–5 yıllık nominal değer tahmini gösterilmemiştir.</p></div>`}<p style="font-size:9px;color:#71869a;margin-top:8px">Senaryolar garanti değildir; yalnızca veri yeterliyse hesaplanan karar desteğidir.</p><h2 class="title" style="margin-top:9mm">Veri Kaynakları</h2><table class="table"><thead><tr><th>Veri alanı</th><th>Kaynak</th><th>Durum</th><th>Güven</th></tr></thead><tbody><tr><td>Taşınmaz bilgileri</td><td>Kullanıcı beyanı</td><td>Girildi</td><td>${trustScore}/100</td></tr><tr><td>Bölgesel piyasa</td><td>${escapePremiumPdfHtml(regionalSource)}</td><td>${hasRegionalReference ? "Referans bulundu" : "Bekleniyor"}</td><td>${sourceConfidence}/100</td></tr><tr><td>Güncelleme</td><td>${escapePremiumPdfHtml(sourceDate)}</td><td>${regionalMatch ? "Kayıtlı" : "—"}</td><td>—</td></tr><tr><td>Resmî teyit</td><td>Yetkili kurum / uzman</td><td>Bekleniyor</td><td>—</td></tr></tbody></table></div></section>
<section class="sheet"><div class="content"><h2 class="title">Emsal ve Risk Doğrulaması</h2><table class="table"><thead><tr><th>Konum</th><th>Alan</th><th>Matematiksel referans</th><th>m² fiyatı</th><th>Kaynak</th><th>Durum</th></tr></thead><tbody>${hasRegionalReference ? `<tr><td>${escapePremiumPdfHtml([regionalMatch!.city,regionalMatch!.district,regionalMatch!.neighborhood].filter(Boolean).join(" / "))}</td><td>${area ? `${form.area} m²` : "Referans m²"}</td><td>${referenceValue ? formatCurrency(String(Math.round(referenceValue))) : "—"}</td><td>${formatCurrency(String(regionalMatch!.averageM2))}</td><td>${escapePremiumPdfHtml(regionalMatch!.source || "Bölgesel ilan verisi")}</td><td>Ön referans · resmî satış değil</td></tr>` : `<tr><td colspan="6"><strong>Karşılaştırılabilir emsal bulunamadı.</strong><br>Gerçek veri gelmeden bu alan doldurulmaz.</td></tr>`}</tbody></table><p style="font-size:9px;color:#71869a">Bu tablo gerçekleşmiş satış veya resmî ekspertiz değildir. Nihai karar için en az üç güncel, benzer ve doğrulanabilir emsal gereklidir.</p><h2 class="title" style="margin-top:9mm">Risk Önceliklendirme</h2><div class="two-col"><div class="card risk-critical"><div class="label">KRİTİK RİSK</div><div class="value">Tapu, imar ve hukuki durum</div><p>Kullanıcı beyanı mevcut; resmî teyit gerekli.</p></div><div class="card risk-medium"><div class="label">ORTA RİSK</div><div class="value">Emsal ve piyasa doğrulaması</div><p>En az üç gerçek emsal henüz doğrulanmadı.</p></div><div class="card risk-medium"><div class="label">ORTA RİSK</div><div class="value">Teknik yapı ve bakım durumu</div><p>Uzman incelemesi yapılmadı.</p></div><div class="card risk-medium"><div class="label">ORTA RİSK</div><div class="value">Likidite görünümü</div><p>${currentScores.liquidity ?? "—"}/100 · gerçek satış süresi verisi sınırlı.</p></div></div><h2 class="title" style="margin-top:9mm">Karar İçin Zorunlu Doğrulamalar</h2><div class="checklist">${["Tapu kaydı ve takyidat kontrolü","İmar durumunun resmî kurumdan doğrulanması","Teknik ekspertiz ve yapı incelemesi","En az üç güncel emsal doğrulaması","Kira sözleşmesi ve gelir sürekliliği","Vergi, aidat ve yükümlülük kontrolü","Teklif limitinin doğrulama sonrası güncellenmesi","Hukuki danışman görüşü"].map(item=>`<div class="check"><span class="box"></span><span>${item}</span></div>`).join("")}</div></div></section>
<section class="sheet"><div class="content"><h2 class="title">Uzman Notları ve Onay Alanı</h2><div class="review-notes"><div class="note-box"><div class="label">EKSPERTİZ / TEKNİK NOT</div></div><div class="note-box"><div class="label">HUKUKİ / TAPU NOTU</div></div><div class="note-box wide"><div class="label">EMSAL DOĞRULAMA NOTU</div></div><div class="note-box wide" style="min-height:38mm"><div class="label">NİHAİ DEĞERLENDİRME VE KARAR NOTU</div></div></div><div class="approval"><div>İnceleyen / Uzman</div><div>Tarih / İmza</div></div><div class="notice"><strong>Kullanım notu:</strong> Bu sayfa, raporun uzman incelemesi sonrasında tamamlanması için ayrılmıştır. Boş bırakılan alanlar doğrulama yapılmadığını açıkça gösterir.</div></div></section>
<section class="sheet"><div class="content"><h2 class="title">Açıklanabilir AI Analizi</h2><div class="card report">${aiAnalysisMainHtml}</div></div></section>
<section class="sheet"><div class="content"><h2 class="title">Açıklanabilir AI Analizi · Sonuç ve Riskler</h2><div class="card report">${aiAnalysisFinalHtml}</div></div></section>
<section class="sheet final-sheet"><div class="watermark">YAŞAM AI RAPOR KAYDI</div><div class="kicker">YAŞAM AI · PREMIUM KARAR ÖZETİ</div><div class="brand">Yaşam <span class="gold">AI</span></div><div class="final-panel"><div class="kicker">NİHAİ KARAR</div><div class="final-decision">${escapePremiumPdfHtml(effectiveDecision)}</div><p>${escapePremiumPdfHtml(decisionSummary)}</p><div class="final-metrics"><div class="final-metric"><span>Güven</span><b>${trustScore}</b></div><div class="final-metric"><span>Yatırım</span><b>${currentScores.investment ?? "—"}</b></div><div class="final-metric"><span>Risk</span><b>${effectiveRiskScore}</b></div><div class="final-metric"><span>Likidite</span><b>${currentScores.liquidity ?? "—"}</b></div></div><div class="kicker">RAPOR KİMLİĞİ</div><strong>${reportNo}</strong><p style="margin-top:8mm">Bu sonuç bir ön değerlendirmedir. Resmî belgeler ve uzman doğrulamaları tamamlanmadan nihai işlem yapılmamalıdır.</p></div></section>
<section class="sheet"><div class="content"><h2 class="title">Dijital Doğrulama ve Sürüm İzi</h2><div class="verification-grid"><div class="card"><div class="label">RAPOR KİMLİĞİ</div><div class="value">${reportNo}</div><p>Bu kimlik aynı analiz verileriyle yeniden oluşturulduğunda sabit kalır.</p><div class="label">RAPOR SÜRÜMÜ</div><div class="value">${PREMIUM_REPORT_VERSION}</div><div class="label" style="margin-top:14px">RAPOR GÜVEN SEVİYESİ</div><div class="value">${escapePremiumPdfHtml(trustProfile.level)} · ${trustProfile.score}/100</div><p>${escapePremiumPdfHtml(trustProfile.explanation)}</p><div class="label" style="margin-top:14px">DOĞRULAMA DURUMU</div><div class="value ${verificationSaved ? "verify-ok" : "verify-warn"}">${verificationSaved ? "Dijital rapor kaydı oluşturuldu" : "Dijital rapor kaydı oluşturulamadı"}</div><p>${verificationSaved ? "QR kodu rapor kimliğini ve sürüm izini doğrular; taşınmaz verilerinin resmî olarak doğrulandığı anlamına gelmez." : escapePremiumPdfHtml(verificationSaveMessage || "Doğrulama servisine ulaşılamadı.")}</p><div class="label">DOĞRULAMA ADRESİ</div><a class="verify-link" href="${verificationUrl}" target="_blank" rel="noreferrer">${verificationUrl}</a></div>${verificationSaved ? `<div class="qr-box"><img src="${qrImageUrl}" alt="${reportNo} doğrulama QR kodu"><strong>Raporu doğrula</strong><p>${reportNo}</p></div>` : ""}</div><div class="notice"><strong>Önemli açıklama:</strong> Bu rapor yapay zekâ destekli bir ön değerlendirmedir; resmî ekspertiz, hukuki görüş, mühendislik incelemesi, kredi tahsis kararı veya yatırım danışmanlığı yerine geçmez. İşlem öncesinde tapu, imar, teknik durum, kira, emsal ve hukuki veriler yetkili kaynaklardan doğrulanmalıdır.<br><br><strong>Yaşam AI</strong> · Türkiye’nin Gayrimenkul Karar Platformu · ${reportNo} · ${PREMIUM_REPORT_VERSION} · ${reportDate}</div></div></section>
</body></html>`);
    popup.document.close();
  }


  if (authLoading) {
    return <main style={loadingPage}>Yaşam AI Veri Güven ve Doğrulama Merkezi güvenli şekilde yükleniyor...</main>;
  }

  return (
    <main style={pageStyle}>
      <style>{`
        * { box-sizing: border-box; }
        button, a { transition: transform .18s ease, opacity .18s ease; }
        button:hover, a:hover { transform: translateY(-1px); }
        button:disabled { cursor: wait; opacity: .7; }
        .membership-hero-final { min-height: 390px; animation: heroReveal .7s ease-out both; }
        .membership-stat-card { transition: transform .22s ease, box-shadow .22s ease, border-color .22s ease; }
        .membership-stat-card:hover { transform: translateY(-4px); box-shadow: 0 16px 34px rgba(31,64,97,.12) !important; border-color: #b9dcf7 !important; }
        .membership-proof-chip { transition: transform .2s ease, background .2s ease, border-color .2s ease; }
        .membership-proof-chip:hover { transform: translateY(-2px); background: rgba(255,255,255,.15) !important; border-color: rgba(255,255,255,.28) !important; }
        .membership-card { min-height: 590px; display: flex; flex-direction: column; isolation: isolate; }
        .membership-card > div:last-child { display: flex; flex-direction: column; flex: 1; }
        .membership-card .membership-feature-list { flex: 1; }
        .membership-card:hover { transform: translateY(-9px) scale(1.008) !important; }
        .membership-card-standard:hover { box-shadow: 0 28px 62px rgba(34,66,96,.16) !important; }
        .membership-card-premium { backdrop-filter: blur(22px) saturate(145%); -webkit-backdrop-filter: blur(22px) saturate(145%); }
        .membership-card-premium::before { content: ""; position: absolute; inset: 1px; border-radius: 23px; border: 1px solid rgba(255,255,255,.22); pointer-events: none; z-index: 0; }
        .membership-card-premium::after { content: ""; position: absolute; width: 190px; height: 720px; top: -80px; left: -260px; transform: rotate(22deg); background: linear-gradient(90deg,transparent,rgba(255,255,255,.22),transparent); animation: premiumSweep 6.8s ease-in-out infinite; pointer-events: none; z-index: 0; }
        .membership-card-gold::after { content: ""; position: absolute; width: 150px; height: 760px; top: -100px; left: -240px; transform: rotate(20deg); background: linear-gradient(90deg,transparent,rgba(255,220,126,.30),transparent); animation: goldSweep 5.8s ease-in-out infinite; pointer-events: none; z-index: 0; }
        .membership-card-gold { animation: goldPulse 4.6s ease-in-out infinite; }
        .membership-cta { transition: transform .2s ease, box-shadow .2s ease, filter .2s ease !important; }
        .membership-cta:hover { transform: translateY(-2px) !important; filter: brightness(1.04); }
        .membership-badge { animation: badgeBreath 3.5s ease-in-out infinite; }
        .membership-trust-card, .membership-enterprise-card { transition: transform .22s ease, box-shadow .22s ease, border-color .22s ease; }
        .membership-trust-card:hover { transform: translateY(-4px); box-shadow: 0 15px 30px rgba(31,64,97,.11) !important; border-color: #b9dcf7 !important; }
        .membership-enterprise-card:hover { transform: translateY(-4px); border-color: rgba(241,201,107,.42) !important; box-shadow: 0 12px 26px rgba(0,0,0,.16); }
        .enterprise-sector-card { transition: transform .22s ease, box-shadow .22s ease, border-color .22s ease, background .22s ease; }
        .enterprise-sector-card:hover { transform: translateY(-5px); box-shadow: 0 18px 38px rgba(17,56,91,.13) !important; border-color: #9fcdf1 !important; }
        .enterprise-action { transition: transform .2s ease, box-shadow .2s ease, filter .2s ease; }
        .enterprise-action:hover { transform: translateY(-2px); filter: brightness(1.03); }
        .enterprise-kpi { transition: transform .22s ease, box-shadow .22s ease; }
        .enterprise-kpi:hover { transform: translateY(-3px); box-shadow: 0 15px 30px rgba(17,56,91,.10) !important; }
        .command-hero-shell { isolation: isolate; }
        .command-hero-shell::before { content:""; position:absolute; inset:0; border-radius:inherit; pointer-events:none; background:linear-gradient(110deg,rgba(255,255,255,.10),transparent 28%,transparent 72%,rgba(94,210,255,.08)); opacity:.9; }
        .command-hero-shell::after { content:""; position:absolute; left:24px; right:24px; top:0; height:1px; background:linear-gradient(90deg,transparent,#70ddff 24%,#8da7ff 52%,#d38cff 78%,transparent); opacity:.9; pointer-events:none; }
        .hero-metric-premium { transition:transform .22s ease,border-color .22s ease,background .22s ease,box-shadow .22s ease; }
        .hero-metric-premium:hover { transform:translateY(-3px); border-color:rgba(145,221,255,.34)!important; background:rgba(5,40,82,.68)!important; box-shadow:0 12px 28px rgba(0,18,54,.22); }
        .quick-action-card { isolation:isolate; }
        .quick-action-card::after { content:""; position:absolute; width:150px; height:520px; left:-230px; top:-150px; transform:rotate(24deg); background:linear-gradient(90deg,transparent,rgba(255,255,255,.20),transparent); pointer-events:none; opacity:0; transition:left .55s ease,opacity .22s ease; z-index:0; }
        .quick-action-card:hover::after { left:118%; opacity:1; }
        .quick-action-card:hover { transform: translateY(-8px) scale(1.008) !important; filter: saturate(1.08) brightness(1.055); box-shadow: 0 30px 62px rgba(0,13,38,.38), inset 0 1px 0 rgba(255,255,255,.24) !important; }
        .quick-action-card:focus-visible { outline:3px solid rgba(255,255,255,.88); outline-offset:4px; }
        .quick-action-card:active { transform: translateY(-2px) scale(.992) !important; }
        .quick-action-icon { transition:transform .25s ease,box-shadow .25s ease; }
        .quick-action-card:hover .quick-action-icon { transform:translateY(-3px) scale(1.05) rotate(-1deg); }
        .quick-action-cta { transition:gap .22s ease,opacity .22s ease; }
        .quick-action-card:hover .quick-action-cta { gap:12px!important; }
        .quick-action-card > * { position:relative; z-index:1; }
        @keyframes commandGlow { 0%,100% { opacity:.55; transform:scale(.98); } 50% { opacity:.9; transform:scale(1.04); } }
        .command-orb { animation:commandGlow 4.8s ease-in-out infinite; }
        @media (max-width: 980px) { .quick-action-nav { grid-template-columns:1fr !important; } .quick-action-card { min-height:205px !important; } }
        @media (max-width: 760px) { .quick-action-card { min-height: 190px !important; } .command-priority { align-items:flex-start!important; } }
        @keyframes heroReveal { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes premiumSweep { 0%,58%{left:-260px;opacity:0} 66%{opacity:1} 86%{left:115%;opacity:.9} 100%{left:115%;opacity:0} }
        @keyframes goldSweep { 0%,52%{left:-240px;opacity:0} 62%{opacity:1} 86%{left:118%;opacity:.95} 100%{left:118%;opacity:0} }
        @keyframes goldPulse { 0%,100%{filter:drop-shadow(0 0 0 rgba(241,201,107,0))} 50%{filter:drop-shadow(0 0 12px rgba(241,201,107,.20))} }
        @keyframes badgeBreath { 0%,100%{opacity:.88} 50%{opacity:1} }
        @media (prefers-reduced-motion: reduce) { .membership-card, .membership-card::after, .membership-badge { animation: none !important; transition: none !important; } }
        @media (max-width: 720px) { .membership-hero-final { min-height: auto; } .membership-card { min-height: auto; } }
        @page { size: A4; margin: 10mm; }
        @media print {
          body * { visibility: hidden !important; }
          #premium-report, #premium-report * { visibility: visible !important; }
          #premium-report {
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            box-shadow: none !important;
            border: 0 !important;
            margin: 0 !important;
          }
          .no-print { display: none !important; }
          .print-cover { display: block !important; page-break-after: always; }
        }
      `}</style>

      <div style={{ maxWidth: 1260, margin: "0 auto" }}>
        <div style={premiumSignalBar}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <span className="command-orb" style={premiumSignalIcon}>✦</span>
            <div style={{ minWidth: 0 }}>
              <strong style={{ display: "block", fontSize: 11, letterSpacing: .75 }}>YAŞAM AI · CANLI KARAR ALTYAPISI</strong>
              <span style={{ display: "block", marginTop: 2, color: "rgba(235,247,255,.66)", fontSize: 9.5 }}>Veri, risk, fırsat ve doğrulama sinyalleri aynı akışta.</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <span style={signalPill}>● AI HAZIR</span>
            <span style={{ ...signalPill, color: "#ffd99a", borderColor: "rgba(255,195,91,.28)", background: "rgba(255,173,45,.08)" }}>{portfolioInsights.highRiskFiles} RİSK TAKİBİ</span>
          </div>
        </div>

        <header className="command-hero-shell" style={heroStyle}>
          <span className="command-orb" style={heroAmbientOrb} />
          <div style={{ flex: "1 1 720px", minWidth: 0, position: "relative", zIndex: 1 }}>
            <div style={versionBadge}><span style={{ fontSize: 13 }}>✦</span> YAŞAM AI · AKILLI GAYRİMENKUL KARAR SİSTEMİ</div>
            <h1 style={heroTitle}>Gayrimenkul kararını<br /><span style={heroTitleAccent}>tek ekranda netleştirin.</span></h1>
            <p style={heroText}>
              Analiz, karşılaştırma, risk, doğrulama ve pazarlık verilerini tek karar akışında birleştirin. Yaşam AI size yalnızca veri değil, <strong style={{ color: "#fff" }}>sıradaki en doğru hareketi</strong> gösterir.
            </p>

            <div className="command-priority" style={heroPriorityCard}>
              <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0, flex: "1 1 520px" }}>
                <span style={heroPriorityIcon}>AI</span>
                <div style={{ minWidth: 0 }}>
                  <small style={heroPriorityLabel}>ŞİMDİ NEYE ODAKLANMALI?</small>
                  <strong style={heroPriorityText}>{portfolioInsights.priority}</strong>
                </div>
              </div>
              <button type="button" onClick={() => setDashboardMode("professional")} style={heroPriorityButton}>Profesyonel Portföyü Aç <span>→</span></button>
            </div>

            <div style={heroMetricGrid}>
              <div className="hero-metric-premium" style={{ ...heroMetricCard, ...heroMetricAccentCyan }}>
                <span style={{ ...heroMetricIcon, background: "rgba(45,212,255,.14)", color: "#86efff" }}>▦</span>
                <div><small style={heroMetricLabel}>AKTİF RAPOR</small><strong style={heroMetricValue}>{activeRecords.length}</strong></div>
              </div>
              <div className="hero-metric-premium" style={{ ...heroMetricCard, ...heroMetricAccentViolet }}>
                <span style={{ ...heroMetricIcon, background: "rgba(167,139,250,.14)", color: "#c7b8ff" }}>↗</span>
                <div><small style={heroMetricLabel}>ORT. YATIRIM</small><strong style={heroMetricValue}>{avgScores.investment || 0}<em style={heroMetricSuffix}>/100</em></strong></div>
              </div>
              <div className="hero-metric-premium" style={{ ...heroMetricCard, ...heroMetricAccentGreen }}>
                <span style={{ ...heroMetricIcon, background: "rgba(52,211,153,.13)", color: "#8ef1c4" }}>◆</span>
                <div><small style={heroMetricLabel}>BU AY</small><strong style={heroMetricValue}>{thisMonthCount}</strong></div>
              </div>
              <div className="hero-metric-premium" style={{ ...heroMetricCard, ...heroMetricAccentAmber }}>
                <span style={{ ...heroMetricIcon, background: "rgba(251,191,36,.13)", color: "#ffd777" }}>!</span>
                <div><small style={heroMetricLabel}>RİSK TAKİBİ</small><strong style={heroMetricValue}>{portfolioInsights.highRiskFiles}</strong></div>
              </div>
            </div>
          </div>

          <div style={accountCard}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span style={accountStatusBadge}>● CANLI</span>
              <span style={{ color: "rgba(223,240,255,.48)", fontSize: 9, fontWeight: 900 }}>GÜVENLİ OTURUM</span>
            </div>
            <div style={accountTopRow}>
              <div style={accountAvatar}>{(user?.email || "Y").slice(0, 1).toUpperCase()}</div>
              <div style={{ minWidth: 0 }}>
                <small style={{ opacity: 0.58, fontWeight: 900, letterSpacing: 0.9 }}>AKTİF HESAP</small>
                <strong style={{ display: "block", overflowWrap: "anywhere", fontSize: 12.5, marginTop: 4 }}>{user?.email}</strong>
              </div>
            </div>
            <div style={accountCloudRow}><span>☁</span><span>Bulut hafızası ve rapor geçmişi senkronize</span></div>
            <button type="button" onClick={signOut} style={accountActionButton}>Oturumu Kapat</button>
          </div>
        </header>

        <div style={sectionHeadingRow}>
          <div>
            <div style={systemMenuLabel}>KARAR KISAYOLLARI</div>
            <div style={sectionSubtext}>Üç ana hareket. Daha az düşünme yükü, daha hızlı karar.</div>
          </div>
          <span style={smartReadyBadge}>✦ AI karar motoru hazır</span>
        </div>

        <nav className="quick-action-nav" style={{ ...navBar, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
          <NavButton active={view === "new"} onClick={startNewAnalysis}>+ Yeni Analiz</NavButton>
          <NavButton active={view === "reports"} onClick={() => setView("reports")}>Raporlarım</NavButton>
          <NavButton active={view === "compare"} onClick={() => setView("compare")}>AI Karşılaştırma</NavButton>
        </nav>

        <div style={{ marginTop: 14 }}>
          <div
            style={{
              ...systemMenuLabel,
              marginBottom: 8,
              opacity: 0.72,
            }}
          >
            DİĞER MODÜLLER
          </div>

          <nav
            aria-label="Yaşam AI modül menüsü"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
              gap: 7,
              alignItems: "stretch",
              padding: "10px",
              borderRadius: 16,
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.14)",
            }}
          >
            {[
              ["Ana Merkez", "⌂", "Kontrol Paneli", "command", "", "#0d5bd7"],
              ["AI Analiz", "✦", "Akıllı Analiz", "ai", "", "#7a35cf"],
              ["Türkiye", "◉", "81 İl Veri Motoru", "market", "", "#039bc1"],
              ["İlanlar", "⌂", "Türkiye Gayrimenkul Pazarı", "listings", "", "#ff6b35"],
              ["Banka", "▥", "Finans Merkezi", "enterprise", "bank", "#16a05d"],
              ["Projeler", "▰", "Proje Yönetimi", "enterprise", "developer", "#e89413"],
              ["Portföy", "◔", "Yatırım Portföyü", "enterprise", "investor", "#c42679"],
              ["Raporlar", "▥", "Rapor Merkezi", "pdf", "", "#008c98"],
              ["Üyelik", "♛", "Üyelik İşlemleri", "membership", "", "#c99100"],
              ["Yönetim", "⚙", "Sistem Yönetimi", "admin", "", "#40536f"],
            ].map(([label, icon, subtitle, sectionTarget, role, color]) => (
              <button
                key={label}
                type="button"
                onClick={() => openPlatformModule(sectionTarget, role || undefined)}
                style={{
                  minWidth: 0,
                  width: "100%",
                  minHeight: 82,
                  display: "grid",
                  gridTemplateColumns: "34px minmax(0,1fr)",
                  alignItems: "center",
                  gap: 7,
                  padding: "10px 8px",
                  borderRadius: 15,
                  border: `1px solid ${color}66`,
                  background: `linear-gradient(145deg,rgba(8,31,57,.96),rgba(10,52,88,.92))`,
                  color: "#eef8ff",
                  boxShadow: `0 9px 20px rgba(1,17,34,.20), inset 0 -3px 0 ${color}, inset 0 1px 0 rgba(255,255,255,.06)`,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "transform .18s ease, box-shadow .18s ease",
                  overflow: "hidden",
                  boxSizing: "border-box",
                }}
              >
                <span style={{ width: 36, height: 36, borderRadius: 11, display: "grid", placeItems: "center", background: `linear-gradient(145deg,${color}35,${color}14)`, border: `1px solid ${color}66`, color, fontSize: 19, fontWeight: 950, boxShadow: `0 7px 16px ${color}20` }}>{icon}</span>
                <span style={{ minWidth: 0, overflow: "hidden" }}>
                  <strong style={{ display: "block", fontSize: 12, lineHeight: 1.15, fontWeight: 950, whiteSpace: "normal", overflowWrap: "anywhere" }}>{label}</strong>
                  <small style={{ display: "block", marginTop: 4, color: "rgba(220,238,252,.62)", fontSize: 8, lineHeight: 1.15, fontWeight: 850, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{subtitle}</small>
                </span>
              </button>
            ))}
          </nav>
        </div>

        {view === "dashboard" ? (
          <div style={aiPriorityBar}>
            <div style={aiPriorityLeft}>
              <span style={aiPriorityIcon}>✦</span>
              <div>
                <small style={aiPriorityLabel}>AI ÖNCELİK ÖNERİSİ</small>
                <strong style={aiPriorityText}>{portfolioInsights.priority}</strong>
              </div>
            </div>
            <button type="button" style={aiPriorityButton} onClick={() => setDashboardMode("professional")}>Profesyonel Portföyü Aç →</button>
          </div>
        ) : null}

        {notice ? <div style={successNotice}>{notice}</div> : null}
        {error ? <div style={errorNotice}>{error}</div> : null}

        {view === "dashboard" ? (
          <>
            <section
              style={{
                ...panelStyle,
                padding: 14,
                background: "linear-gradient(145deg,rgba(255,255,255,.98),rgba(241,247,253,.98))",
              }}
            >
              <div style={{ ...sectionHeader, marginBottom: 10 }}>
                <div>
                  <div style={eyebrow}>ÇALIŞMA MODU</div>
                  <h2 style={{ ...sectionTitle, marginBottom: 0 }}>
                    {dashboardMode === "personal" ? "Benim Raporlarım" : "Profesyonel Portföy"}
                  </h2>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2,minmax(0,1fr))",
                    gap: 6,
                    padding: 5,
                    borderRadius: 14,
                    background: "#eaf2f9",
                    minWidth: 320,
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setDashboardMode("personal")}
                    style={{
                      ...smallButton,
                      padding: "10px 12px",
                      border: dashboardMode === "personal" ? "1px solid #0b5fa8" : "1px solid transparent",
                      background: dashboardMode === "personal" ? "#ffffff" : "transparent",
                      color: "#17324d",
                      boxShadow: dashboardMode === "personal" ? "0 5px 14px rgba(24,73,113,.10)" : "none",
                    }}
                  >
                    Benim Raporlarım
                  </button>
                  <button
                    type="button"
                    onClick={() => setDashboardMode("professional")}
                    style={{
                      ...smallButton,
                      padding: "10px 12px",
                      border: dashboardMode === "professional" ? "1px solid #7a35cf" : "1px solid transparent",
                      background: dashboardMode === "professional" ? "#ffffff" : "transparent",
                      color: "#17324d",
                      boxShadow: dashboardMode === "professional" ? "0 5px 14px rgba(92,43,155,.12)" : "none",
                    }}
                  >
                    Profesyonel Portföy
                  </button>
                </div>
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.55, color: "#60758a" }}>
                {dashboardMode === "personal"
                  ? "Kendi gayrimenkul kararlarınız için sade görünüm: raporlar, son analizler, karşılaştırma ve doğrulama tek yerde."
                  : "Yoğun portföy yönetimi için gelişmiş görünüm: öncelik, risk, fırsat, skor dağılımı ve konum zekâsı birlikte."}
              </div>
            </section>

            {dashboardMode === "personal" ? (
              <>
                <section style={statsGrid}>
                  <Stat title="Aktif Raporlarım" value={activeRecords.length} text="Bulutta saklanan kişisel karar dosyaları" />
                  <Stat title="Bu Ay" value={thisMonthCount} text="Bu ay oluşturduğum analiz" />
                  <Stat title="Favorilerim" value={favoriteRecords.length} text="Öncelik verdiğim raporlar" />
                  <Stat
                    title="Son Karar"
                    value={activeRecords[0]?.decision || (activeRecords[0]?.report ? decisionFromReport(activeRecords[0].report) : "—")}
                    text="En son oluşturulan raporun kararı"
                  />
                </section>

                <section style={panelStyle}>
                  <div style={sectionHeader}>
                    <div>
                      <div style={eyebrow}>BENİM RAPORLARIM</div>
                      <h2 style={sectionTitle}>Son Kararlarım</h2>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <button type="button" onClick={startNewAnalysis} style={softButton}>+ Yeni Analiz</button>
                      <button type="button" onClick={() => setView("compare")} style={softButton}>Karşılaştır</button>
                      <button type="button" onClick={() => setView("reports")} style={softButton}>Tüm Raporlarım</button>
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 10 }}>
                    {activeRecords.slice(0, 5).map((item) => (
                      <ReportRow
                        key={item.id}
                        item={item}
                        onOpen={() => openRecord(item)}
                        onMap={() => window.open(googleMapsUrl(item), "_blank", "noopener,noreferrer")}
                      />
                    ))}
                    {!activeRecords.length ? (
                      <div style={emptyState}>
                        Henüz raporunuz yok. İlk gayrimenkul analizinizi başlatmak için “+ Yeni Analiz” seçeneğini kullanın.
                      </div>
                    ) : null}
                  </div>
                </section>

                <section style={{ ...panelStyle, padding: 18 }}>
                  <div style={eyebrow}>KİŞİSEL KULLANIM</div>
                  <h2 style={{ ...sectionTitle, marginTop: 6, marginBottom: 14 }}>Karar Akışı</h2>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 8, alignItems: "stretch" }}>
                    {[
                      ["1", "Analiz Et", "Veriyi gir, AI karar raporunu oluştur.", "#0ea5e9"],
                      ["2", "Karşılaştır", "Alternatifleri aynı ölçekte kıyasla.", "#14b8a6"],
                      ["3", "Doğrula", "Kaynak, PDF ve QR kimliğini kontrol et.", "#8b5cf6"],
                      ["4", "Karar Ver", "Net aksiyonu ve pazarlık sınırını belirle.", "#f59e0b"],
                    ].map(([no,title,text,color], index) => (
                      <div key={title} style={{ position: "relative", padding: "13px 12px", borderRadius: 15, border: "1px solid #dce8f3", background: "linear-gradient(145deg,#fff,#f7fbff)", minHeight: 88 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ width: 27, height: 27, borderRadius: 9, display: "grid", placeItems: "center", background: `${color}18`, border: `1px solid ${color}55`, color, fontWeight: 950, fontSize: 11 }}>{no}</span>
                          <strong style={{ color: "#153a65", fontSize: 12 }}>{title}</strong>
                        </div>
                        <small style={{ display: "block", marginTop: 8, color: "#71869a", lineHeight: 1.45, fontSize: 9 }}>{text}</small>
                        {index < 3 ? <span style={{ position: "absolute", right: -10, top: "50%", transform: "translateY(-50%)", zIndex: 2, width: 20, height: 20, borderRadius: 999, display: "grid", placeItems: "center", background: "#eef5fb", border: "1px solid #d6e5f1", color: "#6f89a0", fontSize: 11 }}>→</span> : null}
                      </div>
                    ))}
                  </div>
                </section>
              </>
            ) : (
              <>
                <section style={statsGrid}>
                  <Stat title="Toplam Aktif Rapor" value={activeRecords.length} text="Bulutta saklanan karar dosyası" />
                  <Stat title="Bu Ay" value={thisMonthCount} text="Bu ay oluşturulan analiz" />
                  <Stat title="Favoriler" value={favoriteRecords.length} text="Öncelikli yatırım dosyası" />
                  <Stat
                    title="Ortalama Yatırım"
                    value={avgScores.investment ?? "—"}
                    suffix={avgScores.investment === null ? "" : "/100"}
                    text="Tüm aktif rapor ortalaması"
                  />
                </section>

                <section style={{ ...panelStyle, padding: 0, overflow: "hidden", border: "1px solid rgba(77,143,210,.28)", boxShadow: "0 20px 50px rgba(11,54,94,.16)" }}>
                  <div style={{ padding: 22, background: "linear-gradient(135deg,#061a31 0%,#0a4f91 58%,#5722a7 100%)", color: "#fff" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1.35fr .65fr", gap: 18, alignItems: "stretch" }}>
                      <div>
                        <div style={{ ...eyebrow, color: "#9fd0ff" }}>YÖNETİCİ KOMUTA ÖZETİ</div>
                        <h2 style={{ margin: "7px 0 8px", fontSize: 30, lineHeight: 1.08, letterSpacing: -0.7 }}>Portföyün Bugünkü Karar Haritası</h2>
                        <p style={{ margin: 0, maxWidth: 760, fontSize: 13, lineHeight: 1.65, color: "rgba(255,255,255,.84)" }}>
                          {professionalPortfolio.criticalCount > 0
                            ? `${professionalPortfolio.criticalCount} kritik dosya önce risk ve doğrulama kontrolü istiyor.`
                            : professionalPortfolio.verificationQueue.length > 0
                              ? `${professionalPortfolio.verificationQueue.length} dosyada karar güvenini artıracak doğrulama adımı bulunuyor.`
                              : professionalPortfolio.decisionReady > 0
                                ? `${professionalPortfolio.decisionReady} dosya karar vermeye yakın. En güçlü fırsatları karşılaştırabilirsiniz.`
                                : "Portföy dengeli. Yeni analiz ve karşılaştırma ile karar havuzunu güçlendirebilirsiniz."}
                        </p>

                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
                          <button type="button" onClick={() => professionalPortfolio.riskLeaders[0] && openRecord(professionalPortfolio.riskLeaders[0].item)} disabled={!professionalPortfolio.riskLeaders.length} style={{ ...softButton, background: "#fff", borderColor: "#fff", color: "#15324f", fontWeight: 950 }}>⚠ En Kritik Riski Aç</button>
                          <button type="button" onClick={() => setView("compare")} disabled={activeRecords.length < 2} style={{ ...softButton, background: "rgba(255,255,255,.12)", color: "#fff", borderColor: "rgba(255,255,255,.30)", fontWeight: 950 }}>✦ En İyi Fırsatları Karşılaştır</button>
                          <button type="button" onClick={() => { setView("reports"); setNotice("Doğrulama bekleyen dosyalar için rapor merkezi açıldı."); }} disabled={!professionalPortfolio.verificationQueue.length} style={{ ...softButton, background: "#f6d57f", borderColor: "#f6d57f", color: "#4b3507", fontWeight: 950 }}>✓ Doğrulama Kuyruğu</button>
                        </div>
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
                        {[
                          ["Portföy Sağlığı", professionalPortfolio.avgHealth, "/100", "◉"],
                          ["Karara Hazır", professionalPortfolio.decisionReady, " dosya", "✓"],
                          ["Kritik Alarm", professionalPortfolio.criticalCount, " dosya", "!"],
                          ["Doğrulama", professionalPortfolio.verificationQueue.length, " bekliyor", "◆"],
                        ].map(([label, value, suffix, icon]) => (
                          <div key={String(label)} style={{ padding: 13, borderRadius: 16, background: "rgba(255,255,255,.10)", border: "1px solid rgba(255,255,255,.15)" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                              <small style={{ fontSize: 9, fontWeight: 950, letterSpacing: .8, color: "rgba(255,255,255,.70)" }}>{label}</small>
                              <span style={{ width: 25, height: 25, borderRadius: 9, display: "grid", placeItems: "center", background: "rgba(255,255,255,.11)", fontWeight: 950 }}>{icon}</span>
                            </div>
                            <strong style={{ display: "block", marginTop: 8, fontSize: 22, lineHeight: 1 }}>{value}<small style={{ fontSize: 9, opacity: .72 }}>{suffix}</small></strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>

                <section style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 12 }}>
                  <article style={{ ...panelStyle, borderTop: "4px solid #18a56d" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div><div style={eyebrow}>FIRSAT LİDERLERİ</div><h3 style={{ margin: "5px 0 0", fontSize: 18 }}>En Güçlü 3 Aday</h3></div>
                      <span style={{ width: 38, height: 38, borderRadius: 13, display: "grid", placeItems: "center", background: "#e7f7ef", color: "#14895c", fontSize: 19, fontWeight: 950 }}>↗</span>
                    </div>
                    <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                      {professionalPortfolio.opportunityLeaders.map((entry, index) => (
                        <button key={entry.item.id} type="button" onClick={() => openRecord(entry.item)} style={{ ...softButton, padding: 11, textAlign: "left", width: "100%", background: index === 0 ? "#eefaf4" : "#f8fbfd" }}>
                          <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong>#{index + 1} {[entry.item.city, entry.item.district].filter(Boolean).join(" / ") || "Dosya"}</strong><b style={{ color: "#14895c" }}>{entry.opportunity}/100</b></span>
                          <small style={{ display: "block", marginTop: 4, color: "#708399" }}>Yatırım {entry.investment} · Güven {entry.trust} · Risk {entry.risk}</small>
                        </button>
                      ))}
                      {!professionalPortfolio.opportunityLeaders.length ? <div style={emptyState}>Aktif fırsat dosyası yok.</div> : null}
                    </div>
                  </article>

                  <article style={{ ...panelStyle, borderTop: "4px solid #e25555" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div><div style={eyebrow}>RİSK RADARI</div><h3 style={{ margin: "5px 0 0", fontSize: 18 }}>Önce Kontrol Edilecekler</h3></div>
                      <span style={{ width: 38, height: 38, borderRadius: 13, display: "grid", placeItems: "center", background: "#fff0f0", color: "#c83f3f", fontSize: 19, fontWeight: 950 }}>!</span>
                    </div>
                    <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                      {professionalPortfolio.riskLeaders.map((entry, index) => (
                        <button key={entry.item.id} type="button" onClick={() => openRecord(entry.item)} style={{ ...softButton, padding: 11, textAlign: "left", width: "100%", background: index === 0 ? "#fff4f4" : "#f8fbfd" }}>
                          <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong>#{index + 1} {[entry.item.city, entry.item.district].filter(Boolean).join(" / ") || "Dosya"}</strong><b style={{ color: "#c83f3f" }}>{entry.risk}/100</b></span>
                          <small style={{ display: "block", marginTop: 4, color: "#708399" }}>Veri güveni {entry.trust} · Karar {entry.decision || "—"}</small>
                        </button>
                      ))}
                      {!professionalPortfolio.riskLeaders.length ? <div style={emptyState}>Aktif risk dosyası yok.</div> : null}
                    </div>
                  </article>

                  <article style={{ ...panelStyle, borderTop: "4px solid #d3a22d" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div><div style={eyebrow}>DOĞRULAMA KUYRUĞU</div><h3 style={{ margin: "5px 0 0", fontSize: 18 }}>Eksik Kanıt Takibi</h3></div>
                      <span style={{ width: 38, height: 38, borderRadius: 13, display: "grid", placeItems: "center", background: "#fff8e5", color: "#9d7413", fontSize: 18, fontWeight: 950 }}>✓</span>
                    </div>
                    <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                      {professionalPortfolio.verificationQueue.map((entry) => (
                        <button key={entry.item.id} type="button" onClick={() => openRecord(entry.item)} style={{ ...softButton, padding: 11, textAlign: "left", width: "100%", background: "#fffdf6" }}>
                          <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong>{[entry.item.city, entry.item.district].filter(Boolean).join(" / ") || "Dosya"}</strong><b style={{ color: "#9d7413" }}>Güven {entry.trust}</b></span>
                          <small style={{ display: "block", marginTop: 4, color: "#708399" }}>{entry.trust < 50 ? "Kritik veri eksikliği" : entry.risk >= 65 ? "Risk doğrulaması gerekli" : "Karar öncesi teyit önerilir"}</small>
                        </button>
                      ))}
                      {!professionalPortfolio.verificationQueue.length ? <div style={{ ...emptyState, color: "#16794a" }}>✓ Açık doğrulama alarmı yok.</div> : null}
                    </div>
                  </article>
                </section>

                <section style={insightPanel}>
                  <div style={sectionHeader}>
                    <div>
                      <div style={eyebrow}>AKILLI PORTFÖY ÖZETİ</div>
                      <h2 style={sectionTitle}>Şimdi Neye Odaklanmalı?</h2>
                    </div>
                    <button type="button" onClick={() => setView("compare")} style={softButton}>
                      Karşılaştır
                    </button>
                  </div>

                  <div style={insightCallout}>{portfolioInsights.priority}</div>

                  <div style={insightGrid}>
                    <InsightCard label="Aksiyon Alınabilir" value={portfolioInsights.actionableFiles} text="AL veya pazarlık kararı bulunan dosya" icon="↗" />
                    <InsightCard label="Güçlü Fırsat" value={portfolioInsights.strongOpportunities} text="Fırsat puanı 65 ve üzeri rapor" icon="✦" />
                    <InsightCard label="Yüksek Risk" value={portfolioInsights.highRiskFiles} text="Risk puanı 65 ve üzeri dosya" icon="!" />
                    <InsightCard label="Düşük Veri Güveni" value={portfolioInsights.lowTrustFiles} text="Veri güveni 50 altında kalan rapor" icon="✓" />
                  </div>
                </section>

                <section style={{ ...panelStyle, padding: 0, overflow: "hidden" }}>
                  <div style={{ padding: 20, background: "linear-gradient(135deg,#071d35,#0b5fa8 68%,#7a35cf)", color: "white" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
                      <div style={{ maxWidth: 760 }}>
                        <div style={{ ...eyebrow, color: "#b9d9ff" }}>AI KARAR KOMUTANI</div>
                        <h2 style={{ margin: "7px 0 8px", fontSize: 28, lineHeight: 1.12 }}>Bugünkü En Önemli Hareket</h2>
                        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, opacity: .9 }}>
                          {commandRecord
                            ? portfolioInsights.priority
                            : "İlk raporunuzu oluşturun; Yaşam AI karar, kanıt ve aksiyon zincirini sizin için yönetsin."}
                        </p>
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button type="button" disabled={!commandRecord} onClick={() => commandRecord && openRecord(commandRecord)} style={{ ...softButton, background: "white" }}>İncele</button>
                        <button type="button" disabled={!commandRecord} onClick={() => setView("compare")} style={{ ...softButton, background: "white" }}>Karşılaştır</button>
                        <button type="button" disabled={!commandRecord} onClick={() => { setView("reports"); setNotice("Doğrulama için ilgili raporu açıp Premium PDF / QR alanını kullanın."); }} style={{ ...softButton, background: "#f4cc75", borderColor: "#f4cc75" }}>Doğrula</button>
                      </div>
                    </div>

                    {commandRecord ? (
                      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1.4fr .8fr", gap: 12 }}>
                        <div style={{ padding: 14, borderRadius: 16, background: "rgba(255,255,255,.10)", border: "1px solid rgba(255,255,255,.16)" }}>
                          <div style={{ fontSize: 11, fontWeight: 950, letterSpacing: 1.2, opacity: .72 }}>NEDEN BU KARAR?</div>
                          <strong style={{ display: "block", marginTop: 5, fontSize: 19 }}>{commandDecision}</strong>
                          <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
                            {commandReasons.map((reason) => <div key={reason} style={{ fontSize: 12, lineHeight: 1.45 }}>• {reason}</div>)}
                          </div>
                        </div>
                        <div style={{ padding: 14, borderRadius: 16, background: "rgba(255,255,255,.10)", border: "1px solid rgba(255,255,255,.16)" }}>
                          <div style={{ fontSize: 11, fontWeight: 950, letterSpacing: 1.2, opacity: .72 }}>AKTİF DOSYA</div>
                          <strong style={{ display: "block", marginTop: 5, fontSize: 16 }}>{[commandRecord.city, commandRecord.district, commandRecord.neighborhood].filter(Boolean).join(" / ") || "Konum yok"}</strong>
                          <small style={{ display: "block", marginTop: 6, lineHeight: 1.5, opacity: .82 }}>{commandRecord.property_type || "Taşınmaz"} · {commandRecord.area ? `${commandRecord.area} m²` : "Alan yok"} · {commandRecord.asking_price ? formatCurrency(String(commandRecord.asking_price)) : "Fiyat yok"}</small>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div style={{ padding: 18 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", gap: 8 }}>
                      {workflowSteps.map((step) => (
                        <div key={step.label} style={{ padding: 11, borderRadius: 13, background: "#f3f7fb", border: "1px solid #dbe7f3" }}>
                          <small style={{ display: "block", color: "#73879a", fontWeight: 900 }}>{step.label}</small>
                          <strong style={{ display: "block", marginTop: 4, fontSize: 12 }}>{step.status}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                <section style={twoColumnGrid}>
                  <article style={panelStyle}>
                    <div style={sectionHeader}><div><div style={eyebrow}>AKSİYON MERKEZİ</div><h2 style={sectionTitle}>Hemen İncele · İzle · Sorun Yok</h2></div></div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 9 }}>
                      {[
                        ["Hemen İncele", actionBuckets.immediate.length, "Risk yüksek veya veri güveni düşük", "#b42318"],
                        ["İzle", actionBuckets.watch.length, "Karar/veri seviyesi takip edilmeli", "#9a6500"],
                        ["Sorun Yok", actionBuckets.clear.length, "Mevcut görünümde kritik sinyal yok", "#16794a"],
                      ].map(([label, count, text, color]) => (
                        <div key={String(label)} style={{ padding: 13, borderRadius: 15, background: "#f7fafc", border: "1px solid #dbe7f3" }}>
                          <strong style={{ display: "block", fontSize: 22, color: String(color) }}>{count}</strong>
                          <b style={{ display: "block", marginTop: 3, fontSize: 12 }}>{label}</b>
                          <small style={{ display: "block", marginTop: 5, color: "#74889b", lineHeight: 1.35 }}>{text}</small>
                        </div>
                      ))}
                    </div>
                    {actionBuckets.immediate.slice(0, 3).map((item) => (
                      <button key={item.id} type="button" onClick={() => openRecord(item)} style={{ ...softButton, width: "100%", marginTop: 8, textAlign: "left" }}>
                        {[item.city, item.district, item.neighborhood].filter(Boolean).join(" / ") || "Konum yok"} · {(item.decision || decisionFromReport(item.report || "")) || "Karar yok"}
                      </button>
                    ))}
                  </article>

                  <article style={panelStyle}>
                    <div style={sectionHeader}><div><div style={eyebrow}>KANIT & DOĞRULAMA</div><h2 style={sectionTitle}>Karar İçin Eksik Kanıtlar</h2></div></div>
                    <div style={{ display: "grid", gap: 8 }}>
                      {[
                        ["Rapor kaydı", commandRecord ? "Kayıtlı" : "Bekliyor"],
                        ["Veri güveni", commandRecord ? `${commandScores.trust ?? "—"}/100` : "Bekliyor"],
                        ["Gerçekleşmiş emsal", "Doğrulama gerekli"],
                        ["Tapu / imar", "Resmî teyit gerekli"],
                        ["Teknik inceleme", "Uzman teyidi gerekli"],
                      ].map(([label, status]) => (
                        <div key={String(label)} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "10px 12px", borderRadius: 12, background: "#f5f8fb", border: "1px solid #e0e9f2" }}>
                          <span style={{ fontSize: 12, fontWeight: 850 }}>{label}</span><strong style={{ fontSize: 11 }}>{status}</strong>
                        </div>
                      ))}
                    </div>
                    <button type="button" onClick={() => { setView("reports"); setNotice("Kanıt ve doğrulama adımları için ilgili raporu açın."); }} style={{ ...softButton, width: "100%", marginTop: 10 }}>Doğrulama Akışını Aç</button>
                  </article>
                </section>

                <section style={twoColumnGrid}>
                  <article style={panelStyle}>
                    <div style={sectionHeader}><div><div style={eyebrow}>PAZARLIK ASİSTANI</div><h2 style={sectionTitle}>Teklif Planı</h2></div></div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
                      <div style={insightCardStyle}><small>Talep</small><strong>{commandRecord?.asking_price ? formatCurrency(String(commandRecord.asking_price)) : "—"}</strong></div>
                      <div style={insightCardStyle}><small>İlk Teklif</small><strong>{negotiationSnapshot.opening ? formatCurrency(String(negotiationSnapshot.opening)) : "Raporda yok"}</strong></div>
                      <div style={insightCardStyle}><small>Üst Sınır</small><strong>{negotiationSnapshot.ceiling ? formatCurrency(String(negotiationSnapshot.ceiling)) : "Raporda yok"}</strong></div>
                    </div>
                    <div style={{ marginTop: 10, padding: 12, borderRadius: 13, background: "#fff8e8", border: "1px solid #f0d89d", fontSize: 12, lineHeight: 1.5 }}>
                      Sabit yüzde uydurulmaz. Teklif değerleri yalnızca mevcut raporda hesaplandıysa gösterilir; yoksa raporu yeniden analiz edin.
                    </div>
                    <button type="button" disabled={!commandRecord} onClick={() => runAiCommand(commandRecord, "Bu dosya için satıcıya gönderebileceğim kısa, profesyonel ve gerekçeli pazarlık mesajı hazırla. Rapor dışı rakam uydurma.")} style={{ ...softButton, width: "100%", marginTop: 10 }}>Satıcı Mesajı Hazırla</button>
                  </article>

                  <article style={panelStyle}>
                    <div style={sectionHeader}><div><div style={eyebrow}>YAŞAM UYUMU</div><h2 style={sectionTitle}>Konum ve Günlük Yaşam</h2></div></div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
                      <div style={insightCardStyle}><small>Ulaşım</small><strong>{commandRegionalData?.transportScore ? `${commandRegionalData.transportScore}/100` : "Veri yok"}</strong></div>
                      <div style={insightCardStyle}><small>Altyapı</small><strong>{commandRegionalData?.infrastructureScore ? `${commandRegionalData.infrastructureScore}/100` : "Veri yok"}</strong></div>
                      <div style={insightCardStyle}><small>Okul / Hastane</small><strong>Harita teyidi</strong></div>
                      <div style={insightCardStyle}><small>Market / Çevre</small><strong>Harita teyidi</strong></div>
                    </div>
                    <button type="button" disabled={!commandRecord} onClick={() => commandRecord && window.open(googleMapsUrl(commandRecord), "_blank", "noopener,noreferrer")} style={{ ...softButton, width: "100%", marginTop: 10 }}>Haritada İncele</button>
                  </article>
                </section>

                <section style={twoColumnGrid}>
                  <article style={panelStyle}>
                    <div style={sectionHeader}><div><div style={eyebrow}>AKILLI HAFIZA</div><h2 style={sectionTitle}>Yatırım Tercihlerim</h2></div></div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
                      <label style={{ display: "grid", gap: 5, fontSize: 11, fontWeight: 850 }}>Amaç
                        <select value={userMemory.investmentGoal} onChange={(event) => setUserMemory((current) => ({ ...current, investmentGoal: event.target.value }))} style={inputStyle}>
                          <option>Dengeli getiri</option><option>Yüksek kira getirisi</option><option>Değer artışı</option><option>Düşük risk</option>
                        </select>
                      </label>
                      <label style={{ display: "grid", gap: 5, fontSize: 11, fontWeight: 850 }}>Risk toleransı
                        <select value={userMemory.riskTolerance} onChange={(event) => setUserMemory((current) => ({ ...current, riskTolerance: event.target.value }))} style={inputStyle}>
                          <option>Düşük</option><option>Orta</option><option>Yüksek</option>
                        </select>
                      </label>
                      <label style={{ display: "grid", gap: 5, fontSize: 11, fontWeight: 850 }}>Maksimum bina yaşı
                        <input value={userMemory.maxBuildingAge} onChange={(event) => setUserMemory((current) => ({ ...current, maxBuildingAge: event.target.value }))} placeholder="Örn. 10" style={inputStyle} />
                      </label>
                      <label style={{ display: "grid", gap: 5, fontSize: 11, fontWeight: 850 }}>Minimum kira getirisi %
                        <input value={userMemory.minRentalYield} onChange={(event) => setUserMemory((current) => ({ ...current, minRentalYield: event.target.value }))} placeholder="Örn. 5" style={inputStyle} />
                      </label>
                    </div>
                    <button type="button" onClick={saveUserMemory} style={{ ...softButton, width: "100%", marginTop: 10 }}>{memorySaved ? "✓ Hafızaya Kaydedildi" : "Tercihlerimi Hatırla"}</button>
                  </article>

                  <article style={panelStyle}>
                    <div style={sectionHeader}><div><div style={eyebrow}>KARAR DEĞİŞİKLİĞİ MERKEZİ</div><h2 style={sectionTitle}>Son 7 Gün</h2></div></div>
                    <div style={{ padding: 12, borderRadius: 13, background: "#f5f8fb", border: "1px solid #dbe7f3", fontSize: 12, lineHeight: 1.5 }}>
                      {recentSevenDayRecords.length} rapor son 7 günde oluşturuldu veya güncellendi. Gerçek “önceki karar → yeni karar” karşılaştırması için sürüm geçmişi kaydı gerekir; sistem olmayan geçmişi uydurmaz.
                    </div>
                    <div style={{ display: "grid", gap: 7, marginTop: 9 }}>
                      {recentSevenDayRecords.slice(0, 4).map((item) => <button key={item.id} type="button" onClick={() => openRecord(item)} style={{ ...softButton, width: "100%", textAlign: "left" }}>{[item.city, item.district, item.neighborhood].filter(Boolean).join(" / ") || "Konum yok"} · {item.decision || decisionFromReport(item.report || "") || "Karar yok"}</button>)}
                    </div>
                  </article>
                </section>

                <section style={{ ...panelStyle, overflow: "hidden" }}>
                  <div style={sectionHeader}>
                    <div>
                      <div style={eyebrow}>AI KARAR KOMUTANI · v3</div>
                      <h2 style={sectionTitle}>Senaryo, Güven ve Aksiyon Merkezi</h2>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ padding: "7px 10px", borderRadius: 999, background: `${decisionConfidence.tone}12`, border: `1px solid ${decisionConfidence.tone}38`, color: decisionConfidence.tone, fontSize: 10, fontWeight: 950 }}>● Karar güveni: {decisionConfidence.level}</span>
                      <span style={{ fontSize: 11, fontWeight: 900, color: "#6d8297" }}>Aktif dosya: {commandRecord ? [commandRecord.city, commandRecord.district].filter(Boolean).join(" / ") : "Yok"}</span>
                    </div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 9, marginBottom: 12 }}>
                    {[
                      ["⚠", "Risk Tarama", "Bu dosyanın en büyük 3 riski nedir ve hangisi kararımı değiştirebilir?"],
                      ["₺", "Fiyat Kontrolü", "Talep fiyatı mevcut rapora göre mantıklı mı? Bana net fiyat yorumu ve gerekçesini ver."],
                      ["↘", "Teklif Stratejisi", "Bu dosya için ilk teklif, hedef anlaşma ve vazgeçme sınırını nasıl belirlemeliyim?"],
                      ["✓", "Doğrulama", "Bu dosyada karar vermeden önce hangi verileri doğrulamam gerekiyor? Öncelik sırasına koy."],
                      ["⇄", "Portföyle Kıyasla", "Bu dosyayı portföyümdeki diğer güçlü adaylarla karşılaştır. Hangi dosya neden daha iyi olabilir?"],
                      ["◎", "Çıkış Planı", "Bu yatırımı alırsam 1-3-5 yıllık çıkış stratejisini hangi risk ve fırsatlara göre planlamalıyım?"],
                    ].map(([icon, label, preset]) => (
                      <button
                        key={label}
                        type="button"
                        disabled={!commandRecord || aiCommandLoading}
                        onClick={() => { setAiCommand(preset); void runAiCommand(commandRecord, preset); }}
                        style={{
                          ...softButton,
                          display: "grid",
                          gridTemplateColumns: "38px 1fr",
                          alignItems: "center",
                          gap: 9,
                          padding: "12px",
                          textAlign: "left",
                          minHeight: 62,
                          background: "linear-gradient(145deg,#ffffff,#f4f8ff)",
                          border: "1px solid #cfe0f1",
                          boxShadow: "0 8px 20px rgba(30,73,113,.07)",
                        }}
                      >
                        <span style={{ width: 38, height: 38, borderRadius: 12, display: "grid", placeItems: "center", background: "linear-gradient(145deg,#0b78e5,#3735d8)", color: "white", fontWeight: 950, fontSize: 17, boxShadow: "0 8px 18px rgba(23,76,151,.22)" }}>{icon}</span>
                        <span style={{ display: "grid", gap: 2 }}><strong style={{ fontSize: 12 }}>{label}</strong><small style={{ color: "#6d8297", lineHeight: 1.25 }}>Tek tık AI değerlendirmesi</small></span>
                      </button>
                    ))}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 8, marginBottom: 12 }}>
                    <div style={{ ...insightCardStyle, background: "linear-gradient(145deg,#f9fbff,#eef5ff)" }}><small>Aktif karar</small><strong>{commandDecision}</strong></div>
                    <div style={{ ...insightCardStyle, background: "linear-gradient(145deg,#f9fbff,#eef5ff)" }}><small>Yatırım</small><strong>{commandScores.investment ?? "—"}/100</strong></div>
                    <div style={{ ...insightCardStyle, background: "linear-gradient(145deg,#fff9f6,#fff1eb)" }}><small>Risk</small><strong>{commandScores.risk ?? "—"}/100</strong></div>
                    <div style={{ ...insightCardStyle, background: `${decisionConfidence.tone}0d`, border: `1px solid ${decisionConfidence.tone}33` }}><small>Veri güveni</small><strong style={{ color: decisionConfidence.tone }}>{commandScores.trust ?? "—"}/100 · {decisionConfidence.level}</strong></div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
                    <input value={aiCommand} onChange={(event) => setAiCommand(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !aiCommandLoading) void runAiCommand(commandRecord); }} placeholder="Örn. 4,2 milyon teklif verirsem nasıl değerlendirmeliyim?" style={inputStyle} />
                    <button type="button" disabled={aiCommandLoading || !commandRecord} onClick={() => void runAiCommand(commandRecord)} style={primaryButton}>{aiCommandLoading ? "Analiz ediliyor..." : "AI'ya Sor"}</button>
                  </div>

                  {aiStructuredResult ? (
                    <div style={{ marginTop: 13, display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10 }}>
                      {[
                        ["NET KARAR", aiStructuredResult.net, "#0b6fd6", "◆"],
                        ["NEDEN", aiStructuredResult.why, "#6a37c8", "≡"],
                        ["ÖNERİLEN AKSİYON", aiStructuredResult.action, "#12845a", "→"],
                        ["KRİTİK UYARI", aiStructuredResult.warning, "#b96d00", "!"],
                      ].map(([label, value, color, icon]) => (
                        <article key={label} style={{ padding: 15, borderRadius: 16, background: "linear-gradient(145deg,#ffffff,#f7faff)", border: `1px solid ${color}2f`, boxShadow: "0 9px 22px rgba(22,54,88,.07)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                            <span style={{ width: 28, height: 28, borderRadius: 9, display: "grid", placeItems: "center", background: `${color}12`, color, fontWeight: 950 }}>{icon}</span>
                            <strong style={{ fontSize: 10, letterSpacing: .8, color }}>{label}</strong>
                          </div>
                          <div style={{ color: "#29435c", whiteSpace: "pre-wrap", fontSize: 12, lineHeight: 1.6 }}>{value}</div>
                        </article>
                      ))}
                    </div>
                  ) : null}

                  <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1.25fr .75fr", gap: 12 }}>
                    <article style={{ padding: 16, borderRadius: 18, background: "linear-gradient(145deg,#071f45,#0d3e79)", border: "1px solid rgba(92,190,255,.23)", color: "#fff", boxShadow: "0 14px 32px rgba(3,29,66,.18)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <div><small style={{ color: "#8fd6ff", fontWeight: 950, letterSpacing: .9 }}>SENARYO SİMÜLATÖRÜ</small><h3 style={{ margin: "5px 0 0", fontSize: 20 }}>Fiyat · Kira · Vade</h3></div>
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,.62)" }}>Anlık karar etkisi</span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr .65fr", gap: 8, marginTop: 12 }}>
                        <label style={{ display: "grid", gap: 5, fontSize: 9, fontWeight: 900, color: "#b9dcf5" }}>TEKLİF FİYATI (TL)<input value={scenarioPrice} onChange={(e) => setScenarioPrice(e.target.value)} placeholder={scenarioResult.basePrice ? String(Math.round(scenarioResult.basePrice)) : "Örn. 4200000"} style={{ ...inputStyle, background: "rgba(255,255,255,.96)" }} /></label>
                        <label style={{ display: "grid", gap: 5, fontSize: 9, fontWeight: 900, color: "#b9dcf5" }}>AYLIK KİRA (TL)<input value={scenarioRent} onChange={(e) => setScenarioRent(e.target.value)} placeholder="Örn. 30000" style={{ ...inputStyle, background: "rgba(255,255,255,.96)" }} /></label>
                        <label style={{ display: "grid", gap: 5, fontSize: 9, fontWeight: 900, color: "#b9dcf5" }}>VADE<select value={scenarioHorizon} onChange={(e) => setScenarioHorizon(e.target.value as "1" | "3" | "5")} style={{ ...inputStyle, background: "rgba(255,255,255,.96)" }}><option value="1">1 yıl</option><option value="3">3 yıl</option><option value="5">5 yıl</option></select></label>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginTop: 12 }}>
                        <div style={scenarioMetric}><small>Yatırım</small><strong>{scenarioResult.investment}/100</strong></div>
                        <div style={scenarioMetric}><small>Fırsat</small><strong>{scenarioResult.opportunity}/100</strong></div>
                        <div style={scenarioMetric}><small>Risk</small><strong>{scenarioResult.risk}/100</strong></div>
                        <div style={scenarioMetric}><small>Brüt kira</small><strong>{scenarioResult.grossYield > 0 ? `%${scenarioResult.grossYield.toFixed(2)}` : "—"}</strong></div>
                      </div>
                      <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 12, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.10)", fontSize: 10, lineHeight: 1.5, color: "rgba(255,255,255,.76)" }}>
                        {scenarioResult.annualRate != null && scenarioResult.projectedValue > 0 ? `${scenarioResult.horizon} yıllık matematiksel senaryo değeri: ${formatCurrency(String(Math.round(scenarioResult.projectedValue)))}. Bölgesel yıllık değişim oranının sabit kaldığı varsayılır; resmî değer tahmini değildir.` : "Bölgesel yıllık değişim verisi güçlü değilse gelecek değer üretilmez. Fiyat ve kira girdileri skor etkisini karşılaştırmak içindir."}
                      </div>
                    </article>

                    <article style={{ padding: 16, borderRadius: 18, background: "linear-gradient(145deg,#ffffff,#f5f9fd)", border: `1px solid ${decisionConfidence.tone}35`, boxShadow: "0 12px 28px rgba(24,59,93,.08)" }}>
                      <small style={{ color: decisionConfidence.tone, fontWeight: 950, letterSpacing: .85 }}>KARAR GÜVEN GÖSTERGESİ</small>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 7 }}><strong style={{ fontSize: 28, color: decisionConfidence.tone }}>{decisionConfidence.level}</strong><span style={{ color: "#71859a", fontSize: 11 }}>{commandScores.trust ?? 0}/100 veri güveni</span></div>
                      <div style={{ height: 8, borderRadius: 999, background: "#e8eef4", overflow: "hidden", marginTop: 10 }}><div style={{ height: "100%", width: `${Math.max(0, Math.min(100, commandScores.trust ?? 0))}%`, background: decisionConfidence.tone, borderRadius: 999 }} /></div>
                      <div style={{ marginTop: 13, fontSize: 10, fontWeight: 900, color: "#5c7288" }}>Eksik / güçlendirilecek alanlar</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                        {(decisionConfidence.missing.length ? decisionConfidence.missing : ["Kritik eksik görünmüyor"]).map((item) => <span key={item} style={{ padding: "6px 8px", borderRadius: 999, background: "#eef4f9", border: "1px solid #dae6f0", color: "#526b82", fontSize: 9, fontWeight: 850 }}>{item}</span>)}
                      </div>
                    </article>
                  </div>
                </section>

                <section style={panelStyle}>
                  <div style={sectionHeader}>
                    <div>
                      <div style={eyebrow}>ÖNCELİKLİ DOSYALAR</div>
                      <h2 style={sectionTitle}>Bugün Önce Bunlara Bakın</h2>
                    </div>
                    <button type="button" onClick={() => setView("reports")} style={softButton}>Tüm Raporlar</button>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
                    {priorityRecords.map(({ item, scores, decision }, index) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => openRecord(item)}
                        style={{
                          appearance: "none",
                          border: "1px solid #dbe7f3",
                          borderRadius: 18,
                          padding: 16,
                          background: "linear-gradient(145deg,#ffffff,#f4f8fc)",
                          textAlign: "left",
                          cursor: "pointer",
                          boxShadow: "0 10px 24px rgba(20,63,102,.08)",
                          color: "#17324d",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                          <span style={{ fontSize: 11, fontWeight: 950, letterSpacing: 1, color: "#67809a" }}>ÖNCELİK #{index + 1}</span>
                          <span style={{ fontSize: 11, fontWeight: 950, color: decision.includes("AL") ? "#16794a" : decision.includes("PAZARLIK") ? "#9a6500" : "#5a6d80" }}>
                            {decision || "—"}
                          </span>
                        </div>
                        <strong style={{ display: "block", marginTop: 10, fontSize: 16 }}>
                          {[item.city, item.district, item.neighborhood].filter(Boolean).join(" / ") || "Konum bilgisi yok"}
                        </strong>
                        <small style={{ display: "block", marginTop: 5, color: "#6f8295" }}>
                          {item.property_type || "Taşınmaz"} · {item.area ? `${item.area} m²` : "Alan yok"} · {item.asking_price ? formatCurrency(String(item.asking_price)) : "Fiyat yok"}
                        </small>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginTop: 14 }}>
                          {[["Yatırım", scores.investment], ["Fırsat", scores.opportunity], ["Güven", scores.trust], ["Risk", scores.risk]].map(([label, value]) => (
                            <div key={String(label)} style={{ padding: "8px 6px", borderRadius: 10, background: "#edf4fa", textAlign: "center" }}>
                              <small style={{ display: "block", fontSize: 8, fontWeight: 900, color: "#70859a" }}>{label}</small>
                              <strong style={{ display: "block", marginTop: 2, fontSize: 14 }}>{value ?? "—"}</strong>
                            </div>
                          ))}
                        </div>
                      </button>
                    ))}
                    {!priorityRecords.length ? <div style={emptyState}>Önceliklendirilecek aktif rapor bulunmuyor.</div> : null}
                  </div>
                </section>

                <section style={twoColumnGrid}>
                  <article style={panelStyle}>
                    <div style={sectionHeader}><div><div style={eyebrow}>PORTFÖY SAĞLIK PANELİ</div><h2 style={sectionTitle}>Ortalama Skorlar</h2></div></div>
                    <DashboardScore label="Veri Güven" value={avgScores.trust} />
                    <DashboardScore label="Yatırım" value={avgScores.investment} />
                    <DashboardScore label="Fırsat" value={avgScores.opportunity} />
                    <DashboardScore label="Risk" value={avgScores.risk} inverse />
                    <DashboardScore label="Likidite" value={avgScores.liquidity} />
                  </article>

                  <article style={panelStyle}>
                    <div style={sectionHeader}><div><div style={eyebrow}>KARAR DAĞILIMI</div><h2 style={sectionTitle}>AI Karar Özeti</h2></div></div>
                    <DecisionBar label="AL" value={decisionStats.AL} total={activeRecords.length} />
                    <DecisionBar label="PAZARLIK YAP" value={decisionStats.PAZARLIK} total={activeRecords.length} />
                    <DecisionBar label="BEKLE" value={decisionStats.BEKLE} total={activeRecords.length} />
                    <DecisionBar label="UZAK DUR" value={decisionStats.UZAK} total={activeRecords.length} />
                    <DecisionBar label="DİĞER" value={decisionStats.DIGER} total={activeRecords.length} />
                  </article>
                </section>

                <LocationIntelligencePanel
                  records={activeRecords}
                  selected={selectedMapRecord}
                  selectedId={selectedMapRecord?.id ?? ""}
                  onSelect={setMapRecordId}
                  mapType={mapType}
                  onMapTypeChange={setMapType}
                />

                <section style={panelStyle}>
                  <div style={sectionHeader}>
                    <div><div style={eyebrow}>OPERASYON MERKEZİ</div><h2 style={sectionTitle}>Son Analizler</h2></div>
                    <button type="button" onClick={() => setView("reports")} style={softButton}>Tümünü Gör</button>
                  </div>
                  <div style={{ display: "grid", gap: 10 }}>
                    {activeRecords.slice(0, 5).map((item) => (
                      <ReportRow key={item.id} item={item} onOpen={() => openRecord(item)} onMap={() => window.open(googleMapsUrl(item), "_blank", "noopener,noreferrer")} />
                    ))}
                    {!activeRecords.length ? <div style={emptyState}>Henüz aktif rapor bulunmuyor.</div> : null}
                  </div>
                </section>
              </>
            )}
          </>
        ) : null}

        {view === "verification" ? (
          <div style={{ display: "grid", gap: 18 }}>
            {regionalError ? <div style={errorNotice}>{regionalError}</div> : null}
            {regionalNotice ? <div style={successNotice}>{regionalNotice}</div> : null}
            <section style={panelStyle}>
              <TurkiyeDataCenter
                records={v67MarketRecords}
                onSave={saveV67MarketRecord}
                onImport={importV67MarketRecords}
                onStatusChange={changeV67VerificationStatus}
              />
            </section>
            <VerificationCenter records={records} regionalData={regionalData} />
          </div>
        ) : null}

        {view === "reports" ? (
          <>
            <section style={panelStyle}>
              <div style={sectionHeader}>
                <div>
                  <div style={eyebrow}>KİŞİSEL BULUT HAFIZASI</div>
                  <h2 style={sectionTitle}>Rapor Yönetim Merkezi</h2>
                </div>
                <button type="button" onClick={() => void loadHistory()} style={softButton}>
                  Yenile
                </button>
              </div>

              <div style={tabBar}>
                <Tab active={historyMode === "active"} onClick={() => setHistoryMode("active")}>
                  Aktif ({activeRecords.length})
                </Tab>
                <Tab active={historyMode === "favorites"} onClick={() => setHistoryMode("favorites")}>
                  ★ Favoriler ({favoriteRecords.length})
                </Tab>
                <Tab active={historyMode === "archive"} onClick={() => setHistoryMode("archive")}>
                  Arşiv ({archivedRecords.length})
                </Tab>
              </div>

              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="İl, ilçe, mahalle, tür, karar veya not ara..."
                style={{ ...inputStyle, marginBottom: 13 }}
              />

              {historyLoading ? <div style={emptyState}>Bulut raporları yükleniyor...</div> : null}

              <div style={{ display: "grid", gap: 11 }}>
                {visibleRecords.map((item) => (
                  <article key={item.id} style={recordStyle}>
                    <div style={{ flex: "1 1 460px" }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <strong style={{ color: "#153a65" }}>{locationText(item) || "Konum belirtilmedi"}</strong>
                        <span style={{ ...decisionBadge, ...decisionTone(item.decision ?? "DEĞERLENDİR") }}>
                          {item.decision ?? "DEĞERLENDİR"}
                        </span>
                        {item.is_favorite ? <span style={favoriteBadge}>★ Favori</span> : null}
                        {item.is_archived ? <span style={archiveBadge}>Arşivde</span> : null}
                      </div>
                      <div style={{ color: "#61788f", marginTop: 7, fontSize: 13 }}>
                        {item.property_type || "Taşınmaz"} · {item.area || "—"} m² ·{" "}
                        {formatCurrency(item.asking_price)}
                      </div>
                      <div style={{ color: "#8a9aab", marginTop: 4, fontSize: 12 }}>
                        {safeDate(item.created_at)}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                      <button type="button" onClick={() => openRecord(item)} style={blueButton}>Raporu Aç</button>
                      <button type="button" onClick={() => reAnalyze(item)} style={softButton}>Yeniden Analiz</button>
                      <a href={googleMapsUrl(item)} target="_blank" rel="noreferrer" style={linkButton}>Haritada Aç</a>

                      {!item.is_archived ? (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              void updateRecord(
                                item,
                                { is_favorite: !item.is_favorite },
                                item.is_favorite ? "Favoriden çıkarıldı." : "Favorilere eklendi.",
                              )
                            }
                            style={softButton}
                          >
                            {item.is_favorite ? "★ Çıkar" : "☆ Favori"}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void updateRecord(item, { is_archived: true }, "Rapor arşive taşındı.")
                            }
                            style={warningButton}
                          >
                            Arşivle
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              void updateRecord(item, { is_archived: false }, "Rapor geri yüklendi.")
                            }
                            style={successButton}
                          >
                            Geri Yükle
                          </button>
                          <button type="button" onClick={() => void deleteRecord(item)} style={dangerButton}>
                            Kalıcı Sil
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                ))}
              </div>

              {!historyLoading && !visibleRecords.length ? (
                <div style={emptyState}>Arama ölçütlerine uygun rapor bulunamadı.</div>
              ) : null}
            </section>

            {report ? (
              <section id="premium-report" style={panelStyle}>
                <div className="print-cover" style={printCover}>
                  <div style={versionBadge}>YAŞAM AI PREMIUM RAPOR</div>
                  <h1 style={{ fontSize: 48, margin: "22px 0 10px" }}>Gayrimenkul Karar Raporu</h1>
                  <p style={{ fontSize: 20 }}>{form.city} / {form.district} / {form.neighborhood}</p>
                  <p style={{ marginTop: 120, opacity: 0.8 }}>
                    Türkiye’nin güvenilir gayrimenkul karar platformu
                  </p>
                </div>

                <div style={sectionHeader}>
                  <div>
                    <div style={eyebrow}>YAŞAM AI PREMIUM KARAR RAPORU</div>
                    <h2 style={sectionTitle}>{form.city} / {form.district} Karar Dosyası</h2>
                  </div>
                  <span style={{ ...decisionBadge, ...decisionTone(currentDecision), fontSize: 14, padding: "9px 13px" }}>
                    {currentDecision}
                  </span>
                </div>

                <div style={scoreGrid}>
                  <ScoreCard title="Veri Güven" score={currentScores.trust} />
                  <ScoreCard title="Yatırım" score={currentScores.investment} />
                  <ScoreCard title="Fırsat" score={currentScores.opportunity} />
                  <ScoreCard title="Risk" score={currentScores.risk} inverse />
                  <ScoreCard title="Likidite" score={currentScores.liquidity} />
                </div>

                <div style={reportMetaGrid}>
                  <MiniMeta label="Taşınmaz" value={form.propertyType} />
                  <MiniMeta label="Alan" value={form.area ? `${form.area} m²` : "—"} />
                  <MiniMeta label="Talep Edilen Fiyat" value={formatCurrency(form.askingPrice)} />
                  <MiniMeta label="Bulut Durumu" value={activeRecordId ? "Buluta kayıtlı" : "Yeni rapor"} />
                </div>

                <div style={reportBox}>
                  <div style={reportTextStyle}>{report}</div>
                </div>

                <div className="no-print" style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 18 }}>
                  <button type="button" onClick={openCurrentPremiumPdf} style={blueButton}>Premium PDF / Yazdır</button>
                  <button type="button" onClick={() => void copyReport()} style={softButton}>Kopyala</button>
                  <button type="button" onClick={() => void shareReport()} style={softButton}>Paylaş</button>
                  <button type="button" onClick={startNewAnalysis} style={softButton}>Yeni Analiz</button>
                </div>
              </section>
            ) : null}
          </>
        ) : null}

        {view === "compare" ? (
          <section id="comparison-report" style={panelStyle}>
            <div style={sectionHeader}>
              <div>
                <div style={eyebrow}>TÜRKİYE GENELİ VERİ MOTORU</div>
                <h2 style={sectionTitle}>İki Taşınmaz İçin Profesyonel Karar Dosyası</h2>
                <p style={{ margin: "7px 0 0", color: "#607890", lineHeight: 1.5 }}>
                  İki kayıtlı raporu puanlar, fiyat ve risk verileriyle karşılaştırır; ardından /api/chat üzerinden gerekçeli AI kararı üretir.
                </p>
              </div>
              <button type="button" onClick={() => window.print()} style={blueButton}>
                Karşılaştırmayı PDF / Yazdır
              </button>
            </div>

            {activeRecords.length < 2 ? (
              <div style={emptyState}>Karşılaştırma için en az iki aktif rapor gerekir.</div>
            ) : (
              <>
                <div style={compareSelectors}>
                  <select
                    value={comparisonIds[0]}
                    onChange={(event) => setComparisonIds([event.target.value, comparisonIds[1]])}
                    style={inputStyle}
                  >
                    <option value="">1. taşınmazı seç</option>
                    {activeRecords.map((item) => (
                      <option key={item.id} value={item.id} disabled={item.id === comparisonIds[1]}>
                        {locationText(item)} · {item.property_type}
                      </option>
                    ))}
                  </select>

                  <select
                    value={comparisonIds[1]}
                    onChange={(event) => setComparisonIds([comparisonIds[0], event.target.value])}
                    style={inputStyle}
                  >
                    <option value="">2. taşınmazı seç</option>
                    {activeRecords.map((item) => (
                      <option key={item.id} value={item.id} disabled={item.id === comparisonIds[0]}>
                        {locationText(item)} · {item.property_type}
                      </option>
                    ))}
                  </select>
                </div>

                {comparisonA && comparisonB ? (
                  <ComparisonTable left={comparisonA} right={comparisonB} />
                ) : (
                  <div style={emptyState}>Karşılaştırılacak iki farklı raporu seçin.</div>
                )}
              </>
            )}
          </section>
        ) : null}

        {view === "data" ? (
          <RegionalDataEngine
            records={regionalData}
            search={regionalSearch}
            onSearch={setRegionalSearch}
            editorId={regionalEditorId}
            onEditorId={setRegionalEditorId}
            onUpdate={(updated) =>
              setRegionalData((current) =>
                current.map((item) => (item.id === updated.id ? updated : item)),
              )
            }
            onSave={(record) => void saveRegionalRecord(record)}
            onCreate={createRegionalDraft}
            onImport={(file) => void importRegionalCsv(file)}
            onRefresh={() => void loadRegionalData()}
            loading={regionalLoading}
            saving={regionalSaving}
            error={regionalError}
            notice={regionalNotice}
          />
        ) : null}

        {view === "ecosystem" ? (
          <StrategicExpansionCenter records={records} regionalData={regionalData} user={user} />
        ) : null}

        {view === "new" ? (
          <section id="analysis-form" style={panelStyle}>
            <div style={sectionHeader}>
              <div>
                <div style={eyebrow}>AÇIKLANABİLİR AI KARAR MOTORU</div>
                <h2 style={sectionTitle}>Yeni Gayrimenkul Karar Dosyası</h2>
                <p style={{ margin: "7px 0 0", color: "#607890", lineHeight: 1.5 }}>
                  Türkiye Veri Motoru, yerel ön hesap ve gerçek AI raporu aynı karar akışında.
                </p>
              </div>
              <span style={secureBadge}>Supabase + AI güvenli akış</span>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={formGrid}>
                <Field label="İl *" value={form.city} onChange={(value) => setForm({ ...form, city: value })} />
                <Field label="İlçe *" value={form.district} onChange={(value) => setForm({ ...form, district: value })} />
                <Field label="Mahalle *" value={form.neighborhood} onChange={(value) => setForm({ ...form, neighborhood: value })} />
                <Field label="Alan (m²) *" value={form.area} onChange={(value) => setForm({ ...form, area: value })} inputMode="numeric" />
                <Field label="Satış fiyatı (TL) *" value={form.askingPrice} onChange={(value) => setForm({ ...form, askingPrice: formatMoney(value) })} inputMode="numeric" />
                <Field label="Aylık kira beklentisi (TL)" value={form.monthlyRent} onChange={(value) => setForm({ ...form, monthlyRent: formatMoney(value) })} inputMode="numeric" />
                <Field label="Bina yaşı" value={form.buildingAge} onChange={(value) => setForm({ ...form, buildingAge: value.replace(/\D/g, "") })} inputMode="numeric" />
                <Field label="Bulunduğu kat" value={form.floor} onChange={(value) => setForm({ ...form, floor: value })} />
                <Field label="Toplam kat" value={form.totalFloors} onChange={(value) => setForm({ ...form, totalFloors: value.replace(/\D/g, "") })} inputMode="numeric" />
                <Field label="İmar durumu" value={form.zoningStatus} onChange={(value) => setForm({ ...form, zoningStatus: value })} />

                <label style={labelStyle}>
                  Taşınmaz türü
                  <select value={form.propertyType} onChange={(event) => setForm({ ...form, propertyType: event.target.value })} style={inputStyle}>
                    {["Konut", "Arsa", "İş Yeri", "Ticari", "Tarla", "Villa", "Fabrika Arsası"].map((type) => <option key={type}>{type}</option>)}
                  </select>
                </label>

                <label style={labelStyle}>
                  Tapu durumu
                  <select value={form.titleStatus} onChange={(event) => setForm({ ...form, titleStatus: event.target.value })} style={inputStyle}>
                    {["Kat mülkiyeti", "Kat irtifakı", "Arsa tapusu", "Müstakil tapu", "Hisseli tapu", "Belirtilmedi"].map((type) => <option key={type}>{type}</option>)}
                  </select>
                </label>
              </div>

              <div style={{ padding: 16, margin: "14px 0", borderRadius: 16, background: "linear-gradient(135deg,#f5faff,#eef7ff)", border: "1px solid #cfe3f4" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                  <div><div style={eyebrow}>ANLIK YEREL ÖN HESAP</div><strong style={{ color: "#153a65", fontSize: 20 }}>Karar Önizlemesi</strong></div>
                  <span style={{ ...decisionBadge, ...decisionTone(localMetrics.decision) }}>{localMetrics.decision}</span>
                </div>
                <div style={formGrid}>
                  <MiniMeta label="Talep m²" value={localMetrics.askingM2 ? formatCurrency(String(Math.round(localMetrics.askingM2))) : "—"} />
                  <MiniMeta label="Bölge m²" value={localMetrics.marketM2 ? formatCurrency(String(Math.round(localMetrics.marketM2))) : "Veri yok"} />
                  <MiniMeta label="Tahmini piyasa değeri" value={localMetrics.estimatedMarketValue ? formatCurrency(String(Math.round(localMetrics.estimatedMarketValue))) : "—"} />
                  <MiniMeta label="Fiyat farkı" value={`${localMetrics.priceDifferencePct.toFixed(1).replace(".", ",")} %`} />
                  <MiniMeta label="Brüt kira getirisi" value={localMetrics.grossYieldPct ? `%${localMetrics.grossYieldPct.toFixed(2).replace(".", ",")}` : "—"} />
                  <MiniMeta label="Amortisman" value={localMetrics.amortizationMonths ? `${localMetrics.amortizationMonths} ay` : "—"} />
                </div>
                <div style={scoreGrid}>
                  <ScoreCard title="Veri Güven" score={localMetrics.confidenceLevel} />
                  <ScoreCard title="Yatırım" score={localMetrics.investmentScore} />
                  <ScoreCard title="Fırsat" score={localMetrics.opportunityScore} />
                  <ScoreCard title="Risk" score={localMetrics.riskScore} inverse />
                  <ScoreCard title="Likidite" score={localMetrics.liquidityScore} />
                </div>
                <div style={formGrid}>
                  <MiniMeta label="Karar skoru" value={`${localMetrics.decisionScore}/100`} />
                  <MiniMeta label="Pazarlık gücü" value={`${localMetrics.bargainingPower}/100`} />
                  <MiniMeta label="1 yıllık fiyat tahmini" value={formatCurrency(String(Math.round(localMetrics.year1Estimate)))} />
                  <MiniMeta label="3 yıllık fiyat tahmini" value={formatCurrency(String(Math.round(localMetrics.year3Estimate)))} />
                  <MiniMeta label="5 yıllık fiyat tahmini" value={formatCurrency(String(Math.round(localMetrics.year5Estimate)))} />
                  <MiniMeta label="Önerilen ilk teklif" value={formatCurrency(String(Math.round(localMetrics.firstOffer)))} />
                  <MiniMeta label="Hedef anlaşma" value={formatCurrency(String(Math.round(localMetrics.targetPrice)))} />
                  <MiniMeta label="Maksimum fiyat" value={formatCurrency(String(Math.round(localMetrics.maxPrice)))} />
                </div>
                <p style={{ margin: "8px 0 0", color: "#607890", fontSize: 12 }}>
                  {regionalMatch ? `Eşleşen veri: ${regionalMatch.city} / ${regionalMatch.district} / ${regionalMatch.neighborhood} · Güven %${regionalMatch.dataConfidence}` : "Bu konum için doğrulanmış market_data eşleşmesi bulunamadı; AI raporu veri eksikliğini açıkça belirtecek."}
                </p>
                <p style={{ margin: "8px 0 0", color: "#607890", fontSize: 12 }}>
                  {localMetrics.warnings.length ? `Veri uyarıları: ${localMetrics.warnings.join(" · ")}` : "Eksik veri uyarısı yok; ön hesap güvenli görünümde."}
                </p>
              </div>

              <label style={{ ...labelStyle, marginTop: 14 }}>
                Ek bilgiler
                <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} style={{ ...inputStyle, minHeight: 115, resize: "vertical" }} placeholder="Cephe, bina durumu, ulaşım, satış nedeni, pazarlık bilgisi ve özel riskler..." />
              </label>

              {loading ? (
                <div style={{ marginTop: 14, padding: 14, borderRadius: 14, border: "1px solid #bcdcf5", background: "linear-gradient(135deg,#f4faff,#eaf5ff)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 9 }}>
                    <strong style={{ color: "#0a4f83", fontSize: 13 }}>{analysisStage}</strong>
                    <span style={{ color: "#0876c9", fontWeight: 900, fontSize: 12 }}>%{analysisProgress}</span>
                  </div>
                  <div style={{ height: 9, borderRadius: 999, background: "#dbeaf6", overflow: "hidden" }}>
                    <div style={{ width: `${analysisProgress}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg,#0a5f9f,#22a4ff)", transition: "width .7s ease" }} />
                  </div>
                  <div style={{ marginTop: 8, color: "#607890", fontSize: 11, lineHeight: 1.45 }}>
                    Analiz genellikle 20–45 saniye sürer. Bu sırada sayfayı kapatmayın.
                  </div>
                </div>
              ) : null}

              <button disabled={loading} style={submitButton}>
                {loading ? "AI analizi devam ediyor..." : "Gerçek AI Analizini Başlat"}
              </button>
            </form>
          </section>
        ) : null}

        <footer style={footerStyle}>
          <strong>Yaşam AI</strong> · Gerçek AI analiz, Türkiye veri ve bulut karar sistemi
        </footer>
      </div>
    </main>
  );
}

function LocationIntelligencePanel({
  records,
  selected,
  selectedId,
  onSelect,
  mapType,
  onMapTypeChange,
}: {
  records: CloudRecord[];
  selected: CloudRecord | null;
  selectedId: string;
  onSelect: (id: string) => void;
  mapType: "roadmap" | "satellite";
  onMapTypeChange: (type: "roadmap" | "satellite") => void;
}) {
  const address = selected
    ? [selected.neighborhood, selected.district, selected.city].filter(Boolean).join(" ")
    : "Adana Ceyhan";
  const encodedAddress = encodeURIComponent(address);
  const embedUrl =
    mapType === "satellite"
      ? `https://www.google.com/maps?q=${encodedAddress}&t=k&z=16&output=embed`
      : `https://www.google.com/maps?q=${encodedAddress}&z=16&output=embed`;

  const scores = selected ? scoresFromReport(selected.report ?? "") : emptyScores;
  const locationScore =
    average([scores.trust, scores.investment, scores.liquidity]) ?? 55;

  const nearby = [
    ["Okullar", "okul", "Eğitim erişimi"],
    ["Hastaneler", "hastane", "Sağlık erişimi"],
    ["Eczaneler", "eczane", "Günlük sağlık ihtiyacı"],
    ["Marketler", "market", "Günlük alışveriş"],
    ["Parklar", "park", "Yeşil alan erişimi"],
    ["Toplu Taşıma", "otobüs durağı", "Ulaşım erişimi"],
    ["Bankalar", "banka", "Finansal hizmetler"],
    ["Akaryakıt", "akaryakıt istasyonu", "Araç erişimi"],
  ] as const;

  function openNearby(query: string) {
    const fullQuery = encodeURIComponent(`${query} yakınında ${address}`);
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${fullQuery}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <section style={locationPanelStyle}>
      <div style={sectionHeader}>
        <div>
          <div style={eyebrow}>HARİTA VE KONUM ZEKÂSI</div>
          <h2 style={sectionTitle}>Gayrimenkul Konum Merkezi</h2>
          <p style={locationSubtitle}>
            Buluttaki raporu seçin; normal harita, uydu görünümü ve çevredeki önemli
            noktaları tek ekranda inceleyin.
          </p>
        </div>
        <div style={{ ...locationScoreBadge, ...scoreTone(locationScore) }}>
          <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: 0.6 }}>
            AI KONUM GÖSTERGESİ
          </span>
          <strong style={{ fontSize: 25 }}>{locationScore}/100</strong>
        </div>
      </div>

      {records.length ? (
        <div style={locationControls}>
          <select value={selectedId} onChange={(event) => onSelect(event.target.value)} style={inputStyle}>
            {records.map((item) => (
              <option key={item.id} value={item.id}>
                {locationText(item) || "Konum belirtilmedi"} · {item.property_type ?? "Taşınmaz"}
              </option>
            ))}
          </select>

          <div style={locationButtonGroup}>
            <button
              type="button"
              onClick={() => onMapTypeChange("roadmap")}
              style={mapType === "roadmap" ? mapActiveButton : softButton}
            >
              Normal Harita
            </button>
            <button
              type="button"
              onClick={() => onMapTypeChange("satellite")}
              style={mapType === "satellite" ? mapActiveButton : softButton}
            >
              Uydu Görünümü
            </button>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodedAddress}`}
              target="_blank"
              rel="noreferrer"
              style={mapLinkButton}
            >
              Tam Ekran Aç
            </a>
          </div>
        </div>
      ) : null}

      <div style={locationLayout}>
        <div style={mapFrameStyle}>
          <iframe
            title={`Yaşam AI haritası: ${address}`}
            src={embedUrl}
            width="100%"
            height="100%"
            style={{ border: 0, minHeight: 430 }}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        </div>

        <aside style={locationSidePanel}>
          <div style={locationAddressCard}>
            <span style={locationMiniLabel}>SEÇİLİ KONUM</span>
            <strong style={{ color: "#153a65", lineHeight: 1.45 }}>{address}</strong>
            <span style={{ color: "#6b7f95", fontSize: 13 }}>
              {selected?.property_type ?? "Taşınmaz"} · {selected?.area ? `${selected.area} m²` : "Alan belirtilmedi"}
            </span>
          </div>

          <div style={nearbyGridStyle}>
            {nearby.map(([label, query, description]) => (
              <button key={label} type="button" onClick={() => openNearby(query)} style={nearbyButtonStyle}>
                <strong>{label}</strong>
                <span style={{ fontSize: 11, color: "#6f8297" }}>{description}</span>
              </button>
            ))}
          </div>

          <div style={locationInfoBox}>
            <strong>Konum doğrulama notu</strong>
            <p style={{ margin: "6px 0 0" }}>
              Harita, kayıtlı mahalle ve adres bilgisine göre açılır. Kesin ada-parsel pini için
              koordinat veya resmî parsel verisinin bağlanması gerekir. AI Konum Göstergesi;
              yatırım, likidite ve veri güven puanlarının özetidir.
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}


function VerificationCenter({
  records,
  regionalData,
}: {
  records: CloudRecord[];
  regionalData: RegionalDataRecord[];
}) {
  const active = records.filter((item) => !item.is_archived);
  const verifiedRegional = regionalData.filter(
    (item) => item.averageM2 > 0 && item.dataConfidence > 0 && item.sampleSize > 0,
  );

  const reportCompleteness = (item: CloudRecord) => {
    const checks = [
      Boolean(item.city?.trim()),
      Boolean(item.district?.trim()),
      Boolean(item.neighborhood?.trim()),
      Boolean(item.property_type?.trim()),
      Boolean(item.area?.trim()),
      parseMoney(item.asking_price) > 0,
      Boolean(item.notes?.trim()),
      Boolean(item.report?.trim()),
      Boolean(item.decision?.trim()),
      scoresFromReport(item.report ?? "").trust !== null,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  };

  const completenessValues = active.map(reportCompleteness);
  const averageCompleteness = completenessValues.length
    ? Math.round(completenessValues.reduce((sum, value) => sum + value, 0) / completenessValues.length)
    : 0;
  const strongReports = completenessValues.filter((value) => value >= 80).length;
  const weakReports = completenessValues.filter((value) => value < 60).length;
  const averageRegionalConfidence = verifiedRegional.length
    ? Math.round(
        verifiedRegional.reduce((sum, item) => sum + item.dataConfidence, 0) /
          verifiedRegional.length,
      )
    : 0;

  const issues = active
    .map((item) => {
      const missing: string[] = [];
      if (!item.neighborhood?.trim()) missing.push("mahalle");
      if (!item.area?.trim()) missing.push("alan");
      if (parseMoney(item.asking_price) <= 0) missing.push("talep fiyatı");
      if (!item.notes?.trim()) missing.push("açıklama/not");
      if (!item.report?.trim()) missing.push("AI raporu");
      if (scoresFromReport(item.report ?? "").trust === null) missing.push("veri güven skoru");
      return { item, missing, completeness: reportCompleteness(item) };
    })
    .filter((entry) => entry.missing.length > 0)
    .sort((a, b) => a.completeness - b.completeness)
    .slice(0, 12);

  return (
    <>
      <section style={statsGrid}>
        <Stat title="Ortalama Tamlık" value={averageCompleteness} suffix="/100" text="Aktif rapor veri bütünlüğü" />
        <Stat title="Güçlü Rapor" value={strongReports} text="Tamlık puanı 80 ve üzeri" />
        <Stat title="Eksik Rapor" value={weakReports} text="Tamlık puanı 60 altında" />
        <Stat title="Bölgesel Güven" value={averageRegionalConfidence || "—"} suffix={averageRegionalConfidence ? "/100" : ""} text="Doğrulanmış piyasa verisi ortalaması" />
      </section>

      <section style={twoColumnGrid}>
        <article style={panelStyle}>
          <div style={sectionHeader}>
            <div>
              <div style={eyebrow}>KALİTE KAPISI</div>
              <h2 style={sectionTitle}>Veri Güven Standartları</h2>
            </div>
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {[
              ["Konum bütünlüğü", "İl, ilçe ve mahalle birlikte girilmeli."],
              ["Fiyat bütünlüğü", "Alan ve talep fiyatı olmadan m² analizi kesinleştirilmez."],
              ["Piyasa doğrulaması", "Bölgesel kayıt; kaynak, dönem ve örneklem büyüklüğü içermeli."],
              ["AI şeffaflığı", "Eksik bilgi raporda açıkça belirtilmeli, uydurma veri kullanılmamalı."],
              ["Karar izi", "Her rapor karar, skorlar ve oluşturulma tarihiyle bulutta saklanmalı."],
            ].map(([title, text]) => (
              <div key={title} style={qualityRuleStyle}>
                <strong style={{ color: "#153a65" }}>{title}</strong>
                <span style={{ color: "#58708d", fontSize: 13 }}>{text}</span>
              </div>
            ))}
          </div>
        </article>

        <article style={panelStyle}>
          <div style={sectionHeader}>
            <div>
              <div style={eyebrow}>TÜRKİYE VERİ MOTORU</div>
              <h2 style={sectionTitle}>Doğrulanmış Veri Özeti</h2>
            </div>
          </div>
          <DashboardScore label="Ortalama Veri Güveni" value={averageRegionalConfidence || null} />
          <DashboardScore label="Kaynaklı Kayıt Oranı" value={regionalData.length ? Math.round((verifiedRegional.length / regionalData.length) * 100) : null} />
          <DashboardScore label="Rapor Tamlık Ortalaması" value={averageCompleteness || null} />
          <div style={{ ...emptyState, marginTop: 12 }}>
            {verifiedRegional.length} doğrulanmış bölgesel kayıt · {regionalData.length} toplam kayıt
          </div>
        </article>
      </section>

      <section style={panelStyle}>
        <div style={sectionHeader}>
          <div>
            <div style={eyebrow}>EKSİK VERİ RADARI</div>
            <h2 style={sectionTitle}>İyileştirilmesi Gereken Raporlar</h2>
          </div>
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          {issues.map(({ item, missing, completeness }) => (
            <article key={item.id} style={recordStyle}>
              <div style={{ flex: "1 1 520px" }}>
                <strong style={{ color: "#153a65" }}>{locationText(item) || "Konum belirtilmedi"}</strong>
                <div style={{ color: "#6b7f96", fontSize: 13, marginTop: 5 }}>
                  Eksikler: {missing.join(", ")}
                </div>
              </div>
              <span style={completeness >= 80 ? winnerBadge : compositeBadge}>Tamlık {completeness}/100</span>
            </article>
          ))}
          {!issues.length ? (
            <div style={emptyState}>Aktif raporların veri bütünlüğü yeterli görünüyor.</div>
          ) : null}
        </div>
      </section>
    </>
  );
}


type MarketplaceDraft = {
  id: string;
  title: string;
  city: string;
  district: string;
  neighborhood: string;
  propertyType: string;
  transaction: "Satılık" | "Kiralık";
  price: string;
  area: string;
  description?: string;
  createdAt: string;
};

type LiveListing = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  city: string;
  district: string | null;
  neighborhood: string | null;
  property_type: string;
  transaction_type: "Satılık" | "Kiralık";
  price: number;
  area_m2: number | null;
  status: "draft" | "published" | "paused" | "sold" | "rented" | "archived";
  verification_status: "unverified" | "pending" | "verified" | "rejected";
  media: string[] | null;
  created_at: string;
  updated_at: string;
};

type ListingInquiry = {
  id: string;
  listing_id: string;
  sender_user_id: string;
  recipient_user_id: string;
  message: string;
  status: "new" | "read" | "closed";
  lead_status: "new" | "contacted" | "qualified" | "visit" | "offer" | "won" | "lost";
  priority: "low" | "normal" | "high" | "urgent";
  owner_note: string | null;
  follow_up_at: string | null;
  created_at: string;
  updated_at?: string;
};

type ListingInquiryMessage = {
  id: string;
  inquiry_id: string;
  sender_user_id: string;
  message: string;
  created_at: string;
};

function StrategicExpansionCenter({
  records,
  regionalData,
  user,
}: {
  records: CloudRecord[];
  regionalData: RegionalDataRecord[];
  user: User | null;
}) {
  const [section, setSection] = useState<"command" | "roadmap" | "ai" | "market" | "listings" | "admin" | "membership" | "pdf" | "enterprise" | "crm" | "project">("command");
  const [aiRecordId, setAiRecordId] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiResult, setAiResult] = useState("");
  const [marketCity, setMarketCity] = useState("Tümü");
  const [marketPropertyType, setMarketPropertyType] = useState("Tümü");
  const [locationProvinces, setLocationProvinces] = useState<TurkiyeLocationOption[]>([]);
  const [locationDistricts, setLocationDistricts] = useState<TurkiyeLocationOption[]>([]);
  const [locationNeighborhoods, setLocationNeighborhoods] = useState<TurkiyeLocationOption[]>([]);
  const [selectedProvinceId, setSelectedProvinceId] = useState(1);
  const [selectedDistrictId, setSelectedDistrictId] = useState(0);
  const [selectedNeighborhoodId, setSelectedNeighborhoodId] = useState(0);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [locationSource, setLocationSource] = useState<"live" | "cache" | "waiting">("waiting");
  const [locationRefreshNonce, setLocationRefreshNonce] = useState(0);
  const [locationDatasetMeta, setLocationDatasetMeta] = useState({ version: "2025", lastUpdated: "2026-05-21" });
  const [marketSort, setMarketSort] = useState<"confidence" | "price" | "change" | "liquidity">("confidence");
  const [compareCityA, setCompareCityA] = useState("Adana");
  const [compareCityB, setCompareCityB] = useState("Mersin");
  const [projectionHorizon, setProjectionHorizon] = useState<"1" | "3" | "5">("3");
  const [assistantBudget, setAssistantBudget] = useState("3000000");
  const [assistantTargetM2, setAssistantTargetM2] = useState("100");
  const [assistantCashRatio, setAssistantCashRatio] = useState("40");
  const [assistantStrategy, setAssistantStrategy] = useState<"rent" | "balanced" | "growth">("balanced");
  const [negotiationListingPrice, setNegotiationListingPrice] = useState("2500000");
  const [negotiationCondition, setNegotiationCondition] = useState<"new" | "good" | "renovation">("good");
  const [negotiationSellerUrgency, setNegotiationSellerUrgency] = useState<"low" | "medium" | "high">("medium");
  const [negotiationCompetition, setNegotiationCompetition] = useState<"low" | "medium" | "high">("medium");
  const [financeMonthlyIncome, setFinanceMonthlyIncome] = useState("120000");
  const [financeOtherDebt, setFinanceOtherDebt] = useState("0");
  const [financeDownPayment, setFinanceDownPayment] = useState("1000000");
  const [financeTerm, setFinanceTerm] = useState<"120" | "180" | "240">("120");
  const [financeMonthlyRate, setFinanceMonthlyRate] = useState("2.89");
  const [landArea, setLandArea] = useState("1000");
  const [far, setFar] = useState("1.50");
  const [saleM2, setSaleM2] = useState("45000");
  const [costM2, setCostM2] = useState("22000");
  const [landCost, setLandCost] = useState("12000000");
  const [membershipPlan, setMembershipPlan] = useState<"standard" | "premium" | "gold">("premium");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly");
  const [membershipNotice, setMembershipNotice] = useState("");
  const [monthlyAnalysisNeed, setMonthlyAnalysisNeed] = useState(24);
  const [pdfRecordId, setPdfRecordId] = useState("");
  const [pdfAudience, setPdfAudience] = useState<"investor" | "bank" | "customer">("investor");
  const [pdfNotice, setPdfNotice] = useState("");
  const [enterpriseRole, setEnterpriseRole] = useState<"bank" | "valuation" | "developer" | "agency" | "technical" | "investor">("bank");
  const [listingQuery, setListingQuery] = useState("");
  const [listingTransaction, setListingTransaction] = useState<"Tümü" | "Satılık" | "Kiralık">("Tümü");
  const [listingPropertyType, setListingPropertyType] = useState("Tümü");
  const [listingSort, setListingSort] = useState<"ai" | "priceLow" | "priceHigh">("ai");
  const [listingNotice, setListingNotice] = useState("");
  const [listingDrafts, setListingDrafts] = useState<MarketplaceDraft[]>([]);
  const [listingDraft, setListingDraft] = useState<MarketplaceDraft>({
    id: "", title: "", city: "", district: "", neighborhood: "", propertyType: "Konut", transaction: "Satılık", price: "", area: "", description: "", createdAt: "",
  });
  const [liveListings, setLiveListings] = useState<LiveListing[]>([]);
  const [listingLoading, setListingLoading] = useState(false);
  const [listingSaving, setListingSaving] = useState(false);
  const [listingBackendReady, setListingBackendReady] = useState<boolean | null>(null);
  const [listingFiles, setListingFiles] = useState<File[]>([]);
  const [listingFilePreviews, setListingFilePreviews] = useState<string[]>([]);
  const [listingPhotoInsights, setListingPhotoInsights] = useState<Array<{ width: number; height: number; brightness: number; score: number; label: string; note: string; orientation: "yatay" | "dikey" | "kare"; signature: number[] }>>([]);
  const [listingAiMode, setListingAiMode] = useState<"correct" | "enrich" | "short" | "premium">("enrich");
  const [listingAiLoading, setListingAiLoading] = useState(false);
  const [listingAiSuggestion, setListingAiSuggestion] = useState("");
  const [selectedListingId, setSelectedListingId] = useState("");
  const [selectedListingImageIndex, setSelectedListingImageIndex] = useState(0);
  const [listingVerificationSaving, setListingVerificationSaving] = useState(false);
  const [favoriteListingIds, setFavoriteListingIds] = useState<string[]>([]);
  const [listingEngagementReady, setListingEngagementReady] = useState<boolean | null>(null);
  const [listingInquiryMessage, setListingInquiryMessage] = useState("");
  const [listingInquirySending, setListingInquirySending] = useState(false);
  const [listingInquiryNotice, setListingInquiryNotice] = useState("");
  const [listingBuyerAiLoading, setListingBuyerAiLoading] = useState(false);
  const [listingBuyerAiResult, setListingBuyerAiResult] = useState("");
  const [listingAnalyticsReady, setListingAnalyticsReady] = useState<boolean | null>(null);
  const [listingOwnerStats, setListingOwnerStats] = useState({ uniqueViewers: 0, totalViews: 0, favorites: 0, inquiries: 0, unreadInquiries: 0 });
  const [listingOwnerStatsLoading, setListingOwnerStatsLoading] = useState(false);
  const [listingCrmReady, setListingCrmReady] = useState<boolean | null>(null);
  const [listingCrmOpen, setListingCrmOpen] = useState(false);
  const [listingInbox, setListingInbox] = useState<ListingInquiry[]>([]);
  const [listingInboxLoading, setListingInboxLoading] = useState(false);
  const [listingInboxFilter, setListingInboxFilter] = useState<"all" | "new" | "qualified" | "followup">("all");
  const [selectedInquiryId, setSelectedInquiryId] = useState("");
  const [listingThread, setListingThread] = useState<ListingInquiryMessage[]>([]);
  const [listingReply, setListingReply] = useState("");
  const [listingReplySending, setListingReplySending] = useState(false);
  const [listingLeadAiLoading, setListingLeadAiLoading] = useState(false);
  const [listingLeadAiResult, setListingLeadAiResult] = useState("");



  useEffect(() => {
    const handleModuleNavigation = (event: Event) => {
      const detail = (event as CustomEvent<{ section?: string; role?: string }>).detail;
      if (!detail?.section) return;
      const allowedSections = ["command", "roadmap", "ai", "market", "listings", "admin", "membership", "pdf", "enterprise", "crm", "project"];
      if (allowedSections.includes(detail.section)) setSection(detail.section as typeof section);
      if (["bank", "valuation", "developer", "agency", "technical", "investor"].includes(detail.role || "")) {
        setEnterpriseRole(detail.role as typeof enterpriseRole);
      }
    };
    window.addEventListener("yasam-module-nav", handleModuleNavigation as EventListener);
    return () => window.removeEventListener("yasam-module-nav", handleModuleNavigation as EventListener);
  }, []);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("yasam-ai:listing-drafts:v1");
      if (raw) {
        const parsed = JSON.parse(raw) as MarketplaceDraft[];
        if (Array.isArray(parsed)) setListingDrafts(parsed);
      }
    } catch {
      // İlan taslakları yardımcı bir yerel özelliktir; bozuk kayıt sayfayı durdurmaz.
    }
  }, []);

  useEffect(() => {
    void loadLiveListings();
    // Kullanıcı değiştiğinde kendi taslak/yayın kayıtları RLS üzerinden yeniden okunur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    void loadListingEngagement();
    // Favoriler yalnızca oturumdaki kullanıcı için RLS üzerinden okunur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    void loadListingInbox();
    // İlan sahibinin alıcı talepleri oturum değiştiğinde RLS üzerinden yeniden okunur.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    const urls = listingFiles.map((file) => URL.createObjectURL(file));
    setListingFilePreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [listingFiles]);

  useEffect(() => {
    let cancelled = false;
    if (!listingFilePreviews.length) {
      setListingPhotoInsights([]);
      return;
    }
    Promise.all(listingFilePreviews.map((src) => new Promise<{ width: number; height: number; brightness: number; score: number; label: string; note: string; orientation: "yatay" | "dikey" | "kare"; signature: number[] }>((resolve) => {
      const image = new Image();
      image.onload = () => {
        const width = image.naturalWidth || 0;
        const height = image.naturalHeight || 0;
        const ratio = height > 0 ? width / height : 1;
        const orientation: "yatay" | "dikey" | "kare" = ratio > 1.18 ? "yatay" : ratio < .84 ? "dikey" : "kare";
        let brightness = 128;
        let signature: number[] = [];
        try {
          const canvas = document.createElement("canvas");
          const sampleWidth = 36;
          const sampleHeight = Math.max(24, Math.round(sampleWidth / Math.max(.4, Math.min(2.5, ratio))));
          canvas.width = sampleWidth;
          canvas.height = sampleHeight;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(image, 0, 0, sampleWidth, sampleHeight);
            const data = ctx.getImageData(0, 0, sampleWidth, sampleHeight).data;
            let total = 0;
            for (let i = 0; i < data.length; i += 16) total += (data[i] + data[i + 1] + data[i + 2]) / 3;
            brightness = Math.round(total / Math.max(1, data.length / 16));
          }
          const signatureCanvas = document.createElement("canvas");
          signatureCanvas.width = 8;
          signatureCanvas.height = 8;
          const signatureCtx = signatureCanvas.getContext("2d", { willReadFrequently: true });
          if (signatureCtx) {
            signatureCtx.drawImage(image, 0, 0, 8, 8);
            const pixels = signatureCtx.getImageData(0, 0, 8, 8).data;
            signature = [];
            for (let i = 0; i < pixels.length; i += 4) {
              signature.push(Math.round((pixels[i] * .299) + (pixels[i + 1] * .587) + (pixels[i + 2] * .114)));
            }
          }
        } catch {
          brightness = 128;
          signature = [];
        }
        let score = 52;
        if (orientation === "yatay") score += 22;
        else if (orientation === "kare") score += 10;
        if (width >= 1400) score += 12;
        else if (width >= 900) score += 7;
        else if (width < 640) score -= 12;
        if (brightness >= 75 && brightness <= 205) score += 12;
        else if (brightness < 55 || brightness > 225) score -= 14;
        score = Math.max(0, Math.min(100, score));
        const label = score >= 82 ? "Kapak adayı" : score >= 68 ? "Güçlü kare" : score >= 52 ? "Kullanılabilir" : "İyileştir";
        const note = orientation === "dikey" ? "Yatay bir alternatif, vitrin görünümünde daha güçlü olabilir." : brightness < 65 ? "Fotoğraf karanlık görünüyor; daha aydınlık çekim önerilir." : brightness > 215 ? "Işık fazla yüksek; detay kaybını kontrol edin." : width < 900 ? "Daha yüksek çözünürlüklü bir kare tercih edin." : "Işık ve kadraj ilan vitrini için uygun görünüyor.";
        resolve({ width, height, brightness, score, label, note, orientation, signature });
      };
      image.onerror = () => resolve({ width: 0, height: 0, brightness: 0, score: 35, label: "Kontrol et", note: "Görsel kalite bilgisi okunamadı.", orientation: "kare", signature: [] });
      image.src = src;
    }))).then((rows) => { if (!cancelled) setListingPhotoInsights(rows); });
    return () => { cancelled = true; };
  }, [listingFilePreviews]);

  const listingRecommendedCoverIndex = useMemo(() => {
    if (!listingPhotoInsights.length) return -1;
    return listingPhotoInsights.reduce((best, row, index, rows) => row.score > rows[best].score ? index : best, 0);
  }, [listingPhotoInsights]);

  const listingPhotoRelations = useMemo(() => {
    const relations = listingPhotoInsights.map(() => ({ duplicateOf: -1, similarity: 0 }));
    const similarityOf = (left: number[], right: number[]) => {
      if (!left.length || left.length !== right.length) return 0;
      const difference = left.reduce((sum, value, index) => sum + Math.abs(value - right[index]), 0) / left.length;
      return Math.max(0, Math.min(100, Math.round(100 - (difference / 255) * 100)));
    };
    for (let index = 1; index < listingPhotoInsights.length; index += 1) {
      let bestSimilarity = 0;
      let duplicateOf = -1;
      for (let candidate = 0; candidate < index; candidate += 1) {
        const similarity = similarityOf(listingPhotoInsights[index].signature, listingPhotoInsights[candidate].signature);
        if (similarity > bestSimilarity) {
          bestSimilarity = similarity;
          duplicateOf = candidate;
        }
      }
      if (bestSimilarity >= 93) relations[index] = { duplicateOf, similarity: bestSimilarity };
    }
    return relations;
  }, [listingPhotoInsights]);

  const listingPhotoCoach = useMemo(() => {
    const duplicateCount = listingPhotoRelations.filter((item) => item.duplicateOf >= 0).length;
    const lowQualityCount = listingPhotoInsights.filter((item) => item.score < 52).length;
    const verticalCount = listingPhotoInsights.filter((item) => item.orientation === "dikey").length;
    const uniqueCount = Math.max(0, listingFiles.length - duplicateCount);
    const warnings: string[] = [];
    if (duplicateCount) warnings.push(`${duplicateCount} kare birbirine çok benziyor; tekrarları azaltın.`);
    if (lowQualityCount) warnings.push(`${lowQualityCount} kare teknik olarak zayıf; ışık veya çözünürlüğü iyileştirin.`);
    if (verticalCount > Math.max(2, Math.ceil(listingFiles.length / 2))) warnings.push("Galeride dikey kare oranı yüksek; yatay fotoğraflar vitrin görünümünü güçlendirir.");
    if (listingFiles.length > 0 && listingRecommendedCoverIndex >= 0 && listingRecommendedCoverIndex !== 0) warnings.push(`${listingRecommendedCoverIndex + 1}. fotoğraf kapak için daha güçlü aday.`);
    if (!warnings.length && listingFiles.length) warnings.push("Fotoğraf seti dengeli görünüyor; ilan vitrini için güçlü bir başlangıç.");
    return { duplicateCount, lowQualityCount, verticalCount, uniqueCount, warnings };
  }, [listingFiles.length, listingPhotoInsights, listingPhotoRelations, listingRecommendedCoverIndex]);

  const listingDraftQuality = useMemo(() => {
    const photoCount = listingFiles.length;
    const uniquePhotoCount = Math.max(0, photoCount - listingPhotoCoach.duplicateCount);
    const photoQuality = listingPhotoInsights.length ? Math.round(listingPhotoInsights.reduce((sum, row) => sum + row.score, 0) / listingPhotoInsights.length) : 0;
    const descriptionLength = listingDraft.description.trim().length;
    const basicsReady = Boolean(listingDraft.title.trim() && listingDraft.city.trim() && listingDraft.district.trim() && listingDraft.price && listingDraft.area);
    const score = Math.max(0, Math.min(100, Math.round(
      Math.min(40, uniquePhotoCount * 5) +
      Math.min(15, photoQuality * .15) +
      Math.min(20, descriptionLength / 4) +
      (basicsReady ? 15 : 5) +
      (listingDraft.neighborhood.trim() ? 10 : 0) -
      Math.min(10, listingPhotoCoach.duplicateCount * 3) -
      Math.min(8, listingPhotoCoach.lowQualityCount * 2)
    )));
    const level = score >= 85 ? "Premium" : score >= 70 ? "Güçlü" : score >= 50 ? "Gelişiyor" : "Eksik";
    return { score, level, photoQuality, basicsReady, uniquePhotoCount };
  }, [listingDraft, listingFiles.length, listingPhotoInsights, listingPhotoCoach.duplicateCount, listingPhotoCoach.lowQualityCount]);

  function makeListingFileCover(index: number) {
    setListingFiles((current) => {
      if (index <= 0 || index >= current.length) return current;
      const next = [...current];
      const [picked] = next.splice(index, 1);
      return picked ? [picked, ...next] : current;
    });
  }

  function removeListingFile(index: number) {
    setListingFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
  }

  async function loadLiveListings() {
    setListingLoading(true);
    const { data, error: listingsError } = await supabase
      .from("listings")
      .select("id,user_id,title,description,city,district,neighborhood,property_type,transaction_type,price,area_m2,status,verification_status,media,created_at,updated_at")
      .order("created_at", { ascending: false })
      .limit(250);

    if (listingsError) {
      const missingTable = /relation .*listings.* does not exist|Could not find the table|schema cache/i.test(listingsError.message);
      setListingBackendReady(missingTable ? false : null);
      if (!missingTable) setListingNotice(`Canlı ilan servisi okunamadı: ${listingsError.message}`);
      setLiveListings([]);
    } else {
      setListingBackendReady(true);
      setLiveListings((data ?? []) as LiveListing[]);
    }
    setListingLoading(false);
  }

  async function loadListingEngagement() {
    if (!user) {
      setFavoriteListingIds([]);
      setListingEngagementReady(null);
      return;
    }
    const { data, error: favoriteError } = await supabase
      .from("listing_favorites")
      .select("listing_id")
      .eq("user_id", user.id);
    if (favoriteError) {
      const missing = /relation .*listing_favorites.* does not exist|Could not find the table|schema cache/i.test(favoriteError.message);
      setListingEngagementReady(missing ? false : null);
      if (!missing) setListingInquiryNotice(`Favori servisi okunamadı: ${favoriteError.message}`);
      setFavoriteListingIds([]);
      return;
    }
    setListingEngagementReady(true);
    setFavoriteListingIds((data ?? []).map((row: { listing_id: string }) => row.listing_id));
  }

  async function recordLiveListingView(listingId: string) {
    if (!user || listingAnalyticsReady === false) return;
    const { error } = await supabase.rpc("record_listing_view", { target_listing_id: listingId });
    if (error) {
      const missing = /record_listing_view|function .* does not exist|schema cache/i.test(error.message);
      setListingAnalyticsReady(missing ? false : null);
      if (!missing) setListingInquiryNotice(`Görüntülenme kaydı alınamadı: ${error.message}`);
    } else {
      setListingAnalyticsReady(true);
    }
  }

  async function loadListingOwnerStats(listingId: string) {
    if (!user) return;
    setListingOwnerStatsLoading(true);
    const { data, error } = await supabase.rpc("get_listing_owner_stats", { target_listing_id: listingId });
    if (error) {
      const missing = /get_listing_owner_stats|function .* does not exist|schema cache/i.test(error.message);
      setListingAnalyticsReady(missing ? false : null);
      if (!missing && !/not_authorized/i.test(error.message)) setListingInquiryNotice(`İlan performansı okunamadı: ${error.message}`);
      setListingOwnerStats({ uniqueViewers: 0, totalViews: 0, favorites: 0, inquiries: 0, unreadInquiries: 0 });
    } else {
      const row = Array.isArray(data) ? data[0] : data;
      setListingAnalyticsReady(true);
      setListingOwnerStats({
        uniqueViewers: Number(row?.unique_viewers ?? 0),
        totalViews: Number(row?.total_views ?? 0),
        favorites: Number(row?.favorite_count ?? 0),
        inquiries: Number(row?.inquiry_count ?? 0),
        unreadInquiries: Number(row?.unread_inquiry_count ?? 0),
      });
    }
    setListingOwnerStatsLoading(false);
  }

  async function loadListingInbox() {
    if (!user) {
      setListingInbox([]);
      setListingCrmReady(null);
      return;
    }
    setListingInboxLoading(true);
    const { data, error } = await supabase
      .from("listing_inquiries")
      .select("id,listing_id,sender_user_id,recipient_user_id,message,status,lead_status,priority,owner_note,follow_up_at,created_at,updated_at")
      .eq("recipient_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(250);
    if (error) {
      const missing = /lead_status|owner_note|follow_up_at|schema cache|column .* does not exist/i.test(error.message);
      setListingCrmReady(missing ? false : null);
      if (!missing) setListingInquiryNotice(`CRM mesaj kutusu okunamadı: ${error.message}`);
      setListingInbox([]);
    } else {
      setListingCrmReady(true);
      setListingInbox((data ?? []) as ListingInquiry[]);
    }
    setListingInboxLoading(false);
  }

  async function openListingInquiry(inquiry: ListingInquiry) {
    setSelectedInquiryId(inquiry.id);
    setListingLeadAiResult("");
    setListingReply("");
    if (inquiry.status === "new") {
      const { error } = await supabase.from("listing_inquiries").update({ status: "read", updated_at: new Date().toISOString() }).eq("id", inquiry.id).eq("recipient_user_id", user?.id ?? "");
      if (!error) setListingInbox((current) => current.map((item) => item.id === inquiry.id ? { ...item, status: "read" } : item));
    }
    const { data, error } = await supabase
      .from("listing_inquiry_messages")
      .select("id,inquiry_id,sender_user_id,message,created_at")
      .eq("inquiry_id", inquiry.id)
      .order("created_at", { ascending: true });
    if (error) {
      const missing = /listing_inquiry_messages|relation .* does not exist|schema cache/i.test(error.message);
      setListingCrmReady(missing ? false : null);
      if (!missing) setListingInquiryNotice(`Mesaj geçmişi okunamadı: ${error.message}`);
      setListingThread([]);
    } else {
      setListingCrmReady(true);
      setListingThread((data ?? []) as ListingInquiryMessage[]);
    }
  }

  async function updateListingLead(inquiryId: string, changes: Partial<Pick<ListingInquiry, "lead_status" | "priority" | "owner_note" | "follow_up_at" | "status">>) {
    if (!user) return;
    const { error } = await supabase.from("listing_inquiries").update({ ...changes, updated_at: new Date().toISOString() }).eq("id", inquiryId).eq("recipient_user_id", user.id);
    if (error) { setListingInquiryNotice(`CRM kaydı güncellenemedi: ${error.message}`); return; }
    setListingInbox((current) => current.map((item) => item.id === inquiryId ? { ...item, ...changes } : item));
    setListingInquiryNotice("Alıcı talebi CRM içinde güncellendi.");
  }

  async function sendListingInquiryReply(inquiry: ListingInquiry) {
    if (!user) return;
    const message = listingReply.trim();
    if (message.length < 2) { setListingInquiryNotice("Yanıt en az 2 karakter olmalıdır."); return; }
    if (inquiry.status === "closed") { setListingInquiryNotice("Kapalı talebe yanıt gönderilemez. Önce talebi yeniden açın."); return; }
    setListingReplySending(true);
    const { error } = await supabase.from("listing_inquiry_messages").insert({ inquiry_id: inquiry.id, sender_user_id: user.id, message });
    if (error) setListingInquiryNotice(`Yanıt gönderilemedi: ${error.message}`);
    else {
      setListingReply("");
      await updateListingLead(inquiry.id, { lead_status: inquiry.lead_status === "new" ? "contacted" : inquiry.lead_status, status: "read" });
      await openListingInquiry({ ...inquiry, status: "read", lead_status: inquiry.lead_status === "new" ? "contacted" : inquiry.lead_status });
      setListingInquiryNotice("Yanıt güvenli mesaj kanalı üzerinden gönderildi.");
    }
    setListingReplySending(false);
  }

  async function runListingLeadAi(inquiry: ListingInquiry) {
    const listing = liveListings.find((item) => item.id === inquiry.listing_id) ?? null;
    setListingLeadAiLoading(true);
    setListingLeadAiResult("");
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: `Sen Yaşam AI Gayrimenkul Lead Ko-Pilotusun. İlan sahibine gelen alıcı mesajını satış baskısı kurmadan, kısa ve açıklanabilir biçimde özetle. Verilmeyen bütçe, finansman, telefon veya kişisel bilgiyi uydurma.\n\nİLAN\n${listing ? `Başlık: ${listing.title}\nKonum: ${[listing.city,listing.district,listing.neighborhood].filter(Boolean).join(" / ")}\nFiyat: ${listing.price} TL\nTür: ${listing.property_type}` : "İlan bilgisi sınırlı"}\n\nALICI MESAJI\n${inquiry.message}\n\nCRM DURUMU\nAşama: ${inquiry.lead_status}\nÖncelik: ${inquiry.priority}\n\nYanıtı MUTLAKA şu başlıklarla ver:\nTALEP ÖZETİ: tek cümle\nALICI NİYETİ: Güçlü / Orta / Erken aşama / Belirsiz ve kısa gerekçe\nEKSİK BİLGİ: karar için sorulması gereken en fazla 3 bilgi\nÖNERİLEN SONRAKİ ADIM: tek net aksiyon\nÖNERİLEN YANIT: kullanıcıya gönderilebilecek kısa, nazik mesaj taslağı` })
      });
      const data: unknown = await response.json();
      if (!response.ok) throw new Error(extractText(data) || "AI lead özeti üretilemedi.");
      setListingLeadAiResult(extractText(data).trim());
    } catch (error) {
      setListingInquiryNotice(error instanceof Error ? error.message : "AI lead özeti çalıştırılamadı.");
    } finally { setListingLeadAiLoading(false); }
  }

  async function toggleListingFavorite(listingId: string) {
    if (!user) { setListingInquiryNotice("Favorilere eklemek için oturum açık olmalıdır."); return; }
    if (listingEngagementReady === false) { setListingInquiryNotice("Favoriler altyapısı için FAZ 2 etkileşim SQL dosyasını çalıştırın."); return; }
    const active = favoriteListingIds.includes(listingId);
    if (active) {
      const { error } = await supabase.from("listing_favorites").delete().eq("listing_id", listingId).eq("user_id", user.id);
      if (error) { setListingInquiryNotice(error.message); return; }
      setFavoriteListingIds((current) => current.filter((id) => id !== listingId));
    } else {
      const { error } = await supabase.from("listing_favorites").insert({ listing_id: listingId, user_id: user.id });
      if (error) { setListingInquiryNotice(error.message); return; }
      setFavoriteListingIds((current) => Array.from(new Set([...current, listingId])));
    }
  }

  async function shareListing(listing: LiveListing) {
    const location = [listing.city, listing.district, listing.neighborhood].filter(Boolean).join(" / ");
    const text = `${listing.title} · ${location} · ${Math.round(Number(listing.price || 0)).toLocaleString("tr-TR")} TL`;
    try {
      if (navigator.share) await navigator.share({ title: listing.title, text });
      else { await navigator.clipboard.writeText(text); setListingInquiryNotice("İlan özeti panoya kopyalandı."); }
    } catch (shareError) {
      if (shareError instanceof Error && shareError.name !== "AbortError") setListingInquiryNotice("İlan paylaşımı tamamlanamadı.");
    }
  }

  async function sendListingInquiry(listing: LiveListing) {
    if (!user) { setListingInquiryNotice("Mesaj göndermek için oturum açık olmalıdır."); return; }
    if (listing.user_id === user.id) { setListingInquiryNotice("Bu ilan size ait; kendinize mesaj gönderemezsiniz."); return; }
    const message = listingInquiryMessage.trim();
    if (message.length < 8) { setListingInquiryNotice("Mesajınız en az 8 karakter olmalıdır."); return; }
    if (listingEngagementReady === false) { setListingInquiryNotice("Mesaj altyapısı için FAZ 2 etkileşim SQL dosyasını çalıştırın."); return; }
    setListingInquirySending(true); setListingInquiryNotice("");
    const { error } = await supabase.from("listing_inquiries").insert({ listing_id: listing.id, sender_user_id: user.id, recipient_user_id: listing.user_id, message });
    if (error) setListingInquiryNotice(`Mesaj gönderilemedi: ${error.message}`);
    else { setListingInquiryMessage(""); setListingInquiryNotice("Mesaj ilan sahibine güvenli kanal üzerinden iletildi."); }
    setListingInquirySending(false);
  }

  async function runListingBuyerAi(listing: LiveListing) {
    const intelligence = selectedListingIntelligence;
    setListingBuyerAiLoading(true); setListingBuyerAiResult(""); setListingInquiryNotice("");
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: `Sen Yaşam AI Alıcı Karar Asistanı'sın. Kullanıcıya bu ilan için kısa, açıklanabilir ve temkinli karar desteği ver. Verilmeyen bilgiyi uydurma; resmi ekspertiz veya hukuki doğrulama yapılmış gibi davranma.\n\nİLAN\nBaşlık: ${listing.title}\nKonum: ${[listing.city, listing.district, listing.neighborhood].filter(Boolean).join(" / ")}\nTür: ${listing.property_type}\nİşlem: ${listing.transaction_type}\nFiyat: ${listing.price} TL\nAlan: ${listing.area_m2 || "Belirtilmedi"} m²\nAçıklama: ${listing.description || "Yok"}\nDoğrulama: ${listing.verification_status}\nFotoğraf sayısı: ${(listing.media || []).length}\n\nYAŞAM AI VERİ SİNYALİ\nBölge m² ortalaması: ${intelligence?.marketM2 || "Veri yok"}\nVeri bazlı tahmini değer: ${intelligence?.estimatedValue || "Veri yok"}\nFiyat farkı: ${intelligence?.differencePercent != null ? `${intelligence.differencePercent.toFixed(1)}%` : "Veri yok"}\nVeri güveni: ${intelligence?.confidence || 0}/100\n\nYanıtı MUTLAKA şu başlıklarla ver:\nNET GÖRÜŞ: ALMAYA DEĞER / PAZARLIKLA DEĞER / BEKLE / VERİ YETERSİZ seçeneklerinden biri ve tek cümle açıklama\nGÜÇLÜ NOKTALAR: en fazla 3 kısa madde\nDİKKAT: en fazla 3 kısa madde\nSONRAKİ ADIM: şimdi yapılacak tek en doğru hareket` })
      });
      const data: unknown = await response.json();
      if (!response.ok) throw new Error(extractText(data) || "AI alıcı değerlendirmesi üretilemedi.");
      setListingBuyerAiResult(extractText(data).trim());
    } catch (error) {
      setListingInquiryNotice(error instanceof Error ? error.message : "AI alıcı değerlendirmesi çalıştırılamadı.");
    } finally { setListingBuyerAiLoading(false); }
  }

  function listingImageUrl(path: string | undefined) {
    if (!path) return "";
    return supabase.storage.from("listing-media").getPublicUrl(path).data.publicUrl;
  }

  async function uploadListingMedia(listingId: string, files: File[]) {
    if (!user || !files.length) return [] as string[];
    const uploaded: string[] = [];
    for (const file of files.slice(0, 12)) {
      if (!file.type.startsWith("image/")) continue;
      if (file.size > 8 * 1024 * 1024) throw new Error(`${file.name} 8 MB sınırını aşıyor.`);
      const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${user.id}/${listingId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
      const { error: uploadError } = await supabase.storage.from("listing-media").upload(path, file, { upsert: false, contentType: file.type });
      if (uploadError) throw uploadError;
      uploaded.push(path);
    }
    return uploaded;
  }

  async function generateListingAiDescription(mode: "correct" | "enrich" | "short" | "premium" = listingAiMode) {
    const currentText = (listingDraft.description || "").trim();
    if (!currentText) {
      setListingNotice("Önce kendi ilan açıklamanızı birkaç cümleyle yazın; AI yalnızca verdiğiniz bilgileri düzenler ve zenginleştirir.");
      return;
    }
    setListingAiLoading(true);
    setListingAiSuggestion("");
    setListingNotice("");
    const modeInstruction = mode === "correct"
      ? "Yalnızca yazım, noktalama ve anlatım bozukluklarını düzelt; anlamı ve bilgileri değiştirme."
      : mode === "short"
        ? "Metni daha kısa, taranabilir ve güçlü hale getir; önemli bilgileri koru."
        : mode === "premium"
          ? "Metni premium ve güven veren bir emlak ilanı diline dönüştür; abartı, kesin vaat ve uydurma özellik kullanma."
          : "Metni profesyonel, akıcı ve satışa yardımcı hale getir; verilen özellikleri öne çıkar ama yeni özellik uydurma.";
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `Sen Yaşam AI İlan Asistanı'sın. Kullanıcının yazdığı gayrimenkul ilan açıklamasını iyileştireceksin.

KATI KURALLAR
- Kullanıcının vermediği hiçbir özelliği, oda sayısını, manzarayı, otoparkı, site özelliğini, tapu durumunu, ulaşım avantajını veya teknik bilgiyi UYDURMA.
- Kesin yatırım getirisi, garanti satış, garanti kira, hukuki uygunluk veya ekspertiz sonucu iddia etme.
- Türkçe yaz.
- İlan platformuna uygun, doğal, güvenilir ve kolay okunur ol.
- Çıktıda sadece nihai ilan açıklamasını ver; başlık, açıklama veya not etiketi ekleme.

GÖREV
${modeInstruction}

İLAN BİLGİLERİ
Başlık: ${listingDraft.title || "Belirtilmedi"}
Konum: ${[listingDraft.city, listingDraft.district, listingDraft.neighborhood].filter(Boolean).join(" / ") || "Belirtilmedi"}
Tür: ${listingDraft.propertyType}
İşlem: ${listingDraft.transaction}
Fiyat: ${listingDraft.price || "Belirtilmedi"}
Alan: ${listingDraft.area || "Belirtilmedi"} m²

KULLANICININ METNİ
${currentText}`
        }),
      });
      const data: unknown = await response.json();
      if (!response.ok) throw new Error(extractText(data) || "AI ilan açıklaması üretilemedi.");
      const text = extractText(data).trim();
      if (!text) throw new Error("AI açıklaması boş geldi.");
      setListingAiMode(mode);
      setListingAiSuggestion(text);
    } catch (aiError) {
      setListingNotice(aiError instanceof Error ? `AI açıklama asistanı: ${aiError.message}` : "AI açıklama asistanı çalıştırılamadı.");
    } finally {
      setListingAiLoading(false);
    }
  }

  async function saveLiveListing(status: "draft" | "published") {
    if (!user) { setListingNotice("İlan kaydetmek için oturum açık olmalıdır."); return; }
    if (!listingDraft.title.trim() || !listingDraft.city.trim() || !listingDraft.district.trim() || !listingDraft.price.trim() || !listingDraft.area.trim()) {
      setListingNotice("Canlı ilan için başlık, il, ilçe, fiyat ve m² alanlarını doldurun."); return;
    }
    if (listingBackendReady === false) { setListingNotice("Önce Supabase ilan migration dosyasını çalıştırın. Veritabanı hazır değil."); return; }
    setListingSaving(true); setListingNotice("");
    try {
      const payload = {
        user_id: user.id, title: listingDraft.title.trim(), description: listingDraft.description?.trim() || null,
        city: listingDraft.city.trim(), district: listingDraft.district.trim() || null, neighborhood: listingDraft.neighborhood.trim() || null,
        property_type: listingDraft.propertyType, transaction_type: listingDraft.transaction,
        price: Math.round(parseMoney(listingDraft.price)), area_m2: parseNumeric(listingDraft.area) || null,
        status, verification_status: "unverified",
      };
      const { data: inserted, error: insertError } = await supabase.from("listings").insert(payload).select("id").single();
      if (insertError) throw insertError;
      const media = inserted?.id ? await uploadListingMedia(inserted.id, listingFiles) : [];
      if (inserted?.id && media.length) {
        const { error: mediaError } = await supabase.from("listings").update({ media }).eq("id", inserted.id).eq("user_id", user.id);
        if (mediaError) throw mediaError;
      }
      setListingDraft({ id: "", title: "", city: "", district: "", neighborhood: "", propertyType: "Konut", transaction: "Satılık", price: "", area: "", description: "", createdAt: "" });
      setListingFiles([]);
      setListingAiSuggestion("");
      setListingNotice(status === "published" ? "İlan yayına alındı ve Türkiye pazar akışına eklendi." : "İlan Supabase üzerinde taslak olarak kaydedildi.");
      await loadLiveListings();
    } catch (saveError) { setListingNotice(saveError instanceof Error ? `İlan kaydedilemedi: ${saveError.message}` : "İlan kaydedilemedi."); }
    finally { setListingSaving(false); }
  }

  async function changeLiveListingStatus(id: string, status: LiveListing["status"]) {
    if (!user) return;
    setListingSaving(true);
    const { error: updateError } = await supabase.from("listings").update({ status }).eq("id", id).eq("user_id", user.id);
    if (updateError) setListingNotice(`İlan durumu değiştirilemedi: ${updateError.message}`);
    else { setListingNotice(status === "published" ? "İlan yeniden yayına alındı." : status === "paused" ? "İlan yayını durduruldu." : "İlan durumu güncellendi."); await loadLiveListings(); }
    setListingSaving(false);
  }

  async function deleteLiveListing(id: string) {
    if (!user || !window.confirm("Bu ilan kalıcı olarak silinsin mi?")) return;
    setListingSaving(true);
    const { error: deleteError } = await supabase.from("listings").delete().eq("id", id).eq("user_id", user.id);
    if (deleteError) setListingNotice(`İlan silinemedi: ${deleteError.message}`);
    else { setListingNotice("İlan silindi."); await loadLiveListings(); }
    setListingSaving(false);
  }

  async function requestListingVerification(listing: LiveListing) {
    if (!user || listing.user_id !== user.id) return;
    if (listing.verification_status === "verified") { setListingNotice("Bu ilan zaten doğrulanmış."); return; }
    setListingVerificationSaving(true);
    setListingNotice("");
    try {
      const { error: requestError } = await supabase.from("listing_verification_requests").insert({
        listing_id: listing.id,
        user_id: user.id,
        status: "pending",
        note: "İlan sahibi Yaşam AI doğrulama incelemesi talep etti.",
      });
      if (requestError && !/duplicate key|unique/i.test(requestError.message)) throw requestError;
      const { error: statusError } = await supabase.from("listings").update({ verification_status: "pending" }).eq("id", listing.id).eq("user_id", user.id);
      if (statusError) throw statusError;
      setListingNotice("Doğrulama talebi alındı. İlan, belge ve veri kontrolleri tamamlanana kadar 'Doğrulama Bekliyor' olarak kalacak.");
      await loadLiveListings();
    } catch (verificationError) {
      setListingNotice(verificationError instanceof Error ? `Doğrulama talebi gönderilemedi: ${verificationError.message}` : "Doğrulama talebi gönderilemedi.");
    } finally {
      setListingVerificationSaving(false);
    }
  }

  function saveMarketplaceDraft() {
    if (!listingDraft.title.trim() || !listingDraft.city.trim() || !listingDraft.price.trim()) {
      setListingNotice("Taslak için başlık, il ve fiyat alanlarını doldurun.");
      return;
    }
    const next: MarketplaceDraft = {
      ...listingDraft,
      id: `draft-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    const nextDrafts = [next, ...listingDrafts];
    setListingDrafts(nextDrafts);
    try { window.localStorage.setItem("yasam-ai:listing-drafts:v1", JSON.stringify(nextDrafts)); } catch {}
    setListingDraft({ id: "", title: "", city: "", district: "", neighborhood: "", propertyType: "Konut", transaction: "Satılık", price: "", area: "", description: "", createdAt: "" });
    setListingNotice("İlan taslağı kaydedildi. Bu aşamada taslak yalnızca bu cihazda tutulur; halka açık yayın yapılmaz.");
  }

  function deleteMarketplaceDraft(id: string) {
    const nextDrafts = listingDrafts.filter((item) => item.id !== id);
    setListingDrafts(nextDrafts);
    try { window.localStorage.setItem("yasam-ai:listing-drafts:v1", JSON.stringify(nextDrafts)); } catch {}
  }

  const marketplaceAnalysisItems = useMemo(() => records.filter((item) => !item.is_archived).map((item) => {
    const scores = scoresFromReport(item.report ?? "");
    const price = parseMoney(item.asking_price);
    const area = parseNumeric(item.area);
    const priceM2 = price > 0 && area > 0 ? Math.round(price / area) : 0;
    const decision = (item.decision || decisionFromReport(item.report ?? "") || "BEKLE").toLocaleUpperCase("tr-TR");
    const aiRank = (scores.opportunity ?? 0) * .34 + (scores.investment ?? 0) * .30 + (scores.trust ?? 0) * .22 + (scores.liquidity ?? 0) * .14 - (scores.risk ?? 50) * .18;
    return { item, scores, price, area, priceM2, decision, aiRank };
  }), [records]);

  const marketplacePropertyTypes = useMemo(() => Array.from(new Set([
    ...marketplaceAnalysisItems.map((entry) => entry.item.property_type || "Gayrimenkul"),
    ...listingDrafts.map((draft) => draft.propertyType || "Gayrimenkul"),
    ...liveListings.map((listing) => listing.property_type || "Gayrimenkul"),
  ])).sort((a,b) => a.localeCompare(b, "tr")), [marketplaceAnalysisItems, listingDrafts, liveListings]);

  const filteredMarketplaceAnalysis = useMemo(() => {
    const q = listingQuery.trim().toLocaleLowerCase("tr-TR");
    const filtered = marketplaceAnalysisItems.filter((entry) => {
      const haystack = [entry.item.city, entry.item.district, entry.item.neighborhood, entry.item.property_type, entry.item.notes, entry.decision].filter(Boolean).join(" ").toLocaleLowerCase("tr-TR");
      const queryOk = !q || haystack.includes(q);
      const typeOk = listingPropertyType === "Tümü" || entry.item.property_type === listingPropertyType;
      // analysis_reports şemasında satılık/kiralık alanı bulunmadığı için işlem tipi filtresi yalnızca gerçek ilan taslaklarına uygulanır.
      return queryOk && typeOk && listingTransaction === "Tümü";
    });
    return [...filtered].sort((a,b) => listingSort === "priceLow" ? a.price - b.price : listingSort === "priceHigh" ? b.price - a.price : b.aiRank - a.aiRank);
  }, [listingQuery, listingPropertyType, listingSort, listingTransaction, marketplaceAnalysisItems]);

  const filteredLiveListings = useMemo(() => {
    const q = listingQuery.trim().toLocaleLowerCase("tr-TR");
    const source = liveListings.filter((listing) => listing.status === "published" || listing.user_id === user?.id);
    const filtered = source.filter((listing) => {
      const haystack = [listing.title, listing.description, listing.city, listing.district, listing.neighborhood, listing.property_type, listing.transaction_type].filter(Boolean).join(" ").toLocaleLowerCase("tr-TR");
      return (!q || haystack.includes(q)) && (listingTransaction === "Tümü" || listing.transaction_type === listingTransaction) && (listingPropertyType === "Tümü" || listing.property_type === listingPropertyType);
    });
    return [...filtered].sort((a,b) => listingSort === "priceLow" ? Number(a.price)-Number(b.price) : listingSort === "priceHigh" ? Number(b.price)-Number(a.price) : Number(b.status === "published")-Number(a.status === "published") || new Date(b.updated_at).getTime()-new Date(a.updated_at).getTime());
  }, [liveListings, listingPropertyType, listingQuery, listingSort, listingTransaction, user?.id]);

  const selectedLiveListing = useMemo(() => liveListings.find((item) => item.id === selectedListingId) ?? null, [liveListings, selectedListingId]);

  const selectedListingIntelligence = useMemo(() => {
    if (!selectedLiveListing) return null;
    const area = Number(selectedLiveListing.area_m2 || 0);
    const askingPrice = Number(selectedLiveListing.price || 0);
    const askingM2 = area > 0 && askingPrice > 0 ? askingPrice / area : 0;
    const city = (selectedLiveListing.city || "").toLocaleLowerCase("tr-TR");
    const district = (selectedLiveListing.district || "").toLocaleLowerCase("tr-TR");
    const neighborhood = (selectedLiveListing.neighborhood || "").toLocaleLowerCase("tr-TR");
    const propertyType = (selectedLiveListing.property_type || "").toLocaleLowerCase("tr-TR");
    const regional = regionalData
      .filter((item) => item.averageM2 > 0)
      .map((item) => {
        let match = 0;
        if (item.city.toLocaleLowerCase("tr-TR") === city) match += 40;
        if (item.district.toLocaleLowerCase("tr-TR") === district) match += 30;
        if (item.neighborhood.toLocaleLowerCase("tr-TR") === neighborhood) match += 20;
        if (item.propertyType.toLocaleLowerCase("tr-TR") === propertyType) match += 10;
        return { item, match };
      })
      .sort((a,b) => b.match - a.match)[0]?.item ?? null;
    const marketM2 = regional?.averageM2 || 0;
    const estimatedValue = marketM2 > 0 && area > 0 ? marketM2 * area : 0;
    const differencePercent = estimatedValue > 0 ? ((askingPrice - estimatedValue) / estimatedValue) * 100 : null;
    const priceSignal = differencePercent == null ? "Veri eksik" : differencePercent <= -7 ? "Avantajlı" : differencePercent >= 7 ? "Yüksek fiyat" : "Piyasa bandında";
    const confidence = regional?.dataConfidence ?? 0;
    const verificationChecks = [
      { label: "Temel ilan bilgileri", ok: Boolean(selectedLiveListing.title && selectedLiveListing.city && selectedLiveListing.district && askingPrice > 0 && area > 0) },
      { label: "İlan açıklaması", ok: Boolean((selectedLiveListing.description || "").trim().length >= 30) },
      { label: "Fotoğraf kanıtı", ok: Boolean((selectedLiveListing.media || []).length >= 3) },
      { label: "Bölgesel fiyat verisi", ok: Boolean(regional && marketM2 > 0) },
      { label: "Veri güveni ≥ 65", ok: confidence >= 65 },
    ];
    const completion = Math.round((verificationChecks.filter((x) => x.ok).length / verificationChecks.length) * 100);
    return { askingM2, regional, marketM2, estimatedValue, differencePercent, priceSignal, confidence, verificationChecks, completion };
  }, [regionalData, selectedLiveListing]);

  const selectedSimilarListings = useMemo(() => {
    if (!selectedLiveListing) return [] as LiveListing[];
    const basePrice = Number(selectedLiveListing.price || 0);
    return liveListings
      .filter((item) => item.id !== selectedLiveListing.id && item.status === "published")
      .map((item) => {
        let score = 0;
        if ((item.city || "").toLocaleLowerCase("tr-TR") === (selectedLiveListing.city || "").toLocaleLowerCase("tr-TR")) score += 35;
        if ((item.district || "").toLocaleLowerCase("tr-TR") === (selectedLiveListing.district || "").toLocaleLowerCase("tr-TR")) score += 25;
        if ((item.property_type || "").toLocaleLowerCase("tr-TR") === (selectedLiveListing.property_type || "").toLocaleLowerCase("tr-TR")) score += 20;
        if (item.transaction_type === selectedLiveListing.transaction_type) score += 10;
        const price = Number(item.price || 0);
        if (basePrice > 0 && price > 0) score += Math.max(0, 10 - Math.abs(price - basePrice) / basePrice * 20);
        return { item, score };
      })
      .sort((a,b) => b.score - a.score)
      .slice(0, 3)
      .map((entry) => entry.item);
  }, [liveListings, selectedLiveListing]);


  useEffect(() => {
    if (!selectedLiveListing || !user) {
      setListingOwnerStats({ uniqueViewers: 0, totalViews: 0, favorites: 0, inquiries: 0, unreadInquiries: 0 });
      return;
    }
    if (selectedLiveListing.user_id === user.id) {
      void loadListingOwnerStats(selectedLiveListing.id);
    } else if (selectedLiveListing.status === "published") {
      void recordLiveListingView(selectedLiveListing.id);
    }
    // İlan değiştiğinde tekil görüntülenme ve ilan sahibi performansı güncellenir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLiveListing?.id, user?.id]);

  const selectedInquiry = useMemo(() => listingInbox.find((item) => item.id === selectedInquiryId) ?? null, [listingInbox, selectedInquiryId]);
  const filteredListingInbox = useMemo(() => {
    const now = Date.now();
    return listingInbox.filter((item) => {
      if (listingInboxFilter === "new") return item.status === "new" || item.lead_status === "new";
      if (listingInboxFilter === "qualified") return ["qualified","visit","offer"].includes(item.lead_status);
      if (listingInboxFilter === "followup") return Boolean(item.follow_up_at && new Date(item.follow_up_at).getTime() <= now + 24 * 60 * 60 * 1000 && !["won","lost"].includes(item.lead_status));
      return true;
    });
  }, [listingInbox, listingInboxFilter]);
  const listingCrmSummary = useMemo(() => {
    const now = Date.now();
    return {
      newCount: listingInbox.filter((item) => item.status === "new" || item.lead_status === "new").length,
      hotCount: listingInbox.filter((item) => item.priority === "urgent" || item.priority === "high" || ["qualified","visit","offer"].includes(item.lead_status)).length,
      followUpCount: listingInbox.filter((item) => item.follow_up_at && new Date(item.follow_up_at).getTime() <= now + 24 * 60 * 60 * 1000 && !["won","lost"].includes(item.lead_status)).length,
      wonCount: listingInbox.filter((item) => item.lead_status === "won").length,
    };
  }, [listingInbox]);

  const filteredMarketplaceDrafts = useMemo(() => {
    const q = listingQuery.trim().toLocaleLowerCase("tr-TR");
    return listingDrafts.filter((draft) => {
      const haystack = [draft.title, draft.city, draft.district, draft.neighborhood, draft.propertyType, draft.transaction].join(" ").toLocaleLowerCase("tr-TR");
      return (!q || haystack.includes(q)) && (listingTransaction === "Tümü" || draft.transaction === listingTransaction) && (listingPropertyType === "Tümü" || draft.propertyType === listingPropertyType);
    }).sort((a,b) => {
      const pa=parseMoney(a.price), pb=parseMoney(b.price);
      return listingSort === "priceLow" ? pa-pb : listingSort === "priceHigh" ? pb-pa : new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime();
    });
  }, [listingDrafts, listingPropertyType, listingQuery, listingSort, listingTransaction]);

  const [enterpriseNotice, setEnterpriseNotice] = useState("");
  const [enterpriseQuestion, setEnterpriseQuestion] = useState("");
  const [bankScenario, setBankScenario] = useState<"balanced" | "conservative" | "growth">("balanced");
  const [bankQueueFilter, setBankQueueFilter] = useState<"all" | "urgent" | "review">("all");
  const [developerProject, setDeveloperProject] = useState<"elysium" | "nova" | "vera">("elysium");
  const [developerScenario, setDeveloperScenario] = useState<"base" | "cost" | "sales">("base");
  const [developerTaskFilter, setDeveloperTaskFilter] = useState<"all" | "critical" | "week">("all");
  const [investorHorizon, setInvestorHorizon] = useState<"1y" | "3y" | "5y">("3y");
  const [investorScenario, setInvestorScenario] = useState<"base" | "rateUp" | "rateDown" | "rentUp">("base");
  const [investorRiskFilter, setInvestorRiskFilter] = useState<"all" | "low" | "balanced" | "high">("all");
  const [investorAiPrompt, setInvestorAiPrompt] = useState("");
  const [investorAiAnswer, setInvestorAiAnswer] = useState("Portföyünüz dengeli büyüyor. Likiditeyi güçlendirmek için yeni alımların en az %15'ini hızlı satılabilir varlıklara ayırın.");


  useEffect(() => {
    let cancelled = false;
    async function loadProvinces() {
      const cacheKey = "yasam-ai:locations:provinces:v2";
      const cached = readLocationCache(cacheKey);
      if (cached && !cancelled) {
        setLocationProvinces(cached.data);
        setLocationSource("cache");
        if (cached.meta) {
          setLocationDatasetMeta({
            version: cached.meta.datasetVersion || "2025",
            lastUpdated: cached.meta.lastUpdated || "2026-05-21",
          });
        }
      }
      setLocationLoading(true);
      setLocationError("");
      try {
        const response = await fetch("https://api.turkiyeapi.dev/v2/provinces?limit=1000&fields=id,name&sort=name", { cache: "no-store" });
        if (!response.ok) throw new Error("İl listesi alınamadı.");
        const payload = (await response.json()) as TurkiyeApiListResponse;
        if (cancelled) return;
        const rows = Array.isArray(payload.data) ? payload.data : [];
        if (!rows.length) throw new Error("İl listesi boş döndü.");
        setLocationProvinces(rows);
        setLocationSource("live");
        writeLocationCache(cacheKey, rows, payload.meta);
        if (payload.meta) {
          setLocationDatasetMeta({
            version: payload.meta.datasetVersion || "2025",
            lastUpdated: payload.meta.lastUpdated || "2026-05-21",
          });
        }
      } catch (error) {
        if (!cancelled) {
          setLocationError(error instanceof Error ? error.message : "Türkiye konum servisine ulaşılamadı.");
          if (!cached) setLocationSource("waiting");
        }
      } finally {
        if (!cancelled) setLocationLoading(false);
      }
    }
    void loadProvinces();
    return () => { cancelled = true; };
  }, [locationRefreshNonce]);

  useEffect(() => {
    let cancelled = false;
    async function loadDistricts() {
      if (!selectedProvinceId) return;
      const cacheKey = `yasam-ai:locations:districts:${selectedProvinceId}:v2`;
      const cached = readLocationCache(cacheKey);
      setLocationLoading(true);
      setLocationError("");
      setLocationNeighborhoods([]);
      setSelectedNeighborhoodId(0);
      if (cached && !cancelled) {
        setLocationDistricts(cached.data);
        setLocationSource("cache");
      } else {
        setLocationDistricts([]);
      }
      setSelectedDistrictId(0);
      try {
        const response = await fetch(`https://api.turkiyeapi.dev/v2/districts?provinceId=${selectedProvinceId}&limit=1000&fields=id,name,provinceId&sort=name`, { cache: "no-store" });
        if (!response.ok) throw new Error("İlçe listesi alınamadı.");
        const payload = (await response.json()) as TurkiyeApiListResponse;
        const rows = Array.isArray(payload.data) ? payload.data : [];
        if (!rows.length) throw new Error("İlçe listesi boş döndü.");
        if (!cancelled) {
          setLocationDistricts(rows);
          setLocationSource("live");
          writeLocationCache(cacheKey, rows, payload.meta);
        }
      } catch (error) {
        if (!cancelled) setLocationError(error instanceof Error ? error.message : "İlçe servisine ulaşılamadı.");
      } finally {
        if (!cancelled) setLocationLoading(false);
      }
    }
    void loadDistricts();
    return () => { cancelled = true; };
  }, [selectedProvinceId, locationRefreshNonce]);

  useEffect(() => {
    let cancelled = false;
    async function loadNeighborhoods() {
      if (!selectedDistrictId) {
        setLocationNeighborhoods([]);
        setSelectedNeighborhoodId(0);
        return;
      }
      const cacheKey = `yasam-ai:locations:neighborhoods:${selectedDistrictId}:v2`;
      const cached = readLocationCache(cacheKey);
      setLocationLoading(true);
      setLocationError("");
      setSelectedNeighborhoodId(0);
      if (cached && !cancelled) {
        setLocationNeighborhoods(cached.data);
        setLocationSource("cache");
      } else {
        setLocationNeighborhoods([]);
      }
      try {
        const response = await fetch(`https://api.turkiyeapi.dev/v2/neighborhoods?districtId=${selectedDistrictId}&limit=1000&fields=id,name,districtId,postalCode,postalCodeStatus&sort=name`, { cache: "no-store" });
        if (!response.ok) throw new Error("Mahalle listesi alınamadı.");
        const payload = (await response.json()) as TurkiyeApiListResponse;
        const rows = Array.isArray(payload.data) ? payload.data : [];
        if (!rows.length) throw new Error("Mahalle listesi boş döndü.");
        if (!cancelled) {
          setLocationNeighborhoods(rows);
          setLocationSource("live");
          writeLocationCache(cacheKey, rows, payload.meta);
        }
      } catch (error) {
        if (!cancelled) setLocationError(error instanceof Error ? error.message : "Mahalle servisine ulaşılamadı.");
      } finally {
        if (!cancelled) setLocationLoading(false);
      }
    }
    void loadNeighborhoods();
    return () => { cancelled = true; };
  }, [selectedDistrictId, locationRefreshNonce]);

  const active = records.filter((item) => !item.is_archived);
  const decisions = active.reduce<Record<string, number>>((acc, item) => {
    const key = item.decision || "DEĞERLENDİR";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const favoriteCount = records.filter((item) => item.is_favorite).length;
  const archivedCount = records.filter((item) => item.is_archived).length;
  const completeReportCount = records.filter((item) => {
    const hasLocation = Boolean(item.city && item.district);
    const hasProperty = Boolean(item.property_type && item.area && item.asking_price);
    const hasDecision = Boolean(item.decision);
    const hasReport = Boolean(item.report && item.report.trim().length >= 80);
    return hasLocation && hasProperty && hasDecision && hasReport;
  }).length;
  const incompleteReportCount = Math.max(0, records.length - completeReportCount);
  const dataQualityRate = records.length ? Math.round((completeReportCount / records.length) * 100) : 0;
  const sourcedRegionalCount = regionalData.filter((item) => Boolean(item.source?.trim())).length;
  const regionalCoverageRate = regionalData.length ? Math.round((sourcedRegionalCount / regionalData.length) * 100) : 0;
  const recentRecords = [...records]
    .sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime())
    .slice(0, 5);
  const systemHealthScore = Math.round(
    Math.min(100,
      (records.length ? 25 : 10) +
      (regionalData.length ? 25 : 10) +
      Math.min(25, dataQualityRate * 0.25) +
      Math.min(25, regionalCoverageRate * 0.25)
    )
  );
  const systemHealthLabel = systemHealthScore >= 80 ? "GÜÇLÜ" : systemHealthScore >= 60 ? "İYİ" : systemHealthScore >= 40 ? "GELİŞİYOR" : "KURULUM";
  const trustedRegional = regionalData.filter((item) => item.dataConfidence >= 70 && item.averageM2 > 0);
  const avgConfidence = trustedRegional.length
    ? Math.round(trustedRegional.reduce((sum, item) => sum + item.dataConfidence, 0) / trustedRegional.length)
    : 0;
  const marketCities = Array.from(new Set(regionalData.filter((item) => item.averageM2 > 0).map((item) => item.city))).sort();
  const selectedProvince = locationProvinces.find((item) => item.id === selectedProvinceId) ?? null;
  const selectedDistrict = locationDistricts.find((item) => item.id === selectedDistrictId) ?? null;
  const selectedNeighborhood = locationNeighborhoods.find((item) => item.id === selectedNeighborhoodId) ?? null;

  const selectedDistrictDirectRecords = regionalData.filter((item) =>
    normalizeLocationPart(item.city) === normalizeLocationPart(selectedProvince?.name ?? "") &&
    normalizeLocationPart(item.district) === normalizeLocationPart(selectedDistrict?.name ?? "") &&
    item.source !== "system"
  );
  const selectedDistrictNeighborhoodRecords = selectedDistrictDirectRecords.filter(
    (item) => item.neighborhood && item.neighborhood !== "İlçe Geneli" && item.averageM2 > 0 && item.rentM2 > 0,
  );
  const selectedDistrictReadyRate = locationNeighborhoods.length
    ? Math.round((selectedDistrictNeighborhoodRecords.length / locationNeighborhoods.length) * 100)
    : 0;

  const downloadSelectedDistrictDataTemplate = () => {
    if (!selectedProvince || !selectedDistrict || !locationNeighborhoods.length) {
      setMembershipNotice("Önce il ve ilçe seçin; mahalle listesi yüklendikten sonra veri şablonunu indirebilirsiniz.");
      return;
    }

    const columns = [
      "city", "district", "neighborhood", "property_type", "period_date", "source_name", "source_url",
      "listing_count", "sale_price_m2", "rent_price_m2", "annual_change_percent", "confidence_score",
      "liquidity_score", "infrastructure_score", "transport_score", "methodology", "source_note",
    ];
    const today = new Date().toISOString().slice(0, 10);
    const escapeCsv = (value: string | number) => {
      const raw = String(value ?? "");
      return /[;"\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
    };
    const rows = locationNeighborhoods.map((item) => [
      selectedProvince.name,
      selectedDistrict.name,
      item.name,
      "Konut",
      today,
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "Aynı tarih aralığındaki ilanlar ayıklandı; mükerrer ve aykırı kayıtlar kontrol edildi.",
      "Kaynak adı, veri tarihi, örneklem ve doğrulama notu yazılmalıdır.",
    ].map(escapeCsv).join(";"));
    const districtGeneral = [
      selectedProvince.name, selectedDistrict.name, "İlçe Geneli", "Konut", today, "", "", "", "", "", "", "", "", "", "",
      "Mahalle kayıtlarının ağırlıklı ortalaması veya ayrı doğrulanmış ilçe örneklemi.",
      "İlçe geneli kayıt, mahalle fiyatı yerine doğrudan kullanılmamalıdır.",
    ].map(escapeCsv).join(";");
    const blob = new Blob(["\uFEFF", columns.join(";"), "\n", districtGeneral, "\n", rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `yasam-ai-${normalizeLocationPart(selectedProvince.name)}-${normalizeLocationPart(selectedDistrict.name)}-gercek-veri-sablonu-${today}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setMembershipNotice(`${selectedProvince.name} / ${selectedDistrict.name} için ${locationNeighborhoods.length} mahallelik gerçek veri şablonu indirildi.`);
  };
  const selectedLocationExactRecord = regionalData.find((item) =>
    item.averageM2 > 0 &&
    normalizeLocationPart(item.city) === normalizeLocationPart(selectedProvince?.name || "") &&
    (!selectedDistrict || normalizeLocationPart(item.district) === normalizeLocationPart(selectedDistrict.name)) &&
    (!selectedNeighborhood || normalizeLocationPart(item.neighborhood) === normalizeLocationPart(selectedNeighborhood.name))
  ) ?? null;
  const genericLocationKeys = new Set(["", "ilce-geneli", "il-geneli", "tumu", "tum", "genel"]);
  const selectedLocationDistrictRecord = selectedLocationExactRecord ? null : regionalData.find((item) =>
    item.averageM2 > 0 &&
    normalizeLocationPart(item.city) === normalizeLocationPart(selectedProvince?.name || "") &&
    Boolean(selectedDistrict) &&
    normalizeLocationPart(item.district) === normalizeLocationPart(selectedDistrict?.name || "") &&
    genericLocationKeys.has(normalizeLocationPart(item.neighborhood || ""))
  ) ?? null;
  const selectedLocationCityRecord = selectedLocationExactRecord || selectedLocationDistrictRecord ? null : regionalData.find((item) =>
    item.averageM2 > 0 &&
    normalizeLocationPart(item.city) === normalizeLocationPart(selectedProvince?.name || "") &&
    genericLocationKeys.has(normalizeLocationPart(item.district || ""))
  ) ?? null;
  const selectedLocationMarketRecord = selectedLocationExactRecord || selectedLocationDistrictRecord || selectedLocationCityRecord;
  const selectedLocationMatchScope = selectedLocationExactRecord ? "Mahalle kaydı" : selectedLocationDistrictRecord ? "İlçe geneli" : selectedLocationCityRecord ? "İl geneli" : "Veri yok";
  const selectedLocationYield = selectedLocationMarketRecord && selectedLocationMarketRecord.averageM2 > 0 && selectedLocationMarketRecord.rentM2 > 0
    ? Number((((selectedLocationMarketRecord.rentM2 * 12) / selectedLocationMarketRecord.averageM2) * 100).toFixed(2))
    : 0;
  const selectedLocationInvestmentScore = selectedLocationMarketRecord ? Math.round(Math.max(0, Math.min(100,
    selectedLocationMarketRecord.dataConfidence * 0.35 +
    selectedLocationMarketRecord.liquidityScore * 0.20 +
    selectedLocationMarketRecord.infrastructureScore * 0.15 +
    selectedLocationMarketRecord.transportScore * 0.15 +
    Math.max(0, Math.min(100, 50 + selectedLocationMarketRecord.annualChange)) * 0.15
  ))) : 0;
  const selectedLocationDecision = !selectedLocationMarketRecord
    ? "VERİ BEKLENİYOR"
    : selectedLocationInvestmentScore >= 75 && selectedLocationMarketRecord.dataConfidence >= 70
      ? "ALIM İÇİN İNCELE"
      : selectedLocationInvestmentScore >= 55
        ? "PAZARLIKLA DEĞERLENDİR"
        : "BEKLE VE VERİYİ İZLE";
  const selectedLocationRiskScore = selectedLocationMarketRecord ? Math.round(Math.max(0, Math.min(100,
    100 - (
      selectedLocationMarketRecord.dataConfidence * 0.35 +
      selectedLocationMarketRecord.liquidityScore * 0.25 +
      selectedLocationMarketRecord.infrastructureScore * 0.15 +
      selectedLocationMarketRecord.transportScore * 0.15 +
      Math.max(0, Math.min(100, 50 + selectedLocationMarketRecord.annualChange)) * 0.10
    )
  ))) : 0;
  const selectedLocationRiskLabel = !selectedLocationMarketRecord ? "VERİ YOK" : selectedLocationRiskScore <= 30 ? "DÜŞÜK RİSK" : selectedLocationRiskScore <= 60 ? "ORTA RİSK" : "YÜKSEK RİSK";
  const selectedLocationDecisionConfidence = selectedLocationMarketRecord ? Math.round(Math.max(0, Math.min(100,
    selectedLocationMarketRecord.dataConfidence * 0.55 +
    Math.min(100, Math.max(0, selectedLocationMarketRecord.sampleSize || 0)) * 0.15 +
    (selectedLocationMatchScope === "Mahalle kaydı" ? 30 : selectedLocationMatchScope === "İlçe geneli" ? 18 : 10)
  ))) : 0;
  const selectedLocationBankSuitability = !selectedLocationMarketRecord ? "VERİ BEKLENİYOR" : selectedLocationDecisionConfidence >= 75 && selectedLocationRiskScore <= 40 ? "ÖN İNCELEMEYE UYGUN" : selectedLocationDecisionConfidence >= 55 ? "EK DOĞRULAMA GEREKLİ" : "YETERSİZ VERİ";
  const selectedLocationAiReasons = selectedLocationMarketRecord ? [
    selectedLocationYield >= 6 ? `Brüt kira getirisi %${selectedLocationYield} ile güçlü seviyede.` : selectedLocationYield > 0 ? `Brüt kira getirisi %${selectedLocationYield}; alternatif bölgelerle karşılaştırılmalı.` : "Kira verisi karar için yetersiz.",
    selectedLocationMarketRecord.liquidityScore >= 60 ? "Likidite göstergesi satış kabiliyetini destekliyor." : "Likidite düşük veya henüz doğrulanmamış; pazarlık payı oluşabilir.",
    selectedLocationMarketRecord.dataConfidence >= 70 ? `Veri güveni %${selectedLocationMarketRecord.dataConfidence} ile kullanılabilir seviyede.` : `Veri güveni %${selectedLocationMarketRecord.dataConfidence}; ek kaynak doğrulaması gerekiyor.`,
    selectedLocationMatchScope === "Mahalle kaydı" ? "Karar doğrudan mahalle kaydına dayanıyor." : `${selectedLocationMatchScope} referansı kullanılıyor; mahalleye özgü kayıt gelince karar yeniden hesaplanmalı.`
  ] : [];
  const selectedLocationStrengths = selectedLocationMarketRecord ? [
    selectedLocationYield >= 6 ? `Brüt kira getirisi %${selectedLocationYield} ile gelir odaklı yatırımcı için olumlu.` : "Kira getirisi henüz güçlü avantaj üretmiyor.",
    selectedLocationMarketRecord.dataConfidence >= 70 ? `Kaynak güveni %${selectedLocationMarketRecord.dataConfidence}; analiz için kullanılabilir düzeyde.` : "Veri güveni yükseltildiğinde karar kalitesi artacak.",
    selectedLocationMarketRecord.annualChange > 0 ? `Yıllık fiyat değişimi %${selectedLocationMarketRecord.annualChange}; piyasa yönü pozitif.` : "Fiyat hareketi temkinli alım için pazarlık alanı oluşturabilir."
  ] : [];
  const selectedLocationRisks = selectedLocationMarketRecord ? [
    selectedLocationMarketRecord.liquidityScore < 50 ? "Düşük likidite satış süresini uzatabilir." : "Likidite riski kabul edilebilir düzeyde.",
    selectedLocationMatchScope !== "Mahalle kaydı" ? `${selectedLocationMatchScope} kullanıldığı için mahalle bazlı fiyat sapması oluşabilir.` : "Doğrudan mahalle verisi kullanılıyor.",
    selectedLocationDecisionConfidence < 70 ? "Karar güveni ek kaynak ve örneklemle güçlendirilmelidir." : "Karar güveni operasyonel kullanım için yeterli düzeyde."
  ] : [];
  const selectedInvestorProfile = !selectedLocationMarketRecord ? "Veri bekleniyor" : selectedLocationYield >= 7 ? "Kira geliri odaklı yatırımcı" : selectedLocationInvestmentScore >= 65 ? "Dengeli büyüme yatırımcısı" : selectedLocationRiskScore >= 60 ? "Sabırlı ve yüksek risk toleranslı yatırımcı" : "Pazarlık odaklı uzun vadeli yatırımcı";
  const selectedLocationActionPlan = !selectedLocationMarketRecord ? ["Kaynaklı satış ve kira verisi yükleyin.", "Mahalle örneklemini doğrulayın.", "Karar motorunu yeniden çalıştırın."] : [
    selectedLocationMatchScope !== "Mahalle kaydı" ? "Mahalleye özel en az 10 doğrulanmış ilan veya ekspertiz kaydı ekleyin." : "Mahalle kaydının güncelliğini koruyun.",
    selectedLocationMarketRecord.liquidityScore < 50 ? "Satış süresi ve ilan adedi verisini tamamlayarak likiditeyi doğrulayın." : "Likidite avantajını benzer mahallelerle karşılaştırın.",
    selectedLocationDecision === "BEKLE VE VERİYİ İZLE" ? "Yeni veri gelene kadar kesin alım kararı vermeyin; hedef fiyat belirleyip izleyin." : selectedLocationDecision === "PAZARLIKLA DEĞERLENDİR" ? "İlçe referansının altında teklif aralığı oluşturun ve ekspertizle doğrulayın." : "Ekspertiz, tapu ve kredi uygunluğu kontrolleriyle alım incelemesine geçin."
  ];
  const selectedLocationScenarioRates = selectedLocationMarketRecord ? {
    cautious: Math.max(-5, selectedLocationMarketRecord.annualChange - 8),
    base: selectedLocationMarketRecord.annualChange,
    optimistic: selectedLocationMarketRecord.annualChange + 6
  } : { cautious: 0, base: 0, optimistic: 0 };
  const selectedLocationScenarios = selectedLocationMarketRecord ? ([
    ["Temkinli", selectedLocationScenarioRates.cautious],
    ["Baz", selectedLocationScenarioRates.base],
    ["Olumlu", selectedLocationScenarioRates.optimistic]
  ] as const).map(([name, rate]) => ({
    name,
    rate,
    oneYear: Math.round(selectedLocationMarketRecord.averageM2 * (1 + rate / 100)),
    threeYear: Math.round(selectedLocationMarketRecord.averageM2 * Math.pow(1 + rate / 100, 3))
  })) : [];
  const assistantBudgetValue = Math.max(0, Number(assistantBudget) || 0);
  const assistantTargetM2Value = Math.max(1, Number(assistantTargetM2) || 1);
  const assistantCashRatioValue = Math.max(0, Math.min(100, Number(assistantCashRatio) || 0));
  const assistantReferencePrice = selectedLocationMarketRecord?.averageM2 || 0;
  const assistantEstimatedPropertyPrice = assistantReferencePrice * assistantTargetM2Value;
  const assistantAffordableM2 = assistantReferencePrice > 0 ? Math.floor(assistantBudgetValue / assistantReferencePrice) : 0;
  const assistantFinancingNeed = Math.max(0, assistantEstimatedPropertyPrice - (assistantBudgetValue * assistantCashRatioValue / 100));
  const assistantMonthlyRent = selectedLocationMarketRecord?.rentM2 ? Math.round(selectedLocationMarketRecord.rentM2 * assistantTargetM2Value) : 0;
  const assistantDiscountRate = selectedLocationRiskScore >= 60 ? 12 : selectedLocationRiskScore >= 35 ? 8 : 5;
  const assistantSuggestedOffer = assistantEstimatedPropertyPrice > 0 ? Math.round(assistantEstimatedPropertyPrice * (1 - assistantDiscountRate / 100)) : 0;
  const assistantBudgetStatus = !selectedLocationMarketRecord ? "VERİ BEKLENİYOR" : assistantBudgetValue >= assistantEstimatedPropertyPrice ? "BÜTÇE UYGUN" : assistantBudgetValue >= assistantSuggestedOffer ? "PAZARLIKLA UYGUN" : "BÜTÇE YETERSİZ";
  const assistantStrategyText = assistantStrategy === "rent"
    ? `Kira odaklı stratejide tahmini aylık brüt kira ${formatCurrency(String(assistantMonthlyRent))}. Kira verisini en az iki ek kaynakla doğrulayın.`
    : assistantStrategy === "growth"
      ? `Değer artışı odaklı stratejide yıllık değişim %${selectedLocationMarketRecord?.annualChange || 0}. Üç yıllık baz senaryoyu altyapı ve proje verileriyle birlikte değerlendirin.`
      : `Dengeli stratejide kira getirisi %${selectedLocationYield}, yatırım skoru ${selectedLocationInvestmentScore}/100 ve risk ${selectedLocationRiskLabel}. Tek kritere göre karar vermeyin.`;
  const assistantRecommendation = !selectedLocationMarketRecord
    ? "Seçili konum için kaynaklı piyasa verisi yüklenmeden yatırım önerisi üretilemez."
    : assistantBudgetStatus === "BÜTÇE UYGUN"
      ? `${assistantTargetM2Value} m² hedef için bütçe yeterli görünüyor. Ekspertiz ve tapu kontrolünden sonra ${formatCurrency(String(assistantSuggestedOffer))} civarından pazarlığa başlanabilir.`
      : assistantBudgetStatus === "PAZARLIKLA UYGUN"
        ? `Bütçe ancak pazarlıkla hedefe yaklaşıyor. ${assistantDiscountRate}% indirim hedefiyle en fazla ${formatCurrency(String(assistantSuggestedOffer))} teklif sınırı belirleyin.`
        : `Mevcut bütçeyle yaklaşık ${assistantAffordableM2} m² alınabilir. Hedef alanı küçültün, peşinatı artırın veya daha uygun bir bölge karşılaştırın.`;
  const negotiationListingPriceValue = Math.max(0, Number(negotiationListingPrice) || 0);
  const negotiationConditionAdjustment = negotiationCondition === "new" ? 3 : negotiationCondition === "renovation" ? -8 : 0;
  const negotiationUrgencyDiscount = negotiationSellerUrgency === "high" ? 7 : negotiationSellerUrgency === "medium" ? 4 : 1;
  const negotiationCompetitionAdjustment = negotiationCompetition === "high" ? 3 : negotiationCompetition === "low" ? -3 : 0;
  const negotiationScopeSafety = selectedLocationMatchScope === "Mahalle kaydı" ? 0 : selectedLocationMatchScope === "İlçe geneli" ? -4 : -7;
  const negotiationFairValue = selectedLocationMarketRecord
    ? Math.max(0, Math.round(assistantEstimatedPropertyPrice * (1 + (negotiationConditionAdjustment + negotiationCompetitionAdjustment + negotiationScopeSafety) / 100)))
    : 0;
  const negotiationGapPercent = negotiationFairValue > 0 ? Math.round(((negotiationListingPriceValue - negotiationFairValue) / negotiationFairValue) * 1000) / 10 : 0;
  const negotiationBaseDiscount = Math.max(3, Math.min(20, assistantDiscountRate + negotiationUrgencyDiscount + Math.max(0, negotiationGapPercent) * 0.35));
  const negotiationOpeningOffer = negotiationListingPriceValue > 0 ? Math.round(negotiationListingPriceValue * (1 - negotiationBaseDiscount / 100)) : 0;
  const negotiationTargetPrice = negotiationFairValue > 0
    ? Math.round(Math.min(negotiationListingPriceValue * (1 - Math.max(2, negotiationUrgencyDiscount) / 100), negotiationFairValue * 0.99))
    : 0;
  const negotiationWalkAwayPrice = negotiationFairValue > 0
    ? Math.round(Math.min(assistantBudgetValue || negotiationListingPriceValue, negotiationFairValue * (selectedLocationMarketRecord && selectedLocationMarketRecord.dataConfidence >= 80 ? 1.03 : 1)))
    : 0;
  const negotiationPotentialSaving = Math.max(0, negotiationListingPriceValue - negotiationTargetPrice);
  const negotiationVerdict = !selectedLocationMarketRecord
    ? "VERİ BEKLENİYOR"
    : negotiationListingPriceValue <= negotiationFairValue * 0.97
      ? "FİYAT AVANTAJLI"
      : negotiationListingPriceValue <= negotiationFairValue * 1.05
        ? "PAZARLIKLA UYGUN"
        : "FİYAT YÜKSEK";
  const negotiationScript = !selectedLocationMarketRecord
    ? "Kaynaklı bölgesel veri olmadan güvenli pazarlık aralığı oluşturulamaz."
    : `Bölge referansı ve taşınmaz durumu dikkate alındığında ${formatCurrency(String(negotiationOpeningOffer))} ile başlayın. Belgeler ve ekspertiz uyumluysa ${formatCurrency(String(negotiationTargetPrice))} seviyesine kadar ilerleyin; ${formatCurrency(String(negotiationWalkAwayPrice))} üzerini kabul etmeyin.`;
  const financeMonthlyIncomeValue = Math.max(0, Number(financeMonthlyIncome) || 0);
  const financeOtherDebtValue = Math.max(0, Number(financeOtherDebt) || 0);
  const financeDownPaymentValue = Math.max(0, Number(financeDownPayment) || 0);
  const financeTermValue = Math.max(1, Number(financeTerm) || 120);
  const financeMonthlyRateValue = Math.max(0, Number(financeMonthlyRate.replace(",", ".")) || 0) / 100;
  const financeReferenceValue = negotiationFairValue || assistantEstimatedPropertyPrice || negotiationListingPriceValue;
  const financeLoanNeed = Math.max(0, financeReferenceValue - financeDownPaymentValue);
  const financeMonthlyPayment = financeLoanNeed > 0
    ? financeMonthlyRateValue > 0
      ? Math.round(financeLoanNeed * (financeMonthlyRateValue * Math.pow(1 + financeMonthlyRateValue, financeTermValue)) / (Math.pow(1 + financeMonthlyRateValue, financeTermValue) - 1))
      : Math.round(financeLoanNeed / financeTermValue)
    : 0;
  const financeDebtService = financeMonthlyPayment + financeOtherDebtValue;
  const financeIncomeRatio = financeMonthlyIncomeValue > 0 ? Math.round((financeDebtService / financeMonthlyIncomeValue) * 1000) / 10 : 0;
  const financeLoanToValue = financeReferenceValue > 0 ? Math.round((financeLoanNeed / financeReferenceValue) * 1000) / 10 : 0;
  const financeTotalRepayment = financeMonthlyPayment * financeTermValue;
  const financeTotalCost = Math.max(0, financeTotalRepayment - financeLoanNeed);
  const financeCollateralConfidence = selectedLocationMarketRecord
    ? Math.max(0, Math.min(100, Math.round(selectedLocationMarketRecord.dataConfidence * (selectedLocationMatchScope === "Mahalle kaydı" ? 1 : selectedLocationMatchScope === "İlçe geneli" ? 0.86 : 0.72))))
    : 0;
  const financeSuitability = !selectedLocationMarketRecord
    ? "VERİ BEKLENİYOR"
    : financeIncomeRatio <= 35 && financeLoanToValue <= 70 && financeCollateralConfidence >= 65
      ? "ÖN DEĞERLENDİRME UYGUN"
      : financeIncomeRatio <= 50 && financeLoanToValue <= 80
        ? "EK İNCELEME GEREKLİ"
        : "FİNANSMAN RİSKİ YÜKSEK";
  const financeRiskScore = Math.max(0, Math.min(100, Math.round(
    financeIncomeRatio * 0.9 + Math.max(0, financeLoanToValue - 50) * 0.7 + (100 - financeCollateralConfidence) * 0.35 + (selectedLocationRiskScore || 0) * 0.25
  )));
  const financeRecommendation = !selectedLocationMarketRecord
    ? "Kaynaklı bölgesel piyasa verisi olmadan banka ön değerlendirmesi üretilemez."
    : financeSuitability === "ÖN DEĞERLENDİRME UYGUN"
      ? `Gelir/taksit oranı %${financeIncomeRatio}, kredi/değer oranı %${financeLoanToValue}. Belgelenebilir gelir, ekspertiz ve banka politikası uygunsa dosya ön değerlendirmeye alınabilir.`
      : financeSuitability === "EK İNCELEME GEREKLİ"
        ? `Gelir/taksit oranı %${financeIncomeRatio}. Peşinatı artırmak, vadeyi yeniden değerlendirmek veya diğer aylık borçları azaltmak dosyanın dayanıklılığını yükseltebilir.`
        : `Mevcut varsayımlarda aylık borç yükü gelire göre yüksek görünüyor. Daha düşük kredi tutarı, daha yüksek peşinat veya farklı taşınmaz senaryosu değerlendirilmelidir.`;
  const marketPropertyTypes = Array.from(new Set(regionalData.filter((item) => item.averageM2 > 0).map((item) => item.propertyType))).sort();
  const marketRecords = regionalData
    .filter((item) => item.averageM2 > 0)
    .filter((item) => marketCity === "Tümü" || item.city === marketCity)
    .filter((item) => marketPropertyType === "Tümü" || item.propertyType === marketPropertyType)
    .sort((a, b) => {
      if (marketSort === "price") return b.averageM2 - a.averageM2;
      if (marketSort === "change") return b.annualChange - a.annualChange;
      if (marketSort === "liquidity") return b.liquidityScore - a.liquidityScore;
      return b.dataConfidence - a.dataConfidence;
    });
  const marketAverageM2 = marketRecords.length
    ? Math.round(marketRecords.reduce((sum, item) => sum + item.averageM2, 0) / marketRecords.length)
    : 0;
  const marketAverageRent = marketRecords.length
    ? Math.round(marketRecords.reduce((sum, item) => sum + item.rentM2, 0) / marketRecords.length)
    : 0;
  const marketAverageChange = marketRecords.length
    ? Math.round((marketRecords.reduce((sum, item) => sum + item.annualChange, 0) / marketRecords.length) * 10) / 10
    : 0;
  const marketAverageLiquidity = marketRecords.length
    ? Math.round(marketRecords.reduce((sum, item) => sum + item.liquidityScore, 0) / marketRecords.length)
    : 0;
  const marketInvestmentScore = marketRecords.length
    ? Math.round(marketRecords.reduce((sum, item) => {
        const rentYieldSignal = item.averageM2 > 0 ? Math.min(100, Math.round((item.rentM2 * 12 / item.averageM2) * 1000)) : 0;
        return sum + Math.round(item.annualChange * 1.5 + item.liquidityScore * 0.35 + item.infrastructureScore * 0.15 + item.transportScore * 0.1 + item.dataConfidence * 0.15 + rentYieldSignal * 0.1);
      }, 0) / marketRecords.length)
    : 0;
  const marketAnnualRentYield = marketAverageM2 > 0 ? Math.round((marketAverageRent * 12 / marketAverageM2) * 1000) / 10 : 0;
  const projectionYears = Number(projectionHorizon);
  const projectedMarketM2 = marketAverageM2 > 0
    ? Math.round(marketAverageM2 * Math.pow(1 + Math.max(-0.3, marketAverageChange / 100), projectionYears))
    : 0;
  const citySummary = (city: string) => {
    const rows = regionalData.filter((item) => item.averageM2 > 0 && item.city === city && (marketPropertyType === "Tümü" || item.propertyType === marketPropertyType));
    if (!rows.length) return null;
    const average = (key: keyof RegionalDataRecord) => Math.round(rows.reduce((sum, item) => sum + Number(item[key] || 0), 0) / rows.length);
    const averageM2 = average("averageM2");
    const rentM2 = average("rentM2");
    const annualChange = Math.round((rows.reduce((sum, item) => sum + item.annualChange, 0) / rows.length) * 10) / 10;
    const liquidity = average("liquidityScore");
    const confidence = average("dataConfidence");
    const yieldRate = averageM2 > 0 ? Math.round((rentM2 * 12 / averageM2) * 1000) / 10 : 0;
    const score = Math.max(0, Math.min(100, Math.round(annualChange * 1.6 + liquidity * .35 + confidence * .2 + yieldRate * 2)));
    return { city, rows: rows.length, averageM2, rentM2, annualChange, liquidity, confidence, yieldRate, score };
  };
  const compareA = citySummary(compareCityA);
  const compareB = citySummary(compareCityB);
  const comparisonWinner = compareA && compareB ? (compareA.score >= compareB.score ? compareA : compareB) : compareA || compareB;
  const marketAiComment = !marketRecords.length
    ? "Seçili filtrelerde doğrulanmış piyasa verisi bulunmuyor. Kaynaklı kayıt eklendiğinde bölgesel yorum otomatik oluşacaktır."
    : marketInvestmentScore >= 75
      ? `Seçili bölgede yatırım görünümü güçlü. Yıllık değişim %${marketAverageChange}, ortalama likidite ${marketAverageLiquidity}/100 ve tahmini yıllık kira getirisi %${marketAnnualRentYield}. Veri güveni ve kaynak tarihleri kontrol edilerek fırsat odaklı inceleme yapılabilir.`
      : marketInvestmentScore >= 55
        ? `Seçili bölge dengeli bir yatırım görünümü sunuyor. Fiyat değişimi %${marketAverageChange}, likidite ${marketAverageLiquidity}/100 seviyesinde. Mahalle bazında kaynak kalitesi ve kira talebi karşılaştırılmadan karar verilmemeli.`
        : `Seçili bölgede temkinli ilerlemek uygun. Yatırım puanı ${marketInvestmentScore}/100 seviyesinde; likidite, kira getirisi veya veri güveni karar öncesinde daha ayrıntılı doğrulanmalı.`;

  const land = parseNumeric(landArea);
  const emsal = Number(String(far).replace(",", ".")) || 0;
  const sellable = Math.max(0, land * emsal * 0.82);
  const revenue = sellable * parseNumeric(saleM2);
  const construction = sellable * parseNumeric(costM2);
  const totalCost = construction + parseNumeric(landCost);
  const grossProfit = revenue - totalCost;
  const margin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
  const feasibilityDecision = margin >= 25 ? "GÜÇLÜ ADAY" : margin >= 15 ? "DETAYLI İNCELE" : "RİSKLİ";
  const selectedAiRecord = records.find((item) => item.id === aiRecordId) ?? active[0] ?? null;
  const selectedAiScores = selectedAiRecord ? scoresFromReport(selectedAiRecord.report ?? "") : null;
  const selectedPdfRecord = records.find((item) => item.id === pdfRecordId) ?? active[0] ?? records[0] ?? null;
  const selectedPdfScores = selectedPdfRecord ? scoresFromReport(selectedPdfRecord.report ?? "") : emptyScores;
  const selectedPdfPrice = selectedPdfRecord ? parseMoney(selectedPdfRecord.asking_price) : 0;
  const selectedPdfArea = selectedPdfRecord ? parseNumeric(selectedPdfRecord.area) : 0;
  const selectedPdfM2 = selectedPdfPrice > 0 && selectedPdfArea > 0 ? Math.round(selectedPdfPrice / selectedPdfArea) : 0;
  const projection5 = selectedPdfPrice > 0 ? Math.round(selectedPdfPrice * Math.pow(1.18, 5)) : 0;
  const projection10 = selectedPdfPrice > 0 ? Math.round(selectedPdfPrice * Math.pow(1.16, 10)) : 0;
  const pdfReportNo = selectedPdfRecord
    ? `YAI-${new Date(selectedPdfRecord.created_at).getFullYear() || new Date().getFullYear()}-${selectedPdfRecord.id.slice(0, 8).toLocaleUpperCase("tr-TR")}`
    : "YAI-ÖNİZLEME";

  async function generateExplainableDecision() {
    if (!selectedAiRecord) {
      setAiError("Önce analiz edilmiş bir rapor seçin.");
      return;
    }

    setAiLoading(true);
    setAiError("");
    setAiResult("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `Sen Yaşam AI Açıklanabilir Karar Motoru'sun.

Aşağıdaki mevcut gayrimenkul raporunu bağımsız biçimde yeniden değerlendir:

Konum: ${locationText(selectedAiRecord)}
Tür: ${selectedAiRecord.property_type || "Belirtilmedi"}
Alan: ${selectedAiRecord.area || "Belirtilmedi"} m²
Talep fiyatı: ${selectedAiRecord.asking_price || "Belirtilmedi"} TL
Mevcut karar: ${selectedAiRecord.decision || "Belirtilmedi"}

MEVCUT RAPOR
${selectedAiRecord.report || "Rapor metni bulunamadı."}

ZORUNLU ÇIKTI
1. Nihai Karar: yalnızca AL, PAZARLIK YAP, BEKLE veya UZAK DUR
2. Karar Güveni: X/100
3. Yatırım Puanı: X/100
4. Fırsat Puanı: X/100
5. Risk Puanı: X/100
6. Likidite Puanı: X/100
7. Kararı Destekleyen 3 Ana Gerekçe
8. Kararı Zayıflatan 3 Eksik veya Riskli Veri
9. Önerilen İlk Teklif
10. Hedef Anlaşma Fiyatı
11. Maksimum Ödenebilir Fiyat
12. Satın Almadan Önce 5 Maddelik Kontrol Listesi

KURALLAR
- Raporda bulunmayan bilgiyi uydurma.
- Gerçek zamanlı resmî veriye erişimin varmış gibi davranma.
- Fiyat önerilerini rapordaki veriler desteklemiyorsa kesin rakam yerine yöntem ve aralık belirt.
- Sonucu profesyonel, sade ve açıklanabilir Türkçe ile yaz.
- Bunun kesin ekspertiz, hukuk veya yatırım tavsiyesi olmadığını belirt.`,
        }),
      });

      const data: unknown = await response.json();
      if (!response.ok) throw new Error(extractText(data) || "AI kararı üretilemedi.");
      const text = extractText(data);
      if (!text) throw new Error("AI yanıtı boş geldi.");
      setAiResult(text);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "AI işlemi tamamlanamadı.");
    } finally {
      setAiLoading(false);
    }
  }

  function escapeReportHtml(value: string) {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function openProfessionalPdfReport() {
    if (!selectedPdfRecord) {
      setPdfNotice("PDF oluşturmak için önce kayıtlı bir analiz raporu seçin.");
      return;
    }

    const popup = window.open("", "_blank", "width=1100,height=850");
    if (!popup) {
      setPdfNotice("Tarayıcı yeni pencereyi engelledi. Açılır pencereye izin verip yeniden deneyin.");
      return;
    }

    const scoreRows = [
      ["Veri Güveni", selectedPdfScores.trust],
      ["Yatırım", selectedPdfScores.investment],
      ["Fırsat", selectedPdfScores.opportunity],
      ["Risk", selectedPdfScores.risk],
      ["Likidite", selectedPdfScores.liquidity],
    ];
    const audienceLabel = pdfAudience === "bank" ? "Banka / Finans Kurumu" : pdfAudience === "customer" ? "Müşteri Sunumu" : "Yatırımcı Sunumu";
    const reportText = escapeReportHtml(selectedPdfRecord.report || "Bu analiz için ayrıntılı rapor metni bulunmuyor.").replace(/\n/g, "<br />");
    const location = escapeReportHtml(locationText(selectedPdfRecord) || "Konum belirtilmedi");
    const decision = escapeReportHtml(selectedPdfRecord.decision || decisionFromReport(selectedPdfRecord.report || ""));
    const createdDate = safeDate(selectedPdfRecord.created_at);
    const verificationCode = `${pdfReportNo}-${Math.max(0, selectedPdfPrice).toString(36).toUpperCase()}`;

    popup.document.write(`<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${pdfReportNo} · Yaşam AI Profesyonel Rapor</title>
<style>
@page{size:A4;margin:14mm}*{box-sizing:border-box}body{margin:0;font-family:Inter,Arial,sans-serif;color:#112f50;background:#edf3f8}.page{width:210mm;min-height:297mm;margin:18px auto;background:#fff;box-shadow:0 18px 55px rgba(17,47,80,.18);overflow:hidden}.cover{min-height:275mm;padding:24mm 20mm;background:linear-gradient(145deg,#071e37 0%,#0b3e6b 56%,#0876c9 100%);color:#fff;position:relative}.cover:after{content:"";position:absolute;width:280px;height:280px;border:1px solid rgba(255,255,255,.16);border-radius:50%;right:-80px;top:80px}.brand{font-size:34px;font-weight:900;letter-spacing:-1px}.gold{color:#f2c46d}.eyebrow{font-size:11px;font-weight:800;letter-spacing:2px;opacity:.78}.cover h1{font-size:46px;line-height:1.03;margin:40mm 0 8mm;max-width:150mm}.lead{font-size:18px;line-height:1.6;max-width:145mm;color:#d8e9f8}.meta{position:absolute;bottom:22mm;left:20mm;right:20mm;display:grid;grid-template-columns:1fr 1fr;gap:12px}.meta div{padding:14px;border:1px solid rgba(255,255,255,.2);border-radius:12px;background:rgba(255,255,255,.07)}.content{padding:18mm}.section{margin-bottom:12mm;break-inside:avoid}.section-title{display:flex;align-items:center;gap:10px;font-size:20px;margin:0 0 6mm}.section-title:before{content:"";width:5px;height:24px;border-radius:5px;background:#0876c9}.hero{display:grid;grid-template-columns:1.5fr .8fr;gap:12px}.card{border:1px solid #dce7f1;border-radius:14px;padding:16px;background:#f9fbfd}.decision{background:linear-gradient(135deg,#0a3157,#0876c9);color:#fff}.decision strong{display:block;font-size:30px;margin-top:8px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.score-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.score{border:1px solid #dce7f1;border-radius:12px;padding:12px;text-align:center}.score b{display:block;font-size:24px;color:#0876c9;margin-top:5px}.label{font-size:10px;letter-spacing:.8px;font-weight:800;color:#6c8196}.value{font-size:16px;font-weight:800;margin-top:5px}.report{font-size:13px;line-height:1.75;color:#29445f}.projection{display:grid;grid-template-columns:1fr 1fr;gap:10px}.projection .card{border-top:4px solid #0876c9}.verify{display:grid;grid-template-columns:1fr 110px;gap:18px;align-items:center}.qr{width:110px;height:110px;padding:10px;border:8px solid #112f50;background:repeating-linear-gradient(45deg,#112f50 0 7px,#fff 7px 14px);display:grid;place-items:center}.qr span{background:#fff;padding:5px;font-size:9px;font-weight:900}.footer{border-top:1px solid #dce7f1;padding-top:6mm;font-size:10px;color:#71869a;line-height:1.5}.toolbar{position:fixed;right:18px;top:18px;display:flex;gap:8px}.toolbar button{border:0;border-radius:10px;padding:12px 16px;font-weight:800;cursor:pointer}.primary{background:#0876c9;color:#fff}.secondary{background:#fff;color:#153a65}@media print{body{background:#fff}.page{margin:0;box-shadow:none}.toolbar{display:none}.page-break{break-before:page}}@media(max-width:800px){.page{width:100%;margin:0}.cover,.content{padding:28px}.cover{min-height:100vh}.cover h1{margin-top:110px}.meta,.hero,.grid,.score-grid,.projection,.verify{grid-template-columns:1fr}.meta{position:static;margin-top:90px}}
</style></head><body>
<div class="toolbar"><button class="secondary" onclick="window.close()">Kapat</button><button class="primary" onclick="window.print()">PDF Olarak Kaydet / Yazdır</button></div>
<section class="page"><div class="cover"><div class="eyebrow">TÜRKİYE'NİN GAYRİMENKUL KARAR PLATFORMU</div><div class="brand">Yaşam <span class="gold">AI</span></div><h1>Profesyonel Gayrimenkul Analiz Raporu</h1><p class="lead">Veri güveni, yatırım potansiyeli, risk görünümü ve açıklanabilir yapay zekâ kararını tek bir kurumsal dosyada birleştirir.</p><div class="meta"><div><div class="eyebrow">RAPOR NUMARASI</div><strong>${pdfReportNo}</strong></div><div><div class="eyebrow">SUNUM TÜRÜ</div><strong>${audienceLabel}</strong></div><div><div class="eyebrow">TAŞINMAZ</div><strong>${location}</strong></div><div><div class="eyebrow">OLUŞTURMA TARİHİ</div><strong>${new Intl.DateTimeFormat("tr-TR", { dateStyle: "long" }).format(new Date())}</strong></div></div></div></section>
<section class="page page-break"><div class="content"><div class="section"><h2 class="section-title">Yönetici Özeti</h2><div class="hero"><div class="card decision"><span class="eyebrow">YAŞAM AI NİHAİ KARARI</span><strong>${decision}</strong><p>Bu karar, kayıtlı analiz verileri ve rapor metninden üretilmiştir. Nihai işlem öncesinde tapu, imar, hukuki ve teknik kontroller tamamlanmalıdır.</p></div><div class="card"><div class="label">RAPOR TARİHİ</div><div class="value">${createdDate}</div><div class="label" style="margin-top:16px">HEDEF KİTLE</div><div class="value">${audienceLabel}</div></div></div></div>
<div class="section"><h2 class="section-title">Taşınmaz Kimliği</h2><div class="grid"><div class="card"><div class="label">KONUM</div><div class="value">${location}</div></div><div class="card"><div class="label">TÜR</div><div class="value">${escapeReportHtml(selectedPdfRecord.property_type || "Belirtilmedi")}</div></div><div class="card"><div class="label">ALAN</div><div class="value">${escapeReportHtml(selectedPdfRecord.area || "—")} m²</div></div><div class="card"><div class="label">TALEP FİYATI</div><div class="value">${formatCurrency(selectedPdfRecord.asking_price)}</div></div><div class="card"><div class="label">TAHMİNİ m² FİYATI</div><div class="value">${selectedPdfM2 ? formatCurrency(String(selectedPdfM2)) : "—"}</div></div><div class="card"><div class="label">DURUM</div><div class="value">${selectedPdfRecord.is_favorite ? "Favori Portföy" : "Aktif Analiz"}</div></div></div></div>
<div class="section"><h2 class="section-title">Karar Skorları</h2><div class="score-grid">${scoreRows.map(([label, value]) => `<div class="score"><span class="label">${label}</span><b>${value ?? "—"}</b><small>/100</small></div>`).join("")}</div></div>
<div class="section"><h2 class="section-title">Değer Projeksiyonu</h2><div class="projection"><div class="card"><div class="label">5 YILLIK SENARYO</div><div class="value">${projection5 ? formatCurrency(String(projection5)) : "Veri yetersiz"}</div><p>Yıllık bileşik %18 varsayımıyla örnek senaryo.</p></div><div class="card"><div class="label">10 YILLIK SENARYO</div><div class="value">${projection10 ? formatCurrency(String(projection10)) : "Veri yetersiz"}</div><p>Yıllık bileşik %16 varsayımıyla örnek senaryo.</p></div></div><p style="font-size:10px;color:#71869a">Projeksiyonlar garanti değildir; enflasyon, bölgesel gelişim, arz-talep ve finansman koşulları sonucu değiştirebilir.</p></div></div></section>
<section class="page page-break"><div class="content"><div class="section"><h2 class="section-title">Açıklanabilir AI Analizi</h2><div class="card report">${reportText}</div></div><div class="section"><h2 class="section-title">Dijital Doğrulama</h2><div class="card verify"><div><div class="label">DOĞRULAMA KODU</div><div class="value">${verificationCode}</div><p class="report">Bu alan, rapor kimliğini ve sürüm izini temsil eder. Canlı doğrulama servisi devreye alındığında QR kod, güvenli doğrulama sayfasına bağlanacaktır.</p></div><div class="qr"><span>YAŞAM AI<br>DOĞRULA</span></div></div></div><div class="footer"><strong>Önemli Açıklama:</strong> Bu rapor otomatik karar desteği sağlar; resmî ekspertiz, yatırım danışmanlığı, hukuki görüş veya kredi tahsis kararı değildir. Kullanıcı, işlem öncesinde yetkili uzmanlardan doğrulama almalıdır.<br><br>© ${new Date().getFullYear()} Yaşam AI · Profesyonel Gayrimenkul Karar Platformu · ${pdfReportNo}</div></div></section>
</body></html>`);
    popup.document.close();
    setPdfNotice("Profesyonel rapor yeni pencerede hazırlandı. Açılan ekranda ‘PDF Olarak Kaydet / Yazdır’ düğmesini kullanın.");
  }

  async function copyPdfSummary() {
    if (!selectedPdfRecord) return;
    const summary = `Yaşam AI Profesyonel Rapor
${pdfReportNo}
${locationText(selectedPdfRecord)}
Karar: ${selectedPdfRecord.decision || decisionFromReport(selectedPdfRecord.report || "")}
Talep: ${formatCurrency(selectedPdfRecord.asking_price)}
Rapor tarihi: ${safeDate(selectedPdfRecord.created_at)}`;
    try {
      await navigator.clipboard.writeText(summary);
      setPdfNotice("Rapor özeti panoya kopyalandı.");
    } catch {
      setPdfNotice("Tarayıcı pano erişimine izin vermedi.");
    }
  }

  const modules = [
    ["AI", "Açıklanabilir AI Karar Motoru", "AL / PAZARLIK / BEKLE / UZAK DUR, skorlar ve pazarlık çıktıları", "Aktif"],
    ["VERİ", "Türkiye Gayrimenkul Zekâ Motoru", "Canlı filtreleme, bölgesel karşılaştırma, yatırım endeksi ve piyasa göstergeleri", "Aktif"],
    ["YÖNETİM", "Yönetim Paneli", "Canlı KPI, veri kalitesi, sistem sağlığı ve son işlem görünümü", "Aktif"],
    ["ÜYELİK", "Üyelik ve Abonelik", "Standart, Premium ve Gold yetki matrisi", "Aktif"],
    ["RAPOR", "Profesyonel PDF Rapor", "Yazdırma, paylaşım ve kurumsal rapor şablonu", "Aktif"],
    ["PROJE", "Banka Operasyon ve Kredi Karar Merkezi", "Teminat, risk, kredi kuyruğu ve yönetici karar desteği", "Ön yüz hazır"],
    ["PROJE", "Müteahhit ve Proje Yönetim Merkezi", "Fizibilite, bütçe, saha, satış ve doküman operasyonu", "Aktif"],
    ["PORTFÖY", "Yatırımcı ve Portföy Yönetim Merkezi", "Portföy, getiri, risk, senaryo ve AI yatırım özeti", "Aktif"],
    ["KOMUTA", "Yaşam AI Komuta Merkezi", "Tüm modülleri günlük brifing, hızlı eylem, görev ve uyarı akışında birleştirir", "Flagship"],
    ["OPERASYON", "Emlak CRM", "Portföy, müşteri, takip ve görev merkezi", "Altyapı hazır"],
    ["PROJE", "Proje Geliştirme Merkezi", "Arsa fizibilitesi, gelir–maliyet ve marj ön hesabı", "Aktif ön hesap"],
  ] as const;



  return (
    <section style={panelStyle}>
      {section === "command" ? (
        <>
          <article style={{ position: "relative", overflow: "hidden", padding: "clamp(25px,4vw,44px)", borderRadius: 30, color: "#fff", background: "radial-gradient(circle at 86% 18%,rgba(42,197,255,.24),transparent 28%),radial-gradient(circle at 12% 92%,rgba(50,214,159,.17),transparent 34%),linear-gradient(135deg,#061727 0%,#0a3457 56%,#0876c9 100%)", boxShadow: "0 30px 75px rgba(5,31,55,.28)", border: "1px solid rgba(255,255,255,.13)" }}>
            <div style={{ position: "absolute", width: 310, height: 310, borderRadius: "50%", right: -120, top: -140, border: "1px solid rgba(255,255,255,.12)" }} />
            <div style={{ position: "relative", display: "grid", gridTemplateColumns: "minmax(0,1.4fr) minmax(270px,.6fr)", gap: 24, alignItems: "center" }}>
              <div>
                <div style={{ color: "#9ddcff", fontSize: 10, fontWeight: 950, letterSpacing: 2 }}>YAŞAM AI ANA KOMUTA MERKEZİ</div>
                <h2 style={{ margin: "11px 0 10px", maxWidth: 760, fontSize: "clamp(31px,4vw,49px)", lineHeight: 1.05, letterSpacing: "-1.5px" }}>Günaydın Sezai. Bugünün kararları tek ekranda hazır.</h2>
                <p style={{ margin: 0, maxWidth: 760, color: "rgba(255,255,255,.76)", lineHeight: 1.7, fontSize: 14 }}>Projeler, banka dosyaları, portföy, piyasa ve rapor akışlarını ayrı ekranlar gibi değil; aynı karar sisteminin birbirine bağlı parçaları olarak yönetin.</p>
                <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 20 }}>
                  <button type="button" onClick={() => setEnterpriseNotice("Bugünkü çalışma planı oluşturuldu: 1 kritik risk, 2 öncelikli görev ve 3 fırsat inceleme sırasına alındı.")} style={{ padding: "12px 16px", borderRadius: 12, border: 0, background: "#fff", color: "#073b66", fontWeight: 950, cursor: "pointer" }}>Bugünkü Planı Oluştur</button>
                  <button type="button" onClick={() => setSection("ai")} style={{ padding: "12px 16px", borderRadius: 12, border: "1px solid rgba(255,255,255,.24)", background: "rgba(255,255,255,.08)", color: "#fff", fontWeight: 900, cursor: "pointer" }}>AI Analizine Geç</button>
                </div>
              </div>
              <div style={{ padding: 18, borderRadius: 20, background: "rgba(3,20,34,.42)", border: "1px solid rgba(255,255,255,.14)", backdropFilter: "blur(18px)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}><strong style={{ fontSize: 12, letterSpacing: 1.1 }}>AI GÜNLÜK BRİFİNG</strong><span style={{ padding: "5px 8px", borderRadius: 999, background: "rgba(63,220,165,.14)", color: "#8df0c5", fontSize: 9, fontWeight: 950 }}>● HAZIR</span></div>
                <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
                  {[["En önemli fırsat","Adana ticari portföyünde güçlü likidite"],["En büyük risk","Nova Loft takviminde iki kritik görev"],["Bugünkü öncelik","3 banka dosyasını insan onayına gönder"],["AI önerisi","Nakit tamponunu 4,2 ayın üzerinde koru"]].map(([a,b],i) => <div key={a} style={{ padding: 10, borderRadius: 12, background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.08)" }}><span style={{ display: "block", color: i===1 ? "#ffc6c6" : i===0 ? "#a8f3d2" : "#bde7ff", fontSize: 9, fontWeight: 900 }}>{a.toUpperCase()}</span><strong style={{ display: "block", marginTop: 4, color: "#fff", fontSize: 11, lineHeight: 1.45 }}>{b}</strong></div>)}
                </div>
              </div>
            </div>
          </article>

          {enterpriseNotice ? <div style={{ ...locationInfoBox, marginTop: 14, border: "1px solid #b9dcf7", background: "linear-gradient(90deg,#f5fbff,#eef8ff)" }}>{enterpriseNotice}</div> : null}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))", gap: 10, marginTop: 14 }}>
            {[["Toplam portföy","₺84,0 Mn","+%18,6"],["Aktif proje","3","1 dikkat"],["Banka dosyası","4","3 onay"],["Aylık nakit","₺286 Bin","+%7,2"],["AI karar skoru","91/100","Güçlü"],["Sistem sağlığı","%99,9","Aktif"]].map(([a,b,c],i)=><article key={a} style={{ padding: 15, borderRadius: 17, border: "1px solid #dbe7f3", background: i===4 ? "linear-gradient(145deg,#effbf6,#fff)" : "linear-gradient(145deg,#fff,#f7fbff)", boxShadow: "0 8px 22px rgba(31,64,97,.05)" }}><div style={{ color: "#74899e", fontSize: 9, fontWeight: 950, letterSpacing: .5 }}>{a.toUpperCase()}</div><strong style={{ display: "block", marginTop: 7, color: i===4 ? "#087b5e" : "#153a65", fontSize: 23 }}>{b}</strong><span style={{ display: "block", marginTop: 4, color: i===1 ? "#b45309" : "#0f8065", fontSize: 9, fontWeight: 850 }}>{c}</span></article>)}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.35fr) minmax(280px,.65fr)", gap: 14, marginTop: 14 }}>
            <article style={{ ...qualityRuleStyle, padding: 19 }}>
              <div style={sectionHeader}><div><div style={eyebrow}>BUGÜN</div><h3 style={{ margin: "6px 0 0", color: "#153a65", fontSize: 22 }}>Önceliklerin sade ve karar odaklı.</h3></div><span style={onlineBadge}>Son güncelleme · şimdi</span></div>
              <div style={{ display: "grid", gap: 9, marginTop: 14 }}>
                {[["🔴","Nova Loft","Asansör ölçümü gecikirse takvim etkilenebilir.","Projeyi aç","developer"],["🟠","Banka Merkezi","3 dosya insan onayı bekliyor.","Dosyaları incele","bank"],["🟢","Portföy Merkezi","Adana ticari varlığında güçlü likidite sinyali.","Fırsatı aç","investor"],["🔵","Türkiye Veri Motoru","Bölgesel veri güveni güncellendi.","Piyasayı gör","market"]].map(([icon,title,text,action,target]) => <div key={title} style={{ display: "grid", gridTemplateColumns: "34px minmax(0,1fr) auto", gap: 10, alignItems: "center", padding: 12, borderRadius: 14, border: "1px solid #e0e9f2", background: "#fff" }}><span style={{ fontSize: 18 }}>{icon}</span><div><strong style={{ color: "#153a65", fontSize: 12 }}>{title}</strong><span style={{ display: "block", marginTop: 3, color: "#74899e", fontSize: 10, lineHeight: 1.45 }}>{text}</span></div><button type="button" onClick={() => { if(target === "market") setSection("market"); else { setEnterpriseRole(target as typeof enterpriseRole); setSection("enterprise"); } }} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #cfe0ef", background: "#f8fbff", color: "#285c86", fontSize: 9, fontWeight: 900, cursor: "pointer" }}>{action}</button></div>)}
              </div>
            </article>

            <article style={{ padding: 19, borderRadius: 22, color: "#fff", background: "linear-gradient(145deg,#0b664f,#079a70)", boxShadow: "0 18px 38px rgba(7,126,93,.18)" }}>
              <div style={{ fontSize: 10, fontWeight: 950, letterSpacing: 1.4, color: "#bff6df" }}>YAŞAM AI KO-PİLOT</div>
              <h3 style={{ margin: "8px 0 5px", fontSize: 22 }}>Bugün neyi yönetelim?</h3>
              <p style={{ margin: 0, color: "rgba(255,255,255,.75)", fontSize: 11, lineHeight: 1.55 }}>Doğal dille sorun; ilgili modülü ve karar akışını tek adımda açın.</p>
              <div style={{ display: "grid", gap: 7, marginTop: 13 }}>
                {["Elysium Loft nakit akışını özetle","Adana fırsatlarını göster","Banka risk dosyalarını sırala"].map(x => <button key={x} type="button" onClick={() => setEnterpriseNotice(`AI Ko-Pilot komutu alındı: ${x}. İlgili çalışma alanı hazırlandı.`)} style={{ padding: 10, borderRadius: 11, border: "1px solid rgba(255,255,255,.16)", background: "rgba(255,255,255,.08)", color: "#fff", textAlign: "left", fontSize: 10, fontWeight: 800, cursor: "pointer" }}>{x} →</button>)}
              </div>
              <div style={{ display: "flex", gap: 7, marginTop: 11 }}><input value={enterpriseQuestion} onChange={(e)=>setEnterpriseQuestion(e.target.value)} placeholder="Komutunuzu yazın..." style={{ flex: 1, minWidth: 0, padding: "11px 12px", borderRadius: 11, border: "1px solid rgba(255,255,255,.18)", background: "rgba(255,255,255,.1)", color: "#fff", outline: "none" }} /><button type="button" onClick={() => setEnterpriseNotice(enterpriseQuestion.trim() ? `AI Ko-Pilot komutu alındı: ${enterpriseQuestion}` : "Lütfen bir komut yazın.")} style={{ padding: "11px 13px", borderRadius: 11, border: 0, background: "#fff", color: "#087b5e", fontWeight: 950, cursor: "pointer" }}>Gönder</button></div>
            </article>
          </div>

          <article style={{ ...qualityRuleStyle, padding: 19, marginTop: 14 }}>
            <div style={sectionHeader}><div><div style={eyebrow}>BÜTÜNLEŞİK ÇALIŞMA ALANLARI</div><h3 style={{ margin: "6px 0 0", color: "#153a65", fontSize: 22 }}>Aynı platform, tek kullanıcı deneyimi.</h3></div><span style={secureBadge}>Ortak veri ve karar katmanı</span></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginTop: 14 }}>
              {[
                ["🏦","Banka","Teminat, LTV ve kredi karar akışı","bank","#eaf5ff"],
                ["🏗️","Projeler","Fizibilite, saha, finans ve satış","developer","#fff7e8"],
                ["🏠","İlanlar","Türkiye geneli akıllı ilan ve keşif pazarı","listings","#fff4ec"],
                ["💼","Portföy","Getiri, likidite ve senaryo yönetimi","investor","#edfdf6"],
                ["📐","Değerleme","Emsal, güven ve uzman iş akışı","valuation","#f5f0ff"],
                ["🗺️","Türkiye","Bölgesel piyasa ve veri zekâsı","market","#eef8ff"],
                ["📄","Raporlar","Kurumsal PDF ve yönetici özeti","pdf","#f8f6ff"],
              ].map(([icon,title,text,target,bg]) => <button key={title} type="button" onClick={() => { if(target === "market" || target === "pdf" || target === "listings") setSection(target as "market" | "pdf" | "listings"); else { setEnterpriseRole(target as typeof enterpriseRole); setSection("enterprise"); } }} style={{ padding: 16, borderRadius: 17, border: "1px solid #dbe7f3", background: bg, textAlign: "left", cursor: "pointer" }}><span style={{ fontSize: 22 }}>{icon}</span><strong style={{ display: "block", marginTop: 9, color: "#153a65", fontSize: 14 }}>{title}</strong><span style={{ display: "block", marginTop: 4, color: "#74899e", fontSize: 10, lineHeight: 1.45 }}>{text}</span><span style={{ display: "block", marginTop: 9, color: "#0876c9", fontSize: 9, fontWeight: 950 }}>Çalışma alanını aç →</span></button>)}
            </div>
          </article>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(280px,.72fr)", gap: 14, marginTop: 14 }}>
            <article style={{ ...qualityRuleStyle, padding: 19 }}>
              <div style={eyebrow}>PİYASA NABZI</div><h3 style={{ margin: "6px 0 12px", color: "#153a65", fontSize: 21 }}>Bugünün öne çıkan sinyalleri</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))", gap: 9 }}>
                {[["Adana","Güçlü","Ticari likidite"],["Mersin","Dengeli","Arsa getirisi"],["Ankara","Pozitif","Konut talebi"],["Antalya","İzle","Fiyat oynaklığı"]].map(([city,status,text],i)=><div key={city} style={{ padding: 13, borderRadius: 14, border: "1px solid #e0e9f2", background: "#fff" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong style={{ color: "#153a65" }}>{city}</strong><span style={{ color: i===3 ? "#b45309" : "#047857", fontSize: 9, fontWeight: 900 }}>{status}</span></div><span style={{ display: "block", marginTop: 5, color: "#74899e", fontSize: 10 }}>{text}</span><div style={{ height: 5, borderRadius: 999, background: "#e6eef6", marginTop: 10, overflow: "hidden" }}><div style={{ width: `${84-i*9}%`, height: "100%", background: i===3 ? "#f3b84b" : "linear-gradient(90deg,#0f9d76,#42d4aa)" }} /></div></div>)}
              </div>
            </article>
            <article style={{ ...qualityRuleStyle, padding: 19 }}>
              <div style={eyebrow}>GÜVEN VE SİSTEM DURUMU</div><h3 style={{ margin: "6px 0 12px", color: "#153a65", fontSize: 21 }}>Platform hazır ve izlenebilir.</h3>
              <div style={{ display: "grid", gap: 8 }}>{[["AI Karar Motoru","Aktif"],["Türkiye Veri Motoru",`${regionalData.length} kayıt`],["Kurumsal PDF","Hazır"],["Rol ve Yetki","Kontrollü"],["KVKK yaklaşımı","Veri minimizasyonu"]].map(([a,b])=><div key={a} style={{ display: "flex", justifyContent: "space-between", gap: 10, paddingBottom: 8, borderBottom: "1px solid #e5edf5", fontSize: 10 }}><span style={{ color: "#607890" }}>{a}</span><strong style={{ color: "#0876c9" }}>{b}</strong></div>)}</div>
            </article>
          </div>
        </>
      ) : null}

      {section === "roadmap" ? (
        <>
          <div style={statsGrid}>
            <Stat title="Aktif Rapor" value={active.length} text="Bulut karar dosyası" />
            <Stat title="Doğrulanmış Bölge" value={trustedRegional.length} text="Güven skoru ≥ 70" />
            <Stat title="Veri Güveni" value={avgConfidence || "—"} suffix={avgConfidence ? "/100" : ""} text="Doğrulanmış bölge ortalaması" />
            <Stat title="Birleşik Modül" value={8} text="Bütünleşik platform kapsamı" />
          </div>
          <div style={{ display: "grid", gap: 10 }}>
            {modules.map(([version, title, text, status]) => (
              <div key={version} style={{ display: "grid", gridTemplateColumns: "72px minmax(0,1fr) auto", gap: 12, alignItems: "center", padding: 14, border: "1px solid #dbe7f3", borderRadius: 15, background: "#f8fbff" }}>
                <strong style={{ color: "#0876c9", fontSize: 18 }}>{version}</strong>
                <div><strong style={{ color: "#153a65" }}>{title}</strong><div style={{ color: "#607890", fontSize: 12, marginTop: 4 }}>{text}</div></div>
                <span style={{ ...onlineBadge, margin: 0 }}>{status}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {section === "ai" ? (
        <>
          <div style={twoColumnGrid}>
            <article style={{ ...qualityRuleStyle, padding: 18 }}>
              <div style={eyebrow}>AÇIKLANABİLİR AI KARAR MOTORU</div>
              <h3 style={{ margin: "7px 0", color: "#153a65", fontSize: 24 }}>Kayıtlı raporu bağımsız yeniden değerlendir</h3>
              <p style={{ color: "#607890", lineHeight: 1.55, marginTop: 0 }}>
                Bu merkez seçilen bulut raporunu /api/chat üzerinden yeniden analiz eder; kararın gerekçelerini,
                eksik verileri ve pazarlık sınırlarını ayrı bir çıktı halinde üretir.
              </p>
              <label style={labelStyle}>
                Analiz dosyası
                <select
                  value={selectedAiRecord?.id ?? ""}
                  onChange={(event) => { setAiRecordId(event.target.value); setAiResult(""); setAiError(""); }}
                  style={inputStyle}
                >
                  {!records.length ? <option value="">Henüz kayıtlı rapor yok</option> : null}
                  {records.map((item) => (
                    <option key={item.id} value={item.id}>
                      {locationText(item)} · {item.property_type || "Taşınmaz"} · {formatCurrency(item.asking_price)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={generateExplainableDecision}
                disabled={!selectedAiRecord || aiLoading}
                style={{ ...blueButton, width: "100%", opacity: !selectedAiRecord || aiLoading ? 0.65 : 1 }}
              >
                {aiLoading ? "AI karar analizi hazırlanıyor..." : "Açıklanabilir AI Kararı Üret"}
              </button>
              {aiError ? <div style={{ ...alertStyle, marginTop: 12 }}>{aiError}</div> : null}
            </article>

            <article style={{ ...qualityRuleStyle, padding: 18 }}>
              <div style={eyebrow}>MEVCUT RAPOR ÖZETİ</div>
              {selectedAiRecord ? (
                <>
                  <h3 style={{ margin: "7px 0 14px", color: "#153a65" }}>{locationText(selectedAiRecord)}</h3>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10 }}>
                    <MiniMeta label="Mevcut karar" value={selectedAiRecord.decision || "DEĞERLENDİR"} />
                    <MiniMeta label="Talep fiyatı" value={formatCurrency(selectedAiRecord.asking_price)} />
                    <MiniMeta label="Yatırım" value={selectedAiScores?.investment != null ? `${selectedAiScores.investment}/100` : "—"} />
                    <MiniMeta label="Risk" value={selectedAiScores?.risk != null ? `${selectedAiScores.risk}/100` : "—"} />
                    <MiniMeta label="Güven" value={selectedAiScores?.trust != null ? `${selectedAiScores.trust}/100` : "—"} />
                    <MiniMeta label="Likidite" value={selectedAiScores?.liquidity != null ? `${selectedAiScores.liquidity}/100` : "—"} />
                  </div>
                  <p style={{ color: "#7b8fa5", fontSize: 12, lineHeight: 1.5, marginBottom: 0 }}>
                    Bu skorlar kayıtlı rapor metninden okunur. AI karar düğmesi aynı dosya için yeni ve açıklanabilir bir AI değerlendirmesi üretir.
                  </p>
                </>
              ) : <div style={emptyState}>Önce “Yeni Analiz” bölümünden bir rapor oluşturun.</div>}
            </article>
          </div>

          {aiResult ? (
            <article style={{ ...reportPaper, marginTop: 16 }}>
              <div style={sectionHeader}>
                <div><div style={eyebrow}>CANLI AI ÇIKTISI</div><h3 style={{ margin: "6px 0 0", color: "#153a65" }}>Açıklanabilir Karar Raporu</h3></div>
                <span style={secureBadge}>{decisionFromReport(aiResult)}</span>
              </div>
              <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.75, color: "#263f5a" }}>{aiResult}</div>
            </article>
          ) : null}
        </>
      ) : null}

      {section === "market" ? (
        <>
          <article style={{ position: "relative", overflow: "hidden", padding: "clamp(24px,4vw,40px)", borderRadius: 28, marginBottom: 16, color: "#fff", background: "radial-gradient(circle at 82% 20%,rgba(255,255,255,.18),transparent 30%),linear-gradient(135deg,#8f1d2c 0%,#d62b3c 46%,#0876c9 100%)", boxShadow: "0 24px 58px rgba(40,56,87,.22)" }}>
            <div style={{ position: "absolute", inset: 0, opacity: .16, backgroundImage: "linear-gradient(rgba(255,255,255,.22) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.22) 1px,transparent 1px)", backgroundSize: "30px 30px" }} />
            <div style={{ position: "relative", display: "grid", gridTemplateColumns: "minmax(0,1.35fr) minmax(280px,.65fr)", gap: 22, alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 950, letterSpacing: 1.5, color: "#ffe0e3" }}>TÜRKİYE GAYRİMENKUL GÖRÜNÜMÜ</div>
                <h3 style={{ margin: "8px 0 10px", fontSize: "clamp(30px,4.8vw,48px)", lineHeight: 1.04, letterSpacing: "-1.2px" }}>81 ili tek karar ekranında okuyun.</h3>
                <p style={{ margin: 0, maxWidth: 720, color: "rgba(255,255,255,.82)", lineHeight: 1.65, fontSize: 14 }}>İl, ilçe ve mahalle bazında satış fiyatı, kira, yıllık değişim, likidite, ulaşım ve veri güvenini karşılaştırın. Kayıtlı gerçek veriler geldikçe ekran otomatik olarak canlılaşır.</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>{["81 il kapsamı", "İlçe ve mahalle filtresi", "Kaynak ve tarih görünürlüğü", "Tahmin değil kayıtlı veri"].map((item) => <span key={item} style={{ padding: "7px 10px", borderRadius: 999, border: "1px solid rgba(255,255,255,.24)", background: "rgba(255,255,255,.10)", fontSize: 10, fontWeight: 900 }}>{item}</span>)}</div>
              </div>
              <div style={{ padding: 18, borderRadius: 20, background: "rgba(4,29,54,.26)", border: "1px solid rgba(255,255,255,.18)", backdropFilter: "blur(12px)" }}>
                <div style={{ fontSize: 10, fontWeight: 900, color: "#d8efff" }}>CANLI VERİ DURUMU</div>
                <strong style={{ display: "block", marginTop: 7, fontSize: 38 }}>{regionalData.length}</strong>
                <span style={{ color: "rgba(255,255,255,.72)", fontSize: 12 }}>bölgesel kayıt</span>
                <div style={{ height: 6, borderRadius: 99, marginTop: 14, background: "rgba(255,255,255,.16)", overflow: "hidden" }}><div style={{ width: `${Math.min(100, Math.max(8, regionalCoverageRate))}%`, height: "100%", background: "linear-gradient(90deg,#fff,#9fe2ff)" }} /></div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, color: "rgba(255,255,255,.68)", fontSize: 10 }}><span>Kaynak kapsaması</span><strong>%{regionalCoverageRate}</strong></div>
              </div>
            </div>
          </article>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 10, marginBottom: 16 }}>
            {[
              ["Marmara", "Yüksek işlem hacmi", "İstanbul · Bursa · Kocaeli", "#153a65"],
              ["Ege", "Turizm ve yaşam talebi", "İzmir · Muğla · Aydın", "#087b5e"],
              ["Akdeniz", "Konut ve turizm dengesi", "Antalya · Mersin · Adana", "#d97706"],
              ["İç Anadolu", "Başkent ve sanayi ekseni", "Ankara · Konya · Kayseri", "#6d4cc7"],
              ["Karadeniz", "Kıyı ve gelişim koridoru", "Samsun · Trabzon · Ordu", "#0876c9"],
              ["Güneydoğu", "Genç nüfus ve büyüme", "Gaziantep · Diyarbakır · Şanlıurfa", "#b54757"],
            ].map(([region,signal,cities,color]) => <article key={region} style={{ padding: 15, borderRadius: 17, border: "1px solid #dce7f1", background: "linear-gradient(145deg,#fff,#f8fbfe)", boxShadow: "0 9px 24px rgba(31,64,97,.06)" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong style={{ color: String(color), fontSize: 14 }}>{region}</strong><span style={{ width: 9, height: 9, borderRadius: "50%", background: String(color), boxShadow: `0 0 0 5px ${String(color)}18` }} /></div><div style={{ color: "#29445f", fontSize: 11, fontWeight: 800, marginTop: 8 }}>{signal}</div><div style={{ color: "#7c90a4", fontSize: 10, marginTop: 4 }}>{cities}</div></article>)}
          </div>

          <div style={statsGrid}>
            <Stat title="Filtrelenen Bölge" value={marketRecords.length} text="Fiyat verisi bulunan kayıt" />
            <Stat title="Ortalama Satış m²" value={marketAverageM2 ? formatCurrency(String(marketAverageM2)) : "—"} text="Seçili bölge ve taşınmaz türü" />
            <Stat title="Ortalama Kira m²" value={marketAverageRent ? formatCurrency(String(marketAverageRent)) : "—"} text="Aylık kira göstergesi" />
            <Stat title="Yıllık Değişim" value={marketRecords.length ? `%${marketAverageChange}` : "—"} text="Veri kayıtlarının ortalaması" />
          </div>

          <article style={{ ...qualityRuleStyle, padding: 18, marginBottom: 16, background: "linear-gradient(145deg,#f7fbff,#ffffff)" }}>
            <div style={sectionHeader}>
              <div>
                <div style={eyebrow}>TÜRKİYE KONUM ÇEKİRDEĞİ</div>
                <h3 style={{ margin: "6px 0 0", color: "#153a65", fontSize: 24 }}>81 il, 973 ilçe ve 32 binin üzerinde mahalle</h3>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={locationError && locationSource === "waiting" ? { ...secureBadge, background: "#fff0f0", color: "#b42318", border: "1px solid #f4b8b8" } : secureBadge}>
                  {locationLoading ? "Konumlar güncelleniyor" : locationSource === "live" ? "Canlı veri aktif" : locationSource === "cache" ? "Güvenli önbellek aktif" : "Bağlantı bekleniyor"}
                </span>
                <button type="button" onClick={() => setLocationRefreshNonce((value) => value + 1)} disabled={locationLoading} style={{ padding: "8px 12px", borderRadius: 10, border: "1px solid #b9cce0", background: "#ffffff", color: "#153a65", fontWeight: 900, cursor: locationLoading ? "not-allowed" : "pointer", opacity: locationLoading ? 0.65 : 1 }}>Yenile</button>
              </div>
            </div>
            <p style={{ color: "#607890", lineHeight: 1.6, marginTop: 8 }}>
              İl, ilçe ve mahalle adları güncel Türkiye idari veri servisinden gelir. Piyasa fiyatları yalnızca Supabase&apos;teki kaynaklı market_data kayıtlarından gösterilir; konum listesinde bulunmak fiyat verisi bulunduğu anlamına gelmez.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12 }}>
              <label style={labelStyle}>İl
                <select value={selectedProvinceId} onChange={(event) => setSelectedProvinceId(Number(event.target.value))} style={inputStyle} disabled={locationLoading && !locationProvinces.length}>
                  {locationProvinces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              <label style={labelStyle}>İlçe
                <select value={selectedDistrictId} onChange={(event) => setSelectedDistrictId(Number(event.target.value))} style={inputStyle} disabled={!locationDistricts.length}>
                  <option value={0}>İlçe seçin</option>
                  {locationDistricts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              <label style={labelStyle}>Mahalle
                <select value={selectedNeighborhoodId} onChange={(event) => setSelectedNeighborhoodId(Number(event.target.value))} style={inputStyle} disabled={!locationNeighborhoods.length}>
                  <option value={0}>Mahalle seçin</option>
                  {locationNeighborhoods.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
            </div>
            <section style={{ marginTop: 14, padding: 15, borderRadius: 17, border: "1px solid #cfe1ef", background: "linear-gradient(145deg,#f7fbff,#ffffff)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <div>
                  <div style={eyebrow}>V65 · GERÇEK VERİ PİLOTU</div>
                  <strong style={{ display: "block", marginTop: 5, color: "#153a65", fontSize: 15 }}>
                    {selectedProvince?.name || "İl"} / {selectedDistrict?.name || "İlçe"} veri hazırlığı
                  </strong>
                  <span style={{ display: "block", marginTop: 4, color: "#607890", fontSize: 10, lineHeight: 1.5 }}>
                    Şablon, seçili ilçenin canlı mahalle listesini otomatik doldurur. Fiyat, kira, örneklem, kaynak ve güven alanları doğrulanmadan boş bırakılır; sistem veri uydurmaz.
                  </span>
                </div>
                <button type="button" onClick={downloadSelectedDistrictDataTemplate} disabled={!selectedDistrict || !locationNeighborhoods.length} style={{ ...softButton, opacity: !selectedDistrict || !locationNeighborhoods.length ? .55 : 1, cursor: !selectedDistrict || !locationNeighborhoods.length ? "not-allowed" : "pointer" }}>
                  Seçili İlçe Veri Şablonunu İndir
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 9, marginTop: 12 }}>
                <MiniMeta label="Mahalle kapsamı" value={`${selectedDistrictNeighborhoodRecords.length}/${locationNeighborhoods.length || 0}`} />
                <MiniMeta label="Hazırlık oranı" value={`%${selectedDistrictReadyRate}`} />
                <MiniMeta label="İlçe kayıtları" value={`${selectedDistrictDirectRecords.length}`} />
                <MiniMeta label="Pilot durumu" value={selectedDistrictReadyRate >= 80 ? "Karara hazır" : selectedDistrictReadyRate > 0 ? "Veri toplanıyor" : "Başlangıç"} />
              </div>
            </section>
            {locationError ? <div style={{ ...emptyState, marginTop: 12 }}>{locationError} {locationSource === "cache" ? "Son doğrulanmış konum listesi önbellekten kullanılmaya devam ediyor." : "İnternet bağlantısını kontrol edip Yenile düğmesine basın."}</div> : null}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, marginTop: 14 }}>
              <MiniMeta label="İl kapsamı" value={locationProvinces.length ? `${locationProvinces.length} il` : "Yükleniyor"} />
              <MiniMeta label="Seçili ilçe sayısı" value={`${locationDistricts.length}`} />
              <MiniMeta label="Seçili mahalle sayısı" value={`${locationNeighborhoods.length}`} />
              <MiniMeta label="Veri seti" value={`${locationDatasetMeta.version} · ${locationDatasetMeta.lastUpdated}`} />
              <MiniMeta label="Konum kaynağı" value={locationSource === "live" ? "Canlı servis" : locationSource === "cache" ? "30 günlük güvenli önbellek" : "Bağlantı bekleniyor"} />
            </div>
            <div style={{ marginTop: 12, padding: 13, borderRadius: 13, background: selectedLocationMarketRecord ? "#effbf5" : "#fff8e8", color: selectedLocationMarketRecord ? "#087b5e" : "#8a6418", fontSize: 12, fontWeight: 800 }}>
              {selectedProvince?.name || "İl"}{selectedDistrict ? ` / ${selectedDistrict.name}` : ""}{selectedNeighborhood ? ` / ${selectedNeighborhood.name}` : ""}: {selectedLocationMarketRecord ? `${selectedLocationMatchScope} kullanılıyor — ${formatCurrency(String(selectedLocationMarketRecord.averageM2))}/m², güven %${selectedLocationMarketRecord.dataConfidence}.` : "Konum hazır; doğrulanmış piyasa fiyatı henüz yüklenmemiş."}
              {selectedNeighborhood?.postalCode ? ` Posta kodu: ${selectedNeighborhood.postalCode}${selectedNeighborhood.postalCodeStatus ? ` (${selectedNeighborhood.postalCodeStatus})` : ""}.` : ""}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginTop: 12 }}>
              <MiniMeta label="Karar" value={selectedLocationDecision} />
              <MiniMeta label="Yatırım puanı" value={selectedLocationMarketRecord ? `${selectedLocationInvestmentScore}/100` : "—"} />
              <MiniMeta label="Brüt kira getirisi" value={selectedLocationYield ? `%${selectedLocationYield}` : "—"} />
              <MiniMeta label="Kullanılan veri seviyesi" value={selectedLocationMatchScope} />
            </div>
            {selectedLocationMarketRecord ? <div style={{ marginTop: 10, padding: 13, borderRadius: 13, border: "1px solid #dce7f1", background: "#f8fbff", color: "#45627f", fontSize: 12, lineHeight: 1.6 }}>
              <strong style={{ color: "#153a65" }}>Açıklanabilir karar:</strong> {selectedLocationMatchScope === "Mahalle kaydı" ? "Seçilen mahallenin doğrudan kaydı kullanılıyor." : `${selectedLocationMatchScope} verisi seçili mahalle için referans olarak kullanılıyor; mahalleye özel fiyat yüklenene kadar bu değer kesin mahalle fiyatı sayılmaz.`} Kaynak: {selectedLocationMarketRecord.source || "Belirtilmedi"}. Güncelleme: {selectedLocationMarketRecord.updatedAt || selectedLocationMarketRecord.periodDate || "Belirtilmedi"}.
            </div> : null}

            <article style={{ marginTop: 14, padding: 18, borderRadius: 20, color: "#fff", background: "radial-gradient(circle at 92% 0%,rgba(80,190,255,.26),transparent 34%),linear-gradient(135deg,#062b4d,#075f9f 58%,#087b68)", boxShadow: "0 20px 42px rgba(7,71,120,.20)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div><div style={{ fontSize: 10, letterSpacing: 1.5, fontWeight: 950, color: "#aee4ff" }}>AI KARAR MOTORU 2.0</div><h3 style={{ margin: "7px 0 0", fontSize: 24 }}>Gerekçeli bölgesel ön karar</h3></div>
                <span style={{ padding: "8px 12px", borderRadius: 999, background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.22)", fontSize: 11, fontWeight: 950 }}>{selectedLocationDecision}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))", gap: 10, marginTop: 15 }}>
                {[ ["Yatırım skoru", selectedLocationMarketRecord ? `${selectedLocationInvestmentScore}/100` : "—"], ["Risk görünümü", selectedLocationRiskLabel], ["Karar güveni", selectedLocationMarketRecord ? `%${selectedLocationDecisionConfidence}` : "—"], ["Banka ön görünümü", selectedLocationBankSuitability] ].map(([label,value]) => <div key={label} style={{ padding: 13, borderRadius: 14, background: "rgba(255,255,255,.09)", border: "1px solid rgba(255,255,255,.12)" }}><span style={{ display: "block", color: "rgba(255,255,255,.62)", fontSize: 9, fontWeight: 900 }}>{label}</span><strong style={{ display: "block", marginTop: 6, fontSize: 15 }}>{value}</strong></div>)}
              </div>
              {selectedLocationMarketRecord ? <div style={{ marginTop: 14, display: "grid", gap: 8 }}>{selectedLocationAiReasons.map((reason, index) => <div key={reason} style={{ display: "grid", gridTemplateColumns: "25px 1fr", gap: 9, alignItems: "start", padding: 10, borderRadius: 12, background: "rgba(255,255,255,.07)", color: "rgba(255,255,255,.82)", fontSize: 11, lineHeight: 1.5 }}><span style={{ width: 25, height: 25, display: "grid", placeItems: "center", borderRadius: 8, background: "rgba(255,255,255,.13)", fontWeight: 950 }}>{index + 1}</span><span>{reason}</span></div>)}</div> : <div style={{ marginTop: 14, color: "rgba(255,255,255,.72)", fontSize: 12 }}>Kaynaklı piyasa kaydı yüklenince karar, risk ve güven bileşenleri otomatik hesaplanacaktır.</div>}
              <div style={{ marginTop: 13, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,.14)", color: "rgba(255,255,255,.58)", fontSize: 10, lineHeight: 1.55 }}>Bu çıktı otomatik karar desteğidir; resmî ekspertiz, kredi tahsis kararı veya yatırım danışmanlığı değildir.</div>
            </article>

            <article style={{ marginTop: 14, padding: 18, borderRadius: 20, border: "1px solid #dce7f1", background: "linear-gradient(145deg,#ffffff,#f4f9ff)", boxShadow: "0 16px 36px rgba(31,75,116,.08)" }}>
              <div style={sectionHeader}>
                <div><div style={eyebrow}>AI BÖLGESEL ANALİZ RAPORU</div><h3 style={{ margin: "6px 0 0", color: "#153a65", fontSize: 23 }}>Karardan eyleme geçiş merkezi</h3></div>
                <span style={secureBadge}>{selectedInvestorProfile}</span>
              </div>
              <p style={{ margin: "8px 0 15px", color: "#607890", fontSize: 12, lineHeight: 1.65 }}>Seçili konumun güçlü yönleri, riskleri, yatırımcı profili ve doğrulama adımları aynı raporda gösterilir. İlçe veya il referansı kullanılıyorsa bu durum kesin mahalle verisi gibi sunulmaz.</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))", gap: 12 }}>
                <div style={{ padding: 15, borderRadius: 15, background: "#effbf5", border: "1px solid #cfeee0" }}><strong style={{ color: "#087b5e", fontSize: 13 }}>Güçlü yönler</strong><div style={{ display: "grid", gap: 8, marginTop: 10 }}>{selectedLocationStrengths.length ? selectedLocationStrengths.map((item) => <div key={item} style={{ color: "#345f52", fontSize: 11, lineHeight: 1.55 }}>✓ {item}</div>) : <span style={{ color: "#6f879b", fontSize: 11 }}>Veri yüklenince hesaplanacak.</span>}</div></div>
                <div style={{ padding: 15, borderRadius: 15, background: "#fff8ed", border: "1px solid #f4dfba" }}><strong style={{ color: "#9a6414", fontSize: 13 }}>Riskler ve sınırlar</strong><div style={{ display: "grid", gap: 8, marginTop: 10 }}>{selectedLocationRisks.length ? selectedLocationRisks.map((item) => <div key={item} style={{ color: "#72562d", fontSize: 11, lineHeight: 1.55 }}>! {item}</div>) : <span style={{ color: "#6f879b", fontSize: 11 }}>Veri yüklenince hesaplanacak.</span>}</div></div>
              </div>
              <div style={{ marginTop: 12, padding: 15, borderRadius: 15, background: "#f7faff", border: "1px solid #dce7f1" }}><strong style={{ color: "#153a65", fontSize: 13 }}>Önerilen işlem planı</strong><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 9, marginTop: 10 }}>{selectedLocationActionPlan.map((item,index) => <div key={item} style={{ display: "grid", gridTemplateColumns: "24px 1fr", gap: 8, alignItems: "start", color: "#4b647d", fontSize: 11, lineHeight: 1.55 }}><span style={{ width: 24, height: 24, borderRadius: 8, background: "#e7f3ff", color: "#0876c9", display: "grid", placeItems: "center", fontWeight: 950 }}>{index + 1}</span><span>{item}</span></div>)}</div></div>
              <div style={{ marginTop: 12 }}><strong style={{ color: "#153a65", fontSize: 13 }}>1 ve 3 yıllık senaryo bandı</strong><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 9, marginTop: 9 }}>{selectedLocationScenarios.length ? selectedLocationScenarios.map((scenario) => <div key={scenario.name} style={{ padding: 13, borderRadius: 14, background: "#fff", border: "1px solid #dce7f1" }}><span style={{ display: "block", color: "#74899e", fontSize: 9, fontWeight: 900 }}>{scenario.name} · yıllık %{scenario.rate}</span><strong style={{ display: "block", color: "#153a65", marginTop: 6 }}>{formatCurrency(String(scenario.oneYear))}/m²</strong><span style={{ display: "block", color: "#607890", fontSize: 10, marginTop: 4 }}>3 yıl: {formatCurrency(String(scenario.threeYear))}/m²</span></div>) : <div style={emptyState}>Kaynaklı fiyat ve değişim verisi gelince senaryolar hesaplanır.</div>}</div></div>
              <div style={{ marginTop: 11, color: "#7a8fa3", fontSize: 10, lineHeight: 1.55 }}>Senaryolar mevcut yıllık değişimin matematiksel devamıdır; kesin fiyat tahmini değildir. Resmî ekspertiz ve yatırım danışmanlığı yerine geçmez.</div>
            </article>

            <article style={{ marginTop: 14, padding: 18, borderRadius: 20, border: "1px solid #cfe2f3", background: "linear-gradient(145deg,#f5fbff,#ffffff)", boxShadow: "0 16px 36px rgba(31,75,116,.08)" }}>
              <div style={sectionHeader}>
                <div><div style={eyebrow}>AI YATIRIM ASİSTANI</div><h3 style={{ margin: "6px 0 0", color: "#153a65", fontSize: 23 }}>Bütçeden uygulanabilir yatırım planına</h3></div>
                <span style={assistantBudgetStatus === "BÜTÇE UYGUN" ? secureBadge : assistantBudgetStatus === "PAZARLIKLA UYGUN" ? { ...secureBadge, background: "#fff8e8", color: "#8a5a00", border: "1px solid #f1d28a" } : { ...secureBadge, background: "#fff1f1", color: "#a52a2a", border: "1px solid #f2b8b8" }}>{assistantBudgetStatus}</span>
              </div>
              <p style={{ margin: "8px 0 15px", color: "#607890", fontSize: 12, lineHeight: 1.65 }}>Bütçe, hedef büyüklük, peşinat oranı ve yatırım stratejisini seçin. Hesaplama seçili konumda kullanılan veri seviyesine dayanır; ilçe geneli referansı mahalle fiyatı sayılmaz.</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 11 }}>
                <label style={labelStyle}>Toplam bütçe (TL)<input value={assistantBudget} onChange={(event) => setAssistantBudget(event.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" style={inputStyle} /></label>
                <label style={labelStyle}>Hedef konut büyüklüğü (m²)<input value={assistantTargetM2} onChange={(event) => setAssistantTargetM2(event.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" style={inputStyle} /></label>
                <label style={labelStyle}>Peşinat oranı (%)<input value={assistantCashRatio} onChange={(event) => setAssistantCashRatio(event.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" style={inputStyle} /></label>
                <label style={labelStyle}>Yatırım stratejisi<select value={assistantStrategy} onChange={(event) => setAssistantStrategy(event.target.value as typeof assistantStrategy)} style={inputStyle}><option value="rent">Kira geliri</option><option value="balanced">Dengeli</option><option value="growth">Değer artışı</option></select></label>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginTop: 12 }}>
                {[
                  ["Tahmini taşınmaz bedeli", assistantEstimatedPropertyPrice ? formatCurrency(String(assistantEstimatedPropertyPrice)) : "—"],
                  ["Önerilen ilk teklif", assistantSuggestedOffer ? formatCurrency(String(assistantSuggestedOffer)) : "—"],
                  ["Bütçenin alabildiği alan", assistantAffordableM2 ? `${assistantAffordableM2} m²` : "—"],
                  ["Tahmini aylık brüt kira", assistantMonthlyRent ? formatCurrency(String(assistantMonthlyRent)) : "—"],
                  ["Finansman ihtiyacı", assistantFinancingNeed ? formatCurrency(String(Math.round(assistantFinancingNeed))) : "0 TL"],
                  ["Pazarlık hedefi", selectedLocationMarketRecord ? `%${assistantDiscountRate}` : "—"]
                ].map(([label,value]) => <div key={label} style={{ padding: 13, borderRadius: 14, background: "#fff", border: "1px solid #dce7f1" }}><span style={{ display: "block", color: "#74899e", fontSize: 9, fontWeight: 900 }}>{label}</span><strong style={{ display: "block", color: "#153a65", marginTop: 6, fontSize: 15 }}>{value}</strong></div>)}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 10, marginTop: 12 }}>
                <div style={{ padding: 14, borderRadius: 15, background: "#eef8ff", border: "1px solid #cfe6f7" }}><strong style={{ color: "#0876c9", fontSize: 12 }}>Asistan önerisi</strong><p style={{ margin: "7px 0 0", color: "#36556f", fontSize: 11, lineHeight: 1.65 }}>{assistantRecommendation}</p></div>
                <div style={{ padding: 14, borderRadius: 15, background: "#f2fbf6", border: "1px solid #d0eedf" }}><strong style={{ color: "#087b5e", fontSize: 12 }}>Strateji notu</strong><p style={{ margin: "7px 0 0", color: "#365f52", fontSize: 11, lineHeight: 1.65 }}>{assistantStrategyText}</p></div>
              </div>
              <div style={{ marginTop: 11, color: "#7a8fa3", fontSize: 10, lineHeight: 1.55 }}>Bu hesaplama otomatik ön değerlendirmedir. Kredi maliyeti, tapu masrafı, vergi, aidat ve ekspertiz farkı ayrıca hesaplanmalıdır.</div>
            </article>

            <article style={{ marginTop: 14, padding: 18, borderRadius: 20, border: "1px solid #d9e7f3", background: "linear-gradient(145deg,#ffffff,#f5fbff)", boxShadow: "0 14px 32px rgba(25,72,111,.08)" }}>
              <div style={sectionHeader}>
                <div><div style={eyebrow}>AI PAZARLIK ASİSTANI</div><h3 style={{ margin: "6px 0 0", color: "#153a65", fontSize: 23 }}>İlan fiyatından güvenli teklif sınırına</h3></div>
                <span style={negotiationVerdict === "FİYAT AVANTAJLI" ? secureBadge : negotiationVerdict === "PAZARLIKLA UYGUN" ? { ...secureBadge, background: "#fff8e8", color: "#8a5a00", border: "1px solid #f1d28a" } : { ...secureBadge, background: "#fff1f1", color: "#a52a2a", border: "1px solid #f2b8b8" }}>{negotiationVerdict}</span>
              </div>
              <p style={{ color: "#607890", fontSize: 11, lineHeight: 1.6, marginTop: 7 }}>İlan fiyatını bölgesel m² verisi, hedef büyüklük, taşınmaz durumu, satıcı aciliyeti, rekabet ve veri güveniyle karşılaştırır. Son karar ekspertiz ve hukuki kontrolden sonra verilmelidir.</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 10, marginTop: 12 }}>
                <label style={labelStyle}>İlan fiyatı (TL)<input value={negotiationListingPrice} onChange={(event) => setNegotiationListingPrice(event.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" style={inputStyle} /></label>
                <label style={labelStyle}>Taşınmaz durumu<select value={negotiationCondition} onChange={(event) => setNegotiationCondition(event.target.value as typeof negotiationCondition)} style={inputStyle}><option value="new">Yeni / çok iyi</option><option value="good">Oturuma hazır</option><option value="renovation">Tadilat gerekli</option></select></label>
                <label style={labelStyle}>Satıcı aciliyeti<select value={negotiationSellerUrgency} onChange={(event) => setNegotiationSellerUrgency(event.target.value as typeof negotiationSellerUrgency)} style={inputStyle}><option value="low">Düşük</option><option value="medium">Orta</option><option value="high">Yüksek</option></select></label>
                <label style={labelStyle}>Alıcı rekabeti<select value={negotiationCompetition} onChange={(event) => setNegotiationCompetition(event.target.value as typeof negotiationCompetition)} style={inputStyle}><option value="low">Düşük</option><option value="medium">Orta</option><option value="high">Yüksek</option></select></label>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))", gap: 9, marginTop: 12 }}>
                {[
                  ["Bölgesel adil değer", negotiationFairValue ? formatCurrency(String(negotiationFairValue)) : "—"],
                  ["Açılış teklifi", negotiationOpeningOffer ? formatCurrency(String(negotiationOpeningOffer)) : "—"],
                  ["Hedef anlaşma", negotiationTargetPrice ? formatCurrency(String(negotiationTargetPrice)) : "—"],
                  ["Vazgeçme sınırı", negotiationWalkAwayPrice ? formatCurrency(String(negotiationWalkAwayPrice)) : "—"],
                  ["Potansiyel tasarruf", negotiationPotentialSaving ? formatCurrency(String(negotiationPotentialSaving)) : "—"],
                  ["İlan / değer farkı", negotiationFairValue ? `%${negotiationGapPercent}` : "—"]
                ].map(([label,value]) => <div key={label} style={{ padding: 13, borderRadius: 14, background: "#fff", border: "1px solid #dce7f1" }}><span style={{ display: "block", color: "#7890a5", fontSize: 9, fontWeight: 900 }}>{label}</span><strong style={{ display: "block", color: "#153a65", marginTop: 6, fontSize: 15 }}>{value}</strong></div>)}
              </div>
              <div style={{ marginTop: 12, padding: 14, borderRadius: 15, background: "linear-gradient(135deg,#eef8ff,#f2fbf6)", border: "1px solid #cfe4ed" }}>
                <strong style={{ color: "#0876c9", fontSize: 12 }}>Önerilen pazarlık cümlesi</strong>
                <p style={{ margin: "7px 0 0", color: "#36556f", fontSize: 11, lineHeight: 1.7 }}>{negotiationScript}</p>
              </div>
              <div style={{ marginTop: 10, color: "#7a8fa3", fontSize: 10, lineHeight: 1.55 }}>İlçe veya il geneli veri kullanılıyorsa güvenlik payı otomatik artırılır. Sistem satıcının gerçek motivasyonunu bilmez; belirtilen aciliyet kullanıcı beyanıdır.</div>
            </article>

            <article style={{ marginTop: 14, padding: 18, borderRadius: 20, border: "1px solid #d9e7f3", background: "linear-gradient(145deg,#ffffff,#f4f9ff)", boxShadow: "0 14px 32px rgba(25,72,111,.08)" }}>
              <div style={sectionHeader}>
                <div><div style={eyebrow}>AI BANKA VE FİNANS MERKEZİ</div><h3 style={{ margin: "6px 0 0", color: "#153a65", fontSize: 23 }}>Kredi yükünden banka ön değerlendirmesine</h3></div>
                <span style={financeSuitability === "ÖN DEĞERLENDİRME UYGUN" ? secureBadge : financeSuitability === "EK İNCELEME GEREKLİ" ? { ...secureBadge, background: "#fff8e8", color: "#8a5a00", border: "1px solid #f1d28a" } : { ...secureBadge, background: "#fff1f1", color: "#a52a2a", border: "1px solid #f2b8b8" }}>{financeSuitability}</span>
              </div>
              <p style={{ color: "#607890", fontSize: 11, lineHeight: 1.65, marginTop: 7 }}>Bölgesel referans değer, peşinat, gelir, diğer borçlar, vade ve kullanıcı tarafından girilen aylık oranla finansman senaryosu oluşturur. Bu ekran banka onayı, bağlayıcı kredi teklifi veya resmî ekspertiz değildir.</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginTop: 12 }}>
                <label style={labelStyle}>Aylık belgelenebilir gelir (TL)<input value={financeMonthlyIncome} onChange={(event) => setFinanceMonthlyIncome(event.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" style={inputStyle} /></label>
                <label style={labelStyle}>Diğer aylık borçlar (TL)<input value={financeOtherDebt} onChange={(event) => setFinanceOtherDebt(event.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" style={inputStyle} /></label>
                <label style={labelStyle}>Peşinat (TL)<input value={financeDownPayment} onChange={(event) => setFinanceDownPayment(event.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" style={inputStyle} /></label>
                <label style={labelStyle}>Vade<select value={financeTerm} onChange={(event) => setFinanceTerm(event.target.value as typeof financeTerm)} style={inputStyle}><option value="120">120 ay</option><option value="180">180 ay</option><option value="240">240 ay</option></select></label>
                <label style={labelStyle}>Aylık oran (%)<input value={financeMonthlyRate} onChange={(event) => setFinanceMonthlyRate(event.target.value.replace(/[^0-9.,]/g, ""))} inputMode="decimal" style={inputStyle} /></label>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))", gap: 9, marginTop: 12 }}>
                {[
                  ["Bölgesel referans değer", financeReferenceValue ? formatCurrency(String(Math.round(financeReferenceValue))) : "—"],
                  ["Kredi ihtiyacı", financeLoanNeed ? formatCurrency(String(Math.round(financeLoanNeed))) : "0 TL"],
                  ["Tahmini aylık taksit", financeMonthlyPayment ? formatCurrency(String(financeMonthlyPayment)) : "0 TL"],
                  ["Gelir / borç oranı", financeMonthlyIncomeValue ? `%${financeIncomeRatio}` : "—"],
                  ["Kredi / değer oranı", financeReferenceValue ? `%${financeLoanToValue}` : "—"],
                  ["Teminat veri güveni", selectedLocationMarketRecord ? `%${financeCollateralConfidence}` : "—"],
                  ["Toplam geri ödeme", financeTotalRepayment ? formatCurrency(String(financeTotalRepayment)) : "0 TL"],
                  ["Tahmini finansman maliyeti", financeTotalCost ? formatCurrency(String(financeTotalCost)) : "0 TL"]
                ].map(([label,value]) => <div key={label} style={{ padding: 13, borderRadius: 14, background: "#fff", border: "1px solid #dce7f1" }}><span style={{ display: "block", color: "#7890a5", fontSize: 9, fontWeight: 900 }}>{label}</span><strong style={{ display: "block", color: "#153a65", marginTop: 6, fontSize: 15 }}>{value}</strong></div>)}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 10, marginTop: 12 }}>
                <div style={{ padding: 14, borderRadius: 15, background: "#eef8ff", border: "1px solid #cfe6f7" }}><strong style={{ color: "#0876c9", fontSize: 12 }}>Banka ön değerlendirme notu</strong><p style={{ margin: "7px 0 0", color: "#36556f", fontSize: 11, lineHeight: 1.7 }}>{financeRecommendation}</p></div>
                <div style={{ padding: 14, borderRadius: 15, background: financeRiskScore <= 35 ? "#f2fbf6" : financeRiskScore <= 60 ? "#fff8e8" : "#fff1f1", border: financeRiskScore <= 35 ? "1px solid #d0eedf" : financeRiskScore <= 60 ? "1px solid #f1d28a" : "1px solid #f2b8b8" }}><strong style={{ color: financeRiskScore <= 35 ? "#087b5e" : financeRiskScore <= 60 ? "#8a5a00" : "#a52a2a", fontSize: 12 }}>Finansal risk puanı: {financeRiskScore}/100</strong><p style={{ margin: "7px 0 0", color: "#52697d", fontSize: 11, lineHeight: 1.7 }}>Puan; gelir yükü, kredi/değer oranı, bölgesel veri güveni ve konum riskini birlikte değerlendirir. Düşük puan daha dayanıklı senaryoyu ifade eder.</p></div>
              </div>
              <div style={{ marginTop: 10, color: "#7a8fa3", fontSize: 10, lineHeight: 1.55 }}>Faiz/oran alanı kullanıcı girdisidir ve güncel banka teklifi sayılmaz. Tahsis ücreti, sigorta, ekspertiz, vergi, tapu masrafı ve banka özel koşulları bu hesaplamaya dahil değildir.</div>
            </article>
          </article>

          <article style={{ ...qualityRuleStyle, padding: 18, marginBottom: 16 }}>
            <div style={sectionHeader}>
              <div>
                <div style={eyebrow}>TÜRKİYE GAYRİMENKUL ZEKÂ MOTORU</div>
                <h3 style={{ margin: "6px 0 0", color: "#153a65", fontSize: 24 }}>Bölgesel piyasa karşılaştırma merkezi</h3>
              </div>
              <span style={secureBadge}>Supabase market_data</span>
            </div>
            <p style={{ color: "#607890", lineHeight: 1.55, marginTop: 4 }}>
              Bu ekran Türkiye Veri Motoru&apos;na kaydedilen il, ilçe ve mahalle kayıtlarını canlı olarak kullanır.
              Fiyat, kira, yıllık değişim, likidite ve veri güvenini tek tabloda karşılaştırır. Veri bulunmayan bölgeler için tahmin üretmez.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12 }}>
              <label style={labelStyle}>İl
                <select value={marketCity} onChange={(event) => setMarketCity(event.target.value)} style={inputStyle}>
                  <option value="Tümü">Tüm iller</option>
                  {marketCities.map((city) => <option key={city} value={city}>{city}</option>)}
                </select>
              </label>
              <label style={labelStyle}>Taşınmaz türü
                <select value={marketPropertyType} onChange={(event) => setMarketPropertyType(event.target.value)} style={inputStyle}>
                  <option value="Tümü">Tüm türler</option>
                  {marketPropertyTypes.map((propertyType) => <option key={propertyType} value={propertyType}>{propertyType}</option>)}
                </select>
              </label>
              <label style={labelStyle}>Sıralama
                <select value={marketSort} onChange={(event) => setMarketSort(event.target.value as typeof marketSort)} style={inputStyle}>
                  <option value="confidence">Veri güveni</option>
                  <option value="price">Satış m² fiyatı</option>
                  <option value="change">Yıllık değişim</option>
                  <option value="liquidity">Likidite</option>
                </select>
              </label>
            </div>
          </article>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 10, marginBottom: 16 }}>
            <article style={{ ...qualityRuleStyle, padding: 17 }}>
              <div style={eyebrow}>YATIRIM PUANI</div>
              <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 12, marginTop: 8 }}><strong style={{ color: "#153a65", fontSize: 34 }}>{marketRecords.length ? marketInvestmentScore : "—"}</strong><span style={{ color: "#74899e", fontSize: 11 }}>/100</span></div>
              <div style={{ height: 7, borderRadius: 99, background: "#e7eef5", overflow: "hidden", marginTop: 10 }}><div style={{ width: `${Math.max(0, Math.min(100, marketInvestmentScore))}%`, height: "100%", background: "linear-gradient(90deg,#0876c9,#22c55e)" }} /></div>
              <span style={{ display: "block", marginTop: 8, color: "#74899e", fontSize: 10 }}>Fiyat değişimi, likidite, altyapı, ulaşım ve veri güveni bileşkesi</span>
            </article>
            <article style={{ ...qualityRuleStyle, padding: 17 }}>
              <div style={eyebrow}>KİRA GETİRİSİ</div><strong style={{ display: "block", color: "#087b5e", fontSize: 30, marginTop: 8 }}>{marketRecords.length ? `%${marketAnnualRentYield}` : "—"}</strong><span style={{ color: "#74899e", fontSize: 10 }}>Yıllık brüt kira getirisi göstergesi</span>
            </article>
            <article style={{ ...qualityRuleStyle, padding: 17 }}>
              <div style={eyebrow}>GELECEK PROJEKSİYONU</div>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>{(["1","3","5"] as const).map((year) => <button key={year} type="button" onClick={() => setProjectionHorizon(year)} style={{ padding: "7px 10px", borderRadius: 10, border: projectionHorizon === year ? "1px solid #0876c9" : "1px solid #dce7f1", background: projectionHorizon === year ? "#eaf6ff" : "#fff", color: projectionHorizon === year ? "#0876c9" : "#607890", fontSize: 10, fontWeight: 900, cursor: "pointer" }}>{year} yıl</button>)}</div>
              <strong style={{ display: "block", color: "#153a65", fontSize: 22, marginTop: 10 }}>{projectedMarketM2 ? formatCurrency(String(projectedMarketM2)) : "—"}</strong><span style={{ color: "#74899e", fontSize: 10 }}>Mevcut yıllık değişimin matematiksel devam senaryosu; kesin tahmin değildir</span>
            </article>
          </div>

          <article style={{ ...qualityRuleStyle, padding: 18, marginBottom: 16, background: "linear-gradient(145deg,#f8fcff,#fff)" }}>
            <div style={sectionHeader}><div><div style={eyebrow}>AI BÖLGE YORUMU</div><h3 style={{ margin: "6px 0 0", color: "#153a65" }}>Rakamların karar diline çevrilmesi</h3></div><span style={secureBadge}>Açıklanabilir</span></div>
            <p style={{ margin: "12px 0 0", color: "#3e5872", lineHeight: 1.7, fontSize: 13 }}>{marketAiComment}</p>
          </article>

          <article style={{ ...qualityRuleStyle, padding: 18, marginBottom: 16 }}>
            <div style={sectionHeader}><div><div style={eyebrow}>BÖLGE KARŞILAŞTIRMA</div><h3 style={{ margin: "6px 0 0", color: "#153a65" }}>İki ili aynı karar tablosunda karşılaştırın</h3></div>{comparisonWinner ? <span style={secureBadge}>Öne çıkan: {comparisonWinner.city}</span> : null}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 10, marginTop: 12 }}>
              <label style={labelStyle}>Birinci il<select value={compareCityA} onChange={(event) => setCompareCityA(event.target.value)} style={inputStyle}>{marketCities.map((city) => <option key={city} value={city}>{city}</option>)}</select></label>
              <label style={labelStyle}>İkinci il<select value={compareCityB} onChange={(event) => setCompareCityB(event.target.value)} style={inputStyle}>{marketCities.map((city) => <option key={city} value={city}>{city}</option>)}</select></label>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 12, marginTop: 14 }}>
              {[compareA, compareB].map((summary, index) => summary ? <article key={`${summary.city}-${index}`} style={{ padding: 16, borderRadius: 17, border: comparisonWinner?.city === summary.city ? "1px solid #79c9a8" : "1px solid #dce7f1", background: comparisonWinner?.city === summary.city ? "linear-gradient(145deg,#f0fff8,#fff)" : "#fff" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}><strong style={{ color: "#153a65", fontSize: 17 }}>{summary.city}</strong><span style={{ padding: "5px 8px", borderRadius: 999, background: "#eaf6ff", color: "#0876c9", fontSize: 10, fontWeight: 900 }}>{summary.score}/100</span></div><div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8, marginTop: 12 }}><MiniMeta label="Satış m²" value={formatCurrency(String(summary.averageM2))} /><MiniMeta label="Kira m²" value={formatCurrency(String(summary.rentM2))} /><MiniMeta label="Yıllık değişim" value={`%${summary.annualChange}`} /><MiniMeta label="Kira getirisi" value={`%${summary.yieldRate}`} /><MiniMeta label="Likidite" value={`${summary.liquidity}/100`} /><MiniMeta label="Veri güveni" value={`${summary.confidence}/100`} /></div></article> : <div key={index} style={emptyState}>Bu il için karşılaştırılabilir veri bulunamadı.</div>)}
            </div>
          </article>

          {marketRecords.length ? (
            <div style={{ display: "grid", gap: 12 }}>
              {marketRecords.slice(0, 30).map((item, index) => {
                const rentMultiplier = item.rentM2 > 0 ? Math.round(item.averageM2 / item.rentM2) : null;
                const investmentIndex = Math.round(
                  Math.max(0, Math.min(100,
                    item.dataConfidence * 0.30 +
                    item.liquidityScore * 0.25 +
                    item.infrastructureScore * 0.15 +
                    item.transportScore * 0.15 +
                    Math.max(0, Math.min(100, 50 + item.annualChange)) * 0.15
                  ))
                );
                return (
                  <article key={item.id} style={{ padding: 16, border: "1px solid #dbe7f3", borderRadius: 16, background: "#fff" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "48px minmax(0,1fr) auto", gap: 12, alignItems: "center" }}>
                      <strong style={{ color: "#0876c9", fontSize: 20 }}>#{index + 1}</strong>
                      <div>
                        <strong style={{ color: "#153a65", fontSize: 17 }}>{item.city} / {item.district} / {item.neighborhood}</strong>
                        <div style={{ color: "#607890", fontSize: 12, marginTop: 4 }}>{item.propertyType} · Kaynak: {item.source || "Belirtilmedi"} · Örneklem: {item.sampleSize || "—"}</div>
                      </div>
                      <span style={onlineBadge}>Yatırım Endeksi {investmentIndex}/100</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(135px,1fr))", gap: 10, marginTop: 14 }}>
                      <MiniMeta label="Satış m²" value={formatCurrency(String(item.averageM2))} />
                      <MiniMeta label="Kira m²" value={item.rentM2 ? formatCurrency(String(item.rentM2)) : "—"} />
                      <MiniMeta label="Yıllık değişim" value={`%${item.annualChange}`} />
                      <MiniMeta label="Likidite" value={`${item.liquidityScore}/100`} />
                      <MiniMeta label="Veri güveni" value={`${item.dataConfidence}/100`} />
                      <MiniMeta label="Kira çarpanı" value={rentMultiplier ? `${rentMultiplier} ay` : "—"} />
                    </div>
                    <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "#f8fbff", color: "#45627f", fontSize: 13, lineHeight: 1.5 }}>
                      {item.sourceNote || "Kaynak notu girilmemiş."} Güncelleme: {item.updatedAt || item.periodDate || "Belirtilmedi"}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div style={emptyState}>
              Seçilen filtrelerde doğrulanabilir piyasa kaydı bulunamadı. Önce “Türkiye Veri Motoru” sekmesinden gerçek kaynaklı kayıt ekleyin.
            </div>
          )}

          <article style={{ ...qualityRuleStyle, padding: 18, marginTop: 16 }}>
            <div style={eyebrow}>PİYASA ÖZETİ</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginTop: 12 }}>
              <MiniMeta label="Ortalama likidite" value={marketRecords.length ? `${marketAverageLiquidity}/100` : "—"} />
              <MiniMeta label="En yüksek güven" value={marketRecords.length ? `${Math.max(...marketRecords.map((item) => item.dataConfidence))}/100` : "—"} />
              <MiniMeta label="En yüksek değişim" value={marketRecords.length ? `%${Math.max(...marketRecords.map((item) => item.annualChange))}` : "—"} />
              <MiniMeta label="Kapsanan il" value={String(new Set(marketRecords.map((item) => item.city)).size)} />
            </div>
            <p style={{ color: "#7b8fa5", fontSize: 12, lineHeight: 1.55, marginBottom: 0 }}>
              Sistem yalnızca veri tabanında bulunan kayıtları karşılaştırır. Bu göstergeler resmî ekspertiz yerine geçmez; veri kaynağı, tarih ve örneklem büyüklüğü kontrol edilmelidir.
            </p>
          </article>
        </>
      ) : null}

      {section === "admin" ? (
        <>
          <article style={{ position: "relative", overflow: "hidden", padding: "clamp(24px,4vw,40px)", borderRadius: 28, marginBottom: 16, color: "#fff", background: "radial-gradient(circle at 86% 8%,rgba(72,196,255,.26),transparent 32%),linear-gradient(135deg,#061727,#0a3457 58%,#0876c9)", boxShadow: "0 26px 64px rgba(7,31,57,.25)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ maxWidth: 760 }}><div style={{ fontSize: 11, fontWeight: 950, letterSpacing: 1.5, color: "#9fd9ff" }}>YÖNETİM VE OPERASYON</div><h3 style={{ margin: "8px 0 9px", fontSize: "clamp(30px,4.5vw,46px)", lineHeight: 1.04 }}>Platformun tamamını tek ekrandan yönetin.</h3><p style={{ margin: 0, color: "rgba(255,255,255,.78)", lineHeight: 1.65 }}>Kullanıcı, üyelik, analiz, veri kalitesi, kurumsal erişim ve sistem hareketlerini tek yönetici görünümünde izleyin.</p></div>
              <div style={{ padding: 16, minWidth: 230, borderRadius: 18, background: "rgba(255,255,255,.09)", border: "1px solid rgba(255,255,255,.18)" }}><div style={{ fontSize: 10, color: "#b9d9f4", fontWeight: 900 }}>SİSTEM DURUMU</div><strong style={{ display: "block", fontSize: 28, marginTop: 6 }}>GÜÇLÜ</strong><span style={{ color: "rgba(255,255,255,.7)", fontSize: 11 }}>Canlı proje verileriyle hesaplandı</span></div>
            </div>
          </article>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 16 }}>
            {[
              ["Aktif kullanıcı", "1", "Oturum açık"],
              ["Aktif üyelik", membershipPlan === "standard" ? "Standart" : membershipPlan === "premium" ? "Premium" : "Gold Elite", "Plan durumu"],
              ["Toplam analiz", String(records.length), "Bulut raporu"],
              ["Bölgesel veri", String(regionalData.length), "Piyasa kaydı"],
              ["Favori rapor", String(records.filter((item) => item.is_favorite).length), "Kullanıcı seçimi"],
              ["Veri kalitesi", `%${dataQualityRate}`, "Tamlık oranı"],
            ].map(([label,value,caption],index) => <article key={label} style={{ padding: 15, borderRadius: 17, border: "1px solid #dce7f1", background: index === 1 ? "linear-gradient(145deg,#fff9e8,#fff)" : "linear-gradient(145deg,#fff,#f8fbfe)", boxShadow: "0 9px 24px rgba(31,64,97,.06)" }}><span style={{ color: "#7b8fa5", fontSize: 10, fontWeight: 900 }}>{label}</span><strong style={{ display: "block", color: index === 1 ? "#9a6715" : "#153a65", fontSize: 23, marginTop: 6 }}>{value}</strong><span style={{ display: "block", color: "#91a2b2", fontSize: 9, marginTop: 3 }}>{caption}</span></article>)}
          </div>

          <article style={{ ...qualityRuleStyle, padding: 18, marginBottom: 16 }}>
            <div style={sectionHeader}><div><div style={eyebrow}>YÖNETİCİ HIZLI İŞLEMLERİ</div><h3 style={{ color: "#153a65", margin: "6px 0 0" }}>Günlük operasyon</h3></div><span style={secureBadge}>Yetkili görünüm</span></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginTop: 12 }}>
              {[
                ["👥", "Kullanıcıları incele", "Hesap, rol ve erişim durumları"],
                ["♛", "Üyelikleri yönet", "Standart, Premium ve Gold planları"],
                ["🇹🇷", "Veri kayıtlarını denetle", "Kaynak, tarih ve güven kontrolü"],
                ["📄", "Rapor hareketleri", "Üretilen ve güncellenen raporlar"],
                ["⚠️", "Hata ve uyarılar", "Eksik veri ve operasyon sinyalleri"],
                ["🏢", "Kurumsal erişimler", "Banka, ofis ve ekip yetkileri"],
              ].map(([icon,title,text]) => <button type="button" key={title} onClick={() => title.includes("Üyelik") ? setSection("membership") : title.includes("Veri") ? setSection("market") : setEnterpriseNotice(`${title} çalışma alanı seçildi.`)} style={{ padding: 15, borderRadius: 16, border: "1px solid #dce7f1", background: "#fff", textAlign: "left", cursor: "pointer" }}><span style={{ fontSize: 21 }}>{icon}</span><strong style={{ display: "block", marginTop: 7, color: "#153a65", fontSize: 12 }}>{title}</strong><span style={{ display: "block", marginTop: 4, color: "#74899e", fontSize: 10, lineHeight: 1.4 }}>{text}</span></button>)}
            </div>
          </article>
          <div style={statsGrid}>
            <Stat title="Toplam Rapor" value={records.length} text={`${active.length} aktif · ${archivedCount} arşiv`} />
            <Stat title="Veri Kalitesi" value={dataQualityRate || "—"} suffix={records.length ? "%" : ""} text={`${completeReportCount} tam · ${incompleteReportCount} eksik`} />
            <Stat title="Bölgesel Kapsama" value={regionalCoverageRate || "—"} suffix={regionalData.length ? "%" : ""} text={`${sourcedRegionalCount}/${regionalData.length} kaynaklı kayıt`} />
            <Stat title="Sistem Sağlığı" value={systemHealthScore} suffix="/100" text={systemHealthLabel} />
          </div>

          <div style={twoColumnGrid}>
            <article style={{ ...qualityRuleStyle, padding: 18 }}>
              <div style={sectionHeader}>
                <div>
                  <div style={eyebrow}>CANLI YÖNETİM PANELİ</div>
                  <h3 style={{ margin: "6px 0 0", color: "#153a65" }}>Karar ve kullanım görünümü</h3>
                </div>
                <span style={secureBadge}>Canlı proje verisi</span>
              </div>
              {Object.keys(decisions).length ? (
                Object.entries(decisions).map(([name, count]) => (
                  <DecisionBar key={name} label={name} value={count} total={active.length || 1} />
                ))
              ) : (
                <div style={emptyState}>Henüz karar raporu yok.</div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10, marginTop: 14 }}>
                <MiniMeta label="Favori rapor" value={String(favoriteCount)} />
                <MiniMeta label="Arşiv rapor" value={String(archivedCount)} />
                <MiniMeta label="Aktif rapor" value={String(active.length)} />
                <MiniMeta label="Piyasa kaydı" value={String(regionalData.filter((item) => item.averageM2 > 0).length)} />
              </div>
            </article>

            <article style={{ ...qualityRuleStyle, padding: 18 }}>
              <div style={eyebrow}>SİSTEM SAĞLIK MONİTÖRÜ</div>
              <div style={{ ...comparisonHeroResult, ...decisionTone(systemHealthScore >= 70 ? "AL" : systemHealthScore >= 45 ? "BEKLE" : "UZAK DUR"), marginTop: 10 }}>
                <div>
                  <small>GENEL DURUM</small>
                  <strong style={{ display: "block", fontSize: 24, marginTop: 4 }}>{systemHealthLabel}</strong>
                </div>
                <div style={confidenceCard}>
                  <small>SAĞLIK PUANI</small>
                  <strong style={{ fontSize: 24 }}>{systemHealthScore}/100</strong>
                </div>
              </div>
              {[
                ["Bulut rapor sistemi", records.length > 0, `${records.length} kayıt`],
                ["Türkiye veri motoru", regionalData.length > 0, `${regionalData.length} kayıt`],
                ["Rapor veri kalitesi", dataQualityRate >= 70, `%${dataQualityRate}`],
                ["Kaynak doğrulama", regionalCoverageRate >= 70, `%${regionalCoverageRate}`],
              ].map(([label, ok, detail]) => (
                <div key={String(label)} style={{ display: "grid", gridTemplateColumns: "24px minmax(0,1fr) auto", gap: 8, alignItems: "center", padding: "10px 0", borderBottom: "1px solid #e5edf5" }}>
                  <span>{ok ? "✓" : "!"}</span>
                  <span style={{ color: "#29435f" }}>{String(label)}</span>
                  <strong style={{ color: ok ? "#047857" : "#b45309", fontSize: 12 }}>{String(detail)}</strong>
                </div>
              ))}
              <small style={{ color: "#7b8fa5", lineHeight: 1.5, display: "block", marginTop: 10 }}>
                Bu puan mevcut Supabase kayıtlarının varlığı, rapor tamlığı ve kaynak bilgisi üzerinden hesaplanan operasyon göstergesidir; sunucu erişilebilirlik testi değildir.
              </small>
            </article>
          </div>

          <div style={twoColumnGrid}>
            <article style={{ ...qualityRuleStyle, padding: 18 }}>
              <div style={eyebrow}>VERİ KALİTESİ RADARI</div>
              {[
                ["Tam raporlar", completeReportCount, records.length],
                ["Eksik raporlar", incompleteReportCount, records.length],
                ["Kaynaklı bölgesel kayıt", sourcedRegionalCount, regionalData.length],
                ["Güvenli bölgesel kayıt", trustedRegional.length, regionalData.length],
              ].map(([label, value, total]) => (
                <DecisionBar key={String(label)} label={String(label)} value={Number(value)} total={Math.max(1, Number(total))} />
              ))}
              {incompleteReportCount > 0 ? (
                <div style={{ ...alertStyle, marginTop: 12 }}>
                  {incompleteReportCount} raporda konum, taşınmaz bilgisi, karar veya yeterli rapor metni eksik. Veri Doğrulama sekmesinden kontrol edin.
                </div>
              ) : (
                <div style={{ ...locationInfoBox, marginTop: 12 }}>Tüm raporlar temel kalite kontrolünü geçti.</div>
              )}
            </article>

            <article style={{ ...qualityRuleStyle, padding: 18 }}>
              <div style={eyebrow}>SON RAPOR HAREKETLERİ</div>
              {recentRecords.length ? (
                <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                  {recentRecords.map((item) => (
                    <div key={item.id} style={{ padding: 12, border: "1px solid #dbe7f3", borderRadius: 13, background: "#fff" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                        <strong style={{ color: "#153a65" }}>{locationText(item)}</strong>
                        <span style={onlineBadge}>{item.decision || "DEĞERLENDİR"}</span>
                      </div>
                      <div style={{ color: "#607890", fontSize: 12, marginTop: 6 }}>
                        {item.property_type || "Taşınmaz"} · {formatCurrency(item.asking_price)} · {new Date(item.updated_at || item.created_at).toLocaleDateString("tr-TR")}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={emptyState}>Henüz rapor hareketi bulunmuyor.</div>
              )}
            </article>
          </div>

          <article style={{ ...qualityRuleStyle, padding: 18 }}>
            <div style={eyebrow}>YÖNETİM YOL HARİTASI</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10, marginTop: 10 }}>
              {[
                ["Kullanıcı ve rol yetkileri", "üyelik altyapısıyla bağlanacak"],
                ["Abonelik durumları", "Ödeme sağlayıcısı sonrası canlılaşacak"],
                ["Veri kaynak onayı", "kayıt güveniyle izleniyor"],
                ["Rapor denetim izi", "Supabase işlem geçmişi planlı"],
                ["Kurumsal müşteri erişimi", "Rol ve yetki matrisiyle bağlanacak"],
              ].map(([title, text]) => (
                <div key={title} style={{ padding: 13, border: "1px solid #dbe7f3", borderRadius: 14, background: "#fff" }}>
                  <strong style={{ color: "#153a65" }}>{title}</strong>
                  <div style={{ color: "#607890", fontSize: 12, marginTop: 5, lineHeight: 1.45 }}>{text}</div>
                </div>
              ))}
            </div>
          </article>
        </>
      ) : null}

      {section === "membership" ? (
        <>
          <article className="membership-hero-final" style={{ position: "relative", overflow: "hidden", padding: "clamp(30px,4.8vw,54px)", borderRadius: 32, marginBottom: 16, color: "#fff", background: "radial-gradient(circle at 12% 18%,rgba(43,151,255,.38),transparent 36%),radial-gradient(circle at 88% 12%,rgba(255,204,91,.24),transparent 30%),linear-gradient(135deg,#03121f 0%,#073b66 52%,#0785df 100%)", boxShadow: "0 34px 82px rgba(5,31,55,.32)", border: "1px solid rgba(255,255,255,.14)" }}>
            <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px)", backgroundSize: "34px 34px", maskImage: "linear-gradient(to bottom,black,transparent 88%)" }} />
            <div style={{ position: "absolute", width: 360, height: 360, borderRadius: "50%", right: -120, top: -190, border: "1px solid rgba(255,255,255,.16)", boxShadow: "0 0 90px rgba(58,171,255,.18)" }} />
            <div style={{ position: "relative", display: "grid", gridTemplateColumns: "minmax(0,1.35fr) minmax(270px,.65fr)", gap: 24, alignItems: "end" }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 950, letterSpacing: 1.9, color: "#8fd2ff" }}>PREMIUM ÜYELİK DENEYİMİ</div>
                <h3 style={{ margin: "10px 0 12px", fontSize: "clamp(31px,5vw,52px)", lineHeight: 1.02, letterSpacing: "-1.5px", maxWidth: 790 }}>Gayrimenkul karar gücünüzü bir üst lige taşıyın.</h3>
                <p style={{ margin: 0, color: "rgba(255,255,255,.8)", lineHeight: 1.7, fontSize: 15, maxWidth: 760 }}>Standart ile keşfedin, Premium ile profesyonelleşin, Gold Elite ile ekibinizi ve kurumsal operasyonunuzu tek merkezden yönetin.</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 18 }}>
                  {["Açıklanabilir AI", "Profesyonel PDF", "Türkiye Veri Motoru", "Plan kontrolü sizde"].map((item) => <span key={item} style={{ padding: "8px 12px", borderRadius: 999, background: "rgba(255,255,255,.09)", border: "1px solid rgba(255,255,255,.16)", fontSize: 12, fontWeight: 850, backdropFilter: "blur(10px)" }}>{item}</span>)}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 20 }}>
                  <button type="button" onClick={() => document.getElementById("premium-plan-card")?.scrollIntoView({ behavior: "smooth", block: "center" })} style={{ ...blueButton, background: "#ffffff", color: "#07558f", boxShadow: "0 14px 34px rgba(0,0,0,.18)" }}>Premium’u Keşfet</button>
                  <button type="button" onClick={() => document.getElementById("gold-plan-card")?.scrollIntoView({ behavior: "smooth", block: "center" })} style={{ ...blueButton, background: "linear-gradient(135deg,#f6d77c,#c89b2d)", color: "#241a05", border: "1px solid rgba(255,231,158,.8)", boxShadow: "0 14px 34px rgba(98,68,4,.28)" }}>♛ Gold Elite’i İncele</button>
                </div>
              </div>
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ padding: 16, borderRadius: 20, background: "rgba(3,20,35,.36)", border: "1px solid rgba(255,255,255,.14)", backdropFilter: "blur(16px)" }}>
                  <div style={{ fontSize: 11, fontWeight: 950, letterSpacing: 1.3, color: "#9fd9ff" }}>CANLI GÜVEN MERKEZİ</div>
                  {[["Sistem durumu","Aktif"],["AI karar motoru","Hazır"],["Türkiye veri motoru","Güncel"],["PDF servisi","Hazır"],["Güvenlik altyapısı","Hazır"]].map(([a,b]) => <div key={a} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: "1px solid rgba(255,255,255,.1)", fontSize: 12 }}><span style={{ color: "rgba(255,255,255,.68)" }}>{a}</span><strong style={{ color: "#8ff0bf" }}>● {b}</strong></div>)}
                </div>
                <div style={{ padding: 5, display: "flex", gap: 5, borderRadius: 15, background: "rgba(255,255,255,.10)", border: "1px solid rgba(255,255,255,.16)", backdropFilter: "blur(12px)" }}>
                  <button type="button" onClick={() => setBillingCycle("monthly")} style={{ ...smallButton, flex: 1, background: billingCycle === "monthly" ? "#fff" : "transparent", color: billingCycle === "monthly" ? "#0a3a65" : "#fff" }}>Aylık</button>
                  <button type="button" onClick={() => setBillingCycle("yearly")} style={{ ...smallButton, flex: 1.25, background: billingCycle === "yearly" ? "#fff" : "transparent", color: billingCycle === "yearly" ? "#0a3a65" : "#fff" }}>Yıllık · 2 ay avantaj</button>
                </div>
              </div>
            </div>
          </article>

          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 9, margin: "-4px 0 16px" }}>
            {["✦ Açıklanabilir AI", "▣ Profesyonel PDF", "🇹🇷 Türkiye Veri Motoru", "🔒 Güvenli abonelik altyapısı", "◈ Kurumsal kullanıma hazır"].map((item) => <span key={item} className="membership-proof-chip" style={{ padding: "9px 13px", borderRadius: 999, background: "linear-gradient(145deg,#ffffff,#f4f9fd)", border: "1px solid #dbe7f3", boxShadow: "0 8px 20px rgba(31,64,97,.06)", color: "#34536f", fontSize: 11, fontWeight: 900 }}>{item}</span>)}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 10, marginBottom: 16 }}>
            {[["📊 Kayıtlı analiz", String(active.length), "Canlı proje verisi"],["📄 PDF raporu", String(records.length), "Rapor merkezine hazır"],["🇹🇷 Bölgesel veri", String(regionalData.length), "Türkiye Veri Motoru"],["✦ Aktif plan", membershipPlan === "standard" ? "Standart" : membershipPlan === "premium" ? "Premium" : "Gold Elite", "Üyelik durumu"]].map(([label,value,caption],i) => <article key={label} className="membership-stat-card" style={{ position: "relative", overflow: "hidden", padding: 17, borderRadius: 19, border: i === 3 ? "1px solid #ead49c" : "1px solid #dbe7f3", background: i === 3 ? "linear-gradient(135deg,#fff7dc,#fffdf7)" : "linear-gradient(145deg,#ffffff,#f5faff)", boxShadow: "0 10px 26px rgba(31,64,97,.07)" }}><div style={{ position: "absolute", width: 82, height: 82, borderRadius: "50%", right: -28, top: -32, background: i === 3 ? "rgba(226,177,54,.14)" : "rgba(8,118,201,.09)" }} /><div style={{ position: "relative", display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}><span style={{ color: "#74899e", fontSize: 11, fontWeight: 900 }}>{label}</span><span style={{ padding: "4px 7px", borderRadius: 999, background: i === 3 ? "#fff1bf" : "#eaf6ff", color: i === 3 ? "#8b6512" : "#0876c9", fontSize: 9, fontWeight: 950 }}>CANLI</span></div><strong style={{ position: "relative", display: "block", marginTop: 7, color: i === 3 ? "#8b6512" : "#153a65", fontSize: 26, letterSpacing: "-.4px" }}>{value}</strong><span style={{ position: "relative", display: "block", marginTop: 4, color: "#91a2b2", fontSize: 10 }}>{caption}</span><div style={{ position: "relative", height: 3, borderRadius: 99, marginTop: 12, background: "#e8f0f6", overflow: "hidden" }}><div style={{ width: i === 0 ? "68%" : i === 1 ? "54%" : i === 2 ? "76%" : "100%", height: "100%", borderRadius: 99, background: i === 3 ? "linear-gradient(90deg,#c99a35,#f6d780)" : "linear-gradient(90deg,#0876c9,#32b5ff)" }} /></div></article>)}
          </div>

          {membershipNotice ? <div style={{ ...locationInfoBox, marginBottom: 14, border: "1px solid #b9dcf7", background: "linear-gradient(90deg,#f5fbff,#eef8ff)" }}>{membershipNotice}</div> : null}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(285px,1fr))", gap: 18, alignItems: "stretch" }}>
            {[
              { id: "standard" as const, name: "Standart", icon: "◇", monthly: 0, yearly: 0, label: "BAŞLANGIÇ", badge: "Özgürce keşfet", subtitle: "Yaşam AI dünyasına güvenli ve ücretsiz başlangıç.", items: ["Ayda 3 temel analiz", "Son 5 raporu görüntüleme", "Temel bölge görünümü", "Standart destek"], accent: "#6d8195", frame: "1px solid #d8e2ec", bg: "linear-gradient(180deg,#ffffff 0%,#f7fafc 100%)", text: "#153a65", muted: "#607890", glow: "0 18px 38px rgba(34,66,96,.08)", power: 25 },
              { id: "premium" as const, name: "Premium", icon: "✦", monthly: 499, yearly: 4990, label: "EN ÇOK TERCİH EDİLEN", badge: "Profesyonel güç", subtitle: "Emlak profesyonelleri ve bilinçli yatırımcılar için tam karar paketi.", items: ["Ayda 100 AI analizi", "Açıklanabilir AI karar motoru", "Gelişmiş karşılaştırma", "AI pazarlık asistanı", "Premium PDF ve paylaşım", "Öncelikli güncellemeler"], accent: "#22a4ff", frame: "2px solid rgba(62,177,255,.72)", bg: "radial-gradient(circle at 86% 0%,rgba(73,189,255,.32),transparent 30%),linear-gradient(155deg,#052a4a 0%,#075f9f 58%,#073961 100%)", text: "#ffffff", muted: "#c7e8ff", glow: "0 26px 60px rgba(8,118,201,.30),inset 0 1px rgba(255,255,255,.18)", power: 75 },
              { id: "gold" as const, name: "Gold Elite", icon: "♛", monthly: 1499, yearly: 14990, label: "KURUMSAL ELITE", badge: "Seçkin kurumsal çözüm", subtitle: "Ekip, CRM, veri ve ölçeklenebilir operasyon isteyen kurumlar için.", items: ["Sınırsız analiz politikası", "Ekip ve rol yönetimi", "CRM ve kurumsal merkez", "Gelişmiş veri erişimi", "VIP öncelikli destek", "API entegrasyonuna hazır yapı"], accent: "#f1c96b", frame: "2px solid rgba(241,201,107,.76)", bg: "radial-gradient(circle at 86% 0%,rgba(255,211,105,.25),transparent 31%),linear-gradient(155deg,#0d0c09 0%,#28200e 57%,#11100b 100%)", text: "#fff6d7", muted: "#d9c99d", glow: "0 28px 64px rgba(83,62,12,.34),inset 0 1px rgba(255,255,255,.12)", power: 100 },
            ].map((plan) => {
              const selected = membershipPlan === plan.id;
              const amount = billingCycle === "monthly" ? plan.monthly : plan.yearly;
              const monthlyEquivalent = billingCycle === "yearly" && amount > 0 ? Math.round(amount / 12) : amount;
              return <article id={plan.id === "premium" ? "premium-plan-card" : plan.id === "gold" ? "gold-plan-card" : "standard-plan-card"} key={plan.id} className={`membership-card membership-card-${plan.id}`} style={{ position: "relative", overflow: "hidden", padding: 22, borderRadius: 25, border: plan.frame, background: plan.bg, color: plan.text, boxShadow: selected ? `${plan.glow},0 0 0 4px ${plan.id === "gold" ? "rgba(241,201,107,.15)" : plan.id === "premium" ? "rgba(34,164,255,.13)" : "rgba(109,129,149,.10)"}` : plan.glow, transform: selected ? "translateY(-5px)" : "none", transition: "transform .25s ease,box-shadow .25s ease" }}>
                <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: plan.id === "standard" ? "none" : "linear-gradient(115deg,transparent 28%,rgba(255,255,255,.08) 48%,transparent 68%)", opacity: .7 }} />
                <div style={{ position: "relative" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}><span className="membership-badge" style={{ padding: "7px 10px", borderRadius: 999, fontSize: 10, fontWeight: 950, letterSpacing: 1, color: plan.id === "standard" ? "#607890" : plan.accent, background: plan.id === "standard" ? "#edf2f6" : "rgba(255,255,255,.09)", border: `1px solid ${plan.id === "standard" ? "#d9e3ec" : "rgba(255,255,255,.14)"}` }}>{plan.label}</span><span style={{ fontSize: 24, color: plan.accent }}>{plan.icon}</span></div>
                  <div style={{ color: plan.accent, fontSize: 12, fontWeight: 900, marginTop: 17 }}>{plan.badge}</div>
                  <h3 style={{ margin: "5px 0 7px", fontSize: 29, letterSpacing: "-.6px" }}>{plan.name}</h3>
                  <p style={{ color: plan.muted, minHeight: 56, lineHeight: 1.52, fontSize: 13, margin: 0 }}>{plan.subtitle}</p>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6, margin: "19px 0 3px" }}><strong style={{ fontSize: 38, letterSpacing: "-1.4px" }}>{amount === 0 ? "Ücretsiz" : `${amount.toLocaleString("tr-TR")} TL`}</strong>{amount > 0 ? <span style={{ color: plan.muted, fontSize: 12, fontWeight: 850 }}>{billingCycle === "monthly" ? "/ ay" : "/ yıl"}</span> : null}</div>
                  <div style={{ minHeight: 24, color: plan.id === "gold" ? "#f1d98f" : plan.id === "premium" ? "#9fddff" : "#238a62", fontSize: 11, fontWeight: 900 }}>{billingCycle === "yearly" && amount > 0 ? `Aylık karşılığı yaklaşık ${monthlyEquivalent.toLocaleString("tr-TR")} TL` : amount > 0 ? "İstediğiniz zaman plan değiştirin" : "Kredi kartı gerekmez"}</div>
                  <div style={{ marginTop: 16, padding: 13, borderRadius: 15, background: plan.id === "standard" ? "#f1f5f8" : "rgba(255,255,255,.08)", border: `1px solid ${plan.id === "standard" ? "#dce5ed" : "rgba(255,255,255,.12)"}` }}><div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontWeight: 900 }}><span>AI GÜÇ SEVİYESİ</span><span style={{ color: plan.accent }}>%{plan.power}</span></div><div style={{ height: 8, marginTop: 8, background: plan.id === "standard" ? "#dfe7ee" : "rgba(255,255,255,.12)", borderRadius: 999, overflow: "hidden" }}><div style={{ height: "100%", width: `${plan.power}%`, borderRadius: 999, background: plan.id === "gold" ? "linear-gradient(90deg,#a87719,#ffe49a)" : plan.id === "premium" ? "linear-gradient(90deg,#23a8ff,#9fe2ff)" : "linear-gradient(90deg,#7e91a3,#a9b8c5)" }} /></div></div>
                  <div className="membership-feature-list" style={{ display: "grid", alignContent: "start", gap: 10, marginTop: 18 }}>{plan.items.map((item) => <div key={item} style={{ display: "flex", gap: 9, alignItems: "flex-start", color: plan.muted, fontSize: 13, lineHeight: 1.35 }}><span style={{ width: 20, height: 20, borderRadius: 999, display: "grid", placeItems: "center", flex: "0 0 auto", background: plan.id === "standard" ? "#eaf0f5" : "rgba(255,255,255,.10)", color: plan.accent, fontWeight: 950 }}>✓</span><span>{item}</span></div>)}</div>
                  <button className="membership-cta" type="button" onClick={() => { setMembershipPlan(plan.id); setMembershipNotice(plan.id === "standard" ? "Standart plan seçildi." : `${plan.name} seçildi. Canlı ödeme bağlantısı açıldığında güvenli ödeme adımına yönlendirileceksiniz.`); }} style={{ width: "100%", marginTop: 21, padding: "13px 15px", border: 0, borderRadius: 14, cursor: "pointer", fontWeight: 950, color: plan.id === "standard" ? "#153a65" : plan.id === "gold" ? "#1b1609" : "#06406c", background: selected ? plan.id === "gold" ? "linear-gradient(90deg,#d8a83e,#ffe39a)" : plan.id === "premium" ? "linear-gradient(90deg,#e7f7ff,#fff)" : "#e8eef3" : plan.id === "gold" ? "linear-gradient(90deg,#c99a35,#f6d780)" : plan.id === "premium" ? "#fff" : "#eef3f7", boxShadow: plan.id === "gold" ? "0 10px 25px rgba(235,190,83,.22)" : plan.id === "premium" ? "0 10px 25px rgba(0,0,0,.18)" : "none" }}>{selected ? "✓ Aktif Plan" : plan.id === "standard" ? "Ücretsiz Başla" : `${plan.name}'a Geç`}</button>
                  <div style={{ marginTop: 11, textAlign: "center", fontSize: 10, color: plan.muted }}>Kart bilgileri Yaşam AI sunucularında saklanmaz.</div>
                </div>
              </article>;
            })}
          </div>

          <article style={{ marginTop: 18, padding: 16, borderRadius: 20, border: "1px solid #dbe7f3", background: "linear-gradient(90deg,#f8fbfe,#ffffff,#fffaf0)", boxShadow: "0 14px 34px rgba(31,64,97,.07)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(155px,1fr))", gap: 10 }}>
              {[
                ["🔒", "SSL Güvenliği", "Şifreli bağlantı"],
                ["🛡️", "KVKK Yaklaşımı", "Kontrollü veri süreci"],
                ["🧠", "Açıklanabilir AI", "Kararın nedeni görünür"],
                ["🇹🇷", "Türkiye Veri Motoru", "Bölgesel karar zekâsı"],
                ["📄", "Profesyonel PDF", "Sunuma hazır rapor"],
              ].map(([icon,title,text]) => <div key={title} style={{ display: "flex", gap: 10, alignItems: "center", padding: 12, borderRadius: 14, background: "rgba(255,255,255,.82)", border: "1px solid #e2ebf3" }}><span style={{ width: 38, height: 38, borderRadius: 12, display: "grid", placeItems: "center", background: "#edf7ff", fontSize: 18 }}>{icon}</span><div><strong style={{ display: "block", color: "#153a65", fontSize: 12 }}>{title}</strong><span style={{ color: "#74899e", fontSize: 10 }}>{text}</span></div></div>)}
            </div>
          </article>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 14, marginTop: 18 }}>
            <article style={{ ...qualityRuleStyle, padding: 20, background: "linear-gradient(145deg,#f7fbff,#fff)" }}>
              <div style={eyebrow}>AKILLI PAKET ÖNERİCİ</div><h3 style={{ color: "#153a65", margin: "7px 0 6px" }}>Ayda kaç analiz yapıyorsunuz?</h3><p style={{ color: "#607890", fontSize: 13, lineHeight: 1.55, marginTop: 0 }}>İhtiyacınıza göre en uygun planı anında görün.</p>
              <input type="range" min={1} max={180} value={monthlyAnalysisNeed} onChange={(e) => setMonthlyAnalysisNeed(Number(e.target.value))} style={{ width: "100%", marginTop: 12 }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", marginTop: 10 }}><div><strong style={{ color: "#153a65", fontSize: 34 }}>{monthlyAnalysisNeed}</strong><span style={{ color: "#607890", fontSize: 12 }}> analiz / ay</span></div><span style={{ ...secureBadge, background: monthlyAnalysisNeed <= 3 ? "#eef3f7" : monthlyAnalysisNeed <= 100 ? "#edf8ff" : "#fff6df", color: monthlyAnalysisNeed <= 3 ? "#607890" : monthlyAnalysisNeed <= 100 ? "#0876c9" : "#8b6512", borderColor: monthlyAnalysisNeed <= 3 ? "#dce5ed" : monthlyAnalysisNeed <= 100 ? "#b9dcf7" : "#ead49c" }}>Önerilen: {monthlyAnalysisNeed <= 3 ? "Standart" : monthlyAnalysisNeed <= 100 ? "Premium" : "Gold Elite"}</span></div>
              <div style={{ marginTop: 14, padding: 14, borderRadius: 15, background: "#fff", border: "1px solid #dbe7f3", color: "#29435f", lineHeight: 1.55, fontSize: 13 }}>Tahmini zaman kazanımı: <strong>{Math.max(1, Math.round(monthlyAnalysisNeed * .55))} saat/ay</strong>. Bu değer, analiz başına ortalama manuel kontrol süresine dayalı ürün içi örnek tahmindir.</div>
            </article>

            <article style={{ position: "relative", overflow: "hidden", padding: 20, borderRadius: 20, color: "#fff", background: "linear-gradient(145deg,#0e0d09,#2a210e)", border: "1px solid rgba(241,201,107,.55)", boxShadow: "0 18px 40px rgba(65,48,10,.18)" }}>
              <div style={{ color: "#f1c96b", fontSize: 11, fontWeight: 950, letterSpacing: 1.5 }}>GOLD ELITE CLUB</div><h3 style={{ fontSize: 25, margin: "8px 0" }}>Kurumsal ayrıcalığın yeni standardı.</h3><p style={{ color: "#d9c99d", lineHeight: 1.6, fontSize: 13 }}>VIP destek, ekip rolleri, kurumsal CRM, gelişmiş veri erişimi ve yeni özelliklere öncelikli erişim.</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 9, marginTop: 16 }}>{["VIP destek","Ekip yönetimi","Beta erişimi","Kurumsal rozet"].map(x => <div key={x} style={{ padding: 11, borderRadius: 13, background: "rgba(255,255,255,.06)", border: "1px solid rgba(241,201,107,.18)", color: "#f6e6b6", fontSize: 12, fontWeight: 850 }}>♛ {x}</div>)}</div>
            </article>
          </div>

          <article style={{ ...qualityRuleStyle, padding: 20, marginTop: 16, background: "linear-gradient(180deg,#fff,#f8fbfe)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}><div><div style={eyebrow}>PREMIUM ÖNİZLEME</div><h3 style={{ color: "#153a65", margin: "6px 0 4px", fontSize: 22 }}>Raporun tamamını açmadan önce gücü hissedin</h3></div><span style={{ ...secureBadge, background: "#edf8ff", color: "#0876c9", borderColor: "#b9dcf7" }}>Açıklanabilir AI + PDF</span></div>
            <div style={{ position: "relative", marginTop: 15, padding: 18, borderRadius: 18, border: "1px solid #dbe7f3", background: "linear-gradient(145deg,#f9fcff,#eef6fc)", overflow: "hidden" }}><div style={{ filter: membershipPlan === "standard" ? "blur(4px)" : "none", opacity: membershipPlan === "standard" ? .55 : 1, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10 }}>{[["AI Güven Skoru","87/100"],["Yatırım Kararı","PAZARLIK ET"],["5 Yıl Projeksiyon","+%46"],["Risk Seviyesi","Düşük-Orta"]].map(([a,b]) => <div key={a} style={{ padding: 15, borderRadius: 14, background: "#fff", border: "1px solid #dbe7f3" }}><small style={{ color: "#74899e" }}>{a}</small><strong style={{ display: "block", color: "#153a65", marginTop: 5, fontSize: 19 }}>{b}</strong></div>)}</div>{membershipPlan === "standard" ? <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "rgba(244,249,253,.48)" }}><button type="button" onClick={() => { setMembershipPlan("premium"); setMembershipNotice("Premium önizleme açıldı. Canlı ödeme bağlantısı henüz bağlı değildir."); }} style={{ ...blueButton, boxShadow: "0 12px 28px rgba(8,118,201,.22)" }}>Premium ile Raporu Aç</button></div> : null}</div>
          </article>

          <div style={{ ...twoColumnGrid, marginTop: 14 }}>
            <article style={{ ...qualityRuleStyle, padding: 18 }}><div style={eyebrow}>GÜVEN VE ABONELİK</div><h3 style={{ color: "#153a65", margin: "6px 0 10px" }}>Şeffaf üyelik deneyimi</h3>{[["KVKK odaklı yaklaşım","Kişisel veri süreçleri açık ve kontrollü tasarlanır."],["Güvenli ödeme","Lisanslı ödeme kuruluşunun korumalı sayfası kullanılacaktır."],["Kart verisi","Kart bilgileri Yaşam AI tarafından saklanmayacaktır."],["Plan kontrolü","Yükseltme, düşürme ve iptal açık onayla yapılacaktır."]].map(([title,text]) => <div key={title} style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: "1px solid #e7eef5" }}><span style={{ width: 28, height: 28, borderRadius: 9, display: "grid", placeItems: "center", background: "#edf8ff", color: "#0876c9", fontWeight: 950 }}>✓</span><div><strong style={{ color: "#153a65", fontSize: 13 }}>{title}</strong><div style={{ color: "#607890", fontSize: 12, lineHeight: 1.45, marginTop: 2 }}>{text}</div></div></div>)}</article>
            <article style={{ ...qualityRuleStyle, padding: 18 }}><div style={eyebrow}>SIK SORULANLAR</div><h3 style={{ color: "#153a65", margin: "6px 0 10px" }}>Karar vermeden önce</h3>{[["Planımı sonra değiştirebilir miyim?","Evet. Canlı abonelik sistemi bağlandığında plan yükseltme ve düşürme kontrollü şekilde yapılacaktır."],["Yıllık plan avantajı nedir?","Yıllık fiyatlandırma, aylık ödemeye göre iki aylık kullanım avantajı sunacak şekilde gösterilmektedir."],["Gold kimler için?","Ekip, CRM, kurumsal veri ve ölçeklenebilir operasyon ihtiyacı olan şirketler için tasarlanmıştır."],["Fatura ve ödeme nasıl işleyecek?","Canlı ödeme entegrasyonu açıldığında lisanslı ödeme kuruluşu üzerinden güvenli tahsilat ve kullanıcı hesabında fatura geçmişi sağlanacaktır."]].map(([q,a]) => <details key={q} style={{ padding: "11px 0", borderBottom: "1px solid #e7eef5" }}><summary style={{ cursor: "pointer", color: "#153a65", fontWeight: 850, fontSize: 13 }}>{q}</summary><div style={{ color: "#607890", fontSize: 12, lineHeight: 1.55, paddingTop: 7 }}>{a}</div></details>)}</article>
          </div>

          <article style={{ ...qualityRuleStyle, padding: 20, marginTop: 14, overflow: "hidden", background: "linear-gradient(135deg,#f8fbff 0%,#ffffff 55%,#fff9e9 100%)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div>
                <div style={eyebrow}>GÜVEN ROZETLERİ</div>
                <h3 style={{ color: "#153a65", margin: "6px 0 5px", fontSize: 22 }}>Güven, her planın temel özelliği.</h3>
                <p style={{ color: "#607890", margin: 0, fontSize: 13, lineHeight: 1.55 }}>Canlı ödeme ve hukuki uyum süreçleri devreye alındığında aşağıdaki altyapılar doğrulanmış servislerle çalışacaktır.</p>
              </div>
              <span style={{ ...secureBadge, background: "#effaf5", color: "#147548", borderColor: "#bce8d1" }}>Şeffaf abonelik yaklaşımı</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(175px,1fr))", gap: 10, marginTop: 16 }}>
              {[
                ["🔒", "Güvenli bağlantı", "SSL/TLS dağıtımına hazır"],
                ["🛡️", "KVKK yaklaşımı", "Açık rıza ve veri kontrolü"],
                ["🧠", "Açıklanabilir AI", "Karar gerekçelerini görün"],
                ["🇹🇷", "Türkiye Veri Motoru", "Bölgesel veri altyapısı"],
                ["📄", "Profesyonel PDF", "Paylaşılabilir rapor akışı"],
              ].map(([icon,title,text]) => <div key={title} className="membership-trust-card" style={{ padding: 15, borderRadius: 16, border: "1px solid #dce8f3", background: "rgba(255,255,255,.86)", boxShadow: "0 9px 24px rgba(31,64,97,.06)" }}><div style={{ fontSize: 22 }}>{icon}</div><strong style={{ display: "block", color: "#153a65", fontSize: 13, marginTop: 7 }}>{title}</strong><span style={{ display: "block", color: "#74899e", fontSize: 11, lineHeight: 1.45, marginTop: 3 }}>{text}</span></div>)}
            </div>
          </article>

          <article style={{ position: "relative", overflow: "hidden", padding: 22, marginTop: 14, borderRadius: 22, border: "1px solid #dce7f1", background: "linear-gradient(145deg,#071f39,#0b416f)", color: "#fff", boxShadow: "0 18px 42px rgba(7,31,57,.18)" }}>
            <div style={{ position: "absolute", width: 260, height: 260, borderRadius: "50%", right: -90, top: -130, background: "rgba(241,201,107,.14)", filter: "blur(2px)" }} />
            <div style={{ position: "relative", display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ maxWidth: 680 }}>
                <div style={{ fontSize: 11, fontWeight: 950, letterSpacing: 1.5, color: "#9fd9ff" }}>KURUMSAL ÇÖZÜMLER</div>
                <h3 style={{ margin: "7px 0 6px", fontSize: 25 }}>Her sektör için aynı ekran değil, doğru karar merkezi.</h3>
                <p style={{ margin: 0, color: "rgba(255,255,255,.74)", fontSize: 13, lineHeight: 1.6 }}>Banka, değerleme, müteahhitlik ve emlak operasyonlarına özel kurumsal çalışma alanları kurumsal erişim katmanında açılacaktır.</p>
              </div>
              <span style={{ padding: "8px 12px", borderRadius: 999, border: "1px solid rgba(241,201,107,.38)", background: "rgba(241,201,107,.10)", color: "#f5d77f", fontSize: 11, fontWeight: 900 }}>Kurumsal erişimle yakında</span>
            </div>
            <div style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginTop: 17 }}>
              {[["🏦","Bankalar"],["📊","Değerleme"],["🏗️","Müteahhitler"],["🏠","Emlak Ofisleri"],["📐","Mimar & Mühendis"],["💼","Yatırımcılar"]].map(([icon,name]) => <div key={name} className="membership-enterprise-card" style={{ padding: 14, borderRadius: 15, border: "1px solid rgba(255,255,255,.13)", background: "rgba(255,255,255,.07)", backdropFilter: "blur(10px)" }}><span style={{ fontSize: 20 }}>{icon}</span><strong style={{ display: "block", marginTop: 7, fontSize: 12, color: "#fff" }}>{name}</strong><span style={{ display: "block", marginTop: 3, fontSize: 10, color: "rgba(255,255,255,.58)" }}>Özel çalışma alanı</span></div>)}
            </div>
          </article>

          <article style={{ ...qualityRuleStyle, padding: 18, marginTop: 14 }}><div style={eyebrow}>YETKİ KARŞILAŞTIRMASI</div><div style={{ overflowX: "auto", marginTop: 10 }}><table style={tableStyle}><thead><tr><th style={thStyle}>Özellik</th><th style={thStyle}>Standart</th><th style={{ ...thStyle, background: "#0876c9" }}>Premium</th><th style={{ ...thStyle, background: "#2b220f", color: "#f4d278" }}>Gold Elite</th></tr></thead><tbody>{[["Temel analiz","✓","✓","✓"],["AI Karar Motoru","—","✓","✓"],["Türkiye Zekâ Motoru","Ön görünüm","✓","✓"],["Premium PDF / paylaşım","—","✓","✓"],["AI Pazarlık Asistanı","—","✓","✓"],["Kurumsal merkez","—","—","✓"],["CRM ve ekip rolleri","—","—","✓"],["API hazırlığı","—","—","✓"],["Destek seviyesi","Standart","Öncelikli","VIP / Kurumsal"]].map((row) => <tr key={row[0]}>{row.map((cell,index) => <td key={`${row[0]}-${index}`} style={{ ...tdStyle, fontWeight: index === 0 ? 800 : 700, color: index === 3 && cell !== "—" ? "#8b6512" : tdStyle.color }}>{cell}</td>)}</tr>)}</tbody></table></div></article>

          <div style={{ ...alertStyle, marginTop: 14, background: "linear-gradient(90deg,#fff8e7,#fffdf7)", borderColor: "#ead49c", color: "#765816" }}>Canlı tahsilat henüz bağlı değildir. Ödeme entegrasyonu açıldığında iyzico veya benzeri lisanslı bir kuruluşun güvenli sayfası, sunucu taraflı abonelik doğrulaması, fatura geçmişi ve iptal akışı kullanılacaktır.</div>
        </>
      ) : null}

      {section === "pdf" ? (
        <>
          <article style={{ padding: 22, borderRadius: 22, background: "linear-gradient(135deg,#071f39 0%,#0b416f 58%,#0876c9 100%)", color: "#fff", marginBottom: 16, boxShadow: "0 18px 45px rgba(7,31,57,.2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ maxWidth: 760 }}>
                <div style={{ ...eyebrow, color: "#b9d9f4" }}>PROFESYONEL PDF RAPOR MERKEZİ</div>
                <h3 style={{ margin: "8px 0", fontSize: 30, letterSpacing: "-.5px" }}>Analizi, güven veren kurumsal bir dosyaya dönüştürün</h3>
                <p style={{ margin: 0, color: "#d8e9f8", lineHeight: 1.65 }}>Kapak, yönetici özeti, taşınmaz kimliği, karar skorları, değer projeksiyonları, açıklanabilir AI metni, rapor numarası ve doğrulama alanı tek A4 akışında hazırlanır.</p>
              </div>
              <span style={{ ...secureBadge, background: "rgba(255,255,255,.12)", color: "#fff", borderColor: "rgba(255,255,255,.22)" }}>A4 · Premium · Doğrulanabilir</span>
            </div>
          </article>

          {pdfNotice ? <div style={{ ...locationInfoBox, marginBottom: 14 }}>{pdfNotice}</div> : null}

          <div style={twoColumnGrid}>
            <article style={{ ...qualityRuleStyle, padding: 18 }}>
              <div style={eyebrow}>RAPOR AYARLARI</div>
              <h3 style={{ color: "#153a65", margin: "6px 0 14px" }}>Dosya ve sunum türünü seçin</h3>
              <label style={labelStyle}>
                Analiz dosyası
                <select value={selectedPdfRecord?.id ?? ""} onChange={(event) => { setPdfRecordId(event.target.value); setPdfNotice(""); }} style={inputStyle}>
                  {!records.length ? <option value="">Henüz kayıtlı analiz yok</option> : null}
                  {records.map((item) => <option key={item.id} value={item.id}>{locationText(item) || "Konum belirtilmedi"} · {item.property_type || "Taşınmaz"} · {formatCurrency(item.asking_price)}</option>)}
                </select>
              </label>
              <label style={{ ...labelStyle, marginTop: 12 }}>
                Sunum türü
                <select value={pdfAudience} onChange={(event) => setPdfAudience(event.target.value as "investor" | "bank" | "customer")} style={inputStyle}>
                  <option value="investor">Yatırımcı sunumu</option>
                  <option value="bank">Banka / finans kurumu</option>
                  <option value="customer">Müşteri sunumu</option>
                </select>
              </label>
              <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 16 }}>
                <button type="button" onClick={openProfessionalPdfReport} disabled={!selectedPdfRecord} style={{ ...blueButton, opacity: selectedPdfRecord ? 1 : .55 }}>PDF Raporu Hazırla</button>
                <button type="button" onClick={copyPdfSummary} disabled={!selectedPdfRecord} style={{ ...softButton, opacity: selectedPdfRecord ? 1 : .55 }}>Özeti Kopyala</button>
              </div>
              <div style={{ ...alertStyle, marginTop: 14 }}>PDF düğmesi, yalnızca seçilen raporu içeren özel yazdırma penceresini açar. Yazdırma ekranında hedef olarak “PDF olarak kaydet” seçilir.</div>
            </article>

            <article style={{ padding: 18, borderRadius: 18, border: "1px solid #d7e4f0", background: "linear-gradient(180deg,#fff,#f6faff)" }}>
              <div style={eyebrow}>CANLI RAPOR ÖNİZLEMESİ</div>
              <div style={{ marginTop: 12, padding: 18, borderRadius: 16, background: "linear-gradient(135deg,#092844,#0b558e)", color: "#fff" }}>
                <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.4, color: "#b9daf3" }}>YAŞAM AI · PROFESYONEL ANALİZ</div>
                <h3 style={{ fontSize: 25, margin: "28px 0 8px" }}>Gayrimenkul Karar Raporu</h3>
                <p style={{ margin: 0, color: "#d8e9f8" }}>{selectedPdfRecord ? locationText(selectedPdfRecord) : "Bir analiz dosyası seçin"}</p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginTop: 22 }}>
                  <div style={{ padding: 11, borderRadius: 11, background: "rgba(255,255,255,.09)" }}><small>RAPOR NO</small><strong style={{ display: "block", marginTop: 4 }}>{pdfReportNo}</strong></div>
                  <div style={{ padding: 11, borderRadius: 11, background: "rgba(255,255,255,.09)" }}><small>NİHAİ KARAR</small><strong style={{ display: "block", marginTop: 4 }}>{selectedPdfRecord?.decision || (selectedPdfRecord ? decisionFromReport(selectedPdfRecord.report || "") : "—")}</strong></div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 10 }}>
                {[["Talep", selectedPdfRecord ? formatCurrency(selectedPdfRecord.asking_price) : "—"], ["Alan", selectedPdfRecord?.area ? `${selectedPdfRecord.area} m²` : "—"], ["m²", selectedPdfM2 ? formatCurrency(String(selectedPdfM2)) : "—"]].map(([label, value]) => <div key={label} style={{ padding: 10, border: "1px solid #e0e9f2", borderRadius: 11, background: "#fff" }}><div style={{ fontSize: 10, color: "#71869a", fontWeight: 800 }}>{label}</div><strong style={{ color: "#153a65", display: "block", marginTop: 4 }}>{value}</strong></div>)}
              </div>
            </article>
          </div>

          <div style={{ ...statsGrid, marginTop: 14 }}>
            <Stat title="Veri Güveni" value={selectedPdfScores.trust ?? "—"} suffix={selectedPdfScores.trust !== null ? "/100" : ""} text="Rapordan çıkarılan skor" />
            <Stat title="Yatırım Puanı" value={selectedPdfScores.investment ?? "—"} suffix={selectedPdfScores.investment !== null ? "/100" : ""} text="Karar desteği" />
            <Stat title="5 Yıllık Senaryo" value={projection5 ? formatCurrency(String(projection5)) : "—"} text="Yıllık bileşik %18 varsayımı" />
            <Stat title="10 Yıllık Senaryo" value={projection10 ? formatCurrency(String(projection10)) : "—"} text="Yıllık bileşik %16 varsayımı" />
          </div>

          <div style={{ ...qualityRuleStyle, padding: 18, marginTop: 14 }}>
            <div style={eyebrow}>RAPOR KALİTE KONTROLÜ</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 10, marginTop: 12 }}>
              {[
                ["Kapak ve kurumsal kimlik", true],
                ["Rapor numarası", Boolean(selectedPdfRecord)],
                ["Taşınmaz kimliği", Boolean(selectedPdfRecord?.city && selectedPdfRecord?.district)],
                ["AI karar metni", Boolean(selectedPdfRecord?.report && selectedPdfRecord.report.length >= 80)],
                ["Karar skorları", Object.values(selectedPdfScores).some((value) => value !== null)],
                ["Dijital doğrulama alanı", true],
              ].map(([label, ready]) => <div key={String(label)} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: 11, borderRadius: 11, background: ready ? "#effbf6" : "#fff8e8", border: ready ? "1px solid #b9e7d1" : "1px solid #f4d38d" }}><span style={{ color: "#29435f" }}>{String(label)}</span><strong style={{ color: ready ? "#047857" : "#9a5b00" }}>{ready ? "Hazır" : "Eksik"}</strong></div>)}
            </div>
          </div>
        </>
      ) : null}

      {section === "listings" ? (
        <section style={{ marginTop: 16 }}>
          <article style={{ position: "relative", overflow: "hidden", padding: 24, borderRadius: 26, color: "#fff", background: "radial-gradient(circle at 88% 8%,rgba(255,160,71,.30),transparent 30%),radial-gradient(circle at 8% 100%,rgba(72,198,255,.20),transparent 34%),linear-gradient(145deg,#071b35,#0a4168 58%,#0a6c78)", boxShadow: "0 24px 58px rgba(8,48,85,.22)" }}>
            <div style={{ position: "relative", zIndex: 1, display: "grid", gridTemplateColumns: "minmax(0,1.25fr) minmax(290px,.75fr)", gap: 20, alignItems: "stretch" }}>
              <div>
                <div style={{ color: "#8fe7ff", fontSize: 10, fontWeight: 950, letterSpacing: 1.7 }}>YAŞAM AI · TÜRKİYE GAYRİMENKUL PAZARI</div>
                <h2 style={{ margin: "9px 0 7px", fontSize: 31, lineHeight: 1.08, letterSpacing: "-.8px" }}>İlan bulmaktan öte: doğru gayrimenkulü seçin.</h2>
                <p style={{ margin: 0, maxWidth: 790, color: "rgba(232,246,255,.76)", fontSize: 12.5, lineHeight: 1.7 }}>Türkiye genelinde ilan keşfi, AI fiyat kontrolü, yatırım skoru, risk ve pazarlık kararını tek akışta birleştiren pazar altyapısı.</p>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 8, marginTop: 18 }}>
                  <input value={listingQuery} onChange={(event) => setListingQuery(event.target.value)} placeholder="Örn. Adana 3+1, yatırım için güçlü, 6 milyon TL altı…" style={{ width: "100%", minWidth: 0, padding: "14px 15px", borderRadius: 14, border: "1px solid rgba(255,255,255,.18)", outline: 0, background: "rgba(255,255,255,.10)", color: "#fff", fontSize: 13, boxShadow: "inset 0 1px 0 rgba(255,255,255,.08)" }} />
                  <button type="button" onClick={() => setListingNotice(listingQuery.trim() ? `“${listingQuery.trim()}” için mevcut Yaşam AI envanteri filtrelendi.` : "Arama alanına konum, bütçe veya gayrimenkul türü yazın.")} style={{ padding: "0 18px", borderRadius: 14, border: 0, background: "linear-gradient(135deg,#ffb45f,#ff6b35)", color: "#2d1607", fontWeight: 950, cursor: "pointer", boxShadow: "0 12px 26px rgba(255,107,53,.28)" }}>AI ile Ara</button>
                </div>
              </div>
              <div style={{ display: "grid", gap: 9 }}>
                <div style={{ padding: 15, borderRadius: 17, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.12)" }}><small style={{ color: "rgba(235,248,255,.55)", fontWeight: 900 }}>CANLI İLAN VERİ KAYNAĞI</small><strong style={{ display: "block", marginTop: 7, fontSize: 18, color: listingBackendReady ? "#9ff0c9" : "#ffd39c" }}>{listingBackendReady ? "CANLI · SUPABASE BAĞLI" : listingBackendReady === false ? "SQL KURULUMU GEREKLİ" : "BAĞLANTI KONTROL EDİLİYOR"}</strong><span style={{ display: "block", marginTop: 5, color: "rgba(235,248,255,.66)", fontSize: 10.5, lineHeight: 1.5 }}>{listingBackendReady ? `${liveListings.filter((item) => item.status === "published").length} yayınlanmış ilan pazar akışında. RLS ile kullanıcı sahipliği korunuyor.` : "Canlı pazar verisi yalnızca gerçek Supabase ilan kayıtlarından gösterilir; örnek veya sahte canlı ilan üretilmez."}</span></div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div style={{ padding: 13, borderRadius: 15, background: "rgba(75,203,255,.11)", border: "1px solid rgba(95,211,255,.20)" }}><small style={{ color: "#a7eaff", fontWeight: 900 }}>AI ANALİZ DOSYASI</small><strong style={{ display: "block", marginTop: 5, fontSize: 22 }}>{marketplaceAnalysisItems.length}</strong></div>
                  <div style={{ padding: 13, borderRadius: 15, background: "rgba(255,178,89,.11)", border: "1px solid rgba(255,190,110,.20)" }}><small style={{ color: "#ffe1bb", fontWeight: 900 }}>CANLI İLAN</small><strong style={{ display: "block", marginTop: 5, fontSize: 22 }}>{liveListings.filter((item) => item.status === "published").length}</strong></div>
                </div>
              </div>
            </div>
          </article>

          <article style={{ ...qualityRuleStyle, padding: 16, marginTop: 13, background: "linear-gradient(145deg,#fff,#f7fbff)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 9 }}>
              <label style={{ color: "#607890", fontSize: 10, fontWeight: 900 }}>İŞLEM TİPİ<select value={listingTransaction} onChange={(e) => setListingTransaction(e.target.value as "Tümü" | "Satılık" | "Kiralık")} style={{ ...inputStyle, marginTop: 6 }}><option>Tümü</option><option>Satılık</option><option>Kiralık</option></select></label>
              <label style={{ color: "#607890", fontSize: 10, fontWeight: 900 }}>GAYRİMENKUL TÜRÜ<select value={listingPropertyType} onChange={(e) => setListingPropertyType(e.target.value)} style={{ ...inputStyle, marginTop: 6 }}><option>Tümü</option>{marketplacePropertyTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
              <label style={{ color: "#607890", fontSize: 10, fontWeight: 900 }}>SIRALAMA<select value={listingSort} onChange={(e) => setListingSort(e.target.value as "ai" | "priceLow" | "priceHigh")} style={{ ...inputStyle, marginTop: 6 }}><option value="ai">AI önceliği</option><option value="priceLow">Fiyat: düşükten</option><option value="priceHigh">Fiyat: yüksekten</option></select></label>
              <div style={{ display: "grid", alignContent: "end" }}><button type="button" onClick={() => { setListingQuery(""); setListingTransaction("Tümü"); setListingPropertyType("Tümü"); setListingSort("ai"); }} style={{ ...softButton, minHeight: 43 }}>Filtreleri Temizle</button></div>
            </div>
          </article>

          {listingNotice ? <div style={{ marginTop: 10, padding: "11px 13px", borderRadius: 13, border: "1px solid #cfe4f4", background: "#f0f9ff", color: "#285c86", fontSize: 11, fontWeight: 800 }}>{listingNotice}</div> : null}

          <article style={{ marginTop: 13, borderRadius: 22, overflow: "hidden", border: "1px solid #cfe1ed", background: "linear-gradient(145deg,#071d35,#0b4264)", boxShadow: "0 16px 38px rgba(7,46,75,.14)" }}>
            <div style={{ padding: "15px 17px", display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 14, alignItems: "center", color: "#fff" }}>
              <div><div style={{ color: "#72e5ff", fontSize: 8.5, fontWeight: 950, letterSpacing: 1.2 }}>ALICI TALEPLERİ · CRM</div><h3 style={{ margin: "5px 0 3px", fontSize: 19 }}>Mesajı satış fırsatına dönüştürün.</h3><p style={{ margin: 0, color: "rgba(255,255,255,.60)", fontSize: 8.5 }}>Gelen talepleri okuyun, önceliklendirin, takip tarihi koyun ve AI ile sonraki adımı netleştirin.</p></div>
              <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                {[['Yeni',listingCrmSummary.newCount,'#6ee7ff'],['Sıcak',listingCrmSummary.hotCount,'#ffbd69'],['Takip',listingCrmSummary.followUpCount,'#cab7ff'],['Kazanıldı',listingCrmSummary.wonCount,'#75e6b4']].map(([label,value,color]) => <div key={String(label)} style={{ minWidth: 58, padding: "7px 9px", borderRadius: 11, background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.09)" }}><strong style={{ display: "block", color: String(color), fontSize: 15 }}>{String(value)}</strong><span style={{ color: "rgba(255,255,255,.52)", fontSize: 6.8 }}>{label}</span></div>)}
                <button type="button" onClick={() => { setListingCrmOpen((current) => !current); if (!listingCrmOpen) void loadListingInbox(); }} style={{ padding: "10px 13px", borderRadius: 12, border: "1px solid rgba(255,255,255,.14)", background: listingCrmOpen ? "#fff" : "rgba(255,255,255,.08)", color: listingCrmOpen ? "#0b4264" : "#fff", fontSize: 8.5, fontWeight: 950, cursor: "pointer" }}>{listingCrmOpen ? "CRM'yi Kapat" : "Mesaj Kutusu & CRM"}</button>
              </div>
            </div>
            {listingCrmOpen ? <div style={{ padding: 14, borderTop: "1px solid rgba(255,255,255,.09)", background: "linear-gradient(145deg,#f8fcff,#eef6fb)" }}>
              {listingCrmReady === false ? <div style={{ padding: 12, borderRadius: 13, background: "#fff7e7", border: "1px solid #f1d39b", color: "#8a5a00", fontSize: 9 }}>CRM için FAZ 2 v6 SQL migration dosyasını Supabase'de çalıştırın.</div> : null}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 9 }}>
                {([['all','Tümü'],['new','Yeni'],['qualified','Nitelikli'],['followup','Takip zamanı']] as const).map(([id,label]) => <button key={id} type="button" onClick={() => setListingInboxFilter(id)} style={{ padding: "7px 10px", borderRadius: 999, border: listingInboxFilter===id ? "1px solid #0b6e9c" : "1px solid #d4e1eb", background: listingInboxFilter===id ? "#e8f7ff" : "#fff", color: listingInboxFilter===id ? "#0b6e9c" : "#6c8194", fontSize: 7.5, fontWeight: 900, cursor: "pointer" }}>{label}</button>)}
                <button type="button" onClick={() => void loadListingInbox()} style={{ marginLeft: "auto", padding: "7px 10px", borderRadius: 10, border: "1px solid #d4e1eb", background: "#fff", color: "#48677f", fontSize: 7.5, fontWeight: 900, cursor: "pointer" }}>{listingInboxLoading ? "Yükleniyor…" : "Yenile"}</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(260px,.72fr) minmax(0,1.28fr)", gap: 10, minHeight: 310 }}>
                <div style={{ display: "grid", gap: 7, alignContent: "start", maxHeight: 470, overflowY: "auto", paddingRight: 3 }}>
                  {filteredListingInbox.map((inquiry) => { const l=liveListings.find((item)=>item.id===inquiry.listing_id); const active=selectedInquiryId===inquiry.id; const buyer=`Alıcı · ${inquiry.sender_user_id.slice(0,6).toUpperCase()}`; return <button key={inquiry.id} type="button" onClick={() => void openListingInquiry(inquiry)} style={{ padding: 11, borderRadius: 14, border: active ? "1px solid #0a82b5" : "1px solid #dce6ee", background: active ? "linear-gradient(145deg,#edfaff,#fff)" : "#fff", textAlign: "left", cursor: "pointer", boxShadow: active ? "0 8px 20px rgba(10,130,181,.10)" : "none" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong style={{ color: "#24445f", fontSize: 9.3 }}>{buyer}</strong><span style={{ color: inquiry.status==='new' ? '#d75e32' : '#8092a2', fontSize: 6.8, fontWeight: 950 }}>{inquiry.status==='new' ? 'YENİ' : inquiry.lead_status.toLocaleUpperCase('tr-TR')}</span></div><span style={{ display: "block", marginTop: 4, color: "#6f8395", fontSize: 7.5 }}>{l?.title || 'İlan'}</span><span style={{ display: "block", marginTop: 5, color: "#445f74", fontSize: 8, lineHeight: 1.4 }}>{inquiry.message.slice(0,92)}{inquiry.message.length>92?'…':''}</span><div style={{ display: "flex", gap: 5, marginTop: 7, alignItems: "center" }}><span style={{ padding: "3px 6px", borderRadius: 999, background: inquiry.priority==='urgent'||inquiry.priority==='high' ? '#fff0e7' : '#f1f6fa', color: inquiry.priority==='urgent'||inquiry.priority==='high' ? '#b65424' : '#6c8194', fontSize: 6.5, fontWeight: 900 }}>{inquiry.priority==='urgent'?'ACİL':inquiry.priority==='high'?'YÜKSEK':inquiry.priority==='low'?'DÜŞÜK':'NORMAL'}</span><span style={{ color: "#9aabb8", fontSize: 6.5 }}>{new Date(inquiry.created_at).toLocaleDateString('tr-TR')}</span></div></button>})}
                  {!filteredListingInbox.length ? <div style={{ padding: 18, borderRadius: 14, border: "1px dashed #ccdbe6", background: "#fff", color: "#8294a5", textAlign: "center", fontSize: 8.5 }}>{listingInboxLoading ? "Alıcı talepleri yükleniyor…" : "Bu filtrede henüz alıcı talebi yok."}</div> : null}
                </div>
                <div style={{ padding: 13, borderRadius: 16, border: "1px solid #dce6ee", background: "#fff" }}>
                  {selectedInquiry ? (() => { const listing=liveListings.find((item)=>item.id===selectedInquiry.listing_id); return <div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start", flexWrap: "wrap" }}><div><div style={{ color: "#0b739f", fontSize: 7.5, fontWeight: 950, letterSpacing: .7 }}>AKTİF ALICI TALEBİ</div><h4 style={{ margin: "4px 0 2px", color: "#24445f", fontSize: 15 }}>{listing?.title || 'İlan talebi'}</h4><span style={{ color: "#8395a5", fontSize: 7.5 }}>Alıcı · {selectedInquiry.sender_user_id.slice(0,6).toUpperCase()} · {new Date(selectedInquiry.created_at).toLocaleString('tr-TR')}</span></div><button type="button" disabled={listingLeadAiLoading} onClick={() => void runListingLeadAi(selectedInquiry)} style={{ padding: "9px 11px", borderRadius: 10, border: 0, background: "linear-gradient(135deg,#0aa0c8,#0b6c9e)", color: "#fff", fontSize: 7.5, fontWeight: 950, cursor: "pointer" }}>{listingLeadAiLoading ? 'AI inceliyor…' : '✦ AI Talebi Özetle'}</button></div>
                    <div style={{ marginTop: 9, padding: 10, borderRadius: 12, background: "#f6fafc", color: "#3e5c73", fontSize: 8.5, lineHeight: 1.5 }}><strong style={{ display: "block", color: "#24445f", marginBottom: 3 }}>İlk mesaj</strong>{selectedInquiry.message}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 7, marginTop: 9 }}>
                      <label style={{ color: "#667f93", fontSize: 7, fontWeight: 900 }}>AŞAMA<select value={selectedInquiry.lead_status} onChange={(e)=>void updateListingLead(selectedInquiry.id,{lead_status:e.target.value as ListingInquiry['lead_status']})} style={{ ...inputStyle, marginTop: 4, padding: "8px 9px", fontSize: 8 }}><option value="new">Yeni</option><option value="contacted">İletişim kuruldu</option><option value="qualified">Nitelikli</option><option value="visit">Randevu / ziyaret</option><option value="offer">Teklif</option><option value="won">Kazanıldı</option><option value="lost">Kaybedildi</option></select></label>
                      <label style={{ color: "#667f93", fontSize: 7, fontWeight: 900 }}>ÖNCELİK<select value={selectedInquiry.priority} onChange={(e)=>void updateListingLead(selectedInquiry.id,{priority:e.target.value as ListingInquiry['priority']})} style={{ ...inputStyle, marginTop: 4, padding: "8px 9px", fontSize: 8 }}><option value="low">Düşük</option><option value="normal">Normal</option><option value="high">Yüksek</option><option value="urgent">Acil</option></select></label>
                      <label style={{ color: "#667f93", fontSize: 7, fontWeight: 900 }}>TAKİP TARİHİ<input type="datetime-local" value={selectedInquiry.follow_up_at ? selectedInquiry.follow_up_at.slice(0,16) : ''} onChange={(e)=>void updateListingLead(selectedInquiry.id,{follow_up_at:e.target.value || null})} style={{ ...inputStyle, marginTop: 4, padding: "8px 9px", fontSize: 8 }} /></label>
                    </div>
                    <label style={{ display: "block", marginTop: 8, color: "#667f93", fontSize: 7, fontWeight: 900 }}>ÖZEL CRM NOTU<textarea defaultValue={selectedInquiry.owner_note || ''} onBlur={(e)=>void updateListingLead(selectedInquiry.id,{owner_note:e.target.value.trim() || null})} placeholder="Örn. Peşin alım düşünüyor; cuma günü tekrar ara." style={{ width: "100%", minHeight: 56, marginTop: 4, resize: "vertical", padding: 9, borderRadius: 10, border: "1px solid #d5e1eb", background: "#fbfdff", color: "#294b67", fontSize: 8, lineHeight: 1.45 }} /></label>
                    {listingLeadAiResult ? <pre style={{ margin: "9px 0 0", whiteSpace: "pre-wrap", padding: 10, borderRadius: 12, background: "linear-gradient(145deg,#edfaff,#f7f3ff)", border: "1px solid #cfe8f5", color: "#2d5069", fontFamily: "inherit", fontSize: 8, lineHeight: 1.55 }}>{listingLeadAiResult}</pre> : null}
                    <div style={{ marginTop: 10, borderTop: "1px solid #e4ebf1", paddingTop: 9 }}><strong style={{ color: "#24445f", fontSize: 8.5 }}>Güvenli mesaj geçmişi</strong><div style={{ display: "grid", gap: 6, marginTop: 7, maxHeight: 150, overflowY: "auto" }}><div style={{ justifySelf: "start", maxWidth: "82%", padding: "7px 9px", borderRadius: "11px 11px 11px 3px", background: "#eef5fa", color: "#3f5e74", fontSize: 7.7, lineHeight: 1.4 }}>{selectedInquiry.message}</div>{listingThread.map((msg)=><div key={msg.id} style={{ justifySelf: msg.sender_user_id===user?.id ? 'end' : 'start', maxWidth: "82%", padding: "7px 9px", borderRadius: msg.sender_user_id===user?.id ? "11px 11px 3px 11px" : "11px 11px 11px 3px", background: msg.sender_user_id===user?.id ? "#0b729e" : "#eef5fa", color: msg.sender_user_id===user?.id ? "#fff" : "#3f5e74", fontSize: 7.7, lineHeight: 1.4 }}>{msg.message}<span style={{ display: "block", marginTop: 3, opacity: .55, fontSize: 6 }}>{new Date(msg.created_at).toLocaleString('tr-TR')}</span></div>)}</div></div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6, marginTop: 8 }}><input value={listingReply} onChange={(e)=>setListingReply(e.target.value)} onKeyDown={(e)=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); void sendListingInquiryReply(selectedInquiry); } }} placeholder="Alıcıya güvenli yanıt yazın…" style={{ ...inputStyle, padding: "9px 10px", fontSize: 8 }} /><button type="button" disabled={listingReplySending || selectedInquiry.status==='closed'} onClick={()=>void sendListingInquiryReply(selectedInquiry)} style={{ padding: "9px 12px", borderRadius: 10, border: 0, background: selectedInquiry.status==='closed' ? '#c8d2da' : 'linear-gradient(135deg,#0e9f79,#087b5e)', color: '#fff', fontSize: 7.5, fontWeight: 950, cursor: selectedInquiry.status==='closed' ? 'not-allowed' : 'pointer' }}>{listingReplySending?'Gönderiliyor…':'Gönder'}</button></div>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 7 }}><button type="button" onClick={()=>void updateListingLead(selectedInquiry.id,{status:selectedInquiry.status==='closed'?'read':'closed'})} style={{ padding: "7px 9px", borderRadius: 9, border: "1px solid #d9e3eb", background: "#fff", color: "#607890", fontSize: 6.8, fontWeight: 900, cursor: "pointer" }}>{selectedInquiry.status==='closed'?'Talebi Yeniden Aç':'Talebi Kapat'}</button></div>
                  </div>; })() : <div style={{ height: "100%", minHeight: 280, display: "grid", placeItems: "center", textAlign: "center", color: "#8798a7" }}><div><div style={{ fontSize: 28 }}>✉</div><strong style={{ display: "block", marginTop: 7, color: "#48677f", fontSize: 10 }}>Bir alıcı talebi seçin</strong><span style={{ display: "block", marginTop: 4, fontSize: 8 }}>Mesajı okuyun, CRM aşamasını belirleyin ve takip aksiyonunu yönetin.</span></div></div>}
                </div>
              </div>
            </div> : null}
          </article>

          <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.35fr) minmax(330px,.65fr)", gap: 14, marginTop: 14, alignItems: "start" }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "end", marginBottom: 9 }}><div><div style={eyebrow}>AKILLI PAZAR AKIŞI</div><h3 style={{ margin: "5px 0 0", color: "#153a65", fontSize: 21 }}>Canlı ilanlar, analiz dosyaları ve taslaklar</h3></div><span style={secureBadge}>{filteredLiveListings.length + filteredMarketplaceAnalysis.length + filteredMarketplaceDrafts.length} sonuç</span></div>
              <div style={{ display: "grid", gap: 10 }}>
                {filteredLiveListings.map((listing) => {
                  const location=[listing.city,listing.district,listing.neighborhood].filter(Boolean).join(" / ");
                  const price=Number(listing.price||0), area=Number(listing.area_m2||0), priceM2=price>0&&area>0?Math.round(price/area):0;
                  const own=listing.user_id===user?.id;
                  const cover=listingImageUrl(listing.media?.[0]);
                  return <article key={listing.id} style={{ padding: 16, borderRadius: 19, border: listing.status === "published" ? "1px solid #bfe5d2" : "1px solid #ead7b5", background: listing.status === "published" ? "linear-gradient(145deg,#f8fffb,#fff)" : "linear-gradient(145deg,#fffaf0,#fff)", boxShadow: "0 10px 28px rgba(31,64,97,.06)" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "96px minmax(0,1fr) auto", gap: 14, alignItems: "center" }}>
                      <div style={{ width: 96, height: 78, borderRadius: 17, overflow: "hidden", display: "grid", placeItems: "center", background: "linear-gradient(145deg,#e9f5ff,#eafbf5)", border: "1px solid #d7e6ef", color: "#0b6b90", fontSize: 28 }}>{cover ? <img src={cover} alt="İlan kapak" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "⌂"}</div>
                      <div><div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}><span style={{ padding: "4px 7px", borderRadius: 999, background: listing.status === "published" ? "#e9f8f0" : "#fff4dc", color: listing.status === "published" ? "#087b5e" : "#996100", fontSize: 8.5, fontWeight: 950 }}>{listing.status === "published" ? "CANLI İLAN" : listing.status.toLocaleUpperCase("tr-TR")}</span><span style={{ padding: "4px 7px", borderRadius: 999, background: "#edf6ff", color: "#1769a7", fontSize: 8.5, fontWeight: 950 }}>{listing.transaction_type}</span><span style={{ padding: "4px 7px", borderRadius: 999, background: listing.verification_status === "verified" ? "#e9f8f0" : "#f4f0ff", color: listing.verification_status === "verified" ? "#087b5e" : "#6b46c1", fontSize: 8.5, fontWeight: 950 }}>{listing.verification_status === "verified" ? "DOĞRULANMIŞ" : "DOĞRULAMA BEKLİYOR"}</span></div><strong style={{ display: "block", marginTop: 7, color: "#153a65", fontSize: 16 }}>{listing.title}</strong><span style={{ display: "block", marginTop: 4, color: "#74899e", fontSize: 10 }}>{listing.property_type} · {location || "Konum eksik"}{area ? ` · ${area.toLocaleString("tr-TR")} m²` : ""}{priceM2 ? ` · ${priceM2.toLocaleString("tr-TR")} TL/m²` : ""}</span>{listing.description ? <span style={{ display: "block", marginTop: 6, color: "#607890", fontSize: 9.5, lineHeight: 1.45 }}>{listing.description.slice(0,140)}{listing.description.length>140?"…":""}</span> : null}</div>
                      <div style={{ textAlign: "right" }}><strong style={{ color: "#153a65", fontSize: 18 }}>{price ? `${Math.round(price).toLocaleString("tr-TR")} TL` : "Fiyat yok"}</strong><span style={{ display: "block", marginTop: 5, color: "#71869b", fontSize: 9 }}>{own ? "Sizin ilanınız" : "Pazar ilanı"}</span></div>
                    </div>
                    <div style={{ display: "flex", gap: 7, marginTop: 12, flexWrap: "wrap" }}><button type="button" onClick={() => { setSelectedListingImageIndex(0); setSelectedListingId(listing.id); }} style={{ ...blueButton, marginTop: 0, padding: "9px 12px", background: "linear-gradient(135deg,#0a6fc7,#0b4e91)" }}>İlanı İncele</button><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`} target="_blank" rel="noreferrer" style={{ ...softButton, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>Haritada Aç</a>{own && listing.status !== "published" ? <button type="button" disabled={listingSaving} onClick={() => void changeLiveListingStatus(listing.id,"published")} style={{ ...blueButton, padding: "9px 12px", background: "linear-gradient(135deg,#079a70,#087b5e)" }}>Yayına Al</button> : null}{own && listing.status === "published" ? <button type="button" disabled={listingSaving} onClick={() => void changeLiveListingStatus(listing.id,"paused")} style={{ ...softButton, padding: "9px 12px" }}>Yayını Durdur</button> : null}{own ? <button type="button" disabled={listingSaving} onClick={() => void deleteLiveListing(listing.id)} style={{ ...softButton, padding: "9px 12px", color: "#b42318", borderColor: "#efcccc" }}>Sil</button> : null}<span style={{ marginLeft: "auto", alignSelf: "center", color: "#087b5e", fontSize: 9, fontWeight: 900 }}>Supabase · RLS korumalı</span></div>
                  </article>;
                })}

                {filteredMarketplaceAnalysis.map(({ item, scores, price, area, priceM2, decision }) => {
                  const decisionColor = decision === "AL" ? "#047857" : decision.includes("PAZARLIK") ? "#9a6700" : decision.includes("RİSK") || decision.includes("UZAK") ? "#b42318" : "#285c86";
                  const location = [item.city,item.district,item.neighborhood].filter(Boolean).join(" / ") || "Konum belirtilmedi";
                  return <article key={item.id} style={{ padding: 16, borderRadius: 19, border: "1px solid #dce8f3", background: "linear-gradient(145deg,#fff,#f7fbff)", boxShadow: "0 10px 26px rgba(31,64,97,.06)" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "64px minmax(0,1fr) auto", gap: 13, alignItems: "center" }}>
                      <div style={{ width: 64, height: 64, borderRadius: 17, display: "grid", placeItems: "center", background: "linear-gradient(145deg,#e8f7ff,#f2edff)", color: "#0876c9", fontSize: 25, border: "1px solid #d3e8f7" }}>⌂</div>
                      <div style={{ minWidth: 0 }}><div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center" }}><span style={{ padding: "4px 7px", borderRadius: 999, background: "#eaf6ff", color: "#0876c9", fontSize: 8.5, fontWeight: 950 }}>AI ANALİZ DOSYASI</span><span style={{ padding: "4px 7px", borderRadius: 999, background: `${decisionColor}12`, color: decisionColor, fontSize: 8.5, fontWeight: 950 }}>{decision}</span></div><strong style={{ display: "block", marginTop: 7, color: "#153a65", fontSize: 16 }}>{item.property_type || "Gayrimenkul"} · {location}</strong><span style={{ display: "block", marginTop: 4, color: "#74899e", fontSize: 10 }}>{area ? `${area.toLocaleString("tr-TR")} m²` : "Alan yok"}{priceM2 ? ` · ${priceM2.toLocaleString("tr-TR")} TL/m²` : ""}</span></div>
                      <div style={{ textAlign: "right" }}><strong style={{ color: "#153a65", fontSize: 17 }}>{price ? `${Math.round(price).toLocaleString("tr-TR")} TL` : "Fiyat yok"}</strong><span style={{ display: "block", marginTop: 5, color: "#74899e", fontSize: 9 }}>Mevcut analiz fiyatı</span></div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", gap: 7, marginTop: 12 }}>{[["Yatırım",scores.investment],["Fırsat",scores.opportunity],["Risk",scores.risk],["Güven",scores.trust],["Likidite",scores.liquidity]].map(([label,value]) => <div key={String(label)} style={{ padding: 9, borderRadius: 11, background: "#fff", border: "1px solid #e1eaf2" }}><small style={{ color: "#8798a9", fontSize: 8.5, fontWeight: 900 }}>{String(label).toUpperCase()}</small><strong style={{ display: "block", marginTop: 3, color: label === "Risk" && Number(value) >= 65 ? "#b42318" : "#153a65", fontSize: 14 }}>{value ?? "—"}</strong></div>)}</div>
                    <div style={{ display: "flex", gap: 7, marginTop: 11, flexWrap: "wrap" }}><button type="button" onClick={() => { setAiRecordId(item.id); setSection("ai"); }} style={{ ...blueButton, padding: "9px 12px" }}>AI İncele</button><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`} target="_blank" rel="noreferrer" style={{ ...softButton, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>Haritada Aç</a><span style={{ marginLeft: "auto", alignSelf: "center", color: "#8a9aaa", fontSize: 9 }}>Canlı ilan değildir · analiz kaydıdır</span></div>
                  </article>;
                })}

                {filteredMarketplaceDrafts.map((draft) => {
                  const price=parseMoney(draft.price), area=parseNumeric(draft.area), priceM2=price>0&&area>0?Math.round(price/area):0;
                  const location=[draft.city,draft.district,draft.neighborhood].filter(Boolean).join(" / ");
                  return <article key={draft.id} style={{ padding: 16, borderRadius: 19, border: "1px solid #f0d7bf", background: "linear-gradient(145deg,#fffaf5,#fff)", boxShadow: "0 10px 26px rgba(120,75,25,.05)" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "64px minmax(0,1fr) auto", gap: 13, alignItems: "center" }}><div style={{ width: 64, height: 64, borderRadius: 17, display: "grid", placeItems: "center", background: "linear-gradient(145deg,#fff0db,#fff8ed)", color: "#d86620", fontSize: 25, border: "1px solid #f2dac0" }}>＋</div><div><div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}><span style={{ padding: "4px 7px", borderRadius: 999, background: "#fff0df", color: "#c65f1c", fontSize: 8.5, fontWeight: 950 }}>YEREL İLAN TASLAĞI</span><span style={{ padding: "4px 7px", borderRadius: 999, background: "#eef7f4", color: "#087b5e", fontSize: 8.5, fontWeight: 950 }}>{draft.transaction}</span></div><strong style={{ display: "block", marginTop: 7, color: "#153a65", fontSize: 16 }}>{draft.title}</strong><span style={{ display: "block", marginTop: 4, color: "#74899e", fontSize: 10 }}>{draft.propertyType} · {location || "Konum eksik"}{area ? ` · ${area.toLocaleString("tr-TR")} m²` : ""}{priceM2 ? ` · ${priceM2.toLocaleString("tr-TR")} TL/m²` : ""}</span></div><div style={{ textAlign: "right" }}><strong style={{ color: "#153a65", fontSize: 17 }}>{price ? `${Math.round(price).toLocaleString("tr-TR")} TL` : "Fiyat yok"}</strong><span style={{ display: "block", marginTop: 5, color: "#b36a35", fontSize: 9 }}>Henüz yayınlanmadı</span></div></div>
                    <div style={{ display: "flex", gap: 7, marginTop: 11, justifyContent: "flex-end" }}><button type="button" onClick={() => deleteMarketplaceDraft(draft.id)} style={{ ...softButton, padding: "8px 10px", color: "#b42318", borderColor: "#efcccc" }}>Taslağı Sil</button></div>
                  </article>;
                })}

                {!filteredLiveListings.length && !filteredMarketplaceAnalysis.length && !filteredMarketplaceDrafts.length ? <div style={emptyState}>Bu filtrelerle eşleşen mevcut analiz dosyası veya ilan taslağı yok.</div> : null}
              </div>
            </div>

            <aside style={{ display: "grid", gap: 12, position: "relative", top: "auto", alignSelf: "start", minWidth: 0 }}>
              <article style={{ ...qualityRuleStyle, padding: 18, background: "linear-gradient(145deg,#fff,#fff8f2)" }}>
                <div style={{ ...eyebrow, color: "#d86620" }}>İLAN VER · CANLI YAYIN STÜDYOSU</div><h3 style={{ margin: "6px 0 5px", color: "#153a65" }}>Taslak oluşturun veya doğrudan yayına alın.</h3><p style={{ margin: 0, color: "#74899e", fontSize: 10.5, lineHeight: 1.5 }}>{listingBackendReady ? "Supabase RLS ve medya deposu hazır. Yayınlanan ilanlar Türkiye pazar akışına girer." : "SQL migration çalıştırılana kadar yerel taslak özelliğini kullanabilirsiniz."}</p>
                <div style={{ display: "grid", gap: 8, marginTop: 13 }}>
                  <input value={listingDraft.title} onChange={(e) => setListingDraft((d) => ({...d,title:e.target.value}))} placeholder="İlan başlığı" style={inputStyle} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}><input value={listingDraft.city} onChange={(e) => setListingDraft((d) => ({...d,city:e.target.value}))} placeholder="İl" style={inputStyle} /><input value={listingDraft.district} onChange={(e) => setListingDraft((d) => ({...d,district:e.target.value}))} placeholder="İlçe" style={inputStyle} /></div>
                  <input value={listingDraft.neighborhood} onChange={(e) => setListingDraft((d) => ({...d,neighborhood:e.target.value}))} placeholder="Mahalle" style={inputStyle} />
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}><select value={listingDraft.propertyType} onChange={(e) => setListingDraft((d) => ({...d,propertyType:e.target.value}))} style={inputStyle}><option>Konut</option><option>Arsa</option><option>İşyeri</option><option>Ticari</option><option>Proje</option></select><select value={listingDraft.transaction} onChange={(e) => setListingDraft((d) => ({...d,transaction:e.target.value as "Satılık" | "Kiralık"}))} style={inputStyle}><option>Satılık</option><option>Kiralık</option></select></div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}><input value={listingDraft.price} onChange={(e) => setListingDraft((d) => ({...d,price:e.target.value.replace(/[^0-9]/g,"")}))} inputMode="numeric" placeholder="Fiyat (TL)" style={inputStyle} /><input value={listingDraft.area} onChange={(e) => setListingDraft((d) => ({...d,area:e.target.value.replace(/[^0-9.,]/g,"")}))} inputMode="decimal" placeholder="m²" style={inputStyle} /></div>
                  <div style={{ padding: 11, borderRadius: 15, border: "1px solid #d6e7f4", background: "linear-gradient(145deg,#f8fcff,#fff)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 7 }}><div><strong style={{ color: "#153a65", fontSize: 10.5 }}>İlan açıklaması</strong><span style={{ display: "block", marginTop: 2, color: "#7a8fa3", fontSize: 8.5 }}>Önce kendi bilginizi yazın; AI yeni özellik uydurmaz.</span></div><span style={{ padding: "5px 8px", borderRadius: 999, background: "linear-gradient(135deg,#6d3df1,#bd2cff)", color: "#fff", fontSize: 8, fontWeight: 950 }}>✨ AI İLAN ASİSTANI</span></div>
                    <textarea value={listingDraft.description || ""} onChange={(e) => { setListingDraft((d) => ({...d,description:e.target.value})); setListingAiSuggestion(""); }} placeholder="Örneğin: Daire yeni boyandı. Güney cephe. Mutfak yenilendi. Toplu taşımaya yakın..." rows={5} style={{ ...inputStyle, resize: "vertical", minHeight: 118, maxHeight: 260, background: "#fff" }} />
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8, marginTop: 10 }}>
                      {([
                        ["correct","✍️","Düzelt","İmla ve anlatımı profesyonelleştir","linear-gradient(135deg,#eef6ff,#ffffff)","#1769aa","#cfe4f6"],
                        ["enrich","✨","Zenginleştir","Daha etkileyici ve satış odaklı yaz","linear-gradient(135deg,#fff6dc,#fffdf5)","#a76500","#f0d18c"],
                        ["short","⚡","Kısalt","Kısa, net ve hızlı okunan hale getir","linear-gradient(135deg,#eafbf5,#ffffff)","#087b5e","#c6eadc"],
                        ["premium","💎","Premium Yaz","Üst segment ilan diliyle yeniden yaz","linear-gradient(135deg,#f7efff,#fff1fb)","#7a2fb3","#e0b9f1"],
                      ] as const).map(([mode,icon,label,desc,bg,tone,border]) => {
                        const active = listingAiMode === mode;
                        return <button key={mode} type="button" disabled={listingAiLoading} onClick={() => void generateListingAiDescription(mode)} style={{ position: "relative", overflow: "hidden", textAlign: "left", padding: "12px 12px", minHeight: 74, borderRadius: 14, border: active ? `1px solid ${tone}` : `1px solid ${border}`, background: active ? bg : "#fff", color: tone, cursor: listingAiLoading ? "wait" : "pointer", boxShadow: active ? `0 10px 24px ${tone}22` : "0 5px 14px rgba(22,54,84,.05)", transform: active ? "translateY(-1px)" : "none", transition: "all .18s ease", opacity: listingAiLoading ? .72 : 1 }}>
                          <span style={{ display: "inline-grid", placeItems: "center", width: 30, height: 30, borderRadius: 10, background: bg, border: `1px solid ${border}`, fontSize: 15, marginBottom: 7 }}>{icon}</span>
                          <strong style={{ display: "block", fontSize: 10.5, fontWeight: 950, color: tone }}>{label}</strong>
                          <small style={{ display: "block", marginTop: 3, color: "#71869a", fontSize: 8.2, lineHeight: 1.35, fontWeight: 700 }}>{desc}</small>
                          {active ? <span style={{ position: "absolute", right: 9, top: 9, padding: "3px 6px", borderRadius: 999, background: tone, color: "#fff", fontSize: 7, fontWeight: 950 }}>SEÇİLİ</span> : null}
                        </button>;
                      })}
                    </div>
                    <div style={{ marginTop: 8, padding: "9px 10px", borderRadius: 11, background: "linear-gradient(90deg,#fff8eb,#fff)", border: "1px solid #f1ddb7", color: "#805a18", fontSize: 8.5, lineHeight: 1.45 }}><strong>Gelecek gelir modeli:</strong> AI açıklama geliştirme mikro-hizmeti ödeme sistemi açıldığında yaklaşık 50–100 TL bandında ayrı hizmet olarak sunulabilecek. Şimdilik geliştirme/test aşamasında erişim açık.</div>
                    {listingAiLoading ? <div style={{ marginTop: 9, padding: 11, borderRadius: 12, background: "#f4f0ff", color: "#6840ca", fontSize: 9.5, fontWeight: 850 }}>AI açıklamanızı hazırlıyor…</div> : null}
                    {listingAiSuggestion ? <div style={{ marginTop: 9, padding: 12, borderRadius: 13, background: "linear-gradient(145deg,#f5f1ff,#fff)", border: "1px solid #d8caf8" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}><strong style={{ color: "#5f3bbd", fontSize: 9.5 }}>AI ÖNERİSİ · ÖNİZLEME</strong><button type="button" onClick={() => { setListingDraft((d) => ({...d,description:listingAiSuggestion})); setListingAiSuggestion(""); setListingNotice("AI açıklaması ilana uygulandı. Yayınlamadan önce son kez kontrol edin."); }} style={{ padding: "7px 9px", borderRadius: 9, border: 0, background: "#6840ca", color: "#fff", fontSize: 8.5, fontWeight: 950, cursor: "pointer" }}>Bu Metni Kullan</button></div><p style={{ margin: "8px 0 0", color: "#40586f", fontSize: 9.5, lineHeight: 1.58, whiteSpace: "pre-wrap" }}>{listingAiSuggestion}</p></div> : null}
                  </div>
                  <div style={{ padding: 15, borderRadius: 20, border: "1px solid #cfe5f3", background: "radial-gradient(circle at 12% 0%,rgba(20,190,255,.10),transparent 32%),linear-gradient(145deg,#f8fcff,#ffffff)", boxShadow: "0 16px 38px rgba(31,64,97,.08)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                      <div><div style={{ color: "#0a5d86", fontSize: 9, fontWeight: 950, letterSpacing: 1.05 }}>FOTOĞRAF STÜDYOSU v2</div><strong style={{ display: "block", marginTop: 4, color: "#153a65", fontSize: 13.5 }}>İlanın vitrini burada hazırlanır.</strong><span style={{ display: "block", marginTop: 4, color: "#71869a", fontSize: 8.8, lineHeight: 1.5 }}>Kapak seçimi, ışık ve kadraj sinyalleriyle daha güven veren bir ilan oluşturun.</span></div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}><span style={{ padding: "6px 9px", borderRadius: 999, background: listingFiles.length >= 6 ? "#e9f8f0" : listingFiles.length >= 3 ? "#eef6ff" : "#fff5df", color: listingFiles.length >= 6 ? "#087b5e" : listingFiles.length >= 3 ? "#1769a7" : "#996100", fontSize: 8.5, fontWeight: 950 }}>{listingFiles.length}/12 FOTOĞRAF</span><span style={{ padding: "6px 10px", borderRadius: 999, background: !listingFiles.length ? "#eef3f8" : listingDraftQuality.score >= 70 ? "#eaf9f2" : "#fff7e8", color: !listingFiles.length ? "#6f8498" : listingDraftQuality.score >= 70 ? "#087b5e" : "#9a6500", fontSize: 8.5, fontWeight: 950 }}>{listingFiles.length ? `KALİTE ${listingDraftQuality.score}/100` : "KALİTE · HENÜZ HESAPLANMADI"}</span></div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(180px,.62fr)", gap: 9, marginTop: 11 }}>
                      <label style={{ display: "grid", placeItems: "center", minHeight: listingFiles.length ? 96 : 142, padding: 14, borderRadius: 16, border: "1.5px dashed #65bfe8", background: "radial-gradient(circle at 50% 0%,rgba(37,190,255,.14),transparent 58%),#f8fcff", color: "#285c86", textAlign: "center", cursor: "pointer" }}>
                        <span style={{ display: "grid", placeItems: "center", width: 44, height: 44, borderRadius: 14, background: "linear-gradient(145deg,#d8f8ff,#e8efff)", color: "#0876c9", fontSize: 23, marginBottom: 7, boxShadow: "0 8px 18px rgba(8,118,201,.12)" }}>＋</span>
                        <strong style={{ fontSize: 11.5 }}>Fotoğrafları seç veya sürükleyip bırak</strong><span style={{ marginTop: 3, color: "#8395a6", fontSize: 8.2 }}>JPG / PNG / WEBP · en fazla 12 görsel · görsel başına 8 MB</span>
                        <input type="file" accept="image/*" multiple onChange={(e) => setListingFiles(Array.from(e.target.files ?? []).slice(0,12))} style={{ display: "none" }} />
                      </label>
                      <div style={{ padding: 12, borderRadius: 16, background: "linear-gradient(145deg,#071f39,#0a5b7f)", color: "#fff", boxShadow: "0 12px 25px rgba(7,31,57,.16)" }}>
                        <div style={{ fontSize: 8, fontWeight: 950, letterSpacing: 1.05, color: "#82e7ff" }}>AI FOTOĞRAF KOÇU</div>
                        <strong style={{ display: "block", marginTop: 5, fontSize: 12 }}>{listingFiles.length ? `${listingDraftQuality.photoQuality || 0}/100 görsel kalite` : "İlk güçlü kareyi ekleyin"}</strong>
                        <span style={{ display: "block", marginTop: 5, color: "rgba(255,255,255,.70)", fontSize: 8.2, lineHeight: 1.45 }}>{listingFiles.length ? (listingRecommendedCoverIndex === 0 ? "Mevcut kapak, seçili görseller içinde en güçlü aday." : `${listingRecommendedCoverIndex + 1}. fotoğraf kapak için daha güçlü görünüyor.`) : "Yatay, aydınlık ve mekânı geniş gösteren gerçek fotoğraflar daha yüksek güven üretir."}</span>
                        {listingFiles.length ? <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 5, marginTop: 9 }}><div style={{ padding: "6px 5px", borderRadius: 9, background: "rgba(255,255,255,.08)", textAlign: "center" }}><strong style={{ display: "block", fontSize: 10 }}>{listingPhotoCoach.uniqueCount}</strong><span style={{ fontSize: 6.5, color: "rgba(255,255,255,.62)" }}>benzersiz</span></div><div style={{ padding: "6px 5px", borderRadius: 9, background: listingPhotoCoach.duplicateCount ? "rgba(255,154,75,.18)" : "rgba(255,255,255,.08)", textAlign: "center" }}><strong style={{ display: "block", fontSize: 10 }}>{listingPhotoCoach.duplicateCount}</strong><span style={{ fontSize: 6.5, color: "rgba(255,255,255,.62)" }}>benzer</span></div><div style={{ padding: "6px 5px", borderRadius: 9, background: listingPhotoCoach.lowQualityCount ? "rgba(255,99,99,.18)" : "rgba(255,255,255,.08)", textAlign: "center" }}><strong style={{ display: "block", fontSize: 10 }}>{listingPhotoCoach.lowQualityCount}</strong><span style={{ fontSize: 6.5, color: "rgba(255,255,255,.62)" }}>zayıf</span></div></div> : null}
                        {listingRecommendedCoverIndex > 0 ? <button type="button" onClick={() => makeListingFileCover(listingRecommendedCoverIndex)} style={{ width: "100%", marginTop: 10, padding: "10px 10px", borderRadius: 12, border: "1px solid rgba(255,255,255,.24)", background: "linear-gradient(135deg,#00d8ff 0%,#2f8cff 52%,#6f62ff 100%)", color: "#fff", fontSize: 8.8, fontWeight: 950, cursor: "pointer", boxShadow: "0 10px 24px rgba(47,140,255,.32)" }}>★ EN İYİ KAPAK ADAYINI SEÇ</button> : null}
                      </div>
                    </div>
                    {listingFiles.length ? <div style={{ marginTop: 11, padding: 12, borderRadius: 16, background: "linear-gradient(135deg,#0a2641,#0b5273)", color: "#fff", boxShadow: "0 12px 28px rgba(13,72,103,.15)" }}><div style={{ display: "grid", gridTemplateColumns: "72px minmax(0,1fr)", gap: 11, alignItems: "center" }}><div style={{ width: 68, height: 68, borderRadius: "50%", display: "grid", placeItems: "center", background: `conic-gradient(${listingDraftQuality.score >= 70 ? "#36d399" : listingDraftQuality.score >= 50 ? "#42bff5" : "#ffb84d"} ${listingDraftQuality.score * 3.6}deg,rgba(255,255,255,.12) 0deg)`, boxShadow: "inset 0 0 0 6px rgba(7,29,48,.72)" }}><div style={{ textAlign: "center" }}><strong style={{ display: "block", fontSize: 18 }}>{listingDraftQuality.score}</strong><span style={{ fontSize: 6.3, color: "rgba(255,255,255,.64)" }}>/100</span></div></div><div><div style={{ fontSize: 7.4, fontWeight: 950, letterSpacing: .9, color: "#76e8ff" }}>CANLI İLAN KALİTE SKORU · {listingDraftQuality.level.toLocaleUpperCase("tr-TR")}</div><strong style={{ display: "block", marginTop: 4, fontSize: 11.5 }}>{listingPhotoCoach.warnings[0]}</strong>{listingPhotoCoach.warnings.slice(1,3).map((warning) => <span key={warning} style={{ display: "block", marginTop: 4, color: "rgba(255,255,255,.66)", fontSize: 7.5, lineHeight: 1.35 }}>• {warning}</span>)}</div></div></div> : null}
                    <div style={{ marginTop: 12, padding: 11, borderRadius: 16, background: "linear-gradient(145deg,#f8fbff,#f2f8fc)", border: "1px solid #dce9f3" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}><div><strong style={{ color: "#234866", fontSize: 10.2 }}>Önerilen çekim planı</strong><span style={{ display: "block", marginTop: 2, color: "#8798a7", fontSize: 7.6 }}>Güven veren bir ilan için temel kareleri tamamlayın.</span></div><span style={{ padding: "5px 8px", borderRadius: 999, background: "#e7f7ff", color: "#0876c9", fontSize: 7.2, fontWeight: 950 }}>8 KARE REHBERİ</span></div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 6, marginTop: 9 }}>{[
                        {icon:"🏠",title:"Cephe",text:"İlk güven"},{icon:"🛋️",title:"Salon",text:"Geniş açı"},{icon:"🍽️",title:"Mutfak",text:"Tezgâh + dolap"},{icon:"🛏️",title:"Oda",text:"Doğal ışık"},
                        {icon:"🚿",title:"Banyo",text:"Net detay"},{icon:"🌤️",title:"Balkon / Teras",text:"Açık alan"},{icon:"🪟",title:"Manzara",text:"Varsa göster"},{icon:"🚪",title:"Giriş",text:"İlk izlenim"}
                      ].map((item) => <div key={item.title} style={{ minHeight: 64, padding: "8px 8px", borderRadius: 11, background: "#fff", border: "1px solid #e2eaf1", boxShadow: "0 5px 14px rgba(32,70,103,.05)" }}><span style={{ fontSize: 15 }}>{item.icon}</span><strong style={{ display: "block", marginTop: 4, color: "#31516c", fontSize: 7.9 }}>{item.title}</strong><span style={{ display: "block", marginTop: 2, color: "#91a0ad", fontSize: 6.7 }}>{item.text}</span></div>)}</div>
                      <span style={{ display: "block", marginTop: 7, color: "#8a9aaa", fontSize: 7 }}>Bu rehber içerik iddiası değildir; hangi kareleri çekmenin faydalı olacağını gösterir.</span>
                    </div>
                    {listingFiles.length ? <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8, marginTop: 10 }}>
                      {listingFiles.map((file,index) => { const insight = listingPhotoInsights[index]; const relation = listingPhotoRelations[index]; const duplicate = (relation?.duplicateOf ?? -1) >= 0; const weak = (insight?.score ?? 100) < 52; const recommended = index === listingRecommendedCoverIndex; const tone = duplicate ? "#b45309" : weak ? "#b42318" : (insight?.score ?? 0) >= 82 ? "#087b5e" : (insight?.score ?? 0) >= 60 ? "#1769a7" : "#a46b00"; return <div key={`${file.name}-${file.lastModified}-${index}`} style={{ position: "relative", borderRadius: 13, overflow: "hidden", border: duplicate ? "2px solid #f59e0b" : weak ? "2px solid #e56b6f" : index === 0 ? "2px solid #0ba5d8" : recommended ? "2px solid #18a977" : "1px solid #d9e5ee", background: "#edf4f8", minHeight: 122, boxShadow: recommended ? "0 10px 22px rgba(24,169,119,.12)" : duplicate ? "0 10px 22px rgba(245,158,11,.10)" : "none" }}>
                        {listingFilePreviews[index] ? <img src={listingFilePreviews[index]} alt={`Yüklenecek ilan fotoğrafı ${index+1}`} style={{ width: "100%", height: 90, objectFit: "cover", display: "block", filter: weak ? "saturate(.84)" : "none" }} /> : null}
                        <div style={{ padding: "7px 8px 8px", background: "#fff" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 5, alignItems: "center" }}><strong style={{ color: tone, fontSize: 7.7 }}>{duplicate ? `BENZER KARE · ${Number(relation?.similarity || 0)}%` : weak ? "İYİLEŞTİR" : insight?.label || "Analiz ediliyor"}{recommended && !duplicate && !weak ? " · ÖNERİLEN" : ""}</strong><span style={{ color: "#71869a", fontSize: 7.1, fontWeight: 900 }}>{insight ? `${insight.score}/100` : "…"}</span></div><span style={{ display: "block", marginTop: 3, minHeight: 20, color: duplicate ? "#a16207" : weak ? "#a94343" : "#8798a7", fontSize: 6.8, lineHeight: 1.35 }}>{duplicate ? `${Number(relation?.duplicateOf || 0)+1}. fotoğrafa çok benziyor; galeride tekrar hissi yaratabilir.` : insight?.note || "Görsel kalite sinyali hazırlanıyor."}</span></div>
                        <div style={{ position: "absolute", left: 5, top: 5, display: "flex", gap: 4, flexWrap: "wrap", maxWidth: "72%" }}><span style={{ padding: "4px 6px", borderRadius: 8, background: index === 0 ? "rgba(7,126,178,.94)" : "rgba(5,20,37,.76)", color: "#fff", fontSize: 7, fontWeight: 950 }}>{index === 0 ? "KAPAK" : `${index+1}. FOTO`}</span>{recommended && !duplicate && !weak ? <span style={{ padding: "4px 6px", borderRadius: 8, background: "rgba(15,156,109,.94)", color: "#fff", fontSize: 6.8, fontWeight: 950 }}>★ AI KAPAK</span> : null}{duplicate ? <span style={{ padding: "4px 6px", borderRadius: 8, background: "rgba(245,158,11,.95)", color: "#fff", fontSize: 6.8, fontWeight: 950 }}>↻ BENZER</span> : null}{weak ? <span style={{ padding: "4px 6px", borderRadius: 8, background: "rgba(190,52,52,.94)", color: "#fff", fontSize: 6.8, fontWeight: 950 }}>! ZAYIF</span> : null}{insight ? <span style={{ padding: "4px 6px", borderRadius: 8, background: "rgba(255,255,255,.92)", color: "#31516c", fontSize: 6.8, fontWeight: 900 }}>{insight.orientation.toUpperCase()}</span> : null}</div>
                        <span style={{ position: "absolute", right: 5, top: 5, display: "flex", gap: 3 }}>{index > 0 && !duplicate ? <button type="button" onClick={() => makeListingFileCover(index)} style={{ border: 0, borderRadius: 7, padding: "4px 6px", background: "rgba(255,255,255,.95)", color: "#0b6d9f", fontSize: 6.8, fontWeight: 950, cursor: "pointer" }}>Kapak Yap</button> : null}<button type="button" onClick={() => removeListingFile(index)} style={{ border: 0, borderRadius: 7, width: 24, height: 24, background: "rgba(35,18,18,.80)", color: "#fff", fontSize: 11, fontWeight: 950, cursor: "pointer" }}>×</button></span>
                      </div>})}
                    </div> : null}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 8, marginTop: 12 }}>
                      {[{icon:"📷",label:"Fotoğraf",value:Math.min(100,listingDraftQuality.uniquePhotoCount*10),text:listingFiles.length ? `${listingDraftQuality.uniquePhotoCount}/10 benzersiz kare · ${listingPhotoCoach.duplicateCount ? `${listingPhotoCoach.duplicateCount} benzer kare var` : listingFiles.length >= 6 ? "güçlü set" : "daha fazla kare ekleyin"}` : "Henüz fotoğraf yok"},{icon:"✨",label:"Görsel kalite",value:listingFiles.length?listingDraftQuality.photoQuality:0,text:listingFiles.length ? (listingDraftQuality.photoQuality >= 75 ? "ışık + kadraj güçlü" : "ışık / kadraj geliştirilebilir") : "Fotoğraf eklenince hesaplanır"},{icon:"✍️",label:"Açıklama",value:Math.min(100,Math.round(listingDraft.description.trim().length/1.2)),text:listingDraft.description.trim().length >= 80 ? "Açıklama güçlü" : "AI ile güçlendirebilirsiniz"},{icon:"✓",label:"Temel veri",value:listingDraftQuality.basicsReady?100:45,text:listingDraftQuality.basicsReady?"Başlık, konum, fiyat ve m² hazır":"Eksik zorunlu alan var"}].map((item) => <div key={item.label} style={{ padding: "11px 12px", minHeight: 82, borderRadius: 14, background: "linear-gradient(145deg,#ffffff,#f7fafc)", border: "1px solid #dfe8ef", boxShadow: "0 7px 18px rgba(26,62,94,.05)" }}><div style={{ display: "grid", gridTemplateColumns: "30px minmax(0,1fr) auto", alignItems: "center", gap: 8 }}><span style={{ display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: 10, background: item.value >= 75 ? "#e8f8f1" : item.value >= 50 ? "#eaf5fd" : "#fff5df", fontSize: 13 }}>{item.icon}</span><strong style={{ color: "#294b67", fontSize: 8.8 }}>{item.label}</strong><span style={{ color: "#506b82", fontSize: 9, fontWeight: 950 }}>{item.value}%</span></div><div style={{ height: 6, marginTop: 9, borderRadius: 999, background: "#e6edf2", overflow: "hidden" }}><div style={{ width: `${item.value}%`, height: "100%", borderRadius: 999, background: item.value >= 75 ? "linear-gradient(90deg,#10b981,#53d5ad)" : item.value >= 50 ? "linear-gradient(90deg,#159ed4,#62c8ef)" : "linear-gradient(90deg,#f0a52b,#ffd166)" }} /></div><span style={{ display: "block", marginTop: 6, color: "#8394a3", fontSize: 7.1, lineHeight: 1.35 }}>{item.text}</span></div>)}
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}><button type="button" disabled={listingSaving} onClick={() => listingBackendReady ? void saveLiveListing("draft") : saveMarketplaceDraft()} style={{ ...softButton, padding: "11px 12px" }}>{listingSaving ? "Kaydediliyor…" : listingBackendReady ? "Bulut Taslağı" : "Yerel Taslak"}</button><button type="button" disabled={listingSaving || listingBackendReady === false} onClick={() => void saveLiveListing("published")} style={{ ...blueButton, marginTop: 0, background: "linear-gradient(135deg,#ff9a4b,#ff6b35)", boxShadow: "0 10px 22px rgba(255,107,53,.20)", opacity: listingBackendReady === false ? .5 : 1 }}>{listingSaving ? "Yayınlanıyor…" : "İlanı Yayınla"}</button></div>
                </div>
              </article>

              <article style={{ padding: 17, borderRadius: 20, border: "1px solid #dbe7f3", background: "linear-gradient(145deg,#f4faff,#fff)" }}><div style={eyebrow}>FAZ 2 CANLI YAYIN DURUMU</div><h3 style={{ margin: "6px 0 10px", color: "#153a65" }}>Gerçek ilan altyapısı</h3><div style={{ display: "grid", gap: 7 }}>{[["İlan tablosu + RLS",listingBackendReady?"Hazır":"SQL gerekli"],["Fotoğraf / medya depolama",listingBackendReady?"Hazır":"SQL gerekli"],["Taslak + yayın + durdurma",listingBackendReady?"Hazır":"Bekliyor"],["İlan doğrulama motoru","Sonraki"],["Favoriler + güvenli mesaj","Hazır"],["Görüntülenme + ilan analitiği",listingAnalyticsReady===false?"SQL gerekli":"Hazır"],["Emlakçı / müteahhit rolleri","Sonraki"],["AI ilan puanlama","Temel hazır"]].map(([label,status]) => { const ready=String(status)==="Hazır"||String(status)==="Temel hazır"; return <div key={String(label)} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: 10, borderRadius: 12, background: ready?"#eefbf5":"#fff", border: ready?"1px solid #c8ead8":"1px solid #e0e9f2" }}><span style={{ color: "#35536e", fontSize: 10, fontWeight: 800 }}>{label}</span><strong style={{ color: ready?"#047857":"#9a6700", fontSize: 9 }}>{status}</strong></div>})}</div><button type="button" onClick={() => void loadLiveListings()} style={{ ...softButton, width: "100%", marginTop: 10 }}>Canlı bağlantıyı yenile</button></article>
            </aside>
          </div>
          {selectedLiveListing ? (() => {
            const listing = selectedLiveListing;
            const intelligence = selectedListingIntelligence;
            const location = [listing.city, listing.district, listing.neighborhood].filter(Boolean).join(" / ");
            const price = Number(listing.price || 0);
            const area = Number(listing.area_m2 || 0);
            const priceM2 = price > 0 && area > 0 ? Math.round(price / area) : 0;
            const images = (listing.media || []).map((path) => listingImageUrl(path)).filter(Boolean);
            const activeImage = images[selectedListingImageIndex] || images[0] || "";
            const own = listing.user_id === user?.id;
            const diff = intelligence?.differencePercent;
            const signalTone = intelligence?.priceSignal === "Avantajlı" ? "#0a8f65" : intelligence?.priceSignal === "Yüksek fiyat" ? "#d45b2c" : intelligence?.priceSignal === "Piyasa bandında" ? "#1769a7" : "#7a8fa3";
            const marketPosition = diff == null ? 50 : Math.max(4, Math.min(96, 50 + diff * 1.15));
            const valueGap = intelligence?.estimatedValue ? price - intelligence.estimatedValue : 0;
            const goImage = (direction: -1 | 1) => {
              if (!images.length) return;
              setSelectedListingImageIndex((current) => (current + direction + images.length) % images.length);
            };
            return <div onClick={() => setSelectedListingId("")} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(3,12,24,.82)", backdropFilter: "blur(12px)", display: "grid", placeItems: "center", padding: 14, overflowY: "auto" }}>
              <article onClick={(event) => event.stopPropagation()} style={{ width: "min(1200px,98vw)", maxHeight: "96vh", overflowY: "auto", borderRadius: 30, background: "linear-gradient(180deg,#f8fbfe,#fff)", border: "1px solid rgba(255,255,255,.58)", boxShadow: "0 42px 120px rgba(0,0,0,.42)" }}>
                <div style={{ position: "relative", padding: 18, background: "linear-gradient(145deg,#06192e,#0a3b62)", color: "#fff" }}>
                  <button type="button" onClick={() => setSelectedListingId("")} style={{ position: "absolute", right: 16, top: 16, zIndex: 5, width: 40, height: 40, borderRadius: "50%", border: "1px solid rgba(255,255,255,.25)", background: "rgba(3,14,27,.72)", backdropFilter: "blur(10px)", color: "#fff", fontSize: 19, cursor: "pointer" }}>×</button>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.55fr) minmax(280px,.62fr)", gap: 13, alignItems: "stretch" }}>
                    <div style={{ position: "relative", minHeight: 390, borderRadius: 22, overflow: "hidden", background: activeImage ? `url(${activeImage}) center/cover` : "radial-gradient(circle at 70% 20%,rgba(55,218,255,.24),transparent 30%),linear-gradient(145deg,#092740,#0c6681)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.12)" }}>
                      {!activeImage ? <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center", padding: 24 }}><div><div style={{ fontSize: 46, opacity: .8 }}>⌂</div><strong style={{ display: "block", marginTop: 7, fontSize: 15 }}>Henüz ilan fotoğrafı yok</strong><span style={{ display: "block", marginTop: 4, color: "rgba(255,255,255,.62)", fontSize: 10 }}>Fotoğraf eklenmesi güven, doğrulama ve ilan kalitesi için önemlidir.</span></div></div> : <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(3,13,25,.02) 38%,rgba(3,13,25,.86) 100%)" }} />}
                      {images.length > 1 ? <><button type="button" onClick={() => goImage(-1)} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 38, height: 38, borderRadius: "50%", border: "1px solid rgba(255,255,255,.28)", background: "rgba(3,16,29,.62)", color: "#fff", fontSize: 21, cursor: "pointer" }}>‹</button><button type="button" onClick={() => goImage(1)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", width: 38, height: 38, borderRadius: "50%", border: "1px solid rgba(255,255,255,.28)", background: "rgba(3,16,29,.62)", color: "#fff", fontSize: 21, cursor: "pointer" }}>›</button></> : null}
                      <div style={{ position: "absolute", left: 20, right: 20, bottom: 18 }}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><span style={{ padding: "5px 8px", borderRadius: 999, background: "#17b779", fontSize: 8.5, fontWeight: 950 }}>{listing.status === "published" ? "CANLI İLAN" : listing.status.toLocaleUpperCase("tr-TR")}</span><span style={{ padding: "5px 8px", borderRadius: 999, background: "rgba(255,255,255,.15)", fontSize: 8.5, fontWeight: 900 }}>{listing.transaction_type}</span><span style={{ padding: "5px 8px", borderRadius: 999, background: listing.verification_status === "verified" ? "#17b779" : "#7558c9", fontSize: 8.5, fontWeight: 900 }}>{listing.verification_status === "verified" ? "✓ DOĞRULANMIŞ" : listing.verification_status === "pending" ? "◷ İNCELEMEDE" : "DOĞRULAMA BEKLİYOR"}</span>{images.length ? <span style={{ padding: "5px 8px", borderRadius: 999, background: "rgba(3,16,29,.55)", fontSize: 8.5, fontWeight: 900 }}>{selectedListingImageIndex + 1}/{images.length} FOTOĞRAF</span> : null}</div>
                        <h2 style={{ margin: "10px 0 4px", fontSize: 27, lineHeight: 1.12, maxWidth: 760, textShadow: "0 2px 12px rgba(0,0,0,.30)" }}>{listing.title}</h2><span style={{ color: "rgba(255,255,255,.78)", fontSize: 10.8 }}>{listing.property_type} · {location}</span>
                      </div>
                    </div>
                    <aside style={{ display: "grid", alignContent: "space-between", gap: 10, padding: 18, borderRadius: 22, background: "radial-gradient(circle at 100% 0%,rgba(25,205,255,.18),transparent 35%),linear-gradient(145deg,#0a2844,#071b31)", border: "1px solid rgba(255,255,255,.10)" }}>
                      <div><div style={{ color: "#8ce9ff", fontSize: 8.5, fontWeight: 950, letterSpacing: 1.25 }}>İLAN FİYATI</div><strong style={{ display: "block", marginTop: 6, fontSize: 29, lineHeight: 1 }}>{price ? `${Math.round(price).toLocaleString("tr-TR")} TL` : "—"}</strong><span style={{ display: "block", marginTop: 7, color: "rgba(255,255,255,.62)", fontSize: 9.5 }}>{area ? `${area.toLocaleString("tr-TR")} m²` : "Alan belirtilmedi"}{priceM2 ? ` · ${priceM2.toLocaleString("tr-TR")} TL/m²` : ""}</span></div>
                      <div style={{ padding: 12, borderRadius: 15, background: `${signalTone}20`, border: `1px solid ${signalTone}55` }}><span style={{ color: "rgba(255,255,255,.62)", fontSize: 8, fontWeight: 900 }}>YAŞAM AI FİYAT SİNYALİ</span><strong style={{ display: "block", marginTop: 5, color: intelligence?.priceSignal === "Yüksek fiyat" ? "#ffb18f" : intelligence?.priceSignal === "Avantajlı" ? "#75edbf" : "#a9dcff", fontSize: 17 }}>{intelligence?.priceSignal || "Veri eksik"}</strong>{diff != null ? <span style={{ display: "block", marginTop: 4, color: "rgba(255,255,255,.68)", fontSize: 9 }}>Veri bazlı değere göre {Math.abs(diff).toFixed(1)}% {diff > 0 ? "yukarıda" : "aşağıda"}.</span> : null}</div>
                      <div style={{ display: "grid", gap: 7 }}><button type="button" disabled={listingBuyerAiLoading} onClick={() => void runListingBuyerAi(listing)} style={{ padding: "11px 12px", borderRadius: 12, border: 0, background: "linear-gradient(135deg,#68e7ff,#2eb9ff)", color: "#06243c", fontWeight: 950, cursor: "pointer", boxShadow: "0 10px 22px rgba(36,190,255,.22)" }}>{listingBuyerAiLoading ? "AI değerlendiriyor…" : "✦ Bu İlana Değer mi?"}</button><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}><button type="button" onClick={() => void toggleListingFavorite(listing.id)} style={{ padding: "10px 10px", borderRadius: 11, border: "1px solid rgba(255,255,255,.18)", background: favoriteListingIds.includes(listing.id) ? "rgba(255,190,76,.18)" : "rgba(255,255,255,.06)", color: favoriteListingIds.includes(listing.id) ? "#ffd778" : "#fff", fontWeight: 900, cursor: "pointer" }}>{favoriteListingIds.includes(listing.id) ? "★ Favoride" : "☆ Favorile"}</button><button type="button" onClick={() => void shareListing(listing)} style={{ padding: "10px 10px", borderRadius: 11, border: "1px solid rgba(255,255,255,.18)", background: "rgba(255,255,255,.06)", color: "#fff", fontWeight: 900, cursor: "pointer" }}>↗ Paylaş</button></div><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`} target="_blank" rel="noreferrer" style={{ padding: "10px 12px", borderRadius: 11, border: "1px solid rgba(255,255,255,.18)", background: "rgba(255,255,255,.06)", color: "#fff", fontWeight: 900, textDecoration: "none", textAlign: "center" }}>Haritada Aç</a></div>
                    </aside>
                  </div>
                </div>
                <div style={{ padding: 20 }}>
                  {listingInquiryNotice ? <div style={{ marginBottom: 12, padding: "10px 12px", borderRadius: 12, background: "#eef7ff", border: "1px solid #cfe5f7", color: "#31516c", fontSize: 9.5, fontWeight: 800 }}>{listingInquiryNotice}</div> : null}
                  {listingBuyerAiResult ? <article style={{ marginBottom: 15, padding: 16, borderRadius: 18, background: "linear-gradient(145deg,#071e34,#0a557c)", color: "#fff", boxShadow: "0 14px 34px rgba(5,53,89,.18)" }}><div style={{ color: "#7ce9ff", fontSize: 8.5, fontWeight: 950, letterSpacing: 1.2 }}>YAŞAM AI · ALICI KARAR ASİSTANI</div><h3 style={{ margin: "6px 0 8px", fontSize: 18 }}>Bu ilana değer mi?</h3><div style={{ whiteSpace: "pre-wrap", color: "rgba(255,255,255,.82)", fontSize: 10.5, lineHeight: 1.65 }}>{listingBuyerAiResult}</div><p style={{ margin: "10px 0 0", color: "rgba(255,255,255,.52)", fontSize: 7.8 }}>Karar desteğidir; ekspertiz, tapu/imar incelemesi ve hukuki doğrulama yerine geçmez.</p></article> : null}
                  {images.length ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(92px,1fr))", gap: 7, marginBottom: 15 }}>{images.slice(0,10).map((src,index) => <button key={src} type="button" onClick={() => setSelectedListingImageIndex(index)} style={{ position: "relative", padding: 0, borderRadius: 12, overflow: "hidden", border: selectedListingImageIndex === index ? "2px solid #0b91cc" : "1px solid #d9e5ee", background: "#fff", cursor: "pointer", boxShadow: selectedListingImageIndex === index ? "0 8px 18px rgba(11,145,204,.18)" : "none" }}><img src={src} alt={`İlan görseli ${index+1}`} style={{ width: "100%", height: 76, objectFit: "cover", display: "block" }} />{index === 0 ? <span style={{ position: "absolute", left: 5, bottom: 5, padding: "3px 5px", borderRadius: 6, background: "rgba(3,20,35,.74)", color: "#fff", fontSize: 6.8, fontWeight: 950 }}>KAPAK</span> : null}</button>)}</div> : <div style={{ marginBottom: 14, padding: 12, borderRadius: 14, background: "#fff8e8", border: "1px solid #f1d494", color: "#8a6200", fontSize: 10, fontWeight: 800 }}>Fotoğraf henüz yüklenmemiş. İlan sahibinin en az 3, ideal olarak 6–10 gerçek fotoğraf eklemesi önerilir.</div>}

                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.35fr) minmax(300px,.65fr)", gap: 15 }}>
                    <div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }}>{[["Fiyat",price ? `${Math.round(price).toLocaleString("tr-TR")} TL` : "—"],["Alan",area ? `${area.toLocaleString("tr-TR")} m²` : "—"],["İlan m²",priceM2 ? `${priceM2.toLocaleString("tr-TR")} TL` : "—"]].map(([label,value]) => <div key={label} style={{ padding: 12, borderRadius: 14, background: "#f7fbff", border: "1px solid #dce8f3" }}><span style={{ color: "#7a8fa3", fontSize: 8.2, fontWeight: 900 }}>{label.toUpperCase()}</span><strong style={{ display: "block", marginTop: 5, color: "#153a65", fontSize: 14 }}>{value}</strong></div>)}</div>

                      <article style={{ marginTop: 12, padding: 16, borderRadius: 19, background: "linear-gradient(145deg,#f7fbff,#fff)", border: "1px solid #d9e7f2", boxShadow: "0 10px 26px rgba(31,64,97,.05)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", flexWrap: "wrap" }}><div><div style={eyebrow}>YAŞAM AI FİYAT / DEĞER KONTROLÜ</div><h3 style={{ margin: "6px 0 3px", color: "#153a65", fontSize: 18 }}>Fiyatın piyasadaki konumunu görün.</h3></div><span style={{ padding: "6px 9px", borderRadius: 999, background: intelligence?.regional ? "#eaf8f2" : "#fff4dc", color: intelligence?.regional ? "#087b5e" : "#996100", fontSize: 8.8, fontWeight: 950 }}>{intelligence?.regional ? `Veri güveni ${intelligence.confidence}/100` : "Bölgesel veri bulunamadı"}</span></div>
                        {intelligence?.regional ? <>
                          <div style={{ position: "relative", marginTop: 15, padding: "21px 4px 18px" }}>
                            <div style={{ height: 12, borderRadius: 999, background: "linear-gradient(90deg,#41c995 0%,#62cfc7 28%,#55aee5 50%,#f3b45a 72%,#ea6c4c 100%)", boxShadow: "inset 0 1px 3px rgba(0,0,0,.10)" }} />
                            <div style={{ position: "absolute", left: "50%", top: 13, width: 2, height: 27, background: "#183e5f", opacity: .35 }} /><span style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", top: 41, color: "#6c8295", fontSize: 7.5, fontWeight: 850 }}>VERİ BAZLI DEĞER</span>
                            <div style={{ position: "absolute", left: `${marketPosition}%`, top: 8, transform: "translateX(-50%)" }}><div style={{ width: 16, height: 16, borderRadius: "50%", background: signalTone, border: "3px solid #fff", boxShadow: `0 3px 10px ${signalTone}66` }} /><span style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", top: -17, whiteSpace: "nowrap", color: signalTone, fontSize: 7.5, fontWeight: 950 }}>İLAN FİYATI</span></div>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8, marginTop: 4 }}>{[["Bölge m² ort.",`${Math.round(intelligence.marketM2).toLocaleString("tr-TR")} TL`],["Veri bazlı değer",intelligence.estimatedValue ? `${Math.round(intelligence.estimatedValue).toLocaleString("tr-TR")} TL` : "—"],["Fiyat farkı",diff == null ? "—" : `${diff > 0 ? "+" : ""}${diff.toFixed(1)}%`]].map(([label,value],idx) => <div key={label} style={{ padding: 10, borderRadius: 12, background: "#fff", border: "1px solid #e0e9f2" }}><span style={{ display: "block", color: "#8294a6", fontSize: 8.2, fontWeight: 900 }}>{label.toUpperCase()}</span><strong style={{ display: "block", marginTop: 4, color: idx===2 ? signalTone : "#153a65", fontSize: 13.5 }}>{value}</strong></div>)}</div>
                          <div style={{ marginTop: 9, padding: "10px 11px", borderRadius: 12, background: `${signalTone}0D`, borderLeft: `4px solid ${signalTone}` }}><strong style={{ color: signalTone, fontSize: 10.5 }}>{intelligence.priceSignal}</strong><span style={{ display: "block", marginTop: 3, color: "#587087", fontSize: 9.3, lineHeight: 1.5 }}>{diff == null ? "Fiyat konumu hesaplanamadı." : diff > 0 ? `İlan fiyatı veri bazlı değerin yaklaşık ${Math.abs(diff).toFixed(1)}% üzerinde; fark yaklaşık ${Math.abs(Math.round(valueGap)).toLocaleString("tr-TR")} TL.` : diff < 0 ? `İlan fiyatı veri bazlı değerin yaklaşık ${Math.abs(diff).toFixed(1)}% altında; fiyat avantajı yaklaşık ${Math.abs(Math.round(valueGap)).toLocaleString("tr-TR")} TL.` : "İlan fiyatı veri bazlı değerle aynı seviyede."}</span></div>
                          <p style={{ margin: "9px 0 0", color: "#607890", fontSize: 8.9, lineHeight: 1.5 }}>Kaynak: {intelligence.regional.source || "belirtilmedi"} · dönem {intelligence.regional.periodDate || "—"} · örneklem {intelligence.regional.sampleSize || 0}. Otomatik karar desteğidir; ekspertiz değildir.</p>
                        </> : <p style={{ margin: "10px 0 0", color: "#607890", fontSize: 10, lineHeight: 1.55 }}>Bu konum ve gayrimenkul türü için güvenilir bölgesel m² verisi bulunmadığından Yaşam AI fiyat farkı uydurmuyor. Veri Merkezi güçlendiğinde karşılaştırma otomatik açılacak.</p>}
                      </article>

                      <article style={{ marginTop: 12, padding: 16, borderRadius: 18, background: "#fff", border: "1px solid #e0e9f2" }}><div style={eyebrow}>İLAN AÇIKLAMASI</div><p style={{ margin: "7px 0 0", color: "#405b73", fontSize: 11.5, lineHeight: 1.75, whiteSpace: "pre-wrap" }}>{listing.description || "İlan açıklaması girilmemiş."}</p></article>
                    </div>
                    <aside style={{ display: "grid", gap: 10, alignContent: "start" }}>
                      <article style={{ padding: 15, borderRadius: 18, background: "#fff", border: "1px solid #dce8f2", boxShadow: "0 10px 24px rgba(31,64,97,.06)" }}><div style={eyebrow}>DOĞRULAMA HAZIRLIĞI</div><div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "end", marginTop: 6 }}><strong style={{ color: "#153a65", fontSize: 19 }}>%{intelligence?.completion ?? 0}</strong><span style={{ color: listing.verification_status === "verified" ? "#087b5e" : "#7a5aa5", fontSize: 8.8, fontWeight: 950 }}>{listing.verification_status === "verified" ? "DOĞRULANDI" : listing.verification_status === "pending" ? "İNCELEMEDE" : "TALEP BEKLİYOR"}</span></div><div style={{ height: 8, borderRadius: 999, background: "#e9eff4", overflow: "hidden", marginTop: 8 }}><div style={{ width: `${intelligence?.completion ?? 0}%`, height: "100%", background: "linear-gradient(90deg,#0a8f65,#32c995)" }} /></div><div style={{ display: "grid", gap: 6, marginTop: 10 }}>{intelligence?.verificationChecks.map((check) => <div key={check.label} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "8px 9px", borderRadius: 10, background: check.ok ? "#effaf5" : "#fff8ea", color: "#49637b", fontSize: 9.2 }}><span>{check.label}</span><strong style={{ color: check.ok ? "#087b5e" : "#a26a00" }}>{check.ok ? "Hazır" : "Eksik"}</strong></div>)}</div>{own && listing.verification_status !== "verified" ? <button type="button" disabled={listingVerificationSaving || listing.verification_status === "pending"} onClick={() => void requestListingVerification(listing)} style={{ width: "100%", marginTop: 10, padding: "10px 12px", borderRadius: 11, border: 0, background: listing.verification_status === "pending" ? "#e6ebef" : "linear-gradient(135deg,#ffb452,#f27a2f)", color: listing.verification_status === "pending" ? "#718295" : "#331a05", fontWeight: 950, cursor: listing.verification_status === "pending" ? "default" : "pointer" }}>{listing.verification_status === "pending" ? "Doğrulama İncelemesinde" : listingVerificationSaving ? "Gönderiliyor…" : "Doğrulama Talep Et"}</button> : null}<p style={{ margin: "8px 0 0", color: "#7a8fa3", fontSize: 8.4, lineHeight: 1.45 }}>Doğrulama rozeti ilan sahibi tarafından verilemez. Nihai onay güvenilir doğrulama servisinden gelmelidir.</p></article>
                      <article style={{ padding: 14, borderRadius: 17, background: "linear-gradient(145deg,#f6fbff,#eef8ff)", border: "1px solid #d2e7f5" }}><div style={{ color: "#1769a7", fontSize: 8.5, fontWeight: 950, letterSpacing: 1 }}>İLAN KALİTESİ</div><div style={{ display: "grid", gap: 6, marginTop: 9 }}>{[[images.length >= 6,"6+ fotoğraf","Alıcı güveni"],[(listing.description || "").trim().length >= 80,"Detaylı açıklama","İlan anlatımı"],[Boolean(intelligence?.regional),"Bölgesel veri","Fiyat zekâsı"]].map(([ok,label,text]) => <div key={String(label)} style={{ display: "grid", gridTemplateColumns: "25px 1fr", gap: 7, alignItems: "center" }}><span style={{ display: "grid", placeItems: "center", width: 25, height: 25, borderRadius: 8, background: ok ? "#e6f8f0" : "#fff4dd", color: ok ? "#087b5e" : "#a26a00", fontSize: 10, fontWeight: 950 }}>{ok ? "✓" : "!"}</span><div><strong style={{ display: "block", color: "#31516c", fontSize: 9.3 }}>{label}</strong><span style={{ color: "#8192a3", fontSize: 7.8 }}>{text}</span></div></div>)}</div></article>
                      <article style={{ padding: 15, borderRadius: 18, background: "linear-gradient(145deg,#ffffff,#f7fbff)", border: "1px solid #dfe8ef", boxShadow: "0 10px 24px rgba(31,64,97,.06)" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                            <span style={{ display: "grid", placeItems: "center", width: 42, height: 42, borderRadius: 14, background: "linear-gradient(135deg,#dff6ff,#e7fff5)", color: "#0a6f8e", fontWeight: 950, boxShadow: "inset 0 0 0 1px rgba(8,123,94,.08)" }}>YS</span>
                            <div><div style={{ color: "#71869a", fontSize: 7.5, fontWeight: 900, letterSpacing: .8 }}>İLAN SAHİBİ PROFİLİ</div><strong style={{ display: "block", marginTop: 2, color: "#24445f", fontSize: 11.5 }}>{own ? "Sizin ilanınız" : listing.verification_status === "verified" ? "Doğrulanmış ilan sahibi" : "Yaşam AI kullanıcısı"}</strong><span style={{ display: "block", marginTop: 2, color: "#8798a7", fontSize: 7.5 }}>Güvenli iletişim · kişisel iletişim bilgileri gizli</span></div>
                          </div>
                          <span style={{ padding: "6px 8px", borderRadius: 999, background: listing.verification_status === "verified" ? "#e8f8f1" : "#fff6e5", color: listing.verification_status === "verified" ? "#087b5e" : "#9a6700", fontSize: 7.4, fontWeight: 950 }}>{listing.verification_status === "verified" ? "✓ DOĞRULANMIŞ" : "DOĞRULAMA AÇIK"}</span>
                        </div>
                        {(() => { const sellerListings = liveListings.filter((entry) => entry.user_id === listing.user_id && entry.status === "published"); const verifiedSellerListings = sellerListings.filter((entry) => entry.verification_status === "verified").length; return <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 6, marginTop: 10 }}><div style={{ padding: 8, borderRadius: 11, background: "#f5faff", border: "1px solid #e1ebf3" }}><span style={{ display: "block", color: "#8294a5", fontSize: 7 }}>AKTİF İLAN</span><strong style={{ display: "block", marginTop: 3, color: "#24445f", fontSize: 13 }}>{sellerListings.length}</strong></div><div style={{ padding: 8, borderRadius: 11, background: "#f3fbf7", border: "1px solid #dceee4" }}><span style={{ display: "block", color: "#8294a5", fontSize: 7 }}>DOĞRULANMIŞ</span><strong style={{ display: "block", marginTop: 3, color: "#087b5e", fontSize: 13 }}>{verifiedSellerListings}</strong></div><div style={{ padding: 8, borderRadius: 11, background: "#fff9ed", border: "1px solid #f2e5c7" }}><span style={{ display: "block", color: "#8294a5", fontSize: 7 }}>PROFİL GÜVENİ</span><strong style={{ display: "block", marginTop: 3, color: "#9a6700", fontSize: 11 }}>{listing.verification_status === "verified" ? "Güçlü" : sellerListings.length >= 2 ? "Gelişiyor" : "Yeni"}</strong></div></div> })()}
                        {!own ? <div style={{ marginTop: 10 }}><textarea value={listingInquiryMessage} onChange={(event) => setListingInquiryMessage(event.target.value)} placeholder="Merhaba, ilanınızla ilgileniyorum. Uygun olduğunuzda detayları görüşebilir miyiz?" style={{ width: "100%", minHeight: 72, resize: "vertical", padding: 10, borderRadius: 11, border: "1px solid #d5e1eb", background: "#fbfdff", color: "#294b67", fontSize: 9, lineHeight: 1.45 }} /><button type="button" disabled={listingInquirySending} onClick={() => void sendListingInquiry(listing)} style={{ width: "100%", marginTop: 7, padding: "10px 11px", borderRadius: 11, border: 0, background: "linear-gradient(135deg,#0e9f79,#087b5e)", color: "#fff", fontWeight: 950, cursor: "pointer" }}>{listingInquirySending ? "Gönderiliyor…" : "Güvenli Mesaj Gönder"}</button><span style={{ display: "block", marginTop: 6, color: "#8a9aaa", fontSize: 7.4, lineHeight: 1.4 }}>Telefon/e-posta paylaşılmadan mesaj ilan sahibine iletilir.</span></div> : null}
                      </article>
                    </aside>
                  </div>
                  {own ? <section style={{ marginTop: 14, padding: 16, borderRadius: 19, background: "linear-gradient(145deg,#071f36,#0b4f73)", color: "#fff", boxShadow: "0 14px 32px rgba(7,49,79,.16)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "start", flexWrap: "wrap" }}><div><div style={{ color: "#73e7ff", fontSize: 8.2, fontWeight: 950, letterSpacing: 1 }}>İLAN PERFORMANS MERKEZİ</div><h3 style={{ margin: "5px 0 3px", fontSize: 18 }}>İlanınız ne kadar ilgi görüyor?</h3><p style={{ margin: 0, color: "rgba(255,255,255,.62)", fontSize: 8.5 }}>Tekil ziyaretçi, toplam görüntülenme, favori ve mesaj sinyallerini tek yerde izleyin.</p></div><span style={{ padding: "6px 8px", borderRadius: 999, background: listingAnalyticsReady === false ? "rgba(255,184,91,.12)" : "rgba(82,229,175,.12)", color: listingAnalyticsReady === false ? "#ffd083" : "#87f1cb", fontSize: 7.3, fontWeight: 950 }}>{listingAnalyticsReady === false ? "SQL GEREKLİ" : listingOwnerStatsLoading ? "GÜNCELLENİYOR" : "CANLI"}</span></div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", gap: 7, marginTop: 12 }}>
                      {[['Tekil ziyaretçi',listingOwnerStats.uniqueViewers,'◉'],['Görüntülenme',listingOwnerStats.totalViews,'↻'],['Favori',listingOwnerStats.favorites,'★'],['Mesaj',listingOwnerStats.inquiries,'✉'],['Yeni mesaj',listingOwnerStats.unreadInquiries,'●']].map(([label,value,icon]) => <div key={String(label)} style={{ padding: 10, borderRadius: 12, background: "rgba(255,255,255,.07)", border: "1px solid rgba(255,255,255,.10)" }}><span style={{ color: "#7ee7ff", fontSize: 11 }}>{icon}</span><strong style={{ display: "block", marginTop: 4, fontSize: 18 }}>{String(value)}</strong><span style={{ display: "block", marginTop: 2, color: "rgba(255,255,255,.55)", fontSize: 7.2 }}>{label}</span></div>)}
                    </div>
                    {(() => { const views=Math.max(1,listingOwnerStats.uniqueViewers); const favoriteRate=Math.round((listingOwnerStats.favorites/views)*100); const inquiryRate=Math.round((listingOwnerStats.inquiries/views)*100); const interestScore=Math.max(0,Math.min(100,Math.round(favoriteRate*.55+inquiryRate*.9+Math.min(30,listingOwnerStats.totalViews/Math.max(1,views)*8)))); const label=interestScore>=70?'Yüksek ilgi':interestScore>=40?'Gelişen ilgi':listingOwnerStats.uniqueViewers?'Düşük ilgi':'Veri bekleniyor'; return <div style={{ marginTop: 9, padding: 10, borderRadius: 12, background: "rgba(255,255,255,.055)", display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10, alignItems: "center" }}><div style={{ width: 42, height: 42, borderRadius: 14, display: "grid", placeItems: "center", background: "rgba(91,221,255,.13)", color: "#7de8ff", fontWeight: 950 }}>{interestScore}</div><div><strong style={{ fontSize: 9.5 }}>AI İlgi Skoru · {label}</strong><span style={{ display: "block", marginTop: 3, color: "rgba(255,255,255,.55)", fontSize: 7.3 }}>Favoriye dönüşüm %{favoriteRate} · Mesaja dönüşüm %{inquiryRate}. Tekil ziyaretçi bazlı yardımcı performans göstergesidir.</span></div><button type="button" onClick={() => void loadListingOwnerStats(listing.id)} style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid rgba(255,255,255,.14)", background: "rgba(255,255,255,.06)", color: "#fff", fontSize: 7.6, fontWeight: 900, cursor: "pointer" }}>Yenile</button></div> })()}
                    {listingAnalyticsReady === false ? <div style={{ marginTop: 8, padding: 9, borderRadius: 10, background: "rgba(255,180,70,.10)", color: "#ffd18a", fontSize: 7.7 }}>İlan görüntülenme analitiği için FAZ 2 v5 analytics SQL dosyasını Supabase'de çalıştırın.</div> : null}
                  </section> : null}

                  {selectedSimilarListings.length ? <section style={{ marginTop: 16 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "end", flexWrap: "wrap" }}><div><div style={{ color: "#1769a7", fontSize: 8.5, fontWeight: 950, letterSpacing: 1 }}>BENZER İLANLAR</div><h3 style={{ margin: "5px 0 0", color: "#24445f", fontSize: 18 }}>Karar vermeden alternatifleri görün.</h3></div><span style={{ color: "#8294a5", fontSize: 8.5 }}>Konum, tür, işlem ve fiyat yakınlığına göre</span></div><div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 9, marginTop: 10 }}>{selectedSimilarListings.map((item) => { const cover = listingImageUrl((item.media || [])[0]); const itemLocation=[item.city,item.district,item.neighborhood].filter(Boolean).join(" / "); return <button key={item.id} type="button" onClick={() => { setSelectedListingImageIndex(0); setSelectedListingId(item.id); setListingBuyerAiResult(""); setListingInquiryMessage(""); }} style={{ padding: 0, overflow: "hidden", borderRadius: 16, border: "1px solid #dce7ef", background: "#fff", textAlign: "left", cursor: "pointer", boxShadow: "0 8px 20px rgba(31,64,97,.05)" }}><div style={{ height: 105, background: cover ? `url(${cover}) center/cover` : "linear-gradient(135deg,#e8f6fc,#dbeef7)", display: "grid", placeItems: "center", color: "#5d7c92", fontSize: 22 }}>{cover ? null : "⌂"}</div><div style={{ padding: 11 }}><strong style={{ display: "block", color: "#24445f", fontSize: 10.5, lineHeight: 1.35 }}>{item.title}</strong><span style={{ display: "block", marginTop: 4, color: "#8294a5", fontSize: 7.8 }}>{itemLocation}</span><strong style={{ display: "block", marginTop: 7, color: "#0a6797", fontSize: 12 }}>{Math.round(Number(item.price || 0)).toLocaleString("tr-TR")} TL</strong></div></button>})}</div></section> : null}
                </div>
              </article>
            </div>;
          })() : null}
        </section>
      ) : null}

      {section === "enterprise" ? (
        <>
          <article style={{ padding: "16px 18px", borderRadius: 21, border: "1px solid #d8e5f0", background: "linear-gradient(145deg,#ffffff,#f7fbff)", boxShadow: "0 12px 32px rgba(31,64,97,.07)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
              <div><div style={eyebrow}>AKTİF ÇALIŞMA ALANI</div><h2 style={{ margin: "6px 0 3px", color: "#153a65", fontSize: 23 }}>{enterpriseRole === "bank" ? "Banka Operasyon Merkezi" : enterpriseRole === "developer" ? "Müteahhit ve Proje Merkezi" : enterpriseRole === "investor" ? "Yatırımcı ve Portföy Merkezi" : enterpriseRole === "valuation" ? "Değerleme Merkezi" : enterpriseRole === "agency" ? "Emlak Ofisi Merkezi" : "Mimar ve Mühendis Merkezi"}</h2><p style={{ margin: 0, color: "#74899e", fontSize: 11 }}>Sadece seçili çalışma alanı gösterilir. Ortak navigasyon ve AI katmanı tüm modüllerde korunur.</p></div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {([['bank','Banka'],['developer','Müteahhit'],['investor','Yatırımcı'],['valuation','Değerleme'],['agency','Emlak Ofisi'],['technical','Mimar & Mühendis']] as const).map(([id,label]) => {
                  const active = enterpriseRole === id;
                  const accent = id === "bank" ? "#0b5fa5" : id === "developer" ? "#a56609" : id === "agency" ? "#9b2c67" : id === "investor" ? "#0f8065" : id === "valuation" ? "#6b46c1" : "#285c86";
                  return <button key={id} type="button" onClick={() => { setEnterpriseRole(id); setEnterpriseNotice(""); }} style={{ padding: "10px 13px", borderRadius: 12, border: active ? `1px solid ${accent}` : "1px solid #d7e4f0", background: active ? `${accent}12` : "#fff", color: active ? accent : "#607890", fontSize: 10, fontWeight: 950, cursor: "pointer", boxShadow: active ? `0 8px 18px ${accent}18` : "none", transition: "all .2s ease" }}>{label}</button>
                })}
              </div>
            </div>
          </article>
          {enterpriseNotice ? <div style={{ ...locationInfoBox, marginTop: 12 }}>{enterpriseNotice}</div> : null}

          {(["bank", "developer", "agency"] as const).includes(enterpriseRole as "bank" | "developer" | "agency") ? (() => {
            const roleDesign = enterpriseRole === "bank" ? {
              eyebrow: "FİNANSAL KURUMLAR İÇİN GÜVENLİ KARAR ALANI",
              title: "Banka Gayrimenkul Karar Merkezi",
              description: "Teminat kalitesi, LTV, likidite, bölgesel risk ve insan onayı akışını sade ve denetlenebilir bir ekranda birleştirir.",
              accent: "#0b5fa5", dark: "#061c31", soft: "#eef7ff", icon: "🏦",
              metrics: [["İnceleme kuyruğu","24 dosya","3 kritik"],["Ortalama karar süresi","2,1 dk","-%21"],["Teminat güveni","89/100","Güçlü"]],
              actions: [["Kredi dosyalarını aç","İnsan onayı bekleyen dosyaları önceliklendir"],["Teminat analizini başlat","Likidite ve bölgesel riski birlikte değerlendir"],["Yönetici raporu oluştur","Kurul sunumuna hazır özet üret"]]
            } : enterpriseRole === "developer" ? {
              eyebrow: "MÜTEAHHİTLER İÇİN PROJE KOMUTA MERKEZİ",
              title: "Müteahhit ve Proje Yönetim Merkezi",
              description: "Fizibilite, maliyet, saha ilerlemesi, satış, nakit akışı ve kritik görevleri aynı proje dili içinde yönetir.",
              accent: "#a56609", dark: "#2b1b06", soft: "#fff8eb", icon: "🏗️",
              metrics: [["Aktif proje","3 proje","1 dikkat"],["Toplam proje değeri","₺84,0 Mn","+%18,6"],["Kritik görev","2 görev","Bugün"]],
              actions: [["Fizibiliteyi aç","Maliyet, satış ve kârlılık senaryolarını karşılaştır"],["Saha durumunu incele","Geciken işleri ve bağımlılıkları görüntüle"],["Satış planını yönet","Stok, fiyat ve tahsilat akışını takip et"]]
            } : {
              eyebrow: "EMLAK OFİSLERİ İÇİN SATIŞ VE PORTFÖY MERKEZİ",
              title: "Emlak Ofisi Akıllı Operasyon Merkezi",
              description: "Portföy, müşteri, ilan kalitesi, fiyat doğruluğu ve satış fırsatlarını tek bir modern CRM görünümünde toplar.",
              accent: "#9b2c67", dark: "#2b0b20", soft: "#fff2f8", icon: "🏠",
              metrics: [["Aktif portföy","48 ilan","7 yeni"],["Sıcak müşteri","16 kişi","5 öncelikli"],["Fiyat doğruluğu","92/100","Çok iyi"]],
              actions: [["Portföy merkezini aç","İlanları kalite, fiyat ve talebe göre sırala"],["Müşteri eşleştir","Alıcı ihtiyaçlarıyla en uygun portföyleri eşleştir"],["İlan kalitesini yükselt","Başlık, açıklama ve fiyat önerisi oluştur"]]
            };
            return <section style={{ marginTop: 16 }}>
              <article style={{ position: "relative", overflow: "hidden", padding: 24, borderRadius: 26, background: `radial-gradient(circle at 90% 10%, ${roleDesign.accent}55, transparent 28%), linear-gradient(145deg,${roleDesign.dark},${roleDesign.accent})`, color: "#fff", boxShadow: `0 24px 58px ${roleDesign.accent}33` }}>
                <div style={{ position: "absolute", inset: 0, backgroundImage: "linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px)", backgroundSize: "34px 34px", maskImage: "linear-gradient(to bottom,black,transparent 80%)" }} />
                <div style={{ position: "relative", display: "grid", gridTemplateColumns: "minmax(0,1.25fr) minmax(280px,.75fr)", gap: 20, alignItems: "end" }}>
                  <div><div style={{ color: "rgba(255,255,255,.68)", fontSize: 10, fontWeight: 950, letterSpacing: 1.5 }}>{roleDesign.eyebrow}</div><div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}><span style={{ display: "grid", placeItems: "center", width: 46, height: 46, borderRadius: 15, background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.18)", fontSize: 24 }}>{roleDesign.icon}</span><h3 style={{ margin: 0, fontSize: 29, letterSpacing: "-.5px" }}>{roleDesign.title}</h3></div><p style={{ margin: "12px 0 0", maxWidth: 760, color: "rgba(255,255,255,.76)", fontSize: 12, lineHeight: 1.7 }}>{roleDesign.description}</p></div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }}>{roleDesign.metrics.map(([label,value,badge]) => <div key={label} style={{ padding: 12, borderRadius: 15, background: "rgba(255,255,255,.09)", border: "1px solid rgba(255,255,255,.12)", backdropFilter: "blur(10px)" }}><span style={{ display: "block", color: "rgba(255,255,255,.6)", fontSize: 8, fontWeight: 900 }}>{label.toUpperCase()}</span><strong style={{ display: "block", marginTop: 6, fontSize: 17 }}>{value}</strong><span style={{ display: "block", marginTop: 3, color: "rgba(255,255,255,.72)", fontSize: 9 }}>{badge}</span></div>)}</div>
                </div>
              </article>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10, marginTop: 11 }}>{roleDesign.actions.map(([title,text],index) => <button key={title} type="button" onClick={() => setEnterpriseNotice(`${title} çalışma alanı hazırlandı.`)} style={{ padding: 16, borderRadius: 18, border: `1px solid ${roleDesign.accent}22`, background: `linear-gradient(145deg,#fff,${roleDesign.soft})`, textAlign: "left", cursor: "pointer", boxShadow: "0 10px 24px rgba(31,64,97,.05)" }}><span style={{ display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: 10, background: `${roleDesign.accent}14`, color: roleDesign.accent, fontSize: 11, fontWeight: 950 }}>{String(index + 1).padStart(2,"0")}</span><strong style={{ display: "block", marginTop: 10, color: roleDesign.dark, fontSize: 12 }}>{title}</strong><span style={{ display: "block", marginTop: 5, color: "#74899e", fontSize: 10, lineHeight: 1.5 }}>{text}</span><span style={{ display: "block", marginTop: 9, color: roleDesign.accent, fontSize: 10, fontWeight: 950 }}>Çalışma alanını aç →</span></button>)}</div>
            </section>
          })() : null}

          {enterpriseRole === "bank" ? (
            <section style={{ marginTop: 16 }}>
              <article style={{ padding: 22, borderRadius: 24, background: "linear-gradient(145deg,#071d34,#0a4678)", color: "#fff", boxShadow: "0 22px 52px rgba(7,39,69,.22)", overflow: "hidden", position: "relative" }}>
                <div style={{ position: "absolute", width: 260, height: 260, borderRadius: "50%", right: -105, top: -120, border: "1px solid rgba(255,255,255,.10)" }} />
                <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "start", gap: 18, flexWrap: "wrap" }}>
                  <div><div style={{ color: "#93d8ff", fontSize: 10, fontWeight: 950, letterSpacing: 1.6 }}>BANKA OPERASYON VE KREDİ KARAR MERKEZİ</div><h3 style={{ margin: "8px 0 5px", fontSize: 27 }}>Teminat, risk ve kredi kararını tek ekranda yönetin.</h3><p style={{ margin: 0, maxWidth: 760, color: "rgba(255,255,255,.72)", fontSize: 12, lineHeight: 1.65 }}>Bu ekran, karar destek prototipidir. Nihai kredi kararı kurum politikaları, yetkili ekspertiz, mevzuat ve insan onayıyla verilmelidir.</p></div>
                  <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>{([['balanced','Dengeli'],['conservative','Temkinli'],['growth','Büyüme']] as const).map(([id,label]) => <button key={id} type="button" onClick={() => setBankScenario(id)} style={{ padding: "9px 12px", borderRadius: 11, border: bankScenario === id ? "1px solid #8ed8ff" : "1px solid rgba(255,255,255,.15)", background: bankScenario === id ? "rgba(36,169,245,.22)" : "rgba(255,255,255,.06)", color: "#fff", fontWeight: 900, cursor: "pointer" }}>{label}</button>)}</div>
                </div>
              </article>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginTop: 12 }}>
                {[
                  ["İncelenen portföy", "₺2,84 Mr", "Toplam teminat görünümü", "+%6,2"],
                  ["Ortalama LTV", bankScenario === "conservative" ? "%48" : bankScenario === "growth" ? "%67" : "%58", "Kredi / teminat oranı", "Politika içi"],
                  ["Teminat güveni", bankScenario === "growth" ? "82/100" : "89/100", "Veri ve likidite bileşimi", "Güçlü"],
                  ["Kritik dosya", bankScenario === "conservative" ? "2" : "3", "Yönetici kontrolü bekliyor", "Öncelikli"],
                  ["Karar süresi", "2,1 dk", "AI destekli ön değerlendirme", "-%21"],
                ].map(([title,value,text,badge],i) => <article key={title} className="enterprise-kpi" style={{ padding: 16, borderRadius: 18, border: i === 3 ? "1px solid #f3c9c9" : "1px solid #dce8f3", background: i === 3 ? "linear-gradient(145deg,#fff8f8,#fff)" : "linear-gradient(145deg,#fff,#f6fbff)", boxShadow: "0 9px 24px rgba(31,64,97,.06)" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span style={{ color: "#74899e", fontSize: 9, fontWeight: 950 }}>{title.toUpperCase()}</span><span style={{ padding: "4px 7px", borderRadius: 999, background: i === 3 ? "#fff0f0" : "#e9f5ff", color: i === 3 ? "#b42318" : "#0876c9", fontSize: 9, fontWeight: 950 }}>{badge}</span></div><strong style={{ display: "block", marginTop: 7, color: i === 3 ? "#b42318" : "#153a65", fontSize: 23 }}>{value}</strong><span style={{ display: "block", marginTop: 4, color: "#91a2b2", fontSize: 10 }}>{text}</span></article>)}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.15fr) minmax(300px,.85fr)", gap: 13, marginTop: 13 }}>
                <article style={{ ...qualityRuleStyle, padding: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}><div><div style={eyebrow}>AI KREDİ KARAR MOTORU</div><h3 style={{ margin: "6px 0 3px", color: "#153a65" }}>Örnek dosya · Adana / Ceyhan</h3><p style={{ margin: 0, color: "#74899e", fontSize: 11 }}>Konut teminatı · Doğrulanabilir karar bileşenleri</p></div><span style={{ padding: "7px 10px", borderRadius: 999, background: "#eaf8f1", color: "#087b55", fontSize: 10, fontWeight: 950 }}>ÖN ONAY ADAYI</span></div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(135px,1fr))", gap: 9, marginTop: 15 }}>{[["Kredi uygunluğu",bankScenario === "growth" ? "84/100" : "91/100"],["Likidite","88/100"],["Bölgesel risk","Düşük-Orta"],["Önerilen LTV",bankScenario === "conservative" ? "%45" : bankScenario === "growth" ? "%65" : "%55"]].map(([a,b]) => <div key={a} style={{ padding: 12, borderRadius: 14, background: "#f7fbff", border: "1px solid #dce8f3" }}><span style={{ display: "block", color: "#74899e", fontSize: 9, fontWeight: 850 }}>{a.toUpperCase()}</span><strong style={{ display: "block", marginTop: 5, color: "#0876c9", fontSize: 18 }}>{b}</strong></div>)}</div>
                  <div style={{ marginTop: 13, padding: 14, borderRadius: 15, background: "linear-gradient(90deg,#f5fbff,#eef8ff)", border: "1px solid #cbe5f8", color: "#35536e", fontSize: 11, lineHeight: 1.65 }}><strong style={{ color: "#153a65" }}>Açıklanabilir karar:</strong> Teminat değeri, bölgesel satış hızı ve veri güveni olumlu. Kredi oranı belirlenirken gelir doğrulaması, hukuki takyidat ve yetkili ekspertiz sonucu ayrıca kontrol edilmelidir.</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}><button type="button" onClick={() => setEnterpriseNotice("Banka yönetici özeti hazırlandı. Canlı PDF bağlantısı sonraki entegrasyon katmanında açılacaktır.")} style={{ padding: "10px 13px", borderRadius: 11, border: 0, background: "#0876c9", color: "#fff", fontWeight: 900, cursor: "pointer" }}>Yönetici Özeti</button><button type="button" onClick={() => setEnterpriseNotice("Dosya insan onayı kuyruğuna alındı. Bu prototip herhangi bir gerçek kredi kararı vermez.")} style={{ padding: "10px 13px", borderRadius: 11, border: "1px solid #cbdbe9", background: "#fff", color: "#35536e", fontWeight: 900, cursor: "pointer" }}>İnsan Onayına Gönder</button></div>
                </article>

                <article style={{ ...qualityRuleStyle, padding: 20 }}>
                  <div style={eyebrow}>RİSK DAĞILIMI</div><h3 style={{ margin: "6px 0 3px", color: "#153a65" }}>Teminat portföyü görünümü</h3>
                  <div style={{ height: 16, display: "flex", overflow: "hidden", borderRadius: 999, marginTop: 18, background: "#edf2f7" }}><div style={{ width: "56%", background: "#2bb673" }} /><div style={{ width: "31%", background: "#f4b740" }} /><div style={{ width: "13%", background: "#dd5b5b" }} /></div>
                  <div style={{ display: "grid", gap: 8, marginTop: 14 }}>{[["Düşük risk","%56","#2bb673"],["Orta risk","%31","#d89614"],["Yüksek risk","%13","#c94242"]].map(([a,b,c]) => <div key={a} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: 10, borderRadius: 12, background: "#f8fbfe" }}><span style={{ color: "#607890", fontSize: 11 }}><i style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: c, marginRight: 7 }} />{a}</span><strong style={{ color: c, fontSize: 12 }}>{b}</strong></div>)}</div>
                  <div style={{ marginTop: 14, padding: 12, borderRadius: 14, background: "#fff8e8", border: "1px solid #f3d28f", color: "#7b5a14", fontSize: 10, lineHeight: 1.5 }}>⚠ Üç dosyada belge eksikliği veya likidite sapması nedeniyle ikinci kontrol öneriliyor.</div>
                </article>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.15fr) minmax(300px,.85fr)", gap: 13, marginTop: 13 }}>
                <article style={{ ...qualityRuleStyle, padding: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}><div><div style={eyebrow}>KREDİ DOSYASI KUYRUĞU</div><h3 style={{ margin: "6px 0 0", color: "#153a65" }}>Öncelikli değerlendirme listesi</h3></div><div style={{ display: "flex", gap: 6 }}>{([['all','Tümü'],['urgent','Kritik'],['review','Kontrol']] as const).map(([id,label]) => <button key={id} type="button" onClick={() => setBankQueueFilter(id)} style={{ padding: "7px 9px", borderRadius: 9, border: bankQueueFilter === id ? "1px solid #0876c9" : "1px solid #dce8f3", background: bankQueueFilter === id ? "#eaf6ff" : "#fff", color: bankQueueFilter === id ? "#0876c9" : "#607890", fontWeight: 900, cursor: "pointer", fontSize: 10 }}>{label}</button>)}</div></div>
                  <div style={{ overflowX: "auto", marginTop: 13 }}><table style={tableStyle}><thead><tr><th style={thStyle}>Dosya</th><th style={thStyle}>Teminat</th><th style={thStyle}>LTV</th><th style={thStyle}>Risk</th><th style={thStyle}>Durum</th></tr></thead><tbody>{[
                    ["BK-2026-1842","₺8.450.000","%54","Düşük","Ön onay"],
                    ["BK-2026-1837","₺5.280.000","%63","Orta","İkinci kontrol"],
                    ["BK-2026-1829","₺12.900.000","%71","Yüksek","Yönetici onayı"],
                    ["BK-2026-1815","₺3.750.000","%49","Düşük","Ekspertiz bekliyor"],
                  ].filter(row => bankQueueFilter === "all" || (bankQueueFilter === "urgent" ? row[3] === "Yüksek" : row[4].includes("kontrol") || row[4].includes("bekliyor"))).map(row => <tr key={row[0]}>{row.map((cell,i) => <td key={cell} style={{ ...tdStyle, color: i === 3 ? (cell === "Yüksek" ? "#b42318" : cell === "Orta" ? "#9a6700" : "#087b55") : tdStyle.color, fontWeight: i === 0 || i === 3 ? 850 : 650 }}>{cell}</td>)}</tr>)}</tbody></table></div>
                </article>

                <article style={{ padding: 20, borderRadius: 22, background: "linear-gradient(145deg,#fff,#f6fbff)", border: "1px solid #dce8f3", boxShadow: "0 10px 28px rgba(31,64,97,.06)" }}>
                  <div style={eyebrow}>AI UYARI MERKEZİ</div><h3 style={{ margin: "6px 0 12px", color: "#153a65" }}>Bugünün kritik sinyalleri</h3>
                  <div style={{ display: "grid", gap: 9 }}>{[["Likidite sapması","Adana portföyünde iki teminatın satış süresi yükseldi.","Orta"],["Belge kontrolü","Bir dosyada güncel takyidat belgesi bekleniyor.","Yüksek"],["Değer güncellemesi","Üç teminat için 90 günlük yeniden değerleme zamanı geldi.","Planlı"]].map(([title,text,level],i) => <div key={title} style={{ padding: 12, borderRadius: 14, border: i === 1 ? "1px solid #f1c6c6" : "1px solid #dce8f3", background: i === 1 ? "#fff8f8" : "#fff" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong style={{ color: "#153a65", fontSize: 11 }}>{title}</strong><span style={{ color: i === 1 ? "#b42318" : "#0876c9", fontSize: 9, fontWeight: 950 }}>{level}</span></div><p style={{ margin: "5px 0 0", color: "#74899e", fontSize: 10, lineHeight: 1.45 }}>{text}</p></div>)}</div>
                </article>
              </div>
            </section>
          ) : null}



          {enterpriseRole === "developer" ? (
            <section style={{ marginTop: 16 }}>
              <article style={{ padding: 23, borderRadius: 25, color: "#fff", background: "radial-gradient(circle at 88% 12%,rgba(255,197,91,.22),transparent 29%),linear-gradient(150deg,#162b3f,#684615)", boxShadow: "0 24px 58px rgba(65,44,18,.22)", overflow: "hidden", position: "relative" }}>
                <div style={{ position: "absolute", width: 300, height: 300, borderRadius: "50%", right: -120, top: -150, border: "1px solid rgba(255,255,255,.12)" }} />
                <div style={{ position: "relative", display: "flex", justifyContent: "space-between", gap: 18, alignItems: "start", flexWrap: "wrap" }}>
                  <div><div style={{ color: "#ffd98b", fontSize: 10, fontWeight: 950, letterSpacing: 1.55 }}>MÜTEAHHİT VE PROJE YÖNETİM MERKEZİ</div><h3 style={{ margin: "8px 0 5px", fontSize: 28 }}>Arsadan teslime tüm projeyi tek merkezden yönetin.</h3><p style={{ margin: 0, maxWidth: 760, color: "rgba(255,255,255,.74)", fontSize: 12, lineHeight: 1.68 }}>Fizibilite, bütçe, saha ilerlemesi, satış, ekip ve doküman akışlarını açıklanabilir AI karar desteğiyle birlikte izleyin.</p></div>
                  <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>{([['elysium','Elysium Loft'],['nova','Nova Loft'],['vera','Vera Loft']] as const).map(([id,label]) => <button key={id} type="button" onClick={() => setDeveloperProject(id)} style={{ padding: "9px 12px", borderRadius: 11, border: developerProject === id ? "1px solid #ffd98b" : "1px solid rgba(255,255,255,.16)", background: developerProject === id ? "rgba(255,194,74,.18)" : "rgba(255,255,255,.06)", color: "#fff", fontWeight: 900, cursor: "pointer" }}>{label}</button>)}</div>
                </div>
              </article>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginTop: 12 }}>
                {(() => {
                  const project = developerProject === "elysium" ? { progress:"%64", value:"₺51,5 Mn", budget:"₺12,5 Mn", sales:"9 / 12", margin:"%34" } : developerProject === "nova" ? { progress:"%58", value:"₺22,5 Mn", budget:"₺9,8 Mn", sales:"5,5 / 8", margin:"%29" } : { progress:"%12", value:"₺46,0 Mn", budget:"₺3,2 Mn", sales:"0 / 15", margin:"%31" };
                  return [["Proje ilerlemesi",project.progress,"Plan / gerçekleşen","Takvimde"],["Tahmini proje değeri",project.value,"Satış değeri görünümü","Güncel"],["Gerçekleşen harcama",project.budget,"Onaylı maliyet kayıtları","Kontrollü"],["Satılabilir stok",project.sales,"Bağımsız bölüm görünümü","Canlı"],["Brüt marj",project.margin,"Senaryo bazlı tahmin","Güçlü"]].map(([title,value,text,badge],i) => <article key={title} style={{ padding: 16, borderRadius: 18, border: i === 4 ? "1px solid #cce5d8" : "1px solid #eadfca", background: i === 4 ? "linear-gradient(145deg,#effbf5,#fff)" : "linear-gradient(145deg,#fff,#fffbf3)", boxShadow: "0 9px 24px rgba(86,62,24,.06)" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span style={{ color: "#85765d", fontSize: 9, fontWeight: 950 }}>{title.toUpperCase()}</span><span style={{ padding: "4px 7px", borderRadius: 999, background: i === 4 ? "#def7e9" : "#fff1d6", color: i === 4 ? "#047857" : "#9a6700", fontSize: 9, fontWeight: 950 }}>{badge}</span></div><strong style={{ display: "block", marginTop: 7, color: i === 4 ? "#047857" : "#5c4217", fontSize: 23 }}>{value}</strong><span style={{ display: "block", marginTop: 4, color: "#9a8d78", fontSize: 10 }}>{text}</span></article>);
                })()}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(310px,.8fr)", gap: 13, marginTop: 13 }}>
                <article style={{ ...qualityRuleStyle, padding: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}><div><div style={{ ...eyebrow, color: "#a66a0a" }}>AI FİZİBİLİTE VE SENARYO MOTORU</div><h3 style={{ margin: "6px 0 3px", color: "#153a65" }}>Arsa, maliyet ve satış dengesi</h3><p style={{ margin: 0, color: "#74899e", fontSize: 11 }}>Karar destek modeli · Resmî proje ve mali müşavir kontrolü gerektirir</p></div><div style={{ display: "flex", gap: 6 }}>{([['base','Baz'],['cost','Maliyet +%12'],['sales','Satış -%8']] as const).map(([id,label]) => <button key={id} type="button" onClick={() => setDeveloperScenario(id)} style={{ padding: "7px 9px", borderRadius: 9, border: developerScenario === id ? "1px solid #b7791f" : "1px solid #e5dccd", background: developerScenario === id ? "#fff5df" : "#fff", color: developerScenario === id ? "#9a6700" : "#607890", fontWeight: 900, cursor: "pointer", fontSize: 10 }}>{label}</button>)}</div></div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(135px,1fr))", gap: 9, marginTop: 15 }}>{[
                    ["Satılabilir alan","1.845 m²"],["Toplam maliyet",developerScenario === "cost" ? "₺40,3 Mn" : "₺36,0 Mn"],["Tahmini ciro",developerScenario === "sales" ? "₺50,2 Mn" : "₺54,6 Mn"],["Brüt kâr",developerScenario === "cost" ? "₺14,3 Mn" : developerScenario === "sales" ? "₺14,2 Mn" : "₺18,6 Mn"],["Geri dönüş",developerScenario === "base" ? "18 ay" : "22 ay"]
                  ].map(([a,b]) => <div key={a} style={{ padding: 12, borderRadius: 14, background: "#fffbf3", border: "1px solid #eadfca" }}><span style={{ display: "block", color: "#85765d", fontSize: 9, fontWeight: 850 }}>{a.toUpperCase()}</span><strong style={{ display: "block", marginTop: 5, color: "#9a6700", fontSize: 18 }}>{b}</strong></div>)}</div>
                  <div style={{ marginTop: 13, padding: 14, borderRadius: 15, background: "linear-gradient(90deg,#fffaf0,#fff5df)", border: "1px solid #efd59d", color: "#6d582e", fontSize: 11, lineHeight: 1.65 }}><strong style={{ color: "#5c4217" }}>AI yorumu:</strong> Baz senaryoda proje güçlü aday görünümünde. Maliyet artışı ve satış yavaşlaması birlikte gerçekleşirse nakit tamponu artırılmalı, kritik satın almalar sabit fiyatlı sözleşmelerle korunmalıdır.</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}><button type="button" onClick={() => setEnterpriseNotice("Proje fizibilite yönetici özeti hazırlandı. Profesyonel PDF entegrasyonunda rapora dönüştürülecektir.")} style={{ padding: "10px 13px", borderRadius: 11, border: 0, background: "#a66a0a", color: "#fff", fontWeight: 900, cursor: "pointer" }}>Fizibilite Özeti</button><button type="button" onClick={() => setEnterpriseNotice("Seçili senaryo yönetici karar kuyruğuna eklendi.")} style={{ padding: "10px 13px", borderRadius: 11, border: "1px solid #dfcfb3", background: "#fff", color: "#6d582e", fontWeight: 900, cursor: "pointer" }}>Karar Kuyruğuna Ekle</button></div>
                </article>

                <article style={{ ...qualityRuleStyle, padding: 20 }}>
                  <div style={eyebrow}>FİNANS VE NAKİT AKIŞI</div><h3 style={{ margin: "6px 0 3px", color: "#153a65" }}>Bütçe kontrol görünümü</h3>
                  <div style={{ marginTop: 16, height: 128, display: "flex", alignItems: "end", gap: 8 }}>{[38,51,44,62,57,76,69,88,82,96].map((h,i) => <div key={i} style={{ flex: 1, height: `${h}%`, borderRadius: "7px 7px 3px 3px", background: i > 6 ? "linear-gradient(180deg,#e2a938,#9a6700)" : "linear-gradient(180deg,#f6d994,#d3a545)" }} />)}</div>
                  <div style={{ display: "grid", gap: 8, marginTop: 14 }}>{[["Planlanan maliyet","₺36,0 Mn"],["Gerçekleşen","₺12,5 Mn"],["Kalan finansman","₺23,5 Mn"],["Nakit tamponu","4,2 ay"]].map(([a,b],i) => <div key={a} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: 10, borderRadius: 12, background: i === 3 ? "#effbf5" : "#fffbf3" }}><span style={{ color: "#74899e", fontSize: 11 }}>{a}</span><strong style={{ color: i === 3 ? "#047857" : "#6d582e", fontSize: 12 }}>{b}</strong></div>)}</div>
                </article>
              </div>

              <article style={{ ...qualityRuleStyle, padding: 20, marginTop: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}><div><div style={eyebrow}>İNŞAAT TAKVİMİ VE SAHA İLERLEMESİ</div><h3 style={{ margin: "6px 0 0", color: "#153a65" }}>Kritik yol görünümü</h3></div><span style={{ ...secureBadge, background: "#fff7e7", borderColor: "#efd59d", color: "#9a6700" }}>Haftalık saha özeti</span></div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 9, marginTop: 14 }}>{[
                  ["Hafriyat & temel",100,"Tamamlandı","#10b981"],["Taşıyıcı sistem",100,"Tamamlandı","#10b981"],["Duvar & kaba sıva",72,"Devam ediyor","#d89614"],["Elektrik & mekanik",46,"Sahada","#0876c9"],["Cephe",18,"Hazırlık","#7c3aed"],["Teslim",4,"Planlı","#74899e"]
                ].map(([title,value,status,color]) => <div key={String(title)} style={{ padding: 14, borderRadius: 15, border: "1px solid #dce8f3", background: "#fff" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong style={{ color: "#153a65", fontSize: 11 }}>{title}</strong><span style={{ color: String(color), fontSize: 9, fontWeight: 950 }}>{status}</span></div><div style={{ height: 7, borderRadius: 999, background: "#edf2f7", overflow: "hidden", marginTop: 11 }}><div style={{ width: `${value}%`, height: "100%", borderRadius: 999, background: String(color) }} /></div><span style={{ display: "block", marginTop: 7, color: "#74899e", fontSize: 10 }}>%{value} ilerleme</span></div>)}</div>
              </article>

              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(300px,.8fr)", gap: 13, marginTop: 13 }}>
                <article style={{ ...qualityRuleStyle, padding: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}><div><div style={eyebrow}>GÖREV VE EKİP MERKEZİ</div><h3 style={{ margin: "6px 0 0", color: "#153a65" }}>Öncelikli operasyon listesi</h3></div><div style={{ display: "flex", gap: 6 }}>{([['all','Tümü'],['critical','Kritik'],['week','Bu hafta']] as const).map(([id,label]) => <button key={id} type="button" onClick={() => setDeveloperTaskFilter(id)} style={{ padding: "7px 9px", borderRadius: 9, border: developerTaskFilter === id ? "1px solid #b7791f" : "1px solid #dce8f3", background: developerTaskFilter === id ? "#fff5df" : "#fff", color: developerTaskFilter === id ? "#9a6700" : "#607890", fontWeight: 900, cursor: "pointer", fontSize: 10 }}>{label}</button>)}</div></div>
                  <div style={{ overflowX: "auto", marginTop: 13 }}><table style={tableStyle}><thead><tr><th style={thStyle}>İş kalemi</th><th style={thStyle}>Sorumlu</th><th style={thStyle}>Termin</th><th style={thStyle}>Öncelik</th><th style={thStyle}>Durum</th></tr></thead><tbody>{[
                    ["Dış cephe alt konstrüksiyon","Şantiye Şefi","31 Tem","Yüksek","Malzeme bekliyor"],["Elektrik kolon kontrolü","Elektrik Ekibi","30 Tem","Orta","Sahada"],["Asansör kuyu ölçümü","Teknik Ofis","02 Ağu","Yüksek","Kontrol"],["3+1 daire satış dosyası","Satış Ekibi","05 Ağu","Orta","Hazırlanıyor"],["Kaba sıva hakedişi","Finans","29 Tem","Düşük","Onay bekliyor"]
                  ].filter(row => developerTaskFilter === "all" || (developerTaskFilter === "critical" ? row[3] === "Yüksek" : ["31 Tem","30 Tem","02 Ağu"].includes(row[2]))).map(row => <tr key={row[0]}>{row.map((cell,i) => <td key={cell} style={{ ...tdStyle, color: i === 3 ? (cell === "Yüksek" ? "#b42318" : cell === "Orta" ? "#9a6700" : "#087b55") : tdStyle.color, fontWeight: i === 0 || i === 3 ? 850 : 650 }}>{cell}</td>)}</tr>)}</tbody></table></div>
                </article>

                <article style={{ padding: 20, borderRadius: 22, background: "linear-gradient(145deg,#fff,#fffbf3)", border: "1px solid #eadfca", boxShadow: "0 10px 28px rgba(86,62,24,.07)" }}>
                  <div style={eyebrow}>AI RİSK MERKEZİ</div><h3 style={{ margin: "6px 0 12px", color: "#153a65" }}>Bugünün proje sinyalleri</h3>
                  <div style={{ display: "grid", gap: 9 }}>{[["Maliyet riski","Cephe kaleminde tedarik fiyatı yükseldi.","Yüksek"],["Takvim riski","Asansör ölçümü iki kritik işi etkileyebilir.","Orta"],["Satış fırsatı","Orta kat 3+1 talebi son 14 günde güçlendi.","Fırsat"],["Nakit akışı","Mevcut tahsilat planı 4,2 aylık tampon sağlıyor.","Dengeli"]].map(([title,text,level],i) => <div key={title} style={{ padding: 12, borderRadius: 14, border: i === 0 ? "1px solid #f1c6c6" : "1px solid #eadfca", background: i === 0 ? "#fff8f8" : "#fff" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><strong style={{ color: "#153a65", fontSize: 11 }}>{title}</strong><span style={{ color: i === 0 ? "#b42318" : i === 2 ? "#047857" : "#9a6700", fontSize: 9, fontWeight: 950 }}>{level}</span></div><p style={{ margin: "5px 0 0", color: "#74899e", fontSize: 10, lineHeight: 1.45 }}>{text}</p></div>)}</div>
                </article>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(205px,1fr))", gap: 10, marginTop: 13 }}>
                {[["🏠","Satış Merkezi","Satışta 6 · Rezerve 1 · Satıldı 5"],["📁","Doküman Merkezi","Ruhsat, proje, hakediş ve sözleşmeler"],["👷","Ekip Yönetimi","6 ekip · 28 aktif görev"],["📄","Haftalık Rapor","İlerleme, finans, risk ve fotoğraf özeti"]].map(([icon,title,text]) => <button type="button" key={title} onClick={() => setEnterpriseNotice(`${title} çalışma alanı seçildi. proje veri tabloları ve dosya depolama katmanıyla bağlanacaktır.`)} style={{ padding: 16, borderRadius: 17, border: "1px solid #eadfca", background: "linear-gradient(145deg,#fff,#fffbf5)", textAlign: "left", cursor: "pointer" }}><span style={{ fontSize: 22 }}>{icon}</span><strong style={{ display: "block", marginTop: 8, color: "#5c4217", fontSize: 12 }}>{title}</strong><span style={{ display: "block", marginTop: 4, color: "#85765d", fontSize: 10, lineHeight: 1.45 }}>{text}</span><span style={{ display: "block", marginTop: 8, color: "#a66a0a", fontSize: 10, fontWeight: 900 }}>Çalışma alanını aç →</span></button>)}
              </div>
            </section>
          ) : null}


          {enterpriseRole === "investor" ? (
            <section style={{ marginTop: 16 }}>
              <article style={{ position: "relative", overflow: "hidden", padding: "clamp(24px,4vw,40px)", borderRadius: 28, color: "#fff", background: "radial-gradient(circle at 88% 10%,rgba(110,231,183,.22),transparent 30%),radial-gradient(circle at 8% 92%,rgba(45,212,191,.12),transparent 35%),linear-gradient(140deg,#05251e 0%,#0b4b3d 56%,#08735b 100%)", boxShadow: "0 28px 68px rgba(5,73,58,.24)", border: "1px solid rgba(255,255,255,.12)" }}>
                <div style={{ position: "absolute", width: 280, height: 280, borderRadius: "50%", right: -110, top: -140, border: "1px solid rgba(255,255,255,.11)" }} />
                <div style={{ position: "relative", display: "grid", gridTemplateColumns: "minmax(0,1.35fr) minmax(260px,.65fr)", gap: 20, alignItems: "center" }}>
                  <div>
                    <div style={{ color: "#a7f3d0", fontSize: 10, fontWeight: 950, letterSpacing: 1.7 }}>PREMIUM YATIRIMCI VE PORTFÖY MERKEZİ</div>
                    <h3 style={{ margin: "9px 0 8px", fontSize: "clamp(27px,4vw,42px)", lineHeight: 1.08, letterSpacing: "-1.1px" }}>Varlıklarınızı değil, gelecekteki kararlarınızı yönetin.</h3>
                    <p style={{ margin: 0, maxWidth: 760, color: "rgba(255,255,255,.76)", fontSize: 13, lineHeight: 1.72 }}>Portföy değeri, nakit akışı, risk, likidite ve fırsat sinyallerini tek sade yönetici görünümünde birleştirin.</p>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 18 }}>
                      <button type="button" onClick={() => setEnterpriseNotice("Yönetici portföy özeti hazırlandı. PDF Merkezi üzerinden kurumsal rapora dönüştürülebilir.")} style={{ padding: "11px 14px", borderRadius: 12, border: 0, background: "#fff", color: "#08604c", fontWeight: 950, cursor: "pointer" }}>Yönetici Özeti Oluştur</button>
                      <button type="button" onClick={() => setEnterpriseNotice("Yeni yatırım fırsatı inceleme kuyruğu açıldı. Gerçek veri bağlantısında bölgesel adaylar burada listelenecektir.")} style={{ padding: "11px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,.24)", background: "rgba(255,255,255,.08)", color: "#fff", fontWeight: 900, cursor: "pointer" }}>Yeni Fırsat İncele</button>
                    </div>
                  </div>
                  <div style={{ padding: 18, borderRadius: 21, background: "rgba(2,30,24,.42)", border: "1px solid rgba(255,255,255,.13)", backdropFilter: "blur(16px)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}><span style={{ color: "rgba(255,255,255,.66)", fontSize: 10, fontWeight: 900 }}>AI PORTFÖY KARAR SKORU</span><span style={{ padding: "5px 8px", borderRadius: 999, background: "rgba(52,211,153,.15)", color: "#a7f3d0", fontSize: 9, fontWeight: 950 }}>DENGELİ</span></div>
                    <div style={{ display: "flex", alignItems: "end", gap: 9, marginTop: 10 }}><strong style={{ fontSize: 47, lineHeight: 1 }}>88</strong><span style={{ color: "rgba(255,255,255,.55)", fontWeight: 850, paddingBottom: 5 }}>/100</span></div>
                    <div style={{ height: 7, borderRadius: 999, background: "rgba(255,255,255,.10)", overflow: "hidden", marginTop: 13 }}><div style={{ width: "88%", height: "100%", borderRadius: 999, background: "linear-gradient(90deg,#34d399,#a7f3d0)" }} /></div>
                    <p style={{ margin: "11px 0 0", color: "rgba(255,255,255,.67)", fontSize: 10, lineHeight: 1.5 }}>Getiri güçlü, risk dengeli. Likidite ve bölgesel çeşitlilik geliştirilirse skor yükselebilir.</p>
                  </div>
                </div>
              </article>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(165px,1fr))", gap: 10, marginTop: 12 }}>
                {[["Toplam portföy","₺84,0 Mn","+%18,6"],["Öz sermaye","₺57,4 Mn","%68 pay"],["Aylık nakit akışı","₺286 Bin","+%7,2"],["Yıllık beklenen getiri","%21,8","Dengeli"],["Likidite tamponu","₺6,8 Mn","8,4 ay"],["Aktif varlık","17","4 şehir"]].map(([title,value,badge],i) => <article key={title} style={{ padding: 16, borderRadius: 18, background: i === 4 ? "linear-gradient(145deg,#effcf6,#fbfffd)" : "linear-gradient(145deg,#fff,#f7fcfa)", border: i === 4 ? "1px solid #b7ead2" : "1px solid #dcebe5", boxShadow: "0 9px 24px rgba(24,86,68,.06)" }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span style={{ color: "#74899e", fontSize: 9, fontWeight: 950, letterSpacing: .5 }}>{title.toUpperCase()}</span><span style={{ color: i === 4 ? "#047857" : "#0f8065", fontSize: 9, fontWeight: 950 }}>{badge}</span></div><strong style={{ display: "block", marginTop: 7, color: i === 4 ? "#047857" : "#153a65", fontSize: 22 }}>{value}</strong></article>)}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(300px,.8fr)", gap: 13, marginTop: 13 }}>
                <article style={{ ...qualityRuleStyle, padding: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}><div><div style={eyebrow}>PORTFÖY PERFORMANSI</div><h3 style={{ margin: "6px 0 0", color: "#153a65" }}>Değer ve gelir eğilimi</h3></div><div style={{ display: "flex", gap: 6 }}>{([['1y','1 Yıl'],['3y','3 Yıl'],['5y','5 Yıl']] as const).map(([id,label]) => <button key={id} type="button" onClick={() => setInvestorHorizon(id)} style={{ padding: "7px 10px", borderRadius: 9, border: investorHorizon === id ? "1px solid #0f8065" : "1px solid #dce8f3", background: investorHorizon === id ? "#eafaf4" : "#fff", color: investorHorizon === id ? "#0f8065" : "#607890", fontWeight: 900, cursor: "pointer", fontSize: 10 }}>{label}</button>)}</div></div>
                  <div style={{ height: 164, display: "flex", alignItems: "end", gap: 8, marginTop: 17 }}>{(investorHorizon === "1y" ? [52,58,56,63,68,71,75,79,83,87,91,96] : investorHorizon === "3y" ? [31,38,43,48,54,58,63,69,75,82,89,98] : [22,28,35,41,49,56,64,71,79,87,94,100]).map((h,i) => <div key={i} style={{ flex: 1, height: `${h}%`, borderRadius: "7px 7px 3px 3px", background: i > 8 ? "linear-gradient(180deg,#34d399,#0f8065)" : "linear-gradient(180deg,#b8edd9,#5fc9a7)" }} />)}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#91a2b2", fontSize: 9, marginTop: 8 }}><span>Dönem başlangıcı</span><span>Bugün · {investorHorizon === "1y" ? "+%18,6" : investorHorizon === "3y" ? "+%51,4" : "+%86,2"}</span></div>
                </article>

                <article style={{ ...qualityRuleStyle, padding: 20 }}>
                  <div style={eyebrow}>VARLIK DAĞILIMI</div><h3 style={{ margin: "6px 0 12px", color: "#153a65" }}>Yoğunluk ve çeşitlilik</h3>
                  <div style={{ display: "grid", gap: 11 }}>{[["Konut",34,"#0f8065","₺28,6 Mn"],["Ticari",21,"#0876c9","₺17,6 Mn"],["Arsa",18,"#b7791f","₺15,1 Mn"],["Projeler",19,"#7c3aed","₺16,0 Mn"],["Nakit",8,"#74899e","₺6,7 Mn"]].map(([label,value,color,amount]) => <div key={String(label)}><div style={{ display: "flex", justifyContent: "space-between", gap: 8, color: "#607890", fontSize: 10 }}><span>{label} · {amount}</span><strong style={{ color: String(color) }}>%{value}</strong></div><div style={{ height: 7, borderRadius: 999, background: "#edf2f7", overflow: "hidden", marginTop: 5 }}><div style={{ width: `${value}%`, height: "100%", borderRadius: 999, background: String(color) }} /></div></div>)}</div>
                </article>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.05fr) minmax(310px,.95fr)", gap: 13, marginTop: 13 }}>
                <article style={{ ...qualityRuleStyle, padding: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}><div><div style={eyebrow}>SENARYO LABORATUVARI</div><h3 style={{ margin: "6px 0 0", color: "#153a65" }}>Portföy stres testi</h3></div><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{([['base','Baz'],['rateUp','Faiz +2'],['rateDown','Faiz -2'],['rentUp','Kira +10']] as const).map(([id,label]) => <button key={id} type="button" onClick={() => setInvestorScenario(id)} style={{ padding: "7px 9px", borderRadius: 9, border: investorScenario === id ? "1px solid #0f8065" : "1px solid #dce8f3", background: investorScenario === id ? "#eafaf4" : "#fff", color: investorScenario === id ? "#0f8065" : "#607890", fontWeight: 900, cursor: "pointer", fontSize: 10 }}>{label}</button>)}</div></div>
                  {(() => { const scenario = investorScenario === "base" ? {value:"₺84,0 Mn",gain:"%21,8",cash:"₺286 Bin",risk:"Dengeli",note:"Mevcut dağılım kontrollü büyümeyi destekliyor."} : investorScenario === "rateUp" ? {value:"₺78,9 Mn",gain:"%14,2",cash:"₺248 Bin",risk:"Orta-Yüksek",note:"Finansman maliyeti ve satış süresi artabilir; nakit oranı korunmalı."} : investorScenario === "rateDown" ? {value:"₺91,6 Mn",gain:"%29,4",cash:"₺303 Bin",risk:"Düşük-Orta",note:"Talep ve değer artışı güçlenebilir; seçici büyüme fırsatı oluşur."} : {value:"₺86,2 Mn",gain:"%24,6",cash:"₺315 Bin",risk:"Dengeli",note:"Kira bazlı nakit akışı güçlenir ve borç servis kapasitesi artar."}; return <><div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 9, marginTop: 14 }}>{[["Tahmini değer",scenario.value],["Yıllık getiri",scenario.gain],["Aylık nakit",scenario.cash],["Risk görünümü",scenario.risk]].map(([a,b]) => <div key={a} style={{ padding: 12, borderRadius: 14, background: "#f3fbf8", border: "1px solid #d4eee4" }}><span style={{ display: "block", color: "#74899e", fontSize: 9, fontWeight: 850 }}>{a.toUpperCase()}</span><strong style={{ display: "block", marginTop: 5, color: "#0f8065", fontSize: 17 }}>{b}</strong></div>)}</div><div style={{ marginTop: 11, padding: 13, borderRadius: 14, background: "#ecfaf5", color: "#436c60", fontSize: 10, lineHeight: 1.6 }}><strong style={{ color: "#08604c" }}>AI senaryo yorumu:</strong> {scenario.note}</div></> })()}
                </article>

                <article style={{ padding: 20, borderRadius: 22, color: "#fff", background: "linear-gradient(145deg,#062820,#0a5b49)", boxShadow: "0 18px 42px rgba(5,73,58,.17)" }}>
                  <div style={{ color: "#a7f3d0", fontSize: 10, fontWeight: 950, letterSpacing: 1.2 }}>YAŞAM AI PORTFÖY DANIŞMANI</div><h3 style={{ margin: "7px 0 6px", fontSize: 20 }}>Bugün hangi kararı inceleyelim?</h3><p style={{ margin: 0, color: "rgba(255,255,255,.68)", fontSize: 10, lineHeight: 1.5 }}>Sorunuzu sade biçimde yazın. Sistem portföy, risk ve likidite bağlamında karar desteği üretir.</p>
                  <div style={{ marginTop: 12, padding: 12, borderRadius: 14, background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.11)", color: "#d7fff0", fontSize: 10, lineHeight: 1.58 }}>{investorAiAnswer}</div>
                  <div style={{ display: "flex", gap: 7, marginTop: 10 }}><input value={investorAiPrompt} onChange={(e) => setInvestorAiPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && investorAiPrompt.trim()) { setInvestorAiAnswer(`“${investorAiPrompt.trim()}” talebi değerlendirildi. Canlı veri bağlantısı açıldığında varlık bazlı etkiler, kaynaklar ve önerilen aksiyonlar ayrıntılı gösterilecektir.`); setInvestorAiPrompt(""); } }} placeholder="Örn. Riski azaltmak için ne yapmalıyım?" style={{ flex: 1, minWidth: 0, padding: "10px 11px", borderRadius: 11, border: "1px solid rgba(255,255,255,.14)", background: "rgba(255,255,255,.08)", color: "#fff", outline: "none", fontSize: 10 }} /><button type="button" onClick={() => { if (!investorAiPrompt.trim()) return; setInvestorAiAnswer(`“${investorAiPrompt.trim()}” talebi değerlendirildi. Canlı veri bağlantısı açıldığında varlık bazlı etkiler, kaynaklar ve önerilen aksiyonlar ayrıntılı gösterilecektir.`); setInvestorAiPrompt(""); }} style={{ padding: "10px 12px", borderRadius: 11, border: 0, background: "#34d399", color: "#063b30", fontWeight: 950, cursor: "pointer" }}>Analiz Et</button></div>
                </article>
              </div>

              <article style={{ ...qualityRuleStyle, padding: 20, marginTop: 13 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}><div><div style={eyebrow}>VARLIK PERFORMANS LİSTESİ</div><h3 style={{ margin: "6px 0 0", color: "#153a65" }}>Getiri, risk ve likidite karşılaştırması</h3></div><div style={{ display: "flex", gap: 6 }}>{([['all','Tümü'],['low','Düşük risk'],['balanced','Dengeli'],['high','Yüksek risk']] as const).map(([id,label]) => <button key={id} type="button" onClick={() => setInvestorRiskFilter(id)} style={{ padding: "7px 9px", borderRadius: 9, border: investorRiskFilter === id ? "1px solid #0f8065" : "1px solid #dce8f3", background: investorRiskFilter === id ? "#eafaf4" : "#fff", color: investorRiskFilter === id ? "#0f8065" : "#607890", fontWeight: 900, cursor: "pointer", fontSize: 10 }}>{label}</button>)}</div></div>
                <div style={{ overflowX: "auto", marginTop: 13 }}><table style={tableStyle}><thead><tr><th style={thStyle}>Varlık</th><th style={thStyle}>Tür</th><th style={thStyle}>Güncel değer</th><th style={thStyle}>Getiri</th><th style={thStyle}>Risk</th><th style={thStyle}>Likidite</th></tr></thead><tbody>{[["Elysium Loft","Proje","₺31,0 Mn","%28,4","Dengeli","Orta"],["Nova Loft","Proje","₺18,6 Mn","%24,1","Dengeli","Orta"],["Ceyhan Ticari","Ticari","₺11,5 Mn","%19,2","Düşük","Yüksek"],["Mersin Arsa","Arsa","₺8,9 Mn","%31,8","Yüksek","Düşük"],["Adana Konut Sepeti","Konut","₺7,2 Mn","%16,7","Düşük","Yüksek"],["Nakit Rezervi","Nakit","₺6,8 Mn","%—","Düşük","Çok yüksek"]].filter(row => investorRiskFilter === "all" || (investorRiskFilter === "low" ? row[4] === "Düşük" : investorRiskFilter === "balanced" ? row[4] === "Dengeli" : row[4] === "Yüksek")).map(row => <tr key={row[0]}>{row.map((cell,i) => <td key={cell} style={{ ...tdStyle, color: i === 4 ? (cell === "Yüksek" ? "#b42318" : cell === "Dengeli" ? "#9a6700" : "#087b55") : tdStyle.color, fontWeight: i === 0 || i === 4 ? 850 : 650 }}>{cell}</td>)}</tr>)}</tbody></table></div>
              </article>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(205px,1fr))", gap: 10, marginTop: 13 }}>
                {[["🔔","Akıllı Uyarılar","2 dikkat · 3 fırsat sinyali"],["🗺️","Portföy Haritası","4 şehir · 17 aktif varlık"],["📄","Yönetici Raporu","Getiri, risk ve nakit akışı"],["🎯","Fırsat Radarı","Bölgesel adayları karşılaştır"]].map(([icon,title,text]) => <button type="button" key={title} onClick={() => setEnterpriseNotice(`${title} çalışma alanı seçildi. canlı veri ve raporlama katmanıyla bağlanacaktır.`)} style={{ padding: 16, borderRadius: 17, border: "1px solid #d7ebe3", background: "linear-gradient(145deg,#fff,#f5fcf9)", textAlign: "left", cursor: "pointer" }}><span style={{ fontSize: 22 }}>{icon}</span><strong style={{ display: "block", marginTop: 8, color: "#0b5e4b", fontSize: 12 }}>{title}</strong><span style={{ display: "block", marginTop: 4, color: "#74899e", fontSize: 10, lineHeight: 1.45 }}>{text}</span><span style={{ display: "block", marginTop: 8, color: "#0f8065", fontSize: 10, fontWeight: 900 }}>Çalışma alanını aç →</span></button>)}
              </div>

              <div style={{ marginTop: 12, padding: 13, borderRadius: 15, border: "1px solid #d7ebe3", background: "#f5fcf9", color: "#607890", fontSize: 10, lineHeight: 1.55 }}><strong style={{ color: "#0b5e4b" }}>Karar desteği açıklaması:</strong> Bu ekran örnek portföy verileriyle çalışan ön yüz prototipidir. Sunulan skorlar ve senaryolar yatırım danışmanlığı değildir; gerçek kullanımda doğrulanmış veriler, kullanıcı yetkileri ve uzman kontrolüyle desteklenecektir.</div>
            </section>
          ) : null}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginTop: 14 }}>
            {[["🔒","Kontrollü Erişim","Rol ve yetkiye göre görünürlük"],["🧠","Açıklanabilir AI","Kararın nedenleri izlenebilir"],["🇹🇷","Türkiye Veri Motoru","Bölgesel karar altyapısı"],["📄","Kurumsal PDF","Standart ve doğrulanabilir rapor"],["🛡️","KVKK Yaklaşımı","Veri minimizasyonu ve kayıt disiplini"]].map(([icon,title,text]) => <article key={title} style={{ padding: 15, borderRadius: 16, border: "1px solid #dce8f3", background: "linear-gradient(145deg,#fff,#f8fbfe)" }}><span style={{ fontSize: 21 }}>{icon}</span><strong style={{ display: "block", color: "#153a65", marginTop: 7, fontSize: 12 }}>{title}</strong><span style={{ display: "block", color: "#74899e", marginTop: 3, fontSize: 10, lineHeight: 1.4 }}>{text}</span></article>)}
          </div>
        </>
      ) : null}

      {section === "crm" ? (
        <div style={{ overflowX: "auto" }}>
          <table style={tableStyle}><thead><tr><th style={thStyle}>Müşteri / Portföy</th><th style={thStyle}>Aşama</th><th style={thStyle}>Öncelik</th><th style={thStyle}>Sonraki İşlem</th></tr></thead>
          <tbody>
            {[
              ["Yeni yatırımcı talebi", "İhtiyaç analizi", "Yüksek", "Bütçe ve lokasyon teyidi"],
              ["Satılık portföy", "Veri doğrulama", "Orta", "Tapu ve fiyat kontrolü"],
              ["Kurumsal lokasyon", "Karşılaştırma", "Yüksek", "Kısa liste raporu"],
            ].map((row) => <tr key={row[0]}>{row.map((cell) => <td key={cell} style={tdStyle}>{cell}</td>)}</tr>)}
          </tbody></table>
          <div style={{ ...locationInfoBox, marginTop: 14 }}>CRM ekranı şu aşamada iş akışı prototipidir. Gerçek müşteri kayıtları için ayrı Supabase tabloları, rol izinleri ve KVKK uyumlu erişim politikaları kurulacaktır.</div>
        </div>
      ) : null}

      {section === "project" ? (
        <>
          <div style={formGrid}>
            <Field label="Arsa alanı (m²)" value={landArea} onChange={setLandArea} inputMode="numeric" />
            <Field label="Emsal (KAKS)" value={far} onChange={setFar} inputMode="numeric" />
            <Field label="Tahmini satış m² (TL)" value={saleM2} onChange={(v) => setSaleM2(formatMoney(v))} inputMode="numeric" />
            <Field label="İnşaat m² maliyeti (TL)" value={costM2} onChange={(v) => setCostM2(formatMoney(v))} inputMode="numeric" />
            <Field label="Arsa maliyeti (TL)" value={landCost} onChange={(v) => setLandCost(formatMoney(v))} inputMode="numeric" />
          </div>
          <div style={statsGrid}>
            <Stat title="Satılabilir Alan" value={Math.round(sellable).toLocaleString("tr-TR")} suffix=" m²" text="%82 verim varsayımı" />
            <Stat title="Tahmini Ciro" value={formatCurrency(String(Math.round(revenue)))} text="Ön satış senaryosu" />
            <Stat title="Toplam Maliyet" value={formatCurrency(String(Math.round(totalCost)))} text="Arsa + yapım" />
            <Stat title="Brüt Kâr" value={formatCurrency(String(Math.round(grossProfit)))} text={`Marj %${margin.toFixed(1).replace(".", ",")}`} />
          </div>
          <div style={{ ...comparisonHeroResult, ...decisionTone(feasibilityDecision === "GÜÇLÜ ADAY" ? "AL" : feasibilityDecision === "RİSKLİ" ? "UZAK DUR" : "BEKLE") }}>
            <div><div style={eyebrow}>ÖN FİZİBİLİTE KARARI</div><strong style={{ fontSize: 24 }}>{feasibilityDecision}</strong></div>
            <div style={confidenceCard}><small>BRÜT MARJ</small><strong style={{ fontSize: 24 }}>%{margin.toFixed(1).replace(".", ",")}</strong></div>
          </div>
          <div style={locationInfoBox}>Bu hesap ön fizibilitedir; ruhsat, finansman, vergi, satış komisyonu, arsa payı, süre ve beklenmeyen giderler ayrıca modellenmelidir.</div>
        </>
      ) : null}
    </section>
  );
}

function QuickActionGlyph({ label }: { label: string }) {
  const common = { width: 72, height: 72, viewBox: "0 0 72 72", fill: "none", xmlns: "http://www.w3.org/2000/svg" };
  if (label === "+ Yeni Analiz") {
    return <svg {...common} aria-hidden="true">
      <path d="M10 33 34 12l24 21" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M16 30v27h36V30" fill="rgba(255,255,255,.10)" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round"/>
      <rect x="23" y="38" width="22" height="12" rx="3.5" fill="rgba(255,255,255,.10)" stroke="currentColor" strokeWidth="1.8"/>
      <path d="M27 46l4-4 4 2 5-6" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="56" cy="18" r="10" fill="rgba(255,255,255,.18)" stroke="currentColor" strokeWidth="2.2"/>
      <path d="M56 13v10M51 18h10" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"/>
      <path d="M12 61h44" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".38"/>
    </svg>;
  }
  if (label === "Raporlarım") {
    return <svg {...common} aria-hidden="true">
      <path d="M18 10h30l8 8v40H18z" fill="rgba(255,255,255,.10)" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round"/>
      <path d="M48 10v10h8" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round"/>
      <rect x="25" y="28" width="24" height="5" rx="2.5" fill="currentColor" opacity=".72"/>
      <rect x="25" y="38" width="18" height="4" rx="2" fill="currentColor" opacity=".46"/>
      <rect x="25" y="47" width="14" height="4" rx="2" fill="currentColor" opacity=".34"/>
      <circle cx="19" cy="54" r="9" fill="rgba(255,255,255,.18)" stroke="currentColor" strokeWidth="2"/>
      <path d="m15 54 2.6 2.7 5.2-6" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>;
  }
  if (label === "AI Karşılaştırma") {
    return <svg {...common} aria-hidden="true">
      <rect x="5" y="15" width="22" height="42" rx="8" fill="rgba(255,255,255,.08)" stroke="currentColor" strokeWidth="2.3"/>
      <rect x="45" y="15" width="22" height="42" rx="8" fill="rgba(255,255,255,.08)" stroke="currentColor" strokeWidth="2.3"/>
      <path d="M11 26h10M11 33h7M51 26h10M51 33h7" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round"/>
      <circle cx="36" cy="36" r="13" fill="rgba(255,255,255,.20)" stroke="currentColor" strokeWidth="2.3"/>
      <path d="M36 16v6M36 50v6M16 36h7M49 36h7M22 22l5 5M45 45l5 5M50 22l-5 5M27 45l-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity=".72"/>
      <path d="M31 39v-6.5c0-2.7 2.2-4.9 5-4.9s5 2.2 5 4.9V39" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
      <path d="M30 39h12M33 43h6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
      <circle cx="36" cy="24" r="2.2" fill="currentColor"/>
    </svg>;
  }
  return <svg {...common} aria-hidden="true"><circle cx="36" cy="36" r="23" fill="rgba(255,255,255,.10)" stroke="currentColor" strokeWidth="2"/><path d="M26 36h20M36 26v20" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>;
}

function NavButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const label = typeof children === "string" ? children : "Modül";
  const meta: Record<string, { subtitle: string; description: string; gradient: string; accent: string; secondary: string; cta: string; badge: string }> = {
    "+ Yeni Analiz": { subtitle: "Yeni karar dosyası", description: "Taşınmazı girin; değer, risk, fırsat ve teklif stratejisini tek akışta üretin.", gradient: "radial-gradient(circle at 12% 0%,rgba(88,239,255,.44),transparent 34%),radial-gradient(circle at 88% 100%,rgba(0,109,255,.42),transparent 45%),linear-gradient(145deg,#04aeea 0%,#0475e8 42%,#063c9a 100%)", accent: "#d7fbff", secondary: "#53e8ff", cta: "Yeni kararı başlat", badge: "EN HIZLI BAŞLANGIÇ" },
    Raporlarım: { subtitle: "Karar hafızanız", description: "Tüm analizleri, doğrulamaları ve geçmiş kararları güvenli bulut arşivinde yönetin.", gradient: "radial-gradient(circle at 90% 0%,rgba(116,255,206,.30),transparent 36%),linear-gradient(145deg,#16b78e 0%,#0a8b73 45%,#075547 100%)", accent: "#d7ffef", secondary: "#72f2c7", cta: "Karar arşivini aç", badge: "BULUT HAFIZASI" },
    "AI Karşılaştırma": { subtitle: "AI karar düellosu", description: "İki gayrimenkulü aynı veri modelinde yarıştırın; hangisinin neden öne çıktığını görün.", gradient: "radial-gradient(circle at 84% 2%,rgba(255,223,128,.46),transparent 30%),radial-gradient(circle at 8% 100%,rgba(255,122,24,.35),transparent 42%),linear-gradient(145deg,#ffad22 0%,#e87308 43%,#9a3f00 100%)", accent: "#fff7df", secondary: "#ffd36a", cta: "AI ile karşılaştır", badge: "AKILLI KARŞILAŞTIRMA" },
    Dashboard: { subtitle: "Genel Bakış", description: "Komuta merkezine dönün.", gradient: "linear-gradient(145deg,#0d5bd7,#082c68)", accent: "#dff6ff", secondary: "#39a8ff", cta: "Aç", badge: "YAŞAM AI" },
    Raporlar: { subtitle: "Rapor Merkezi", description: "Raporlarınızı yönetin.", gradient: "linear-gradient(145deg,#7b35c8,#35146f)", accent: "#f5eaff", secondary: "#c67cff", cta: "Aç", badge: "YAŞAM AI" },
    "Türkiye Veri Motoru": { subtitle: "81 İl Veri Motoru", description: "Türkiye veri merkezini açın.", gradient: "linear-gradient(145deg,#008bbd,#064c80)", accent: "#e5fbff", secondary: "#25d5ff", cta: "Aç", badge: "YAŞAM AI" },
    "Veri Doğrulama": { subtitle: "Kaynak Doğrulama", description: "Kaynak ve kanıt durumunu inceleyin.", gradient: "linear-gradient(145deg,#079657,#07562f)", accent: "#e8fff3", secondary: "#39e98a", cta: "Aç", badge: "YAŞAM AI" },
    "Gayrimenkul Karar Merkezi": { subtitle: "AI Karar Motoru", description: "Karar motorunu çalıştırın.", gradient: "linear-gradient(145deg,#c78000,#704000)", accent: "#fff3cd", secondary: "#ffd34c", cta: "Aç", badge: "YAŞAM AI" },
  };
  const item = meta[label] ?? { subtitle: "Yaşam AI", description: "Yaşam AI modülünü açın.", gradient: "linear-gradient(145deg,#153a65,#0b2947)", accent: "#e7f6ff", secondary: "#71c7ff", cta: "Aç", badge: "YAŞAM AI" };
  return (
    <button
      type="button"
      className="quick-action-card"
      onClick={onClick}
      style={{
        position: "relative",
        minWidth: 190,
        minHeight: 252,
        padding: "20px 20px 17px",
        borderRadius: 26,
        border: active ? `2px solid ${item.secondary}` : "1px solid rgba(255,255,255,.24)",
        background: item.gradient,
        color: "#fff",
        cursor: "pointer",
        textAlign: "left",
        overflow: "hidden",
        boxShadow: active ? `0 30px 68px ${item.secondary}40, 0 0 0 1px ${item.secondary}32, inset 0 1px 0 rgba(255,255,255,.34)` : `0 24px 52px rgba(0,13,38,.36), 0 0 0 1px ${item.secondary}18, inset 0 1px 0 rgba(255,255,255,.22)`,
        transform: active ? "translateY(-5px)" : "none",
        transition: "transform .22s ease, box-shadow .22s ease, border-color .22s ease, filter .22s ease",
      }}
    >
      <span style={{ position: "absolute", width: 220, height: 220, borderRadius: "50%", right: -82, top: -92, background: `radial-gradient(circle,${item.secondary}55,transparent 66%)`, pointerEvents: "none", filter: "blur(2px)" }} />
      <span style={{ position: "absolute", left: 20, right: 20, top: 0, height: 1, background: `linear-gradient(90deg,transparent,${item.accent},transparent)`, opacity: .72, pointerEvents: "none" }} />
      <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 13 }}>
        <span className="quick-action-icon" style={{ display: "grid", placeItems: "center", width: 88, height: 88, borderRadius: 27, background: `linear-gradient(145deg,rgba(255,255,255,.22),${item.secondary}20)`, border: `1px solid ${item.accent}78`, color: item.accent, boxShadow: `0 14px 32px ${item.secondary}30, inset 0 0 34px ${item.secondary}20` }}><QuickActionGlyph label={label} /></span>
        <span style={{ alignSelf: "flex-start", padding: "6px 8px", borderRadius: 999, background: "rgba(4,18,45,.18)", border: "1px solid rgba(255,255,255,.20)", color: "rgba(255,255,255,.88)", fontSize: 8, fontWeight: 950, letterSpacing: .75, whiteSpace: "nowrap" }}>{item.badge}</span>
      </span>
      <small style={{ display: "block", color: item.accent, fontSize: 10, fontWeight: 950, letterSpacing: 1.15, marginBottom: 5 }}>{item.subtitle.toLocaleUpperCase("tr-TR")}</small>
      <strong style={{ display: "block", fontSize: 24, lineHeight: 1.08, letterSpacing: -.55, textShadow: "0 5px 18px rgba(0,0,0,.16)" }}>{label.replace(/^\+\s*/, "")}</strong>
      <span style={{ display: "block", marginTop: 9, color: "rgba(255,255,255,.80)", fontSize: 11.5, lineHeight: 1.52, maxWidth: 330 }}>{item.description}</span>
      <span className="quick-action-cta" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 16, paddingTop: 13, borderTop: "1px solid rgba(255,255,255,.17)", color: "#fff", fontSize: 11.5, fontWeight: 950 }}><span>{item.cta}</span><span style={{ display: "grid", placeItems: "center", width: 28, height: 28, borderRadius: 999, background: "rgba(255,255,255,.13)", border: "1px solid rgba(255,255,255,.18)", fontSize: 16 }}>→</span></span>
    </button>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} style={active ? activeTabButton : tabButton}>
      {children}
    </button>
  );
}

function Stat({
  title,
  value,
  text,
  suffix = "",
}: {
  title: string;
  value: string | number;
  text: string;
  suffix?: string;
}) {
  return (
    <article style={statCard}>
      <div style={{ fontSize: 11, fontWeight: 900, opacity: 0.72, letterSpacing: 0.7 }}>
        {title.toUpperCase()}
      </div>
      <div style={{ fontSize: 30, fontWeight: 900, marginTop: 6 }}>
        {value}
        <span style={{ fontSize: 14, opacity: 0.75 }}>{suffix}</span>
      </div>
      <div style={{ opacity: 0.8, marginTop: 5, fontSize: 13 }}>{text}</div>
    </article>
  );
}

function InsightCard({
  label,
  value,
  text,
  icon,
}: {
  label: string;
  value: string | number;
  text: string;
  icon: string;
}) {
  return (
    <article style={insightCard}>
      <div style={insightIcon}>{icon}</div>
      <div>
        <div style={{ fontSize: 10, fontWeight: 950, letterSpacing: 0.7, color: "#6a7f94" }}>
          {label.toUpperCase()}
        </div>
        <div style={{ marginTop: 4, fontSize: 26, lineHeight: 1, fontWeight: 950, color: "#123d67" }}>
          {value}
        </div>
        <div style={{ marginTop: 6, fontSize: 11, lineHeight: 1.35, color: "#61778d" }}>{text}</div>
      </div>
    </article>
  );
}

function DashboardScore({
  label,
  value,
  inverse = false,
}: {
  label: string;
  value: number | null;
  inverse?: boolean;
}) {
  const tone = scoreTone(value, inverse);
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
        <strong style={{ color: "#294b70" }}>{label}</strong>
        <span style={{ ...scoreBubble, ...tone }}>{value ?? "—"}</span>
      </div>
      <div style={scoreTrack}>
        <div style={{ ...scoreFill, width: `${value ?? 0}%` }} />
      </div>
    </div>
  );
}

function DecisionBar({ label, value, total }: { label: string; value: number; total: number }) {
  const width = total ? Math.round((value / total) * 100) : 0;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
        <strong style={{ color: "#294b70" }}>{label}</strong>
        <span style={{ color: "#607890" }}>{value} rapor</span>
      </div>
      <div style={scoreTrack}>
        <div style={{ ...scoreFill, width: `${width}%` }} />
      </div>
    </div>
  );
}

function ReportRow({
  item,
  onOpen,
  onMap,
}: {
  item: CloudRecord;
  onOpen: () => void;
  onMap: () => void;
}) {
  const rowScores = scoresFromReport(item.report ?? "");
  return (
    <div style={{ ...recordStyle, padding: "12px 14px" }}>
      <div style={{ minWidth: 0 }}>
        <strong style={{ color: "#153a65" }}>{locationText(item) || "Konum belirtilmedi"}</strong>
        <div style={{ color: "#61788f", fontSize: 12, marginTop: 4 }}>
          {item.property_type} · {item.area || "—"} m² · {formatCurrency(item.asking_price)}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 7 }}>
          <span style={{ padding: "4px 7px", borderRadius: 999, background: "#edf7ff", border: "1px solid #cfe7fa", color: "#0b69a7", fontSize: 9, fontWeight: 900 }}>Yatırım {rowScores.investment ?? "—"}/100</span>
          <span style={{ padding: "4px 7px", borderRadius: 999, background: (rowScores.risk ?? 0) >= 65 ? "#fff1f1" : "#f2faf6", border: (rowScores.risk ?? 0) >= 65 ? "1px solid #f0caca" : "1px solid #d2ebdf", color: (rowScores.risk ?? 0) >= 65 ? "#b42318" : "#087b55", fontSize: 9, fontWeight: 900 }}>Risk {rowScores.risk ?? "—"}/100</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end" }}>
        <span style={{ ...decisionBadge, ...decisionTone(item.decision ?? "DEĞERLENDİR") }}>
          {item.decision ?? "DEĞERLENDİR"}
        </span>
        <button type="button" onClick={onOpen} style={blueButton}>Aç</button>
        <button type="button" onClick={onMap} style={softButton}>Harita</button>
      </div>
    </div>
  );
}

function ScoreCard({
  title,
  score,
  inverse = false,
}: {
  title: string;
  score: number | null;
  inverse?: boolean;
}) {
  const tone = scoreTone(score, inverse);
  return (
    <article style={scoreCardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <strong style={{ color: "#294b70" }}>{title}</strong>
        <span style={{ ...scoreBubble, ...tone }}>{score ?? "—"}</span>
      </div>
      <div style={scoreTrack}>
        <div style={{ ...scoreFill, width: `${score ?? 0}%` }} />
      </div>
    </article>
  );
}

function MiniMeta({ label, value }: { label: string; value: string }) {
  return (
    <div style={miniMetaStyle}>
      <span style={summaryLabel}>{label}</span>
      <strong style={{ color: "#153a65" }}>{value}</strong>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  inputMode?: "text" | "numeric";
}) {
  return (
    <label style={labelStyle}>
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
        style={inputStyle}
        inputMode={inputMode}
      />
    </label>
  );
}

function ComparisonTable({ left, right }: { left: CloudRecord; right: CloudRecord }) {
  const [aiComparison, setAiComparison] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [leftDiscount, setLeftDiscount] = useState(8);
  const [rightDiscount, setRightDiscount] = useState(8);
  const [mapMode, setMapMode] = useState<"roadmap" | "satellite">("roadmap");

  const leftScores = scoresFromReport(left.report ?? "");
  const rightScores = scoresFromReport(right.report ?? "");

  async function generateRealAiComparison() {
    setAiLoading(true);
    setAiError("");
    setAiComparison("");

    const compactRecord = (label: string, item: CloudRecord, scores: ScoreMap) => `
${label}
Konum: ${locationText(item)}
Tür: ${item.property_type ?? "Bilinmiyor"}
Alan: ${item.area ?? "Bilinmiyor"} m²
Talep fiyatı: ${formatCurrency(item.asking_price)}
AI kararı: ${item.decision ?? decisionFromReport(item.report ?? "")}
Veri güven: ${scores.trust ?? "Bilinmiyor"}
Yatırım: ${scores.investment ?? "Bilinmiyor"}
Fırsat: ${scores.opportunity ?? "Bilinmiyor"}
Risk: ${scores.risk ?? "Bilinmiyor"}
Likidite: ${scores.liquidity ?? "Bilinmiyor"}
Ek bilgiler: ${item.notes ?? "Yok"}
Önceki rapor:
${(item.report ?? "").slice(0, 5000)}
`;

    const prompt = `Sen Yaşam AI Gayrimenkul Karşılaştırma Motorusun.
Aşağıdaki iki taşınmazı yalnızca verilen bilgiler üzerinden tarafsız biçimde karşılaştır.

${compactRecord("TAŞINMAZ A", left, leftScores)}
${compactRecord("TAŞINMAZ B", right, rightScores)}

Türkçe ve profesyonel bir karar dosyası hazırla. Şu başlıkları aynen kullan:
1. AI KAZANANI
2. KARAR GÜVENİ
3. NEDEN KAZANDI
4. TAŞINMAZ A GÜÇLÜ YÖNLER
5. TAŞINMAZ A RİSKLER
6. TAŞINMAZ B GÜÇLÜ YÖNLER
7. TAŞINMAZ B RİSKLER
8. PAZARLIK STRATEJİSİ
9. 5 MADDELİK EYLEM PLANI
10. NİHAİ KARAR

AI KAZANANI bölümünde yalnızca A, B veya BERABERE yaz.
KARAR GÜVENİ bölümünde 0-100 arasında yüzde yaz.
NİHAİ KARAR bölümünde AL, PAZARLIK YAP, BEKLE veya UZAK DUR ifadelerinden birini kullan.
Eksik ya da doğrulanmamış verileri kesin gerçek gibi sunma; açıkça belirt.`;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          comparisonMode: true,
          leftId: left.id,
          rightId: right.id,
        }),
      });

      const data: unknown = await response.json();
      if (!response.ok) throw new Error(extractText(data) || "AI karşılaştırması üretilemedi.");

      const result = extractText(data);
      if (!result) throw new Error("AI karşılaştırma yanıtı boş geldi.");
      setAiComparison(result);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "AI karşılaştırması tamamlanamadı.");
    } finally {
      setAiLoading(false);
    }
  }

  const leftArea = Number(String(left.area ?? "").replace(/[^0-9.,]/g, "").replace(",", ".")) || 0;
  const rightArea = Number(String(right.area ?? "").replace(/[^0-9.,]/g, "").replace(",", ".")) || 0;
  const leftPrice = parseMoney(left.asking_price);
  const rightPrice = parseMoney(right.asking_price);
  const leftM2 = leftArea > 0 ? Math.round(leftPrice / leftArea) : 0;
  const rightM2 = rightArea > 0 ? Math.round(rightPrice / rightArea) : 0;

  const composite = (scores: ScoreMap, m2Price: number, rivalM2: number) => {
    const investment = scores.investment ?? 50;
    const opportunity = scores.opportunity ?? 50;
    const liquidity = scores.liquidity ?? 50;
    const trust = scores.trust ?? 50;
    const riskAdvantage = 100 - (scores.risk ?? 50);
    const priceAdvantage = m2Price && rivalM2 ? Math.max(0, Math.min(100, Math.round((rivalM2 / m2Price) * 50))) : 50;
    return Math.round(
      investment * 0.26 + opportunity * 0.20 + liquidity * 0.17 +
      riskAdvantage * 0.17 + trust * 0.10 + priceAdvantage * 0.10,
    );
  };

  const leftComposite = composite(leftScores, leftM2, rightM2);
  const rightComposite = composite(rightScores, rightM2, leftM2);
  const difference = Math.abs(leftComposite - rightComposite);
  const winner = leftComposite === rightComposite ? null : leftComposite > rightComposite ? left : right;
  const loser = winner?.id === left.id ? right : left;
  const winnerM2 = winner?.id === left.id ? leftM2 : rightM2;
  const loserM2 = winner?.id === left.id ? rightM2 : leftM2;

  const confidence = Math.min(95, Math.max(55, 58 + difference * 3));
  const leftOffer = Math.max(0, Math.round(leftPrice * (1 - leftDiscount / 100)));
  const rightOffer = Math.max(0, Math.round(rightPrice * (1 - rightDiscount / 100)));
  const leftSaving = Math.max(0, leftPrice - leftOffer);
  const rightSaving = Math.max(0, rightPrice - rightOffer);
  const leftRiskLevel = (leftScores.risk ?? 50) >= 65 ? "Yüksek" : (leftScores.risk ?? 50) >= 40 ? "Orta" : "Düşük";
  const rightRiskLevel = (rightScores.risk ?? 50) >= 65 ? "Yüksek" : (rightScores.risk ?? 50) >= 40 ? "Orta" : "Düşük";
  const leftMap = `https://www.google.com/maps?q=${encodeURIComponent(locationText(left))}&z=15&output=embed${mapMode === "satellite" ? "&t=k" : ""}`;
  const rightMap = `https://www.google.com/maps?q=${encodeURIComponent(locationText(right))}&z=15&output=embed${mapMode === "satellite" ? "&t=k" : ""}`;

  const projectionValue = (price: number, annualRate: number, years: number) =>
    price > 0 ? Math.round(price * Math.pow(1 + annualRate / 100, years)) : 0;

  const leftScenario = {
    cautious: projectionValue(leftPrice, 3, 5),
    normal: projectionValue(leftPrice, 8, 5),
    strong: projectionValue(leftPrice, 14, 5),
  };
  const rightScenario = {
    cautious: projectionValue(rightPrice, 3, 5),
    normal: projectionValue(rightPrice, 8, 5),
    strong: projectionValue(rightPrice, 14, 5),
  };

  const winnerOffer = winner?.id === left.id ? leftOffer : rightOffer;
  const winnerSaving = winner?.id === left.id ? leftSaving : rightSaving;
  const winnerRiskLevel = winner?.id === left.id ? leftRiskLevel : rightRiskLevel;
  const winnerDecision = winner?.decision ?? decisionFromReport(winner?.report ?? "");
  const reportCode = `YAI-${left.id.slice(0, 4).toUpperCase()}-${right.id.slice(0, 4).toUpperCase()}`;
  const streetViewUrl = (item: CloudRecord) =>
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationText(item))}`;

  const recommendation = !winner
    ? "İki seçenek dengeli görünüyor. Nihai karar için konum, tapu ve imar doğrulamasını öne alın."
    : `${locationText(winner)} bileşik yatırım puanında ${difference} puan önde. ${
        winnerM2 && loserM2 && winnerM2 < loserM2
          ? "Daha uygun m² fiyatı bu seçeneğin avantajını güçlendiriyor."
          : "Puan üstünlüğü fiyat dışındaki yatırım ve risk göstergelerinden geliyor."
      }`;

  const rows: Array<{ label: string; left: string | number; right: string | number; inverse?: boolean }> = [
    { label: "Bileşik Karar Puanı", left: `${leftComposite}/100`, right: `${rightComposite}/100` },
    { label: "Yatırım Puanı", left: leftScores.investment ?? "—", right: rightScores.investment ?? "—" },
    { label: "Fırsat Puanı", left: leftScores.opportunity ?? "—", right: rightScores.opportunity ?? "—" },
    { label: "Risk Puanı", left: leftScores.risk ?? "—", right: rightScores.risk ?? "—", inverse: true },
    { label: "Likidite Puanı", left: leftScores.liquidity ?? "—", right: rightScores.liquidity ?? "—" },
    { label: "Veri Güven", left: leftScores.trust ?? "—", right: rightScores.trust ?? "—" },
    { label: "Alan", left: `${left.area ?? "—"} m²`, right: `${right.area ?? "—"} m²` },
    { label: "Talep Fiyatı", left: formatCurrency(left.asking_price), right: formatCurrency(right.asking_price), inverse: true },
    { label: "Yaklaşık m² Fiyatı", left: leftM2 ? formatCurrency(String(leftM2)) : "—", right: rightM2 ? formatCurrency(String(rightM2)) : "—", inverse: true },
    { label: "AI Kararı", left: left.decision ?? "—", right: right.decision ?? "—" },
  ];

  const advantageList = (item: CloudRecord, scores: ScoreMap, m2: number, rival: number) => {
    const values: string[] = [];
    if ((scores.investment ?? 0) >= 70) values.push("Yüksek yatırım potansiyeli");
    if ((scores.opportunity ?? 0) >= 70) values.push("Güçlü fırsat seviyesi");
    if ((scores.liquidity ?? 0) >= 70) values.push("Satış kolaylığı güçlü");
    if ((scores.risk ?? 100) <= 40) values.push("Görece düşük risk");
    if (m2 && rival && m2 < rival) values.push("Daha uygun m² fiyatı");
    if (!values.length) values.push(`${item.property_type || "Taşınmaz"} için dengeli profil`);
    return values.slice(0, 4);
  };

  const riskList = (scores: ScoreMap, m2: number, rival: number) => {
    const values: string[] = [];
    if ((scores.risk ?? 0) >= 60) values.push("Risk puanı dikkat gerektiriyor");
    if ((scores.liquidity ?? 100) < 50) values.push("Likidite görece zayıf");
    if ((scores.trust ?? 100) < 60) values.push("Veri doğrulaması güçlendirilmeli");
    if (m2 && rival && m2 > rival) values.push("m² fiyatı diğer seçeneğin üzerinde");
    if (!values.length) values.push("Belirgin kritik risk sinyali yok");
    return values.slice(0, 4);
  };

  return (
    <>
      <section style={realAiPanel}>
        <div style={realAiPanelHeader}>
          <div>
            <div style={eyebrow}>GERÇEK AI KARŞILAŞTIRMA</div>
            <h3 style={{ color: "#153a65", fontSize: 22, margin: "6px 0" }}>
              İki Raporu Yapay Zekâya Yeniden Değerlendir
            </h3>
            <p style={{ color: "#607890", margin: 0, lineHeight: 1.55 }}>
              Aşağıdaki ön puanlama yerel hesaplamadır. Bu düğme iki tam raporu /api/chat üzerinden
              yeniden karşılaştırarak gerekçeli AI karar dosyası üretir.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void generateRealAiComparison()}
            disabled={aiLoading || left.id === right.id}
            style={goldButton}
          >
            {aiLoading ? "AI karşılaştırıyor..." : "Gerçek AI Kararını Üret"}
          </button>
        </div>

        {aiError ? <div style={aiErrorBox}>{aiError}</div> : null}

        {aiComparison ? (
          <article id="v53-ai-comparison-result" style={aiResultBox}>
            <div style={aiResultHeader}>
              <div>
                <div style={eyebrow}>AI KARAR DOSYASI</div>
                <strong style={{ color: "#153a65", fontSize: 19 }}>
                  {locationText(left)} ↔ {locationText(right)}
                </strong>
              </div>
              <div style={buttonRow}>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(aiComparison)}
                  style={softButton}
                >
                  AI Sonucunu Kopyala
                </button>
                <button type="button" onClick={() => window.print()} style={blueButton}>
                  PDF / Yazdır
                </button>
              </div>
            </div>
            <div style={aiResultText}>{aiComparison}</div>
            <p style={aiDisclaimer}>
              Bu çıktı karar desteğidir; resmî ekspertiz, tapu, imar ve saha doğrulamasının yerine geçmez.
            </p>
          </article>
        ) : (
          <div style={aiWaitingBox}>
            Henüz gerçek AI karşılaştırması üretilmedi. Ön puanları inceleyebilir veya yukarıdaki düğmeyle
            ayrıntılı AI kararını başlatabilirsiniz.
          </div>
        )}
      </section>

      <div style={comparisonHeroResult}>
        <div>
          <div style={eyebrow}>YAŞAM AI ÖN KARAR SONUCU</div>
          <h3 style={{ color: "#153a65", fontSize: 24, margin: "7px 0" }}>
            {winner ? `${locationText(winner)} öne çıkıyor` : "Sonuç birbirine çok yakın"}
          </h3>
          <p style={{ color: "#607890", margin: 0, lineHeight: 1.6 }}>{recommendation}</p>
        </div>
        <div style={confidenceCard}>
          <span style={summaryLabel}>KARAR GÜVENİ</span>
          <strong style={{ color: "#153a65", fontSize: 27 }}>%{confidence}</strong>
        </div>
      </div>

      <section style={proDashboard}>
        <div style={proDashboardHeader}>
          <div>
            <div style={eyebrow}>PROFESYONEL KARŞILAŞTIRMA DASHBOARDU</div>
            <h3 style={{ color: "#153a65", fontSize: 23, margin: "7px 0 4px" }}>
              Yatırım Karar Özeti
            </h3>
          </div>
          <span style={winnerBadge}>{winner ? `${locationText(winner)} ÖNDE` : "DENGELİ"}</span>
        </div>

        <div style={metricGrid}>
          <MetricCard label="Kazanan Puan" value={`${Math.max(leftComposite, rightComposite)}/100`} />
          <MetricCard label="Karar Güveni" value={`%${confidence}`} />
          <MetricCard label="Risk Seviyesi" value={winner?.id === left.id ? leftRiskLevel : rightRiskLevel} />
          <MetricCard
            label="m² Fiyat Avantajı"
            value={
              leftM2 && rightM2
                ? formatCurrency(String(Math.abs(leftM2 - rightM2)))
                : "Veri eksik"
            }
          />
        </div>

        <div style={chartGrid}>
          <ScoreChart
            title={locationText(left)}
            composite={leftComposite}
            scores={leftScores}
          />
          <ScoreChart
            title={locationText(right)}
            composite={rightComposite}
            scores={rightScores}
          />
        </div>
      </section>

      <div style={comparisonGrid}>
        <ComparisonCard item={left} title="1. Taşınmaz" composite={leftComposite} winner={winner?.id === left.id} />
        <ComparisonCard item={right} title="2. Taşınmaz" composite={rightComposite} winner={winner?.id === right.id} />
      </div>

      <section style={negotiationPanel}>
        <div>
          <div style={eyebrow}>PAZARLIK SİMÜLATÖRÜ</div>
          <h3 style={{ color: "#153a65", fontSize: 22, margin: "7px 0 4px" }}>
            Önerilen Teklif ve Yaklaşık Tasarruf
          </h3>
        </div>
        <div style={negotiationGrid}>
          <NegotiationCard
            title={locationText(left)}
            askingPrice={leftPrice}
            discount={leftDiscount}
            onChange={setLeftDiscount}
            offer={leftOffer}
            saving={leftSaving}
          />
          <NegotiationCard
            title={locationText(right)}
            askingPrice={rightPrice}
            discount={rightDiscount}
            onChange={setRightDiscount}
            offer={rightOffer}
            saving={rightSaving}
          />
        </div>
      </section>

      <section style={dualMapPanel}>
        <div style={dualMapHeader}>
          <div>
            <div style={eyebrow}>ÇİFT HARİTA KARŞILAŞTIRMASI</div>
            <h3 style={{ color: "#153a65", fontSize: 22, margin: "7px 0 4px" }}>
              İki Konumu Aynı Ekranda İncele
            </h3>
          </div>
          <div style={buttonRow}>
            <button type="button" onClick={() => setMapMode("roadmap")} style={mapMode === "roadmap" ? blueButton : softButton}>
              Normal Harita
            </button>
            <button type="button" onClick={() => setMapMode("satellite")} style={mapMode === "satellite" ? blueButton : softButton}>
              Uydu Görünümü
            </button>
          </div>
        </div>
        <div style={dualMapGrid}>
          <article style={mapCompareCard}>
            <strong style={{ color: "#153a65" }}>{locationText(left)}</strong>
            <iframe title={`Harita ${locationText(left)}`} src={leftMap} width="100%" height="310" style={{ border: 0, borderRadius: 13, marginTop: 10 }} loading="lazy" />
          </article>
          <article style={mapCompareCard}>
            <strong style={{ color: "#153a65" }}>{locationText(right)}</strong>
            <iframe title={`Harita ${locationText(right)}`} src={rightMap} width="100%" height="310" style={{ border: 0, borderRadius: 13, marginTop: 10 }} loading="lazy" />
          </article>
        </div>
      </section>

      <section style={committeePanel}>
        <div style={committeeHeader}>
          <div>
            <div style={eyebrow}>AI YATIRIM KOMİTESİ</div>
            <h3 style={{ color: "#153a65", fontSize: 24, margin: "7px 0 5px" }}>
              Yönetici Özeti ve Nihai Karar
            </h3>
            <p style={{ color: "#607890", margin: 0, lineHeight: 1.55 }}>
              Puanlar, fiyat farkı, risk göstergeleri ve pazarlık simülasyonu birlikte değerlendirilmiştir.
            </p>
          </div>
          <div style={reportIdentity}>
            <span style={summaryLabel}>RAPOR KODU</span>
            <strong style={{ color: "#153a65" }}>{reportCode}</strong>
          </div>
        </div>

        <div style={executiveMetricGrid}>
          <ExecutiveMetric label="Önerilen Taşınmaz" value={winner ? locationText(winner) : "Dengeli"} />
          <ExecutiveMetric label="Karar Güveni" value={`%${confidence}`} />
          <ExecutiveMetric label="Risk Seviyesi" value={winnerRiskLevel} />
          <ExecutiveMetric
            label="Önerilen Teklif"
            value={winnerOffer ? formatCurrency(String(winnerOffer)) : "Veri eksik"}
          />
          <ExecutiveMetric
            label="Yaklaşık Kazanç"
            value={winnerSaving ? formatCurrency(String(winnerSaving)) : "Veri eksik"}
          />
          <ExecutiveMetric label="Karar Türü" value={winnerDecision || "PAZARLIK YAP"} />
        </div>

        <div style={committeeNarrative}>
          <strong style={{ color: "#153a65", fontSize: 18 }}>
            {winner ? `${locationText(winner)} neden öne çıkıyor?` : "Sonuç neden dengeli?"}
          </strong>
          <p style={{ margin: "8px 0 0", color: "#526f89", lineHeight: 1.7 }}>
            {recommendation} Karar verilmeden önce tapu, imar, belediye kayıtları, ulaşım,
            altyapı ve gerçek emsal satışlar ayrıca doğrulanmalıdır.
          </p>
        </div>
      </section>

      <section style={scenarioPanel}>
        <div>
          <div style={eyebrow}>5 YILLIK SENARYO ANALİZİ</div>
          <h3 style={{ color: "#153a65", fontSize: 23, margin: "7px 0 5px" }}>
            Varsayımsal Değer Projeksiyonu
          </h3>
          <p style={{ color: "#607890", margin: 0, lineHeight: 1.55 }}>
            Bu bölüm kesin fiyat tahmini değildir. Yıllık %3, %8 ve %14 bileşik artış varsayımlarıyla hesaplanır.
          </p>
        </div>
        <div style={scenarioGrid}>
          <ScenarioCard title={locationText(left)} askingPrice={leftPrice} values={leftScenario} />
          <ScenarioCard title={locationText(right)} askingPrice={rightPrice} values={rightScenario} />
        </div>
      </section>

      <section style={actionPanel}>
        <div>
          <div style={eyebrow}>PROFESYONEL EYLEM PLANI</div>
          <h3 style={{ color: "#153a65", fontSize: 23, margin: "7px 0 5px" }}>
            Satın Alma Öncesi 5 Kritik Adım
          </h3>
        </div>
        <div style={actionGrid}>
          {[
            "Tapu kaydı, takyidat, şerh ve hisseli mülkiyet durumunu resmî kanaldan doğrulayın.",
            "İmar durumu, yapılaşma koşulları ve belediye plan notlarını yazılı belgeyle kontrol edin.",
            "Aynı mahalledeki gerçek emsal satışları ve güncel m² fiyatlarını karşılaştırın.",
            `İlk teklif için ${winnerOffer ? formatCurrency(String(winnerOffer)) : "piyasa doğrulaması sonrası belirlenecek tutarı"} referans alın.`,
            "Saha ziyareti, ulaşım, altyapı, çevre ve likidite doğrulamasından sonra nihai kararı verin.",
          ].map((item, index) => (
            <article key={item} style={actionCard}>
              <span style={actionNumber}>{index + 1}</span>
              <p style={{ margin: 0, color: "#526f89", lineHeight: 1.55 }}>{item}</p>
            </article>
          ))}
        </div>
      </section>

      <section style={finalDecisionPanel}>
        <div style={finalDecisionTop}>
          <div>
            <div style={finalEyebrow}>YAŞAM AI NİHAİ KARARI</div>
            <h2 style={{ margin: "8px 0 6px", fontSize: "clamp(25px,4vw,38px)" }}>
              {winner ? `${locationText(winner)} öneriliyor` : "Karar öncesi ek doğrulama gerekiyor"}
            </h2>
            <p style={{ margin: 0, maxWidth: 760, lineHeight: 1.65, color: "rgba(255,255,255,.82)" }}>
              {recommendation}
            </p>
          </div>
          <div style={finalScore}>
            <span style={{ fontSize: 11, fontWeight: 900 }}>KARAR GÜVENİ</span>
            <strong style={{ fontSize: 32 }}>%{confidence}</strong>
          </div>
        </div>

        <div style={finalDecisionActions}>
          <button type="button" onClick={() => void generateRealAiComparison()} style={finalPrimaryButton}>
            {aiLoading ? "AI hazırlanıyor..." : "AI Yatırım Komitesini Çalıştır"}
          </button>
          <button type="button" onClick={() => window.print()} style={finalSecondaryButton}>
            Premium PDF / Yazdır
          </button>
          <a href={streetViewUrl(left)} target="_blank" rel="noreferrer" style={finalSecondaryButton}>
            1. Konumu Sokakta Aç
          </a>
          <a href={streetViewUrl(right)} target="_blank" rel="noreferrer" style={finalSecondaryButton}>
            2. Konumu Sokakta Aç
          </a>
        </div>

        <p style={finalDisclaimer}>
          Yaşam AI karar desteği sunar. Bu rapor resmî ekspertiz, hukuki görüş, tapu incelemesi,
          imar belgesi veya yatırım danışmanlığı yerine geçmez.
        </p>
      </section>

      <div style={{ overflowX: "auto", marginTop: 16 }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Ölçüt</th>
              <th style={thStyle}>{locationText(left)}</th>
              <th style={thStyle}>{locationText(right)}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label}>
                <td style={tdStyle}><strong>{row.label}</strong></td>
                <td style={tdStyle}>{row.left}</td>
                <td style={tdStyle}>{row.right}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={comparisonInsightGrid}>
        <ComparisonInsight
          title={`${locationText(left)} · Güçlü Yönler`}
          items={advantageList(left, leftScores, leftM2, rightM2)}
          tone="positive"
        />
        <ComparisonInsight
          title={`${locationText(right)} · Güçlü Yönler`}
          items={advantageList(right, rightScores, rightM2, leftM2)}
          tone="positive"
        />
        <ComparisonInsight
          title={`${locationText(left)} · Dikkat Noktaları`}
          items={riskList(leftScores, leftM2, rightM2)}
          tone="warning"
        />
        <ComparisonInsight
          title={`${locationText(right)} · Dikkat Noktaları`}
          items={riskList(rightScores, rightM2, leftM2)}
          tone="warning"
        />
      </div>

      <div style={comparisonResult}>
        <div style={eyebrow}>5 ADIMLIK KARAR PLANI</div>
        <ol style={{ color: "#3d5c79", lineHeight: 1.75, marginBottom: 0, paddingLeft: 21 }}>
          <li>Her iki taşınmazın tapu ve takyidat kaydını doğrulayın.</li>
          <li>İmar, ruhsat ve fiilî kullanım bilgilerini resmî kaynaklarla karşılaştırın.</li>
          <li>m² fiyatını aynı mahalledeki güncel emsallerle kontrol edin.</li>
          <li>{winner ? `${locationText(winner)} için pazarlık payını ve ödeme planını netleştirin.` : "İki seçenek için de yazılı fiyat teklifi alın."}</li>
          <li>Saha ziyareti ve uzman ekspertizi sonrasında nihai kararı verin.</li>
        </ol>
        {winner && loser ? (
          <p style={{ color: "#607890", marginBottom: 0 }}>
            Öne çıkan seçeneğin bileşik puanı {winner.id === left.id ? leftComposite : rightComposite}/100,
            diğer seçeneğin puanı {loser.id === left.id ? leftComposite : rightComposite}/100 olarak hesaplandı.
            Bu skor karar desteğidir; kesin değerleme değildir.
          </p>
        ) : null}
      </div>
    </>
  );
}

function RegionalDataEngine({
  records,
  search,
  onSearch,
  editorId,
  onEditorId,
  onUpdate,
  onSave,
  onCreate,
  onImport,
  onRefresh,
  loading,
  saving,
  error,
  notice,
}: {
  records: RegionalDataRecord[];
  search: string;
  onSearch: (value: string) => void;
  editorId: string;
  onEditorId: (value: string) => void;
  onUpdate: (record: RegionalDataRecord) => void;
  onSave: (record: RegionalDataRecord) => void;
  onCreate: () => void;
  onImport: (file: File) => void;
  onRefresh: () => void;
  loading: boolean;
  saving: boolean;
  error: string;
  notice: string;
}) {
  const [factoryMessage, setFactoryMessage] = useState("");

  const filtered = records.filter((item) =>
    `${item.city} ${item.district} ${item.neighborhood} ${item.propertyType}`
      .toLocaleLowerCase("tr-TR")
      .includes(search.toLocaleLowerCase("tr-TR")),
  );

  const selected = records.find((item) => item.id === editorId) ?? null;

  const [todayMs] = useState(() => Date.now());
  const validDateMs = (value: string) => {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const staleRecords = records.filter((item) => {
    const dateMs = validDateMs(item.periodDate || item.updatedAt);
    return dateMs > 0 && todayMs - dateMs > 1000 * 60 * 60 * 24 * 180;
  });
  const sourceReadyRecords = records.filter(
    (item) => item.source.trim() && item.source !== "unknown" && item.source !== "system" && item.sourceNote.trim(),
  );
  const decisionReadyRecords = records.filter(
    (item) => item.averageM2 > 0 && item.rentM2 > 0 && item.dataConfidence >= 60 && item.sampleSize > 0,
  );
  const coveredCities = new Set(records.filter((item) => item.city).map((item) => item.city)).size;
  const coveredDistricts = new Set(
    records.filter((item) => item.city && item.district).map((item) => `${item.city}/${item.district}`),
  ).size;

  const missingSourceRecords = records.filter(
    (item) => !item.source.trim() || item.source === "unknown" || item.source === "system" || !item.sourceNote.trim(),
  );
  const missingPriceRecords = records.filter((item) => item.averageM2 <= 0 || item.rentM2 <= 0);
  const lowConfidenceRecords = records.filter((item) => item.dataConfidence < 60);
  const updateQueue = Array.from(new Map(
    [...staleRecords, ...missingSourceRecords, ...missingPriceRecords, ...lowConfidenceRecords]
      .map((item) => [item.id, item]),
  ).values());

  const readinessRate = Math.round((decisionReadyRecords.length / Math.max(1, records.length)) * 100);
  const sourceRate = Math.round((sourceReadyRecords.length / Math.max(1, records.length)) * 100);
  const freshnessRate = Math.round(((records.length - staleRecords.length) / Math.max(1, records.length)) * 100);
  const cityCoverageRate = Math.round((coveredCities / 81) * 100);
  const averageConfidence = Math.round(
    records.reduce((sum, item) => sum + item.dataConfidence, 0) / Math.max(1, records.length),
  );
  const cityOperations = Array.from(
    records.reduce((map, item) => {
      const key = item.city || "Belirsiz";
      const current = map.get(key) ?? { city: key, total: 0, ready: 0, confidence: 0 };
      current.total += 1;
      current.confidence += item.dataConfidence;
      if (item.averageM2 > 0 && item.rentM2 > 0 && item.dataConfidence >= 60 && item.sampleSize > 0) current.ready += 1;
      map.set(key, current);
      return map;
    }, new Map<string, { city: string; total: number; ready: number; confidence: number }>()),
  )
    .map(([, value]) => ({ ...value, confidence: Math.round(value.confidence / Math.max(1, value.total)) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 6);

  const operationTasks = [
    { label: "Fiyat verisi eksik", count: missingPriceRecords.length, action: "Kaynaklı CSV yükle", tone: "#c2410c", bg: "#fff7ed" },
    { label: "Kaynak açıklaması eksik", count: missingSourceRecords.length, action: "Kaynak notunu tamamla", tone: "#a16207", bg: "#fffbeb" },
    { label: "Güven puanı düşük", count: lowConfidenceRecords.length, action: "Örneklemi doğrula", tone: "#7c3aed", bg: "#f5f3ff" },
    { label: "180 günü aşan", count: staleRecords.length, action: "Veriyi güncelle", tone: "#b91c1c", bg: "#fef2f2" },
  ];

  const runFactoryAudit = () => {
    if (!records.length) {
      setFactoryMessage("Denetlenecek piyasa kaydı bulunmuyor. Önce kaynaklı kayıt yükleyin.");
      return;
    }
    setFactoryMessage(
      `Denetim tamamlandı: ${decisionReadyRecords.length} kayıt karara hazır, ${updateQueue.length} kayıt güncelleme kuyruğuna alındı.`,
    );
  };

  const exportUpdateQueue = () => {
    if (!updateQueue.length) {
      setFactoryMessage("Güncelleme kuyruğunda kayıt bulunmuyor.");
      return;
    }
    const columns = [
      "city", "district", "neighborhood", "property_type", "period_date", "source_name",
      "listing_count", "sale_price_m2", "rent_price_m2", "confidence_score", "issue",
    ];
    const escapeCsv = (value: string | number) => {
      const raw = String(value ?? "");
      return /[;"\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
    };
    const rows = updateQueue.map((item) => {
      const issues = [
        staleRecords.some((record) => record.id === item.id) ? "180 günü aşmış" : "",
        missingSourceRecords.some((record) => record.id === item.id) ? "kaynak eksik" : "",
        missingPriceRecords.some((record) => record.id === item.id) ? "satış veya kira verisi eksik" : "",
        lowConfidenceRecords.some((record) => record.id === item.id) ? "güven puanı düşük" : "",
      ].filter(Boolean).join(", ");
      return [
        item.city, item.district, item.neighborhood, item.propertyType, item.periodDate, item.source,
        item.sampleSize, item.averageM2, item.rentM2, item.dataConfidence, issues,
      ].map(escapeCsv).join(";");
    });
    const blob = new Blob(["\uFEFF", columns.join(";"), "\n", rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `yasam-ai-veri-guncelleme-kuyrugu-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setFactoryMessage(`${updateQueue.length} kayıtlık güncelleme kuyruğu indirildi.`);
  };

  const exportCsv = () => {
    const columns = [
      "city", "district", "neighborhood", "property_type", "period_date", "source_name",
      "listing_count", "sale_price_m2", "rent_price_m2", "annual_change_percent",
      "confidence_score", "liquidity_score", "infrastructure_score", "transport_score", "source_note",
    ];
    const escapeCsv = (value: string | number) => {
      const raw = String(value ?? "");
      return /[;"\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
    };
    const rows = records.map((item) => [
      item.city, item.district, item.neighborhood, item.propertyType, item.periodDate, item.source,
      item.sampleSize, item.averageM2, item.rentM2, item.annualChange, item.dataConfidence,
      item.liquidityScore, item.infrastructureScore, item.transportScore, item.sourceNote,
    ].map(escapeCsv).join(";"));
    const blob = new Blob(["\uFEFF", columns.join(";"), "\n", rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `yasam-ai-market-data-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const updateField = <K extends keyof RegionalDataRecord>(
    key: K,
    value: RegionalDataRecord[K],
  ) => {
    if (!selected) return;
    onUpdate({ ...selected, [key]: value, updatedAt: new Date().toISOString().slice(0, 10) });
  };

  return (
    <section style={regionalEnginePanel}>
      <div style={regionalEngineHeader}>
        <div>
          <div style={eyebrow}>GERÇEK VERİ TEMELİ</div>
          <h2 style={{ color: "#153a65", fontSize: "clamp(25px,4vw,36px)", margin: "7px 0" }}>
            Türkiye Geneli Gerçek Veri Motoru
          </h2>
          <p style={{ color: "#607890", maxWidth: 820, lineHeight: 1.65, margin: 0 }}>
            Bu panel Türkiye genelindeki il, ilçe ve mahalle bazlı doğrulanmış piyasa kayıtlarını
            Supabase market_data tablosundan okur. Sıfır görünen alanlar tahmin değildir; doğrulanmış veri
            gelene kadar AI karar motorunda kesin fiyat verisi olarak kullanılmaz.
          </p>
        </div>
        <div style={dataStatusBadge}>
          <span style={summaryLabel}>CANLI VERİ KAYDI</span>
          <strong style={{ color: "#153a65", fontSize: 24 }}>{records.length}</strong>
        </div>
      </div>

      <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginBottom: 14 }}>
        <button type="button" onClick={onRefresh} style={softButton} disabled={loading}>
          {loading ? "Veriler Yükleniyor..." : "Supabase Verilerini Yenile"}
        </button>
        <button type="button" onClick={onCreate} style={softButton} disabled={saving}>
          + Yeni Doğrulanmış Kayıt
        </button>
        <label style={{ ...softButton, cursor: saving ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center" }}>
          {saving ? "İşleniyor..." : "CSV ile Toplu Gerçek Veri Yükle"}
          <input
            type="file"
            accept=".csv,text/csv"
            disabled={saving}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onImport(file);
              event.currentTarget.value = "";
            }}
            style={{ display: "none" }}
          />
        </label>
        <a href="/templates/market-data-import-template.csv" download style={{ ...softButton, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
          CSV Şablonunu İndir
        </a>
        <button type="button" onClick={exportCsv} style={softButton} disabled={!records.length}>
          Kayıtları CSV Dışa Aktar
        </button>
        <span style={secureBadge}>market_data canlı bağlantı</span>
      </div>

      {notice ? <div style={successNotice}>{notice}</div> : null}
      {error ? <div style={errorNotice}>{error}</div> : null}

      <section style={{ marginTop: 16, padding: 18, borderRadius: 22, border: "1px solid #cfe1ef", background: "linear-gradient(145deg,#ffffff,#f1f8fd)", boxShadow: "0 18px 42px rgba(31,78,121,.08)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <div style={eyebrow}>TÜRKİYE VERİ OPERASYON MERKEZİ</div>
            <h3 style={{ margin: "6px 0 4px", color: "#153a65", fontSize: 24 }}>Veri sağlığını tek ekrandan yönetin</h3>
            <p style={{ margin: 0, maxWidth: 760, color: "#607890", fontSize: 12, lineHeight: 1.55 }}>
              Kapsam, güncellik, kaynak disiplini ve karar motoru hazırlığını birlikte izler. Rakamlar doğrudan Supabase market_data kayıtlarından hesaplanır.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span style={{ ...secureBadge, background: readinessRate >= 80 ? "#e9f9ef" : "#fff7e6", color: readinessRate >= 80 ? "#167347" : "#9a6200" }}>Karar hazırlığı %{readinessRate}</span>
            <span style={secureBadge}>Son denetim: Canlı</span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 11, marginTop: 16 }}>
          {[
            ["Türkiye kapsamı", `${coveredCities}/81 il`, cityCoverageRate, "İl kapsam oranı"],
            ["Karara hazır veri", `${decisionReadyRecords.length}/${records.length}`, readinessRate, "AI analizine uygun"],
            ["Kaynak bütünlüğü", `%${sourceRate}`, sourceRate, "Kaynak ve açıklama tam"],
            ["Veri güncelliği", `%${freshnessRate}`, freshnessRate, "180 gün içinde"],
          ].map(([label, value, rate, caption]) => (
            <article key={String(label)} style={{ padding: 15, borderRadius: 17, border: "1px solid #dbe8f2", background: "#fff" }}>
              <span style={{ color: "#74899e", fontSize: 10, fontWeight: 900 }}>{label}</span>
              <strong style={{ display: "block", marginTop: 7, color: "#153a65", fontSize: 22 }}>{value}</strong>
              <div style={{ height: 6, marginTop: 11, borderRadius: 999, background: "#e8f0f6", overflow: "hidden" }}>
                <div style={{ width: `${Math.max(2, Math.min(100, Number(rate)))}%`, height: "100%", borderRadius: 999, background: "linear-gradient(90deg,#0876c9,#2bb5e8)" }} />
              </div>
              <span style={{ display: "block", marginTop: 7, color: "#91a2b2", fontSize: 9 }}>{caption}</span>
            </article>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.15fr) minmax(280px,.85fr)", gap: 13, marginTop: 14 }}>
          <article style={{ padding: 15, borderRadius: 17, border: "1px solid #dbe8f2", background: "#fff" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
              <div>
                <strong style={{ color: "#153a65", fontSize: 13 }}>İl bazlı veri sağlığı</strong>
                <span style={{ display: "block", marginTop: 3, color: "#91a2b2", fontSize: 9 }}>En çok kaydı bulunan iller</span>
              </div>
              <span style={{ color: "#0876c9", fontSize: 10, fontWeight: 900 }}>Ort. güven %{averageConfidence}</span>
            </div>
            <div style={{ display: "grid", gap: 9, marginTop: 13 }}>
              {cityOperations.length ? cityOperations.map((item) => {
                const rate = Math.round((item.ready / Math.max(1, item.total)) * 100);
                return (
                  <div key={item.city} style={{ display: "grid", gridTemplateColumns: "100px minmax(0,1fr) 70px", gap: 10, alignItems: "center" }}>
                    <strong style={{ color: "#34536f", fontSize: 10 }}>{item.city}</strong>
                    <div style={{ height: 7, borderRadius: 999, background: "#edf3f8", overflow: "hidden" }}>
                      <div style={{ width: `${Math.max(3, rate)}%`, height: "100%", borderRadius: 999, background: rate >= 70 ? "linear-gradient(90deg,#19a974,#65d6a7)" : "linear-gradient(90deg,#e6a23c,#ffd27a)" }} />
                    </div>
                    <span style={{ color: "#74899e", fontSize: 9, textAlign: "right" }}>{item.ready}/{item.total} hazır</span>
                  </div>
                );
              }) : <span style={{ color: "#91a2b2", fontSize: 10 }}>Henüz il bazlı piyasa kaydı bulunmuyor.</span>}
            </div>
          </article>

          <article style={{ padding: 15, borderRadius: 17, border: "1px solid #dbe8f2", background: "#fff" }}>
            <strong style={{ color: "#153a65", fontSize: 13 }}>Öncelikli operasyonlar</strong>
            <span style={{ display: "block", marginTop: 3, color: "#91a2b2", fontSize: 9 }}>Veri ekibinin sıradaki görevleri</span>
            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              {operationTasks.map((task) => (
                <div key={task.label} style={{ display: "grid", gridTemplateColumns: "34px minmax(0,1fr)", gap: 9, alignItems: "center", padding: 10, borderRadius: 13, background: task.bg, border: `1px solid ${task.tone}22` }}>
                  <strong style={{ display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: 10, color: task.tone, background: "rgba(255,255,255,.75)", fontSize: 12 }}>{task.count}</strong>
                  <div>
                    <strong style={{ display: "block", color: "#34536f", fontSize: 10 }}>{task.label}</strong>
                    <span style={{ display: "block", marginTop: 2, color: task.tone, fontSize: 9, fontWeight: 850 }}>{task.count ? task.action : "İşlem gerekmiyor"}</span>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center", marginTop: 14, padding: 13, borderRadius: 15, background: "linear-gradient(90deg,#123b66,#0876c9)", color: "#fff" }}>
          <div>
            <strong style={{ display: "block", fontSize: 12 }}>Bugünün veri operasyon özeti</strong>
            <span style={{ display: "block", marginTop: 3, fontSize: 10, opacity: .82 }}>{records.length} kayıt izlendi · {updateQueue.length} kayıt müdahale bekliyor · {decisionReadyRecords.length} kayıt karar motorunda kullanılabilir.</span>
          </div>
          <button type="button" onClick={runFactoryAudit} style={{ ...softButton, background: "#fff", borderColor: "#fff", color: "#0876c9" }}>Şimdi Denetle</button>
        </div>
      </section>

      <div style={{ ...dataQualityGrid, marginTop: 16 }}>
        <DataQualityCard label="Toplam Kayıt" value={String(records.length)} />
        <DataQualityCard label="Karara Hazır" value={String(decisionReadyRecords.length)} />
        <DataQualityCard label="Kaynağı Tam" value={String(sourceReadyRecords.length)} />
        <DataQualityCard
          label="Ortalama Güven"
          value={`%${Math.round(records.reduce((sum, item) => sum + item.dataConfidence, 0) / Math.max(1, records.length))}`}
        />
      </div>

      <div style={{ ...dataQualityGrid, marginTop: 10 }}>
        <DataQualityCard label="Kapsanan İl" value={`${coveredCities}/81`} />
        <DataQualityCard label="Kapsanan İlçe" value={String(coveredDistricts)} />
        <DataQualityCard label="180 Günü Aşan" value={String(staleRecords.length)} />
        <DataQualityCard label="Fiyat Verisi Hazır" value={String(records.filter((item) => item.averageM2 > 0).length)} />
      </div>

      <div style={{ ...successNotice, background: "#f6f9fc", color: "#526f89", border: "1px solid #dce8f2", marginTop: 12 }}>
        <strong style={{ color: "#153a65" }}>Veri kalite kuralı:</strong> Karar motoruna hazır sayılabilmesi için satış ve kira m² değeri, en az %60 güven, örneklem sayısı ve açıklanmış kaynak birlikte bulunmalıdır. 180 günü aşan kayıtlar güncelleme bekleyen veri olarak işaretlenir.
      </div>

      <section style={{ marginTop: 14, padding: 16, borderRadius: 18, border: "1px solid #d8e7f3", background: "linear-gradient(145deg,#f8fcff,#eef7ff)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div>
            <div style={eyebrow}>YAŞAM AI VERİ FABRİKASI</div>
            <h3 style={{ color: "#153a65", margin: "6px 0", fontSize: 21 }}>Veri denetimi ve güncelleme kuyruğu</h3>
            <p style={{ color: "#607890", margin: 0, maxWidth: 760, lineHeight: 1.55, fontSize: 12 }}>
              Kayıtları kaynak, güncellik, fiyat bütünlüğü ve güven puanı bakımından denetler. Bu merkez internetten izinsiz veri çekmez;
              lisanslı API, kurumsal ortaklık veya kaynaklı CSV ile gelen kayıtları güvenli biçimde işleme hazırlar.
            </p>
          </div>
          <span style={secureBadge}>Denetlenebilir veri hattı</span>
        </div>

        <div style={{ ...dataQualityGrid, marginTop: 14 }}>
          <DataQualityCard label="Güncelleme Kuyruğu" value={String(updateQueue.length)} />
          <DataQualityCard label="Kaynak Eksiği" value={String(missingSourceRecords.length)} />
          <DataQualityCard label="Fiyat Eksiği" value={String(missingPriceRecords.length)} />
          <DataQualityCard label="Düşük Güven" value={String(lowConfidenceRecords.length)} />
        </div>

        <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 13 }}>
          <button type="button" onClick={runFactoryAudit} style={softButton}>Veri Fabrikasını Denetle</button>
          <button type="button" onClick={exportUpdateQueue} style={softButton} disabled={!records.length}>Güncelleme Kuyruğunu İndir</button>
          <button type="button" onClick={onRefresh} style={softButton} disabled={loading}>Canlı Veriyi Yeniden Oku</button>
        </div>

        {factoryMessage ? (
          <div style={{ ...successNotice, marginTop: 12 }}>{factoryMessage}</div>
        ) : null}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginTop: 13 }}>
          {[
            ["1", "Kaynak Girişi", "Lisanslı API, kurumsal veri veya kaynaklı CSV"],
            ["2", "Kalite Denetimi", "Mükerrer kayıt, tarih, örneklem ve güven kontrolü"],
            ["3", "Güncelleme Kuyruğu", "Eksik veya eski kayıtların görev listesi"],
            ["4", "Karar Motoru", "Yalnızca karara hazır verinin AI analizinde kullanılması"],
          ].map(([step, title, caption]) => (
            <article key={step} style={{ padding: 13, borderRadius: 14, border: "1px solid #dce8f2", background: "#fff" }}>
              <span style={{ display: "inline-grid", placeItems: "center", width: 26, height: 26, borderRadius: 999, background: "#eaf6ff", color: "#0876c9", fontSize: 11, fontWeight: 950 }}>{step}</span>
              <strong style={{ display: "block", marginTop: 8, color: "#153a65", fontSize: 12 }}>{title}</strong>
              <span style={{ display: "block", marginTop: 4, color: "#74899e", fontSize: 10, lineHeight: 1.45 }}>{caption}</span>
            </article>
          ))}
        </div>
      </section>

      <div style={dataToolbar}>
        <input
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Mahalle veya taşınmaz türü ara..."
          style={dataSearchInput}
        />
        <select
          value={editorId}
          onChange={(event) => onEditorId(event.target.value)}
          style={dataSearchInput}
        >
          <option value="">Düzenlenecek kaydı seç</option>
          {records.map((item) => (
            <option key={item.id} value={item.id}>
              {item.city} / {item.district} / {item.neighborhood} · {item.propertyType}
            </option>
          ))}
        </select>
      </div>

      {selected ? (
        <article style={dataEditorCard}>
          <div>
            <div style={eyebrow}>DOĞRULANMIŞ VERİ GİRİŞİ</div>
            <h3 style={{ color: "#153a65", margin: "6px 0" }}>
              {selected.city} / {selected.district} / {selected.neighborhood} · {selected.propertyType}
            </h3>
          </div>

          <div style={dataEditorGrid}>
            <DataNumberField
              label="Ortalama m² Satış Fiyatı"
              value={selected.averageM2}
              onChange={(value) => updateField("averageM2", value)}
            />
            <DataNumberField
              label="Ortalama m² Kira"
              value={selected.rentM2}
              onChange={(value) => updateField("rentM2", value)}
            />
            <DataNumberField
              label="Yıllık Değişim %"
              value={selected.annualChange}
              onChange={(value) => updateField("annualChange", value)}
            />
            <DataNumberField
              label="Likidite Puanı"
              value={selected.liquidityScore}
              onChange={(value) => updateField("liquidityScore", Math.min(100, value))}
            />
            <DataNumberField
              label="Altyapı Puanı"
              value={selected.infrastructureScore}
              onChange={(value) => updateField("infrastructureScore", Math.min(100, value))}
            />
            <DataNumberField
              label="Ulaşım Puanı"
              value={selected.transportScore}
              onChange={(value) => updateField("transportScore", Math.min(100, value))}
            />
            <DataNumberField
              label="Veri Güven %"
              value={selected.dataConfidence}
              onChange={(value) => updateField("dataConfidence", Math.min(100, value))}
            />
            <DataNumberField
              label="Örneklem Sayısı"
              value={selected.sampleSize}
              onChange={(value) => updateField("sampleSize", Math.max(0, value))}
            />
          </div>

          <div style={dataEditorGrid}>
            <label style={{ display: "grid", gap: 7, color: "#607890", fontSize: 13 }}>
              Veri kaynağı
              <input
                value={selected.source}
                onChange={(event) => updateField("source", event.target.value)}
                style={dataSearchInput}
                placeholder="manual_verified, ekspertiz, belediye..."
              />
            </label>
            <label style={{ display: "grid", gap: 7, color: "#607890", fontSize: 13 }}>
              Dönem tarihi
              <input
                type="date"
                value={selected.periodDate}
                onChange={(event) => updateField("periodDate", event.target.value)}
                style={dataSearchInput}
              />
            </label>
          </div>

          <label style={{ display: "grid", gap: 7, marginTop: 12, color: "#607890", fontSize: 13 }}>
            Kaynak ve doğrulama notu
            <textarea
              value={selected.sourceNote}
              onChange={(event) => updateField("sourceNote", event.target.value)}
              style={{ ...dataSearchInput, minHeight: 90, resize: "vertical" as const }}
            />
          </label>

          <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 14 }}>
            <button
              type="button"
              onClick={() => onSave(selected)}
              style={blueButton}
              disabled={saving || !selected.city.trim() || !selected.district.trim()}
            >
              {saving ? "Supabase'e Kaydediliyor..." : "Gerçek Veri Kaydını Kaydet"}
            </button>
          </div>

          <div style={dataWarningBox}>
            Gerçek veri girildiğinde kaynak notunu mutlaka yazın: tapu/ekspertiz, belediye, saha araştırması,
            doğrulanmış satış veya güvenilir kurumsal veri. Kaynaksız rakamlar “doğrulanmış veri” sayılmaz.
          </div>
        </article>
      ) : null}

      <div style={regionalTableWrap}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Bölge</th>
              <th style={thStyle}>Tür</th>
              <th style={thStyle}>m² Satış</th>
              <th style={thStyle}>Yıllık Değişim</th>
              <th style={thStyle}>Likidite</th>
              <th style={thStyle}>Ulaşım</th>
              <th style={thStyle}>Veri Güven</th>
              <th style={thStyle}>Kalite Durumu</th>
              <th style={thStyle}>Güncelleme</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.id}>
                <td style={tdStyle}>
                  <strong>{item.city} / {item.district} / {item.neighborhood}</strong>
                </td>
                <td style={tdStyle}>{item.propertyType}</td>
                <td style={tdStyle}>
                  {item.averageM2 > 0 ? formatCurrency(String(item.averageM2)) : "Veri bekleniyor"}
                </td>
                <td style={tdStyle}>{item.annualChange ? `%${item.annualChange}` : "—"}</td>
                <td style={tdStyle}>{item.liquidityScore}/100</td>
                <td style={tdStyle}>{item.transportScore}/100</td>
                <td style={tdStyle}>%{item.dataConfidence}</td>
                <td style={tdStyle}>
                  {item.averageM2 > 0 && item.rentM2 > 0 && item.dataConfidence >= 60 && item.sampleSize > 0
                    ? "Karara hazır"
                    : item.averageM2 > 0
                      ? "Eksik doğrulama"
                      : "Veri bekleniyor"}
                </td>
                <td style={tdStyle}>{item.updatedAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={dataRoadmapBox}>
        <strong>Veri disiplini</strong>
        <p>
          Bu ekran artık yalnızca Supabase&apos;te bulunan kaynaklı kayıtları gösterir. CSV içe aktarma sırasında
          kaynak notu, örneklem ve güven puanı zorunludur. Resmî makro göstergeler ile mahalle bazlı fiyat
          verileri ayrı tutulmalı; kaynağı olmayan rakam sisteme “gerçek veri” olarak alınmamalıdır.
        </p>
      </div>
    </section>
  );
}

function DataQualityCard({ label, value }: { label: string; value: string }) {
  return (
    <article style={dataQualityCard}>
      <span style={summaryLabel}>{label}</span>
      <strong style={{ color: "#153a65", fontSize: 22 }}>{value}</strong>
    </article>
  );
}

function DataNumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label style={{ display: "grid", gap: 6, color: "#607890", fontSize: 12 }}>
      {label}
      <input
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        style={dataSearchInput}
      />
    </label>
  );
}

function ExecutiveMetric({ label, value }: { label: string; value: string }) {
  return (
    <article style={executiveMetricCard}>
      <span style={summaryLabel}>{label}</span>
      <strong style={{ color: "#153a65", fontSize: 18, lineHeight: 1.35 }}>{value}</strong>
    </article>
  );
}

function ScenarioCard({
  title,
  askingPrice,
  values,
}: {
  title: string;
  askingPrice: number;
  values: { cautious: number; normal: number; strong: number };
}) {
  const rows = [
    { label: "Bugünkü Talep", value: askingPrice, note: "Başlangıç" },
    { label: "Temkinli Senaryo", value: values.cautious, note: "Yıllık %3" },
    { label: "Normal Senaryo", value: values.normal, note: "Yıllık %8" },
    { label: "Güçlü Senaryo", value: values.strong, note: "Yıllık %14" },
  ];
  return (
    <article style={scenarioCard}>
      <strong style={{ color: "#153a65", fontSize: 17 }}>{title}</strong>
      <div style={{ display: "grid", gap: 9, marginTop: 12 }}>
        {rows.map((row) => (
          <div key={row.label} style={scenarioRow}>
            <div>
              <strong style={{ display: "block", color: "#526f89", fontSize: 13 }}>{row.label}</strong>
              <span style={{ color: "#8a9caf", fontSize: 11 }}>{row.note}</span>
            </div>
            <strong style={{ color: "#153a65" }}>
              {row.value ? formatCurrency(String(row.value)) : "—"}
            </strong>
          </div>
        ))}
      </div>
    </article>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <article style={metricCard}>
      <span style={summaryLabel}>{label}</span>
      <strong style={{ color: "#153a65", fontSize: 23 }}>{value}</strong>
    </article>
  );
}

function ScoreChart({
  title,
  composite,
  scores,
}: {
  title: string;
  composite: number;
  scores: ScoreMap;
}) {
  const bars = [
    { label: "Bileşik", value: composite },
    { label: "Yatırım", value: scores.investment ?? 0 },
    { label: "Fırsat", value: scores.opportunity ?? 0 },
    { label: "Likidite", value: scores.liquidity ?? 0 },
    { label: "Veri Güven", value: scores.trust ?? 0 },
    { label: "Risk Avantajı", value: 100 - (scores.risk ?? 50) },
  ];
  return (
    <article style={scoreChartCard}>
      <strong style={{ color: "#153a65" }}>{title}</strong>
      <div style={{ display: "grid", gap: 10, marginTop: 13 }}>
        {bars.map((bar) => (
          <div key={bar.label}>
            <div style={chartLabelRow}>
              <span>{bar.label}</span>
              <strong>{bar.value}/100</strong>
            </div>
            <div style={chartTrack}>
              <div style={{ ...chartFill, width: `${Math.max(0, Math.min(100, bar.value))}%` }} />
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function NegotiationCard({
  title,
  askingPrice,
  discount,
  onChange,
  offer,
  saving,
}: {
  title: string;
  askingPrice: number;
  discount: number;
  onChange: (value: number) => void;
  offer: number;
  saving: number;
}) {
  return (
    <article style={negotiationCard}>
      <strong style={{ color: "#153a65" }}>{title}</strong>
      <div style={negotiationStatRow}>
        <span>Talep fiyatı</span>
        <strong>{askingPrice ? formatCurrency(String(askingPrice)) : "—"}</strong>
      </div>
      <label style={{ display: "grid", gap: 7, color: "#607890", fontSize: 13 }}>
        Pazarlık oranı: <strong style={{ color: "#153a65" }}>%{discount}</strong>
        <input
          type="range"
          min="0"
          max="25"
          value={discount}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </label>
      <div style={negotiationOfferBox}>
        <span style={summaryLabel}>ÖNERİLEN TEKLİF</span>
        <strong style={{ color: "#153a65", fontSize: 22 }}>
          {offer ? formatCurrency(String(offer)) : "—"}
        </strong>
      </div>
      <div style={negotiationStatRow}>
        <span>Yaklaşık tasarruf</span>
        <strong style={{ color: "#047857" }}>{saving ? formatCurrency(String(saving)) : "—"}</strong>
      </div>
    </article>
  );
}

function ComparisonInsight({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "positive" | "warning";
}) {
  const style = tone === "positive"
    ? { background: "#effcf6", borderColor: "#b7ebd1", color: "#176b4c" }
    : { background: "#fff9ec", borderColor: "#f5d88b", color: "#805d12" };
  return (
    <article style={{ ...comparisonInsightCard, ...style }}>
      <strong>{title}</strong>
      <ul style={{ margin: "9px 0 0", paddingLeft: 20, lineHeight: 1.65 }}>
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </article>
  );
}

function ComparisonCard({
  item,
  title,
  composite,
  winner,
}: {
  item: CloudRecord;
  title: string;
  composite: number;
  winner: boolean;
}) {
  return (
    <article style={{ ...comparisonCard, ...(winner ? comparisonWinnerCard : {}) }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <div style={eyebrow}>{title.toUpperCase()}</div>
        {winner ? <span style={winnerBadge}>AI ÖNERİSİ</span> : null}
      </div>
      <h3 style={{ color: "#153a65", margin: "9px 0 6px" }}>{locationText(item)}</h3>
      <div style={{ color: "#61788f" }}>
        {item.property_type} · {item.area || "—"} m²
      </div>
      <strong style={{ display: "block", marginTop: 9, color: "#153a65", fontSize: 19 }}>
        {formatCurrency(item.asking_price)}
      </strong>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginTop: 12 }}>
        <span style={{ ...decisionBadge, ...decisionTone(item.decision ?? "DEĞERLENDİR") }}>
          {item.decision ?? "DEĞERLENDİR"}
        </span>
        <span style={compositeBadge}>{composite}/100</span>
      </div>
      <a href={googleMapsUrl(item)} target="_blank" rel="noreferrer" style={{ ...linkButton, marginTop: 12 }}>
        Haritada İncele
      </a>
    </article>
  );
}

const loadingPage = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  padding: 40,
  color: "#fff",
  background: "linear-gradient(135deg,#061b3a,#0874c9)",
  fontFamily: "Arial, Helvetica, sans-serif",
  fontWeight: 800,
};

const pageStyle = {
  minHeight: "100vh",
  padding: "26px 18px 52px",
  background:
    "radial-gradient(circle at 88% 3%,rgba(0,157,255,.42),transparent 28%),radial-gradient(circle at 5% 35%,rgba(35,103,190,.42),transparent 26%),linear-gradient(135deg,#03152f,#073b70 56%,#0876c9)",
  fontFamily: "Arial, Helvetica, sans-serif",
};

const premiumSignalBar = {
  marginBottom: 12,
  padding: "9px 12px",
  borderRadius: 16,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap" as const,
  background: "linear-gradient(90deg,rgba(5,21,48,.96),rgba(8,61,117,.92) 55%,rgba(37,28,93,.88))",
  border: "1px solid rgba(137,211,255,.26)",
  boxShadow: "0 14px 36px rgba(1,16,43,.22), inset 0 1px 0 rgba(255,255,255,.06)",
  color: "#fff",
  backdropFilter: "blur(14px)",
};

const premiumSignalIcon = {
  width: 31,
  height: 31,
  borderRadius: 11,
  display: "grid",
  placeItems: "center",
  background: "linear-gradient(145deg,#2ce2f0,#3574f4 58%,#8357e9)",
  boxShadow: "0 8px 22px rgba(59,130,246,.34), inset 0 1px 0 rgba(255,255,255,.36)",
  fontWeight: 950,
  color: "#fff",
};

const signalPill = {
  padding: "6px 9px",
  borderRadius: 999,
  background: "rgba(52,211,153,.10)",
  border: "1px solid rgba(110,231,183,.24)",
  color: "#b9f7dc",
  fontSize: 8.5,
  fontWeight: 950,
  letterSpacing: .45,
};

const heroStyle = {
  position: "relative" as const,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "stretch",
  gap: 22,
  flexWrap: "wrap" as const,
  color: "#fff",
  marginTop: 10,
  marginBottom: 22,
  padding: "clamp(24px,3vw,34px)",
  borderRadius: 32,
  overflow: "hidden",
  background:
    "radial-gradient(circle at 8% 0%,rgba(40,207,255,.24),transparent 31%),radial-gradient(circle at 74% 10%,rgba(103,88,255,.20),transparent 30%),radial-gradient(circle at 100% 100%,rgba(3,151,255,.22),transparent 36%),linear-gradient(145deg,rgba(2,20,52,.97),rgba(7,52,111,.94) 55%,rgba(11,40,93,.96))",
  border: "1px solid rgba(145,218,255,.25)",
  boxShadow: "0 34px 82px rgba(0,13,42,.32), 0 0 0 1px rgba(74,174,255,.06), inset 0 1px 0 rgba(255,255,255,.10)",
  backdropFilter: "blur(18px) saturate(125%)",
};

const versionBadge = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  padding: "7px 11px",
  borderRadius: 999,
  background: "linear-gradient(90deg,rgba(46,212,255,.12),rgba(124,92,255,.10))",
  border: "1px solid rgba(118,218,255,.30)",
  color: "#c9f3ff",
  fontWeight: 950,
  fontSize: 9.5,
  letterSpacing: 1.05,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,.06)",
};

const heroTitle = {
  fontSize: "clamp(39px,5.2vw,64px)",
  lineHeight: .98,
  margin: "16px 0 12px",
  letterSpacing: -2.2,
  maxWidth: 900,
  textShadow: "0 12px 36px rgba(0,0,0,.22)",
};

const heroText = {
  maxWidth: 800,
  color: "rgba(231,244,255,.78)",
  margin: 0,
  lineHeight: 1.62,
  fontSize: "clamp(13px,1.3vw,15.5px)",
};

const heroTitleAccent = {
  background: "linear-gradient(90deg,#ffffff 0%,#94efff 34%,#b9b8ff 67%,#ffd7f3 100%)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
  filter: "drop-shadow(0 8px 22px rgba(67,190,255,.12))",
};

const heroAmbientOrb = {
  position: "absolute" as const,
  width: 340,
  height: 340,
  borderRadius: "50%",
  right: 140,
  top: -210,
  background: "radial-gradient(circle,rgba(90,187,255,.22),rgba(99,102,241,.10) 35%,transparent 70%)",
  filter: "blur(2px)",
  pointerEvents: "none" as const,
  zIndex: 0,
};

const heroPriorityCard = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 13,
  flexWrap: "wrap" as const,
  marginTop: 18,
  padding: "12px 13px",
  borderRadius: 17,
  background: "linear-gradient(90deg,rgba(32,115,211,.18),rgba(90,78,214,.13))",
  border: "1px solid rgba(115,203,255,.20)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,.05)",
};

const heroPriorityIcon = {
  display: "grid",
  placeItems: "center",
  flex: "0 0 38px",
  width: 38,
  height: 38,
  borderRadius: 13,
  background: "linear-gradient(145deg,#2bc6f0,#5859ed)",
  color: "#fff",
  fontSize: 11,
  fontWeight: 950,
  letterSpacing: -.2,
  boxShadow: "0 10px 24px rgba(54,111,226,.30)",
};

const heroPriorityLabel = { display: "block", color: "#8ee8ff", fontSize: 8.5, fontWeight: 950, letterSpacing: 1.05 };
const heroPriorityText = { display: "block", color: "rgba(247,251,255,.94)", fontSize: 11.5, lineHeight: 1.45, marginTop: 2 };
const heroPriorityButton = {
  border: "1px solid rgba(255,255,255,.18)",
  borderRadius: 11,
  padding: "9px 11px",
  background: "rgba(255,255,255,.08)",
  color: "#fff",
  cursor: "pointer",
  fontSize: 9.5,
  fontWeight: 950,
  whiteSpace: "nowrap" as const,
};

const heroMetricAccentCyan = { borderColor: "rgba(74,216,255,.16)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.04),0 0 24px rgba(31,186,255,.035)" };
const heroMetricAccentViolet = { borderColor: "rgba(170,145,255,.16)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.04),0 0 24px rgba(128,92,255,.035)" };
const heroMetricAccentGreen = { borderColor: "rgba(86,230,173,.16)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.04),0 0 24px rgba(35,193,126,.035)" };
const heroMetricAccentAmber = { borderColor: "rgba(255,203,92,.16)", boxShadow: "inset 0 1px 0 rgba(255,255,255,.04),0 0 24px rgba(255,177,55,.035)" };

const heroMetricGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(4,minmax(118px,1fr))",
  gap: 9,
  marginTop: 16,
};

const heroMetricCard = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minWidth: 0,
  padding: "11px 12px",
  borderRadius: 16,
  background: "rgba(3,29,67,.52)",
  border: "1px solid rgba(255,255,255,.11)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,.035)",
  backdropFilter: "blur(10px)",
};

const heroMetricIcon = { display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: 10, background: "rgba(94,196,255,.12)", color: "#7dd5ff", fontSize: 14, fontWeight: 950 };
const heroMetricLabel = { display: "block", color: "rgba(220,239,255,.56)", fontSize: 8, fontWeight: 950, letterSpacing: .7 };
const heroMetricValue = { display: "block", color: "#fff", fontSize: 17, lineHeight: 1.1, marginTop: 2 };
const heroMetricSuffix = { fontStyle: "normal", fontSize: 9, color: "rgba(255,255,255,.5)", marginLeft: 2 };

const accountCard = {
  position: "relative" as const,
  flex: "0 1 272px",
  minWidth: 230,
  padding: 18,
  borderRadius: 25,
  background: "radial-gradient(circle at 100% 0%,rgba(86,92,255,.20),transparent 36%),linear-gradient(160deg,rgba(5,39,85,.93),rgba(3,24,58,.90))",
  border: "1px solid rgba(139,214,255,.24)",
  boxShadow: "0 22px 52px rgba(0,10,34,.28), inset 0 1px 0 rgba(255,255,255,.09)",
  backdropFilter: "blur(16px)",
  display: "flex",
  flexDirection: "column" as const,
  justifyContent: "center",
  gap: 11,
  overflow: "hidden",
};
const accountTopRow = { display: "flex", alignItems: "center", gap: 10 };
const accountStatusBadge = { padding: "5px 8px", borderRadius: 999, background: "rgba(52,211,153,.10)", border: "1px solid rgba(110,231,183,.22)", color: "#9df2c7", fontSize: 8.5, fontWeight: 950, letterSpacing: .7 };
const accountCloudRow = { display: "flex", alignItems: "center", gap: 7, padding: "9px 10px", borderRadius: 12, background: "rgba(255,255,255,.045)", border: "1px solid rgba(255,255,255,.07)", color: "rgba(226,242,255,.64)", fontSize: 9.5, lineHeight: 1.35 };
const accountAvatar = {
  display: "grid",
  placeItems: "center",
  width: 44,
  height: 44,
  borderRadius: 15,
  background: "linear-gradient(145deg,#3c82f5,#7f4de5)",
  border: "1px solid rgba(255,255,255,.28)",
  color: "#fff",
  fontWeight: 950,
  fontSize: 16,
  boxShadow: "0 10px 26px rgba(45,91,196,.34), inset 0 1px 0 rgba(255,255,255,.20)",
};

const systemMenuLabel = {
  margin: "3px 0 9px",
  color: "rgba(255,255,255,.86)",
  fontSize: 10,
  fontWeight: 950,
  letterSpacing: 1.35,
};

const navBar = {
  display: "grid",
  gridTemplateColumns: "repeat(7,minmax(148px,1fr))",
  gap: 14,
  overflowX: "auto" as const,
  alignItems: "stretch",
  padding: 13,
  borderRadius: 28,
  background: "linear-gradient(145deg,rgba(2,18,45,.45),rgba(6,45,91,.34))",
  border: "1px solid rgba(255,255,255,.14)",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,.08), 0 22px 54px rgba(0,15,40,.18)",
  marginBottom: 17,
  backdropFilter: "blur(14px)",
};

const aiPriorityBar = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
  flexWrap: "wrap" as const,
  margin: "14px 0 16px",
  padding: "14px 16px",
  borderRadius: 18,
  background: "linear-gradient(135deg,rgba(8,78,170,.50),rgba(7,35,79,.52))",
  border: "1px solid rgba(104,191,255,.20)",
  boxShadow: "0 15px 36px rgba(0,15,43,.16)",
};
const aiPriorityLeft = { display: "flex", alignItems: "center", gap: 11, minWidth: 0, flex: "1 1 560px" };
const aiPriorityIcon = { display: "grid", placeItems: "center", flex: "0 0 40px", width: 40, height: 40, borderRadius: 13, background: "linear-gradient(145deg,#1a70d9,#6438c7)", color: "#fff", fontSize: 18, boxShadow: "0 9px 24px rgba(42,85,198,.28)" };
const aiPriorityLabel = { display: "block", color: "#8fd9ff", fontSize: 9, fontWeight: 950, letterSpacing: 1.05 };
const aiPriorityText = { display: "block", color: "#fff", fontSize: 12, lineHeight: 1.45, marginTop: 2 };
const aiPriorityButton = { border: "1px solid rgba(255,255,255,.18)", borderRadius: 12, padding: "9px 12px", background: "rgba(255,255,255,.09)", color: "#fff", cursor: "pointer", fontSize: 10, fontWeight: 900 };


const statsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
  gap: 12,
  marginBottom: 14,
};

const statCard = {
  padding: 17,
  borderRadius: 18,
  background: "rgba(255,255,255,.12)",
  border: "1px solid rgba(255,255,255,.22)",
  color: "#fff",
  backdropFilter: "blur(8px)",
};

const twoColumnGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))",
  gap: 14,
};

const insightPanel = {
  marginBottom: 16,
  padding: "clamp(17px,2.6vw,24px)",
  borderRadius: 24,
  background: "linear-gradient(145deg,rgba(255,255,255,.98),rgba(241,248,255,.98))",
  border: "1px solid rgba(255,255,255,.65)",
  boxShadow: "0 18px 44px rgba(1,19,45,.16)",
};

const insightCallout = {
  marginBottom: 14,
  padding: "12px 14px",
  borderRadius: 14,
  background: "#eef6ff",
  border: "1px solid #cfe3f7",
  color: "#244c72",
  fontSize: 13,
  lineHeight: 1.5,
  fontWeight: 800,
};

const insightGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))",
  gap: 10,
};

const insightCard = {
  display: "grid",
  gridTemplateColumns: "38px minmax(0,1fr)",
  gap: 10,
  alignItems: "start",
  padding: 14,
  borderRadius: 16,
  background: "#ffffff",
  border: "1px solid #dbe7f2",
  boxShadow: "0 8px 22px rgba(23,58,92,.07)",
};

const insightIcon = {
  width: 38,
  height: 38,
  borderRadius: 12,
  display: "grid",
  placeItems: "center",
  background: "#edf5ff",
  border: "1px solid #d6e7f8",
  color: "#155f9e",
  fontWeight: 950,
  fontSize: 18,
};

const panelStyle = {
  marginBottom: 16,
  background: "rgba(255,255,255,.985)",
  borderRadius: 24,
  padding: "clamp(17px,3vw,25px)",
  boxShadow: "0 18px 50px rgba(1,19,45,.2)",
  border: "1px solid rgba(255,255,255,.5)",
};

const sectionHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 14,
  flexWrap: "wrap" as const,
  marginBottom: 17,
};

const sectionTitle = {
  margin: "5px 0 0",
  color: "#153a65",
  fontSize: "clamp(22px,3vw,30px)",
};

const eyebrow = {
  color: "#0871c9",
  fontWeight: 900,
  fontSize: 11,
  letterSpacing: 0.9,
};

const tabBar = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap" as const,
  marginBottom: 12,
};

const tabButton = {
  border: "1px solid #cbdbea",
  borderRadius: 12,
  padding: "10px 13px",
  background: "#f7fbff",
  color: "#315b84",
  cursor: "pointer",
  fontWeight: 800,
};

const activeTabButton = {
  ...tabButton,
  background: "#143e6f",
  borderColor: "#143e6f",
  color: "#fff",
};

const emptyState = {
  padding: 18,
  borderRadius: 14,
  background: "#f5f8fc",
  color: "#6b7f95",
  border: "1px dashed #bfd0e2",
  marginTop: 12,
};

const formGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
  gap: 13,
};

const labelStyle = {
  display: "grid",
  gap: 7,
  color: "#294b70",
  fontWeight: 800,
  fontSize: 14,
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  border: "1px solid #cad9e8",
  borderRadius: 12,
  padding: "13px 14px",
  fontSize: 15,
  background: "#fff",
  color: "#163b64",
  outlineColor: "#1682df",
};

const submitButton = {
  width: "100%",
  marginTop: 17,
  border: 0,
  borderRadius: 14,
  padding: "16px 20px",
  background: "linear-gradient(135deg,#0b4f92,#0079df)",
  color: "#fff",
  fontWeight: 900,
  fontSize: 16,
  cursor: "pointer",
  boxShadow: "0 12px 25px rgba(0,104,201,.24)",
};

const recordStyle = {
  border: "1px solid #dbe7f4",
  borderRadius: 16,
  padding: 15,
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  flexWrap: "wrap" as const,
  background: "linear-gradient(135deg,#fff,#fafdff)",
};

const blueButton = {
  border: 0,
  borderRadius: 11,
  padding: "10px 13px",
  background: "#143e6f",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 800,
};

const softButton = {
  border: "1px solid #bfdbfe",
  borderRadius: 11,
  padding: "10px 13px",
  background: "#eff6ff",
  color: "#175fa7",
  cursor: "pointer",
  fontWeight: 800,
};

const linkButton = {
  ...softButton,
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
};

const warningButton = {
  border: "1px solid #fde68a",
  borderRadius: 11,
  padding: "10px 13px",
  background: "#fffbeb",
  color: "#a16207",
  cursor: "pointer",
  fontWeight: 800,
};

const successButton = {
  border: "1px solid #a7f3d0",
  borderRadius: 11,
  padding: "10px 13px",
  background: "#ecfdf5",
  color: "#047857",
  cursor: "pointer",
  fontWeight: 800,
};

const dangerButton = {
  border: "1px solid #fecaca",
  borderRadius: 11,
  padding: "10px 13px",
  background: "#fff1f2",
  color: "#b91c1c",
  cursor: "pointer",
  fontWeight: 800,
};

const smallWhiteButton = {
  border: "1px solid rgba(255,255,255,.45)",
  borderRadius: 10,
  padding: "8px 11px",
  background: "rgba(255,255,255,.12)",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 800,
};

const secureBadge = {
  padding: "8px 11px",
  borderRadius: 999,
  background: "#ecfdf5",
  border: "1px solid #a7f3d0",
  color: "#047857",
  fontWeight: 900,
  fontSize: 12,
};

const decisionBadge = {
  display: "inline-flex",
  alignItems: "center",
  border: "1px solid",
  borderRadius: 999,
  padding: "6px 9px",
  fontWeight: 900,
  fontSize: 11,
};

const favoriteBadge = {
  padding: "6px 9px",
  borderRadius: 999,
  background: "#fff8d9",
  border: "1px solid #f5d568",
  color: "#8a5a00",
  fontWeight: 900,
  fontSize: 11,
};

const archiveBadge = {
  padding: "6px 9px",
  borderRadius: 999,
  background: "#f1f5f9",
  border: "1px solid #cbd5e1",
  color: "#475569",
  fontWeight: 900,
  fontSize: 11,
};

const scoreGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(175px,1fr))",
  gap: 11,
  marginBottom: 14,
};

const scoreCardStyle = {
  padding: 15,
  borderRadius: 16,
  border: "1px solid #dbe7f4",
  background: "#fbfdff",
};

const scoreBubble = {
  minWidth: 42,
  textAlign: "center" as const,
  padding: "7px 9px",
  borderRadius: 999,
  fontWeight: 900,
};

const scoreTrack = {
  height: 7,
  borderRadius: 999,
  background: "#e6eef6",
  overflow: "hidden",
};

const scoreFill = {
  height: "100%",
  borderRadius: 999,
  background: "linear-gradient(90deg,#0b4f92,#0094ee)",
};

const reportMetaGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))",
  gap: 10,
  marginBottom: 14,
};

const miniMetaStyle = {
  padding: 13,
  borderRadius: 14,
  background: "#f3f8fe",
  border: "1px solid #dce9f6",
};

const summaryLabel = {
  display: "block",
  color: "#7b8fa5",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: 0.5,
  marginBottom: 4,
  textTransform: "uppercase" as const,
};

const reportBox = {
  border: "1px solid #dbe7f4",
  borderRadius: 17,
  padding: "20px 18px",
  background: "#fbfdff",
};

const reportTextStyle = {
  whiteSpace: "pre-wrap" as const,
  lineHeight: 1.78,
  color: "#29435f",
};

const successNotice = {
  marginBottom: 14,
  padding: 13,
  borderRadius: 12,
  background: "#ecfdf5",
  color: "#047857",
  border: "1px solid #bbf7d0",
};

const errorNotice = {
  marginBottom: 14,
  padding: 13,
  borderRadius: 12,
  background: "#fff1f2",
  color: "#b91c1c",
  border: "1px solid #fecdd3",
};

const buttonRow = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap" as const,
};

const regionalEnginePanel = {
  padding: "clamp(18px,4vw,30px)",
  borderRadius: 24,
  border: "1px solid rgba(255,255,255,.55)",
  background: "rgba(255,255,255,.98)",
  boxShadow: "0 18px 50px rgba(2,24,51,.20)",
};

const regionalEngineHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 16,
  flexWrap: "wrap" as const,
};

const dataStatusBadge = {
  display: "grid",
  gap: 4,
  minWidth: 135,
  padding: "12px 16px",
  borderRadius: 15,
  border: "1px solid #cfe0ef",
  background: "#f4f9ff",
  textAlign: "center" as const,
};

const dataQualityGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
  gap: 10,
  marginTop: 16,
};

const dataQualityCard = {
  display: "grid",
  gap: 7,
  padding: 14,
  borderRadius: 14,
  border: "1px solid #dce7f0",
  background: "#f9fbfd",
};

const dataToolbar = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
  gap: 10,
  marginTop: 16,
};

const dataSearchInput = {
  width: "100%",
  boxSizing: "border-box" as const,
  border: "1px solid #cad9e8",
  borderRadius: 11,
  padding: "11px 12px",
  background: "#fff",
  color: "#153a65",
};

const dataEditorCard = {
  marginTop: 16,
  padding: "clamp(15px,3vw,22px)",
  borderRadius: 18,
  border: "1px solid #d7c17a",
  background: "linear-gradient(135deg,#fffaf0,#ffffff)",
};

const dataEditorGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))",
  gap: 10,
  marginTop: 13,
};

const dataWarningBox = {
  marginTop: 13,
  padding: 12,
  borderRadius: 12,
  border: "1px solid #f0d27d",
  background: "#fff8df",
  color: "#76570f",
  fontSize: 12,
  lineHeight: 1.55,
};

const regionalTableWrap = {
  overflowX: "auto" as const,
  marginTop: 17,
  borderRadius: 15,
  border: "1px solid #dce7f0",
};

const dataRoadmapBox = {
  marginTop: 16,
  padding: 14,
  borderRadius: 14,
  border: "1px solid #bcd8ef",
  background: "#f2f8fe",
  color: "#426680",
  lineHeight: 1.6,
};

const committeePanel = {
  marginTop: 17,
  padding: "clamp(17px,3vw,24px)",
  borderRadius: 22,
  border: "1px solid #d7c17a",
  background: "linear-gradient(135deg,#fffaf0 0%,#ffffff 52%,#eef7ff 100%)",
  boxShadow: "0 16px 40px rgba(19,54,91,.10)",
};

const committeeHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 14,
  flexWrap: "wrap" as const,
};

const reportIdentity = {
  display: "grid",
  gap: 4,
  padding: "11px 14px",
  borderRadius: 13,
  border: "1px solid #d7c17a",
  background: "rgba(255,255,255,.8)",
};

const executiveMetricGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(165px,1fr))",
  gap: 10,
  marginTop: 15,
};

const executiveMetricCard = {
  display: "grid",
  gap: 7,
  padding: 14,
  borderRadius: 14,
  border: "1px solid #dce7f0",
  background: "#fff",
};

const committeeNarrative = {
  marginTop: 14,
  padding: 15,
  borderRadius: 15,
  border: "1px solid #d8e5f0",
  background: "#f7fbff",
};

const scenarioPanel = {
  marginTop: 17,
  padding: "clamp(17px,3vw,24px)",
  borderRadius: 22,
  border: "1px solid #cfe0ef",
  background: "#fff",
};

const scenarioGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(290px,1fr))",
  gap: 12,
  marginTop: 15,
};

const scenarioCard = {
  padding: 15,
  borderRadius: 15,
  border: "1px solid #dbe7f2",
  background: "linear-gradient(180deg,#f8fbfe,#ffffff)",
};

const scenarioRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: "9px 0",
  borderBottom: "1px solid #edf2f7",
};

const actionPanel = {
  marginTop: 17,
  padding: "clamp(17px,3vw,24px)",
  borderRadius: 22,
  border: "1px solid #d8e4ee",
  background: "#fff",
};

const actionGrid = {
  display: "grid",
  gap: 9,
  marginTop: 14,
};

const actionCard = {
  display: "grid",
  gridTemplateColumns: "34px 1fr",
  alignItems: "center",
  gap: 11,
  padding: 12,
  borderRadius: 13,
  border: "1px solid #e0e9f1",
  background: "#f9fbfd",
};

const actionNumber = {
  width: 31,
  height: 31,
  display: "grid",
  placeItems: "center",
  borderRadius: 999,
  background: "#153a65",
  color: "#fff",
  fontWeight: 900,
};

const finalDecisionPanel = {
  marginTop: 18,
  padding: "clamp(20px,4vw,32px)",
  borderRadius: 25,
  color: "#fff",
  background: "linear-gradient(135deg,#062f61 0%,#096ea9 58%,#0aa0c7 100%)",
  boxShadow: "0 20px 55px rgba(3,42,82,.25)",
};

const finalDecisionTop = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 18,
  flexWrap: "wrap" as const,
};

const finalEyebrow = {
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: 1,
  color: "#f2d27a",
};

const finalScore = {
  display: "grid",
  gap: 4,
  minWidth: 145,
  padding: "13px 17px",
  textAlign: "center" as const,
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,.32)",
  background: "rgba(255,255,255,.12)",
};

const finalDecisionActions = {
  display: "flex",
  gap: 9,
  flexWrap: "wrap" as const,
  marginTop: 18,
};

const finalPrimaryButton = {
  border: "1px solid #e2bd57",
  borderRadius: 12,
  padding: "12px 15px",
  background: "linear-gradient(135deg,#e0bd5e,#a66f12)",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 900,
  textDecoration: "none",
};

const finalSecondaryButton = {
  border: "1px solid rgba(255,255,255,.42)",
  borderRadius: 12,
  padding: "12px 15px",
  background: "rgba(255,255,255,.12)",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 800,
  textDecoration: "none",
  display: "inline-flex",
  alignItems: "center",
};

const finalDisclaimer = {
  margin: "18px 0 0",
  paddingTop: 13,
  borderTop: "1px solid rgba(255,255,255,.22)",
  color: "rgba(255,255,255,.72)",
  fontSize: 12,
  lineHeight: 1.55,
};

const proDashboard = {
  marginTop: 17,
  padding: "clamp(16px,3vw,22px)",
  borderRadius: 20,
  border: "1px solid #cfe0ef",
  background: "linear-gradient(135deg,#f7fbff,#ffffff)",
};

const proDashboardHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap" as const,
};

const metricGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))",
  gap: 10,
  marginTop: 14,
};

const metricCard = {
  display: "grid",
  gap: 7,
  padding: 14,
  borderRadius: 14,
  border: "1px solid #dbe7f2",
  background: "#fff",
};

const chartGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(290px,1fr))",
  gap: 12,
  marginTop: 14,
};

const scoreChartCard = {
  padding: 15,
  borderRadius: 15,
  border: "1px solid #dce8f3",
  background: "#fff",
};

const chartLabelRow = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  color: "#56718b",
  fontSize: 12,
};

const chartTrack = {
  height: 9,
  marginTop: 5,
  borderRadius: 999,
  background: "#e8f0f7",
  overflow: "hidden",
};

const chartFill = {
  height: "100%",
  borderRadius: 999,
  background: "linear-gradient(90deg,#0a6fc2,#19a1d8)",
};

const negotiationPanel = {
  marginTop: 17,
  padding: "clamp(16px,3vw,22px)",
  borderRadius: 20,
  border: "1px solid #ead59a",
  background: "linear-gradient(135deg,#fffaf0,#ffffff)",
};

const negotiationGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))",
  gap: 12,
  marginTop: 14,
};

const negotiationCard = {
  display: "grid",
  gap: 12,
  padding: 15,
  borderRadius: 15,
  border: "1px solid #eadcb5",
  background: "#fff",
};

const negotiationStatRow = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  color: "#607890",
  fontSize: 13,
};

const negotiationOfferBox = {
  display: "grid",
  gap: 5,
  padding: 12,
  borderRadius: 12,
  background: "#f3f8fe",
  border: "1px solid #d9e7f4",
};

const dualMapPanel = {
  marginTop: 17,
  padding: "clamp(16px,3vw,22px)",
  borderRadius: 20,
  border: "1px solid #cfe0ef",
  background: "#fff",
};

const dualMapHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap" as const,
};

const dualMapGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))",
  gap: 12,
  marginTop: 14,
};

const mapCompareCard = {
  padding: 12,
  borderRadius: 15,
  border: "1px solid #dbe7f2",
  background: "#f8fbfe",
};

const realAiPanel = {
  marginTop: 16,
  marginBottom: 18,
  padding: "clamp(16px,3vw,22px)",
  borderRadius: 20,
  border: "1px solid #d8c27a",
  background: "linear-gradient(135deg,#fffdf5 0%,#ffffff 58%,#f3f8ff 100%)",
  boxShadow: "0 14px 34px rgba(19,54,91,.10)",
};

const realAiPanelHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 14,
  flexWrap: "wrap" as const,
};

const goldButton = {
  border: "1px solid #b88a28",
  borderRadius: 12,
  padding: "12px 16px",
  background: "linear-gradient(135deg,#d7b45b,#9c6b12)",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 900,
  boxShadow: "0 8px 20px rgba(156,107,18,.22)",
};

const aiErrorBox = {
  marginTop: 14,
  padding: 13,
  borderRadius: 12,
  border: "1px solid #f3a6b1",
  background: "#fff0f2",
  color: "#b42338",
  fontWeight: 700,
};

const aiWaitingBox = {
  marginTop: 14,
  padding: 14,
  borderRadius: 14,
  border: "1px dashed #b8cadc",
  background: "#f7faff",
  color: "#607890",
  lineHeight: 1.55,
};

const aiResultBox = {
  marginTop: 16,
  padding: "clamp(15px,3vw,22px)",
  borderRadius: 17,
  border: "1px solid #b7d3ed",
  background: "#ffffff",
};

const aiResultHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap" as const,
  paddingBottom: 13,
  borderBottom: "1px solid #e4edf5",
};

const aiResultText = {
  marginTop: 16,
  color: "#294b69",
  whiteSpace: "pre-wrap" as const,
  lineHeight: 1.75,
  fontSize: 14,
};

const aiDisclaimer = {
  margin: "16px 0 0",
  paddingTop: 12,
  borderTop: "1px solid #e4edf5",
  color: "#7b8fa5",
  fontSize: 12,
  lineHeight: 1.5,
};

const compareSelectors = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))",
  gap: 12,
  marginBottom: 15,
};

const comparisonGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))",
  gap: 14,
};

const comparisonCard = {
  padding: 17,
  borderRadius: 17,
  border: "1px solid #dbe7f4",
  background: "#fafdff",
};

const comparisonResult = {
  marginTop: 16,
  padding: 18,
  borderRadius: 17,
  background: "#eef7ff",
  border: "1px solid #cfe5fb",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse" as const,
  minWidth: 650,
};

const thStyle = {
  padding: 12,
  textAlign: "left" as const,
  background: "#153a65",
  color: "#fff",
  border: "1px solid #d7e4f0",
};

const tdStyle = {
  padding: 12,
  color: "#29435f",
  border: "1px solid #d7e4f0",
};

const printCover = {
  display: "none",
  minHeight: "92vh",
  color: "#fff",
  padding: 60,
  background: "linear-gradient(135deg,#03152f,#0876c9)",
};

const locationPanelStyle = {
  ...panelStyle,
  marginBottom: 16,
};

const locationSubtitle = {
  margin: "6px 0 0",
  color: "#607890",
  lineHeight: 1.55,
  maxWidth: 760,
};

const locationScoreBadge = {
  display: "grid",
  gap: 4,
  minWidth: 150,
  padding: "12px 15px",
  borderRadius: 16,
  border: "1px solid #d7e4f0",
  textAlign: "center" as const,
};

const locationControls = {
  display: "grid",
  gridTemplateColumns: "minmax(260px,1fr) auto",
  gap: 10,
  alignItems: "center",
  marginBottom: 14,
};

const locationButtonGroup = {
  display: "flex",
  gap: 7,
  flexWrap: "wrap" as const,
};

const mapActiveButton = {
  ...softButton,
  background: "#143e6f",
  borderColor: "#143e6f",
  color: "#fff",
};

const mapLinkButton = {
  ...softButton,
  display: "inline-flex",
  alignItems: "center",
  textDecoration: "none",
};

const locationLayout = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
  gap: 14,
};

const mapFrameStyle = {
  overflow: "hidden",
  minHeight: 430,
  borderRadius: 18,
  border: "1px solid #d7e4f0",
  background: "#edf3f8",
};

const locationSidePanel = {
  display: "grid",
  alignContent: "start",
  gap: 11,
};

const locationAddressCard = {
  display: "grid",
  gap: 5,
  padding: 14,
  borderRadius: 15,
  background: "#f3f8fe",
  border: "1px solid #dce9f6",
};

const locationMiniLabel = {
  color: "#7b8fa5",
  fontSize: 10,
  fontWeight: 900,
  letterSpacing: 0.7,
};

const nearbyGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(2,minmax(0,1fr))",
  gap: 8,
};

const nearbyButtonStyle = {
  display: "grid",
  gap: 4,
  minHeight: 72,
  padding: 11,
  textAlign: "left" as const,
  borderRadius: 13,
  border: "1px solid #dbe7f4",
  background: "#fff",
  color: "#285276",
  cursor: "pointer",
};

const locationInfoBox = {
  padding: 13,
  borderRadius: 14,
  border: "1px solid #fde68a",
  background: "#fffbeb",
  color: "#7c5b12",
  fontSize: 12,
  lineHeight: 1.5,
};

const comparisonHeroResult = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 14,
  flexWrap: "wrap" as const,
  padding: 17,
  borderRadius: 17,
  background: "linear-gradient(135deg,#eef7ff,#f7fbff)",
  border: "1px solid #cfe3f7",
  marginBottom: 16,
};

const confidenceCard = {
  display: "grid",
  gap: 4,
  minWidth: 135,
  textAlign: "center" as const,
  padding: "12px 15px",
  borderRadius: 15,
  background: "#fff",
  border: "1px solid #d4e4f3",
};

const comparisonInsightGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit,minmax(245px,1fr))",
  gap: 11,
  marginTop: 16,
};

const comparisonInsightCard = {
  padding: 14,
  borderRadius: 15,
  border: "1px solid",
  fontSize: 13,
};

const comparisonWinnerCard = {
  border: "2px solid #18a66a",
  boxShadow: "0 12px 30px rgba(24,166,106,.16)",
};

const winnerBadge = {
  padding: "6px 8px",
  borderRadius: 999,
  background: "#e9fff5",
  color: "#047857",
  border: "1px solid #8be1bd",
  fontSize: 10,
  fontWeight: 900,
};

const compositeBadge = {
  padding: "8px 10px",
  borderRadius: 11,
  background: "#153a65",
  color: "#fff",
  fontWeight: 900,
};


const qualityRuleStyle = {
  display: "grid",
  gap: 4,
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid #dbe7f3",
  background: "#f8fbff",
};

const alertStyle = {
  padding: "12px 14px",
  borderRadius: 12,
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#b91c1c",
  fontSize: 13,
  lineHeight: 1.5,
};

const reportPaper = {
  padding: 20,
  borderRadius: 16,
  border: "1px solid #dbe7f3",
  background: "#ffffff",
  boxShadow: "0 12px 30px rgba(15, 23, 42, 0.08)",
};

const smallButton = {
  appearance: "none" as const,
  border: "1px solid #cbd9e8",
  borderRadius: 10,
  padding: "8px 12px",
  fontSize: 12,
  fontWeight: 800,
  lineHeight: 1.2,
  cursor: "pointer",
  transition: "background .2s ease, color .2s ease, border-color .2s ease",
};

const scenarioMetric = {
  display: "grid",
  gap: 4,
  padding: "10px 11px",
  borderRadius: 12,
  background: "rgba(255,255,255,.09)",
  border: "1px solid rgba(255,255,255,.11)",
  color: "#ffffff",
};

const primaryButton = {
  border: "1px solid rgba(96,165,250,.62)",
  borderRadius: 12,
  padding: "11px 16px",
  background: "linear-gradient(135deg, #0f6fdd 0%, #2447d8 100%)",
  color: "#ffffff",
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
  boxShadow: "0 8px 18px rgba(15, 91, 204, 0.22)",
  whiteSpace: "nowrap" as const,
};

const insightCardStyle = {
  display: "grid",
  gap: 6,
  padding: "14px 16px",
  borderRadius: 14,
  border: "1px solid #dbe7f3",
  background: "#ffffff",
  boxShadow: "0 8px 18px rgba(15, 23, 42, 0.06)",
  color: "#17324d",
};


const accountActionButton = {
  border: "1px solid rgba(125,211,252,.34)",
  borderRadius: 13,
  padding: "10px 12px",
  background: "linear-gradient(135deg, rgba(14,165,233,.20), rgba(37,99,235,.14))",
  color: "#f3fbff",
  cursor: "pointer",
  fontWeight: 900,
  marginTop: 4,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,.07)",
};
const sectionHeadingRow = { display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, margin: "4px 2px 9px" };
const sectionSubtext = { color: "rgba(228,242,255,.58)", fontSize: 10, marginTop: 3 };
const smartReadyBadge = { padding: "6px 9px", borderRadius: 999, background: "rgba(16,185,129,.12)", border: "1px solid rgba(110,231,183,.24)", color: "#a7f3d0", fontSize: 9, fontWeight: 900 };
const onlineBadge = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "6px 9px",
  borderRadius: 999,
  background: "rgba(6,182,212,.12)",
  border: "1px solid rgba(103,232,249,.22)",
  color: "#b8f5ff",
  fontSize: 9,
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const footerStyle = {
  color: "rgba(255,255,255,.75)",
  textAlign: "center" as const,
  padding: "16px 8px 0",
  fontSize: 13,
};

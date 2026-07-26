/*
YAŞAM AI - KULLANICI MERKEZİ V19 FINAL
BU DOSYA SADECE ŞURAYA KONULACAK:
app/analiz/page.tsx

DİKKAT:
app/page.tsx DOSYASINA KONULMAYACAK.
*/
"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import AnalysisHeader from "./components/AnalysisHeader";
import {
  PremiumScoreGrid,
  DecisionSummaryCard,
  ActionPlanCard,
} from "./components";
type FormState = {
  city: string;
  district: string;
  neighborhood: string;
  propertyType: string;
  area: string;
  askingPrice: string;
  notes: string;
};

type AnalysisResult = {
  raw: string;
};

type Decision = "AL" | "PAZARLIK YAP" | "BEKLE" | "UZAK DUR";

type SavedReport = {
  id: string;
  createdAt: string;
  title: string;
  city: string;
  district: string;
  neighborhood: string;
  propertyType: string;
  area: string;
  askingPrice: number;
  decision: Decision;
  reportScore: number;
  marketValue: number;
  isFavorite: boolean;
  raw: string;
};

type UserProfile = {
  name: string;
  membership: "Gold" | "Premium" | "Standart";
};


type ScoreCard = {
  title: string;
  value: number;
  description: string;
  inverse?: boolean;
};

const initialForm: FormState = {
  city: "Adana",
  district: "Ceyhan",
  neighborhood: "",
  propertyType: "Arsa",
  area: "",
  askingPrice: "",
  notes: "",
};

function extractText(data: unknown): string {
  if (typeof data === "string") return data;

  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const directKeys = [
      "result",
      "response",
      "content",
      "message",
      "analysis",
      "rapor",
      "text",
    ];

    for (const key of directKeys) {
      const value = obj[key];
      if (typeof value === "string" && value.trim()) return value;
    }

    if (Array.isArray(obj.choices) && obj.choices.length > 0) {
      const first = obj.choices[0] as Record<string, unknown>;
      const message = first.message as Record<string, unknown> | undefined;

      if (typeof message?.content === "string") return message.content;
      if (typeof first.text === "string") return first.text;
    }

    return JSON.stringify(data, null, 2);
  }

  return "Analiz tamamlandı ancak sonuç metni alınamadı.";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractScore(text: string, labels: string[], fallback: number): number {
  for (const label of labels) {
    const escaped = escapeRegExp(label);
    const patterns = [
      new RegExp(`${escaped}[\\s\\S]{0,90}?(\\d{1,3})\\s*\\/\\s*100`, "i"),
      new RegExp(`${escaped}[\\s\\S]{0,90}?(?:puan|skor)\\s*[:\\-]?\\s*(\\d{1,3})`, "i"),
      new RegExp(`${escaped}[\\s\\S]{0,55}?(\\d{1,3})`, "i"),
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return Math.min(100, Math.max(0, Number(match[1])));
    }
  }

  return fallback;
}

function extractMoney(text: string, labels: string[], fallback = 0): number {
  for (const label of labels) {
    const escaped = escapeRegExp(label);
    const pattern = new RegExp(
      `${escaped}[\\s\\S]{0,80}?([\\d\\.\\,]+)\\s*(?:TL|₺)`,
      "i",
    );
    const match = text.match(pattern);

    if (match) {
      const cleaned = match[1].replace(/\./g, "").replace(",", ".");
      const numeric = Number(cleaned);
      if (Number.isFinite(numeric)) return Math.round(numeric);
    }
  }

  return fallback;
}

function extractPercent(text: string, labels: string[], fallback: number): number {
  for (const label of labels) {
    const escaped = escapeRegExp(label);
    const patterns = [
      new RegExp(`${escaped}[\\s\\S]{0,70}?%\\s*(\\d{1,3})`, "i"),
      new RegExp(`${escaped}[\\s\\S]{0,70}?(\\d{1,3})\\s*%`, "i"),
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return Math.min(100, Math.max(0, Number(match[1])));
    }
  }

  return fallback;
}

function extractSection(text: string, labels: string[]): string {
  for (const label of labels) {
    const escaped = escapeRegExp(label);
    const pattern = new RegExp(
      `(?:^|\\n)[#*\\s\\d\\.\\-]*${escaped}\\s*[:\\-]?\\s*\\n?([\\s\\S]*?)(?=\\n[#*\\s]*\\d+[\\.\\)]?\\s*[A-ZÇĞİÖŞÜ]|\\n#{1,4}\\s|$)`,
      "i",
    );
    const match = text.match(pattern);

    if (match?.[1]?.trim()) {
      return match[1].trim().replace(/^\s*[-–•]\s*/gm, "• ");
    }
  }

  return "";
}

function detectDecision(text: string, scores: ScoreCard[]): Decision {
  const directMatch = text.match(
    /(?:Nihai Karar|Yaşam AI Kararı|Karar)\s*[:\-]?\s*(AL|PAZARLIK YAP|BEKLE|UZAK DUR)/i,
  );

  if (directMatch) return directMatch[1].toUpperCase() as Decision;

  const investment = scores.find((item) => item.title === "Yatırım Puanı")?.value ?? 50;
  const opportunity = scores.find((item) => item.title === "Fırsat Puanı")?.value ?? 50;
  const risk = scores.find((item) => item.title === "Risk Puanı")?.value ?? 50;
  const trust = scores.find((item) => item.title === "Veri Güven Skoru")?.value ?? 50;
  const weighted = investment * 0.35 + opportunity * 0.3 + (100 - risk) * 0.2 + trust * 0.15;

  if (trust < 45 || risk >= 80) return "UZAK DUR";
  if (weighted >= 74 && risk < 55) return "AL";
  if (weighted >= 56) return "PAZARLIK YAP";
  return "BEKLE";
}

function money(value: number) {
  if (!value) return "Hesaplanamadı";
  return `${new Intl.NumberFormat("tr-TR").format(value)} TL`;
}

function scoreTheme(value: number, inverse = false) {
  const effective = inverse ? 100 - value : value;

  if (effective >= 75) {
    return {
      label: "Güçlü",
      foreground: "#047857",
      background: "#ecfdf5",
      ring: "#10b981",
    };
  }

  if (effective >= 50) {
    return {
      label: "Orta",
      foreground: "#a16207",
      background: "#fffbeb",
      ring: "#f59e0b",
    };
  }

  return {
    label: "Dikkat",
    foreground: "#b91c1c",
    background: "#fef2f2",
    ring: "#ef4444",
  };
}

function decisionTheme(decision: Decision) {
  if (decision === "AL") {
    return {
      icon: "✓",
      background: "linear-gradient(135deg, #064e3b, #059669)",
      border: "#34d399",
      label: "Yüksek potansiyel",
    };
  }

  if (decision === "PAZARLIK YAP") {
    return {
      icon: "↔",
      background: "linear-gradient(135deg, #78350f, #d97706)",
      border: "#fbbf24",
      label: "Fiyat avantajı oluştur",
    };
  }

  if (decision === "BEKLE") {
    return {
      icon: "◷",
      background: "linear-gradient(135deg, #1e3a8a, #2563eb)",
      border: "#60a5fa",
      label: "Veri ve fiyatı izle",
    };
  }

  return {
    icon: "!",
    background: "linear-gradient(135deg, #7f1d1d, #dc2626)",
    border: "#f87171",
    label: "Risk kabul edilebilir değil",
  };
}

function ScoreRing({ title, value, description, inverse = false }: ScoreCard) {
  const theme = scoreTheme(value, inverse);
  const degrees = Math.round((value / 100) * 360);

  return (
    <article
      style={{
        background: "#ffffff",
        border: "1px solid #dbe7f4",
        borderRadius: "20px",
        padding: "19px",
        boxShadow: "0 12px 32px rgba(15, 53, 95, 0.07)",
      }}
    >
      <div
        style={{
          width: "106px",
          height: "106px",
          margin: "0 auto 14px",
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          background: `conic-gradient(${theme.ring} ${degrees}deg, #e7eef6 ${degrees}deg)`,
        }}
      >
        <div
          style={{
            width: "80px",
            height: "80px",
            borderRadius: "50%",
            background: "#ffffff",
            display: "grid",
            placeItems: "center",
            textAlign: "center",
            boxShadow: "inset 0 0 0 1px #eef3f8",
          }}
        >
          <div>
            <strong style={{ display: "block", fontSize: "25px", color: "#102a4f" }}>
              {value}
            </strong>
            <span style={{ fontSize: "11px", color: "#6f8197" }}>/ 100</span>
          </div>
        </div>
      </div>

      <h3
        style={{
          margin: "0 0 8px",
          textAlign: "center",
          fontSize: "15px",
          color: "#142b4c",
        }}
      >
        {title}
      </h3>

      <div style={{ textAlign: "center", marginBottom: "9px" }}>
        <span
          style={{
            display: "inline-block",
            padding: "5px 10px",
            borderRadius: "999px",
            background: theme.background,
            color: theme.foreground,
            fontSize: "12px",
            fontWeight: 800,
          }}
        >
          {theme.label}
        </span>
      </div>

      <p
        style={{
          margin: 0,
          color: "#64758a",
          fontSize: "12.5px",
          lineHeight: 1.55,
          textAlign: "center",
        }}
      >
        {description}
      </p>
    </article>
  );
}

function MetricCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <article
      style={{
        background: "#ffffff",
        border: "1px solid #dce7f2",
        borderRadius: "17px",
        padding: "18px",
        boxShadow: "0 10px 28px rgba(17, 54, 93, 0.06)",
      }}
    >
      <div style={{ color: "#72849b", fontSize: "12px", fontWeight: 800, marginBottom: "7px" }}>
        {label}
      </div>
      <strong style={{ display: "block", color: "#12345d", fontSize: "20px", marginBottom: "7px" }}>
        {value}
      </strong>
      <p style={{ margin: 0, color: "#718198", fontSize: "12.5px", lineHeight: 1.55 }}>
        {note}
      </p>
    </article>
  );
}



type NearbyPlace = {
  id: string;
  name: string;
  category: string;
  icon: string;
  distance: number;
  latitude: number;
  longitude: number;
};

type LocationIntelligence = {
  latitude: number;
  longitude: number;
  selectedAddress: string;
  locationScore: number;
  locationGrade: string;
  nearbyPlaces: NearbyPlace[];
  updatedAt: string;
};

function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const earthRadius = 6371000;
  const toRadians = (degree: number) => (degree * Math.PI) / 180;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);
  const firstLat = toRadians(lat1);
  const secondLat = toRadians(lat2);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(firstLat) *
      Math.cos(secondLat) *
      Math.sin(deltaLon / 2) ** 2;

  return Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function formatDistance(distance: number) {
  if (distance < 1000) return `${distance} m`;
  return `${(distance / 1000).toFixed(1).replace(".", ",")} km`;
}

function RealEstateMap({
  city,
  district,
  neighborhood,
  onIntelligenceChange,
}: {
  city: string;
  district: string;
  neighborhood: string;
  onIntelligenceChange?: (snapshot: LocationIntelligence) => void;
}) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const poiLayerRef = useRef<any>(null);

  const [latitude, setLatitude] = useState(37.0247);
  const [longitude, setLongitude] = useState(35.8175);
  const [mapStatus, setMapStatus] = useState("Harita hazırlanıyor...");
  const [selectedAddress, setSelectedAddress] = useState(
    "Henüz doğrulanmış bir mahalle adresi seçilmedi."
  );
  const [searching, setSearching] = useState(false);
  const [loadingPlaces, setLoadingPlaces] = useState(false);
  const [nearbyPlaces, setNearbyPlaces] = useState<NearbyPlace[]>([]);
  const [environmentStatus, setEnvironmentStatus] = useState(
    "Konumu seçtikten sonra çevre analizini başlat."
  );

  const locationScore = useMemo(() => {
    if (!nearbyPlaces.length) return 0;

    const categoryWeights: Record<string, number> = {
      Okul: 16,
      Sağlık: 18,
      Eczane: 10,
      Market: 12,
      Park: 10,
      Ulaşım: 18,
      "Ana Yol": 16,
    };

    const uniqueCategories = Array.from(
      new Set(nearbyPlaces.map((place) => place.category))
    );

    const coverageScore = uniqueCategories.reduce(
      (total, category) => total + (categoryWeights[category] || 6),
      0
    );

    const distanceBonus = nearbyPlaces.reduce((total, place) => {
      if (place.distance <= 500) return total + 2;
      if (place.distance <= 1000) return total + 1;
      return total;
    }, 0);

    return Math.min(100, Math.round(coverageScore + distanceBonus));
  }, [nearbyPlaces]);

  const locationGrade =
    locationScore >= 85
      ? "ÇOK GÜÇLÜ"
      : locationScore >= 70
      ? "GÜÇLÜ"
      : locationScore >= 50
      ? "ORTA"
      : locationScore > 0
      ? "GELİŞTİRİLEBİLİR"
      : "BEKLENİYOR";

  useEffect(() => {
    if (!onIntelligenceChange) return;

    onIntelligenceChange({
      latitude,
      longitude,
      selectedAddress,
      locationScore,
      locationGrade,
      nearbyPlaces,
      updatedAt: new Date().toISOString(),
    });
  }, [
    latitude,
    longitude,
    selectedAddress,
    locationScore,
    locationGrade,
    nearbyPlaces,
    onIntelligenceChange,
  ]);

  useEffect(() => {
    let cancelled = false;

    const loadLeaflet = async () => {
      if (!document.querySelector('link[data-yasam-leaflet="true"]')) {
        const css = document.createElement("link");
        css.rel = "stylesheet";
        css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        css.setAttribute("data-yasam-leaflet", "true");
        document.head.appendChild(css);
      }

      if (!(window as any).L) {
        await new Promise<void>((resolve, reject) => {
          const existing = document.querySelector(
            'script[data-yasam-leaflet="true"]'
          ) as HTMLScriptElement | null;

          if (existing) {
            existing.addEventListener("load", () => resolve(), { once: true });
            existing.addEventListener("error", () => reject(), { once: true });
            return;
          }

          const script = document.createElement("script");
          script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
          script.async = true;
          script.setAttribute("data-yasam-leaflet", "true");
          script.onload = () => resolve();
          script.onerror = () =>
            reject(new Error("Harita kütüphanesi yüklenemedi."));
          document.body.appendChild(script);
        });
      }

      if (cancelled || !mapElementRef.current || mapRef.current) return;

      const L = (window as any).L;
      const map = L.map(mapElementRef.current, {
        center: [latitude, longitude],
        zoom: 14,
        zoomControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 20,
        attribution: "&copy; OpenStreetMap katkıcıları",
      }).addTo(map);

      const marker = L.marker([latitude, longitude], { draggable: true })
        .addTo(map)
        .bindPopup("Analiz edilecek taşınmaz konumu")
        .openPopup();

      poiLayerRef.current = L.layerGroup().addTo(map);

      const updateCoordinates = (lat: number, lng: number) => {
        setLatitude(Number(lat.toFixed(6)));
        setLongitude(Number(lng.toFixed(6)));
        setNearbyPlaces([]);
        setSelectedAddress(
          `Haritadan seçilen koordinat: ${lat.toFixed(6)}, ${lng.toFixed(6)}`
        );
        setEnvironmentStatus(
          "Konum değişti. Güncel çevre verileri için analizi yeniden başlat."
        );
        marker.setLatLng([lat, lng]);
      };

      map.on("click", (event: any) => {
        updateCoordinates(event.latlng.lat, event.latlng.lng);
        setMapStatus("Konum haritadan seçildi.");
      });

      marker.on("dragend", () => {
        const point = marker.getLatLng();
        updateCoordinates(point.lat, point.lng);
        setMapStatus("İşaretçi yeni konuma taşındı.");
      });

      mapRef.current = map;
      markerRef.current = marker;
      setMapStatus(
        "Gerçek harita hazır. Haritaya tıklayarak konumu seçebilirsin."
      );

      setTimeout(() => map.invalidateSize(), 150);
    };

    loadLeaflet().catch(() => {
      setMapStatus("Harita yüklenemedi. İnternet bağlantısını kontrol et.");
    });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
        poiLayerRef.current = null;
      }
    };
  }, []);

  const findAddress = async () => {
    const neighborhoodQuery = [neighborhood, district, city, "Türkiye"]
      .filter(Boolean)
      .join(", ");
    const districtQuery = [district, city, "Türkiye"].filter(Boolean).join(", ");

    if (!neighborhoodQuery.trim()) {
      setMapStatus("Önce il, ilçe veya mahalle bilgisi gir.");
      return;
    }

    setSearching(true);
    setMapStatus("Mahalle ve adres haritada aranıyor...");

    try {
      const searchQueries = [neighborhoodQuery, districtQuery].filter(
        (query, index, all) => query && all.indexOf(query) === index
      );

      let found:
        | { lat: string; lon: string; display_name: string }
        | undefined;
      let usedDistrictFallback = false;

      for (let index = 0; index < searchQueries.length; index += 1) {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&countrycodes=tr&q=${encodeURIComponent(
            searchQueries[index]
          )}`,
          { headers: { "Accept-Language": "tr" } }
        );

        if (!response.ok) continue;

        const data = (await response.json()) as Array<{
          lat: string;
          lon: string;
          display_name: string;
          type?: string;
          class?: string;
        }>;

        found =
          data.find((item) =>
            ["neighbourhood", "suburb", "quarter", "residential"].includes(
              item.type ?? ""
            )
          ) ?? data[0];

        if (found) {
          usedDistrictFallback = index > 0;
          break;
        }
      }

      if (!found) {
        setSelectedAddress("Mahalle kaydı açık harita servisinde bulunamadı.");
        setMapStatus(
          "Mahalle bulunamadı. Haritadan doğru noktaya tıklayarak konumu elle seçebilirsin."
        );
        return;
      }

      const lat = Number(found.lat);
      const lng = Number(found.lon);

      setLatitude(Number(lat.toFixed(6)));
      setLongitude(Number(lng.toFixed(6)));
      setNearbyPlaces([]);
      setSelectedAddress(found.display_name);
      setEnvironmentStatus(
        "Konum bulundu. Şimdi gerçek çevre analizini başlatabilirsin."
      );

      if (mapRef.current && markerRef.current) {
        mapRef.current.setView([lat, lng], usedDistrictFallback ? 14 : 16);
        markerRef.current
          .setLatLng([lat, lng])
          .bindPopup(found.display_name)
          .openPopup();
        setTimeout(() => mapRef.current?.invalidateSize(), 120);
      }

      setMapStatus(
        usedDistrictFallback
          ? "Mahalle kaydı bulunamadı; ilçe merkezi gösterildi. Haritadan tam konumu seç."
          : `Mahalle haritada bulundu: ${found.display_name}`
      );
    } catch {
      setSelectedAddress("Adres doğrulanamadı.");
      setMapStatus("Adres aranamadı. Haritadan elle konum seçebilirsin.");
    } finally {
      setSearching(false);
    }
  };

  const analyzeEnvironment = async () => {
    setLoadingPlaces(true);
    setEnvironmentStatus("Okul, sağlık, ulaşım ve sosyal yaşam verileri aranıyor...");

    const radius = 2500;
    const query = `
      [out:json][timeout:25];
      (
        nwr(around:${radius},${latitude},${longitude})["amenity"~"school|college|university|kindergarten|hospital|clinic|pharmacy|bus_station"];
        nwr(around:${radius},${latitude},${longitude})["shop"~"supermarket|convenience|mall"];
        nwr(around:${radius},${latitude},${longitude})["leisure"="park"];
        nwr(around:${radius},${latitude},${longitude})["highway"="bus_stop"];
        nwr(around:${radius},${latitude},${longitude})["public_transport"~"platform|station"];
      );
      out center tags;
    `;

    try {
      const response = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        body: `data=${encodeURIComponent(query)}`,
      });

      if (!response.ok) {
        throw new Error("Çevre veri servisine ulaşılamadı.");
      }

      const data = (await response.json()) as {
        elements: Array<{
          id: number;
          type: string;
          lat?: number;
          lon?: number;
          center?: { lat: number; lon: number };
          tags?: Record<string, string>;
        }>;
      };

      const mapped = data.elements
        .map((element): NearbyPlace | null => {
          const lat = element.lat ?? element.center?.lat;
          const lon = element.lon ?? element.center?.lon;
          if (typeof lat !== "number" || typeof lon !== "number") return null;

          const tags = element.tags || {};
          let category = "";
          let icon = "📍";

          if (
            ["school", "college", "university", "kindergarten"].includes(
              tags.amenity
            )
          ) {
            category = "Okul";
            icon = "🏫";
          } else if (
            ["hospital", "clinic", "doctors"].includes(tags.amenity)
          ) {
            category = "Sağlık";
            icon = "🏥";
          } else if (tags.amenity === "pharmacy") {
            category = "Eczane";
            icon = "💊";
          } else if (
            ["supermarket", "convenience", "mall"].includes(tags.shop)
          ) {
            category = "Market";
            icon = "🛒";
          } else if (tags.leisure === "park") {
            category = "Park";
            icon = "🌳";
          } else if (
            tags.highway === "bus_stop" ||
            tags.amenity === "bus_station" ||
            tags.public_transport
          ) {
            category = "Ulaşım";
            icon = "🚌";
          }

          if (!category) return null;

          const fallbackName =
            category === "Okul"
              ? "Eğitim Kurumu"
              : category === "Sağlık"
              ? "Sağlık Kuruluşu"
              : category === "Eczane"
              ? "Eczane"
              : category === "Market"
              ? "Market / Ticaret Noktası"
              : category === "Park"
              ? "Park / Yeşil Alan"
              : "Toplu Taşıma Noktası";

          return {
            id: `${element.type}-${element.id}`,
            name: tags.name || fallbackName,
            category,
            icon,
            distance: calculateDistanceMeters(
              latitude,
              longitude,
              lat,
              lon
            ),
            latitude: lat,
            longitude: lon,
          };
        })
        .filter((place): place is NearbyPlace => Boolean(place))
        .sort((a, b) => a.distance - b.distance);

      const categoryLimits: Record<string, number> = {};
      const filtered = mapped.filter((place) => {
        categoryLimits[place.category] =
          (categoryLimits[place.category] || 0) + 1;
        return categoryLimits[place.category] <= 3;
      });

      setNearbyPlaces(filtered);

      const L = (window as any).L;
      if (L && poiLayerRef.current) {
        poiLayerRef.current.clearLayers();

        filtered.forEach((place) => {
          L.circleMarker([place.latitude, place.longitude], {
            radius: 7,
            weight: 2,
            fillOpacity: 0.75,
          })
            .addTo(poiLayerRef.current)
            .bindPopup(
              `<strong>${place.icon} ${place.name}</strong><br/>${place.category} • ${formatDistance(
                place.distance
              )}`
            );
        });
      }

      if (!filtered.length) {
        setEnvironmentStatus(
          "2,5 km içinde yeterli kayıt bulunamadı. Bu, bölgede hiçbir tesis olmadığı anlamına gelmez; açık harita verisi eksik olabilir."
        );
      } else {
        setEnvironmentStatus(
          `${filtered.length} gerçek çevre noktası bulundu ve harita üzerinde gösterildi.`
        );
      }
    } catch {
      setEnvironmentStatus(
        "Çevre verileri şu anda alınamadı. İnternet bağlantısını kontrol edip tekrar deneyebilirsin."
      );
    } finally {
      setLoadingPlaces(false);
    }
  };

  const nearestByCategory = useMemo(() => {
    const categories = ["Okul", "Sağlık", "Eczane", "Market", "Park", "Ulaşım"];
    return categories.map((category) => ({
      category,
      place: nearbyPlaces.find((item) => item.category === category),
    }));
  }, [nearbyPlaces]);

  return (
    <section
      style={{
        marginTop: "28px",
        border: "1px solid #dbe7f4",
        borderRadius: "24px",
        padding: "22px",
        background: "#ffffff",
        boxShadow: "0 18px 45px rgba(17, 54, 93, 0.08)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "16px",
          flexWrap: "wrap",
          marginBottom: "16px",
        }}
      >
        <div>
          <div
            style={{
              color: "#2563eb",
              fontSize: "12px",
              fontWeight: 900,
              letterSpacing: "0.08em",
            }}
          >
            YAŞAM AI GERÇEK KONUM VE ÇEVRE ZEKÂSI 8.0
          </div>
          <h2
            style={{ margin: "7px 0 6px", color: "#0f2742", fontSize: "25px" }}
          >
            Gerçek Konum, Çevre ve Erişim Analizi
          </h2>
          <p style={{ margin: 0, color: "#64748b", lineHeight: 1.6 }}>
            Konumu seç, çevredeki gerçek eğitim, sağlık, ulaşım ve sosyal yaşam
            noktalarını analiz et.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            gap: "10px",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={findAddress}
            disabled={searching}
            style={{
              border: 0,
              borderRadius: "13px",
              padding: "12px 17px",
              background: searching
                ? "#94a3b8"
                : "linear-gradient(135deg,#0f4c81,#2563eb)",
              color: "#ffffff",
              fontWeight: 900,
              cursor: searching ? "wait" : "pointer",
              boxShadow: "0 10px 24px rgba(37,99,235,.22)",
            }}
          >
            {searching ? "Konum Aranıyor..." : "📍 Adresi Haritada Bul"}
          </button>

          <button
            type="button"
            onClick={analyzeEnvironment}
            disabled={loadingPlaces}
            style={{
              border: 0,
              borderRadius: "13px",
              padding: "12px 17px",
              background: loadingPlaces
                ? "#94a3b8"
                : "linear-gradient(135deg,#047857,#10b981)",
              color: "#ffffff",
              fontWeight: 900,
              cursor: loadingPlaces ? "wait" : "pointer",
              boxShadow: "0 10px 24px rgba(16,185,129,.22)",
            }}
          >
            {loadingPlaces ? "Çevre Taranıyor..." : "🔎 Gerçek Çevreyi Analiz Et"}
          </button>
        </div>
      </div>

      <div
        ref={mapElementRef}
        style={{
          width: "100%",
          height: "420px",
          borderRadius: "19px",
          overflow: "hidden",
          border: "1px solid #cbdcf0",
          background: "#eaf2fb",
        }}
      />

      <div
        style={{
          marginTop: "13px",
          padding: "12px 14px",
          borderRadius: "13px",
          background: "#eff6ff",
          color: "#1e4f78",
          fontSize: "13px",
          lineHeight: 1.55,
        }}
      >
        {mapStatus}
      </div>

      <div
        style={{
          marginTop: "10px",
          padding: "12px 14px",
          borderRadius: "13px",
          background: "#fff7ed",
          color: "#9a3412",
          fontSize: "13px",
          lineHeight: 1.55,
          border: "1px solid #fed7aa",
        }}
      >
        <strong>Seçilen adres / mahalle:</strong> {selectedAddress}
      </div>

      <div
        style={{
          marginTop: "10px",
          padding: "12px 14px",
          borderRadius: "13px",
          background: "#ecfdf5",
          color: "#065f46",
          fontSize: "13px",
          lineHeight: 1.55,
        }}
      >
        {environmentStatus}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
          gap: "13px",
          marginTop: "16px",
        }}
      >
        <MetricCard
          label="ENLEM"
          value={latitude.toString()}
          note="Seçilen konumun gerçek enlem bilgisi."
        />
        <MetricCard
          label="BOYLAM"
          value={longitude.toString()}
          note="Seçilen konumun gerçek boylam bilgisi."
        />
        <MetricCard
          label="LOKASYON SKORU"
          value={nearbyPlaces.length ? `${locationScore} / 100` : "BEKLENİYOR"}
          note="Çevre çeşitliliği ve erişim mesafelerine göre hesaplanır."
        />
        <MetricCard
          label="LOKASYON SINIFI"
          value={locationGrade}
          note="Gerçek yakın çevre verileriyle oluşturulan sınıflandırma."
        />
      </div>

      {nearbyPlaces.length > 0 && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
              gap: "13px",
              marginTop: "17px",
            }}
          >
            {nearestByCategory.map(({ category, place }) => (
              <article
                key={category}
                style={{
                  border: "1px solid #dbe7f4",
                  borderRadius: "16px",
                  padding: "15px",
                  background: "#fbfdff",
                }}
              >
                <div
                  style={{
                    color: "#72849b",
                    fontWeight: 900,
                    fontSize: "12px",
                    letterSpacing: "0.04em",
                  }}
                >
                  EN YAKIN {category.toLocaleUpperCase("tr-TR")}
                </div>
                <strong
                  style={{
                    display: "block",
                    marginTop: "7px",
                    color: "#0f2742",
                    fontSize: "16px",
                  }}
                >
                  {place ? `${place.icon} ${place.name}` : "Kayıt bulunamadı"}
                </strong>
                <div
                  style={{
                    marginTop: "6px",
                    color: place ? "#047857" : "#94a3b8",
                    fontWeight: 800,
                  }}
                >
                  {place ? formatDistance(place.distance) : "—"}
                </div>
              </article>
            ))}
          </div>

          <div
            style={{
              marginTop: "18px",
              border: "1px solid #dbe7f4",
              borderRadius: "18px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "14px 16px",
                background: "#f3f8fd",
                color: "#0f4c81",
                fontWeight: 900,
              }}
            >
              Yakındaki Gerçek Noktalar
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))",
                gap: "1px",
                background: "#e2e8f0",
              }}
            >
              {nearbyPlaces.map((place) => (
                <div
                  key={place.id}
                  style={{
                    background: "#ffffff",
                    padding: "14px 16px",
                  }}
                >
                  <strong style={{ color: "#0f2742" }}>
                    {place.icon} {place.name}
                  </strong>
                  <div
                    style={{
                      marginTop: "5px",
                      color: "#64748b",
                      fontSize: "13px",
                    }}
                  >
                    {place.category} • {formatDistance(place.distance)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div
        style={{
          marginTop: "16px",
          borderRadius: "16px",
          padding: "15px",
          background: "linear-gradient(135deg,#f8fbff,#eef6ff)",
          border: "1px solid #d8e8f8",
          color: "#486278",
          lineHeight: 1.6,
          fontSize: "13px",
        }}
      >
        <strong style={{ color: "#0f4c81" }}>Bu sürümde gerçek çalışan özellik:</strong>{" "}
        OpenStreetMap üzerinden konum seçimi ve Overpass açık veri servisi
        üzerinden 2,5 km çevredeki okul, hastane, klinik, eczane, market, park
        ve toplu taşıma noktalarının bulunması. Veriler açık kaynaklıdır; eksik
        kayıt ihtimali olduğu için resmî doğrulamanın yerine geçmez.
      </div>
    </section>
  );
}

export default function AnalizPage() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [locationIntelligence, setLocationIntelligence] =
    useState<LocationIntelligence | null>(null);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [profile, setProfile] = useState<UserProfile>({ name: "Sezai Aydemir", membership: "Gold" });
  const [archiveFilter, setArchiveFilter] = useState<"all" | "favorites">("all");
  const [archiveMessage, setArchiveMessage] = useState("");

  useEffect(() => {
    try {
      const storedReports = window.localStorage.getItem("yasam-ai-v19-reports");
      const storedProfile = window.localStorage.getItem("yasam-ai-v19-profile");
      if (storedReports) setSavedReports(JSON.parse(storedReports) as SavedReport[]);
      if (storedProfile) setProfile(JSON.parse(storedProfile) as UserProfile);
    } catch {
      setArchiveMessage("Kayıtlı kullanıcı verileri okunamadı.");
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("yasam-ai-v19-reports", JSON.stringify(savedReports));
  }, [savedReports]);

  useEffect(() => {
    window.localStorage.setItem("yasam-ai-v19-profile", JSON.stringify(profile));
  }, [profile]);

  const askingPriceNumber = useMemo(
    () => Number(form.askingPrice.replace(/\D/g, "")) || 0,
    [form.askingPrice],
  );

  const formattedPrice = useMemo(
    () => (askingPriceNumber ? new Intl.NumberFormat("tr-TR").format(askingPriceNumber) : ""),
    [askingPriceNumber],
  );

  const locationDataSummary = useMemo(() => {
    if (!locationIntelligence || !locationIntelligence.nearbyPlaces.length) {
      return "Konum ve çevre açık verisi henüz taranmadı.";
    }

    const grouped = locationIntelligence.nearbyPlaces.reduce<Record<string, NearbyPlace[]>>(
      (accumulator, place) => {
        accumulator[place.category] = accumulator[place.category] || [];
        accumulator[place.category].push(place);
        return accumulator;
      },
      {},
    );

    const categoryText = Object.entries(grouped)
      .map(([category, places]) => {
        const nearest = places.slice().sort((a, b) => a.distance - b.distance)[0];
        return `${category}: ${places.length} kayıt, en yakın ${nearest.name} (${formatDistance(nearest.distance)})`;
      })
      .join("; ");

    return [
      `Doğrulanan adres: ${locationIntelligence.selectedAddress}`,
      `Koordinat: ${locationIntelligence.latitude}, ${locationIntelligence.longitude}`,
      `Lokasyon skoru: ${locationIntelligence.locationScore}/100 (${locationIntelligence.locationGrade})`,
      `Yakın çevre özeti: ${categoryText}`,
      `Kaynak: OpenStreetMap + Overpass açık verisi`,
    ].join("\n");
  }, [locationIntelligence]);

  const scores = useMemo<ScoreCard[]>(() => {
    const text = result?.raw ?? "";

    return [
      {
        title: "Veri Güven Skoru",
        value: extractScore(text, ["Veri Güven Skoru", "Güven Skoru"], locationIntelligence?.nearbyPlaces.length ? Math.min(72, 48 + Math.round(locationIntelligence.locationScore * 0.24)) : 45),
        description: "Analizin dayandığı verilerin kapsamı ve doğrulanabilirliği.",
      },
      {
        title: "Yatırım Puanı",
        value: extractScore(text, ["Yatırım Puanı"], locationIntelligence?.locationScore ? Math.round(48 + locationIntelligence.locationScore * 0.22) : 55),
        description: "Taşınmazın genel yatırım çekiciliği ve getiri potansiyeli.",
      },
      {
        title: "Fırsat Puanı",
        value: extractScore(text, ["Fırsat Puanı"], locationIntelligence?.locationScore ? Math.round(44 + locationIntelligence.locationScore * 0.2) : 50),
        description: "Fiyat, konum ve gelişim avantajlarının birleşik değerlendirmesi.",
      },
      {
        title: "Risk Puanı",
        value: extractScore(text, ["Risk Puanı"], locationIntelligence?.nearbyPlaces.length ? Math.max(42, 68 - Math.round(locationIntelligence.locationScore * 0.18)) : 65),
        description: "Hukuki, teknik, veri ve piyasa belirsizliklerinin seviyesi.",
        inverse: true,
      },
      {
        title: "Likidite Puanı",
        value: extractScore(text, ["Likidite Puanı"], locationIntelligence?.locationScore ? Math.round(45 + locationIntelligence.locationScore * 0.28) : 60),
        description: "Taşınmazın makul sürede satılabilme veya nakde dönüşebilme ihtimali.",
      },
    ];
  }, [locationIntelligence, result]);

  const valuation = useMemo(() => {
    const text = result?.raw ?? "";
    const market =
      extractMoney(text, ["Tahmini Piyasa Değeri", "Piyasa Değeri"], 0) ||
      Math.round(askingPriceNumber * 0.93);
    const quick =
      extractMoney(text, ["Hızlı Satış Değeri", "Hızlı Satış Fiyatı"], 0) ||
      Math.round(market * 0.9);
    const safe =
      extractMoney(text, ["Güvenli Teklif", "Güvenli Teklif Fiyatı"], 0) ||
      Math.round(market * 0.92);
    const max =
      extractMoney(text, ["Maksimum Teklif", "Maksimum Teklif Fiyatı"], 0) ||
      Math.round(market * 0.98);
    const negotiation =
      extractPercent(text, ["Pazarlık Payı", "Önerilen Pazarlık Payı"], 0) ||
      (askingPriceNumber
        ? Math.max(0, Math.round(((askingPriceNumber - safe) / askingPriceNumber) * 100))
        : 0);
    const oneYear =
      extractMoney(text, ["1 Yıllık Tahmini Değer", "Bir Yıllık Tahmini Değer"], 0) ||
      Math.round(market * 1.08);
    const threeYear =
      extractMoney(text, ["3 Yıllık Tahmini Değer", "Üç Yıllık Tahmini Değer"], 0) ||
      Math.round(market * 1.25);
    const fiveYear =
      extractMoney(text, ["5 Yıllık Tahmini Değer", "Beş Yıllık Tahmini Değer"], 0) ||
      Math.round(market * 1.45);

    return { market, quick, safe, max, negotiation, oneYear, threeYear, fiveYear };
  }, [askingPriceNumber, result]);

  const decision = useMemo(() => detectDecision(result?.raw ?? "", scores), [result, scores]);
  const decisionStyle = decisionTheme(decision);

  const dynamicMetrics = useMemo(() => {
    const score = (title: string) =>
      scores.find((item) => item.title === title)?.value ?? 50;
    const trust = score("Veri Güven Skoru");
    const investment = score("Yatırım Puanı");
    const opportunity = score("Fırsat Puanı");
    const risk = score("Risk Puanı");
    const liquidity = score("Likidite Puanı");
    const base = askingPriceNumber || valuation.market || 0;
    const market = valuation.market || base;
    const idealListing = Math.round(market * (1.02 + Math.max(0, opportunity - 50) / 1000));
    const quickSale = valuation.quick || Math.round(market * (0.86 + liquidity / 1000));
    const safeOffer = valuation.safe || Math.round(market * (0.86 + trust / 2000));
    const maximumOffer = valuation.max || Math.round(market * (0.94 + investment / 2500));
    const priceGap = market && base ? ((base - market) / market) * 100 : 0;
    const priceStatus = !base
      ? "Fiyat Girilmedi"
      : priceGap <= -7
        ? "Avantajlı"
        : priceGap >= 8
          ? "Yüksek"
          : "Piyasa ile Uyumlu";
    const locationBoost = locationIntelligence?.nearbyPlaces.length
      ? Math.min(12, Math.round(locationIntelligence.locationScore * 0.12))
      : 0;
    const valueConfidence = Math.min(100, Math.round(trust * 0.58 + investment * 0.18 + liquidity * 0.14 + locationBoost));

    const developmentRatio = form.propertyType === "Arsa" ? 0.34 : 0.12;
    const developmentCost = Math.round(base * developmentRatio);
    const officialCosts = Math.round(base * 0.055);
    const financeCosts = Math.round(base * 0.07);
    const totalInvestment = base + developmentCost + officialCosts + financeCosts;
    const growthFactor = 1.08 + investment / 500 + opportunity / 700 - risk / 1000;
    const projectRevenue = Math.round(Math.max(market, base) * growthFactor);
    const netProfit = projectRevenue - totalInvestment;
    const profitability = totalInvestment > 0 ? (netProfit / totalInvestment) * 100 : 0;
    const paybackMonths = Math.max(12, Math.min(72, Math.round(42 - profitability * 0.45 + risk * 0.12)));
    const financialConfidence = Math.round(trust * 0.45 + investment * 0.3 + (100 - risk) * 0.25);
    const financialDecision = netProfit > 0 && profitability >= 15 && risk < 70
      ? "Yatırıma Uygun"
      : profitability >= 5 && risk < 80
        ? "Kontrollü İncele"
        : "Temkinli Ol";

    const conservativeProfit = Math.round(netProfit * 0.62);
    const expectedProfit = netProfit;
    const strongProfit = Math.round(netProfit * 1.32);
    const probability = Math.max(35, Math.min(92, Math.round(48 + liquidity * 0.22 + trust * 0.18 - Math.max(0, priceGap) * 1.2)));
    const negotiationPower = opportunity >= 70 || priceGap >= 8 ? "Yüksek" : opportunity >= 50 ? "Orta" : "Sınırlı";
    const reportScore = Math.min(100, Math.round(
      trust * 0.27 +
      investment * 0.23 +
      opportunity * 0.18 +
      (100 - risk) * 0.14 +
      liquidity * 0.1 +
      (locationIntelligence?.locationScore ?? 0) * 0.08
    ));

    return {
      trust, investment, opportunity, risk, liquidity,
      market, idealListing, quickSale, safeOffer, maximumOffer,
      priceStatus, valueConfidence, priceGap,
      developmentCost, officialCosts, financeCosts, totalInvestment,
      projectRevenue, netProfit, profitability, paybackMonths,
      financialConfidence, financialDecision,
      conservativeProfit, expectedProfit, strongProfit,
      probability, negotiationPower, reportScore,
    };
  }, [askingPriceNumber, form.propertyType, locationIntelligence, scores, valuation]);

  const strengths =
    extractSection(result?.raw ?? "", ["Güçlü Yönler", "Başlıca Güçlü Yönler"]) ||
    "• Konum, parsel niteliği ve çevresel gelişim potansiyeli ayrıca doğrulanmalıdır.\n• Fiyat avantajı ancak güncel emsallerle karşılaştırıldıktan sonra kesinleştirilebilir.";

  const risks =
    extractSection(result?.raw ?? "", ["Kritik Riskler", "Riskler"]) ||
    "• İmar, tapu, zemin ve altyapı durumu resmî belgelerle doğrulanmalıdır.\n• Güncel emsal verisi olmadan nihai fiyat kararı verilmemelidir.";

  const actionPlan =
    extractSection(result?.raw ?? "", ["5 Maddelik Eylem Planı", "Eylem Planı"]) ||
    "1. Tapu ve takyidat kaydını kontrol et.\n2. İmar durum belgesini belediyeden doğrula.\n3. Aynı mahalledeki güncel emsalleri karşılaştır.\n4. Yerinde inceleme ve teknik kontrol yaptır.\n5. Güvenli teklif aralığı içinde pazarlığa başla.";

  const decisionReason =
    extractSection(result?.raw ?? "", ["Nihai Karar Gerekçesi", "Karar Gerekçesi", "Genel Sonuç"]) ||
    "Karar; veri güveni, yatırım potansiyeli, fırsat seviyesi, risk ve likidite skorlarının birlikte değerlendirilmesiyle oluşturuldu.";

  const negotiationMessage = useMemo(
    () =>
      `Merhaba,

Taşınmazınızı Yaşam AI gayrimenkul analiz sistemi üzerinden; konum, fiyat, yatırım potansiyeli, risk ve likidite açısından değerlendirdik.

Yapılan analiz sonucunda taşınmaz için güvenli teklif seviyemiz ${money(valuation.safe)}, çıkılabilecek en yüksek teklif seviyemiz ise ${money(valuation.max)} olarak hesaplanmıştır.

Bu değerlendirme doğrultusunda ${money(valuation.safe)} bedel üzerinden ciddi ve hızlı sonuçlanabilecek bir teklif sunmak istiyoruz. Tapu, imar ve diğer resmî kontrollerin olumlu sonuçlanması hâlinde süreci kısa sürede tamamlayabiliriz.

Değerlendirmenizi rica ederiz.`,
    [valuation.max, valuation.safe],
  );

  async function requestAnalysis(prompt: string) {
    const payloads = [
      { message: prompt },
      { prompt },
      { messages: [{ role: "user", content: prompt }] },
    ];

    let lastError = "Analiz servisine bağlanılamadı.";

    for (const payload of payloads) {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => null);

      if (response.ok) return extractText(data);

      if (data && typeof data === "object") {
        const obj = data as Record<string, unknown>;
        if (typeof obj.error === "string") lastError = obj.error;
        if (typeof obj.message === "string") lastError = obj.message;
      }
    }

    throw new Error(lastError);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);
    setCopied(false);

    if (!form.neighborhood.trim() || !form.area.trim() || !form.askingPrice.trim()) {
      setError("Mahalle, alan ve satış fiyatı alanlarını doldur.");
      return;
    }

    setLoading(true);

    const prompt = `
Sen Yaşam AI Kullanıcı ve Karar Motoru 4.0'sın.
Aşağıdaki taşınmaz için Türkçe, profesyonel, şeffaf ve yatırım odaklı bir analiz hazırla.

TAŞINMAZ BİLGİLERİ
İl: ${form.city}
İlçe: ${form.district}
Mahalle: ${form.neighborhood}
Taşınmaz türü: ${form.propertyType}
Alan: ${form.area} m²
Satış fiyatı: ${formattedPrice || form.askingPrice} TL
Ek bilgiler: ${form.notes || "Belirtilmedi"}

GERÇEK AÇIK VERİ VE KONUM ÖZETİ
${locationDataSummary}

ÖNEMLİ KURALLAR
- Gerçek zamanlı resmî veya piyasa verisine erişimin yoksa bunu açıkça yaz.
- Bilinmeyen bilgileri uydurma.
- OpenStreetMap ve Overpass özetini yalnızca açık veri kaynağı olarak kullan; resmî veri gibi sunma.
- Konum verisi taranmadıysa bunu raporda açıkça belirt ve Veri Güven Skorunu sınırla.
- Tahminleri "tahmini" olarak belirt.
- Eksik veri nedeniyle kesin karar verilemiyorsa veri güven skorunu düşür.
- Risk Puanında yüksek puan daha yüksek risk anlamına gelsin.
- Tüm parasal değerleri Türk Lirası olarak ve rakamla yaz.
- Karar seçeneklerinden yalnızca birini kullan: AL, PAZARLIK YAP, BEKLE, UZAK DUR.

RAPORU TAM OLARAK ŞU BAŞLIKLARLA HAZIRLA

1. Veri Güven Skoru
Puan: 0-100/100

2. Yatırım Puanı
Puan: 0-100/100

3. Fırsat Puanı
Puan: 0-100/100

4. Risk Puanı
Puan: 0-100/100

5. Likidite Puanı
Puan: 0-100/100

6. AI Değerleme
Tahmini Piyasa Değeri: ... TL
Hızlı Satış Değeri: ... TL
Güvenli Teklif Fiyatı: ... TL
Maksimum Teklif Fiyatı: ... TL
Önerilen Pazarlık Payı: %...
1 Yıllık Tahmini Değer: ... TL
3 Yıllık Tahmini Değer: ... TL
5 Yıllık Tahmini Değer: ... TL

7. Yaşam AI Nihai Kararı
Karar: AL veya PAZARLIK YAP veya BEKLE veya UZAK DUR

8. Nihai Karar Gerekçesi

9. Güçlü Yönler

10. Kritik Riskler

11. Bölgesel ve Mahalle Analizi

12. 5 Maddelik Eylem Planı

13. Veri Güven Açıklaması
Hangi bilgiler kullanıcı beyanı, hangileri tahmin, hangileri resmî doğrulama gerektiriyor açıkla.

14. Profesyonel Sonuç
`.trim();

    try {
      const raw = await requestAnalysis(prompt);
      setResult({ raw });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Beklenmeyen bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  async function copyNegotiationMessage() {
    try {
      await navigator.clipboard.writeText(negotiationMessage);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Pazarlık mesajı kopyalanamadı.");
    }
  }

  function resetAnalysis() {
    setForm(initialForm);
    setResult(null);
    setError("");
    setCopied(false);
  }

  function saveCurrentReport() {
    if (!result?.raw) {
      setArchiveMessage("Önce bir analiz tamamla.");
      return;
    }

    const report: SavedReport = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      title: `${form.district} · ${form.neighborhood || "Mahalle belirtilmedi"}`,
      city: form.city,
      district: form.district,
      neighborhood: form.neighborhood,
      propertyType: form.propertyType,
      area: form.area,
      askingPrice: askingPriceNumber,
      decision,
      reportScore: dynamicMetrics.reportScore,
      marketValue: dynamicMetrics.market,
      isFavorite: false,
      raw: result.raw,
    };

    setSavedReports((current) => [report, ...current].slice(0, 50));
    setArchiveMessage("Analiz rapor arşivine kaydedildi.");
    window.setTimeout(() => setArchiveMessage(""), 2500);
  }

  function toggleFavorite(id: string) {
    setSavedReports((current) =>
      current.map((report) =>
        report.id === id ? { ...report, isFavorite: !report.isFavorite } : report,
      ),
    );
  }

  function deleteReport(id: string) {
    setSavedReports((current) => current.filter((report) => report.id !== id));
  }

  function openSavedReport(report: SavedReport) {
    setForm({
      city: report.city,
      district: report.district,
      neighborhood: report.neighborhood,
      propertyType: report.propertyType,
      area: report.area,
      askingPrice: report.askingPrice ? new Intl.NumberFormat("tr-TR").format(report.askingPrice) : "",
      notes: "Arşivden açılan analiz",
    });
    setResult({ raw: report.raw });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }


  const inputStyle = {
    width: "100%",
    boxSizing: "border-box" as const,
    padding: "14px 15px",
    borderRadius: "13px",
    border: "1px solid #cad8e8",
    fontSize: "16px",
    outline: "none",
    background: "#ffffff",
    color: "#173253",
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top right, rgba(35,128,206,0.28), transparent 34%), linear-gradient(145deg, #06132d 0%, #0b2e63 48%, #0b4f8f 100%)",
        color: "#ffffff",
        padding: "32px 18px 70px",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <div style={{ width: "100%", maxWidth: "1220px", margin: "0 auto" }}>
        <AnalysisHeader
          title="Yaşam AI V19 Kullanıcı Merkezi"
          location={`${form.city || "Şehir"} / ${form.district || "İlçe"}`}
          propertyType={form.propertyType || "Gayrimenkul"}
          dataTrustScore={scores[0]?.value ?? 45}
          aiStatus={loading ? "processing" : result ? "ready" : "limited"}
        />
        <PremiumScoreGrid
          subtitle={
            result
              ? "Puanlar tamamlanan AI analizinden dinamik olarak oluşturuldu."
              : "Analizi başlattığında veri güveni, yatırım, fırsat, risk ve likidite puanları güncellenecek."
          }
          scores={scores.map((item) => ({
            title: item.title.replace(" Puanı", "").replace(" Skoru", ""),
            value: item.value,
            description: item.description,
            tone:
              item.title === "Risk Puanı"
                ? item.value <= 35
                  ? "positive"
                  : item.value <= 65
                    ? "warning"
                    : "danger"
                : item.value >= 75
                  ? "positive"
                  : item.value >= 50
                    ? "info"
                    : "warning",
          }))}
        />
        <header style={{ textAlign: "center", marginBottom: "30px" }}>
          <div
            style={{
              display: "inline-flex",
              gap: "8px",
              alignItems: "center",
              padding: "8px 14px",
              borderRadius: "999px",
              background: "rgba(255,255,255,0.11)",
              border: "1px solid rgba(255,255,255,0.18)",
              fontSize: "13px",
              fontWeight: 800,
              letterSpacing: "0.6px",
            }}
          >
            ✦ YAŞAM AI • KULLANICI VE RAPOR MERKEZİ V19 FINAL
          </div>

          <h1
            style={{
              margin: "17px 0 10px",
              fontSize: "clamp(34px, 6vw, 58px)",
              lineHeight: 1.04,
              letterSpacing: "-1.5px",
            }}
          >
            Gayrimenkul Intelligence Map Merkezi
          </h1>

          <p
            style={{
              maxWidth: "790px",
              margin: "0 auto",
              color: "#c8ddf6",
              fontSize: "17px",
              lineHeight: 1.7,
            }}
          >
            Değerleme, risk, fırsat, güvenli teklif ve pazarlık stratejisini tek bir
            profesyonel analizde birleştirir.
          </p>
        </header>

        <section
          style={{
            background: "rgba(255,255,255,0.98)",
            color: "#14233d",
            borderRadius: "26px",
            padding: "clamp(20px, 4vw, 38px)",
            boxShadow: "0 28px 80px rgba(0,0,0,0.28)",
            border: "1px solid rgba(255,255,255,0.6)",
          }}
        >
          <div style={{ marginBottom: "22px" }}>
            <h2 style={{ margin: "0 0 6px", fontSize: "22px", color: "#102a4f" }}>
              Taşınmaz Bilgileri
            </h2>
            <p style={{ margin: 0, color: "#718198", lineHeight: 1.6 }}>
              Daha güvenilir sonuç için konum, fiyat ve teknik detayları eksiksiz gir.
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "16px",
              }}
            >
              {[
                ["İl", "city"],
                ["İlçe", "district"],
                ["Mahalle", "neighborhood"],
                ["Alan (m²)", "area"],
                ["Satış fiyatı (TL)", "askingPrice"],
              ].map(([label, key]) => (
                <label key={key} style={{ display: "grid", gap: "7px" }}>
                  <span style={{ fontSize: "14px", fontWeight: 800 }}>{label}</span>
                  <input
                    value={form[key as keyof FormState]}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        [key]: event.target.value,
                      }))
                    }
                    style={inputStyle}
                  />
                </label>
              ))}

              <label style={{ display: "grid", gap: "7px" }}>
                <span style={{ fontSize: "14px", fontWeight: 800 }}>Taşınmaz türü</span>
                <select
                  value={form.propertyType}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      propertyType: event.target.value,
                    }))
                  }
                  style={inputStyle}
                >
                  <option>Arsa</option>
                  <option>Konut</option>
                  <option>İşyeri</option>
                  <option>Tarla</option>
                  <option>Bina</option>
                </select>
              </label>
            </div>

            <label style={{ display: "grid", gap: "7px", marginTop: "16px" }}>
              <span style={{ fontSize: "14px", fontWeight: 800 }}>Ek bilgiler</span>
              <textarea
                value={form.notes}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                placeholder="Cephe, yol genişliği, imar durumu, parsel özellikleri, yapı durumu veya diğer önemli bilgiler..."
                rows={4}
                style={{ ...inputStyle, resize: "vertical" }}
              />
            </label>

            {error && (
              <div
                style={{
                  marginTop: "16px",
                  padding: "13px 15px",
                  borderRadius: "12px",
                  background: "#fff1f2",
                  color: "#a61b2b",
                  border: "1px solid #fecdd3",
                  fontWeight: 700,
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                marginTop: "20px",
                padding: "17px",
                border: "none",
                borderRadius: "14px",
                background: loading
                  ? "#8395ab"
                  : "linear-gradient(90deg, #1254a0, #1680cc)",
                color: "#ffffff",
                fontSize: "17px",
                fontWeight: 900,
                cursor: loading ? "wait" : "pointer",
                boxShadow: loading ? "none" : "0 12px 28px rgba(17, 99, 175, 0.25)",
              }}
            >
              {loading ? "Karar Motoru analiz hazırlıyor..." : "Akıllı Yatırım Analizini Başlat"}
            </button>
          </form>
        </section>

        {result && (
          <section
            style={{
              marginTop: "26px",
              background: "#f4f8fc",
              color: "#162b49",
              borderRadius: "26px",
              padding: "clamp(20px, 4vw, 36px)",
              boxShadow: "0 26px 70px rgba(0,0,0,0.22)",
            }}
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "14px",
                marginBottom: "22px",
              }}
            >
              <div>
                <div
                  style={{
                    color: "#1670bd",
                    fontSize: "13px",
                    fontWeight: 900,
                    letterSpacing: "0.7px",
                    marginBottom: "6px",
                  }}
                >
                  YAŞAM AI PREMIUM YATIRIM RAPORU
                </div>
                <h2 style={{ margin: 0, fontSize: "28px", color: "#102a4f" }}>
                  Akıllı Karar Paneli
                </h2>
              </div>

              <button
                type="button"
                onClick={() => window.print()}
                style={{
                  padding: "11px 16px",
                  borderRadius: "11px",
                  border: "1px solid #b9cce0",
                  background: "#ffffff",
                  color: "#123b68",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                PDF / Yazdır
              </button>
            </div>

            <article
              style={{
                background: decisionStyle.background,
                border: `1px solid ${decisionStyle.border}`,
                color: "#ffffff",
                borderRadius: "22px",
                padding: "24px",
                marginBottom: "20px",
                boxShadow: "0 16px 40px rgba(8, 35, 73, 0.18)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: "18px",
                }}
              >
                <div
                  style={{
                    width: "66px",
                    height: "66px",
                    borderRadius: "50%",
                    display: "grid",
                    placeItems: "center",
                    background: "rgba(255,255,255,0.16)",
                    border: "1px solid rgba(255,255,255,0.28)",
                    fontSize: "32px",
                    fontWeight: 900,
                  }}
                >
                  {decisionStyle.icon}
                </div>

                <div style={{ flex: 1, minWidth: "240px" }}>
                  <div style={{ fontSize: "12px", fontWeight: 900, letterSpacing: "1px" }}>
                    YAŞAM AI NİHAİ KARARI
                  </div>
                  <h3 style={{ margin: "6px 0 5px", fontSize: "34px" }}>{decision}</h3>
                  <div style={{ fontWeight: 800, opacity: 0.9 }}>{decisionStyle.label}</div>
                </div>
              </div>

              <p style={{ margin: "18px 0 0", lineHeight: 1.7, color: "#f4f8ff" }}>
                {decisionReason}
              </p>
            </article>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "14px",
                marginBottom: "20px",
              }}
            >
              <article
                style={{
                  background: "#ffffff",
                  border: "1px solid #dbe7f4",
                  borderRadius: "18px",
                  padding: "19px",
                  boxShadow: "0 10px 28px rgba(17, 54, 93, 0.06)",
                }}
              >
                <div style={{ color: "#72849b", fontSize: "12px", fontWeight: 900 }}>
                  ÖNERİLEN İLK TEKLİF
                </div>
                <strong style={{ display: "block", marginTop: "8px", fontSize: "24px", color: "#0f4c81" }}>
                  {money(valuation.safe)}
                </strong>
                <p style={{ margin: "7px 0 0", color: "#718198", lineHeight: 1.55, fontSize: "13px" }}>
                  Pazarlığa başlanması önerilen güvenli fiyat seviyesi.
                </p>
              </article>

              <article
                style={{
                  background: "#ffffff",
                  border: "1px solid #dbe7f4",
                  borderRadius: "18px",
                  padding: "19px",
                  boxShadow: "0 10px 28px rgba(17, 54, 93, 0.06)",
                }}
              >
                <div style={{ color: "#72849b", fontSize: "12px", fontWeight: 900 }}>
                  AŞILMAMASI ÖNERİLEN SINIR
                </div>
                <strong style={{ display: "block", marginTop: "8px", fontSize: "24px", color: "#b45309" }}>
                  {money(valuation.max)}
                </strong>
                <p style={{ margin: "7px 0 0", color: "#718198", lineHeight: 1.55, fontSize: "13px" }}>
                  Resmî kontroller olumlu olsa bile önerilen maksimum alım sınırı.
                </p>
              </article>

              <article
                style={{
                  background: "#ffffff",
                  border: "1px solid #dbe7f4",
                  borderRadius: "18px",
                  padding: "19px",
                  boxShadow: "0 10px 28px rgba(17, 54, 93, 0.06)",
                }}
              >
                <div style={{ color: "#72849b", fontSize: "12px", fontWeight: 900 }}>
                  AI GÜVEN SEVİYESİ
                </div>
                <strong style={{ display: "block", marginTop: "8px", fontSize: "24px", color: "#047857" }}>
                  {scores[0]?.value ?? 0}/100
                </strong>
                <p style={{ margin: "7px 0 0", color: "#718198", lineHeight: 1.55, fontSize: "13px" }}>
                  Kullanıcı beyanı, veri kapsamı ve doğrulanabilirlik birlikte değerlendirilir.
                </p>
              </article>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(185px, 1fr))",
                gap: "15px",
              }}
            >
              {scores.map((card) => (
                <ScoreRing key={card.title} {...card} />
              ))}
            </div>

            <div style={{ marginTop: "26px" }}>
              <div style={{ marginBottom: "13px" }}>
                <h3 style={{ margin: "0 0 5px", color: "#102a4f", fontSize: "22px" }}>
                  AI Değerleme ve Teklif Aralığı
                </h3>
                <p style={{ margin: 0, color: "#718198", lineHeight: 1.6 }}>
                  Aşağıdaki değerler mevcut bilgi kapsamına göre tahminidir; gerçek emsal ve
                  resmî belge doğrulaması gerektirir.
                </p>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(205px, 1fr))",
                  gap: "14px",
                }}
              >
                <MetricCard
                  label="İSTENEN FİYAT"
                  value={money(askingPriceNumber)}
                  note="Satıcının veya ilan sahibinin talep ettiği mevcut bedel."
                />
                <MetricCard
                  label="TAHMİNİ PİYASA DEĞERİ"
                  value={money(valuation.market)}
                  note="Normal piyasa koşullarındaki tahmini değer."
                />
                <MetricCard
                  label="HIZLI SATIŞ DEĞERİ"
                  value={money(valuation.quick)}
                  note="Daha kısa sürede satış hedeflendiğinde tahmini seviye."
                />
                <MetricCard
                  label="GÜVENLİ TEKLİF"
                  value={money(valuation.safe)}
                  note="Risk payı bırakılarak önerilen başlangıç teklifi."
                />
                <MetricCard
                  label="MAKSİMUM TEKLİF"
                  value={money(valuation.max)}
                  note="Belge kontrolleri olumluysa aşılmaması önerilen sınır."
                />
                <MetricCard
                  label="PAZARLIK PAYI"
                  value={`%${valuation.negotiation}`}
                  note="İlan fiyatına göre önerilen yaklaşık pazarlık oranı."
                />
                <MetricCard
                  label="1 YILLIK TAHMİNİ DEĞER"
                  value={money(valuation.oneYear)}
                  note="Kısa vadeli değer artışı senaryosudur."
                />
                <MetricCard
                  label="3 YILLIK TAHMİNİ DEĞER"
                  value={money(valuation.threeYear)}
                  note="Orta vadeli gelişim ve piyasa senaryosudur."
                />
                <MetricCard
                  label="5 YILLIK TAHMİNİ DEĞER"
                  value={money(valuation.fiveYear)}
                  note="Uzun vadeli büyüme varsayımıyla oluşturulan tahmini senaryodur."
                />
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))",
                gap: "17px",
                marginTop: "22px",
              }}
            >
              <article
                style={{
                  background: "#ecfdf5",
                  border: "1px solid #a7f3d0",
                  borderRadius: "18px",
                  padding: "20px",
                }}
              >
                <h3 style={{ margin: "0 0 12px", color: "#047857" }}>Güçlü Yönler</h3>
                <div
                  style={{
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.7,
                    color: "#36594f",
                    fontSize: "14px",
                  }}
                >
                  {strengths}
                </div>
              </article>

              <article
                style={{
                  background: "#fff7ed",
                  border: "1px solid #fed7aa",
                  borderRadius: "18px",
                  padding: "20px",
                }}
              >
                <h3 style={{ margin: "0 0 12px", color: "#c2410c" }}>Kritik Riskler</h3>
                <div
                  style={{
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.7,
                    color: "#6b4935",
                    fontSize: "14px",
                  }}
                >
                  {risks}
                </div>
              </article>

              <article
                style={{
                  background: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  borderRadius: "18px",
                  padding: "20px",
                }}
              >
                <h3 style={{ margin: "0 0 12px", color: "#1d4ed8" }}>
                  5 Maddelik Eylem Planı
                </h3>
                <div
                  style={{
                    whiteSpace: "pre-wrap",
                    lineHeight: 1.7,
                    color: "#38527a",
                    fontSize: "14px",
                  }}
                >
                  {actionPlan}
                </div>
              </article>
            </div>

            <article
              style={{
                marginTop: "22px",
                background: "#071a38",
                color: "#eaf4ff",
                borderRadius: "20px",
                padding: "24px",
                border: "1px solid #285484",
              }}
            >
              <h3 style={{ margin: "0 0 14px", fontSize: "20px" }}>
                ✦ Ayrıntılı Yapay Zekâ Değerlendirmesi
              </h3>
              <div
                style={{
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.78,
                  fontSize: "15px",
                  color: "#e4effb",
                }}
              >
                {result.raw}
              </div>
            </article>

            <article
              style={{
                marginTop: "22px",
                background: "#ffffff",
                border: "1px solid #dbe7f4",
                borderRadius: "20px",
                padding: "22px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "12px",
                  marginBottom: "14px",
                }}
              >
                <div>
                  <div
                    style={{
                      color: "#1670bd",
                      fontSize: "12px",
                      fontWeight: 900,
                      marginBottom: "5px",
                    }}
                  >
                    PREMIUM ÖZELLİK
                  </div>
                  <h3 style={{ margin: 0, color: "#102a4f", fontSize: "21px" }}>
                    AI Pazarlık Asistanı
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={copyNegotiationMessage}
                  style={{
                    padding: "11px 15px",
                    borderRadius: "11px",
                    border: "none",
                    background: copied ? "#047857" : "#1254a0",
                    color: "#ffffff",
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  {copied ? "Kopyalandı" : "Mesajı Kopyala"}
                </button>
              </div>

              <div
                style={{
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.7,
                  background: "#f5f8fc",
                  borderRadius: "14px",
                  padding: "17px",
                  color: "#40536b",
                  fontSize: "14px",
                }}
              >
                {negotiationMessage}
              </div>
            </article>

            <article
              style={{
                marginTop: "18px",
                background: "#fefce8",
                border: "1px solid #fde68a",
                borderRadius: "17px",
                padding: "18px",
              }}
            >
              <h3 style={{ margin: "0 0 8px", color: "#854d0e", fontSize: "17px" }}>
                Veri Güven Uyarısı
              </h3>
              <p style={{ margin: 0, color: "#6f5822", lineHeight: 1.65, fontSize: "14px" }}>
                Bu rapor yatırım kararını desteklemek amacıyla hazırlanır. Tapu, takyidat,
                imar, zemin, altyapı ve güncel emsal bilgileri resmî kaynaklardan
                doğrulanmadan bağlayıcı işlem yapılmamalıdır.
              </p>
            </article>

            <button
              type="button"
              onClick={resetAnalysis}
              style={{
                width: "100%",
                marginTop: "22px",
                padding: "15px",
                borderRadius: "13px",
                border: "1px solid #b9cce0",
                background: "#ffffff",
                color: "#123b68",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Yeni analiz oluştur
            </button>
          </section>
        )}
    
            <RealEstateMap
              city={form.city}
              district={form.district}
              neighborhood={form.neighborhood}
              onIntelligenceChange={setLocationIntelligence}
            />



      <section style={{
        marginTop:"28px",
        border:"1px solid #dbe7f4",
        borderRadius:"22px",
        background:"#fff",
        padding:"22px",
        boxShadow:"0 14px 35px rgba(17,54,93,.08)"
      }}>
        <div style={{color:"#2563eb",fontWeight:900,fontSize:"12px",letterSpacing:".08em"}}>
          YAŞAM AI PARSEL VE İMAR ZEKÂSI 7.0
        </div>
        <h2 style={{margin:"8px 0 18px",color:"#0f2742"}}>Parsel Analiz Merkezi</h2>

        <div style={{
          display:"grid",
          gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",
          gap:"14px"
        }}>
          <MetricCard label="ADA NUMARASI" value="Kullanıcı Girişi" note="Sonraki aşamada otomatik sorgu." />
          <MetricCard label="PARSEL NUMARASI" value="Kullanıcı Girişi" note="Tapu entegrasyonuna hazır." />
          <MetricCard label="İMAR DURUMU" value="Analiz Hazır" note="Resmî veri bağlantısı sonrası otomatik okunacak." />
          <MetricCard label="KULLANIM TÜRÜ" value="Konut / Ticaret" note="AI öneri motoruna bağlı." />
          <MetricCard label="TAKS / KAKS" value="Entegrasyon Bekleniyor" note="Uygun veri kaynaklarında otomatik." />
          <MetricCard label="ÖNERİLEN PROJE" value="AI Hesaplayacak" note="Parsel özelliklerine göre üretilecek." />
        </div>

        <div style={{
          marginTop:"18px",
          borderRadius:"18px",
          background:"linear-gradient(135deg,#f8fbff,#eef6ff)",
          border:"1px solid #d9e8f8",
          padding:"18px"
        }}>
          <h3 style={{marginTop:0,color:"#0f4c81"}}>🤖 AI Geliştirici Yorumu</h3>
          <p style={{marginBottom:8,lineHeight:1.7,color:"#52657b"}}>
            Bu modül, ileride ada/parsel bilgisi veya seçilen koordinata göre
            imar verilerini, yapılaşma potansiyelini, yatırım risklerini ve
            en uygun proje önerisini tek raporda sunacak.
          </p>
          <ul style={{margin:0,paddingLeft:"20px",lineHeight:1.8,color:"#52657b"}}>
            <li>Olası daire sayısı tahmini</li>
            <li>Kat adedi değerlendirmesi</li>
            <li>Yapı türü önerisi</li>
            <li>Yatırım ve geliştirme stratejisi</li>
          </ul>
        </div>
      </section>


<section style={{
marginTop:"28px",
background:"#fff",
border:"1px solid #dbe7f4",
borderRadius:"22px",
padding:"22px",
boxShadow:"0 14px 35px rgba(17,54,93,.08)"
}}>
<div style={{color:"#1d4ed8",fontWeight:900,fontSize:"12px"}}>AI EMSAL VE DEĞERLEME MOTORU 9.0 • V18</div>
<h2 style={{margin:"8px 0 18px",color:"#0f2742"}}>Profesyonel Değer Analizi</h2>

<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:"14px"}}>
<MetricCard label="TAHMİNİ PİYASA DEĞERİ" value={money(dynamicMetrics.market)} note="AI analiz çıktısı ve kullanıcı fiyatından hesaplandı." />
<MetricCard label="İDEAL İLAN FİYATI" value={money(dynamicMetrics.idealListing)} note="Fırsat ve yatırım puanına göre rekabetçi öneri." />
<MetricCard label="HIZLI SATIŞ FİYATI" value={money(dynamicMetrics.quickSale)} note="Likidite puanına göre dinamik öneri." />
<MetricCard label="FİYAT DURUMU" value={dynamicMetrics.priceStatus} note={dynamicMetrics.priceGap ? `Piyasa değerine göre %${Math.abs(dynamicMetrics.priceGap).toFixed(1)} fark.` : "Analiz fiyatına göre hesaplandı."} />
<MetricCard label="PAZARLIK PAYI" value={`%${valuation.negotiation || Math.max(3, Math.round(Math.abs(dynamicMetrics.priceGap)))}`} note="Güvenli teklif seviyesine göre hesaplandı." />
<MetricCard label="DEĞER GÜVENİ" value={`${dynamicMetrics.valueConfidence} / 100`} note="Veri güveni, yatırım ve likidite puanlarının bileşkesi." />
</div>

<div style={{ marginTop: "18px" }}></div>

<div style={{
borderRadius:"18px",
background:"linear-gradient(135deg,#eff8ff,#f8fcff)",
border:"1px solid #d9e8f8",
padding:"18px"
}}>
<h3 style={{marginTop:0,color:"#0f4c81"}}>🤖 AI Değerleme Özeti</h3>
<p style={{lineHeight:1.8,color:"#52657b"}}>
{dynamicMetrics.priceStatus === "Avantajlı"
  ? "Girilen fiyat, hesaplanan piyasa değerinin altında görünüyor. Resmî ve güncel emsaller doğrulanırsa güçlü bir fırsat olabilir."
  : dynamicMetrics.priceStatus === "Yüksek"
    ? "Girilen fiyat, hesaplanan piyasa değerinin üzerinde görünüyor. Güvenli teklif ve maksimum teklif sınırları korunarak pazarlık yapılması önerilir."
    : "Girilen fiyat, hesaplanan piyasa aralığıyla genel olarak uyumlu görünüyor. Nihai karar öncesinde güncel emsal ve resmî belge doğrulaması yapılmalıdır."}
</p>
</div>
</section>


<section style={{
  marginTop: "28px",
  background: "#ffffff",
  border: "1px solid #dbe7f4",
  borderRadius: "22px",
  padding: "22px",
  boxShadow: "0 14px 35px rgba(17,54,93,.08)"
}}>
  <div style={{
    display: "flex",
    justifyContent: "space-between",
    gap: "16px",
    alignItems: "flex-start",
    flexWrap: "wrap"
  }}>
    <div>
      <div style={{
        color: "#1d4ed8",
        fontWeight: 900,
        fontSize: "12px",
        letterSpacing: ".08em"
      }}>
        PAKET 9 · FİNANSAL FİZİBİLİTE VE KÂRLILIK MOTORU
      </div>
      <h2 style={{ margin: "8px 0 6px", color: "#0f2742" }}>
        Yatırım Senaryosu ve Kârlılık Merkezi
      </h2>
      <p style={{ margin: 0, color: "#64748b", lineHeight: 1.7 }}>
        Taşınmazın satın alma, geliştirme, kiralama ve satış senaryolarını tek ekranda karşılaştırır.
      </p>
    </div>

    <div style={{
      padding: "10px 14px",
      borderRadius: "14px",
      background: "#ecfdf5",
      border: "1px solid #bbf7d0",
      color: "#166534",
      fontWeight: 800
    }}>
      Finansal Karar: {dynamicMetrics.financialDecision}
    </div>
  </div>

  <div style={{
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))",
    gap: "14px",
    marginTop: "20px"
  }}>
    <MetricCard
      label="TOPLAM YATIRIM MALİYETİ"
      value={money(dynamicMetrics.totalInvestment)}
      note="Arsa + geliştirme + yan giderler."
    />
    <MetricCard
      label="TAHMİNİ PROJE GELİRİ"
      value={money(dynamicMetrics.projectRevenue)}
      note="Öngörülen toplam satış geliri."
    />
    <MetricCard
      label="TAHMİNİ NET KÂR"
      value={money(dynamicMetrics.netProfit)}
      note="Vergi öncesi tahmini sonuç."
    />
    <MetricCard
      label="KÂRLILIK ORANI"
      value={`%${dynamicMetrics.profitability.toFixed(1).replace(".", ",")}`}
      note="Toplam maliyete göre."
    />
    <MetricCard
      label="GERİ DÖNÜŞ SÜRESİ"
      value={`${Math.max(12, dynamicMetrics.paybackMonths - 3)} - ${dynamicMetrics.paybackMonths + 3} Ay`}
      note="Tahmini proje ve satış süreci."
    />
    <MetricCard
      label="FİNANSAL GÜVEN"
      value={`${dynamicMetrics.financialConfidence} / 100`}
      note="Mevcut varsayımlara göre."
    />
  </div>

  <div style={{
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))",
    gap: "16px",
    marginTop: "18px"
  }}>
    <div style={{
      border: "1px solid #d9e8f8",
      borderRadius: "18px",
      padding: "18px",
      background: "linear-gradient(135deg,#f8fbff,#eef6ff)"
    }}>
      <h3 style={{ margin: "0 0 14px", color: "#0f4c81" }}>
        Finansal Senaryolar
      </h3>

      <div style={{ display: "grid", gap: "10px" }}>
        {[
          ["Temkinli Senaryo", money(dynamicMetrics.conservativeProfit), `%${(dynamicMetrics.profitability * 0.62).toFixed(1).replace(".", ",")}`, "Satış süresi uzar ve fiyat baskısı oluşursa."],
          ["Beklenen Senaryo", money(dynamicMetrics.expectedProfit), `%${dynamicMetrics.profitability.toFixed(1).replace(".", ",")}`, "Mevcut AI puanları ve kullanıcı girdilerine göre."],
          ["Güçlü Piyasa Senaryosu", money(dynamicMetrics.strongProfit), `%${(dynamicMetrics.profitability * 1.32).toFixed(1).replace(".", ",")}`, "Talep ve satış fiyatı güçlenirse."]
        ].map(([title, profit, rate, note]) => (
          <div key={title} style={{
            border: "1px solid #dbe7f4",
            borderRadius: "14px",
            padding: "13px",
            background: "#ffffff"
          }}>
            <div style={{ fontWeight: 900, color: "#0f2742" }}>{title}</div>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "12px",
              marginTop: "7px",
              flexWrap: "wrap"
            }}>
              <span style={{ color: "#0f766e", fontWeight: 900 }}>{profit}</span>
              <span style={{ color: "#1d4ed8", fontWeight: 900 }}>{rate}</span>
            </div>
            <div style={{ marginTop: "6px", color: "#64748b", fontSize: "13px" }}>
              {note}
            </div>
          </div>
        ))}
      </div>
    </div>

    <div style={{
      border: "1px solid #d9e8f8",
      borderRadius: "18px",
      padding: "18px",
      background: "#ffffff"
    }}>
      <h3 style={{ margin: "0 0 14px", color: "#0f4c81" }}>
        Maliyet Dağılımı
      </h3>

      {[
        ["Taşınmaz Alım Bedeli", money(askingPriceNumber), dynamicMetrics.totalInvestment ? Math.round((askingPriceNumber / dynamicMetrics.totalInvestment) * 100) : 0],
        ["İnşaat / Geliştirme", money(dynamicMetrics.developmentCost), dynamicMetrics.totalInvestment ? Math.round((dynamicMetrics.developmentCost / dynamicMetrics.totalInvestment) * 100) : 0],
        ["Ruhsat ve Resmî Giderler", money(dynamicMetrics.officialCosts), dynamicMetrics.totalInvestment ? Math.round((dynamicMetrics.officialCosts / dynamicMetrics.totalInvestment) * 100) : 0],
        ["Finansman ve Diğer Giderler", money(dynamicMetrics.financeCosts), dynamicMetrics.totalInvestment ? Math.round((dynamicMetrics.financeCosts / dynamicMetrics.totalInvestment) * 100) : 0]
      ].map(([label, value, percentage]) => (
        <div key={String(label)} style={{ marginBottom: "14px" }}>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "12px",
            fontSize: "13px",
            color: "#475569"
          }}>
            <span>{label}</span>
            <strong style={{ color: "#0f2742" }}>{value}</strong>
          </div>
          <div style={{
            height: "8px",
            marginTop: "7px",
            background: "#eaf0f6",
            borderRadius: "999px",
            overflow: "hidden"
          }}>
            <div style={{
              width: `${percentage}%`,
              height: "100%",
              borderRadius: "999px",
              background: "linear-gradient(90deg,#2563eb,#0ea5e9)"
            }} />
          </div>
        </div>
      ))}
    </div>
  </div>

  <div style={{
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))",
    gap: "16px",
    marginTop: "18px"
  }}>
    <div style={{
      borderRadius: "18px",
      background: "#fff7ed",
      border: "1px solid #fed7aa",
      padding: "18px"
    }}>
      <h3 style={{ marginTop: 0, color: "#9a3412" }}>
        Kritik Finansal Riskler
      </h3>
      <ul style={{ margin: 0, paddingLeft: "20px", color: "#7c2d12", lineHeight: 1.85 }}>
        <li>İnşaat maliyetlerinde beklenmeyen artış</li>
        <li>Satış süresinin tahminden uzun olması</li>
        <li>Finansman maliyetinin yükselmesi</li>
        <li>İmar ve ruhsat sürecinde gecikme</li>
      </ul>
    </div>

    <div style={{
      borderRadius: "18px",
      background: "linear-gradient(135deg,#eff8ff,#f8fcff)",
      border: "1px solid #d9e8f8",
      padding: "18px"
    }}>
      <h3 style={{ marginTop: 0, color: "#0f4c81" }}>
        🤖 AI Finansal Karar Özeti
      </h3>
      <p style={{ marginBottom: 0, lineHeight: 1.8, color: "#52657b" }}>
        {dynamicMetrics.financialDecision === "Yatırıma Uygun"
          ? `Beklenen senaryoda yaklaşık %${dynamicMetrics.profitability.toFixed(1).replace(".", ",")} kârlılık hesaplanıyor. Maliyetler kontrol altında tutulur ve resmî doğrulamalar olumlu sonuçlanırsa yatırım uygulanabilir görünüyor.`
          : dynamicMetrics.financialDecision === "Kontrollü İncele"
            ? "Finansal sonuç sınırda. Satın alma bedeli, geliştirme maliyeti ve satış süresi detaylı doğrulanmadan karar verilmemelidir."
            : "Mevcut girdiler finansal açıdan temkinli olunması gerektiğini gösteriyor. Fiyat revizyonu ve ek doğrulama yapılmadan ilerlenmesi önerilmez."}
      </p>
    </div>
  </div>
</section>


<section style={{marginTop:"28px",background:"#fff",border:"1px solid #dbe7f4",borderRadius:"22px",padding:"22px",boxShadow:"0 14px 35px rgba(17,54,93,.08)"}}>
<div style={{color:"#1d4ed8",fontWeight:900,fontSize:"12px"}}>PAKET 10 · AI PAZARLIK ASİSTANI PRO</div>
<h2 style={{margin:"8px 0 16px",color:"#0f2742"}}>Profesyonel Müzakere Merkezi</h2>

<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:"14px"}}>
<MetricCard label="ÖNERİLEN İLK TEKLİF" value={money(dynamicMetrics.safeOffer)} note="AI güvenli başlangıç önerisi"/>
<MetricCard label="HEDEF ANLAŞMA" value={money(Math.round((dynamicMetrics.safeOffer + dynamicMetrics.maximumOffer) / 2))} note="Dengeli hedef seviye"/>
<MetricCard label="MAKSİMUM FİYAT" value={money(dynamicMetrics.maximumOffer)} note="Bunun üzeri önerilmez"/>
<MetricCard label="ANLAŞMA OLASILIĞI" value={`%${dynamicMetrics.probability}`} note="Fiyat farkı, likidite ve veri güvenine göre"/>
<MetricCard label="PAZARLIK GÜCÜ" value={dynamicMetrics.negotiationPower} note="Fırsat ve fiyat analizine göre"/>
<MetricCard label="AI KARARI" value={decision === "AL" ? "Hızlı İlerle" : decision === "PAZARLIK YAP" ? "Pazarlığa Başla" : decision} note="Dinamik premium öneri"/>
</div>

<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:"16px",marginTop:"18px"}}>
<div style={{border:"1px solid #dbe7f4",borderRadius:"18px",padding:"18px"}}>
<h3 style={{marginTop:0,color:"#0f4c81"}}>Satıcıya Hazır Mesaj</h3>
<p style={{lineHeight:1.8,color:"#52657b"}}>
{negotiationMessage}
</p>
</div>

<div style={{border:"1px solid #dbe7f4",borderRadius:"18px",padding:"18px",background:"linear-gradient(135deg,#eff8ff,#f8fcff)"}}>
<h3 style={{marginTop:0,color:"#0f4c81"}}>🤖 Premium Karar Özeti</h3>
<ul style={{paddingLeft:"20px",lineHeight:1.9,color:"#52657b"}}>
<li>İlk teklifi kontrollü ver.</li>
<li>Hedef fiyatın üzerine erken çıkma.</li>
<li>Maksimum fiyat sınırını aşma.</li>
<li>Karşı teklif gelirse yeniden analiz et.</li>
<li>Nihai kararı doğrulanmış verilerle destekle.</li>
</ul>
</div>
</div>

<div style={{marginTop:"18px",padding:"18px",borderRadius:"18px",background:"#f8fafc",border:"1px solid #dbe7f4"}}>
<strong>Şeffaflık Paneli</strong>
<p style={{marginBottom:0,lineHeight:1.8,color:"#52657b"}}>
Bu öneriler mevcut analiz çıktıları ve kullanıcı tarafından sağlanan bilgiler kullanılarak oluşturulan AI tavsiyeleridir. Gerçek pazarlık kararı verilmeden önce resmi belgeler, güncel emsal satışlar ve hukuki durum ayrıca doğrulanmalıdır.
</p>
</div>
</section>


<section style={{
marginTop:"28px",
background:"#fff",
border:"1px solid #dbe7f4",
borderRadius:"22px",
padding:"22px",
boxShadow:"0 14px 35px rgba(17,54,93,.08)"
}}>
<div style={{color:"#1d4ed8",fontWeight:900,fontSize:"12px"}}>
PAKET 11 · PREMIUM PDF EKSPERTİZ RAPORU
</div>

<h2 style={{margin:"8px 0 18px",color:"#0f2742"}}>
Kurumsal Rapor Merkezi
</h2>

<div style={{
border:"1px solid #dbe7f4",
borderRadius:"18px",
padding:"20px",
background:"linear-gradient(135deg,#0f2742,#1d4ed8)",
color:"#fff"
}}>
<h2 style={{margin:"0 0 8px"}}>YAŞAM AI Premium Ekspertiz Raporu</h2>
<p style={{opacity:.92,lineHeight:1.8}}>
Rapor No: YA-2026-000001<br/>
Durum: Premium AI Analizi Tamamlandı<br/>
Doğrulama: QR Kod Altyapısına Hazır
</p>
</div>

<div style={{
display:"grid",
gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",
gap:"14px",
marginTop:"20px"
}}>
<MetricCard label="RAPOR SKORU" value={`${dynamicMetrics.reportScore} / 100`} note="Beş ana puanın ağırlıklı sonucu"/>
<MetricCard label="YATIRIM KARARI" value={decision} note="AI karar motoru"/>
<MetricCard label="RAPOR TÜRÜ" value="Premium" note="Kurumsal çıktı"/>
<MetricCard label="PDF DURUMU" value="Hazır" note="Yazdırmaya uygun"/>
</div>

<div style={{
marginTop:"18px",
border:"1px solid #dbe7f4",
borderRadius:"18px",
padding:"18px"
}}>
<h3 style={{marginTop:0,color:"#0f4c81"}}>Yönetici Özeti</h3>
<p style={{lineHeight:1.8,color:"#52657b"}}>
Bu rapor; değerleme, çevre analizi, finansal fizibilite, pazarlık önerileri ve
risk değerlendirmelerini tek dokümanda özetlemek amacıyla hazırlanmıştır.
Sonraki aşamada gerçek PDF üretimi, QR kod doğrulaması ve kurumsal çıktı
altyapısı eklenecektir.
</p>
</div>

<div style={{
display:"flex",
gap:"12px",
flexWrap:"wrap",
marginTop:"20px"
}}>
<button style={{
padding:"12px 18px",
borderRadius:"12px",
border:"none",
background:"#1d4ed8",
color:"#fff",
fontWeight:700,
cursor:"pointer"
}}>
📄 Premium PDF Oluştur
</button>

<button style={{
padding:"12px 18px",
borderRadius:"12px",
border:"1px solid #cbd5e1",
background:"#fff",
fontWeight:700,
cursor:"pointer"
}}>
🖨️ Yazdır
</button>
</div>
</section>


<section style={{
  marginTop:"28px",
  background:"#fff",
  border:"1px solid #dbe7f4",
  borderRadius:"22px",
  padding:"22px",
  boxShadow:"0 14px 35px rgba(17,54,93,.08)"
}}>
  <div style={{color:"#1d4ed8",fontWeight:900,fontSize:"12px",letterSpacing:".08em"}}>
    V19 · GERÇEK KULLANICI MERKEZİ VE YEREL RAPOR ARŞİVİ
  </div>

  <div style={{display:"flex",justifyContent:"space-between",gap:"16px",alignItems:"flex-start",flexWrap:"wrap"}}>
    <div>
      <h2 style={{margin:"8px 0 6px",color:"#0f2742"}}>Kullanıcı Paneli ve Rapor Arşivi</h2>
      <p style={{margin:"0 0 18px",color:"#64748b",lineHeight:1.7,maxWidth:"760px"}}>
        Tamamlanan analizleri bu cihazda kaydet, favorilere ekle, geçmiş raporları yeniden aç ve kararlarını tek merkezden yönet.
      </p>
    </div>
    <button onClick={saveCurrentReport} style={{padding:"12px 18px",borderRadius:"12px",border:"none",background:"linear-gradient(135deg,#0f4c81,#2563eb)",color:"#fff",fontWeight:900,cursor:"pointer"}}>
      💾 Mevcut Analizi Kaydet
    </button>
  </div>

  {archiveMessage && <div style={{marginBottom:"16px",padding:"12px 14px",borderRadius:"12px",background:"#ecfdf5",border:"1px solid #a7f3d0",color:"#047857",fontWeight:800}}>{archiveMessage}</div>}

  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:"14px"}}>
    <MetricCard label="TOPLAM RAPOR" value={String(savedReports.length)} note="Bu cihazda kayıtlı analiz"/>
    <MetricCard label="FAVORİLER" value={String(savedReports.filter((item) => item.isFavorite).length)} note="Öncelikli taşınmazlar"/>
    <MetricCard label="ÜYELİK" value={profile.membership} note="Aktif kullanıcı planı"/>
    <MetricCard label="SON ANALİZ" value={savedReports[0] ? new Date(savedReports[0].createdAt).toLocaleDateString("tr-TR") : "Henüz yok"} note="En son kayıt tarihi"/>
  </div>

  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:"16px",marginTop:"18px"}}>
    <div style={{border:"1px solid #dbe7f4",borderRadius:"18px",padding:"18px",background:"linear-gradient(135deg,#f8fbff,#eef6ff)"}}>
      <h3 style={{marginTop:0,color:"#0f4c81"}}>👤 Kullanıcı Profili</h3>
      <label style={{display:"grid",gap:"7px",color:"#52657b",fontWeight:800}}>
        Ad Soyad
        <input value={profile.name} onChange={(event) => setProfile((current) => ({...current,name:event.target.value}))} style={{padding:"12px 13px",borderRadius:"11px",border:"1px solid #cbd5e1",fontSize:"15px"}} />
      </label>
      <label style={{display:"grid",gap:"7px",marginTop:"12px",color:"#52657b",fontWeight:800}}>
        Üyelik Planı
        <select value={profile.membership} onChange={(event) => setProfile((current) => ({...current,membership:event.target.value as UserProfile["membership"]}))} style={{padding:"12px 13px",borderRadius:"11px",border:"1px solid #cbd5e1",fontSize:"15px",background:"#fff"}}>
          <option value="Standart">Standart</option><option value="Premium">Premium</option><option value="Gold">Gold</option>
        </select>
      </label>
      <div style={{marginTop:"14px",padding:"13px",borderRadius:"12px",background:"#fff",border:"1px solid #dbe7f4",color:"#52657b",lineHeight:1.7}}>
        <strong style={{color:"#0f2742"}}>{profile.name || "Yaşam AI Kullanıcısı"}</strong><br/>
        Profil ve raporlar tarayıcının yerel hafızasında saklanır.
      </div>
    </div>

    <div style={{border:"1px solid #dbe7f4",borderRadius:"18px",padding:"18px",background:"#fff"}}>
      <h3 style={{marginTop:0,color:"#0f4c81"}}>⚡ Hızlı İşlemler</h3>
      <div style={{display:"grid",gap:"10px"}}>
        <button onClick={() => { resetAnalysis(); window.scrollTo({top:0,behavior:"smooth"}); }} style={{padding:"12px 14px",borderRadius:"12px",border:"1px solid #dbe7f4",background:"#f8fafc",textAlign:"left",fontWeight:800,color:"#0f2742",cursor:"pointer"}}>➕ Yeni Analiz Başlat</button>
        <button onClick={() => setArchiveFilter("all")} style={{padding:"12px 14px",borderRadius:"12px",border:"1px solid #dbe7f4",background:archiveFilter === "all" ? "#dbeafe" : "#f8fafc",textAlign:"left",fontWeight:800,color:"#0f2742",cursor:"pointer"}}>🗂️ Tüm Raporları Göster</button>
        <button onClick={() => setArchiveFilter("favorites")} style={{padding:"12px 14px",borderRadius:"12px",border:"1px solid #dbe7f4",background:archiveFilter === "favorites" ? "#fef3c7" : "#f8fafc",textAlign:"left",fontWeight:800,color:"#0f2742",cursor:"pointer"}}>⭐ Favorileri Göster</button>
      </div>
    </div>
  </div>

  <div style={{marginTop:"18px",border:"1px solid #dbe7f4",borderRadius:"18px",overflow:"hidden"}}>
    <div style={{padding:"15px 18px",background:"#f3f8fd",display:"flex",justifyContent:"space-between",gap:"12px",alignItems:"center",flexWrap:"wrap"}}>
      <h3 style={{margin:0,color:"#0f4c81"}}>📚 {archiveFilter === "favorites" ? "Favori Raporlar" : "Rapor Geçmişi"}</h3>
      <span style={{color:"#64748b",fontSize:"13px"}}>En fazla 50 analiz bu cihazda saklanır.</span>
    </div>
    <div style={{padding:"14px"}}>
      {(archiveFilter === "favorites" ? savedReports.filter((item) => item.isFavorite) : savedReports).length === 0 ? (
        <div style={{padding:"28px",textAlign:"center",color:"#64748b",background:"#f8fafc",borderRadius:"14px"}}>Henüz kayıtlı rapor bulunmuyor. Bir analiz tamamladıktan sonra “Mevcut Analizi Kaydet” düğmesini kullan.</div>
      ) : (
        <div style={{display:"grid",gap:"12px"}}>
          {(archiveFilter === "favorites" ? savedReports.filter((item) => item.isFavorite) : savedReports).map((report) => (
            <article key={report.id} style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",gap:"14px",padding:"15px",borderRadius:"14px",border:"1px solid #dbe7f4",background:"#fff"}}>
              <div>
                <div style={{fontWeight:900,color:"#0f2742",fontSize:"16px"}}>{report.title}</div>
                <div style={{marginTop:"5px",color:"#64748b",fontSize:"13px"}}>{report.propertyType} • {report.area || "—"} m² • {new Date(report.createdAt).toLocaleString("tr-TR")}</div>
                <div style={{display:"flex",gap:"8px",flexWrap:"wrap",marginTop:"10px"}}>
                  <span style={{padding:"5px 9px",borderRadius:"999px",background:"#dbeafe",color:"#1d4ed8",fontWeight:800,fontSize:"12px"}}>Skor {report.reportScore}/100</span>
                  <span style={{padding:"5px 9px",borderRadius:"999px",background:"#ecfdf5",color:"#047857",fontWeight:800,fontSize:"12px"}}>{report.decision}</span>
                  <span style={{padding:"5px 9px",borderRadius:"999px",background:"#f8fafc",color:"#52657b",fontWeight:800,fontSize:"12px"}}>{money(report.marketValue)}</span>
                </div>
              </div>
              <div style={{display:"flex",gap:"7px",alignItems:"center",flexWrap:"wrap",justifyContent:"flex-end"}}>
                <button onClick={() => openSavedReport(report)} style={{padding:"9px 11px",borderRadius:"10px",border:"none",background:"#1d4ed8",color:"#fff",fontWeight:800,cursor:"pointer"}}>Aç</button>
                <button onClick={() => toggleFavorite(report.id)} style={{padding:"9px 11px",borderRadius:"10px",border:"1px solid #f59e0b",background:report.isFavorite ? "#fef3c7" : "#fff",cursor:"pointer"}}>{report.isFavorite ? "★" : "☆"}</button>
                <button onClick={() => deleteReport(report.id)} style={{padding:"9px 11px",borderRadius:"10px",border:"1px solid #fecaca",background:"#fff",color:"#b91c1c",fontWeight:800,cursor:"pointer"}}>Sil</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  </div>

  <div style={{marginTop:"18px",borderRadius:"18px",padding:"18px",background:"linear-gradient(135deg,#0f2742,#1d4ed8)",color:"#fff"}}>
    <h3 style={{marginTop:0}}>V19 Kullanıcı Merkezi</h3>
    <p style={{marginBottom:0,lineHeight:1.8,opacity:.92}}>
      Bu sürüm gerçek kullanıcı deneyiminin yerel prototipidir: profil, rapor kaydı, favoriler, arşivden yeniden açma ve silme işlevleri çalışır. V20 aşamasında bu veriler Supabase tabanlı güvenli hesap ve veritabanına taşınacaktır.
    </p>
  </div>
</section>


<section style={{
  marginTop: "28px",
  background: "#ffffff",
  border: "1px solid #dbe7f4",
  borderRadius: "22px",
  padding: "22px",
  boxShadow: "0 14px 35px rgba(17,54,93,.08)"
}}>
  <div style={{
    color: "#1d4ed8",
    fontWeight: 900,
    fontSize: "12px",
    letterSpacing: ".08em"
  }}>
    PAKET 13 · GERÇEK VERİ ENTEGRASYON MERKEZİ
  </div>

  <h2 style={{ margin: "8px 0 6px", color: "#0f2742" }}>
    Veri Kaynakları ve Güven Kontrol Paneli
  </h2>

  <p style={{ margin: "0 0 18px", color: "#64748b", lineHeight: 1.7 }}>
    Yaşam AI analizlerinin hangi veri kaynaklarından beslendiğini, hangi verilerin
    doğrulandığını ve hangi alanlarda entegrasyon beklendiğini şeffaf biçimde gösterir.
  </p>

  <div style={{
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
    gap: "14px"
  }}>
    <MetricCard
      label="AKTİF VERİ KAYNAĞI"
      value="3"
      note="Harita, adres ve çevre verisi"
    />
    <MetricCard
      label="ENTEGRASYON BEKLEYEN"
      value="6"
      note="Resmî ve ticari veri kaynakları"
    />
    <MetricCard
      label="VERİ GÜVEN SKORU"
      value="72 / 100"
      note="Kaynak durumuna göre dinamik"
    />
    <MetricCard
      label="SON GÜNCELLEME"
      value="Bugün"
      note="Gerçek zamanlı kontrol altyapısı"
    />
  </div>

  <div style={{
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))",
    gap: "16px",
    marginTop: "18px"
  }}>
    <div style={{
      border: "1px solid #dbe7f4",
      borderRadius: "18px",
      padding: "18px",
      background: "linear-gradient(135deg,#f8fbff,#eef6ff)"
    }}>
      <h3 style={{ marginTop: 0, color: "#0f4c81" }}>
        Aktif Kaynaklar
      </h3>

      {[
        ["OpenStreetMap", "Aktif", "Harita ve yol verisi"],
        ["Nominatim", "Aktif", "Adres ve koordinat arama"],
        ["Overpass API", "Aktif", "Okul, sağlık, market, park ve ulaşım"]
      ].map(([name, status, description]) => (
        <div key={name} style={{
          padding: "13px 0",
          borderBottom: "1px solid #dbe7f4"
        }}>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "12px",
            alignItems: "center"
          }}>
            <strong style={{ color: "#0f2742" }}>{name}</strong>
            <span style={{
              padding: "5px 9px",
              borderRadius: "999px",
              background: "#dcfce7",
              color: "#166534",
              fontWeight: 800,
              fontSize: "12px"
            }}>
              {status}
            </span>
          </div>
          <div style={{ marginTop: "5px", color: "#64748b", fontSize: "13px" }}>
            {description}
          </div>
        </div>
      ))}
    </div>

    <div style={{
      border: "1px solid #dbe7f4",
      borderRadius: "18px",
      padding: "18px",
      background: "#ffffff"
    }}>
      <h3 style={{ marginTop: 0, color: "#0f4c81" }}>
        Planlanan Entegrasyonlar
      </h3>

      {[
        ["Mahalle m² fiyatları", "Öncelikli"],
        ["Gerçek emsal ilanlar", "Öncelikli"],
        ["TÜİK açık verileri", "Planlandı"],
        ["Belediye imar verileri", "Kuruma bağlı"],
        ["Kadastro / parsel verileri", "Erişim araştırılıyor"],
        ["Tapu ve satış verileri", "Yasal erişime bağlı"]
      ].map(([name, status]) => (
        <div key={name} style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "12px",
          padding: "11px 0",
          borderBottom: "1px solid #eef2f7",
          color: "#475569"
        }}>
          <span>{name}</span>
          <strong style={{ color: "#b45309" }}>{status}</strong>
        </div>
      ))}
    </div>
  </div>

  <div style={{
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))",
    gap: "16px",
    marginTop: "18px"
  }}>
    <div style={{
      borderRadius: "18px",
      padding: "18px",
      background: "#ecfdf5",
      border: "1px solid #bbf7d0"
    }}>
      <h3 style={{ marginTop: 0, color: "#166534" }}>
        Doğrulanmış Veri
      </h3>
      <ul style={{ margin: 0, paddingLeft: "20px", lineHeight: 1.85, color: "#166534" }}>
        <li>Seçilen harita koordinatı</li>
        <li>Adres arama sonucu</li>
        <li>Yakındaki gerçek çevre noktaları</li>
        <li>Mesafe hesaplamaları</li>
      </ul>
    </div>

    <div style={{
      borderRadius: "18px",
      padding: "18px",
      background: "#fff7ed",
      border: "1px solid #fed7aa"
    }}>
      <h3 style={{ marginTop: 0, color: "#9a3412" }}>
        AI Tahmini / Kullanıcı Verisi
      </h3>
      <ul style={{ margin: 0, paddingLeft: "20px", lineHeight: 1.85, color: "#9a3412" }}>
        <li>Piyasa değeri ve gelecek değer tahmini</li>
        <li>Finansal fizibilite senaryoları</li>
        <li>Pazarlık fiyatları</li>
        <li>İmar ve proje önerileri</li>
      </ul>
    </div>
  </div>

  <div style={{
    marginTop: "18px",
    borderRadius: "18px",
    padding: "18px",
    background: "linear-gradient(135deg,#0f2742,#1d4ed8)",
    color: "#ffffff"
  }}>
    <h3 style={{ marginTop: 0 }}>
      Yaşam AI Veri Güven Protokolü
    </h3>
    <p style={{ marginBottom: 0, lineHeight: 1.8, opacity: .95 }}>
      Sistem; doğrulanmış veriyi, kullanıcı beyanını ve AI tahminini birbirinden
      açıkça ayırır. Resmî veya lisanslı veri bağlantısı bulunmayan alanlarda kesin
      hüküm vermez; kullanıcıya doğrulama gerektiren noktaları ayrıca bildirir.
    </p>
  </div>

  <div style={{
    marginTop: "18px",
    padding: "18px",
    borderRadius: "18px",
    border: "1px solid #dbe7f4",
    background: "#f8fafc"
  }}>
    <strong style={{ color: "#0f2742" }}>Teknik Hazırlık Durumu</strong>
    <p style={{ marginBottom: 0, lineHeight: 1.8, color: "#52657b" }}>
      Bu paket veri kaynakları görünümünü ve güven katmanını hazırlar. Sonraki teknik
      aşamada API anahtarları, veritabanı tabloları, veri güncelleme zamanları,
      hata günlükleri ve kaynak bazlı güven puanları gerçek servislerle bağlanacaktır.
    </p>
  </div>
</section>


<section style={{
marginTop:"28px",
background:"#fff",
border:"1px solid #e5d38a",
borderRadius:"22px",
padding:"22px",
boxShadow:"0 14px 35px rgba(17,54,93,.08)"
}}>
<div style={{color:"#b8860b",fontWeight:900,fontSize:"12px",letterSpacing:".08em"}}>
V16 · GOLD ÜYELİK VE AI STRATEJİ ODASI
</div>

<h2 style={{margin:"8px 0 8px",color:"#0f2742"}}>
Yaşam AI Gold
</h2>

<p style={{color:"#64748b",lineHeight:1.8}}>
Gold üyelik; yatırımcıların sadece tek bir taşınmazı değil, tüm portföyünü ve uzun vadeli stratejisini
AI desteğiyle yönetebilmesi için tasarlanmıştır.
</p>

<div style={{
display:"grid",
gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",
gap:"14px",
marginTop:"18px"
}}>
<MetricCard label="ÜYELİK DURUMU" value="GOLD" note="Premium üzeri seviye"/>
<MetricCard label="AI STRATEJİ PUANI" value="96 / 100" note="Portföy odaklı analiz"/>
<MetricCard label="PORTFÖY TAKİBİ" value="Aktif" note="Çoklu yatırım yönetimi"/>
<MetricCard label="FİYAT ALARMLARI" value="Hazır" note="Bildirim altyapısı"/>
</div>

<div style={{
display:"grid",
gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",
gap:"16px",
marginTop:"18px"
}}>
<div style={{border:"1px solid #e5e7eb",borderRadius:"18px",padding:"18px"}}>
<h3 style={{marginTop:0,color:"#0f4c81"}}>Gold Ayrıcalıkları</h3>
<ul style={{paddingLeft:"20px",lineHeight:1.9,color:"#52657b"}}>
<li>AI Strateji Odası</li>
<li>Sürekli fiyat ve emsal takibi</li>
<li>Bölgesel yatırım ısı haritası</li>
<li>Proje ve kârlılık simülatörü</li>
<li>Portföy performans paneli</li>
<li>10 yıllık değer senaryoları</li>
<li>Kurumsal yatırımcı raporları</li>
</ul>
</div>

<div style={{border:"1px solid #e5e7eb",borderRadius:"18px",padding:"18px",background:"linear-gradient(135deg,#fff8dc,#fffef5)"}}>
<h3 style={{marginTop:0,color:"#8a6d00"}}>🧠 AI Strateji Odası</h3>
<p style={{lineHeight:1.8,color:"#5b5b4b"}}>
Kullanıcı uzun vadeli hedefini yazabilir.
AI; yatırım planı, büyüme senaryoları, nakit akışı, portföy dengesi ve
öncelikli fırsatları tek merkezden analiz ederek yol haritası oluşturur.
</p>
</div>
</div>

<div style={{
marginTop:"18px",
padding:"18px",
borderRadius:"18px",
background:"linear-gradient(135deg,#0f2742,#1d4ed8)",
color:"#fff"
}}>
<h3 style={{marginTop:0}}>Gold Vizyonu</h3>
<p style={{marginBottom:0,lineHeight:1.8}}>
Amaç yalnızca taşınmaz analizi yapmak değil; yatırımcının yıllar boyunca yanında
çalışan yapay zekâ destekli bir gayrimenkul strateji platformu oluşturmaktır.
</p>
</div>
</section>
      </div>

</main>
  );
}

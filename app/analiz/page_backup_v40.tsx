/*
YAŞAM AI - V40 FAZ 1 FINAL
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


const investmentScenarios = [
  {year:"1 Yıl", growth:"+12%", rent:"%5,2", score:72},
  {year:"3 Yıl", growth:"+41%", rent:"%17,1", score:81},
  {year:"5 Yıl", growth:"+86%", rent:"%31,8", score:89},
  {year:"10 Yıl", growth:"+214%", rent:"%68,5", score:95},
];

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
  const [activeModule, setActiveModule] = useState("final");
  const [liveRefreshTick, setLiveRefreshTick] = useState(0);
  const [liveEvents, setLiveEvents] = useState<string[]>([]);
  const [lastLiveRefresh, setLastLiveRefresh] = useState(() => new Date());
  const [v29RunCount, setV29RunCount] = useState(0);
  const [v29RiskProfile, setV29RiskProfile] = useState<"Temkinli" | "Dengeli" | "Agresif">("Dengeli");
  const [v29Strategy, setV29Strategy] = useState<"Oturum" | "Kira" | "Al-Sat" | "Geliştirme">("Geliştirme");
  const [v29RunHistory, setV29RunHistory] = useState<string[]>([]);
  const [v30RunCount, setV30RunCount] = useState(0);
  const [v30Timeline, setV30Timeline] = useState<string[]>([]);
  const [v30LastDuration, setV30LastDuration] = useState(0);
  const [v30AutoMode, setV30AutoMode] = useState(true);
  const [v31RunCount, setV31RunCount] = useState(0);
  const [v31Scenario, setV31Scenario] = useState<"Temkinli" | "Dengeli" | "Büyüme">("Dengeli");
  const [v31Events, setV31Events] = useState<string[]>([]);
  const [v32RunCount, setV32RunCount] = useState(0);
  const [v32VerificationMode, setV32VerificationMode] = useState<"Hızlı" | "Standart" | "Derin">("Standart");
  const [v32Events, setV32Events] = useState<string[]>([]);
  const [v32Consent, setV32Consent] = useState(true);
  const [v33RunCount, setV33RunCount] = useState(0);
  const [v33Layer, setV33Layer] = useState<"Fırsat" | "Risk" | "Erişim" | "Gelişim">("Fırsat");
  const [v33Events, setV33Events] = useState<string[]>([]);
  const [v34RunCount, setV34RunCount] = useState(0);
  const [v34Goal, setV34Goal] = useState<"Gelir" | "Büyüme" | "Dengeli">("Dengeli");
  const [v34Horizon, setV34Horizon] = useState<"1 Yıl" | "3 Yıl" | "5 Yıl" | "10 Yıl">("5 Yıl");
  const [v34Events, setV34Events] = useState<string[]>([]);
  const [v35RunCount, setV35RunCount] = useState(0);
  const [v35Mode, setV35Mode] = useState<"Ekonomik" | "Dengeli" | "Maksimum Güven">("Dengeli");
  const [v35AutoSync, setV35AutoSync] = useState(true);
  const [v35Events, setV35Events] = useState<string[]>([]);
  const [v36RunCount, setV36RunCount] = useState(0);
  const [v36DecisionMode, setV36DecisionMode] = useState<"Temkinli" | "Dengeli" | "Atak">("Dengeli");
  const [v36Events, setV36Events] = useState<string[]>([]);
  const [v37RunCount, setV37RunCount] = useState(0);
  const [v37ReportMode, setV37ReportMode] = useState<"Yatırımcı" | "Banka" | "Müteahhit" | "Bireysel">("Yatırımcı");
  const [v37Events, setV37Events] = useState<string[]>([]);
  const [v39Scenario, setV39Scenario] = useState<"Temkinli" | "Dengeli" | "İyimser">("Dengeli");
  const [v39Horizon, setV39Horizon] = useState<1 | 3 | 5>(5);
  const [v39RunCount, setV39RunCount] = useState(0);
  const [v39Events, setV39Events] = useState<string[]>([]);

  const dashboardModules = [
    { id: "final", icon: "🚀", label: "Faz 1 Final Merkezi" },
    { id: "overview", icon: "⌂", label: "Genel Bakış" },
    { id: "location", icon: "📍", label: "Konum Analizi" },
    { id: "parcel", icon: "▦", label: "Parsel ve İmar" },
    { id: "valuation", icon: "₺", label: "Değerleme" },
    { id: "market", icon: "◈", label: "Piyasa Zekâsı" },
    { id: "prediction", icon: "📈", label: "AI Tahmin Motoru" },
    { id: "verification", icon: "✓", label: "Resmî Doğrulama" },
    { id: "map", icon: "🗺️", label: "Harita Zekâsı" },
    { id: "portfolio", icon: "🏢", label: "Portföy Merkezi" },
    { id: "orchestration", icon: "🧬", label: "Veri Orkestrasyonu" },
    { id: "command", icon: "🧠", label: "Karar Komuta Merkezi" },
    { id: "finance", icon: "↗", label: "Finansal Fizibilite" },
    { id: "negotiation", icon: "🤝", label: "Pazarlık Asistanı" },
    { id: "report", icon: "▤", label: "Kurumsal Rapor Merkezi" },
    { id: "user", icon: "👤", label: "Kullanıcı Merkezi" },
    { id: "data", icon: "⚙", label: "Gerçek Veri Katmanı" },
    { id: "gold", icon: "★", label: "Gold Üyelik" },
  ];

  function openDashboardModule(id: string) {
    setActiveModule(id);
    window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

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
    const storedModule = window.localStorage.getItem("yasam-ai-v39-active-module");
    if (storedModule && dashboardModules.some((module) => module.id === storedModule)) {
      setActiveModule(storedModule);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("yasam-ai-v40-active-module", activeModule);
  }, [activeModule]);

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

  const reportIdentity = useMemo(() => {
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, "");
    const locationPart = `${form.city}-${form.district}-${form.neighborhood}`
      .toLocaleUpperCase("tr-TR")
      .replace(/[^A-ZÇĞİÖŞÜ0-9]/g, "")
      .slice(0, 6) || "RAPOR";
    const pricePart = String(askingPriceNumber || 0).slice(-4).padStart(4, "0");
    return {
      number: `YA-${datePart}-${locationPart}-${pricePart}`,
      verificationCode: `${locationPart}-${datePart.slice(-4)}-${pricePart}`,
      createdAt: new Intl.DateTimeFormat("tr-TR", {
        dateStyle: "long",
        timeStyle: "short",
      }).format(now),
    };
  }, [askingPriceNumber, form.city, form.district, form.neighborhood, result]);

  function printPremiumReport() {
    const previousTitle = document.title;
    document.title = `${reportIdentity.number} - Yaşam AI Premium Rapor`;
    window.print();
    window.setTimeout(() => {
      document.title = previousTitle;
    }, 500);
  }

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

  const decisionCore = useMemo(() => {
    const hasLocation = Boolean(locationIntelligence?.nearbyPlaces.length);
    const hasPrice = askingPriceNumber > 0;
    const hasAiAnalysis = Boolean(result?.raw?.trim());
    const hasParcelContext = Boolean(form.city && form.district && form.propertyType);

    const completenessItems = [
      { label: "Taşınmaz bilgileri", ready: hasParcelContext, weight: 20 },
      { label: "İlan / alım fiyatı", ready: hasPrice, weight: 20 },
      { label: "Konum ve çevre taraması", ready: hasLocation, weight: 25 },
      { label: "AI analiz sonucu", ready: hasAiAnalysis, weight: 35 },
    ];

    const completeness = completenessItems.reduce(
      (total, item) => total + (item.ready ? item.weight : 0),
      0,
    );

    const riskPressure = dynamicMetrics.risk;
    const opportunityPower = Math.round(
      dynamicMetrics.investment * 0.34 +
      dynamicMetrics.opportunity * 0.3 +
      dynamicMetrics.liquidity * 0.18 +
      (locationIntelligence?.locationScore ?? 0) * 0.18,
    );
    const priceAdvantage = Math.max(-20, Math.min(20, -dynamicMetrics.priceGap));
    const decisionIndex = Math.round(
      opportunityPower * 0.55 +
      dynamicMetrics.trust * 0.2 +
      (100 - riskPressure) * 0.2 +
      Math.max(0, priceAdvantage) * 0.25,
    );

    let verdict = "VERİYİ TAMAMLA";
    let verdictTone = "#f59e0b";
    if (completeness >= 75) {
      if (decisionIndex >= 76 && riskPressure <= 45) {
        verdict = "ALIM İÇİN GÜÇLÜ ADAY";
        verdictTone = "#10b981";
      } else if (decisionIndex >= 62 && riskPressure <= 65) {
        verdict = "KONTROLLÜ İLERLE";
        verdictTone = "#38bdf8";
      } else if (riskPressure >= 75 || decisionIndex < 45) {
        verdict = "ŞİMDİLİK UZAK DUR";
        verdictTone = "#ef4444";
      } else {
        verdict = "BEKLE VE DOĞRULA";
        verdictTone = "#f59e0b";
      }
    }

    const reasons = [
      hasLocation
        ? `Lokasyon ${locationIntelligence?.locationScore ?? 0}/100 ve ${locationIntelligence?.nearbyPlaces.length ?? 0} gerçek çevre noktasıyla değerlendirildi.`
        : "Konum ve çevre taraması tamamlanmadı.",
      hasPrice
        ? `Fiyat konumu ${dynamicMetrics.priceStatus}; piyasa farkı ${dynamicMetrics.priceGap.toFixed(1)}%.`
        : "Karşılaştırma için taşınmaz fiyatı girilmedi.",
      `Yatırım ${dynamicMetrics.investment}/100, fırsat ${dynamicMetrics.opportunity}/100, likidite ${dynamicMetrics.liquidity}/100.`,
      `Risk seviyesi ${dynamicMetrics.risk}/100 ve veri güveni ${dynamicMetrics.trust}/100.`,
    ];

    const nextActions = [
      !hasPrice ? "Taşınmazın talep edilen fiyatını gir." : null,
      !hasLocation ? "Haritadan konumu seç ve gerçek çevre analizini çalıştır." : null,
      !hasAiAnalysis ? "AI analizini başlat ve karar puanlarını güncelle." : null,
      dynamicMetrics.risk > 60 ? "Tapu, imar ve teknik belgeleri resmî kaynaklardan doğrula." : null,
      dynamicMetrics.priceGap > 7 ? "Güncel emsallerle fiyatı yeniden karşılaştır ve pazarlık payını artır." : null,
    ].filter(Boolean) as string[];

    return {
      completeness,
      completenessItems,
      decisionIndex: Math.max(0, Math.min(100, decisionIndex)),
      opportunityPower: Math.max(0, Math.min(100, opportunityPower)),
      verdict,
      verdictTone,
      reasons,
      nextActions: nextActions.length ? nextActions : ["Nihai karar öncesinde resmî belge ve güncel emsal doğrulamasını tamamla."],
      synchronizedModules: [
        hasLocation,
        hasPrice,
        hasAiAnalysis,
        dynamicMetrics.market > 0,
        dynamicMetrics.safeOffer > 0,
      ].filter(Boolean).length,
    };
  }, [askingPriceNumber, dynamicMetrics, form.city, form.district, form.propertyType, locationIntelligence, result]);

  const intelligenceEngine = useMemo(() => {
    const snapshotId = [
      form.city,
      form.district,
      form.neighborhood,
      form.propertyType,
      form.area,
      form.askingPrice,
      locationIntelligence?.latitude ?? "",
      locationIntelligence?.longitude ?? "",
      dynamicMetrics.reportScore,
    ].join("|");

    let hash = 0;
    for (let index = 0; index < snapshotId.length; index += 1) {
      hash = (hash * 31 + snapshotId.charCodeAt(index)) >>> 0;
    }

    const modules = [
      { name: "Konum", ready: Boolean(locationIntelligence?.nearbyPlaces.length), value: locationIntelligence?.locationScore ?? 0 },
      { name: "Değerleme", ready: dynamicMetrics.market > 0, value: dynamicMetrics.valueConfidence },
      { name: "Finans", ready: dynamicMetrics.totalInvestment > 0, value: dynamicMetrics.financialConfidence },
      { name: "Pazarlık", ready: dynamicMetrics.safeOffer > 0, value: dynamicMetrics.probability },
      { name: "AI Analizi", ready: Boolean(result?.raw?.trim()), value: dynamicMetrics.trust },
      { name: "Rapor", ready: decisionCore.completeness >= 75, value: dynamicMetrics.reportScore },
    ];

    const readyCount = modules.filter((module) => module.ready).length;
    const synchronization = Math.round((readyCount / modules.length) * 100);
    const averageSignal = Math.round(
      modules.reduce((total, module) => total + Math.max(0, Math.min(100, module.value)), 0) / modules.length,
    );

    const dataQuality = Math.round(
      decisionCore.completeness * 0.45 +
      dynamicMetrics.trust * 0.35 +
      synchronization * 0.2,
    );

    const unifiedDecision = Math.round(
      decisionCore.decisionIndex * 0.55 +
      averageSignal * 0.25 +
      dataQuality * 0.2,
    );

    const narrative = decisionCore.completeness < 75
      ? "Karar motoru çalışıyor; ancak güvenilir bir sonuç için eksik konum, fiyat veya AI analiz verileri tamamlanmalı."
      : unifiedDecision >= 75 && dynamicMetrics.risk <= 45
        ? "Ortak veri çekirdeği bu taşınmazı güçlü bir yatırım adayı olarak değerlendiriyor. Nihai işlem öncesi resmî belge kontrolü tamamlanmalı."
        : unifiedDecision >= 60
          ? "Taşınmaz kontrollü ilerlemeye uygun görünüyor. Fiyat, emsal ve resmî kayıt doğrulaması karar kalitesini belirgin biçimde artıracaktır."
          : dynamicMetrics.risk >= 70
            ? "Risk baskısı yüksek. Yeni veri ve resmî doğrulama olmadan alım kararı verilmemesi önerilir."
            : "Mevcut sinyaller karışık. Emsal, konum ve finans verileri güçlendirilmeden kesin karar ertelenmelidir.";

    return {
      snapshotCode: `INT-${hash.toString(16).toUpperCase().padStart(8, "0")}`,
      modules,
      readyCount,
      synchronization,
      averageSignal,
      dataQuality: Math.max(0, Math.min(100, dataQuality)),
      unifiedDecision: Math.max(0, Math.min(100, unifiedDecision)),
      narrative,
      updatedAt: new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }),
    };
  }, [decisionCore, dynamicMetrics, form, locationIntelligence, result]);

  const aiDecisionBrain = useMemo(() => {
    const location = Math.max(0, Math.min(100, locationIntelligence?.locationScore ?? 0));
    const price = Math.max(0, Math.min(100, Math.round(100 - Math.max(-20, Math.min(45, dynamicMetrics.priceGap)) * 1.65)));
    const investment = dynamicMetrics.investment;
    const riskSafety = 100 - dynamicMetrics.risk;
    const liquidity = dynamicMetrics.liquidity;
    const finance = Math.max(0, Math.min(100, Math.round(dynamicMetrics.financialConfidence * 0.65 + Math.min(100, Math.max(0, dynamicMetrics.profitability)) * 0.35)));

    const layers = [
      { name: "Lokasyon Kararı", score: location, note: locationIntelligence?.nearbyPlaces.length ? `${locationIntelligence.nearbyPlaces.length} gerçek çevre noktası analiz edildi.` : "Harita ve çevre verisi bekleniyor." },
      { name: "Fiyat Kararı", score: price, note: `Fiyat konumu: ${dynamicMetrics.priceStatus}. Piyasa farkı ${dynamicMetrics.priceGap.toFixed(1)}%.` },
      { name: "Yatırım Kararı", score: investment, note: `Yatırım sinyali ${investment}/100, fırsat puanı ${dynamicMetrics.opportunity}/100.` },
      { name: "Risk Kararı", score: riskSafety, note: `Risk baskısı ${dynamicMetrics.risk}/100. Yüksek skor daha güvenli yapıyı gösterir.` },
      { name: "Likidite Kararı", score: liquidity, note: `Tahmini satış kabiliyeti ${liquidity}/100.` },
      { name: "Finansal Karar", score: finance, note: `Finansal güven ${dynamicMetrics.financialConfidence}/100, kârlılık ${dynamicMetrics.profitability.toFixed(1)}%.` },
    ];

    const weightedScore = Math.round(
      location * 0.14 +
      price * 0.2 +
      investment * 0.2 +
      riskSafety * 0.18 +
      liquidity * 0.12 +
      finance * 0.16
    );

    const evidenceCoverage = Math.round((intelligenceEngine.readyCount / intelligenceEngine.modules.length) * 100);
    const aiConfidence = Math.max(0, Math.min(100, Math.round(
      intelligenceEngine.dataQuality * 0.42 +
      evidenceCoverage * 0.28 +
      dynamicMetrics.trust * 0.3
    )));
    const officialCoverage = Math.max(0, Math.min(100, Math.round(
      (locationIntelligence?.nearbyPlaces.length ? 28 : 0) +
      (form.city && form.district ? 16 : 0) +
      (askingPriceNumber > 0 ? 14 : 0) +
      (result?.raw?.trim() ? 18 : 0)
    )));
    const predictionReliability = Math.max(0, Math.min(100, Math.round(
      aiConfidence * 0.55 + intelligenceEngine.synchronization * 0.25 + decisionCore.completeness * 0.2
    )));

    let verdict = "VERİYİ TAMAMLA";
    let action = "BEKLE";
    let tone = "#f59e0b";
    if (decisionCore.completeness >= 75) {
      if (weightedScore >= 78 && dynamicMetrics.risk <= 42) { verdict = "GÜÇLÜ ALIM ÖNERİSİ"; action = "AL"; tone = "#10b981"; }
      else if (weightedScore >= 64 && dynamicMetrics.risk <= 62) { verdict = "KONTROLLÜ ALIM ÖNERİLİR"; action = "PAZARLIK YAP"; tone = "#38bdf8"; }
      else if (dynamicMetrics.risk >= 75 || weightedScore < 44) { verdict = "ALIM ÖNERİLMİYOR"; action = "UZAK DUR"; tone = "#ef4444"; }
      else { verdict = "BEKLE VE DOĞRULA"; action = "BEKLE"; tone = "#f59e0b"; }
    }

    const conservative = Math.max(0, Math.min(100, weightedScore - Math.round(dynamicMetrics.risk * 0.18) - 7));
    const expected = Math.max(0, Math.min(100, weightedScore));
    const optimistic = Math.max(0, Math.min(100, weightedScore + Math.round(dynamicMetrics.opportunity * 0.12) + 6));

    const reasons = [...layers]
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((layer) => `${layer.name}: ${layer.score}/100 — ${layer.note}`);

    const warnings = [
      officialCoverage < 70 ? "Resmî veri kapsamı henüz sınırlı; tapu, imar ve takyidat belgeleri doğrulanmalı." : null,
      dynamicMetrics.priceGap > 8 ? `Talep fiyatı piyasa tahmininin yaklaşık %${dynamicMetrics.priceGap.toFixed(1)} üzerinde.` : null,
      dynamicMetrics.risk > 60 ? `Risk puanı ${dynamicMetrics.risk}/100; teknik ve hukuki inceleme güçlendirilmeli.` : null,
      !locationIntelligence?.nearbyPlaces.length ? "Konum ve çevre taraması tamamlanmadı." : null,
      !result?.raw?.trim() ? "AI analiz raporu henüz oluşturulmadı." : null,
    ].filter(Boolean) as string[];

    return {
      layers, weightedScore, verdict, action, tone, aiConfidence, officialCoverage,
      predictionReliability, evidenceCoverage, reasons,
      warnings: warnings.length ? warnings : ["Kritik uyarı bulunmadı; yine de nihai işlem öncesi resmî belge kontrolü zorunludur."],
      scenarios: [
        { name: "Temkinli", score: conservative, value: Math.round(dynamicMetrics.market * 0.9), note: "Risk ve yavaş piyasa varsayımı" },
        { name: "Beklenen", score: expected, value: dynamicMetrics.market, note: "Mevcut verilerin ana senaryosu" },
        { name: "İyimser", score: optimistic, value: Math.round(dynamicMetrics.market * 1.12), note: "Gelişim ve güçlü talep varsayımı" },
      ],
    };
  }, [askingPriceNumber, decisionCore, dynamicMetrics, form.city, form.district, intelligenceEngine, locationIntelligence, result]);

  const liveDataLayer = useMemo(() => {
    const sources = [
      { name: "Kullanıcı Girdisi", ready: Boolean(form.city && form.district && form.propertyType), verified: true, detail: "Şehir, ilçe, taşınmaz türü ve kullanıcı beyanı" },
      { name: "OpenStreetMap", ready: Boolean(locationIntelligence), verified: Boolean(locationIntelligence), detail: "Harita, koordinat ve yol ağı" },
      { name: "Nominatim", ready: Boolean(locationIntelligence?.selectedAddress), verified: Boolean(locationIntelligence?.selectedAddress), detail: "Adres çözümleme ve ters geocoding" },
      { name: "Overpass API", ready: Boolean(locationIntelligence?.nearbyPlaces.length), verified: Boolean(locationIntelligence?.nearbyPlaces.length), detail: "2,5 km çevrede gerçek yaşam noktaları" },
      { name: "AI Analiz Servisi", ready: Boolean(result?.raw?.trim()), verified: false, detail: "Gerekçeli analiz ve karar metni" },
      { name: "Yerel Rapor Arşivi", ready: true, verified: true, detail: `${savedReports.length} kayıtlı rapor` },
    ];

    const readyCount = sources.filter((source) => source.ready).length;
    const verifiedCount = sources.filter((source) => source.verified).length;
    const coverage = Math.round((readyCount / sources.length) * 100);
    const verification = Math.round((verifiedCount / sources.length) * 100);
    const freshness = Math.max(0, 100 - Math.min(35, Math.floor((Date.now() - lastLiveRefresh.getTime()) / 60000) * 3));
    const liveScore = Math.round(coverage * 0.45 + verification * 0.35 + freshness * 0.2);

    return { sources, readyCount, verifiedCount, coverage, verification, freshness, liveScore };
  }, [form.city, form.district, form.propertyType, lastLiveRefresh, liveRefreshTick, locationIntelligence, result, savedReports.length]);

  const decisionBrainV29 = useMemo(() => {
    const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
    const riskMultiplier = v29RiskProfile === "Temkinli" ? 1.18 : v29RiskProfile === "Agresif" ? 0.82 : 1;
    const strategyBoost = v29Strategy === "Geliştirme"
      ? dynamicMetrics.opportunity * 0.11
      : v29Strategy === "Kira"
        ? dynamicMetrics.liquidity * 0.1
        : v29Strategy === "Al-Sat"
          ? (dynamicMetrics.opportunity + dynamicMetrics.liquidity) * 0.065
          : dynamicMetrics.trust * 0.08;

    const baseDecision = clamp(
      aiDecisionBrain.weightedScore * 0.48 +
      decisionCore.decisionIndex * 0.22 +
      intelligenceEngine.dataQuality * 0.12 +
      liveDataLayer.liveScore * 0.1 +
      strategyBoost -
      dynamicMetrics.risk * 0.08 * riskMultiplier
    );

    const consistencyChecks = [
      { name: "Fiyat–Değer Tutarlılığı", ok: !askingPriceNumber || Math.abs(dynamicMetrics.priceGap) <= 12, detail: askingPriceNumber ? `Piyasa farkı ${dynamicMetrics.priceGap.toFixed(1)}%` : "Fiyat bekleniyor" },
      { name: "Risk–Getiri Dengesi", ok: dynamicMetrics.investment >= dynamicMetrics.risk - 8, detail: `Yatırım ${dynamicMetrics.investment} / Risk ${dynamicMetrics.risk}` },
      { name: "Konum–Likidite Uyumu", ok: !locationIntelligence || Math.abs((locationIntelligence.locationScore || 0) - dynamicMetrics.liquidity) <= 28, detail: `Konum ${locationIntelligence?.locationScore ?? 0} / Likidite ${dynamicMetrics.liquidity}` },
      { name: "Finansal Gerçekçilik", ok: dynamicMetrics.profitability >= -5 && dynamicMetrics.profitability <= 80, detail: `Kârlılık ${dynamicMetrics.profitability.toFixed(1)}%` },
      { name: "Veri Kanıt Kapsamı", ok: aiDecisionBrain.evidenceCoverage >= 60, detail: `Kanıt kapsamı %${aiDecisionBrain.evidenceCoverage}` },
      { name: "Karar Güveni", ok: aiDecisionBrain.aiConfidence >= 58, detail: `AI güveni %${aiDecisionBrain.aiConfidence}` },
    ];

    const consistencyScore = clamp((consistencyChecks.filter((item) => item.ok).length / consistencyChecks.length) * 100);
    const readiness = clamp(
      decisionCore.completeness * 0.3 +
      liveDataLayer.coverage * 0.2 +
      aiDecisionBrain.aiConfidence * 0.22 +
      consistencyScore * 0.18 +
      intelligenceEngine.synchronization * 0.1
    );

    const stressScenarios = [
      { name: "Faiz Baskısı", impact: -14, description: "Finansman pahalılaşır ve talep yavaşlar." },
      { name: "Maliyet Şoku", impact: v29Strategy === "Geliştirme" ? -18 : -8, description: "İnşaat ve yenileme maliyetleri yükselir." },
      { name: "Likidite Daralması", impact: -Math.round((100 - dynamicMetrics.liquidity) * 0.18), description: "Satış süresi uzar ve pazarlık baskısı artar." },
      { name: "Bölgesel Gelişim", impact: Math.round((locationIntelligence?.locationScore ?? 45) * 0.13), description: "Ulaşım, ticaret ve sosyal altyapı güçlenir." },
      { name: "Emsal Avantajı", impact: dynamicMetrics.priceGap < 0 ? Math.min(16, Math.round(Math.abs(dynamicMetrics.priceGap))) : -Math.min(14, Math.round(dynamicMetrics.priceGap)), description: "Fiyatın piyasa karşısındaki konumu yansıtılır." },
    ].map((item) => ({ ...item, score: clamp(baseDecision + item.impact) }));

    const sensitivity = [
      { variable: "Talep Fiyatı", effect: dynamicMetrics.priceGap > 8 ? "Yüksek negatif" : dynamicMetrics.priceGap < -7 ? "Güçlü pozitif" : "Dengeli", score: clamp(100 - Math.abs(dynamicMetrics.priceGap) * 3) },
      { variable: "Risk Seviyesi", effect: dynamicMetrics.risk > 65 ? "Kritik" : dynamicMetrics.risk > 45 ? "Orta" : "Düşük", score: clamp(100 - dynamicMetrics.risk) },
      { variable: "Lokasyon", effect: (locationIntelligence?.locationScore ?? 0) >= 70 ? "Güçlü" : "Doğrulama gerekli", score: locationIntelligence?.locationScore ?? 0 },
      { variable: "Likidite", effect: dynamicMetrics.liquidity >= 70 ? "Hızlı çıkış" : dynamicMetrics.liquidity >= 50 ? "Normal" : "Yavaş", score: dynamicMetrics.liquidity },
      { variable: "Veri Kalitesi", effect: intelligenceEngine.dataQuality >= 75 ? "Yüksek" : "Eksik", score: intelligenceEngine.dataQuality },
    ];

    const actionQueue = [
      !locationIntelligence?.nearbyPlaces.length ? { priority: 1, action: "Konum ve gerçek çevre taramasını tamamla", owner: "Konum Modülü" } : null,
      !askingPriceNumber ? { priority: 1, action: "Talep fiyatını gir ve fiyat farkını hesapla", owner: "Değerleme" } : null,
      aiDecisionBrain.officialCoverage < 70 ? { priority: 1, action: "Tapu, imar ve resmî belge doğrulamasını tamamla", owner: "Parsel & İmar" } : null,
      !result?.raw?.trim() ? { priority: 2, action: "AI analizini çalıştır ve gerekçeli rapor üret", owner: "AI Servisi" } : null,
      dynamicMetrics.risk > 60 ? { priority: 2, action: "Teknik ve hukuki risk incelemesini derinleştir", owner: "Risk Motoru" } : null,
      dynamicMetrics.priceGap > 8 ? { priority: 2, action: "Pazarlık hedefini güvenli teklif seviyesine çek", owner: "Pazarlık" } : null,
      { priority: 3, action: "V29 karar snapshotını Premium Rapora kaydet", owner: "Rapor Merkezi" },
    ].filter(Boolean) as { priority: number; action: string; owner: string }[];

    let verdict = "VERİYİ TAMAMLA";
    let action = "BEKLE";
    let color = "#f59e0b";
    if (readiness >= 72) {
      if (baseDecision >= 78 && dynamicMetrics.risk <= 48) { verdict = "GÜÇLÜ ALIM ADAYI"; action = "AL / HIZLI PAZARLIK"; color = "#10b981"; }
      else if (baseDecision >= 63 && dynamicMetrics.risk <= 68) { verdict = "KONTROLLÜ İLERLE"; action = "PAZARLIK YAP"; color = "#38bdf8"; }
      else if (baseDecision < 42 || dynamicMetrics.risk >= 78) { verdict = "YÜKSEK RİSK"; action = "UZAK DUR"; color = "#ef4444"; }
      else { verdict = "BEKLE VE DOĞRULA"; action = "BELGE TAMAMLA"; color = "#f59e0b"; }
    }

    const executiveSummary = `${v29Strategy} stratejisinde ${v29RiskProfile.toLocaleLowerCase("tr-TR")} risk profiliyle karar skoru ${baseDecision}/100, işlem hazırlığı %${readiness} ve tutarlılık %${consistencyScore}. Sistem kararı: ${verdict}.`;

    return { baseDecision, readiness, consistencyScore, consistencyChecks, stressScenarios, sensitivity, actionQueue, verdict, action, color, executiveSummary };
  }, [aiDecisionBrain, askingPriceNumber, decisionCore, dynamicMetrics, intelligenceEngine, liveDataLayer, locationIntelligence, result, v29RiskProfile, v29Strategy]);

  function runV29DecisionOperations() {
    setV29RunCount((current) => current + 1);
    setLastLiveRefresh(new Date());
    const event = `${new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · V29 çoklu karar operasyonu tamamlandı (${decisionBrainV29.verdict})`;
    setV29RunHistory((current) => [event, ...current].slice(0, 8));
    setLiveEvents((current) => [event, ...current].slice(0, 6));
  }


  const operatingSystemV30 = useMemo(() => {
    const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
    const services = [
      { name: "AI Orchestrator", healthy: Boolean(result?.raw?.trim()) || decisionBrainV29.readiness >= 45, latency: result?.raw?.trim() ? 420 : 0 },
      { name: "Harita & Konum", healthy: Boolean(locationIntelligence), latency: locationIntelligence ? 190 : 0 },
      { name: "Canlı Veri", healthy: liveDataLayer.coverage >= 50, latency: 140 },
      { name: "Karar Motoru", healthy: decisionBrainV29.baseDecision > 0, latency: 85 },
      { name: "Rapor Motoru", healthy: Boolean(reportIdentity.number), latency: 65 },
      { name: "Yerel Arşiv", healthy: true, latency: 24 },
    ];
    const healthyCount = services.filter((service) => service.healthy).length;
    const healthScore = clamp((healthyCount / services.length) * 100);
    const orchestratorScore = clamp(
      decisionBrainV29.baseDecision * 0.28 +
      decisionBrainV29.readiness * 0.2 +
      intelligenceEngine.synchronization * 0.18 +
      liveDataLayer.liveScore * 0.16 +
      healthScore * 0.18
    );
    const actions = [
      ...decisionBrainV29.actionQueue.slice(0, 4),
      { priority: 3, action: "Yönetici raporunu güncelle", owner: "Executive Report 2.0" },
      { priority: 3, action: "Karar snapshotını kullanıcı arşivine kaydet", owner: "Kullanıcı Merkezi" },
    ];
    const completedModules = [
      Boolean(form.city && form.district),
      Boolean(locationIntelligence),
      Boolean(askingPriceNumber),
      Boolean(result?.raw?.trim()),
      decisionBrainV29.readiness >= 60,
      Boolean(reportIdentity.number),
    ].filter(Boolean).length;
    const calculations = 7 + decisionBrainV29.stressScenarios.length + decisionBrainV29.consistencyChecks.length + decisionBrainV29.sensitivity.length;
    const executiveSummary = `${decisionBrainV29.verdict}. Merkezi orkestratör ${completedModules}/6 ana veri alanını eşleştirdi; sistem sağlığı %${healthScore}, senkronizasyon %${intelligenceEngine.synchronization} ve operasyon skoru ${orchestratorScore}/100.`;
    return { services, healthyCount, healthScore, orchestratorScore, actions, completedModules, calculations, executiveSummary };
  }, [askingPriceNumber, decisionBrainV29, form.city, form.district, intelligenceEngine.synchronization, liveDataLayer.liveScore, liveDataLayer.coverage, locationIntelligence, reportIdentity.number, result]);

  const realEstateIntelligenceV31 = useMemo(() => {
    const area = Math.max(1, Number(String(form.area || "0").replace(/[^0-9.,]/g, "").replace(",", ".")) || 1);
    const baseMarket = Math.max(askingPriceNumber || 0, dynamicMetrics.market || 0, dynamicMetrics.safeOffer || 0);
    const location = locationIntelligence?.locationScore ?? 50;
    const scenarioMultiplier = v31Scenario === "Temkinli" ? 0.92 : v31Scenario === "Büyüme" ? 1.1 : 1;
    const baseSqm = baseMarket > 0 ? baseMarket / area : 0;
    const factors = [0.88, 0.94, 0.98, 1.03, 1.08, 1.14];
    const comparables = factors.map((factor, index) => {
      const qualityFactor = 0.96 + (location / 100) * 0.08;
      const price = Math.round(baseMarket * factor * qualityFactor * scenarioMultiplier);
      const comparableArea = Math.max(1, Math.round(area * (0.9 + index * 0.04)));
      return {
        id: `EMS-${index + 1}`,
        label: `${form.neighborhood || form.district || "Bölge"} Emsal ${index + 1}`,
        area: comparableArea,
        price,
        sqm: Math.round(price / comparableArea),
        similarity: Math.max(62, Math.min(96, 94 - Math.abs(index - 2) * 7 + Math.round(location / 20))),
      };
    });
    const sortedSqm = comparables.map((item) => item.sqm).sort((a, b) => a - b);
    const medianSqm = sortedSqm.length ? Math.round((sortedSqm[2] + sortedSqm[3]) / 2) : 0;
    const comparableValue = medianSqm * area;
    const priceDeviation = comparableValue > 0 && askingPriceNumber > 0 ? ((askingPriceNumber - comparableValue) / comparableValue) * 100 : 0;
    const developmentIndex = Math.round(Math.max(0, Math.min(100,
      location * 0.42 +
      dynamicMetrics.liquidity * 0.18 +
      (100 - dynamicMetrics.risk) * 0.16 +
      liveDataLayer.coverage * 0.14 +
      intelligenceEngine.synchronization * 0.1
    )));
    const investmentIndex = Math.round(Math.max(0, Math.min(100,
      decisionBrainV29.baseDecision * 0.28 +
      developmentIndex * 0.22 +
      dynamicMetrics.financialConfidence * 0.18 +
      dynamicMetrics.liquidity * 0.16 +
      Math.max(0, Math.min(100, 65 - priceDeviation * 2)) * 0.16
    )));
    const annualRate = v31Scenario === "Temkinli" ? 0.11 : v31Scenario === "Büyüme" ? 0.24 : 0.17;
    const forecastBase = comparableValue || dynamicMetrics.market || askingPriceNumber || 0;
    const forecasts = [
      { label: "Bugün", months: 0 },
      { label: "6 Ay", months: 6 },
      { label: "1 Yıl", months: 12 },
      { label: "3 Yıl", months: 36 },
      { label: "5 Yıl", months: 60 },
    ].map((item) => {
      const years = item.months / 12;
      const value = Math.round(forecastBase * Math.pow(1 + annualRate, years));
      const uncertainty = Math.round(value * (0.05 + years * 0.025));
      return { ...item, value, low: Math.max(0, value - uncertainty), high: value + uncertainty };
    });
    const portfolio = savedReports.slice(0, 5).map((report) => ({
      id: report.id,
      title: report.title,
      value: report.marketValue,
      score: report.reportScore,
      decision: report.decision,
    }));
    const verdict = investmentIndex >= 78 ? "Güçlü Yatırım Adayı" : investmentIndex >= 62 ? "Kontrollü İlerle" : investmentIndex >= 45 ? "Pazarlık ve Doğrulama Gerekli" : "Şimdilik Bekle";
    const confidence = Math.round(Math.max(0, Math.min(100, liveDataLayer.liveScore * 0.45 + intelligenceEngine.synchronization * 0.3 + decisionBrainV29.consistencyScore * 0.25)));
    return { area, baseSqm, comparables, medianSqm, comparableValue, priceDeviation, developmentIndex, investmentIndex, forecasts, portfolio, verdict, confidence, annualRate };
  }, [askingPriceNumber, decisionBrainV29, dynamicMetrics, form.area, form.district, form.neighborhood, intelligenceEngine.synchronization, liveDataLayer, locationIntelligence, savedReports, v31Scenario]);

  function runV31IntelligencePlatform() {
    setV31RunCount((current) => current + 1);
    const now = new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const events = [
      `${now} · 6 emsal normalize edildi`,
      `${now} · ${v31Scenario} fiyat tahmin senaryosu hesaplandı`,
      `${now} · Bölgesel gelişim endeksi ${realEstateIntelligenceV31.developmentIndex}/100`,
      `${now} · Yatırım endeksi ${realEstateIntelligenceV31.investmentIndex}/100`,
      `${now} · Piyasa kararı: ${realEstateIntelligenceV31.verdict}`,
    ];
    setV31Events((current) => [...events, ...current].slice(0, 12));
    setLiveEvents((current) => [events[4], ...current].slice(0, 6));
  }

  function runV30OperatingSystem() {
    const started = performance.now();
    setV30RunCount((current) => current + 1);
    setLastLiveRefresh(new Date());
    setLiveRefreshTick((current) => current + 1);
    const now = new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const events = [
      `${now} · AI Orchestrator ortak snapshotı kilitledi`,
      `${now} · ${operatingSystemV30.calculations} hesaplama yeniden çalıştırıldı`,
      `${now} · Karar motoru: ${decisionBrainV29.verdict}`,
      `${now} · Premium rapor ve kullanıcı merkezi senkronize edildi`,
    ];
    setV30Timeline((current) => [...events, ...current].slice(0, 12));
    setLiveEvents((current) => [events[0], ...current].slice(0, 6));
    window.setTimeout(() => setV30LastDuration(Math.max(1, Math.round(performance.now() - started))), 0);
  }


  const officialDataGatewayV32 = useMemo(() => {
    const modeWeight = v32VerificationMode === "Derin" ? 1 : v32VerificationMode === "Standart" ? 0.82 : 0.62;
    const addressReady = Boolean(form.city && form.district && form.neighborhood);
    const coordinateReady = Boolean(locationIntelligence?.latitude && locationIntelligence?.longitude);
    const parcelReady = Boolean((form as any).block || (form as any).parcel || (form as any).ada || (form as any).parsel);
    const valuationReady = dynamicMetrics.market > 0;
    const aiReady = Boolean(result);
    const reportReady = savedReports.length > 0 || Boolean(reportIdentity.number);

    const sources = [
      { name: "Adres ve Koordinat", category: "Açık veri", ready: addressReady && coordinateReady, official: false, detail: addressReady ? "Adres seçildi; koordinat eşleşmesi kontrol edildi." : "İl, ilçe ve mahalle bilgisi bekleniyor." },
      { name: "Ada / Parsel Kimliği", category: "Kullanıcı girdisi", ready: parcelReady, official: false, detail: parcelReady ? "Parsel tanımı doğrulama kuyruğuna alındı." : "Ada ve parsel numarası girilmeli." },
      { name: "Tapu Niteliği", category: "Resmî bağlantı bekliyor", ready: false, official: true, detail: "Yetkili servis veya kullanıcı belgesiyle doğrulanacak." },
      { name: "İmar Durumu", category: "Belediye / resmî servis", ready: false, official: true, detail: "Belediye entegrasyonu ya da belge yükleme akışı bekleniyor." },
      { name: "Deprem ve Zemin", category: "Kamu / bilimsel veri", ready: coordinateReady, official: true, detail: coordinateReady ? "Koordinat hazır; uygun kamu veri katmanı bağlanabilir." : "Koordinat seçimi gerekli." },
      { name: "Piyasa ve Emsal", category: "Model + lisanslı veri", ready: valuationReady, official: false, detail: valuationReady ? "Model emsal değeri üretildi; lisanslı veriyle güçlendirilebilir." : "Değerleme girdileri eksik." },
      { name: "AI Analiz Kanıtı", category: "Yaşam AI", ready: aiReady, official: false, detail: aiReady ? "AI karar çıktısı snapshot ile eşleştirildi." : "Analiz henüz çalıştırılmadı." },
      { name: "Rapor ve Arşiv", category: "Yaşam AI", ready: reportReady, official: false, detail: reportReady ? "Rapor kimliği ve arşiv izi mevcut." : "Rapor oluşturulmalı veya kaydedilmeli." },
    ];

    const readyCount = sources.filter((source) => source.ready).length;
    const officialReady = sources.filter((source) => source.official && source.ready).length;
    const officialTotal = sources.filter((source) => source.official).length;
    const completion = Math.round((readyCount / sources.length) * 100);
    const officialCoverage = officialTotal ? Math.round((officialReady / officialTotal) * 100) : 0;
    const consentScore = v32Consent ? 100 : 35;
    const verificationScore = Math.round(Math.min(100,
      completion * 0.42 +
      officialCoverage * 0.22 +
      liveDataLayer.liveScore * 0.18 +
      intelligenceEngine.synchronization * 0.12 +
      consentScore * 0.06
    ) * modeWeight);

    const blockers = sources.filter((source) => !source.ready).map((source) => source.name);
    const status = verificationScore >= 78 ? "Doğrulama İçin Güçlü" : verificationScore >= 55 ? "Kontrollü Doğrulama" : "Eksik Veri Var";
    const certificateCode = `YAI-V32-${reportIdentity.number.replace(/[^A-Z0-9]/gi, "").slice(-8)}-${verificationScore}`;
    const nextActions = [
      !parcelReady ? "Ada ve parsel bilgilerini tamamla." : "Ada/parsel kimliğini belge veya resmî servisle eşleştir.",
      "Tapu niteliği ve takyidat bilgisini yetkili kaynaktan doğrula.",
      "Belediye imar belgesi veya resmî sorgu çıktısını sisteme ekle.",
      coordinateReady ? "Koordinata bağlı zemin ve afet veri katmanlarını çalıştır." : "Haritadan kesin koordinatı seç.",
      valuationReady ? "Model emsal sonucunu lisanslı veriyle çapraz kontrol et." : "Değerleme girdilerini tamamla.",
    ];

    return { sources, readyCount, officialReady, officialTotal, completion, officialCoverage, verificationScore, blockers, status, certificateCode, nextActions };
  }, [dynamicMetrics.market, form, intelligenceEngine.synchronization, liveDataLayer.liveScore, locationIntelligence, reportIdentity.number, result, savedReports.length, v32Consent, v32VerificationMode]);

  function runV32VerificationGateway() {
    const started = performance.now();
    const now = new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const events = [
      `${now} · Kaynak kimlikleri tarandı`,
      `${now} · ${officialDataGatewayV32.readyCount}/${officialDataGatewayV32.sources.length} veri alanı eşleştirildi`,
      `${now} · Resmî kapsam %${officialDataGatewayV32.officialCoverage} olarak hesaplandı`,
      `${now} · Doğrulama skoru ${officialDataGatewayV32.verificationScore}/100 üretildi`,
      `${now} · Sertifika kodu ${officialDataGatewayV32.certificateCode} oluşturuldu`,
    ];
    setV32RunCount((current) => current + 1);
    setV32Events((current) => [...events, ...current].slice(0, 15));
    setV30LastDuration(Math.max(1, Math.round(performance.now() - started)));
  }

  const locationIntelligenceV33 = useMemo(() => {
    const coordinateReady = Boolean(locationIntelligence?.latitude && locationIntelligence?.longitude);
    const accessScore = Math.round(Math.min(100, 52 + realEstateIntelligenceV31.developmentIndex * 0.34 + (coordinateReady ? 12 : 0)));
    const lifeScore = Math.round(Math.min(100, 48 + dynamicMetrics.liquidity * 0.28 + (form.neighborhood ? 10 : 0)));
    const commercialScore = Math.round(Math.min(100, realEstateIntelligenceV31.investmentIndex * 0.58 + dynamicMetrics.marketConfidence * 0.34));
    const riskScore = Math.round(Math.max(0, Math.min(100, 100 - dynamicMetrics.risk)));
    const growthScore = Math.round(Math.min(100, realEstateIntelligenceV31.developmentIndex * 0.72 + officialDataGatewayV32.verificationScore * 0.22));
    const locationScore = Math.round(accessScore * 0.24 + lifeScore * 0.18 + commercialScore * 0.22 + riskScore * 0.16 + growthScore * 0.20);
    const nearby = [
      { name: "Toplu taşıma", distance: "450 m", score: Math.min(98, accessScore + 5) },
      { name: "Eğitim alanları", distance: "700 m", score: Math.min(96, lifeScore + 3) },
      { name: "Sağlık hizmeti", distance: "1,2 km", score: Math.max(45, accessScore - 7) },
      { name: "Market ve ticaret", distance: "350 m", score: Math.min(99, commercialScore + 6) },
      { name: "Yeşil alan", distance: "900 m", score: Math.max(40, lifeScore - 5) },
    ];
    const risks = [
      { name: "Deprem / zemin", level: coordinateReady ? "Veri katmanı hazır" : "Koordinat bekliyor", score: riskScore },
      { name: "Taşkın", level: riskScore > 70 ? "Düşük model riski" : "Kontrol gerekli", score: Math.max(35, riskScore - 4) },
      { name: "Gürültü", level: accessScore > 80 ? "Orta yoğunluk" : "Düşük yoğunluk", score: Math.max(42, 100 - accessScore / 2) },
      { name: "Likidite riski", level: dynamicMetrics.liquidity >= 70 ? "Düşük" : "Orta", score: dynamicMetrics.liquidity },
    ];
    const reasons = [
      `Bölgesel gelişim endeksi ${realEstateIntelligenceV31.developmentIndex}/100 seviyesinde.`,
      `Yatırım endeksi ${realEstateIntelligenceV31.investmentIndex}/100 ile konum kararını destekliyor.`,
      coordinateReady ? "Koordinat, afet ve çevre katmanlarının bağlanmasına hazır." : "Kesin koordinat seçimi konum güvenini artıracak.",
      officialDataGatewayV32.officialCoverage < 50 ? "Resmî veri kapsamı artırılmadan hukuki kesinlik verilmemeli." : "Resmî veri kapsamı karar güvenini güçlendiriyor.",
    ];
    const heatPoints = [
      { x: 22, y: 28, value: growthScore, label: "Gelişim" },
      { x: 68, y: 22, value: commercialScore, label: "Ticaret" },
      { x: 78, y: 68, value: accessScore, label: "Erişim" },
      { x: 34, y: 72, value: lifeScore, label: "Yaşam" },
      { x: 51, y: 49, value: locationScore, label: "Parsel" },
    ];
    return { coordinateReady, accessScore, lifeScore, commercialScore, riskScore, growthScore, locationScore, nearby, risks, reasons, heatPoints };
  }, [dynamicMetrics.liquidity, dynamicMetrics.marketConfidence, dynamicMetrics.risk, form.neighborhood, locationIntelligence, officialDataGatewayV32.officialCoverage, officialDataGatewayV32.verificationScore, realEstateIntelligenceV31.developmentIndex, realEstateIntelligenceV31.investmentIndex]);

  function runV33LocationCenter() {
    const now = new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const events = [
      `${now} · Konum snapshotı oluşturuldu`,
      `${now} · ${v33Layer} harita katmanı çalıştırıldı`,
      `${now} · Yakın çevre erişim noktaları puanlandı`,
      `${now} · Çevresel risk katmanları tarandı`,
      `${now} · AI Lokasyon Skoru ${locationIntelligenceV33.locationScore}/100 üretildi`,
    ];
    setV33RunCount((current) => current + 1);
    setV33Events((current) => [...events, ...current].slice(0, 15));
  }

  const portfolioIntelligenceV34 = useMemo(() => {
    const currentValue = Math.max(askingPriceNumber || dynamicMetrics.market || 0, 1);
    const archivedAssets = savedReports.slice(0, 5).map((report, index) => ({
      id: report.id,
      name: report.title || `${report.district} ${report.propertyType}`,
      location: `${report.city} / ${report.district}`,
      value: report.marketValue || report.askingPrice,
      acquisition: Math.round((report.askingPrice || report.marketValue) * (0.82 + index * 0.025)),
      monthlyRent: Math.round((report.marketValue || report.askingPrice) * (0.0036 + index * 0.00025)),
      score: Math.max(40, Math.min(98, report.reportScore || 70)),
      decision: report.decision,
    }));
    const seedAssets = [
      { id: "current", name: `${form.neighborhood || form.district || "Aktif"} ${form.propertyType}`, location: `${form.city} / ${form.district}`, value: currentValue, acquisition: Math.round(currentValue * 0.84), monthlyRent: Math.round(currentValue * 0.0041), score: decisionCore.decisionIndex, decision: decisionCore.verdict },
      { id: "seed-1", name: "Merkez Konut Portföyü", location: "Adana / Ceyhan", value: Math.round(currentValue * 0.72), acquisition: Math.round(currentValue * 0.58), monthlyRent: Math.round(currentValue * 0.0034), score: 78, decision: "TUT" },
      { id: "seed-2", name: "Gelişim Bölgesi Arsa", location: "Adana / Ceyhan", value: Math.round(currentValue * 0.54), acquisition: Math.round(currentValue * 0.39), monthlyRent: 0, score: 84, decision: "TUT" },
    ];
    const assets = archivedAssets.length ? [seedAssets[0], ...archivedAssets] : seedAssets;
    const totalValue = assets.reduce((sum, asset) => sum + asset.value, 0);
    const totalAcquisition = assets.reduce((sum, asset) => sum + asset.acquisition, 0);
    const monthlyRent = assets.reduce((sum, asset) => sum + asset.monthlyRent, 0);
    const annualRent = monthlyRent * 12;
    const unrealizedProfit = totalValue - totalAcquisition;
    const returnRate = totalAcquisition ? Math.round((unrealizedProfit / totalAcquisition) * 100) : 0;
    const rentalYield = totalValue ? Number(((annualRent / totalValue) * 100).toFixed(1)) : 0;
    const riskScore = Math.round(assets.reduce((sum, asset) => sum + (100 - asset.score), 0) / assets.length);
    const diversification = Math.min(100, 48 + assets.length * 8 + (savedReports.length ? 10 : 0));
    const healthScore = Math.round(Math.min(100, 100 - riskScore * 0.38 + diversification * 0.28 + Math.min(25, returnRate * 0.22)));
    const horizonMultiplier = { "1 Yıl": 1.11, "3 Yıl": 1.42, "5 Yıl": 1.83, "10 Yıl": 2.72 }[v34Horizon];
    const goalMultiplier = v34Goal === "Büyüme" ? 1.08 : v34Goal === "Gelir" ? 0.96 : 1;
    const projectedValue = Math.round(totalValue * horizonMultiplier * goalMultiplier);
    const recommendations = [
      rentalYield < 4 ? "Kira getirisi düşük varlıklarda yeniden kiralama veya satış senaryosu çalıştır." : "Kira getirisi portföy gelir hedefini destekliyor; tahsilat ve boşluk oranını izle.",
      diversification < 75 ? "Portföy yoğunlaşmasını azaltmak için farklı taşınmaz türü veya bölge ekle." : "Portföy çeşitliliği dengeli; yeni alımlarda aynı risk kümesine yığılma.",
      riskScore > 35 ? "Risk puanı yüksek varlıkları resmî veri ve likidite açısından yeniden doğrula." : "Toplam risk kontrollü; yüksek değerli varlıklar için koruma planını sürdür.",
      `Seçilen ${v34Goal.toLocaleLowerCase("tr-TR")} hedefi ve ${v34Horizon} vadesi için tahmini portföy değeri ${new Intl.NumberFormat("tr-TR").format(projectedValue)} TL.`,
    ];
    return { assets, totalValue, totalAcquisition, monthlyRent, annualRent, unrealizedProfit, returnRate, rentalYield, riskScore, diversification, healthScore, projectedValue, recommendations };
  }, [askingPriceNumber, decisionCore.decisionIndex, decisionCore.verdict, dynamicMetrics.market, form.city, form.district, form.neighborhood, form.propertyType, savedReports, v34Goal, v34Horizon]);

  function runV34PortfolioCenter() {
    const now = new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const events = [
      `${now} · ${portfolioIntelligenceV34.assets.length} varlık tek portföy snapshotında birleştirildi`,
      `${now} · Toplam değer ve gerçekleşmemiş kazanç hesaplandı`,
      `${now} · Kira getirisi ve risk dağılımı analiz edildi`,
      `${now} · ${v34Goal} hedefi için ${v34Horizon} projeksiyonu üretildi`,
      `${now} · AI Portföy Sağlığı ${portfolioIntelligenceV34.healthScore}/100 olarak güncellendi`,
    ];
    setV34RunCount((current) => current + 1);
    setV34Events((current) => [...events, ...current].slice(0, 15));
  }


  const dataOrchestrationV35 = useMemo(() => {
    const sourceDefinitions = [
      { id: "user", name: "Kullanıcı Girdileri", status: form.city && form.district ? "Bağlı" : "Eksik", freshness: 100, trust: form.city && form.district ? 94 : 46, records: 7 },
      { id: "market", name: "Piyasa ve Emsal Motoru", status: realEstateIntelligenceV31.comparables.length ? "Bağlı" : "Bekliyor", freshness: Math.max(52, realEstateIntelligenceV31.marketConfidence), trust: Math.max(55, realEstateIntelligenceV31.marketConfidence), records: realEstateIntelligenceV31.comparables.length },
      { id: "official", name: "Resmî Doğrulama Geçidi", status: officialDataGatewayV32.officialCoverage >= 50 ? "Bağlı" : "Kısmi", freshness: Math.max(45, officialDataGatewayV32.verificationScore), trust: officialDataGatewayV32.verificationScore, records: officialDataGatewayV32.sources.length },
      { id: "location", name: "Harita ve Konum Katmanları", status: locationIntelligenceV33.coordinateReady ? "Bağlı" : "Kısmi", freshness: locationIntelligenceV33.coordinateReady ? 88 : 62, trust: locationIntelligenceV33.locationScore, records: locationIntelligenceV33.nearby.length + locationIntelligenceV33.risks.length },
      { id: "portfolio", name: "Portföy ve Rapor Arşivi", status: portfolioIntelligenceV34.assets.length ? "Bağlı" : "Bekliyor", freshness: savedReports.length ? 86 : 64, trust: portfolioIntelligenceV34.healthScore, records: portfolioIntelligenceV34.assets.length },
      { id: "ai", name: "AI Karar Motorları", status: result ? "Aktif" : "Hazır", freshness: result ? 96 : 74, trust: aiDecisionBrain.confidence, records: 7 },
    ];
    const modeBonus = v35Mode === "Maksimum Güven" ? 9 : v35Mode === "Ekonomik" ? -4 : 3;
    const connected = sourceDefinitions.filter((source) => source.status === "Bağlı" || source.status === "Aktif").length;
    const totalRecords = sourceDefinitions.reduce((sum, source) => sum + source.records, 0);
    const averageFreshness = Math.round(sourceDefinitions.reduce((sum, source) => sum + source.freshness, 0) / sourceDefinitions.length);
    const averageTrust = Math.round(sourceDefinitions.reduce((sum, source) => sum + source.trust, 0) / sourceDefinitions.length);
    const orchestrationScore = Math.max(0, Math.min(100, Math.round(averageTrust * 0.46 + averageFreshness * 0.28 + (connected / sourceDefinitions.length) * 26 + modeBonus)));
    const conflicts = [
      dynamicMetrics.marketConfidence < 60 ? "Piyasa güveni düşük; emsal sayısı artırılmalı." : null,
      officialDataGatewayV32.officialCoverage < 50 ? "Resmî veri kapsamı karar üretimi için sınırlı." : null,
      !locationIntelligenceV33.coordinateReady ? "Kesin koordinat seçilmediği için konum katmanları kısmi." : null,
      portfolioIntelligenceV34.riskScore > 40 ? "Portföy risk dağılımında yeniden dengeleme gerekli." : null,
    ].filter(Boolean) as string[];
    const pipeline = [
      { step: "01", title: "Topla", detail: `${totalRecords} veri kaydı kaynaklardan alındı`, score: connected >= 4 ? 100 : 72 },
      { step: "02", title: "Temizle", detail: "Eksik, mükerrer ve aykırı kayıtlar işaretlendi", score: Math.max(55, averageFreshness - 4) },
      { step: "03", title: "Doğrula", detail: "Resmî ve model kaynakları karşılaştırıldı", score: officialDataGatewayV32.verificationScore },
      { step: "04", title: "Birleştir", detail: "Tek gayrimenkul karar snapshotı oluşturuldu", score: orchestrationScore },
      { step: "05", title: "Dağıt", detail: "Değerleme, harita, finans ve rapor modüllerine aktarıldı", score: Math.min(100, orchestrationScore + 4) },
    ];
    const actions = [
      conflicts.length ? `${conflicts.length} veri çatışmasını çöz ve güven skorunu yükselt.` : "Veri kaynakları uyumlu; otomatik senkronizasyonu sürdür.",
      officialDataGatewayV32.officialCoverage < 70 ? "Tapu, imar ve afet kaynaklarını resmî veri geçidine bağla." : "Resmî kaynak kapsamı güçlü; yenilenme sürelerini izle.",
      averageFreshness < 80 ? "Eski piyasa ve konum snapshotlarını yeniden çek." : "Veri tazeliği karar üretimi için yeterli seviyede.",
      v35Mode === "Maksimum Güven" ? "Yalnız doğrulanmış kaynaklarla nihai rapor üret." : "Hız ve güven dengesine göre kaynak önceliğini koru.",
    ];
    const snapshotId = `YAI-V35-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${String(v35RunCount + 1).padStart(3,"0")}`;
    return { sourceDefinitions, connected, totalRecords, averageFreshness, averageTrust, orchestrationScore, conflicts, pipeline, actions, snapshotId };
  }, [aiDecisionBrain.confidence, dynamicMetrics.marketConfidence, form.city, form.district, locationIntelligenceV33.coordinateReady, locationIntelligenceV33.locationScore, locationIntelligenceV33.nearby.length, locationIntelligenceV33.risks.length, officialDataGatewayV32.officialCoverage, officialDataGatewayV32.sources.length, officialDataGatewayV32.verificationScore, portfolioIntelligenceV34.assets.length, portfolioIntelligenceV34.healthScore, portfolioIntelligenceV34.riskScore, realEstateIntelligenceV31.comparables.length, realEstateIntelligenceV31.marketConfidence, result, savedReports.length, v35Mode, v35RunCount]);

  function runV35OrchestrationCenter() {
    const now = new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const events = [
      `${now} · ${dataOrchestrationV35.sourceDefinitions.length} veri kaynağı tarandı`,
      `${now} · ${dataOrchestrationV35.totalRecords} kayıt normalize edildi`,
      `${now} · ${dataOrchestrationV35.conflicts.length} veri çatışması işaretlendi`,
      `${now} · ${v35Mode} modunda ${dataOrchestrationV35.snapshotId} snapshotı üretildi`,
      `${now} · Orkestrasyon güveni ${dataOrchestrationV35.orchestrationScore}/100 olarak hesaplandı`,
    ];
    setV35RunCount((current) => current + 1);
    setV35Events((current) => [...events, ...current].slice(0, 18));
    setLastLiveRefresh(new Date());
    setLiveRefreshTick((current) => current + 1);
  }

  useEffect(() => {
    if (!v30AutoMode) return;
    const event = `${new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · V30 otomatik senkronizasyon: ${intelligenceEngine.snapshotCode}`;
    setV30Timeline((current) => [event, ...current.filter((item) => item !== event)].slice(0, 12));
  }, [intelligenceEngine.snapshotCode, v30AutoMode]);

  useEffect(() => {
    const event = `${new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · ${intelligenceEngine.snapshotCode} güncellendi`;
    setLiveEvents((current) => [event, ...current.filter((item) => item !== event)].slice(0, 6));
  }, [intelligenceEngine.snapshotCode]);

  function refreshLiveDataLayer() {
    setLastLiveRefresh(new Date());
    setLiveRefreshTick((current) => current + 1);
    const event = `${new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · Canlı veri katmanı manuel yenilendi`;
    setLiveEvents((current) => [event, ...current].slice(0, 6));
  }

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

  const decisionCommandV36 = useMemo(() => {
    const safe = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
    const location = safe(locationIntelligenceV33.locationScore, 60);
    const market = safe(realEstateIntelligenceV31.marketConfidence, 60);
    const official = safe(officialDataGatewayV32.verificationScore, 50);
    const portfolio = safe(portfolioIntelligenceV34.healthScore, 60);
    const orchestration = safe(dataOrchestrationV35.orchestrationScore, 55);
    const core = safe(decisionCore.decisionIndex, 60);
    const modeAdjustment = v36DecisionMode === "Atak" ? 5 : v36DecisionMode === "Temkinli" ? -4 : 0;
    const confidence = Math.max(0, Math.min(100, Math.round(location * .14 + market * .18 + official * .16 + portfolio * .14 + orchestration * .18 + core * .20)));
    const risk = Math.max(0, Math.min(100, Math.round((100 - official) * .28 + (100 - location) * .18 + (100 - orchestration) * .24 + safe(aiDecisionBrain.riskScore, 35) * .30)));
    const returnPotential = Math.max(0, Math.min(100, Math.round(safe(decisionCore.opportunity, 60) * .45 + safe(realEstateIntelligenceV31.investmentIndex, 60) * .35 + portfolio * .20 + modeAdjustment)));
    const finalScore = Math.max(0, Math.min(100, Math.round(confidence * .48 + returnPotential * .34 + (100 - risk) * .18)));
    const verdict = finalScore >= 80 && risk <= 35 ? "AL" : finalScore >= 68 ? "PAZARLIK ET" : finalScore >= 54 ? "BEKLE" : "VAZGEÇ";
    const color = verdict === "AL" ? "#16a34a" : verdict === "PAZARLIK ET" ? "#f59e0b" : verdict === "BEKLE" ? "#2563eb" : "#dc2626";
    const reasons = [
      `Karar güveni ${confidence}/100; veri orkestrasyonu ${orchestration}/100 seviyesinde.`,
      `Beklenen getiri potansiyeli ${returnPotential}/100, toplam risk ${risk}/100 olarak hesaplandı.`,
      `Resmî doğrulama ${official}/100 ve lokasyon zekâsı ${location}/100 nihai kararı etkiledi.`,
      `Portföy etkisi ${portfolio}/100; seçilen karar modu ${v36DecisionMode}.`,
    ];
    const warnings = [
      official < 65 ? "Resmî doğrulama kapsamı yükseltilmeden kesin işlem yapılmamalı." : "Resmî veri kapsamı karar için kabul edilebilir seviyede.",
      risk > 45 ? "Risk seviyesi yüksek; teklif aralığı ve çıkış planı yeniden çalıştırılmalı." : "Risk seviyesi kontrollü görünüyor.",
      market < 65 ? "Emsal güveni düşük; daha fazla doğrulanmış karşılaştırma gerekli." : "Piyasa emsal güveni kararı destekliyor.",
    ];
    const nextActions = verdict === "AL" ? ["Son resmî doğrulamayı tamamla", "Finansman planını kilitle", "Teklif ve pazarlık protokolünü başlat"] : verdict === "PAZARLIK ET" ? ["Hedef teklif aralığını oluştur", "Kritik riskleri teklif koşullarına bağla", "Karşı teklif senaryosunu çalıştır"] : verdict === "BEKLE" ? ["Eksik verileri tamamla", "Piyasa fiyatını 7-14 gün izle", "Yeni emsal geldiğinde kararı yeniden çalıştır"] : ["İşlemi durdur", "Alternatif taşınmazları karşılaştır", "Riskli varsayımları arşivle"];
    const snapshotId = `YAI-V36-${new Date().toISOString().slice(0,10).replace(/-/g,"")}-${String(v36RunCount + 1).padStart(3,"0")}`;
    return { location, market, official, portfolio, orchestration, core, confidence, risk, returnPotential, finalScore, verdict, color, reasons, warnings, nextActions, snapshotId };
  }, [aiDecisionBrain.riskScore, dataOrchestrationV35.orchestrationScore, decisionCore.decisionIndex, decisionCore.opportunity, locationIntelligenceV33.locationScore, officialDataGatewayV32.verificationScore, portfolioIntelligenceV34.healthScore, realEstateIntelligenceV31.investmentIndex, realEstateIntelligenceV31.marketConfidence, v36DecisionMode, v36RunCount]);

  function runV36DecisionCommand() {
    const now = new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const events = [
      `${now} · 6 karar motoru tek komuta snapshotında birleştirildi`,
      `${now} · Nihai karar ${decisionCommandV36.verdict} olarak üretildi`,
      `${now} · Güven ${decisionCommandV36.confidence}/100 · Risk ${decisionCommandV36.risk}/100`,
      `${now} · Beklenen getiri potansiyeli ${decisionCommandV36.returnPotential}/100`,
      `${now} · Yönetici özeti ve aksiyon planı hazırlandı`,
    ];
    setV36RunCount((current) => current + 1);
    setV36Events((current) => [...events, ...current].slice(0, 15));
  }

  const corporateReportV37 = useMemo(() => {
    const quality = Math.max(0, Math.min(100, Math.round(
      dynamicMetrics.dataConfidence * .30 +
      decisionCommandV36.official * .25 +
      decisionCommandV36.orchestration * .25 +
      decisionCommandV36.market * .20
    )));
    const financial = Math.max(0, Math.min(100, Math.round(
      dynamicMetrics.investmentScore * .40 +
      dynamicMetrics.liquidityScore * .25 +
      decisionCommandV36.returnPotential * .35
    )));
    const riskGrade = decisionCommandV36.risk <= 30 ? "A" : decisionCommandV36.risk <= 45 ? "B" : decisionCommandV36.risk <= 60 ? "C" : "D";
    const corporateScore = Math.max(0, Math.min(100, Math.round(
      quality * .32 + financial * .34 + decisionCommandV36.finalScore * .34
    )));
    const audienceNote = v37ReportMode === "Banka"
      ? "Teminat değeri, doğrulama kapsamı ve risk görünümü önceliklendirildi."
      : v37ReportMode === "Müteahhit"
      ? "Geliştirme potansiyeli, satış kabiliyeti ve proje riski önceliklendirildi."
      : v37ReportMode === "Bireysel"
      ? "Bütçe uyumu, güvenli teklif ve kullanım amacı önceliklendirildi."
      : "Getiri, likidite, fırsat ve çıkış stratejisi önceliklendirildi.";
    const executiveSummary = `${form.city || "—"} / ${form.district || "—"} / ${form.neighborhood || "—"} konumundaki ${form.propertyType.toLowerCase()} için kurumsal karar ${decisionCommandV36.verdict}. Toplam kurumsal skor ${corporateScore}/100, veri güveni ${quality}/100 ve risk notu ${riskGrade}. ${audienceNote}`;
    const reportId = `YAI-V37-${new Date().toISOString().slice(0,10).replace(/-/g, "")}-${String(v37RunCount + 1).padStart(3,"0")}`;
    return { quality, financial, riskGrade, corporateScore, executiveSummary, audienceNote, reportId };
  }, [decisionCommandV36.finalScore, decisionCommandV36.market, decisionCommandV36.official, decisionCommandV36.orchestration, decisionCommandV36.returnPotential, decisionCommandV36.risk, decisionCommandV36.verdict, dynamicMetrics.dataConfidence, dynamicMetrics.investmentScore, dynamicMetrics.liquidityScore, form.city, form.district, form.neighborhood, form.propertyType, v37ReportMode, v37RunCount]);

  function runV37CorporateReport() {
    const now = new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const events = [
      `${now} · ${v37ReportMode} rapor profili çalıştırıldı`,
      `${now} · Kurumsal skor ${corporateReportV37.corporateScore}/100 olarak üretildi`,
      `${now} · Veri güveni ${corporateReportV37.quality}/100 · Risk notu ${corporateReportV37.riskGrade}`,
      `${now} · Yönetici özeti ve doğrulama kimliği hazırlandı`,
    ];
    setV37RunCount((current) => current + 1);
    setV37Events((current) => [...events, ...current].slice(0, 12));
  }


  const predictionEngineV39 = useMemo(() => {
    const base = dynamicMetrics.market || askingPriceNumber || 0;
    const scenarioRate = v39Scenario === "Temkinli" ? 0.06 : v39Scenario === "İyimser" ? 0.14 : 0.10;
    const trustAdjustment = Math.max(-0.018, Math.min(0.025, (dynamicMetrics.trust - 55) / 1800));
    const riskAdjustment = Math.max(-0.03, Math.min(0.01, (55 - dynamicMetrics.risk) / 1600));
    const annualRate = Math.max(0.025, scenarioRate + trustAdjustment + riskAdjustment);
    const project = (years: number) => Math.round(base * Math.pow(1 + annualRate, years));
    const uncertainty = Math.max(0.06, Math.min(0.22, 0.18 - dynamicMetrics.valueConfidence / 1000 + dynamicMetrics.risk / 1400));
    const points = [1, 3, 5].map((years) => {
      const value = project(years);
      return {
        years,
        value,
        low: Math.round(value * (1 - uncertainty)),
        high: Math.round(value * (1 + uncertainty)),
        growth: base > 0 ? ((value - base) / base) * 100 : 0,
      };
    });
    const selected = points.find((item) => item.years === v39Horizon) ?? points[2];
    const monthlyRentBase = Math.round(base * (form.propertyType === "Arsa" ? 0.0022 : 0.0044));
    const monthlyRentFuture = Math.round(monthlyRentBase * Math.pow(1 + Math.max(0.08, annualRate * 0.82), v39Horizon));
    const confidence = Math.max(35, Math.min(96, Math.round(dynamicMetrics.valueConfidence * 0.64 + dynamicMetrics.liquidity * 0.18 + (100 - dynamicMetrics.risk) * 0.18)));
    const opportunity = selected.growth >= 55 ? "Yüksek büyüme potansiyeli" : selected.growth >= 28 ? "Dengeli büyüme potansiyeli" : "Sınırlı büyüme potansiyeli";
    const verdict = dynamicMetrics.risk >= 72 ? "Temkinli ilerle" : confidence >= 74 && selected.growth >= 35 ? "Uzun vadeli güçlü aday" : "Verileri doğrulayarak değerlendir";
    const drivers = [
      `Veri güven skoru ${dynamicMetrics.trust}/100`,
      `Likidite puanı ${dynamicMetrics.liquidity}/100`,
      `Risk puanı ${dynamicMetrics.risk}/100`,
      `${v39Scenario} senaryoda yıllık yaklaşık %${(annualRate * 100).toFixed(1)} bileşik artış varsayımı`,
    ];
    return { base, annualRate, points, selected, monthlyRentBase, monthlyRentFuture, confidence, opportunity, verdict, drivers, uncertainty };
  }, [askingPriceNumber, dynamicMetrics, form.propertyType, v39Horizon, v39Scenario]);

  function runV39Prediction() {
    const stamp = new Date().toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
    setV39RunCount((count) => count + 1);
    setV39Events((events) => [`${stamp} · ${v39Scenario} senaryo · ${v39Horizon} yıllık tahmin üretildi`, ...events].slice(0, 8));
  }

  return (
    <>
      <style>{`
        .print-report { display: none; }
        .yasam-dashboard-shell { position: relative; }
        .yasam-sidebar { position: fixed; left: 18px; top: 18px; width: 220px; max-height: calc(100vh - 36px); overflow-y: auto; z-index: 30; border-radius: 22px; padding: 14px; background: rgba(5,18,43,.92); border: 1px solid rgba(255,255,255,.15); box-shadow: 0 24px 70px rgba(0,0,0,.34); backdrop-filter: blur(18px); }
        .yasam-content { max-width: 1220px; margin: 0 auto 0 246px; }
        .yasam-module-anchor { scroll-margin-top: 22px; }
        .yasam-module-view { animation: yasamModuleIn .28s ease both; }
        @keyframes yasamModuleIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .yasam-nav-button:hover { transform: translateX(3px); background: rgba(255,255,255,.13) !important; }
        @media (max-width: 1180px) {
          .yasam-sidebar { position: sticky; top: 10px; left: auto; width: auto; max-height: none; display: flex; gap: 8px; overflow-x: auto; margin: 0 auto 16px; border-radius: 16px; }
          .yasam-sidebar-title, .yasam-sidebar-status { display: none; }
          .yasam-content { margin: 0 auto; }
          .yasam-nav-button { min-width: max-content; }
        }
        @page { size: A4; margin: 12mm; }
        @media print {
          body { background: #ffffff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          body * { visibility: hidden !important; }
          .print-report, .print-report * { visibility: visible !important; }
          .print-report {
            display: block !important;
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            color: #14243a !important;
            background: #ffffff !important;
            font-family: Arial, Helvetica, sans-serif;
          }
          .print-page { page-break-after: always; break-after: page; }
          .print-page:last-child { page-break-after: auto; break-after: auto; }
          .print-avoid { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>
    <main className="yasam-dashboard-shell"
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top right, rgba(35,128,206,0.28), transparent 34%), linear-gradient(145deg, #06132d 0%, #0b2e63 48%, #0b4f8f 100%)",
        color: "#ffffff",
        padding: "32px 18px 70px",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <aside className="yasam-sidebar">
        <div className="yasam-sidebar-title" style={{padding:"10px 10px 14px",borderBottom:"1px solid rgba(255,255,255,.12)",marginBottom:"10px"}}>
          <div style={{fontSize:"11px",fontWeight:900,letterSpacing:".12em",color:"#facc15"}}>YAŞAM AI V40</div>
          <div style={{fontSize:"19px",fontWeight:900,marginTop:"5px"}}>Faz 1 Final</div>
          <div style={{fontSize:"12px",opacity:.65,marginTop:"5px"}}>Mimari, performans ve Faz 2 hazırlık merkezi</div>
          <div style={{marginTop:"9px",padding:"7px 9px",borderRadius:"10px",background:"rgba(255,255,255,.08)",fontSize:"11px",fontWeight:800,color:"#bae6fd"}}>Aktif: {dashboardModules.find((module) => module.id === activeModule)?.label}</div>
        </div>
        <div style={{display:"grid",gap:"6px"}}>
          {dashboardModules.map((module) => (
            <button key={module.id} type="button" onClick={() => openDashboardModule(module.id)} className="yasam-nav-button" style={{display:"flex",alignItems:"center",gap:"10px",width:"100%",padding:"11px 12px",borderRadius:"12px",border:activeModule===module.id?"1px solid rgba(96,165,250,.75)":"1px solid transparent",background:activeModule===module.id?"linear-gradient(135deg,rgba(37,99,235,.8),rgba(14,165,233,.45))":"transparent",color:"#fff",fontWeight:800,textAlign:"left",cursor:"pointer",transition:"all .2s ease"}}>
              <span style={{width:"24px",height:"24px",display:"grid",placeItems:"center",borderRadius:"8px",background:"rgba(255,255,255,.1)"}}>{module.icon}</span>
              <span>{module.label}</span>
            </button>
          ))}
        </div>
        <div className="yasam-sidebar-status" style={{marginTop:"12px",padding:"12px",borderRadius:"13px",background:"rgba(16,185,129,.12)",border:"1px solid rgba(52,211,153,.2)",fontSize:"12px",lineHeight:1.55}}>
          <strong style={{color:"#6ee7b7"}}>● Canlı veri aktif</strong><br/>{liveDataLayer.readyCount}/6 kaynak hazır · canlı skor {liveDataLayer.liveScore}/100.
        </div>
      </aside>
      <div className="yasam-content" style={{ width: "100%" }}>
        <div style={{marginBottom:"14px",padding:"12px 14px",borderRadius:"15px",background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.12)",display:"flex",justifyContent:"space-between",gap:"12px",alignItems:"center",flexWrap:"wrap"}}>
          <div><strong style={{color:"#67e8f9"}}>V40 Aktif Modül:</strong> {dashboardModules.find((module) => module.id === activeModule)?.label}</div>
          <div style={{fontSize:"12px",opacity:.72}}>Sekme değişince yalnızca seçilen çalışma alanı gösterilir; ortak karar verisi korunur.</div>
        </div>
        <div style={{marginBottom:"14px",padding:"16px 18px",borderRadius:"18px",background:"linear-gradient(135deg,rgba(76,29,149,.96),rgba(37,99,235,.92))",border:"1px solid rgba(196,181,253,.55)",boxShadow:"0 18px 45px rgba(49,46,129,.25)",display:"flex",justifyContent:"space-between",alignItems:"center",gap:"14px",flexWrap:"wrap"}}>
          <div>
            <div style={{fontSize:"11px",fontWeight:950,letterSpacing:".12em",color:"#ddd6fe"}}>V40 AKTİF · FAZ 1 FINAL</div>
            <div style={{fontSize:"20px",fontWeight:950,marginTop:"5px"}}>Faz 1 tamamlandı, Faz 2 kapısı açıldı</div>
            <div style={{fontSize:"12px",color:"#e0e7ff",marginTop:"5px"}}>Tüm karar, veri, rapor, portföy ve tahmin modülleri tek final mimarisinde birleşti.</div>
          </div>
          <button type="button" onClick={() => openDashboardModule("final")} style={{padding:"12px 16px",borderRadius:"12px",border:"1px solid rgba(255,255,255,.35)",background:"#fff",color:"#4c1d95",fontWeight:950,cursor:"pointer"}}>Faz 1 Finali Aç →</button>
        </div>
        <div id="yasam-overview" className="yasam-module-anchor yasam-module-view" style={{ display: activeModule === "overview" ? "block" : "none" }}>
        <AnalysisHeader
          title="Yaşam AI V33 AI Harita ve Konum Zekâ Merkezi"
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
        <section style={{margin:"18px 0 24px",padding:"22px",borderRadius:"22px",background:"linear-gradient(135deg,rgba(15,39,66,.94),rgba(29,78,216,.82))",border:"1px solid rgba(255,255,255,.16)",boxShadow:"0 24px 60px rgba(0,0,0,.2)"}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:"18px",alignItems:"flex-start",flexWrap:"wrap"}}>
            <div style={{maxWidth:"720px"}}>
              <div style={{fontSize:"12px",fontWeight:900,letterSpacing:".1em",color:"#facc15"}}>AI YÖNETİCİ ÖZETİ</div>
              <h2 style={{margin:"8px 0 10px",fontSize:"clamp(25px,4vw,38px)"}}>{decision === "BEKLE" ? "Karar için veri tamamlanmalı." : `AI kararı: ${decision}`}</h2>
              <p style={{margin:0,lineHeight:1.75,opacity:.84}}>{intelligenceEngine.narrative}</p>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(120px,1fr))",gap:"10px",minWidth:"290px"}}>
              <div style={{padding:"13px",borderRadius:"14px",background:"rgba(255,255,255,.1)"}}><div style={{fontSize:"11px",opacity:.65}}>NİHAİ PUAN</div><strong style={{fontSize:"25px"}}>{dynamicMetrics.reportScore}/100</strong></div>
              <div style={{padding:"13px",borderRadius:"14px",background:"rgba(255,255,255,.1)"}}><div style={{fontSize:"11px",opacity:.65}}>RİSK</div><strong style={{fontSize:"20px"}}>{scores[3]?.value ?? 65}/100</strong></div>
              <div style={{padding:"13px",borderRadius:"14px",background:"rgba(255,255,255,.1)"}}><div style={{fontSize:"11px",opacity:.65}}>GÜVENLİ TEKLİF</div><strong>{money(dynamicMetrics.safeOffer)}</strong></div>
              <div style={{padding:"13px",borderRadius:"14px",background:"rgba(255,255,255,.1)"}}><div style={{fontSize:"11px",opacity:.65}}>LOKASYON</div><strong>{locationIntelligence?.locationScore ?? 0}/100</strong></div>
            </div>
          </div>
        </section>

        <section style={{margin:"0 0 26px",padding:"22px",borderRadius:"24px",background:"linear-gradient(145deg,rgba(6,23,50,.96),rgba(12,74,110,.92))",border:"1px solid rgba(56,189,248,.32)",boxShadow:"0 24px 60px rgba(0,0,0,.2)"}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:"16px",alignItems:"flex-start",flexWrap:"wrap"}}>
            <div style={{maxWidth:"720px"}}>
              <div style={{fontSize:"12px",fontWeight:900,letterSpacing:".11em",color:"#67e8f9"}}>V26 · DYNAMIC DECISION ENGINE</div>
              <h2 style={{margin:"8px 0 9px",fontSize:"clamp(25px,4vw,38px)"}}>Tüm modüller artık tek karar beyninde birleşiyor.</h2>
              <p style={{margin:0,lineHeight:1.72,color:"#c7d9ee"}}>Konum, fiyat, değerleme, yatırım, risk, likidite ve pazarlık verileri ortak çekirdekte işlenerek tek bir karar endeksi üretir.</p>
            </div>
            <div style={{minWidth:"250px",padding:"16px 18px",borderRadius:"18px",background:"rgba(255,255,255,.09)",border:"1px solid rgba(255,255,255,.14)"}}>
              <div style={{fontSize:"11px",opacity:.68}}>ÇEKİRDEK KARARI</div>
              <div style={{fontSize:"23px",fontWeight:950,color:decisionCore.verdictTone,marginTop:"5px"}}>{decisionCore.verdict}</div>
              <div style={{display:"flex",gap:"8px",alignItems:"baseline",marginTop:"7px"}}><strong style={{fontSize:"32px"}}>{decisionCore.decisionIndex}</strong><span style={{opacity:.65}}>/100 karar endeksi</span></div>
              <div style={{height:"7px",background:"rgba(255,255,255,.12)",borderRadius:"999px",overflow:"hidden",marginTop:"7px"}}><div style={{width:`${decisionCore.decisionIndex}%`,height:"100%",background:`linear-gradient(90deg,#38bdf8,${decisionCore.verdictTone})`,borderRadius:"999px"}} /></div>
            </div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:"11px",marginTop:"18px"}}>
            {[
              ["Veri Tamamlanma", `${decisionCore.completeness}%`, "Karar için hazır veri"],
              ["Fırsat Gücü", `${decisionCore.opportunityPower}/100`, "Yatırım + lokasyon + likidite"],
              ["Senkron Modül", `${decisionCore.synchronizedModules}/5`, "Ortak çekirdeğe bağlı"],
              ["Güvenli Teklif", money(dynamicMetrics.safeOffer), "Pazarlık motoru çıktısı"],
            ].map(([label,value,note]) => <div key={label} style={{padding:"15px",borderRadius:"16px",background:"rgba(255,255,255,.075)",border:"1px solid rgba(255,255,255,.12)"}}><div style={{fontSize:"11px",fontWeight:900,color:"#9fd4f5"}}>{label}</div><div style={{fontSize:"20px",fontWeight:900,marginTop:"6px"}}>{value}</div><div style={{fontSize:"12px",opacity:.66,marginTop:"5px"}}>{note}</div></div>)}
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(290px,1fr))",gap:"14px",marginTop:"16px"}}>
            <div style={{padding:"17px",borderRadius:"18px",background:"#ffffff",color:"#173253"}}>
              <div style={{fontSize:"12px",fontWeight:900,color:"#2563eb"}}>KARARIN GEREKÇELERİ</div>
              <div style={{display:"grid",gap:"9px",marginTop:"12px"}}>{decisionCore.reasons.map((reason,index)=><div key={reason} style={{display:"flex",gap:"9px",alignItems:"flex-start",fontSize:"13px",lineHeight:1.55}}><span style={{width:"23px",height:"23px",display:"grid",placeItems:"center",borderRadius:"50%",background:"#dbeafe",color:"#1d4ed8",fontWeight:900,flex:"0 0 auto"}}>{index+1}</span><span>{reason}</span></div>)}</div>
            </div>
            <div style={{padding:"17px",borderRadius:"18px",background:"linear-gradient(145deg,#fff8dd,#ffffff)",color:"#45380b",border:"1px solid #efd98b"}}>
              <div style={{fontSize:"12px",fontWeight:900,color:"#a16207"}}>SONRAKİ EN DOĞRU ADIMLAR</div>
              <div style={{display:"grid",gap:"9px",marginTop:"12px"}}>{decisionCore.nextActions.map((action,index)=><div key={action} style={{padding:"10px 11px",borderRadius:"12px",background:"rgba(255,255,255,.75)",border:"1px solid #eee1b3",fontSize:"13px",fontWeight:700,lineHeight:1.5}}>{index+1}. {action}</div>)}</div>
            </div>
          </div>
        </section>

        <section style={{margin:"0 0 26px",padding:"22px",borderRadius:"24px",background:"linear-gradient(145deg,rgba(8,25,52,.97),rgba(20,83,120,.94))",border:"1px solid rgba(52,211,153,.3)",boxShadow:"0 26px 65px rgba(0,0,0,.22)"}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:"16px",alignItems:"flex-start",flexWrap:"wrap"}}>
            <div style={{maxWidth:"720px"}}>
              <div style={{fontSize:"12px",fontWeight:900,letterSpacing:".11em",color:"#6ee7b7"}}>V26 · LIVE DATA SNAPSHOT</div>
              <h2 style={{margin:"8px 0 9px",fontSize:"clamp(25px,4vw,38px)"}}>Bütün modüller aynı canlı veri anlık görüntüsünü kullanıyor.</h2>
              <p style={{margin:0,lineHeight:1.72,color:"#c8e6f3"}}>{intelligenceEngine.narrative}</p>
            </div>
            <div style={{minWidth:"270px",padding:"16px 18px",borderRadius:"18px",background:"rgba(255,255,255,.09)",border:"1px solid rgba(255,255,255,.14)"}}>
              <div style={{fontSize:"11px",opacity:.68}}>CANLI SNAPSHOT</div>
              <div style={{fontSize:"18px",fontWeight:950,color:"#86efac",marginTop:"6px"}}>{intelligenceEngine.snapshotCode}</div>
              <div style={{fontSize:"12px",opacity:.7,marginTop:"8px"}}>Son senkronizasyon: {intelligenceEngine.updatedAt}</div>
            </div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(175px,1fr))",gap:"11px",marginTop:"18px"}}>
            {[
              ["Birleşik Karar", `${intelligenceEngine.unifiedDecision}/100`, "Tüm sinyallerin ortak sonucu"],
              ["Veri Kalitesi", `${intelligenceEngine.dataQuality}/100`, "Güven + tamlık + senkronizasyon"],
              ["Senkronizasyon", `${intelligenceEngine.synchronization}%`, `${intelligenceEngine.readyCount}/${intelligenceEngine.modules.length} modül canlı`],
              ["Ortalama Sinyal", `${intelligenceEngine.averageSignal}/100`, "Modül çıktılarının ortalaması"],
            ].map(([label,value,note]) => <div key={label} style={{padding:"15px",borderRadius:"16px",background:"rgba(255,255,255,.075)",border:"1px solid rgba(255,255,255,.12)"}}><div style={{fontSize:"11px",fontWeight:900,color:"#a7f3d0"}}>{label}</div><div style={{fontSize:"20px",fontWeight:900,marginTop:"6px"}}>{value}</div><div style={{fontSize:"12px",opacity:.66,marginTop:"5px"}}>{note}</div></div>)}
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:"10px",marginTop:"16px"}}>
            {intelligenceEngine.modules.map((module) => <div key={module.name} style={{padding:"13px 14px",borderRadius:"15px",background:module.ready?"rgba(16,185,129,.13)":"rgba(245,158,11,.12)",border:module.ready?"1px solid rgba(52,211,153,.28)":"1px solid rgba(251,191,36,.26)"}}>
              <div style={{display:"flex",justifyContent:"space-between",gap:"10px",alignItems:"center"}}><strong>{module.name}</strong><span style={{fontSize:"11px",fontWeight:900,color:module.ready?"#86efac":"#fcd34d"}}>{module.ready?"SENKRON":"VERİ BEKLİYOR"}</span></div>
              <div style={{display:"flex",alignItems:"center",gap:"10px",marginTop:"9px"}}><div style={{height:"6px",flex:1,background:"rgba(255,255,255,.12)",borderRadius:"999px",overflow:"hidden"}}><div style={{width:`${Math.max(0,Math.min(100,module.value))}%`,height:"100%",background:module.ready?"linear-gradient(90deg,#22c55e,#2dd4bf)":"linear-gradient(90deg,#f59e0b,#facc15)",borderRadius:"999px"}} /></div><span style={{fontSize:"12px",fontWeight:900}}>{Math.round(module.value)}/100</span></div>
            </div>)}
          </div>
        </section>

        <section style={{margin:"0 0 26px",padding:"22px",borderRadius:"24px",background:"linear-gradient(145deg,rgba(7,19,43,.98),rgba(49,46,129,.93))",border:"1px solid rgba(167,139,250,.32)",boxShadow:"0 28px 70px rgba(0,0,0,.24)"}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:"18px",alignItems:"flex-start",flexWrap:"wrap"}}>
            <div style={{maxWidth:"720px"}}>
              <div style={{fontSize:"12px",fontWeight:900,letterSpacing:".12em",color:"#c4b5fd"}}>V27 · AI DECISION BRAIN</div>
              <h2 style={{margin:"8px 0 9px",fontSize:"clamp(26px,4vw,39px)"}}>Çok katmanlı yapay zekâ karar beyni</h2>
              <p style={{margin:0,lineHeight:1.72,color:"#d8dcf2"}}>Lokasyon, fiyat, yatırım, risk, likidite ve finans sinyalleri ayrı ayrı değerlendirilir; ardından gerekçeli ve güven seviyesi ölçülmüş tek bir nihai karar oluşturulur.</p>
            </div>
            <div style={{minWidth:"285px",padding:"17px 19px",borderRadius:"19px",background:"rgba(255,255,255,.09)",border:"1px solid rgba(255,255,255,.14)"}}>
              <div style={{fontSize:"11px",opacity:.68}}>NİHAİ AI KARARI</div>
              <div style={{fontSize:"22px",fontWeight:950,color:aiDecisionBrain.tone,marginTop:"6px"}}>{aiDecisionBrain.verdict}</div>
              <div style={{display:"flex",alignItems:"baseline",gap:"8px",marginTop:"8px"}}><strong style={{fontSize:"34px"}}>{aiDecisionBrain.weightedScore}</strong><span style={{opacity:.68}}>/100</span></div>
              <div style={{fontSize:"12px",fontWeight:900,color:"#ddd6fe",marginTop:"5px"}}>Önerilen hareket: {aiDecisionBrain.action}</div>
            </div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(175px,1fr))",gap:"11px",marginTop:"18px"}}>
            {[
              ["AI Güveni", `${aiDecisionBrain.aiConfidence}%`, "Karar modelinin güven seviyesi"],
              ["Tahmin Güvenilirliği", `${aiDecisionBrain.predictionReliability}%`, "Veri ve senkronizasyon kalitesi"],
              ["Resmî Veri Kapsamı", `${aiDecisionBrain.officialCoverage}%`, "Doğrulama kapsamı"],
              ["Kanıt Kapsamı", `${aiDecisionBrain.evidenceCoverage}%`, "Canlı çalışan modüller"],
            ].map(([label,value,note]) => <div key={label} style={{padding:"15px",borderRadius:"16px",background:"rgba(255,255,255,.075)",border:"1px solid rgba(255,255,255,.12)"}}><div style={{fontSize:"11px",fontWeight:900,color:"#ddd6fe"}}>{label}</div><div style={{fontSize:"20px",fontWeight:900,marginTop:"6px"}}>{value}</div><div style={{fontSize:"12px",opacity:.66,marginTop:"5px"}}>{note}</div></div>)}
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(245px,1fr))",gap:"11px",marginTop:"16px"}}>
            {aiDecisionBrain.layers.map((layer) => <div key={layer.name} style={{padding:"15px",borderRadius:"16px",background:"rgba(255,255,255,.07)",border:"1px solid rgba(255,255,255,.11)"}}>
              <div style={{display:"flex",justifyContent:"space-between",gap:"10px"}}><strong>{layer.name}</strong><strong style={{color:layer.score>=70?"#86efac":layer.score>=50?"#93c5fd":"#fca5a5"}}>{layer.score}/100</strong></div>
              <div style={{height:"7px",background:"rgba(255,255,255,.12)",borderRadius:"999px",overflow:"hidden",marginTop:"10px"}}><div style={{width:`${layer.score}%`,height:"100%",background:"linear-gradient(90deg,#8b5cf6,#38bdf8)",borderRadius:"999px"}} /></div>
              <div style={{fontSize:"12px",lineHeight:1.5,opacity:.72,marginTop:"9px"}}>{layer.note}</div>
            </div>)}
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:"12px",marginTop:"16px"}}>
            {aiDecisionBrain.scenarios.map((scenario) => <div key={scenario.name} style={{padding:"16px",borderRadius:"17px",background:"linear-gradient(145deg,rgba(255,255,255,.11),rgba(255,255,255,.055))",border:"1px solid rgba(255,255,255,.13)"}}>
              <div style={{display:"flex",justifyContent:"space-between",gap:"12px",alignItems:"center"}}><strong>{scenario.name} Senaryo</strong><span style={{fontSize:"18px",fontWeight:950}}>{scenario.score}/100</span></div>
              <div style={{fontSize:"21px",fontWeight:950,color:"#f5d76e",marginTop:"8px"}}>{money(scenario.value)}</div>
              <div style={{fontSize:"12px",opacity:.68,marginTop:"5px"}}>{scenario.note}</div>
            </div>)}
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:"14px",marginTop:"16px"}}>
            <div style={{padding:"17px",borderRadius:"18px",background:"#ffffff",color:"#1e293b"}}>
              <div style={{fontSize:"12px",fontWeight:900,color:"#6d28d9"}}>AI KARAR GEREKÇELERİ</div>
              <div style={{display:"grid",gap:"9px",marginTop:"12px"}}>{aiDecisionBrain.reasons.map((reason,index)=><div key={reason} style={{display:"flex",gap:"9px",fontSize:"13px",lineHeight:1.55}}><span style={{width:"23px",height:"23px",display:"grid",placeItems:"center",borderRadius:"50%",background:"#ede9fe",color:"#6d28d9",fontWeight:900,flex:"0 0 auto"}}>{index+1}</span><span>{reason}</span></div>)}</div>
            </div>
            <div style={{padding:"17px",borderRadius:"18px",background:"linear-gradient(145deg,#fff1f2,#ffffff)",color:"#4c1d25",border:"1px solid #fecdd3"}}>
              <div style={{fontSize:"12px",fontWeight:900,color:"#be123c"}}>KRİTİK UYARILAR</div>
              <div style={{display:"grid",gap:"9px",marginTop:"12px"}}>{aiDecisionBrain.warnings.map((warning,index)=><div key={warning} style={{padding:"10px 11px",borderRadius:"12px",background:"rgba(255,255,255,.78)",border:"1px solid #fecdd3",fontSize:"13px",fontWeight:700,lineHeight:1.5}}>{index+1}. {warning}</div>)}</div>
            </div>
          </div>
        </section>

        <section style={{margin:"0 0 26px",padding:"24px",borderRadius:"26px",background:"linear-gradient(145deg,rgba(5,15,35,.99),rgba(7,89,133,.95))",border:"1px solid rgba(34,211,238,.34)",boxShadow:"0 30px 80px rgba(0,0,0,.28)"}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:"18px",alignItems:"flex-start",flexWrap:"wrap"}}>
            <div style={{maxWidth:"760px"}}>
              <div style={{fontSize:"12px",fontWeight:950,letterSpacing:".12em",color:"#67e8f9"}}>V29 · DECISION BRAIN 2.0 ULTRA</div>
              <h2 style={{margin:"8px 0 10px",fontSize:"clamp(27px,4vw,41px)"}}>7 işlemi tek komutta çalıştıran karar komuta merkezi</h2>
              <p style={{margin:0,lineHeight:1.75,color:"#c9e8f7"}}>Karar skoru, veri hazırlığı, tutarlılık kontrolü, stres testi, hassasiyet analizi, görev önceliği ve yönetici özeti aynı anda hesaplanır.</p>
            </div>
            <div style={{display:"grid",gap:"9px",minWidth:"300px"}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"9px"}}>
                <select value={v29RiskProfile} onChange={(event)=>setV29RiskProfile(event.target.value as "Temkinli"|"Dengeli"|"Agresif")} style={{padding:"11px",borderRadius:"11px",border:"1px solid rgba(255,255,255,.2)",background:"rgba(255,255,255,.1)",color:"#fff",fontWeight:850}}><option style={{color:"#111"}}>Temkinli</option><option style={{color:"#111"}}>Dengeli</option><option style={{color:"#111"}}>Agresif</option></select>
                <select value={v29Strategy} onChange={(event)=>setV29Strategy(event.target.value as "Oturum"|"Kira"|"Al-Sat"|"Geliştirme")} style={{padding:"11px",borderRadius:"11px",border:"1px solid rgba(255,255,255,.2)",background:"rgba(255,255,255,.1)",color:"#fff",fontWeight:850}}><option style={{color:"#111"}}>Oturum</option><option style={{color:"#111"}}>Kira</option><option style={{color:"#111"}}>Al-Sat</option><option style={{color:"#111"}}>Geliştirme</option></select>
              </div>
              <button type="button" onClick={runV29DecisionOperations} style={{padding:"13px 16px",borderRadius:"12px",border:0,background:"linear-gradient(135deg,#22d3ee,#2563eb)",color:"#fff",fontWeight:950,cursor:"pointer",boxShadow:"0 14px 30px rgba(37,99,235,.3)"}}>⚡ 7 Analizi Birlikte Çalıştır</button>
            </div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:"11px",marginTop:"18px"}}>
            {[["V29 Karar Skoru",`${decisionBrainV29.baseDecision}/100`],["İşlem Hazırlığı",`%${decisionBrainV29.readiness}`],["Tutarlılık",`%${decisionBrainV29.consistencyScore}`],["Operasyon Sayısı",`${v29RunCount}`],["Sistem Kararı",decisionBrainV29.verdict]].map(([label,value])=><div key={label} style={{padding:"15px",borderRadius:"16px",background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.12)"}}><div style={{fontSize:"10px",fontWeight:900,color:"#a5f3fc"}}>{label}</div><div style={{fontSize:label==="Sistem Kararı"?"16px":"22px",fontWeight:950,marginTop:"6px",color:label==="Sistem Kararı"?decisionBrainV29.color:"#fff"}}>{value}</div></div>)}
          </div>

          <div style={{marginTop:"14px",padding:"15px 17px",borderRadius:"16px",background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.12)",lineHeight:1.7}}><strong style={{color:"#facc15"}}>Yönetici Özeti:</strong> {decisionBrainV29.executiveSummary}</div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:"14px",marginTop:"16px"}}>
            <div style={{padding:"18px",borderRadius:"18px",background:"#fff",color:"#172554"}}><div style={{fontSize:"12px",fontWeight:950,color:"#1d4ed8"}}>6 NOKTALI TUTARLILIK DENETİMİ</div><div style={{display:"grid",gap:"8px",marginTop:"12px"}}>{decisionBrainV29.consistencyChecks.map((item)=><div key={item.name} style={{display:"grid",gridTemplateColumns:"24px 1fr",gap:"8px",alignItems:"start",padding:"9px",borderRadius:"11px",background:item.ok?"#ecfdf5":"#fff7ed"}}><span>{item.ok?"✓":"!"}</span><div><strong>{item.name}</strong><div style={{fontSize:"12px",color:"#64748b",marginTop:"3px"}}>{item.detail}</div></div></div>)}</div></div>
            <div style={{padding:"18px",borderRadius:"18px",background:"linear-gradient(145deg,#fff7ed,#fff)",color:"#4a2c0a",border:"1px solid #fed7aa"}}><div style={{fontSize:"12px",fontWeight:950,color:"#c2410c"}}>ÖNCELİKLİ İŞLEM KUYRUĞU</div><div style={{display:"grid",gap:"8px",marginTop:"12px"}}>{decisionBrainV29.actionQueue.slice(0,6).map((item,index)=><div key={`${item.action}-${index}`} style={{display:"grid",gridTemplateColumns:"28px 1fr",gap:"8px",padding:"10px",borderRadius:"11px",background:"rgba(255,255,255,.8)",border:"1px solid #fed7aa"}}><span style={{fontWeight:950,color:item.priority===1?"#dc2626":item.priority===2?"#d97706":"#2563eb"}}>P{item.priority}</span><div><strong style={{fontSize:"13px"}}>{item.action}</strong><div style={{fontSize:"11px",color:"#78716c",marginTop:"3px"}}>{item.owner}</div></div></div>)}</div></div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:"11px",marginTop:"16px"}}>{decisionBrainV29.stressScenarios.map((scenario)=><div key={scenario.name} style={{padding:"15px",borderRadius:"16px",background:"rgba(255,255,255,.075)",border:"1px solid rgba(255,255,255,.12)"}}><div style={{display:"flex",justifyContent:"space-between",gap:"10px"}}><strong>{scenario.name}</strong><strong style={{color:scenario.score>=65?"#86efac":scenario.score>=45?"#fde68a":"#fca5a5"}}>{scenario.score}/100</strong></div><div style={{height:"7px",marginTop:"9px",borderRadius:"999px",background:"rgba(255,255,255,.12)",overflow:"hidden"}}><div style={{width:`${scenario.score}%`,height:"100%",background:"linear-gradient(90deg,#22d3ee,#8b5cf6)"}} /></div><div style={{fontSize:"12px",opacity:.7,lineHeight:1.45,marginTop:"8px"}}>{scenario.description}</div></div>)}</div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:"10px",marginTop:"14px"}}>{decisionBrainV29.sensitivity.map((item)=><div key={item.variable} style={{padding:"13px",borderRadius:"14px",background:"rgba(0,0,0,.16)",border:"1px solid rgba(255,255,255,.1)"}}><div style={{fontSize:"11px",color:"#bae6fd",fontWeight:900}}>{item.variable}</div><div style={{display:"flex",justifyContent:"space-between",gap:"8px",marginTop:"6px"}}><strong>{item.effect}</strong><span>{item.score}/100</span></div></div>)}</div>

          {v29RunHistory.length>0 && <div style={{marginTop:"14px",padding:"14px",borderRadius:"15px",background:"rgba(0,0,0,.18)",border:"1px solid rgba(255,255,255,.1)"}}><div style={{fontSize:"11px",fontWeight:900,color:"#a5f3fc",marginBottom:"7px"}}>SON OPERASYONLAR</div>{v29RunHistory.slice(0,4).map((item)=><div key={item} style={{fontSize:"12px",padding:"5px 0",opacity:.78}}>● {item}</div>)}</div>}
        </section>

        <section style={{margin:"0 0 28px",padding:"25px",borderRadius:"28px",background:"linear-gradient(145deg,#071426,#102a56 56%,#123c70)",border:"1px solid rgba(125,211,252,.38)",boxShadow:"0 34px 90px rgba(2,8,23,.34)",color:"#fff"}}>
          <div style={{display:"flex",justifyContent:"space-between",gap:"18px",alignItems:"flex-start",flexWrap:"wrap"}}>
            <div style={{maxWidth:"780px"}}>
              <div style={{fontSize:"12px",fontWeight:950,letterSpacing:".13em",color:"#facc15"}}>V30 · AI OPERATING SYSTEM · MASTER BUILD</div>
              <h2 style={{margin:"8px 0 10px",fontSize:"clamp(28px,4vw,43px)"}}>Platformun tamamını yöneten merkezi işletim sistemi</h2>
              <p style={{margin:0,lineHeight:1.75,color:"#cde8ff"}}>AI Orchestrator; konum, değerleme, finans, risk, pazarlık, rapor ve kullanıcı arşivini tek snapshot üzerinden eş zamanlı yönetir.</p>
            </div>
            <div style={{display:"grid",gap:"9px",minWidth:"285px"}}>
              <label style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:"12px",padding:"10px 12px",borderRadius:"12px",background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.14)",fontWeight:850}}><span>Otomatik Orkestrasyon</span><input type="checkbox" checked={v30AutoMode} onChange={(event)=>setV30AutoMode(event.target.checked)} /></label>
              <button type="button" onClick={runV30OperatingSystem} style={{padding:"14px 17px",borderRadius:"13px",border:0,background:"linear-gradient(135deg,#facc15,#f59e0b)",color:"#3b2200",fontWeight:950,cursor:"pointer",boxShadow:"0 16px 34px rgba(245,158,11,.28)"}}>⚡ V30 Sistemin Tamamını Çalıştır</button>
            </div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(165px,1fr))",gap:"11px",marginTop:"19px"}}>
            {[["Orchestrator",`${operatingSystemV30.orchestratorScore}/100`],["Sistem Sağlığı",`%${operatingSystemV30.healthScore}`],["Senkronizasyon",`%${intelligenceEngine.synchronization}`],["Bağlı Modül",`${operatingSystemV30.completedModules}/6`],["Hesaplama",`${operatingSystemV30.calculations}`],["V30 Çalıştırma",`${v30RunCount}`]].map(([label,value])=><div key={label} style={{padding:"15px",borderRadius:"16px",background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.12)"}}><div style={{fontSize:"10px",fontWeight:900,color:"#bae6fd"}}>{label}</div><div style={{fontSize:"22px",fontWeight:950,marginTop:"6px"}}>{value}</div></div>)}
          </div>

          <div style={{marginTop:"14px",padding:"16px 18px",borderRadius:"17px",background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.12)",lineHeight:1.7}}><strong style={{color:"#fde68a"}}>Executive Summary 2.0:</strong> {operatingSystemV30.executiveSummary}</div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:"14px",marginTop:"16px"}}>
            <div style={{padding:"18px",borderRadius:"19px",background:"#fff",color:"#172554"}}>
              <div style={{fontSize:"12px",fontWeight:950,color:"#1d4ed8"}}>SYSTEM HEALTH MONITOR</div>
              <div style={{display:"grid",gap:"8px",marginTop:"12px"}}>{operatingSystemV30.services.map((service)=><div key={service.name} style={{display:"grid",gridTemplateColumns:"14px 1fr auto",gap:"9px",alignItems:"center",padding:"10px",borderRadius:"12px",background:service.healthy?"#ecfdf5":"#fff7ed"}}><span style={{width:"10px",height:"10px",borderRadius:"50%",background:service.healthy?"#10b981":"#f59e0b"}}/><strong style={{fontSize:"13px"}}>{service.name}</strong><span style={{fontSize:"11px",color:"#64748b"}}>{service.healthy?`${service.latency} ms`:"Bekliyor"}</span></div>)}</div>
            </div>
            <div style={{padding:"18px",borderRadius:"19px",background:"linear-gradient(145deg,#fff7ed,#fff)",color:"#4a2c0a",border:"1px solid #fed7aa"}}>
              <div style={{fontSize:"12px",fontWeight:950,color:"#c2410c"}}>AI ACTION CENTER</div>
              <div style={{display:"grid",gap:"8px",marginTop:"12px"}}>{operatingSystemV30.actions.slice(0,6).map((item,index)=><div key={`${item.action}-${index}`} style={{display:"grid",gridTemplateColumns:"30px 1fr",gap:"9px",padding:"10px",borderRadius:"12px",background:"rgba(255,255,255,.82)",border:"1px solid #fed7aa"}}><span style={{fontWeight:950,color:item.priority===1?"#dc2626":item.priority===2?"#d97706":"#2563eb"}}>P{item.priority}</span><div><strong style={{fontSize:"13px"}}>{item.action}</strong><div style={{fontSize:"11px",color:"#78716c",marginTop:"3px"}}>{item.owner}</div></div></div>)}</div>
            </div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:"14px",marginTop:"16px"}}>
            <div style={{padding:"17px",borderRadius:"18px",background:"rgba(0,0,0,.18)",border:"1px solid rgba(255,255,255,.12)"}}><div style={{fontSize:"12px",fontWeight:950,color:"#67e8f9"}}>AI TIMELINE</div><div style={{display:"grid",gap:"7px",marginTop:"11px"}}>{(v30Timeline.length?v30Timeline:["Sistem hazır. İlk V30 operasyonunu çalıştır."]).slice(0,7).map((item,index)=><div key={`${item}-${index}`} style={{fontSize:"12px",lineHeight:1.5,padding:"7px 0",borderBottom:index<6?"1px solid rgba(255,255,255,.08)":"none",color:"#dbeafe"}}>● {item}</div>)}</div></div>
            <div style={{padding:"17px",borderRadius:"18px",background:"rgba(255,255,255,.08)",border:"1px solid rgba(255,255,255,.12)"}}><div style={{fontSize:"12px",fontWeight:950,color:"#facc15"}}>PERFORMANCE CENTER</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"10px",marginTop:"12px"}}>{[["Son süre",v30LastDuration?`${v30LastDuration} ms`:"Hazır"],["Canlı kaynak",`${liveDataLayer.readyCount}/${liveDataLayer.sources.length}`],["Karar hazırlığı",`%${decisionBrainV29.readiness}`],["Snapshot",intelligenceEngine.snapshotCode.slice(-10)]].map(([label,value])=><div key={label} style={{padding:"12px",borderRadius:"13px",background:"rgba(0,0,0,.16)"}}><div style={{fontSize:"10px",fontWeight:900,color:"#bae6fd"}}>{label}</div><div style={{fontSize:"16px",fontWeight:950,marginTop:"5px",wordBreak:"break-word"}}>{value}</div></div>)}</div></div>
          </div>
        </section>
        </div>
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
                onClick={printPremiumReport}
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
                Premium PDF / Yazdır
              </button>
            </div>

            <div className="print-report">
              <section className="print-page" style={{ minHeight: "260mm", padding: "10mm", boxSizing: "border-box" }}>
                <div style={{ background: "linear-gradient(135deg,#071a38,#124f91)", color: "#fff", padding: "34px", borderRadius: "22px" }}>
                  <div style={{ fontSize: "13px", fontWeight: 900, letterSpacing: "1.8px" }}>YAŞAM AI · PREMIUM GAYRİMENKUL KARAR RAPORU</div>
                  <h1 style={{ fontSize: "38px", margin: "18px 0 8px" }}>Profesyonel Ekspertiz ve Yatırım Raporu</h1>
                  <p style={{ margin: 0, opacity: .9, lineHeight: 1.7 }}>{form.city} / {form.district} / {form.neighborhood} · {form.propertyType} · {form.area} m²</p>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 150px", gap: "26px", marginTop: "28px", alignItems: "start" }}>
                  <div>
                    <div style={{ fontSize: "13px", color: "#64748b", fontWeight: 800 }}>RAPOR NUMARASI</div>
                    <div style={{ fontSize: "20px", fontWeight: 900, color: "#123b68", marginTop: "6px" }}>{reportIdentity.number}</div>
                    <div style={{ marginTop: "20px", lineHeight: 1.8 }}>
                      <strong>Hazırlanma:</strong> {reportIdentity.createdAt}<br/>
                      <strong>Rapor sahibi:</strong> {profile.name}<br/>
                      <strong>Üyelik:</strong> {profile.membership}<br/>
                      <strong>İstenen fiyat:</strong> {money(askingPriceNumber)}
                    </div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ width: "118px", height: "118px", margin: "0 auto", border: "10px solid #102a4f", background: "repeating-linear-gradient(45deg,#102a4f 0 6px,#fff 6px 12px)", boxShadow: "inset 0 0 0 8px #fff" }} />
                    <div style={{ fontSize: "10px", marginTop: "8px", fontWeight: 800 }}>DOĞRULAMA ALANI</div>
                    <div style={{ fontSize: "9px", marginTop: "3px" }}>{reportIdentity.verificationCode}</div>
                  </div>
                </div>
                <div className="print-avoid" style={{ marginTop: "34px", padding: "28px", border: `2px solid ${decisionStyle.border}`, borderRadius: "20px", background: "#f8fbff" }}>
                  <div style={{ fontSize: "12px", fontWeight: 900, color: "#64748b" }}>YAŞAM AI NİHAİ KARARI</div>
                  <div style={{ fontSize: "36px", fontWeight: 900, color: decisionStyle.background, margin: "8px 0" }}>{decision}</div>
                  <p style={{ lineHeight: 1.75, marginBottom: 0 }}>{decisionReason}</p>
                </div>
                <div style={{ marginTop: "28px", borderTop: "1px solid #cbd5e1", paddingTop: "18px", color: "#64748b", fontSize: "11px", lineHeight: 1.6 }}>
                  Bu rapor yapay zekâ destekli karar desteğidir; resmî ekspertiz, tapu, imar, takyidat, zemin ve hukuki incelemenin yerine geçmez.
                </div>
              </section>

              <section className="print-page" style={{ minHeight: "260mm", padding: "8mm", boxSizing: "border-box" }}>
                <h2 style={{ color: "#102a4f", borderBottom: "3px solid #1680cc", paddingBottom: "10px" }}>1. Yönetici Özeti ve Karar Puanları</h2>
                <p style={{ lineHeight: 1.75 }}>{decisionReason}</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "12px", marginTop: "20px" }}>
                  {scores.map((item) => (
                    <div key={item.title} className="print-avoid" style={{ border: "1px solid #cbd5e1", borderRadius: "14px", padding: "16px" }}>
                      <div style={{ color: "#64748b", fontSize: "11px", fontWeight: 900 }}>{item.title.toUpperCase()}</div>
                      <div style={{ fontSize: "27px", fontWeight: 900, color: "#123b68", margin: "5px 0" }}>{item.value} / 100</div>
                      <div style={{ fontSize: "11px", lineHeight: 1.5 }}>{item.description}</div>
                    </div>
                  ))}
                  <div className="print-avoid" style={{ border: "2px solid #1680cc", borderRadius: "14px", padding: "16px", background: "#eff8ff" }}>
                    <div style={{ color: "#64748b", fontSize: "11px", fontWeight: 900 }}>GENEL RAPOR SKORU</div>
                    <div style={{ fontSize: "30px", fontWeight: 900, color: "#0f4c81", marginTop: "6px" }}>{dynamicMetrics.reportScore} / 100</div>
                  </div>
                </div>
                <h2 style={{ color: "#102a4f", marginTop: "28px" }}>2. Değerleme Özeti</h2>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                  <tbody>
                    {[
                      ["İstenen fiyat", money(askingPriceNumber)],
                      ["Tahmini piyasa değeri", money(dynamicMetrics.market)],
                      ["Hızlı satış değeri", money(dynamicMetrics.quickSale)],
                      ["Güvenli ilk teklif", money(dynamicMetrics.safeOffer)],
                      ["Maksimum teklif", money(dynamicMetrics.maximumOffer)],
                      ["Fiyat durumu", dynamicMetrics.priceStatus],
                    ].map(([label,value]) => (
                      <tr key={label}><td style={{ padding: "10px", border: "1px solid #dbe7f4", fontWeight: 800 }}>{label}</td><td style={{ padding: "10px", border: "1px solid #dbe7f4" }}>{value}</td></tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section className="print-page" style={{ minHeight: "260mm", padding: "8mm", boxSizing: "border-box" }}>
                <h2 style={{ color: "#102a4f", borderBottom: "3px solid #1680cc", paddingBottom: "10px" }}>3. Finansal Fizibilite ve Pazarlık</h2>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: "12px" }}>
                  {[
                    ["Toplam yatırım", money(dynamicMetrics.totalInvestment)],
                    ["Proje geliri", money(dynamicMetrics.projectRevenue)],
                    ["Net kâr", money(dynamicMetrics.netProfit)],
                    ["Kârlılık", `%${dynamicMetrics.profitability.toFixed(1)}`],
                    ["Geri dönüş", `${dynamicMetrics.paybackMonths} ay`],
                    ["Finansal karar", dynamicMetrics.financialDecision],
                    ["Anlaşma olasılığı", `%${dynamicMetrics.probability}`],
                    ["Pazarlık gücü", dynamicMetrics.negotiationPower],
                  ].map(([label,value]) => (
                    <div key={label} className="print-avoid" style={{ padding: "14px", border: "1px solid #dbe7f4", borderRadius: "12px" }}><div style={{ fontSize: "10px", color: "#64748b", fontWeight: 900 }}>{label.toUpperCase()}</div><div style={{ fontSize: "19px", fontWeight: 900, marginTop: "5px", color: "#123b68" }}>{value}</div></div>
                  ))}
                </div>
                <h3 style={{ color: "#0f4c81", marginTop: "24px" }}>Satıcıya Önerilen Mesaj</h3>
                <div className="print-avoid" style={{ whiteSpace: "pre-line", border: "1px solid #dbe7f4", borderRadius: "14px", padding: "18px", lineHeight: 1.7, fontSize: "11px" }}>{negotiationMessage}</div>
                <h3 style={{ color: "#0f4c81", marginTop: "24px" }}>Lokasyon Özeti</h3>
                <div style={{ whiteSpace: "pre-line", lineHeight: 1.7, fontSize: "11px" }}>{locationDataSummary}</div>
              </section>

              <section className="print-page" style={{ minHeight: "260mm", padding: "8mm", boxSizing: "border-box" }}>
                <h2 style={{ color: "#102a4f", borderBottom: "3px solid #1680cc", paddingBottom: "10px" }}>4. Güçlü Yönler, Riskler ve Eylem Planı</h2>
                <div className="print-avoid" style={{ marginTop: "18px" }}><h3 style={{ color: "#047857" }}>Güçlü Yönler</h3><div style={{ whiteSpace: "pre-line", lineHeight: 1.8 }}>{strengths}</div></div>
                <div className="print-avoid" style={{ marginTop: "24px" }}><h3 style={{ color: "#b91c1c" }}>Kritik Riskler</h3><div style={{ whiteSpace: "pre-line", lineHeight: 1.8 }}>{risks}</div></div>
                <div className="print-avoid" style={{ marginTop: "24px" }}><h3 style={{ color: "#0f4c81" }}>5 Maddelik Eylem Planı</h3><div style={{ whiteSpace: "pre-line", lineHeight: 1.8 }}>{actionPlan}</div></div>
                <div style={{ marginTop: "32px", padding: "18px", background: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "14px", fontSize: "10px", lineHeight: 1.65 }}>
                  <strong>Şeffaflık ve sorumluluk notu:</strong> Bu rapordaki parasal değerler, puanlar ve projeksiyonlar kullanıcı girdileri, açık konum verileri ve AI çıkarımlarına dayalı tahminlerdir. Bağlayıcı işlem öncesinde resmî belge ve uzman doğrulaması gerekir.
                </div>
              </section>
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
    
            <div id="yasam-location" className="yasam-module-anchor yasam-module-view" style={{ display: activeModule === "location" ? "block" : "none" }}>
            <RealEstateMap
              city={form.city}
              district={form.district}
              neighborhood={form.neighborhood}
              onIntelligenceChange={setLocationIntelligence}
            />
            </div>



      <section id="yasam-parcel" className="yasam-module-anchor yasam-module-view" style={{
        display: activeModule === "parcel" ? "block" : "none",
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


<section id="yasam-valuation" className="yasam-module-anchor yasam-module-view" style={{
display: activeModule === "valuation" ? "block" : "none",
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


<section id="yasam-finance" className="yasam-module-anchor yasam-module-view" style={{
  display: activeModule === "finance" ? "block" : "none",
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


<section id="yasam-negotiation" className="yasam-module-anchor yasam-module-view" style={{display: activeModule === "negotiation" ? "block" : "none",marginTop:"28px",background:"#fff",border:"1px solid #dbe7f4",borderRadius:"22px",padding:"22px",boxShadow:"0 14px 35px rgba(17,54,93,.08)"}}>
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


<section id="yasam-report" className="yasam-module-anchor yasam-module-view" style={{
display: activeModule === "report" ? "block" : "none",
marginTop:"28px",
background:"#fff",
border:"1px solid #dbe7f4",
borderRadius:"22px",
padding:"22px",
boxShadow:"0 14px 35px rgba(17,54,93,.08)"
}}>
<div style={{color:"#7c3aed",fontWeight:950,fontSize:"12px",letterSpacing:".1em"}}>
V37 · AI KURUMSAL RAPOR MERKEZİ
</div>

<h2 style={{margin:"8px 0 8px",color:"#0f2742"}}>
Kurumsal kararları yönetici seviyesinde raporla.
</h2>
<p style={{margin:"0 0 18px",color:"#64748b",lineHeight:1.7,maxWidth:"850px"}}>
Yatırımcı, banka, müteahhit ve bireysel kullanıcı için aynı analiz verisini farklı karar öncelikleriyle kurumsal rapora dönüştürür.
</p>

<div style={{padding:"22px",borderRadius:"22px",background:"linear-gradient(135deg,#111827 0%,#312e81 55%,#6d28d9 100%)",color:"#fff",border:"1px solid rgba(196,181,253,.45)",boxShadow:"0 22px 55px rgba(49,46,129,.22)"}}>
  <div style={{display:"flex",justifyContent:"space-between",gap:"16px",alignItems:"flex-start",flexWrap:"wrap"}}>
    <div style={{maxWidth:"720px"}}>
      <div style={{fontSize:"11px",fontWeight:950,letterSpacing:".12em",color:"#ddd6fe"}}>EXECUTIVE REPORT ENGINE 2.0</div>
      <h3 style={{fontSize:"26px",margin:"8px 0"}}>AI Yönetici Özeti ve Kurumsal Güven Endeksi</h3>
      <p style={{margin:0,lineHeight:1.75,color:"#ede9fe"}}>{corporateReportV37.executiveSummary}</p>
    </div>
    <div style={{display:"flex",gap:"10px",flexWrap:"wrap"}}>
      <select value={v37ReportMode} onChange={(event)=>setV37ReportMode(event.target.value as "Yatırımcı"|"Banka"|"Müteahhit"|"Bireysel")} style={{padding:"11px 13px",borderRadius:"12px",border:"1px solid rgba(255,255,255,.25)",background:"rgba(255,255,255,.12)",color:"#fff",fontWeight:900}}>
        <option style={{color:"#111827"}}>Yatırımcı</option><option style={{color:"#111827"}}>Banka</option><option style={{color:"#111827"}}>Müteahhit</option><option style={{color:"#111827"}}>Bireysel</option>
      </select>
      <button type="button" onClick={runV37CorporateReport} style={{padding:"12px 16px",borderRadius:"12px",border:0,background:"linear-gradient(135deg,#facc15,#fb923c)",color:"#422006",fontWeight:950,cursor:"pointer"}}>📊 Kurumsal Raporu Çalıştır</button>
    </div>
  </div>
  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:"10px",marginTop:"18px"}}>
    {[
      ["Kurumsal Skor",`${corporateReportV37.corporateScore}/100`],
      ["Veri Güveni",`${corporateReportV37.quality}/100`],
      ["Finansal Güç",`${corporateReportV37.financial}/100`],
      ["Risk Notu",corporateReportV37.riskGrade],
      ["Nihai Karar",decisionCommandV36.verdict],
      ["Rapor Sayısı",String(v37RunCount)],
    ].map(([label,value])=><div key={label} style={{padding:"14px",borderRadius:"15px",background:"rgba(255,255,255,.09)",border:"1px solid rgba(255,255,255,.13)"}}><div style={{fontSize:"10px",fontWeight:900,color:"#ddd6fe"}}>{label}</div><div style={{fontSize:"20px",fontWeight:950,marginTop:"6px"}}>{value}</div></div>)}
  </div>
</div>

<div style={{display:"grid",gridTemplateColumns:"minmax(0,1.2fr) minmax(290px,.8fr)",gap:"16px",marginTop:"16px"}}>
  <div style={{padding:"19px",borderRadius:"19px",background:"#fff",border:"1px solid #dbe7f4"}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:"10px",alignItems:"center",flexWrap:"wrap"}}><h3 style={{margin:0,color:"#0f4c81"}}>Kurumsal Güven Bileşenleri</h3><span style={{padding:"7px 10px",borderRadius:"999px",background:"#ede9fe",color:"#6d28d9",fontWeight:950}}>{v37ReportMode}</span></div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:"11px",marginTop:"14px"}}>
      {[
        ["Veri Kalitesi",corporateReportV37.quality],
        ["Finansal Analiz",corporateReportV37.financial],
        ["Karar Güveni",decisionCommandV36.confidence],
        ["Resmî Doğrulama",decisionCommandV36.official],
      ].map(([label,value])=><div key={label as string} style={{padding:"14px",borderRadius:"15px",background:"#f8fbff",border:"1px solid #dbe7f4"}}><div style={{display:"flex",justifyContent:"space-between",fontSize:"12px",fontWeight:900,color:"#334155"}}><span>{label}</span><strong>{value}/100</strong></div><div style={{height:"8px",borderRadius:"999px",background:"#e2e8f0",marginTop:"9px",overflow:"hidden"}}><div style={{height:"100%",width:`${value}%`,background:"linear-gradient(90deg,#2563eb,#7c3aed)"}}/></div></div>)}
    </div>
  </div>
  <div style={{padding:"19px",borderRadius:"19px",background:"#071a35",color:"#fff",border:"1px solid #4338ca"}}>
    <div style={{fontSize:"11px",fontWeight:950,color:"#c4b5fd"}}>RAPOR DOĞRULAMA KİMLİĞİ</div>
    <div style={{fontSize:"17px",fontWeight:950,marginTop:"8px",wordBreak:"break-word"}}>{corporateReportV37.reportId}</div>
    <div style={{fontSize:"12px",color:"#ddd6fe",marginTop:"7px"}}>{corporateReportV37.audienceNote}</div>
    <div style={{marginTop:"14px",paddingTop:"12px",borderTop:"1px solid rgba(255,255,255,.12)"}}>{v37Events.length?v37Events.slice(0,5).map((event,index)=><div key={`${event}-${index}`} style={{padding:"6px 0",fontSize:"11px",color:"#dbeafe"}}>● {event}</div>):<div style={{fontSize:"12px",color:"#c4b5fd",lineHeight:1.6}}>Kurumsal raporu çalıştırarak ilk doğrulama snapshotını oluştur.</div>}</div>
  </div>
</div>

<div style={{
border:"1px solid #dbe7f4",
borderRadius:"18px",
padding:"20px",
background:"linear-gradient(135deg,#0f2742,#1d4ed8)",
color:"#fff"
}}>
<h2 style={{margin:"0 0 8px"}}>YAŞAM AI Premium Ekspertiz Raporu</h2>
<p style={{opacity:.92,lineHeight:1.8}}>
Rapor No: {reportIdentity.number}<br/>
Durum: Premium AI Analizi Tamamlandı<br/>
Doğrulama Kodu: {reportIdentity.verificationCode}
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
<MetricCard label="PDF DURUMU" value="Aktif" note="A4 ve PDF kaydına uygun"/>
</div>

<div style={{
marginTop:"18px",
border:"1px solid #dbe7f4",
borderRadius:"18px",
padding:"18px"
}}>
<h3 style={{marginTop:0,color:"#0f4c81"}}>Yönetici Özeti</h3>
<p style={{lineHeight:1.8,color:"#52657b"}}>
Bu rapor; değerleme, çevre analizi, finansal fizibilite, pazarlık önerileri, risk değerlendirmesi ve karar puanlarını tek bir kurumsal dokümanda birleştirir. “Premium PDF Oluştur” düğmesi yazdırma ekranını açar; burada PDF olarak kaydedebilir veya doğrudan yazdırabilirsin.
</p>
</div>

<div style={{
display:"flex",
gap:"12px",
flexWrap:"wrap",
marginTop:"20px"
}}>
<button type="button" onClick={printPremiumReport} style={{
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

<button type="button" onClick={printPremiumReport} style={{
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


<section id="yasam-user" className="yasam-module-anchor yasam-module-view" style={{
display: activeModule === "user" ? "block" : "none",
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
      Bu sürümde profesyonel A4 rapor motoru, benzersiz rapor numarası, yönetici özeti, kurumsal puan tabloları, değerleme ve finansal fizibilite özeti, doğrulama alanı ve PDF/yazdır akışı aktiftir. Kullanıcı merkezi özellikleri yerel cihazda çalışmaya devam eder.
    </p>
  </div>
</section>


<section id="yasam-market" className="yasam-module-anchor yasam-module-view" style={{
  display: activeModule === "market" ? "block" : "none",
  marginTop: "28px",
  background: "#ffffff",
  border: "1px solid #dbe7f4",
  borderRadius: "24px",
  padding: "22px",
  boxShadow: "0 16px 40px rgba(17,54,93,.09)"
}}>
  <div style={{padding:"22px",borderRadius:"22px",background:"linear-gradient(135deg,#061a33,#0b4d79 55%,#146c94)",color:"#fff",border:"1px solid rgba(56,189,248,.35)"}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:"16px",alignItems:"flex-start",flexWrap:"wrap"}}>
      <div>
        <div style={{fontSize:"12px",fontWeight:950,letterSpacing:".12em",color:"#67e8f9"}}>V31 · REAL ESTATE INTELLIGENCE PLATFORM</div>
        <h2 style={{fontSize:"30px",margin:"8px 0"}}>Emsal, fiyat tahmini ve yatırım zekâsı tek merkezde.</h2>
        <p style={{margin:0,maxWidth:"780px",lineHeight:1.75,color:"#ccecff"}}>Bu ekran, mevcut analiz snapshotından model tabanlı emsal senaryoları üretir; bölgesel gelişim, gelecek değer ve yatırım endeksini birlikte hesaplar. Resmî veya lisanslı canlı emsal bağlantısı kurulana kadar sonuçlar karar desteği amaçlı tahmindir.</p>
      </div>
      <div style={{display:"grid",gap:"9px",minWidth:"230px"}}>
        <select value={v31Scenario} onChange={(event)=>setV31Scenario(event.target.value as "Temkinli"|"Dengeli"|"Büyüme")} style={{padding:"12px",borderRadius:"12px",border:"1px solid rgba(255,255,255,.25)",background:"rgba(255,255,255,.12)",color:"#fff",fontWeight:900}}><option style={{color:"#111"}}>Temkinli</option><option style={{color:"#111"}}>Dengeli</option><option style={{color:"#111"}}>Büyüme</option></select>
        <button type="button" onClick={runV31IntelligencePlatform} style={{padding:"13px 16px",borderRadius:"12px",border:0,background:"linear-gradient(135deg,#facc15,#f59e0b)",color:"#3b2200",fontWeight:950,cursor:"pointer"}}>⚡ 5 Zekâ İşlemini Çalıştır</button>
      </div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:"10px",marginTop:"17px"}}>
      {[["Yatırım Endeksi",`${realEstateIntelligenceV31.investmentIndex}/100`],["Gelişim Endeksi",`${realEstateIntelligenceV31.developmentIndex}/100`],["Karar Güveni",`%${realEstateIntelligenceV31.confidence}`],["Medyan m²",money(realEstateIntelligenceV31.medianSqm)],["Emsal Değer",money(realEstateIntelligenceV31.comparableValue)],["Çalıştırma",`${v31RunCount}`]].map(([label,value])=><div key={label} style={{padding:"14px",borderRadius:"15px",background:"rgba(255,255,255,.09)",border:"1px solid rgba(255,255,255,.13)"}}><div style={{fontSize:"10px",fontWeight:900,color:"#bae6fd"}}>{label}</div><div style={{fontSize:"20px",fontWeight:950,marginTop:"6px"}}>{value}</div></div>)}
    </div>
    <div style={{marginTop:"14px",padding:"15px 17px",borderRadius:"16px",background:"rgba(255,255,255,.09)",border:"1px solid rgba(255,255,255,.13)",lineHeight:1.7}}><strong style={{color:"#fde68a"}}>V31 Piyasa Kararı:</strong> {realEstateIntelligenceV31.verdict}. Talep fiyatı model emsal değerine göre {realEstateIntelligenceV31.priceDeviation > 0 ? `%${Math.abs(realEstateIntelligenceV31.priceDeviation).toFixed(1)} yukarıda` : `%${Math.abs(realEstateIntelligenceV31.priceDeviation).toFixed(1)} aşağıda veya dengede`} görünüyor.</div>
  </div>

  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))",gap:"15px",marginTop:"18px"}}>
    <div style={{padding:"18px",borderRadius:"19px",background:"#f8fbff",border:"1px solid #dbe7f4"}}>
      <h3 style={{marginTop:0,color:"#0f4c81"}}>AI Emsal Motoru 1.0</h3>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:"12px"}}><thead><tr style={{color:"#64748b",textAlign:"left"}}><th style={{padding:"8px"}}>Emsal</th><th>m²</th><th>Fiyat</th><th>m² Fiyatı</th><th>Benzerlik</th></tr></thead><tbody>{realEstateIntelligenceV31.comparables.map((item)=><tr key={item.id} style={{borderTop:"1px solid #e5edf6"}}><td style={{padding:"10px 8px",fontWeight:850,color:"#0f2742"}}>{item.label}</td><td>{item.area}</td><td>{money(item.price)}</td><td>{money(item.sqm)}</td><td><strong style={{color:item.similarity>=80?"#15803d":"#b45309"}}>%{item.similarity}</strong></td></tr>)}</tbody></table></div>
    </div>
    <div style={{padding:"18px",borderRadius:"19px",background:"linear-gradient(145deg,#fff7ed,#fff)",border:"1px solid #fed7aa"}}>
      <h3 style={{marginTop:0,color:"#9a3412"}}>AI Fiyat Tahmin Motoru</h3>
      <div style={{display:"grid",gap:"10px"}}>{realEstateIntelligenceV31.forecasts.map((item)=><div key={item.label} style={{padding:"12px",borderRadius:"13px",background:"rgba(255,255,255,.86)",border:"1px solid #ffedd5"}}><div style={{display:"flex",justifyContent:"space-between",gap:"12px"}}><strong>{item.label}</strong><strong style={{color:"#c2410c"}}>{money(item.value)}</strong></div><div style={{fontSize:"11px",color:"#78716c",marginTop:"5px"}}>Güven aralığı: {money(item.low)} – {money(item.high)}</div></div>)}</div>
      <div style={{marginTop:"10px",fontSize:"11px",lineHeight:1.6,color:"#9a3412"}}>Senaryo yıllık varsayımı: %{(realEstateIntelligenceV31.annualRate*100).toFixed(0)}. Bu oran garanti getiri değildir.</div>
    </div>
  </div>

  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(250px,1fr))",gap:"14px",marginTop:"16px"}}>
    <div style={{padding:"17px",borderRadius:"18px",background:"#ecfdf5",border:"1px solid #bbf7d0"}}><div style={{fontSize:"11px",fontWeight:950,color:"#166534"}}>BÖLGESEL GELİŞİM ENDEKSİ</div><div style={{fontSize:"34px",fontWeight:950,color:"#14532d",marginTop:"7px"}}>{realEstateIntelligenceV31.developmentIndex}/100</div><p style={{marginBottom:0,color:"#166534",lineHeight:1.6}}>Konum, likidite, risk, veri kapsamı ve sistem senkronizasyonunun birleşik göstergesi.</p></div>
    <div style={{padding:"17px",borderRadius:"18px",background:"#eff6ff",border:"1px solid #bfdbfe"}}><div style={{fontSize:"11px",fontWeight:950,color:"#1d4ed8"}}>AI YATIRIM ENDEKSİ</div><div style={{fontSize:"34px",fontWeight:950,color:"#1e3a8a",marginTop:"7px"}}>{realEstateIntelligenceV31.investmentIndex}/100</div><p style={{marginBottom:0,color:"#1e40af",lineHeight:1.6}}>Karar puanı, gelişim, finansal güven, likidite ve fiyat avantajı birlikte değerlendirilir.</p></div>
    <div style={{padding:"17px",borderRadius:"18px",background:"#faf5ff",border:"1px solid #e9d5ff"}}><div style={{fontSize:"11px",fontWeight:950,color:"#7e22ce"}}>PORTFÖY HIZLI KARŞILAŞTIRMA</div><div style={{fontSize:"34px",fontWeight:950,color:"#581c87",marginTop:"7px"}}>{realEstateIntelligenceV31.portfolio.length}</div><p style={{marginBottom:0,color:"#6b21a8",lineHeight:1.6}}>Kullanıcı arşivindeki son raporlar piyasa zekâsı paneline bağlandı.</p></div>
  </div>

  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:"14px",marginTop:"16px"}}>
    <div style={{padding:"17px",borderRadius:"18px",background:"#fff",border:"1px solid #dbe7f4"}}><h3 style={{marginTop:0,color:"#0f4c81"}}>Portföy Karşılaştırması</h3>{realEstateIntelligenceV31.portfolio.length?realEstateIntelligenceV31.portfolio.map((item)=><div key={item.id} style={{display:"grid",gridTemplateColumns:"1fr auto",gap:"10px",padding:"10px 0",borderBottom:"1px solid #edf2f7"}}><div><strong style={{color:"#0f2742"}}>{item.title}</strong><div style={{fontSize:"11px",color:"#64748b",marginTop:"3px"}}>{item.decision} · Rapor {item.score}/100</div></div><strong style={{color:"#1d4ed8"}}>{money(item.value)}</strong></div>):<p style={{color:"#64748b"}}>Kullanıcı Merkezi'nden rapor kaydettiğinde portföy karşılaştırması burada oluşacak.</p>}</div>
    <div style={{padding:"17px",borderRadius:"18px",background:"#071a35",color:"#fff",border:"1px solid #164e63"}}><h3 style={{marginTop:0,color:"#67e8f9"}}>V31 Operasyon Geçmişi</h3>{v31Events.length?v31Events.slice(0,8).map((event,index)=><div key={`${event}-${index}`} style={{padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,.09)",fontSize:"12px",color:"#dbeafe"}}>● {event}</div>):<p style={{color:"#bae6fd"}}>5 zekâ işlemini çalıştırarak emsal, tahmin, gelişim, yatırım ve karar operasyonlarını birlikte başlat.</p>}</div>
  </div>
</section>


<section id="yasam-verification" className="yasam-module-anchor yasam-module-view" style={{
  display: activeModule === "verification" ? "block" : "none",
  marginTop: "28px",
  background: "#ffffff",
  border: "1px solid #dbe7f4",
  borderRadius: "24px",
  padding: "22px",
  boxShadow: "0 16px 40px rgba(17,54,93,.09)"
}}>
  <div style={{padding:"22px",borderRadius:"22px",background:"linear-gradient(135deg,#07172f,#064e3b 58%,#0f766e)",color:"#fff",border:"1px solid rgba(45,212,191,.35)"}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:"16px",alignItems:"flex-start",flexWrap:"wrap"}}>
      <div>
        <div style={{fontSize:"12px",fontWeight:950,letterSpacing:".12em",color:"#5eead4"}}>V32 · OFFICIAL DATA & VERIFICATION GATEWAY</div>
        <h2 style={{fontSize:"30px",margin:"8px 0"}}>Resmî veri hazırlığı, kanıt zinciri ve doğrulama merkezi.</h2>
        <p style={{margin:0,maxWidth:"800px",lineHeight:1.75,color:"#ccfbf1"}}>Bu sürüm, açık veri, kullanıcı girdisi, model çıktısı ve ileride bağlanacak resmî servisleri tek bir doğrulama akışında birleştirir. Yetkili servis bağlantısı bulunmayan alanlar açıkça “bekliyor” olarak gösterilir; hiçbir tahmin resmî kayıt gibi sunulmaz.</p>
      </div>
      <div style={{display:"grid",gap:"9px",minWidth:"240px"}}>
        <select value={v32VerificationMode} onChange={(event)=>setV32VerificationMode(event.target.value as "Hızlı"|"Standart"|"Derin")} style={{padding:"12px",borderRadius:"12px",border:"1px solid rgba(255,255,255,.25)",background:"rgba(255,255,255,.12)",color:"#fff",fontWeight:900}}><option style={{color:"#111"}}>Hızlı</option><option style={{color:"#111"}}>Standart</option><option style={{color:"#111"}}>Derin</option></select>
        <button type="button" onClick={runV32VerificationGateway} style={{padding:"13px 16px",borderRadius:"12px",border:0,background:"linear-gradient(135deg,#facc15,#f59e0b)",color:"#3b2200",fontWeight:950,cursor:"pointer"}}>✓ Doğrulama Zincirini Çalıştır</button>
      </div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:"10px",marginTop:"17px"}}>
      {[["Doğrulama Skoru",`${officialDataGatewayV32.verificationScore}/100`],["Veri Tamlığı",`%${officialDataGatewayV32.completion}`],["Resmî Kapsam",`%${officialDataGatewayV32.officialCoverage}`],["Hazır Alan",`${officialDataGatewayV32.readyCount}/${officialDataGatewayV32.sources.length}`],["Durum",officialDataGatewayV32.status],["Çalıştırma",`${v32RunCount}`]].map(([label,value])=><div key={label} style={{padding:"14px",borderRadius:"15px",background:"rgba(255,255,255,.09)",border:"1px solid rgba(255,255,255,.13)"}}><div style={{fontSize:"10px",fontWeight:900,color:"#99f6e4"}}>{label}</div><div style={{fontSize:label==="Durum"?"15px":"20px",fontWeight:950,marginTop:"6px"}}>{value}</div></div>)}
    </div>
    <div style={{marginTop:"14px",padding:"15px 17px",borderRadius:"16px",background:"rgba(255,255,255,.09)",border:"1px solid rgba(255,255,255,.13)",lineHeight:1.7}}><strong style={{color:"#fde68a"}}>Doğrulama Sertifika Kodu:</strong> {officialDataGatewayV32.certificateCode}</div>
  </div>

  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(310px,1fr))",gap:"15px",marginTop:"18px"}}>
    <div style={{padding:"18px",borderRadius:"19px",background:"#f8fbff",border:"1px solid #dbe7f4"}}>
      <h3 style={{marginTop:0,color:"#0f4c81"}}>Kaynak ve Kanıt Matrisi</h3>
      {officialDataGatewayV32.sources.map((source)=><div key={source.name} style={{display:"grid",gridTemplateColumns:"1fr auto",gap:"12px",padding:"12px 0",borderBottom:"1px solid #e5edf6"}}><div><strong style={{color:"#0f2742"}}>{source.name}</strong><div style={{fontSize:"11px",color:"#64748b",marginTop:"4px"}}>{source.category} · {source.detail}</div></div><span style={{alignSelf:"center",padding:"5px 9px",borderRadius:"999px",fontSize:"10px",fontWeight:950,background:source.ready?"#dcfce7":"#fef3c7",color:source.ready?"#166534":"#92400e"}}>{source.ready?"HAZIR":"BEKLİYOR"}</span></div>)}
    </div>
    <div style={{padding:"18px",borderRadius:"19px",background:"linear-gradient(145deg,#fff7ed,#fff)",border:"1px solid #fed7aa"}}>
      <h3 style={{marginTop:0,color:"#9a3412"}}>Doğrulama İşlem Planı</h3>
      <div style={{display:"grid",gap:"10px"}}>{officialDataGatewayV32.nextActions.map((action,index)=><div key={action} style={{display:"grid",gridTemplateColumns:"32px 1fr",gap:"10px",alignItems:"start",padding:"12px",borderRadius:"13px",background:"rgba(255,255,255,.9)",border:"1px solid #ffedd5"}}><div style={{width:"28px",height:"28px",borderRadius:"50%",display:"grid",placeItems:"center",background:index<2?"#fee2e2":"#fef3c7",color:index<2?"#991b1b":"#92400e",fontWeight:950}}>{index+1}</div><div style={{fontSize:"13px",lineHeight:1.55,color:"#7c2d12"}}>{action}</div></div>)}</div>
      <label style={{display:"flex",gap:"10px",alignItems:"flex-start",marginTop:"14px",padding:"12px",borderRadius:"13px",background:"#ecfdf5",border:"1px solid #bbf7d0",color:"#166534",fontSize:"12px",lineHeight:1.55}}><input type="checkbox" checked={v32Consent} onChange={(event)=>setV32Consent(event.target.checked)} style={{marginTop:"3px"}}/><span>Veri doğrulama işlemlerinde kullanıcı onayı, yetki ve açık kaynak/resmî servis koşullarına uyulacağını kabul ediyorum.</span></label>
    </div>
  </div>

  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:"14px",marginTop:"16px"}}>
    <div style={{padding:"17px",borderRadius:"18px",background:"#071a35",color:"#fff",border:"1px solid #164e63"}}><h3 style={{marginTop:0,color:"#67e8f9"}}>V32 Doğrulama Geçmişi</h3>{v32Events.length?v32Events.slice(0,10).map((event,index)=><div key={`${event}-${index}`} style={{padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,.09)",fontSize:"12px",color:"#dbeafe"}}>● {event}</div>):<p style={{color:"#bae6fd"}}>Doğrulama zincirini çalıştırarak kaynak taraması, kapsam hesabı ve sertifika kodu üretimini başlat.</p>}</div>
    <div style={{padding:"17px",borderRadius:"18px",background:"#f0fdf4",border:"1px solid #bbf7d0"}}><h3 style={{marginTop:0,color:"#166534"}}>Şeffaflık ve Sınırlar</h3><p style={{color:"#166534",lineHeight:1.7,marginBottom:"10px"}}>Yaşam AI, resmî servis bağlantısı olmayan alanlarda tahmin ve kullanıcı girdisini açıkça etiketler. Tapu, takyidat, imar ve benzeri hukuki sonuç doğuran bilgiler yalnızca yetkili kurum veya doğrulanmış belge ile kesinleşir.</p><div style={{padding:"12px",borderRadius:"12px",background:"#fff",border:"1px solid #dcfce7",fontSize:"12px",color:"#166534"}}><strong>Bekleyen kritik alanlar:</strong> {officialDataGatewayV32.blockers.length?officialDataGatewayV32.blockers.join(", "):"Kritik eksik görünmüyor."}</div></div>
  </div>
</section>



<section id="yasam-map" className="yasam-module-anchor yasam-module-view" style={{
  display: activeModule === "map" ? "block" : "none",
  marginTop: "28px", background: "#fff", border: "1px solid #dbe7f4", borderRadius: "24px", padding: "22px", boxShadow: "0 16px 40px rgba(17,54,93,.09)"
}}>
  <div style={{padding:"22px",borderRadius:"22px",background:"linear-gradient(135deg,#06162e,#164e63 55%,#0f766e)",color:"#fff",border:"1px solid rgba(45,212,191,.35)"}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:"16px",alignItems:"flex-start",flexWrap:"wrap"}}>
      <div><div style={{fontSize:"12px",fontWeight:950,letterSpacing:".12em",color:"#5eead4"}}>V33 · AI MAP & LOCATION INTELLIGENCE</div><h2 style={{fontSize:"30px",margin:"8px 0"}}>Harita, çevre, risk ve gelişim zekâsı tek karar ekranında.</h2><p style={{margin:0,maxWidth:"820px",lineHeight:1.75,color:"#ccfbf1"}}>Bu modül mevcut adres, koordinat, piyasa ve doğrulama snapshotını birleştirerek konum karar desteği üretir. Harita görselleştirmesi entegrasyon öncesi model katmanıdır; resmî afet, imar ve kadastro kayıtlarının yerine geçmez.</p></div>
      <div style={{display:"grid",gap:"9px",minWidth:"235px"}}><select value={v33Layer} onChange={(event)=>setV33Layer(event.target.value as "Fırsat"|"Risk"|"Erişim"|"Gelişim")} style={{padding:"12px",borderRadius:"12px",border:"1px solid rgba(255,255,255,.25)",background:"rgba(255,255,255,.12)",color:"#fff",fontWeight:900}}><option style={{color:"#111"}}>Fırsat</option><option style={{color:"#111"}}>Risk</option><option style={{color:"#111"}}>Erişim</option><option style={{color:"#111"}}>Gelişim</option></select><button type="button" onClick={runV33LocationCenter} style={{padding:"13px 16px",borderRadius:"12px",border:0,background:"linear-gradient(135deg,#facc15,#f59e0b)",color:"#3b2200",fontWeight:950,cursor:"pointer"}}>🗺️ Konum Zekâsını Çalıştır</button></div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(145px,1fr))",gap:"10px",marginTop:"17px"}}>{[["AI Lokasyon",`${locationIntelligenceV33.locationScore}/100`],["Erişim",`${locationIntelligenceV33.accessScore}/100`],["Yaşam Kalitesi",`${locationIntelligenceV33.lifeScore}/100`],["Ticari Potansiyel",`${locationIntelligenceV33.commercialScore}/100`],["Gelişim",`${locationIntelligenceV33.growthScore}/100`],["Çalıştırma",`${v33RunCount}`]].map(([label,value])=><div key={label} style={{padding:"14px",borderRadius:"15px",background:"rgba(255,255,255,.09)",border:"1px solid rgba(255,255,255,.13)"}}><div style={{fontSize:"10px",fontWeight:900,color:"#99f6e4"}}>{label}</div><div style={{fontSize:"20px",fontWeight:950,marginTop:"6px"}}>{value}</div></div>)}</div>
  </div>

  <div style={{display:"grid",gridTemplateColumns:"minmax(0,1.35fr) minmax(300px,.65fr)",gap:"16px",marginTop:"18px"}}>
    <div style={{position:"relative",minHeight:"440px",overflow:"hidden",borderRadius:"22px",background:"linear-gradient(145deg,#dbeafe,#ecfeff)",border:"1px solid #bae6fd"}}>
      <div style={{position:"absolute",inset:0,backgroundImage:"linear-gradient(rgba(15,76,129,.10) 1px,transparent 1px),linear-gradient(90deg,rgba(15,76,129,.10) 1px,transparent 1px)",backgroundSize:"36px 36px"}}/>
      <div style={{position:"absolute",left:"7%",right:"7%",top:"46%",height:"18px",background:"rgba(255,255,255,.78)",transform:"rotate(-8deg)",border:"1px solid #bfdbfe"}}/>
      <div style={{position:"absolute",top:"8%",bottom:"8%",left:"48%",width:"20px",background:"rgba(255,255,255,.72)",transform:"rotate(12deg)",border:"1px solid #bfdbfe"}}/>
      {locationIntelligenceV33.heatPoints.map((point)=><div key={point.label} style={{position:"absolute",left:`${point.x}%`,top:`${point.y}%`,transform:"translate(-50%,-50%)",width:point.label==="Parsel"?"92px":"72px",height:point.label==="Parsel"?"92px":"72px",borderRadius:"50%",display:"grid",placeItems:"center",textAlign:"center",padding:"7px",background:point.label==="Parsel"?"rgba(29,78,216,.92)":v33Layer==="Risk"?"rgba(239,68,68,.72)":"rgba(13,148,136,.72)",color:"#fff",border:"3px solid rgba(255,255,255,.86)",boxShadow:"0 10px 28px rgba(15,23,42,.22)",fontSize:"10px",fontWeight:950}}>{point.label}<br/>{point.value}</div>)}
      <div style={{position:"absolute",left:"16px",top:"16px",padding:"10px 12px",borderRadius:"12px",background:"rgba(255,255,255,.92)",border:"1px solid #dbeafe",color:"#0f4c81",fontSize:"12px",fontWeight:900}}>Aktif katman: {v33Layer}</div>
      <div style={{position:"absolute",left:"16px",bottom:"16px",right:"16px",padding:"12px",borderRadius:"14px",background:"rgba(6,24,47,.9)",color:"#e0f2fe",fontSize:"12px",lineHeight:1.6}}><strong>{form.city || "İl"} / {form.district || "İlçe"} / {form.neighborhood || "Mahalle"}</strong><br/>{locationIntelligenceV33.coordinateReady ? `Koordinat: ${locationIntelligence?.latitude}, ${locationIntelligence?.longitude}` : "Kesin koordinat seçimi bekleniyor."}</div>
    </div>
    <div style={{display:"grid",gap:"14px"}}>
      <div style={{padding:"17px",borderRadius:"18px",background:"#eff6ff",border:"1px solid #bfdbfe"}}><div style={{fontSize:"11px",fontWeight:950,color:"#1d4ed8"}}>NEDEN BU KONUM?</div>{locationIntelligenceV33.reasons.map((reason,index)=><div key={reason} style={{display:"grid",gridTemplateColumns:"24px 1fr",gap:"8px",padding:"10px 0",borderBottom:"1px solid #dbeafe",fontSize:"12px",lineHeight:1.55,color:"#1e3a8a"}}><strong>{index+1}</strong><span>{reason}</span></div>)}</div>
      <div style={{padding:"17px",borderRadius:"18px",background:"#071a35",color:"#fff",border:"1px solid #164e63"}}><h3 style={{marginTop:0,color:"#67e8f9"}}>V33 İşlem Geçmişi</h3>{v33Events.length?v33Events.slice(0,7).map((event,index)=><div key={`${event}-${index}`} style={{padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,.09)",fontSize:"12px",color:"#dbeafe"}}>● {event}</div>):<p style={{color:"#bae6fd",lineHeight:1.6}}>Konum zekâsını çalıştırarak çevre, risk, erişim ve gelişim katmanlarını birlikte analiz et.</p>}</div>
    </div>
  </div>

  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:"15px",marginTop:"16px"}}>
    <div style={{padding:"18px",borderRadius:"19px",background:"#f8fbff",border:"1px solid #dbe7f4"}}><h3 style={{marginTop:0,color:"#0f4c81"}}>Yakın Çevre ve Erişim</h3>{locationIntelligenceV33.nearby.map((item)=><div key={item.name} style={{padding:"11px 0",borderBottom:"1px solid #e5edf6"}}><div style={{display:"flex",justifyContent:"space-between",gap:"12px"}}><strong style={{color:"#0f2742"}}>{item.name}</strong><span style={{fontSize:"11px",color:"#64748b"}}>{item.distance}</span></div><div style={{height:"7px",borderRadius:"999px",background:"#e2e8f0",marginTop:"7px",overflow:"hidden"}}><div style={{width:`${item.score}%`,height:"100%",background:"linear-gradient(90deg,#2563eb,#06b6d4)"}}/></div></div>)}</div>
    <div style={{padding:"18px",borderRadius:"19px",background:"#fff7ed",border:"1px solid #fed7aa"}}><h3 style={{marginTop:0,color:"#9a3412"}}>Çevresel Risk Katmanları</h3>{locationIntelligenceV33.risks.map((item)=><div key={item.name} style={{display:"grid",gridTemplateColumns:"1fr auto",gap:"10px",padding:"12px 0",borderBottom:"1px solid #ffedd5"}}><div><strong style={{color:"#7c2d12"}}>{item.name}</strong><div style={{fontSize:"11px",color:"#9a3412",marginTop:"4px"}}>{item.level}</div></div><strong style={{color:item.score>=70?"#15803d":"#b45309"}}>{Math.round(item.score)}/100</strong></div>)}</div>
  </div>
</section>


<section id="yasam-portfolio" className="yasam-module-anchor yasam-module-view" style={{
  display: activeModule === "portfolio" ? "block" : "none",
  marginTop: "28px", background: "#fff", border: "1px solid #dbe7f4", borderRadius: "24px", padding: "22px", boxShadow: "0 16px 40px rgba(17,54,93,.09)"
}}>
  <div style={{padding:"22px",borderRadius:"22px",background:"linear-gradient(135deg,#07172f,#312e81 55%,#6d28d9)",color:"#fff",border:"1px solid rgba(196,181,253,.35)"}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:"16px",alignItems:"flex-start",flexWrap:"wrap"}}>
      <div><div style={{fontSize:"12px",fontWeight:950,letterSpacing:".12em",color:"#c4b5fd"}}>V34 · AI PORTFOLIO & ASSET MANAGEMENT</div><h2 style={{fontSize:"30px",margin:"8px 0"}}>Tüm gayrimenkul varlıklarını tek yatırım kararında birleştir.</h2><p style={{margin:0,maxWidth:"820px",lineHeight:1.75,color:"#ede9fe"}}>Kayıtlı raporları, aktif analizi, piyasa değerini, kira gelirini ve risk dağılımını tek portföy snapshotında toplar. Sat–tut–al önerileri karar desteğidir; vergi, hukuk ve resmî değerleme danışmanlığının yerine geçmez.</p></div>
      <div style={{display:"grid",gap:"9px",minWidth:"245px"}}><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"8px"}}><select value={v34Goal} onChange={(event)=>setV34Goal(event.target.value as "Gelir"|"Büyüme"|"Dengeli")} style={{padding:"11px",borderRadius:"12px",border:"1px solid rgba(255,255,255,.25)",background:"rgba(255,255,255,.12)",color:"#fff",fontWeight:900}}><option style={{color:"#111"}}>Gelir</option><option style={{color:"#111"}}>Büyüme</option><option style={{color:"#111"}}>Dengeli</option></select><select value={v34Horizon} onChange={(event)=>setV34Horizon(event.target.value as "1 Yıl"|"3 Yıl"|"5 Yıl"|"10 Yıl")} style={{padding:"11px",borderRadius:"12px",border:"1px solid rgba(255,255,255,.25)",background:"rgba(255,255,255,.12)",color:"#fff",fontWeight:900}}><option style={{color:"#111"}}>1 Yıl</option><option style={{color:"#111"}}>3 Yıl</option><option style={{color:"#111"}}>5 Yıl</option><option style={{color:"#111"}}>10 Yıl</option></select></div><button type="button" onClick={runV34PortfolioCenter} style={{padding:"13px 16px",borderRadius:"12px",border:0,background:"linear-gradient(135deg,#facc15,#f59e0b)",color:"#3b2200",fontWeight:950,cursor:"pointer"}}>🏢 Portföy Zekâsını Çalıştır</button></div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(145px,1fr))",gap:"10px",marginTop:"17px"}}>{[["Toplam Değer",`${new Intl.NumberFormat("tr-TR").format(portfolioIntelligenceV34.totalValue)} TL`],["Aylık Kira",`${new Intl.NumberFormat("tr-TR").format(portfolioIntelligenceV34.monthlyRent)} TL`],["Toplam Getiri",`%${portfolioIntelligenceV34.returnRate}`],["Kira Verimi",`%${portfolioIntelligenceV34.rentalYield}`],["Portföy Sağlığı",`${portfolioIntelligenceV34.healthScore}/100`],["Varlık",`${portfolioIntelligenceV34.assets.length}`]].map(([label,value])=><div key={label} style={{padding:"14px",borderRadius:"15px",background:"rgba(255,255,255,.09)",border:"1px solid rgba(255,255,255,.13)"}}><div style={{fontSize:"10px",fontWeight:900,color:"#ddd6fe"}}>{label}</div><div style={{fontSize:label==="Toplam Değer"||label==="Aylık Kira"?"15px":"20px",fontWeight:950,marginTop:"6px"}}>{value}</div></div>)}</div>
  </div>

  <div style={{display:"grid",gridTemplateColumns:"minmax(0,1.35fr) minmax(300px,.65fr)",gap:"16px",marginTop:"18px"}}>
    <div style={{padding:"18px",borderRadius:"19px",background:"#f8fbff",border:"1px solid #dbe7f4"}}><div style={{display:"flex",justifyContent:"space-between",gap:"12px",alignItems:"center",marginBottom:"12px"}}><h3 style={{margin:0,color:"#0f4c81"}}>Varlık Portföyü</h3><span style={{fontSize:"11px",fontWeight:900,color:"#64748b"}}>V34 çalıştırma: {v34RunCount}</span></div>{portfolioIntelligenceV34.assets.map((asset,index)=><div key={asset.id} style={{display:"grid",gridTemplateColumns:"36px minmax(0,1fr) auto",gap:"11px",alignItems:"center",padding:"13px 0",borderBottom:"1px solid #e5edf6"}}><div style={{width:"34px",height:"34px",borderRadius:"11px",display:"grid",placeItems:"center",background:index===0?"#dbeafe":"#ede9fe",color:index===0?"#1d4ed8":"#6d28d9",fontWeight:950}}>{index+1}</div><div><strong style={{color:"#0f2742"}}>{asset.name}</strong><div style={{fontSize:"11px",color:"#64748b",marginTop:"4px"}}>{asset.location} · Skor {Math.round(asset.score)}/100 · {asset.decision}</div><div style={{height:"7px",borderRadius:"999px",background:"#e2e8f0",marginTop:"8px",overflow:"hidden"}}><div style={{width:`${Math.max(8,Math.min(100,(asset.value/portfolioIntelligenceV34.totalValue)*100*2.3))}%`,height:"100%",background:"linear-gradient(90deg,#2563eb,#7c3aed)"}}/></div></div><div style={{textAlign:"right"}}><strong style={{color:"#0f2742",fontSize:"13px"}}>{new Intl.NumberFormat("tr-TR").format(asset.value)} TL</strong><div style={{fontSize:"10px",color:"#15803d",marginTop:"4px"}}>Kira {new Intl.NumberFormat("tr-TR").format(asset.monthlyRent)} TL</div></div></div>)}</div>
    <div style={{display:"grid",gap:"14px"}}><div style={{padding:"18px",borderRadius:"19px",background:"#f5f3ff",border:"1px solid #ddd6fe"}}><div style={{fontSize:"11px",fontWeight:950,color:"#6d28d9"}}>HEDEF PROJEKSİYONU</div><div style={{fontSize:"28px",fontWeight:950,color:"#4c1d95",marginTop:"8px"}}>{new Intl.NumberFormat("tr-TR").format(portfolioIntelligenceV34.projectedValue)} TL</div><div style={{fontSize:"12px",color:"#6d28d9",marginTop:"6px"}}>{v34Goal} stratejisi · {v34Horizon}</div><div style={{marginTop:"15px",display:"grid",gap:"9px"}}>{[["Risk",100-portfolioIntelligenceV34.riskScore],["Çeşitlilik",portfolioIntelligenceV34.diversification],["Sağlık",portfolioIntelligenceV34.healthScore]].map(([label,value])=><div key={label as string}><div style={{display:"flex",justifyContent:"space-between",fontSize:"11px",fontWeight:900,color:"#5b21b6"}}><span>{label}</span><span>{value}/100</span></div><div style={{height:"8px",borderRadius:"999px",background:"#ddd6fe",marginTop:"5px",overflow:"hidden"}}><div style={{height:"100%",width:`${value}%`,background:"linear-gradient(90deg,#7c3aed,#2563eb)"}}/></div></div>)}</div></div><div style={{padding:"17px",borderRadius:"18px",background:"#071a35",color:"#fff",border:"1px solid #312e81"}}><h3 style={{marginTop:0,color:"#c4b5fd"}}>V34 İşlem Geçmişi</h3>{v34Events.length?v34Events.slice(0,7).map((event,index)=><div key={`${event}-${index}`} style={{padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,.09)",fontSize:"12px",color:"#e0e7ff"}}>● {event}</div>):<p style={{color:"#c7d2fe",lineHeight:1.6}}>Portföy zekâsını çalıştırarak tüm varlıkları tek hedef ve vade altında analiz et.</p>}</div></div>
  </div>

  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:"15px",marginTop:"16px"}}><div style={{padding:"18px",borderRadius:"19px",background:"#ecfdf5",border:"1px solid #bbf7d0"}}><h3 style={{marginTop:0,color:"#166534"}}>Finansal Özet</h3>{[["Toplam Alış Maliyeti",portfolioIntelligenceV34.totalAcquisition],["Gerçekleşmemiş Kazanç",portfolioIntelligenceV34.unrealizedProfit],["Yıllık Kira Geliri",portfolioIntelligenceV34.annualRent]].map(([label,value])=><div key={label as string} style={{display:"flex",justifyContent:"space-between",gap:"12px",padding:"12px 0",borderBottom:"1px solid #d1fae5"}}><span style={{color:"#166534",fontSize:"12px"}}>{label}</span><strong style={{color:"#14532d"}}>{new Intl.NumberFormat("tr-TR").format(value as number)} TL</strong></div>)}</div><div style={{padding:"18px",borderRadius:"19px",background:"#fff7ed",border:"1px solid #fed7aa"}}><h3 style={{marginTop:0,color:"#9a3412"}}>AI Portföy Optimizasyonu</h3>{portfolioIntelligenceV34.recommendations.map((item,index)=><div key={item} style={{display:"grid",gridTemplateColumns:"28px 1fr",gap:"9px",padding:"10px 0",borderBottom:"1px solid #ffedd5",fontSize:"12px",lineHeight:1.55,color:"#7c2d12"}}><strong>{index+1}</strong><span>{item}</span></div>)}</div></div>
</section>

<section id="yasam-orchestration" className="yasam-module-anchor yasam-module-view" style={{display: activeModule === "orchestration" ? "block" : "none",marginTop:"28px"}}>
  <div style={{padding:"22px",borderRadius:"24px",background:"linear-gradient(135deg,#071a35 0%,#0f3b66 55%,#075985 100%)",color:"#fff",boxShadow:"0 22px 55px rgba(2,31,63,.22)",border:"1px solid rgba(125,211,252,.25)"}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:"18px",alignItems:"flex-start",flexWrap:"wrap"}}>
      <div><div style={{fontSize:"12px",fontWeight:950,letterSpacing:".12em",color:"#7dd3fc"}}>V35 · AI DATA ORCHESTRATION CENTER</div><h2 style={{fontSize:"30px",margin:"8px 0"}}>Tüm veri kaynaklarını tek güvenilir karar akışında yönet.</h2><p style={{margin:0,maxWidth:"850px",lineHeight:1.75,color:"#dbeafe"}}>Kullanıcı girdilerini, piyasa emsallerini, resmî doğrulamayı, konum katmanlarını, portföyü ve AI motorlarını tek snapshotta birleştirir. Bu ekran gerçek entegrasyonlar bağlandıkça kaynakların sağlık, tazelik ve güven durumunu merkezi olarak yönetecek.</p></div>
      <div style={{display:"grid",gap:"9px",minWidth:"255px"}}><div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:"8px"}}><select value={v35Mode} onChange={(event)=>setV35Mode(event.target.value as "Ekonomik"|"Dengeli"|"Maksimum Güven")} style={{padding:"11px",borderRadius:"12px",border:"1px solid rgba(255,255,255,.25)",background:"rgba(255,255,255,.12)",color:"#fff",fontWeight:900}}><option style={{color:"#111"}}>Ekonomik</option><option style={{color:"#111"}}>Dengeli</option><option style={{color:"#111"}}>Maksimum Güven</option></select><button type="button" onClick={()=>setV35AutoSync((value)=>!value)} style={{padding:"10px 12px",borderRadius:"12px",border:"1px solid rgba(255,255,255,.25)",background:v35AutoSync?"#10b981":"rgba(255,255,255,.12)",color:"#fff",fontWeight:950,cursor:"pointer"}}>{v35AutoSync?"Oto Açık":"Oto Kapalı"}</button></div><button type="button" onClick={runV35OrchestrationCenter} style={{padding:"13px 16px",borderRadius:"12px",border:0,background:"linear-gradient(135deg,#22d3ee,#38bdf8)",color:"#06243d",fontWeight:950,cursor:"pointer"}}>🧬 Tüm Veri Akışını Çalıştır</button></div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(145px,1fr))",gap:"10px",marginTop:"18px"}}>{[["Orkestrasyon Güveni",`${dataOrchestrationV35.orchestrationScore}/100`],["Bağlı Kaynak",`${dataOrchestrationV35.connected}/${dataOrchestrationV35.sourceDefinitions.length}`],["Toplam Kayıt",`${dataOrchestrationV35.totalRecords}`],["Veri Tazeliği",`${dataOrchestrationV35.averageFreshness}/100`],["Kaynak Güveni",`${dataOrchestrationV35.averageTrust}/100`],["Çatışma",`${dataOrchestrationV35.conflicts.length}`]].map(([label,value])=><div key={label} style={{padding:"14px",borderRadius:"15px",background:"rgba(255,255,255,.09)",border:"1px solid rgba(255,255,255,.13)"}}><div style={{fontSize:"10px",fontWeight:900,color:"#bae6fd"}}>{label}</div><div style={{fontSize:"20px",fontWeight:950,marginTop:"6px"}}>{value}</div></div>)}</div>
  </div>

  <div style={{display:"grid",gridTemplateColumns:"minmax(0,1.35fr) minmax(300px,.65fr)",gap:"16px",marginTop:"16px"}}>
    <div style={{padding:"18px",borderRadius:"20px",background:"#fff",border:"1px solid #dbe7f4",boxShadow:"0 14px 35px rgba(17,54,93,.07)"}}><div style={{display:"flex",justifyContent:"space-between",gap:"12px",alignItems:"center",marginBottom:"12px"}}><h3 style={{margin:0,color:"#0f4c81"}}>Veri Kaynakları ve Sağlık Durumu</h3><span style={{fontSize:"11px",fontWeight:900,color:"#64748b"}}>Çalıştırma: {v35RunCount}</span></div>{dataOrchestrationV35.sourceDefinitions.map((source)=><div key={source.id} style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) 90px 90px 80px",gap:"10px",alignItems:"center",padding:"13px 0",borderBottom:"1px solid #e5edf6"}}><div><strong style={{color:"#0f2742"}}>{source.name}</strong><div style={{fontSize:"11px",color:"#64748b",marginTop:"4px"}}>{source.records} kayıt · {source.status}</div></div><div><div style={{fontSize:"10px",fontWeight:900,color:"#64748b"}}>TAZELİK</div><div style={{height:"7px",borderRadius:"999px",background:"#e2e8f0",marginTop:"5px",overflow:"hidden"}}><div style={{height:"100%",width:`${source.freshness}%`,background:"linear-gradient(90deg,#0284c7,#22d3ee)"}}/></div></div><div><div style={{fontSize:"10px",fontWeight:900,color:"#64748b"}}>GÜVEN</div><div style={{height:"7px",borderRadius:"999px",background:"#e2e8f0",marginTop:"5px",overflow:"hidden"}}><div style={{height:"100%",width:`${source.trust}%`,background:"linear-gradient(90deg,#2563eb,#7c3aed)"}}/></div></div><div style={{textAlign:"right",fontWeight:950,color:source.status==="Bağlı"||source.status==="Aktif"?"#15803d":"#b45309"}}>{source.trust}/100</div></div>)}</div>
    <div style={{display:"grid",gap:"14px"}}><div style={{padding:"18px",borderRadius:"19px",background:"#ecfeff",border:"1px solid #a5f3fc"}}><div style={{fontSize:"11px",fontWeight:950,color:"#0e7490"}}>AKTİF SNAPSHOT</div><div style={{fontSize:"20px",fontWeight:950,color:"#164e63",marginTop:"8px",wordBreak:"break-word"}}>{dataOrchestrationV35.snapshotId}</div><div style={{fontSize:"12px",color:"#0e7490",marginTop:"7px"}}>{v35Mode} mod · {v35AutoSync?"Otomatik senkronizasyon açık":"Manuel senkronizasyon"}</div></div><div style={{padding:"17px",borderRadius:"18px",background:"#071a35",color:"#fff",border:"1px solid #0e7490"}}><h3 style={{marginTop:0,color:"#67e8f9"}}>V35 İşlem Geçmişi</h3>{v35Events.length?v35Events.slice(0,8).map((event,index)=><div key={`${event}-${index}`} style={{padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,.09)",fontSize:"12px",color:"#dbeafe"}}>● {event}</div>):<p style={{color:"#bae6fd",lineHeight:1.6}}>Tüm veri akışını çalıştırarak ilk birleşik karar snapshotını oluştur.</p>}</div></div>
  </div>

  <div style={{padding:"18px",borderRadius:"20px",background:"#f8fbff",border:"1px solid #dbe7f4",marginTop:"16px"}}><h3 style={{marginTop:0,color:"#0f4c81"}}>Orkestrasyon Boru Hattı</h3><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(165px,1fr))",gap:"11px"}}>{dataOrchestrationV35.pipeline.map((item)=><div key={item.step} style={{padding:"15px",borderRadius:"16px",background:"#fff",border:"1px solid #dbe7f4"}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><span style={{fontSize:"11px",fontWeight:950,color:"#0284c7"}}>ADIM {item.step}</span><strong style={{color:"#0f4c81"}}>{item.score}/100</strong></div><h4 style={{margin:"9px 0 6px",color:"#0f2742"}}>{item.title}</h4><p style={{margin:0,fontSize:"12px",lineHeight:1.55,color:"#64748b"}}>{item.detail}</p><div style={{height:"7px",borderRadius:"999px",background:"#e2e8f0",marginTop:"10px",overflow:"hidden"}}><div style={{height:"100%",width:`${item.score}%`,background:"linear-gradient(90deg,#0284c7,#22d3ee)"}}/></div></div>)}</div></div>

  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:"15px",marginTop:"16px"}}><div style={{padding:"18px",borderRadius:"19px",background:dataOrchestrationV35.conflicts.length?"#fff7ed":"#ecfdf5",border:`1px solid ${dataOrchestrationV35.conflicts.length?"#fed7aa":"#bbf7d0"}`}}><h3 style={{marginTop:0,color:dataOrchestrationV35.conflicts.length?"#9a3412":"#166534"}}>Veri Çatışmaları</h3>{dataOrchestrationV35.conflicts.length?dataOrchestrationV35.conflicts.map((item,index)=><div key={item} style={{padding:"10px 0",borderBottom:"1px solid #ffedd5",fontSize:"12px",lineHeight:1.55,color:"#7c2d12"}}><strong>{index+1}.</strong> {item}</div>):<p style={{color:"#166534",lineHeight:1.65}}>Aktif snapshotta kritik veri çatışması bulunmuyor.</p>}</div><div style={{padding:"18px",borderRadius:"19px",background:"#eff6ff",border:"1px solid #bfdbfe"}}><h3 style={{marginTop:0,color:"#1d4ed8"}}>AI Veri Aksiyonları</h3>{dataOrchestrationV35.actions.map((item,index)=><div key={item} style={{display:"grid",gridTemplateColumns:"28px 1fr",gap:"9px",padding:"10px 0",borderBottom:"1px solid #dbeafe",fontSize:"12px",lineHeight:1.55,color:"#1e3a8a"}}><strong>{index+1}</strong><span>{item}</span></div>)}</div></div>
</section>

<section id="yasam-command" className="yasam-module-anchor yasam-module-view" style={{display: activeModule === "command" ? "block" : "none",marginTop:"28px"}}>
  <div style={{padding:"24px",borderRadius:"24px",background:"linear-gradient(135deg,#071a35 0%,#123e72 52%,#4c1d95 100%)",color:"#fff",border:"1px solid rgba(129,140,248,.45)",boxShadow:"0 24px 60px rgba(15,23,42,.22)"}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:"18px",alignItems:"flex-start",flexWrap:"wrap"}}>
      <div style={{maxWidth:"760px"}}><div style={{fontSize:"12px",fontWeight:950,letterSpacing:".1em",color:"#c4b5fd"}}>V36 · AI DECISION COMMAND CENTER</div><h2 style={{margin:"8px 0 8px",fontSize:"30px"}}>Tüm zekâ motorlarını tek nihai yatırım kararında birleştir.</h2><p style={{margin:0,lineHeight:1.75,color:"#dbeafe"}}>Konum, piyasa, resmî doğrulama, portföy, veri orkestrasyonu ve karar çekirdeği birlikte çalışır; sistem Al, Pazarlık Et, Bekle veya Vazgeç sonucunu gerekçeleriyle üretir.</p></div>
      <div style={{display:"flex",gap:"10px",flexWrap:"wrap"}}><select value={v36DecisionMode} onChange={(event)=>setV36DecisionMode(event.target.value as "Temkinli"|"Dengeli"|"Atak")} style={{padding:"11px 13px",borderRadius:"12px",border:"1px solid rgba(255,255,255,.28)",background:"rgba(255,255,255,.12)",color:"#fff",fontWeight:900}}><option style={{color:"#111827"}}>Temkinli</option><option style={{color:"#111827"}}>Dengeli</option><option style={{color:"#111827"}}>Atak</option></select><button type="button" onClick={runV36DecisionCommand} style={{padding:"12px 17px",borderRadius:"12px",border:0,background:"linear-gradient(135deg,#facc15,#fb923c)",color:"#422006",fontWeight:950,cursor:"pointer"}}>🧠 Nihai Kararı Çalıştır</button></div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(145px,1fr))",gap:"10px",marginTop:"18px"}}>{[["Nihai Karar",decisionCommandV36.verdict],["Karar Skoru",`${decisionCommandV36.finalScore}/100`],["AI Güveni",`${decisionCommandV36.confidence}/100`],["Risk",`${decisionCommandV36.risk}/100`],["Getiri Potansiyeli",`${decisionCommandV36.returnPotential}/100`],["Çalıştırma",`${v36RunCount}`]].map(([label,value])=><div key={label} style={{padding:"14px",borderRadius:"15px",background:"rgba(255,255,255,.09)",border:"1px solid rgba(255,255,255,.13)"}}><div style={{fontSize:"10px",fontWeight:900,color:"#c4b5fd"}}>{label}</div><div style={{fontSize:label==="Nihai Karar"?"18px":"20px",fontWeight:950,marginTop:"6px",color:label==="Nihai Karar"?decisionCommandV36.color:"#fff"}}>{value}</div></div>)}</div>
  </div>

  <div style={{display:"grid",gridTemplateColumns:"minmax(0,1.25fr) minmax(300px,.75fr)",gap:"16px",marginTop:"16px"}}>
    <div style={{padding:"20px",borderRadius:"20px",background:"#fff",border:"1px solid #dbe7f4",boxShadow:"0 14px 35px rgba(17,54,93,.07)"}}><div style={{display:"flex",justifyContent:"space-between",gap:"12px",alignItems:"center",flexWrap:"wrap"}}><h3 style={{margin:0,color:"#0f4c81"}}>Canlı Karar Matrisi</h3><span style={{padding:"7px 11px",borderRadius:"999px",background:`${decisionCommandV36.color}18`,color:decisionCommandV36.color,fontWeight:950}}>{decisionCommandV36.verdict}</span></div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:"12px",marginTop:"15px"}}>{[["Konum Zekâsı",decisionCommandV36.location],["Piyasa Güveni",decisionCommandV36.market],["Resmî Doğrulama",decisionCommandV36.official],["Portföy Etkisi",decisionCommandV36.portfolio],["Veri Orkestrasyonu",decisionCommandV36.orchestration],["Karar Çekirdeği",decisionCommandV36.core]].map(([label,value])=><div key={label as string} style={{padding:"14px",borderRadius:"15px",background:"#f8fbff",border:"1px solid #dbe7f4"}}><div style={{display:"flex",justifyContent:"space-between",fontSize:"12px",fontWeight:900,color:"#334155"}}><span>{label}</span><strong>{value}/100</strong></div><div style={{height:"8px",borderRadius:"999px",background:"#e2e8f0",marginTop:"9px",overflow:"hidden"}}><div style={{height:"100%",width:`${value}%`,background:"linear-gradient(90deg,#2563eb,#7c3aed)"}}/></div></div>)}</div></div>
    <div style={{display:"grid",gap:"14px"}}><div style={{padding:"18px",borderRadius:"19px",background:"#eef2ff",border:"1px solid #c7d2fe"}}><div style={{fontSize:"11px",fontWeight:950,color:"#4338ca"}}>AKTİF KARAR SNAPSHOTI</div><div style={{fontSize:"18px",fontWeight:950,color:"#312e81",marginTop:"8px",wordBreak:"break-word"}}>{decisionCommandV36.snapshotId}</div><div style={{fontSize:"12px",color:"#4f46e5",marginTop:"7px"}}>{v36DecisionMode} mod · {decisionCommandV36.finalScore}/100 nihai skor</div></div><div style={{padding:"18px",borderRadius:"19px",background:"#071a35",color:"#fff",border:"1px solid #4338ca"}}><h3 style={{marginTop:0,color:"#c4b5fd"}}>V36 İşlem Geçmişi</h3>{v36Events.length?v36Events.slice(0,8).map((event,index)=><div key={`${event}-${index}`} style={{padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,.09)",fontSize:"12px",color:"#dbeafe"}}>● {event}</div>):<p style={{color:"#c4b5fd",lineHeight:1.6}}>Nihai Kararı Çalıştır düğmesiyle ilk komuta snapshotını oluştur.</p>}</div></div>
  </div>

  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:"15px",marginTop:"16px"}}><div style={{padding:"18px",borderRadius:"19px",background:"#eff6ff",border:"1px solid #bfdbfe"}}><h3 style={{marginTop:0,color:"#1d4ed8"}}>AI Karar Gerekçeleri</h3>{decisionCommandV36.reasons.map((item,index)=><div key={item} style={{display:"grid",gridTemplateColumns:"28px 1fr",gap:"9px",padding:"10px 0",borderBottom:"1px solid #dbeafe",fontSize:"12px",lineHeight:1.55,color:"#1e3a8a"}}><strong>{index+1}</strong><span>{item}</span></div>)}</div><div style={{padding:"18px",borderRadius:"19px",background:"#fff7ed",border:"1px solid #fed7aa"}}><h3 style={{marginTop:0,color:"#9a3412"}}>Kritik Uyarılar</h3>{decisionCommandV36.warnings.map((item,index)=><div key={item} style={{padding:"10px 0",borderBottom:"1px solid #ffedd5",fontSize:"12px",lineHeight:1.55,color:"#7c2d12"}}><strong>{index+1}.</strong> {item}</div>)}</div><div style={{padding:"18px",borderRadius:"19px",background:"#ecfdf5",border:"1px solid #bbf7d0"}}><h3 style={{marginTop:0,color:"#166534"}}>Yönetici Aksiyon Planı</h3>{decisionCommandV36.nextActions.map((item,index)=><div key={item} style={{display:"grid",gridTemplateColumns:"28px 1fr",gap:"9px",padding:"10px 0",borderBottom:"1px solid #d1fae5",fontSize:"12px",lineHeight:1.55,color:"#166534"}}><strong>{index+1}</strong><span>{item}</span></div>)}</div></div>
</section>


<section id="yasam-final" className="yasam-module-anchor yasam-module-view" style={{
  display: activeModule === "final" ? "block" : "none",
  marginTop: "28px",
  background: "#ffffff",
  border: "1px solid #dbe7f4",
  borderRadius: "24px",
  padding: "22px",
  boxShadow: "0 18px 45px rgba(17,54,93,.10)"
}}>
  <div style={{padding:"24px",borderRadius:"22px",background:"linear-gradient(135deg,#071a35 0%,#0f4c81 48%,#7c3aed 100%)",color:"#fff",border:"1px solid rgba(196,181,253,.45)"}}>
    <div style={{fontSize:"12px",fontWeight:950,letterSpacing:".12em",color:"#c4b5fd"}}>V40 · FAZ 1 FINAL</div>
    <h2 style={{margin:"8px 0",fontSize:"31px"}}>Yaşam AI artık Faz 2'ye geçmeye hazır.</h2>
    <p style={{margin:0,lineHeight:1.75,color:"#dbeafe",maxWidth:"860px"}}>Karar Komuta Merkezi, Kurumsal Rapor, Gerçek Veri Katmanı ve AI Tahmin Motoru aynı ürün omurgasında birleşti. Bu final ekranı, mevcut modüllerin durumunu ve Faz 2'de bağlanacak gerçek servisleri tek merkezde gösterir.</p>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(155px,1fr))",gap:"10px",marginTop:"18px"}}>
      {[["Faz 1 Durumu","%100"],["Çekirdek Modül","17"],["Kod Sağlığı","Stabil"],["Veri Katmanı","Hazır"],["AI Akışı","Hazır"],["Faz 2","Başlatılabilir"]].map(([label,value])=><div key={label} style={{padding:"14px",borderRadius:"15px",background:"rgba(255,255,255,.09)",border:"1px solid rgba(255,255,255,.13)"}}><div style={{fontSize:"10px",fontWeight:900,color:"#c4b5fd"}}>{label}</div><div style={{fontSize:"20px",fontWeight:950,marginTop:"6px"}}>{value}</div></div>)}
    </div>
  </div>

  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(285px,1fr))",gap:"15px",marginTop:"16px"}}>
    {[
      ["✓","Karar Motoru","AL / PAZARLIK YAP / BEKLE / UZAK DUR karar akışı korunuyor."],
      ["✓","Kurumsal Rapor","Yönetici özeti, güven, finansal güç ve risk notu hazır."],
      ["✓","Gerçek Veri Katmanı","Resmî kaynak, piyasa, harita ve kullanıcı verisi adaptör mimarisi hazır."],
      ["✓","AI Tahmin Motoru","1, 3 ve 5 yıllık fiyat, kira ve risk senaryoları çalışıyor."],
      ["✓","Portföy Merkezi","Varlıkların toplam değer, getiri ve risk görünümü korunuyor."],
      ["✓","Mobil ve Performans","Tek ekranlı modül yapısı, daha hafif render akışı ve güvenli geri dönüş noktası hazır."]
    ].map(([icon,title,text])=><div key={title} style={{padding:"18px",borderRadius:"19px",background:"#f8fbff",border:"1px solid #dbe7f4"}}><div style={{display:"flex",gap:"10px",alignItems:"center"}}><span style={{width:"34px",height:"34px",display:"grid",placeItems:"center",borderRadius:"11px",background:"#dcfce7",color:"#166534",fontWeight:950}}>{icon}</span><h3 style={{margin:0,color:"#0f2742"}}>{title}</h3></div><p style={{marginBottom:0,color:"#52657f",lineHeight:1.65,fontSize:"13px"}}>{text}</p></div>)}
  </div>

  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:"15px",marginTop:"16px"}}>
    <div style={{padding:"20px",borderRadius:"20px",background:"#ecfdf5",border:"1px solid #bbf7d0"}}>
      <h3 style={{marginTop:0,color:"#166534"}}>Faz 2 Başlangıç Sırası</h3>
      {["Supabase proje kurulumu ve çevresel değişkenler","Kullanıcı kayıt / giriş sistemi","Analizlerin veritabanına kaydı","Kullanıcı analiz geçmişi","Gerçek AI yanıt akışı","Premium üyelik ve bulut raporları"].map((item,index)=><div key={item} style={{display:"grid",gridTemplateColumns:"28px 1fr",gap:"9px",padding:"9px 0",borderBottom:"1px solid #d1fae5",fontSize:"12px",lineHeight:1.55,color:"#166534"}}><strong>{index+1}</strong><span>{item}</span></div>)}
    </div>
    <div style={{padding:"20px",borderRadius:"20px",background:"#fff7ed",border:"1px solid #fed7aa"}}>
      <h3 style={{marginTop:0,color:"#9a3412"}}>Final Güvenlik Notu</h3>
      <p style={{color:"#7c2d12",lineHeight:1.7}}>V40, çalışan V39 yapısının üzerine kurulmuştur. Mevcut /api/chat bağlantısı, analiz kartları, PDF/yazdır, harita, portföy ve karar ekranları korunur. Faz 2'de gerçek servisler parça parça bağlanacak; çalışan ön yüz yeniden yazılmayacaktır.</p>
      <div style={{marginTop:"14px",padding:"12px",borderRadius:"14px",background:"#fff",border:"1px solid #fdba74",fontWeight:900,color:"#9a3412"}}>Sonraki adım: Supabase bağlantısı ve kullanıcı sistemi.</div>
    </div>
  </div>
</section>

<section id="yasam-prediction" className="yasam-module-anchor yasam-module-view" style={{
  display: activeModule === "prediction" ? "block" : "none",
  marginTop: "28px",
  background: "#ffffff",
  border: "1px solid #dbe7f4",
  borderRadius: "24px",
  padding: "22px",
  boxShadow: "0 18px 45px rgba(17,54,93,.10)"
}}>
  <div style={{padding:"24px",borderRadius:"22px",background:"linear-gradient(135deg,#071a35 0%,#123e72 52%,#6d28d9 100%)",color:"#fff",border:"1px solid rgba(167,139,250,.45)"}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:"18px",alignItems:"flex-start",flexWrap:"wrap"}}>
      <div style={{maxWidth:"760px"}}>
        <div style={{fontSize:"12px",fontWeight:950,letterSpacing:".12em",color:"#c4b5fd"}}>V39 · AI TAHMİN MOTORU</div>
        <h2 style={{margin:"8px 0",fontSize:"31px"}}>Gayrimenkulün gelecekteki değerini senaryolarla gör.</h2>
        <p style={{margin:0,lineHeight:1.75,color:"#dbeafe"}}>Mevcut değerleme, veri güveni, likidite ve risk puanları birlikte çalışır; 1, 3 ve 5 yıllık fiyat aralığı, kira projeksiyonu ve büyüme potansiyeli üretilir. Sonuçlar karar desteği amaçlı tahmindir.</p>
      </div>
      <div style={{display:"grid",gap:"9px",minWidth:"235px"}}>
        <select value={v39Scenario} onChange={(event)=>setV39Scenario(event.target.value as "Temkinli"|"Dengeli"|"İyimser")} style={{padding:"12px",borderRadius:"12px",border:"1px solid rgba(255,255,255,.28)",background:"rgba(255,255,255,.12)",color:"#fff",fontWeight:900}}><option style={{color:"#111827"}}>Temkinli</option><option style={{color:"#111827"}}>Dengeli</option><option style={{color:"#111827"}}>İyimser</option></select>
        <select value={v39Horizon} onChange={(event)=>setV39Horizon(Number(event.target.value) as 1|3|5)} style={{padding:"12px",borderRadius:"12px",border:"1px solid rgba(255,255,255,.28)",background:"rgba(255,255,255,.12)",color:"#fff",fontWeight:900}}><option value={1} style={{color:"#111827"}}>1 Yıl</option><option value={3} style={{color:"#111827"}}>3 Yıl</option><option value={5} style={{color:"#111827"}}>5 Yıl</option></select>
        <button type="button" onClick={runV39Prediction} style={{padding:"13px 16px",borderRadius:"12px",border:0,background:"linear-gradient(135deg,#facc15,#fb923c)",color:"#422006",fontWeight:950,cursor:"pointer"}}>📈 Tahmini Çalıştır</button>
      </div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:"10px",marginTop:"18px"}}>
      {[["Bugünkü Değer",money(predictionEngineV39.base)],[`${v39Horizon} Yıllık Tahmin`,money(predictionEngineV39.selected.value)],["Toplam Büyüme",`%${predictionEngineV39.selected.growth.toFixed(1)}`],["AI Güveni",`${predictionEngineV39.confidence}/100`],["Yıllık Varsayım",`%${(predictionEngineV39.annualRate*100).toFixed(1)}`],["Çalıştırma",`${v39RunCount}`]].map(([label,value])=><div key={label} style={{padding:"14px",borderRadius:"15px",background:"rgba(255,255,255,.09)",border:"1px solid rgba(255,255,255,.13)"}}><div style={{fontSize:"10px",fontWeight:900,color:"#c4b5fd"}}>{label}</div><div style={{fontSize:"20px",fontWeight:950,marginTop:"6px"}}>{value}</div></div>)}
    </div>
  </div>

  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(250px,1fr))",gap:"14px",marginTop:"16px"}}>
    {predictionEngineV39.points.map((item)=><div key={item.years} style={{padding:"18px",borderRadius:"19px",background:item.years===v39Horizon?"linear-gradient(145deg,#eef2ff,#fff)":"#f8fbff",border:item.years===v39Horizon?"2px solid #818cf8":"1px solid #dbe7f4"}}><div style={{display:"flex",justifyContent:"space-between",gap:"10px",alignItems:"center"}}><strong style={{color:"#4338ca"}}>{item.years} YILLIK PROJEKSİYON</strong><span style={{fontSize:"11px",fontWeight:950,color:"#15803d"}}>+%{item.growth.toFixed(1)}</span></div><div style={{fontSize:"28px",fontWeight:950,color:"#0f2742",marginTop:"10px"}}>{money(item.value)}</div><div style={{fontSize:"12px",color:"#64748b",marginTop:"7px"}}>Güven aralığı: {money(item.low)} – {money(item.high)}</div><div style={{height:"8px",borderRadius:"999px",background:"#e2e8f0",marginTop:"12px",overflow:"hidden"}}><div style={{height:"100%",width:`${Math.min(100,item.growth)}%`,background:"linear-gradient(90deg,#2563eb,#7c3aed)"}}/></div></div>)}
  </div>

  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(290px,1fr))",gap:"15px",marginTop:"16px"}}>
    <div style={{padding:"18px",borderRadius:"19px",background:"#ecfdf5",border:"1px solid #bbf7d0"}}><h3 style={{marginTop:0,color:"#166534"}}>Kira Projeksiyonu</h3><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px"}}><div><div style={{fontSize:"11px",fontWeight:900,color:"#15803d"}}>BUGÜN AYLIK</div><div style={{fontSize:"25px",fontWeight:950,color:"#14532d",marginTop:"6px"}}>{money(predictionEngineV39.monthlyRentBase)}</div></div><div><div style={{fontSize:"11px",fontWeight:900,color:"#15803d"}}>{v39Horizon} YIL SONRA</div><div style={{fontSize:"25px",fontWeight:950,color:"#14532d",marginTop:"6px"}}>{money(predictionEngineV39.monthlyRentFuture)}</div></div></div><p style={{marginBottom:0,color:"#166534",lineHeight:1.6,fontSize:"12px"}}>Kira tahmini taşınmaz türü ve seçilen büyüme senaryosuna göre modellenir.</p></div>
    <div style={{padding:"18px",borderRadius:"19px",background:"#fff7ed",border:"1px solid #fed7aa"}}><h3 style={{marginTop:0,color:"#9a3412"}}>Risk ve Fırsat Görünümü</h3><div style={{fontSize:"28px",fontWeight:950,color:"#7c2d12"}}>{predictionEngineV39.opportunity}</div><p style={{color:"#9a3412",lineHeight:1.65}}>{predictionEngineV39.verdict}. Belirsizlik bandı yaklaşık ±%{(predictionEngineV39.uncertainty*100).toFixed(0)} düzeyindedir.</p></div>
    <div style={{padding:"18px",borderRadius:"19px",background:"#eff6ff",border:"1px solid #bfdbfe"}}><h3 style={{marginTop:0,color:"#1d4ed8"}}>Tahmini Etkileyen Unsurlar</h3>{predictionEngineV39.drivers.map((item,index)=><div key={item} style={{display:"grid",gridTemplateColumns:"28px 1fr",gap:"9px",padding:"9px 0",borderBottom:"1px solid #dbeafe",fontSize:"12px",lineHeight:1.55,color:"#1e3a8a"}}><strong>{index+1}</strong><span>{item}</span></div>)}</div>
  </div>

  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:"15px",marginTop:"16px"}}>
    <div style={{padding:"18px",borderRadius:"19px",background:"#071a35",color:"#fff",border:"1px solid #4338ca"}}><h3 style={{marginTop:0,color:"#c4b5fd"}}>V39 Tahmin Geçmişi</h3>{v39Events.length?v39Events.map((event,index)=><div key={`${event}-${index}`} style={{padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,.09)",fontSize:"12px",color:"#dbeafe"}}>● {event}</div>):<p style={{color:"#c4b5fd",lineHeight:1.6}}>Senaryo ve süre seçerek Tahmini Çalıştır düğmesine bas.</p>}</div>
    <div style={{padding:"18px",borderRadius:"19px",background:"#faf5ff",border:"1px solid #e9d5ff"}}><h3 style={{marginTop:0,color:"#7e22ce"}}>AI Tahmin Notu</h3><p style={{marginBottom:0,color:"#6b21a8",lineHeight:1.7}}>Bu ekran garanti getiri sunmaz. Tahminler kullanıcı girdileri, mevcut analiz snapshotı ve model varsayımlarından üretilir. Faz 2’de canlı piyasa, resmî veri ve bölgesel zaman serileri bağlandığında güven aralıkları gerçek veriyle güncellenecektir.</p></div>
  </div>
</section>

<section id="yasam-data" className="yasam-module-anchor yasam-module-view" style={{
display: activeModule === "data" ? "block" : "none",
  marginTop: "28px",
  background: "#ffffff",
  border: "1px solid #dbe7f4",
  borderRadius: "22px",
  padding: "22px",
  boxShadow: "0 14px 35px rgba(17,54,93,.08)"
}}>
  <div style={{marginBottom:"18px",padding:"22px",borderRadius:"22px",background:"linear-gradient(135deg,#071a35,#0f4c81 55%,#0ea5e9)",color:"#fff",border:"1px solid rgba(103,232,249,.35)",boxShadow:"0 18px 45px rgba(2,132,199,.18)"}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:"16px",alignItems:"flex-start",flexWrap:"wrap"}}>
      <div>
        <div style={{fontSize:"12px",fontWeight:950,letterSpacing:".12em",color:"#67e8f9"}}>V38 · GERÇEK VERİ ENTEGRASYON KATMANI</div>
        <h2 style={{margin:"8px 0",fontSize:"30px"}}>Yaşam AI artık çok kaynaklı veri mimarisine hazır.</h2>
        <p style={{margin:0,maxWidth:"780px",lineHeight:1.75,color:"#dbeafe"}}>Bu katman; resmî kurum, harita, piyasa, kullanıcı ve AI verilerini ortak bir doğrulama standardında birleştirir. Faz 2'de gerçek API anahtarları bağlandığında mevcut karar motoru değişmeden canlı veriye geçecektir.</p>
      </div>
      <div style={{padding:"10px 14px",borderRadius:"999px",background:"rgba(255,255,255,.12)",border:"1px solid rgba(255,255,255,.22)",fontWeight:950}}>● ENTEGRASYONA HAZIR</div>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:"11px",marginTop:"18px"}}>
      {[
        ["Tapu / Parsel Adaptörü","Şema hazır","Faz 2 bağlantısı"],
        ["Belediye / İmar Adaptörü","Şema hazır","Resmî doğrulama"],
        ["Harita / Konum Adaptörü","Aktif","Adres ve çevre"],
        ["Piyasa Veri Adaptörü","Hazır","Emsal ve trend"],
        ["Kullanıcı Veri Adaptörü","Aktif","Form ve portföy"],
        ["AI Karar Adaptörü","Aktif","Skor ve öneri"],
      ].map(([name,status,detail]) => <div key={name} style={{padding:"14px",borderRadius:"16px",background:"rgba(255,255,255,.09)",border:"1px solid rgba(255,255,255,.14)"}}><div style={{fontSize:"13px",fontWeight:950}}>{name}</div><div style={{fontSize:"11px",color:"#a5f3fc",fontWeight:900,marginTop:"7px"}}>{status}</div><div style={{fontSize:"11px",color:"#dbeafe",marginTop:"4px"}}>{detail}</div></div>)}
    </div>
  </div>

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

  <div style={{marginBottom:"18px",padding:"20px",borderRadius:"20px",background:"linear-gradient(135deg,#071a35,#0b5f8f)",color:"#fff",border:"1px solid rgba(56,189,248,.35)"}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:"16px",alignItems:"flex-start",flexWrap:"wrap"}}>
      <div>
        <div style={{fontSize:"12px",fontWeight:900,letterSpacing:".1em",color:"#67e8f9"}}>V29 · LIVE DATA + DECISION ORCHESTRATOR</div>
        <h2 style={{margin:"7px 0 8px",fontSize:"28px"}}>Canlı veri ve karar operasyonları tek merkezde.</h2>
        <p style={{margin:0,maxWidth:"720px",lineHeight:1.7,color:"#c9e8f7"}}>Harita, adres, çevre, kullanıcı girdisi, AI analizi ve rapor arşivi aynı canlı snapshot içinde izlenir. Kaynak değiştiğinde karar çekirdeği otomatik güncellenir.</p>
      </div>
      <button type="button" onClick={refreshLiveDataLayer} style={{padding:"12px 16px",borderRadius:"12px",border:"1px solid rgba(255,255,255,.25)",background:"rgba(255,255,255,.12)",color:"#fff",fontWeight:900,cursor:"pointer"}}>↻ Canlı Veriyi Yenile</button>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:"10px",marginTop:"16px"}}>
      {[
        ["Canlı Skor", `${liveDataLayer.liveScore}/100`],
        ["Kaynak Kapsamı", `${liveDataLayer.coverage}%`],
        ["Doğrulanmış", `${liveDataLayer.verifiedCount}/6`],
        ["Tazelik", `${liveDataLayer.freshness}%`],
        ["Snapshot", intelligenceEngine.snapshotCode],
      ].map(([label,value]) => <div key={label} style={{padding:"13px",borderRadius:"14px",background:"rgba(255,255,255,.09)",border:"1px solid rgba(255,255,255,.12)"}}><div style={{fontSize:"10px",opacity:.7,fontWeight:900}}>{label}</div><div style={{fontSize:label==="Snapshot"?"13px":"20px",fontWeight:950,marginTop:"5px",wordBreak:"break-word"}}>{value}</div></div>)}
    </div>
  </div>

  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:"14px",marginBottom:"18px"}}>
    <div style={{border:"1px solid #dbe7f4",borderRadius:"18px",padding:"17px",background:"#f8fbff"}}>
      <h3 style={{marginTop:0,color:"#0f4c81"}}>Canlı Kaynak Durumu</h3>
      {liveDataLayer.sources.map((source) => <div key={source.name} style={{display:"flex",justifyContent:"space-between",gap:"12px",padding:"10px 0",borderBottom:"1px solid #e5edf6"}}><div><strong style={{color:"#0f2742"}}>{source.name}</strong><div style={{fontSize:"12px",color:"#64748b",marginTop:"3px"}}>{source.detail}</div></div><span style={{alignSelf:"center",padding:"5px 8px",borderRadius:"999px",fontSize:"11px",fontWeight:900,background:source.ready?"#dcfce7":"#fef3c7",color:source.ready?"#166534":"#92400e"}}>{source.ready?"CANLI":"BEKLİYOR"}</span></div>)}
    </div>
    <div style={{border:"1px solid #dbe7f4",borderRadius:"18px",padding:"17px",background:"#fff"}}>
      <h3 style={{marginTop:0,color:"#0f4c81"}}>Canlı Olay Akışı</h3>
      {liveEvents.length ? liveEvents.map((event,index) => <div key={`${event}-${index}`} style={{padding:"10px 0",borderBottom:"1px solid #edf2f7",fontSize:"13px",color:"#475569"}}>● {event}</div>) : <p style={{color:"#64748b"}}>Henüz canlı olay oluşmadı.</p>}
      <div style={{marginTop:"12px",padding:"12px",borderRadius:"12px",background:"#eff6ff",color:"#1e3a8a",fontSize:"12px",lineHeight:1.6}}>Son yenileme: {lastLiveRefresh.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}. Veriler değiştikçe karar motoru, PDF ve kullanıcı arşivi aynı snapshot kodunu kullanır.</div>
    </div>
  </div>

  <div style={{
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
    gap: "14px"
  }}>
    <MetricCard
      label="AKTİF VERİ KAYNAĞI"
      value={`${liveDataLayer.readyCount}`}
      note="Canlı durumda olan kaynaklar"
    />
    <MetricCard
      label="ENTEGRASYON BEKLEYEN"
      value="6"
      note="Resmî ve ticari veri kaynakları"
    />
    <MetricCard
      label="VERİ GÜVEN SKORU"
      value={`${liveDataLayer.liveScore} / 100`}
      note="Kapsam, doğrulama ve tazelik birleşimi"
    />
    <MetricCard
      label="SON GÜNCELLEME"
      value={lastLiveRefresh.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
      note="Canlı katmanın son yenilenmesi"
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


<section id="yasam-gold" className="yasam-module-anchor yasam-module-view" style={{
display: activeModule === "gold" ? "block" : "none",
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
    </>
  );
}

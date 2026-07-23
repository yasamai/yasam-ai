"use client";

import { FormEvent, useMemo, useState } from "react";

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

export default function AnalizPage() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [copied, setCopied] = useState(false);

  const askingPriceNumber = useMemo(
    () => Number(form.askingPrice.replace(/\D/g, "")) || 0,
    [form.askingPrice],
  );

  const formattedPrice = useMemo(
    () => (askingPriceNumber ? new Intl.NumberFormat("tr-TR").format(askingPriceNumber) : ""),
    [askingPriceNumber],
  );

  const scores = useMemo<ScoreCard[]>(() => {
    const text = result?.raw ?? "";

    return [
      {
        title: "Veri Güven Skoru",
        value: extractScore(text, ["Veri Güven Skoru", "Güven Skoru"], 45),
        description: "Analizin dayandığı verilerin kapsamı ve doğrulanabilirliği.",
      },
      {
        title: "Yatırım Puanı",
        value: extractScore(text, ["Yatırım Puanı"], 55),
        description: "Taşınmazın genel yatırım çekiciliği ve getiri potansiyeli.",
      },
      {
        title: "Fırsat Puanı",
        value: extractScore(text, ["Fırsat Puanı"], 50),
        description: "Fiyat, konum ve gelişim avantajlarının birleşik değerlendirmesi.",
      },
      {
        title: "Risk Puanı",
        value: extractScore(text, ["Risk Puanı"], 65),
        description: "Hukuki, teknik, veri ve piyasa belirsizliklerinin seviyesi.",
        inverse: true,
      },
      {
        title: "Likidite Puanı",
        value: extractScore(text, ["Likidite Puanı"], 60),
        description: "Taşınmazın makul sürede satılabilme veya nakde dönüşebilme ihtimali.",
      },
    ];
  }, [result]);

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
    const fiveYear =
      extractMoney(text, ["5 Yıllık Tahmini Değer", "Beş Yıllık Tahmini Değer"], 0) ||
      Math.round(market * 1.45);

    return { market, quick, safe, max, negotiation, fiveYear };
  }, [askingPriceNumber, result]);

  const decision = useMemo(() => detectDecision(result?.raw ?? "", scores), [result, scores]);
  const decisionStyle = decisionTheme(decision);

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
Sen Yaşam AI Karar Motoru 2.0'sın.
Aşağıdaki taşınmaz için Türkçe, profesyonel, şeffaf ve yatırım odaklı bir analiz hazırla.

TAŞINMAZ BİLGİLERİ
İl: ${form.city}
İlçe: ${form.district}
Mahalle: ${form.neighborhood}
Taşınmaz türü: ${form.propertyType}
Alan: ${form.area} m²
Satış fiyatı: ${formattedPrice || form.askingPrice} TL
Ek bilgiler: ${form.notes || "Belirtilmedi"}

ÖNEMLİ KURALLAR
- Gerçek zamanlı resmî veya piyasa verisine erişimin yoksa bunu açıkça yaz.
- Bilinmeyen bilgileri uydurma.
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
            ✦ YAŞAM AI • KARAR MOTORU 2.0
          </div>

          <h1
            style={{
              margin: "17px 0 10px",
              fontSize: "clamp(34px, 6vw, 58px)",
              lineHeight: 1.04,
              letterSpacing: "-1.5px",
            }}
          >
            Gayrimenkul Yatırım Karar Merkezi
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
                  label="5 YILLIK TAHMİNİ DEĞER"
                  value={money(valuation.fiveYear)}
                  note="Sabit getiri varsayımıyla oluşturulan senaryo değeridir."
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
      </div>
    </main>
  );
}

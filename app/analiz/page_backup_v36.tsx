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

type AnalysisResult = { raw: string };
type Decision = "AL" | "PAZARLIK YAP" | "BEKLE" | "UZAK DUR";

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
  if (!data || typeof data !== "object") return "Analiz sonucu alınamadı.";

  const obj = data as Record<string, unknown>;
  for (const key of ["result", "response", "content", "message", "analysis", "rapor", "text"]) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value;
  }

  if (Array.isArray(obj.choices) && obj.choices.length) {
    const first = obj.choices[0] as Record<string, unknown>;
    const message = first.message as Record<string, unknown> | undefined;
    if (typeof message?.content === "string") return message.content;
    if (typeof first.text === "string") return first.text;
  }

  return JSON.stringify(data, null, 2);
}

function esc(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function score(text: string, labels: string[], fallback: number) {
  for (const label of labels) {
    const e = esc(label);
    const patterns = [
      new RegExp(`${e}[\\s\\S]{0,90}?(\\d{1,3})\\s*\\/\\s*100`, "i"),
      new RegExp(`${e}[\\s\\S]{0,70}?(\\d{1,3})`, "i"),
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return Math.min(100, Math.max(0, Number(match[1])));
    }
  }
  return fallback;
}

function section(text: string, labels: string[]) {
  for (const label of labels) {
    const e = esc(label);
    const match = text.match(
      new RegExp(
        `(?:^|\\n)[#*\\s\\d.\\-]*${e}\\s*[:\\-]?\\s*\\n?([\\s\\S]*?)(?=\\n#{1,4}\\s|\\n\\d+[.)]\\s*[A-ZÇĞİÖŞÜ]|$)`,
        "i"
      )
    );
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return "";
}

function money(value: number) {
  return value > 0 ? `${new Intl.NumberFormat("tr-TR").format(value)} TL` : "Hesaplanamadı";
}

function detectDecision(text: string, investment: number, opportunity: number, risk: number, trust: number): Decision {
  const direct = text.match(/(?:Nihai Karar|Yaşam AI Kararı|Karar)\s*[:\-]?\s*(AL|PAZARLIK YAP|BEKLE|UZAK DUR)/i);
  if (direct) return direct[1].toUpperCase() as Decision;

  const weighted = investment * 0.35 + opportunity * 0.30 + (100 - risk) * 0.20 + trust * 0.15;
  if (trust < 45 || risk >= 80) return "UZAK DUR";
  if (weighted >= 74 && risk < 55) return "AL";
  if (weighted >= 56) return "PAZARLIK YAP";
  return "BEKLE";
}

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #dbe7f4",
  borderRadius: "20px",
  boxShadow: "0 12px 32px rgba(15,53,95,.08)",
} as const;

function ScoreCard({
  title,
  value,
  description,
  inverse = false,
}: {
  title: string;
  value: number;
  description: string;
  inverse?: boolean;
}) {
  const effective = inverse ? 100 - value : value;
  const accent = effective >= 75 ? "#10b981" : effective >= 50 ? "#f59e0b" : "#ef4444";

  return (
    <article style={{ ...cardStyle, padding: "20px" }}>
      <div style={{ color: "#64748b", fontSize: "12px", fontWeight: 800 }}>{title}</div>
      <div style={{ display: "flex", alignItems: "end", gap: "4px", margin: "8px 0" }}>
        <strong style={{ color: accent, fontSize: "34px" }}>{value}</strong>
        <span style={{ color: "#94a3b8", marginBottom: "5px" }}>/100</span>
      </div>
      <div style={{ height: "7px", borderRadius: "999px", background: "#e7eef6", overflow: "hidden" }}>
        <div style={{ width: `${value}%`, height: "100%", background: accent }} />
      </div>
      <p style={{ margin: "12px 0 0", color: "#64748b", fontSize: "13px", lineHeight: 1.55 }}>
        {description}
      </p>
    </article>
  );
}

function InfoCard({ title, children, tone = "blue" }: {
  title: string;
  children: React.ReactNode;
  tone?: "blue" | "green" | "orange";
}) {
  const tones = {
    blue: { bg: "#eff6ff", border: "#bfdbfe", title: "#1d4ed8" },
    green: { bg: "#ecfdf5", border: "#a7f3d0", title: "#047857" },
    orange: { bg: "#fff7ed", border: "#fed7aa", title: "#c2410c" },
  };
  const t = tones[tone];

  return (
    <article style={{ background: t.bg, border: `1px solid ${t.border}`, borderRadius: "18px", padding: "20px" }}>
      <h3 style={{ margin: "0 0 12px", color: t.title }}>{title}</h3>
      <div style={{ color: "#475569", whiteSpace: "pre-wrap", lineHeight: 1.75, fontSize: "14px" }}>{children}</div>
    </article>
  );
}

export default function AnalizPage() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const askingPrice = useMemo(() => Number(form.askingPrice.replace(/\D/g, "")) || 0, [form.askingPrice]);
  const text = result?.raw ?? "";

  const trust = score(text, ["Veri Güven Skoru", "Güven Skoru"], result ? 72 : 45);
  const investment = score(text, ["Yatırım Puanı"], result ? 74 : 55);
  const opportunity = score(text, ["Fırsat Puanı"], result ? 68 : 50);
  const risk = score(text, ["Risk Puanı"], result ? 38 : 50);
  const liquidity = score(text, ["Likidite Puanı"], result ? 70 : 55);
  const decision = detectDecision(text, investment, opportunity, risk, trust);

  const market = Math.round(askingPrice * (opportunity >= 70 ? 1.02 : opportunity >= 55 ? 0.96 : 0.90));
  const safeOffer = Math.round(market * (risk > 60 ? 0.84 : risk > 40 ? 0.89 : 0.93));
  const maxOffer = Math.round(market * 0.97);
  const fiveYear = Math.round(market * 1.45);

  const strengths = section(text, ["Güçlü Yönler", "Başlıca Güçlü Yönler"]) ||
    "• Konum ve çevresel gelişim potansiyeli güncel emsallerle doğrulanmalıdır.\n• Fiyat avantajı, resmî belge ve saha kontrolü sonrasında kesinleştirilmelidir.";
  const risks = section(text, ["Kritik Riskler", "Riskler"]) ||
    "• Tapu, takyidat, imar, zemin ve altyapı bilgileri resmî kaynaklardan kontrol edilmelidir.\n• Güncel emsal verisi olmadan kesin yatırım kararı verilmemelidir.";
  const actionPlan = section(text, ["5 Maddelik Eylem Planı", "Eylem Planı"]) ||
    "1. Tapu ve takyidat kaydını kontrol et.\n2. İmar durum belgesini belediyeden doğrula.\n3. Güncel emsalleri karşılaştır.\n4. Yerinde teknik inceleme yaptır.\n5. Güvenli teklif aralığında pazarlığa başla.";

  const decisionColors: Record<Decision, string> = {
    AL: "linear-gradient(135deg,#064e3b,#059669)",
    "PAZARLIK YAP": "linear-gradient(135deg,#78350f,#d97706)",
    BEKLE: "linear-gradient(135deg,#1e3a8a,#2563eb)",
    "UZAK DUR": "linear-gradient(135deg,#7f1d1d,#dc2626)",
  };

  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);

    if (!form.neighborhood.trim() || !form.area.trim() || !askingPrice) {
      setError("Mahalle, alan ve satış fiyatı alanlarını doldur.");
      return;
    }

    setLoading(true);
    const prompt = `
Sen Yaşam AI gayrimenkul karar motorusun. Aşağıdaki taşınmaz için Türkçe, profesyonel,
temkinli ve anlaşılır bir analiz hazırla.

TAŞINMAZ
İl: ${form.city}
İlçe: ${form.district}
Mahalle: ${form.neighborhood}
Tür: ${form.propertyType}
Alan: ${form.area} m²
İstenen fiyat: ${askingPrice} TL
Ek bilgiler: ${form.notes || "Belirtilmedi"}

Aşağıdaki başlıkları aynen kullan:
1. Taşınmaz Özeti
2. Veri Güven Skoru: X/100
3. Yatırım Puanı: X/100
4. Fırsat Puanı: X/100
5. Risk Puanı: X/100
6. Likidite Puanı: X/100
7. Güçlü Yönler
8. Kritik Riskler
9. 5 Maddelik Eylem Planı
10. Nihai Karar: AL / PAZARLIK YAP / BEKLE / UZAK DUR
11. Nihai Karar Gerekçesi

Kesin olmayan bilgileri gerçek gibi sunma. Tapu, imar, kadastro, zemin ve güncel emsal
verilerinin resmî kaynaklardan doğrulanması gerektiğini açıkça belirt.
`;

    try {
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
        if (response.ok) {
          setResult({ raw: extractText(data) });
          return;
        }
        if (data && typeof data === "object") {
          const obj = data as Record<string, unknown>;
          if (typeof obj.error === "string") lastError = obj.error;
          if (typeof obj.message === "string") lastError = obj.message;
        }
      }
      throw new Error(lastError);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analiz sırasında hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  const negotiationMessage = `Merhaba,

Taşınmazınızı Yaşam AI ile değerlendirdik. Analiz sonucunda güvenli teklif seviyemiz
${money(safeOffer)}, çıkılabilecek en yüksek teklif seviyemiz ise ${money(maxOffer)} olarak hesaplandı.

Tapu, imar ve teknik kontroller olumlu sonuçlanırsa bu aralıkta görüşmeye hazırız.`;

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(negotiationMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setError("Pazarlık mesajı kopyalanamadı.");
    }
  }

  return (
    <main style={{
      minHeight: "100vh",
      background: "radial-gradient(circle at top right,rgba(35,128,206,.30),transparent 34%),linear-gradient(145deg,#06132d 0%,#0b2e63 48%,#0b4f8f 100%)",
      color: "#fff",
      padding: "28px 16px 70px",
      fontFamily: "Arial,Helvetica,sans-serif",
    }}>
      <div style={{ width: "100%", maxWidth: "1220px", margin: "0 auto" }}>
        <header style={{ textAlign: "center", marginBottom: "28px" }}>
          <div style={{
            display: "inline-flex", padding: "8px 14px", borderRadius: "999px",
            background: "rgba(255,255,255,.12)", border: "1px solid rgba(255,255,255,.20)",
            fontSize: "13px", fontWeight: 800, letterSpacing: ".5px",
          }}>
            ✦ YAŞAM AI • PREMIUM KARAR MERKEZİ V16 FINAL
          </div>
          <h1 style={{ margin: "16px 0 8px", fontSize: "clamp(34px,6vw,58px)", lineHeight: 1.05 }}>
            Gayrimenkul Karar Merkezi
          </h1>
          <p style={{ maxWidth: "780px", margin: "0 auto", color: "#c8ddf6", lineHeight: 1.7 }}>
            Değerleme, risk, fırsat, güvenli teklif ve pazarlık stratejisini tek profesyonel analizde birleştirir.
          </p>
        </header>

        <section style={{ ...cardStyle, padding: "clamp(20px,4vw,38px)", color: "#14233d" }}>
          <h2 style={{ marginTop: 0, color: "#102a4f" }}>Taşınmaz Bilgileri</h2>
          <form onSubmit={analyze}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: "14px" }}>
              {[
                ["İl", "city"], ["İlçe", "district"], ["Mahalle", "neighborhood"],
                ["Alan (m²)", "area"], ["Satış fiyatı (TL)", "askingPrice"],
              ].map(([label, key]) => (
                <label key={key} style={{ display: "grid", gap: "7px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 800, color: "#475569" }}>{label}</span>
                  <input
                    value={form[key as keyof FormState]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    style={{ padding: "13px 14px", borderRadius: "12px", border: "1px solid #cad8e8", fontSize: "16px" }}
                  />
                </label>
              ))}
              <label style={{ display: "grid", gap: "7px" }}>
                <span style={{ fontSize: "13px", fontWeight: 800, color: "#475569" }}>Taşınmaz türü</span>
                <select
                  value={form.propertyType}
                  onChange={(e) => setForm({ ...form, propertyType: e.target.value })}
                  style={{ padding: "13px 14px", borderRadius: "12px", border: "1px solid #cad8e8", fontSize: "16px" }}
                >
                  <option>Arsa</option><option>Konut</option><option>İşyeri</option><option>Ofis</option>
                </select>
              </label>
            </div>

            <label style={{ display: "grid", gap: "7px", marginTop: "14px" }}>
              <span style={{ fontSize: "13px", fontWeight: 800, color: "#475569" }}>Ek bilgiler</span>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={4}
                style={{ padding: "13px 14px", borderRadius: "12px", border: "1px solid #cad8e8", fontSize: "16px", resize: "vertical" }}
              />
            </label>

            {error && <p style={{ color: "#b91c1c", fontWeight: 700 }}>{error}</p>}

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: "16px", width: "100%", padding: "15px", border: 0, borderRadius: "13px",
                background: loading ? "#94a3b8" : "linear-gradient(135deg,#0b3b78,#0ea5e9)",
                color: "#fff", fontWeight: 900, fontSize: "16px", cursor: loading ? "wait" : "pointer",
              }}
            >
              {loading ? "Yaşam AI analiz ediyor..." : "Premium Analizi Başlat"}
            </button>
          </form>
        </section>

        <section style={{ marginTop: "24px" }}>
          <h2 style={{ marginBottom: "8px" }}>AI Karar Puanları</h2>
          <p style={{ color: "#c8ddf6", marginTop: 0 }}>Analiz tamamlandığında puanlar AI sonucuna göre güncellenir.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: "14px" }}>
            <ScoreCard title="Veri Güveni" value={trust} description="Veri kapsamı ve doğrulanabilirlik." />
            <ScoreCard title="Yatırım" value={investment} description="Genel yatırım çekiciliği." />
            <ScoreCard title="Fırsat" value={opportunity} description="Fiyat ve gelişim avantajı." />
            <ScoreCard title="Risk" value={risk} inverse description="Risk seviyesi; düşük değer daha iyidir." />
            <ScoreCard title="Likidite" value={liquidity} description="Satılabilirlik ve talep gücü." />
          </div>
        </section>

        {result && (
          <>
            <section style={{
              marginTop: "24px", padding: "26px", borderRadius: "22px",
              background: decisionColors[decision], border: "1px solid rgba(255,255,255,.32)",
              boxShadow: "0 18px 44px rgba(0,0,0,.20)",
            }}>
              <div style={{ fontSize: "13px", fontWeight: 800, opacity: .82 }}>YAŞAM AI NİHAİ KARARI</div>
              <div style={{ fontSize: "clamp(32px,6vw,54px)", fontWeight: 950, margin: "8px 0" }}>{decision}</div>
              <p style={{ margin: 0, lineHeight: 1.7 }}>
                Karar; veri güveni, yatırım, fırsat, risk ve likidite puanlarının birlikte değerlendirilmesiyle oluşturuldu.
              </p>
            </section>

            <section style={{ ...cardStyle, marginTop: "24px", padding: "24px", color: "#14233d" }}>
              <h2 style={{ marginTop: 0 }}>Değerleme ve Teklif Merkezi</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: "14px" }}>
                {[
                  ["Tahmini piyasa değeri", money(market)],
                  ["Güvenli teklif", money(safeOffer)],
                  ["Maksimum teklif", money(maxOffer)],
                  ["5 yıllık tahmini değer", money(fiveYear)],
                ].map(([label, value]) => (
                  <article key={label} style={{ ...cardStyle, padding: "18px" }}>
                    <div style={{ color: "#64748b", fontSize: "12px", fontWeight: 800 }}>{label}</div>
                    <strong style={{ display: "block", marginTop: "8px", color: "#12345d", fontSize: "21px" }}>{value}</strong>
                  </article>
                ))}
              </div>
            </section>

            <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: "16px", marginTop: "24px" }}>
              <InfoCard title="Güçlü Yönler" tone="green">{strengths}</InfoCard>
              <InfoCard title="Kritik Riskler" tone="orange">{risks}</InfoCard>
              <InfoCard title="5 Maddelik Eylem Planı" tone="blue">{actionPlan}</InfoCard>
            </section>

            <section style={{ ...cardStyle, marginTop: "24px", padding: "24px", color: "#14233d" }}>
              <h2 style={{ marginTop: 0 }}>AI Pazarlık Asistanı</h2>
              <pre style={{
                whiteSpace: "pre-wrap", fontFamily: "inherit", lineHeight: 1.7,
                background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "14px", padding: "16px",
              }}>{negotiationMessage}</pre>
              <button onClick={copyMessage} style={{
                padding: "12px 16px", borderRadius: "12px", border: 0,
                background: "#0b3b78", color: "#fff", fontWeight: 800, cursor: "pointer",
              }}>
                {copied ? "Kopyalandı" : "Pazarlık Mesajını Kopyala"}
              </button>
            </section>

            <section style={{ ...cardStyle, marginTop: "24px", padding: "24px", color: "#14233d" }}>
              <h2 style={{ marginTop: 0 }}>AI Analiz Raporu</h2>
              <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.8, color: "#475569" }}>{result.raw}</div>
              <button onClick={() => window.print()} style={{
                marginTop: "18px", padding: "12px 16px", borderRadius: "12px", border: "1px solid #0b3b78",
                background: "#fff", color: "#0b3b78", fontWeight: 800, cursor: "pointer",
              }}>
                PDF / Yazdır
              </button>
            </section>
          </>
        )}

        <footer style={{ textAlign: "center", color: "#a9c8eb", marginTop: "34px", fontSize: "13px" }}>
          Yaşam AI V16 Final • Gayrimenkul karar platformu
        </footer>
      </div>
    </main>
  );
}

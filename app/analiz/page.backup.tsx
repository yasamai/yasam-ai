"use client";

import { FormEvent, useMemo, useState } from "react";

type AnalysisResult = {
  content: string;
};

const initialForm = {
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

    const candidates = [
      obj.result,
      obj.response,
      obj.content,
      obj.message,
      obj.analysis,
      obj.rapor,
      obj.text,
    ];

    for (const value of candidates) {
      if (typeof value === "string" && value.trim()) return value;
    }

    const choices = obj.choices;
    if (Array.isArray(choices) && choices.length > 0) {
      const first = choices[0] as Record<string, unknown>;
      const message = first?.message as Record<string, unknown> | undefined;
      if (typeof message?.content === "string") return message.content;
      if (typeof first?.text === "string") return first.text;
    }

    return JSON.stringify(data, null, 2);
  }

  return "Analiz tamamlandı ancak sonuç metni alınamadı.";
}

export default function AnalizPage() {
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const formattedPrice = useMemo(() => {
    const numeric = Number(form.askingPrice.replace(/\D/g, ""));
    return numeric ? new Intl.NumberFormat("tr-TR").format(numeric) : "";
  }, [form.askingPrice]);

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

    if (!form.neighborhood.trim() || !form.area.trim() || !form.askingPrice.trim()) {
      setError("Mahalle, alan ve satış fiyatı alanlarını doldur.");
      return;
    }

    setLoading(true);

    const prompt = `
Sen Yaşam AI gayrimenkul analiz motorusun.
Aşağıdaki taşınmaz için Türkçe, profesyonel ve anlaşılır bir yatırım analizi hazırla.

İl: ${form.city}
İlçe: ${form.district}
Mahalle: ${form.neighborhood}
Taşınmaz türü: ${form.propertyType}
Alan: ${form.area} m²
Satış fiyatı: ${formattedPrice || form.askingPrice} TL
Ek bilgiler: ${form.notes || "Belirtilmedi"}

Rapor şu başlıkları içersin:
1. Veri Güven Skoru
2. Yatırım Puanı
3. Fırsat Puanı
4. Risk Puanı
5. Likidite Puanı
6. Güçlü Yönler
7. Kritik Riskler
8. 5 Maddelik Eylem Planı
9. Genel Sonuç

Kesin olmayan verileri kesinmiş gibi sunma. Varsayımları açıkça belirt.
`.trim();

    try {
      const content = await requestAnalysis(prompt);
      setResult({ content });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Beklenmeyen bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  }

  function resetAnalysis() {
    setForm(initialForm);
    setResult(null);
    setError("");
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(145deg, #07142f 0%, #0b2f67 45%, #0c4c8a 100%)",
        color: "#ffffff",
        padding: "32px 18px 64px",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <div style={{ width: "100%", maxWidth: "1050px", margin: "0 auto" }}>
        <header style={{ textAlign: "center", marginBottom: "28px" }}>
          <div
            style={{
              display: "inline-block",
              padding: "8px 14px",
              borderRadius: "999px",
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.18)",
              fontSize: "13px",
              fontWeight: 700,
              letterSpacing: "0.5px",
            }}
          >
            YAŞAM AI • PREMIUM ANALİZ
          </div>

          <h1
            style={{
              margin: "16px 0 8px",
              fontSize: "clamp(32px, 6vw, 54px)",
              lineHeight: 1.05,
            }}
          >
            Gayrimenkul Analiz Merkezi
          </h1>

          <p
            style={{
              maxWidth: "720px",
              margin: "0 auto",
              color: "#c8dcf6",
              fontSize: "17px",
              lineHeight: 1.7,
            }}
          >
            Taşınmaz bilgilerini gir. Yaşam AI yatırım fırsatlarını, riskleri ve
            izlenecek yol haritasını tek raporda hazırlasın.
          </p>
        </header>

        <section
          style={{
            background: "rgba(255,255,255,0.97)",
            color: "#14233d",
            borderRadius: "24px",
            padding: "clamp(20px, 4vw, 36px)",
            boxShadow: "0 24px 70px rgba(0,0,0,0.28)",
          }}
        >
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
                  <span style={{ fontSize: "14px", fontWeight: 700 }}>{label}</span>
                  <input
                    value={form[key as keyof typeof form]}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        [key]: event.target.value,
                      }))
                    }
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "14px 15px",
                      borderRadius: "12px",
                      border: "1px solid #cbd8e8",
                      fontSize: "16px",
                      outline: "none",
                    }}
                  />
                </label>
              ))}

              <label style={{ display: "grid", gap: "7px" }}>
                <span style={{ fontSize: "14px", fontWeight: 700 }}>
                  Taşınmaz türü
                </span>
                <select
                  value={form.propertyType}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      propertyType: event.target.value,
                    }))
                  }
                  style={{
                    width: "100%",
                    padding: "14px 15px",
                    borderRadius: "12px",
                    border: "1px solid #cbd8e8",
                    fontSize: "16px",
                    background: "#ffffff",
                  }}
                >
                  <option>Arsa</option>
                  <option>Konut</option>
                  <option>İşyeri</option>
                  <option>Tarla</option>
                  <option>Bina</option>
                </select>
              </label>
            </div>

            <label
              style={{ display: "grid", gap: "7px", marginTop: "16px" }}
            >
              <span style={{ fontSize: "14px", fontWeight: 700 }}>
                Ek bilgiler
              </span>
              <textarea
                value={form.notes}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                placeholder="Konum, cephe, imar durumu, yol genişliği veya önemli diğer bilgiler..."
                rows={4}
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "14px 15px",
                  borderRadius: "12px",
                  border: "1px solid #cbd8e8",
                  fontSize: "16px",
                  resize: "vertical",
                }}
              />
            </label>

            {error && (
              <div
                style={{
                  marginTop: "16px",
                  padding: "13px 15px",
                  borderRadius: "12px",
                  background: "#fff0f0",
                  color: "#a82424",
                  border: "1px solid #f4bcbc",
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
                  ? "#8094ad"
                  : "linear-gradient(90deg, #1456a0, #1a7bc5)",
                color: "#ffffff",
                fontSize: "17px",
                fontWeight: 800,
                cursor: loading ? "wait" : "pointer",
              }}
            >
              {loading ? "Yaşam AI analiz hazırlıyor..." : "Premium Analizi Başlat"}
            </button>
          </form>

          {result && (
            <section
              style={{
                marginTop: "26px",
                padding: "22px",
                borderRadius: "18px",
                background: "#071a38",
                color: "#eaf4ff",
                border: "1px solid #224b7d",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "12px",
                  marginBottom: "16px",
                }}
              >
                <h2 style={{ margin: 0 }}>Yaşam AI Premium Raporu</h2>
                <button
                  type="button"
                  onClick={() => window.print()}
                  style={{
                    padding: "10px 14px",
                    borderRadius: "10px",
                    border: "1px solid #5c83af",
                    background: "#ffffff",
                    color: "#12345d",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  PDF / Yazdır
                </button>
              </div>

              <div
                style={{
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.75,
                  fontSize: "16px",
                }}
              >
                {result.content}
              </div>

              <button
                type="button"
                onClick={resetAnalysis}
                style={{
                  width: "100%",
                  marginTop: "20px",
                  padding: "14px",
                  borderRadius: "12px",
                  border: "1px solid #5c83af",
                  background: "transparent",
                  color: "#ffffff",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Yeni analiz oluştur
              </button>
            </section>
          )}
        </section>
      </div>
    </main>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";

type FormData = {
  il: string;
  ilce: string;
  mahalle: string;
  ada: string;
  parsel: string;
  metrekare: string;
};

const INITIAL_FORM: FormData = {
  il: "",
  ilce: "",
  mahalle: "",
  ada: "",
  parsel: "",
  metrekare: "",
};

const ANALYSIS_STEPS = [
  "Tapu ve parsel bilgileri kontrol ediliyor...",
  "Kadastro verileri değerlendiriliyor...",
  "Konum ve çevre verileri inceleniyor...",
  "İmar ve yapılaşma potansiyeli analiz ediliyor...",
  "Bölgesel emsal değerler karşılaştırılıyor...",
  "Risk ve yatırım potansiyeli hesaplanıyor...",
  "Yaşam AI raporu hazırlanıyor...",
];

const PRICE_PER_SQM = 17450;

export default function AnalizPage() {
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [error, setError] = useState("");
  const [activeStep, setActiveStep] = useState(0);
  const [progress, setProgress] = useState(0);

  const formIsValid = useMemo(
    () => Object.values(form).every((value) => value.trim() !== ""),
    [form],
  );

  const totalEstimatedValue =
    Number(form.metrekare || 0) * PRICE_PER_SQM;

  useEffect(() => {
    if (!loading) return;

    const totalDuration = 7000;
    const startTime = Date.now();

    const timer = window.setInterval(() => {
      const elapsed = Date.now() - startTime;

      const nextProgress = Math.min(
        100,
        Math.round((elapsed / totalDuration) * 100),
      );

      const nextStep = Math.min(
        ANALYSIS_STEPS.length - 1,
        Math.floor((elapsed / totalDuration) * ANALYSIS_STEPS.length),
      );

      setProgress(nextProgress);
      setActiveStep(nextStep);

      if (elapsed >= totalDuration) {
        window.clearInterval(timer);
        setProgress(100);

        window.setTimeout(() => {
          setLoading(false);
          setShowReport(true);
        }, 350);
      }
    }, 100);

    return () => window.clearInterval(timer);
  }, [loading]);

  const updateForm = (field: keyof FormData, value: string) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const startAnalysis = () => {
    if (!formIsValid) {
      setError("Lütfen analiz için bütün alanları doldurun.");
      return;
    }

    setError("");
    setShowReport(false);
    setActiveStep(0);
    setProgress(0);
    setLoading(true);
  };

  const resetAnalysis = () => {
    setForm(INITIAL_FORM);
    setError("");
    setLoading(false);
    setShowReport(false);
    setActiveStep(0);
    setProgress(0);
  };

  const cardStyle: React.CSSProperties = {
    background: "rgba(10, 23, 42, 0.94)",
    border: "1px solid #294464",
    borderRadius: "22px",
    boxShadow: "0 24px 70px rgba(0, 0, 0, 0.35)",
  };

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "16px",
    borderRadius: "12px",
    border: "1px solid #294464",
    background: "#0b1728",
    color: "#ffffff",
    fontSize: "16px",
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "54px 20px 80px",
        color: "#ffffff",
        fontFamily: "Arial, Helvetica, sans-serif",
        background:
          "radial-gradient(circle at top, #153b6f 0%, #08172b 42%, #030914 100%)",
      }}
    >
      <div style={{ width: "100%", maxWidth: "860px", margin: "0 auto" }}>
        <header style={{ textAlign: "center", marginBottom: "38px" }}>
          <div
            style={{
              display: "inline-flex",
              padding: "8px 14px",
              marginBottom: "16px",
              borderRadius: "999px",
              border: "1px solid #315984",
              background: "rgba(18, 49, 86, 0.7)",
              color: "#9ed8ff",
              fontSize: "14px",
              fontWeight: "bold",
            }}
          >
            Yaşam AI Analiz Motoru v2.1
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: "clamp(34px, 6vw, 52px)",
              lineHeight: 1.1,
              color: "#7cc7ff",
            }}
          >
            🤖 Yaşam AI Analiz Merkezi
          </h1>

          <p
            style={{
              maxWidth: "650px",
              margin: "18px auto 0",
              color: "#b9cce1",
              lineHeight: 1.7,
              fontSize: "17px",
            }}
          >
            Taşınmaz bilgilerinizi girin. Yaşam AI konum, değer, risk ve yatırım
            potansiyeli için ilk değerlendirme raporunu hazırlasın.
          </p>
        </header>

        {!loading && !showReport && (
          <section style={{ ...cardStyle, padding: "30px" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: "16px",
              }}
            >
              <input
                placeholder="İl"
                value={form.il}
                onChange={(event) => updateForm("il", event.target.value)}
                style={inputStyle}
              />

              <input
                placeholder="İlçe"
                value={form.ilce}
                onChange={(event) => updateForm("ilce", event.target.value)}
                style={inputStyle}
              />

              <input
                placeholder="Mahalle"
                value={form.mahalle}
                onChange={(event) => updateForm("mahalle", event.target.value)}
                style={inputStyle}
              />

              <input
                placeholder="Ada"
                value={form.ada}
                onChange={(event) => updateForm("ada", event.target.value)}
                style={inputStyle}
              />

              <input
                placeholder="Parsel"
                value={form.parsel}
                onChange={(event) => updateForm("parsel", event.target.value)}
                style={inputStyle}
              />

              <input
                placeholder="Arsa alanı (m²)"
                type="number"
                min="1"
                value={form.metrekare}
                onChange={(event) =>
                  updateForm("metrekare", event.target.value)
                }
                style={inputStyle}
              />
            </div>

            {error && (
              <div
                style={{
                  marginTop: "18px",
                  padding: "14px 16px",
                  borderRadius: "12px",
                  border: "1px solid #ef4444",
                  background: "rgba(127, 29, 29, 0.38)",
                  color: "#fecaca",
                  fontWeight: "bold",
                }}
              >
                ⚠️ {error}
              </div>
            )}

            <button
              type="button"
              onClick={startAnalysis}
              style={{
                width: "100%",
                marginTop: "22px",
                padding: "18px",
                border: "none",
                borderRadius: "14px",
                background: "linear-gradient(90deg, #2563eb, #38bdf8)",
                color: "#ffffff",
                fontSize: "18px",
                fontWeight: "bold",
                cursor: "pointer",
                boxShadow: "0 12px 28px rgba(37, 99, 235, 0.3)",
              }}
            >
              🤖 AI Analizini Başlat
            </button>

            <p
              style={{
                margin: "14px 0 0",
                textAlign: "center",
                color: "#7792af",
                fontSize: "13px",
              }}
            >
              Bu sürüm prototiptir. Resmî veriler sonraki entegrasyonlarda
              doğrulanacaktır.
            </p>
          </section>
        )}

        {loading && (
          <section style={{ ...cardStyle, padding: "34px" }}>
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: "48px",
                  animation: "robotPulse 1.2s ease-in-out infinite",
                }}
              >
                🤖
              </div>

              <h2
                style={{
                  margin: "16px 0 8px",
                  color: "#7cc7ff",
                  fontSize: "28px",
                }}
              >
                Yaşam AI analiz yapıyor
              </h2>

              <p
                style={{
                  minHeight: "28px",
                  margin: 0,
                  color: "#d1e5f8",
                  fontSize: "17px",
                }}
              >
                {ANALYSIS_STEPS[activeStep]}
              </p>
            </div>

            <div style={{ marginTop: "30px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "10px",
                  color: "#9db5cd",
                  fontSize: "14px",
                }}
              >
                <span>Analiz ilerlemesi</span>
                <strong style={{ color: "#7dd3fc" }}>%{progress}</strong>
              </div>

              <div
                style={{
                  width: "100%",
                  height: "14px",
                  background: "#101d30",
                  borderRadius: "999px",
                  overflow: "hidden",
                  border: "1px solid #294464",
                }}
              >
                <div
                  style={{
                    width: `${progress}%`,
                    height: "100%",
                    background: "linear-gradient(90deg, #2563eb, #38bdf8)",
                    borderRadius: "999px",
                    transition: "width 0.18s linear",
                    boxShadow: "0 0 20px rgba(56, 189, 248, 0.45)",
                  }}
                />
              </div>
            </div>

            <div style={{ display: "grid", gap: "10px", marginTop: "28px" }}>
              {ANALYSIS_STEPS.map((step, index) => {
                const completed = index < activeStep;
                const active = index === activeStep;

                return (
                  <div
                    key={step}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      padding: "12px 14px",
                      borderRadius: "12px",
                      border: active
                        ? "1px solid #38bdf8"
                        : "1px solid #1d3450",
                      background: active
                        ? "rgba(14, 116, 144, 0.18)"
                        : "rgba(8, 20, 36, 0.7)",
                      color: completed
                        ? "#86efac"
                        : active
                          ? "#d8f3ff"
                          : "#71869d",
                    }}
                  >
                    <span style={{ width: "22px", textAlign: "center" }}>
                      {completed ? "✓" : active ? "●" : "○"}
                    </span>
                    <span>{step}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {showReport && (
          <section style={{ ...cardStyle, padding: "32px" }}>
            <div style={{ textAlign: "center", marginBottom: "28px" }}>
              <div style={{ fontSize: "44px" }}>📋</div>
              <h2
                style={{
                  margin: "10px 0 6px",
                  color: "#7cc7ff",
                  fontSize: "30px",
                }}
              >
                Yaşam AI Analiz Raporu
              </h2>
              <p style={{ margin: 0, color: "#8fa9c2" }}>
                İlk yatırım ve risk değerlendirmesi
              </p>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
                gap: "14px",
              }}
            >
              {[
                ["📍 Konum", `${form.il} / ${form.ilce}`],
                ["🏘️ Mahalle", form.mahalle],
                ["📐 Ada / Parsel", `${form.ada} / ${form.parsel}`],
                ["📏 Arsa Alanı", `${form.metrekare} m²`],
                [
                  "💰 Tahmini m² Değeri",
                  `${PRICE_PER_SQM.toLocaleString("tr-TR")} TL`,
                ],
                [
                  "🏷️ Tahmini Toplam Değer",
                  `${totalEstimatedValue.toLocaleString("tr-TR")} TL`,
                ],
              ].map(([title, value]) => (
                <div
                  key={title}
                  style={{
                    padding: "18px",
                    borderRadius: "14px",
                    background: "#09172a",
                    border: "1px solid #203c5d",
                  }}
                >
                  <div
                    style={{
                      marginBottom: "8px",
                      color: "#89a6c2",
                      fontSize: "14px",
                    }}
                  >
                    {title}
                  </div>
                  <strong style={{ fontSize: "17px", color: "#ffffff" }}>
                    {value}
                  </strong>
                </div>
              ))}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
                gap: "14px",
                marginTop: "14px",
              }}
            >
              <div
                style={{
                  padding: "20px",
                  borderRadius: "14px",
                  background: "rgba(22, 101, 52, 0.2)",
                  border: "1px solid #26734a",
                }}
              >
                <div style={{ color: "#9be8b7", marginBottom: "8px" }}>
                  📈 Yatırım Skoru
                </div>
                <strong style={{ fontSize: "28px" }}>92 / 100</strong>
              </div>

              <div
                style={{
                  padding: "20px",
                  borderRadius: "14px",
                  background: "rgba(30, 64, 175, 0.2)",
                  border: "1px solid #3157a6",
                }}
              >
                <div style={{ color: "#a8c7ff", marginBottom: "8px" }}>
                  ⚠️ Risk Seviyesi
                </div>
                <strong style={{ fontSize: "28px" }}>Düşük</strong>
              </div>

              <div
                style={{
                  padding: "20px",
                  borderRadius: "14px",
                  background: "rgba(126, 34, 206, 0.18)",
                  border: "1px solid #7540a8",
                }}
              >
                <div style={{ color: "#dfb7ff", marginBottom: "8px" }}>
                  🏗️ İmar Güveni
                </div>
                <strong style={{ fontSize: "22px" }}>Doğrulama Gerekli</strong>
              </div>
            </div>

            <div
              style={{
                marginTop: "22px",
                padding: "24px",
                borderRadius: "16px",
                background: "#071425",
                border: "1px solid #294464",
                lineHeight: 1.8,
              }}
            >
              <strong style={{ color: "#7dd3fc", fontSize: "18px" }}>
                🧠 Yaşam AI Ön Yorumu
              </strong>

              <p style={{ margin: "14px 0 0", color: "#d5e2ef" }}>
                {form.il} ili, {form.ilce} ilçesi, {form.mahalle} Mahallesi’nde
                bulunan {form.ada} ada, {form.parsel} parsel numaralı ve{" "}
                {form.metrekare} m² büyüklüğündeki taşınmaz için ilk
                değerlendirme tamamlandı. Bölgesel gelişim potansiyeli,
                ulaşılabilirlik ve tahmini piyasa değeri birlikte ele
                alındığında yatırım görünümü olumlu değerlendirilmektedir.
                Kesin yatırım kararı öncesinde resmî imar belgesi, kadastro
                sınırları, zemin durumu ve güncel emsal satışların doğrulanması
                gereklidir.
              </p>
            </div>

            <div
              style={{
                marginTop: "18px",
                padding: "16px",
                borderRadius: "12px",
                background: "rgba(120, 53, 15, 0.22)",
                border: "1px solid #8a5a25",
                color: "#fbd7a5",
                fontSize: "14px",
                lineHeight: 1.6,
              }}
            >
              ⚠️ Bu rapordaki fiyat, skor ve risk sonuçları şu an prototip
              değerleridir. Gerçek veri kaynakları ve yapay zekâ entegrasyonu
              sonraki aşamada bağlanacaktır.
            </div>

            <button
              type="button"
              onClick={resetAnalysis}
              style={{
                width: "100%",
                marginTop: "24px",
                padding: "17px",
                border: "none",
                borderRadius: "14px",
                background: "linear-gradient(90deg, #2563eb, #38bdf8)",
                color: "#ffffff",
                fontSize: "17px",
                fontWeight: "bold",
                cursor: "pointer",
              }}
            >
              🔄 Yeni Analiz Yap
            </button>
          </section>
        )}
      </div>

      <style jsx>{`
        @keyframes robotPulse {
          0% {
            transform: scale(1);
            opacity: 0.7;
          }
          50% {
            transform: scale(1.12);
            opacity: 1;
          }
          100% {
            transform: scale(1);
            opacity: 0.7;
          }
        }

        input::placeholder {
          color: #758da5;
        }

        input:focus {
          border-color: #38bdf8 !important;
          box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.12);
        }

        button:hover {
          filter: brightness(1.08);
        }
      `}</style>
    </main>
  );
}

"use client";

import { ChangeEvent, FormEvent, useState } from "react";

type FormBilgileri = {
  il: string;
  ilce: string;
  mahalle: string;
  ada: string;
  parsel: string;
  arsaAlani: string;
};

const ilkForm: FormBilgileri = {
  il: "",
  ilce: "",
  mahalle: "",
  ada: "",
  parsel: "",
  arsaAlani: "",
};

export default function AnalizPage() {
  const [form, setForm] = useState<FormBilgileri>(ilkForm);
  const [rapor, setRapor] = useState("");
  const [hata, setHata] = useState("");
  const [yukleniyor, setYukleniyor] = useState(false);

  function alanGuncelle(event: ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.target;
    setForm((onceki) => ({ ...onceki, [name]: value }));
  }

  async function analizEt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setHata("");
    setRapor("");

    const eksikAlanVar = Object.values(form).some(
      (deger) => deger.trim() === ""
    );

    if (eksikAlanVar) {
      setHata("Lütfen tüm alanları doldurun.");
      return;
    }

    setYukleniyor(true);

    const message = `
Aşağıdaki taşınmaz için profesyonel, temkinli ve anlaşılır bir ön gayrimenkul yatırım analizi hazırla.

İl: ${form.il}
İlçe: ${form.ilce}
Mahalle: ${form.mahalle}
Ada: ${form.ada}
Parsel: ${form.parsel}
Arsa alanı: ${form.arsaAlani} m²

Rapor şu başlıklardan oluşsun:
1. Konum değerlendirmesi
2. Yatırım potansiyeli
3. Avantajlar
4. Riskler
5. Kontrol edilmesi gereken resmî belgeler
6. Değerleme için gerekli ek veriler
7. Sonuç ve öneri

Kesin olmayan imar, tapu, kadastro, zemin ve piyasa bilgilerini gerçekmiş gibi sunma.
Resmî kaynaklardan doğrulama gerektiğini açıkça belirt.
Türkçe, profesyonel ve yatırımcı dostu bir dille yaz.
`.trim();

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Analiz oluşturulamadı.");
      }

      setRapor(data.reply || "Analiz yanıtı alınamadı.");
    } catch (error) {
      setHata(
        error instanceof Error
          ? error.message
          : "Beklenmeyen bir hata oluştu."
      );
    } finally {
      setYukleniyor(false);
    }
  }

  function yeniAnaliz() {
    setForm(ilkForm);
    setRapor("");
    setHata("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "48px 20px",
        color: "#f8fafc",
        background:
          "radial-gradient(circle at top, #123b76 0%, #07152f 42%, #020617 100%)",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      <div style={{ width: "100%", maxWidth: "980px", margin: "0 auto" }}>
        <header style={{ textAlign: "center", marginBottom: "34px" }}>
          <div
            style={{
              display: "inline-block",
              padding: "8px 14px",
              borderRadius: "999px",
              border: "1px solid rgba(56,189,248,.45)",
              background: "rgba(14,116,144,.18)",
              color: "#a5f3fc",
              fontWeight: 700,
              marginBottom: "16px",
            }}
          >
            Yaşam AI Analiz Motoru v3.0
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: "clamp(34px, 6vw, 58px)",
              color: "#7dd3fc",
            }}
          >
            🤖 Yaşam AI Analiz Merkezi
          </h1>

          <p
            style={{
              margin: "16px auto 0",
              maxWidth: "760px",
              color: "#cbd5e1",
              fontSize: "18px",
              lineHeight: 1.7,
            }}
          >
            Taşınmaz bilgilerini girin. Yaşam AI, verdiğiniz bilgilere göre
            profesyonel bir ön yatırım ve risk değerlendirmesi hazırlasın.
          </p>
        </header>

        {!rapor ? (
          <section
            style={{
              padding: "28px",
              borderRadius: "24px",
              border: "1px solid rgba(125,211,252,.35)",
              background: "rgba(15,23,42,.72)",
              boxShadow: "0 20px 70px rgba(2,132,199,.18)",
              backdropFilter: "blur(18px)",
            }}
          >
            <form onSubmit={analizEt}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: "14px",
                }}
              >
                {[
                  ["il", "İl"],
                  ["ilce", "İlçe"],
                  ["mahalle", "Mahalle"],
                  ["ada", "Ada"],
                  ["parsel", "Parsel"],
                  ["arsaAlani", "Arsa alanı (m²)"],
                ].map(([name, placeholder]) => (
                  <input
                    key={name}
                    name={name}
                    value={form[name as keyof FormBilgileri]}
                    onChange={alanGuncelle}
                    placeholder={placeholder}
                    inputMode={name === "arsaAlani" ? "decimal" : undefined}
                    style={{
                      width: "100%",
                      boxSizing: "border-box",
                      padding: "16px",
                      borderRadius: "14px",
                      border: "1px solid rgba(148,163,184,.42)",
                      background: "rgba(15,23,42,.75)",
                      color: "#f8fafc",
                      fontSize: "16px",
                      outline: "none",
                    }}
                  />
                ))}
              </div>

              {hata && (
                <div
                  style={{
                    marginTop: "16px",
                    padding: "14px",
                    borderRadius: "12px",
                    color: "#fecaca",
                    background: "rgba(127,29,29,.35)",
                    border: "1px solid rgba(248,113,113,.45)",
                  }}
                >
                  {hata}
                </div>
              )}

              <button
                type="submit"
                disabled={yukleniyor}
                style={{
                  width: "100%",
                  marginTop: "18px",
                  padding: "17px",
                  border: "none",
                  borderRadius: "14px",
                  cursor: yukleniyor ? "wait" : "pointer",
                  color: "#ffffff",
                  fontWeight: 800,
                  fontSize: "17px",
                  background: yukleniyor
                    ? "#334155"
                    : "linear-gradient(90deg, #2563eb, #06b6d4)",
                  boxShadow: "0 12px 35px rgba(6,182,212,.22)",
                }}
              >
                {yukleniyor
                  ? "Yaşam AI analiz hazırlıyor..."
                  : "🤖 Gerçek AI Analizini Başlat"}
              </button>
            </form>

            <p
              style={{
                margin: "14px 0 0",
                textAlign: "center",
                color: "#94a3b8",
                fontSize: "13px",
              }}
            >
              Bu rapor ön değerlendirmedir. İmar, tapu, kadastro ve piyasa
              verileri resmî kaynaklardan doğrulanmalıdır.
            </p>
          </section>
        ) : (
          <section
            style={{
              padding: "30px",
              borderRadius: "24px",
              border: "1px solid rgba(56,189,248,.35)",
              background: "rgba(15,23,42,.82)",
              boxShadow: "0 20px 70px rgba(2,132,199,.18)",
            }}
          >
            <div style={{ textAlign: "center", marginBottom: "24px" }}>
              <div style={{ fontSize: "42px" }}>📋</div>
              <h2
                style={{
                  margin: "10px 0 6px",
                  color: "#7dd3fc",
                  fontSize: "32px",
                }}
              >
                Yaşam AI Gerçek Analiz Raporu
              </h2>
              <p style={{ margin: 0, color: "#94a3b8" }}>
                {form.il} / {form.ilce} — {form.mahalle}
              </p>
            </div>

            <div
              style={{
                padding: "22px",
                borderRadius: "16px",
                border: "1px solid rgba(56,189,248,.24)",
                background: "rgba(2,6,23,.55)",
                color: "#e2e8f0",
                lineHeight: 1.8,
                whiteSpace: "pre-wrap",
                fontSize: "16px",
              }}
            >
              {rapor}
            </div>

            <div
              style={{
                marginTop: "18px",
                padding: "14px",
                borderRadius: "12px",
                color: "#fbd38d",
                background: "rgba(120,53,15,.22)",
                border: "1px solid rgba(245,158,11,.32)",
                lineHeight: 1.6,
              }}
            >
              ⚠️ Bu rapor yapay zekâ tarafından hazırlanan ön değerlendirmedir;
              yatırım kararı öncesinde resmî belgeler ve uzman görüşüyle
              doğrulanmalıdır.
            </div>

            <button
              type="button"
              onClick={yeniAnaliz}
              style={{
                width: "100%",
                marginTop: "22px",
                padding: "17px",
                border: "none",
                borderRadius: "14px",
                cursor: "pointer",
                color: "#ffffff",
                fontWeight: 800,
                fontSize: "17px",
                background: "linear-gradient(90deg, #2563eb, #06b6d4)",
              }}
            >
              ↻ Yeni Analiz Yap
            </button>
          </section>
        )}
      </div>
    </main>
  );
}

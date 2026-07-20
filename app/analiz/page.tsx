"use client";

import { FormEvent, useState } from "react";

export default function AnalizPage() {
  const [il, setIl] = useState("");
  const [ilce, setIlce] = useState("");
  const [mahalle, setMahalle] = useState("");
  const [ada, setAda] = useState("");
  const [parsel, setParsel] = useState("");
  const [metrekare, setMetrekare] = useState("");

  const [rapor, setRapor] = useState("");
  const [yukleniyor, setYukleniyor] = useState(false);
  const [hata, setHata] = useState("");

  async function analizEt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setYukleniyor(true);
    setHata("");
    setRapor("");

    const message = `
Aşağıdaki taşınmaz için kapsamlı bir ön gayrimenkul yatırım analizi hazırla.

İl: ${il}
İlçe: ${ilce}
Mahalle: ${mahalle}
Ada: ${ada}
Parsel: ${parsel}
Arsa büyüklüğü: ${metrekare} m²

Analizde şu başlıklar yer alsın:
1. Konum değerlendirmesi
2. Yatırım potansiyeli
3. Avantajlar
4. Riskler
5. Kontrol edilmesi gereken resmi belgeler
6. Tahmini yatırım puanı
7. Sonuç ve öneri

Kesin olmayan bilgileri gerçekmiş gibi sunma.
İmar, tapu, kadastro ve piyasa bilgilerinin resmi kaynaklardan doğrulanması gerektiğini açıkça belirt.
Yanıtı Türkçe, anlaşılır ve profesyonel şekilde hazırla.
`;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
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

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f4f7fb",
        padding: "40px 20px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: "900px",
          margin: "0 auto",
        }}
      >
        <div
          style={{
            background: "linear-gradient(135deg, #061b3a, #0d47a1)",
            color: "white",
            padding: "36px",
            borderRadius: "24px",
            marginBottom: "24px",
          }}
        >
          <p
            style={{
              margin: "0 0 8px",
              opacity: 0.8,
              fontWeight: 700,
            }}
          >
            YAŞAM AI
          </p>

          <h1
            style={{
              margin: "0 0 12px",
              fontSize: "36px",
            }}
          >
            Yapay Zekâ Destekli Arsa Analizi
          </h1>

          <p
            style={{
              margin: 0,
              lineHeight: 1.6,
              opacity: 0.9,
            }}
          >
            Taşınmaz bilgilerini girin. Yaşam AI yatırım fırsatlarını,
            riskleri ve kontrol edilmesi gereken noktaları analiz etsin.
          </p>
        </div>

        <form
          onSubmit={analizEt}
          style={{
            background: "white",
            padding: "30px",
            borderRadius: "24px",
            boxShadow: "0 10px 35px rgba(15, 23, 42, 0.08)",
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "16px",
            }}
          >
            <Input
              label="İl"
              value={il}
              onChange={setIl}
              placeholder="Örnek: Adana"
            />

            <Input
              label="İlçe"
              value={ilce}
              onChange={setIlce}
              placeholder="Örnek: Ceyhan"
            />

            <Input
              label="Mahalle"
              value={mahalle}
              onChange={setMahalle}
              placeholder="Örnek: Mithatpaşa"
            />

            <Input
              label="Ada"
              value={ada}
              onChange={setAda}
              placeholder="Örnek: 123"
            />

            <Input
              label="Parsel"
              value={parsel}
              onChange={setParsel}
              placeholder="Örnek: 45"
            />

            <Input
              label="Arsa büyüklüğü (m²)"
              value={metrekare}
              onChange={setMetrekare}
              placeholder="Örnek: 500"
              type="number"
            />
          </div>

          <button
            type="submit"
            disabled={yukleniyor}
            style={{
              width: "100%",
              marginTop: "24px",
              padding: "16px",
              border: "none",
              borderRadius: "14px",
              background: yukleniyor ? "#94a3b8" : "#0d47a1",
              color: "white",
              fontSize: "17px",
              fontWeight: 700,
              cursor: yukleniyor ? "not-allowed" : "pointer",
            }}
          >
            {yukleniyor
              ? "Yaşam AI analiz hazırlıyor..."
              : "Yapay Zekâ Analizini Başlat"}
          </button>
        </form>

        {hata && (
          <div
            style={{
              marginTop: "24px",
              padding: "18px",
              background: "#fee2e2",
              color: "#991b1b",
              borderRadius: "14px",
            }}
          >
            <strong>Hata:</strong> {hata}
          </div>
        )}

        {rapor && (
          <section
            style={{
              marginTop: "24px",
              background: "white",
              padding: "30px",
              borderRadius: "24px",
              boxShadow: "0 10px 35px rgba(15, 23, 42, 0.08)",
            }}
          >
            <h2
              style={{
                marginTop: 0,
                color: "#061b3a",
              }}
            >
              Yaşam AI Ön Analiz Raporu
            </h2>

            <div
              style={{
                whiteSpace: "pre-wrap",
                lineHeight: 1.8,
                color: "#334155",
              }}
            >
              {rapor}
            </div>

            <p
              style={{
                marginTop: "24px",
                paddingTop: "18px",
                borderTop: "1px solid #e2e8f0",
                color: "#64748b",
                fontSize: "13px",
              }}
            >
              Bu rapor yapay zekâ destekli bir ön değerlendirmedir. Tapu,
              imar, kadastro, belediye ve piyasa verileri resmi kaynaklardan
              doğrulanmalıdır.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}

type InputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
};

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: InputProps) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        color: "#1e293b",
        fontWeight: 700,
      }}
    >
      {label}

      <input
        type={type}
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        style={{
          padding: "14px",
          border: "1px solid #cbd5e1",
          borderRadius: "12px",
          fontSize: "16px",
          outline: "none",
        }}
      />
    </label>
  );
}
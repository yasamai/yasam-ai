"use client";

import { useState } from "react";

export default function AnalizPage() {
  const [loading, setLoading] = useState(false);
  const [showReport, setShowReport] = useState(false);

  const analizBaslat = () => {
    setLoading(true);

    setTimeout(() => {
      setLoading(false);
      setShowReport(true);
    }, 3000);
  };

  const inputStyle = {
    width: "100%",
    padding: "16px",
    marginBottom: "16px",
    borderRadius: "12px",
    border: "1px solid #2c2c2c",
    background: "#171717",
    color: "white",
    fontSize: "16px",
    outline: "none",
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0d1117",
        color: "white",
        padding: "60px 20px",
        fontFamily: "Arial",
      }}
    >
      <div
        style={{
          maxWidth: "700px",
          margin: "0 auto",
        }}
      >
        <h1
          style={{
            color: "#53ff6b",
            fontSize: "42px",
            textAlign: "center",
            marginBottom: "10px",
          }}
        >
          🤖 Yaşam AI Analiz Merkezi
        </h1>

        <p
          style={{
            textAlign: "center",
            color: "#bbbbbb",
            marginBottom: "40px",
          }}
        >
          Arsanızı saniyeler içerisinde yapay zekâ analiz etsin.
        </p>

        {!showReport && (
          <>
            <input placeholder="İl" style={inputStyle} />

            <input placeholder="İlçe" style={inputStyle} />

            <input placeholder="Mahalle" style={inputStyle} />

            <input placeholder="Ada" style={inputStyle} />

            <input placeholder="Parsel" style={inputStyle} />

            <input placeholder="m²" style={inputStyle} />

            <button
              onClick={analizBaslat}
              style={{
                width: "100%",
                padding: "18px",
                background: "#38ef65",
                color: "black",
                border: "none",
                borderRadius: "12px",
                fontSize: "18px",
                cursor: "pointer",
                fontWeight: "bold",
              }}
            >
              🤖 AI Analizini Başlat
            </button>
          </>
        )}

        {loading && (
          <div
            style={{
              textAlign: "center",
              marginTop: "60px",
            }}
          >
            <h2>🤖 Yapay Zekâ Analiz Yapıyor...</h2>

            <p
              style={{
                color: "#8d8d8d",
                marginTop: "20px",
              }}
            >
              Kadastro verileri okunuyor...
            </p><div
              style={{
                width: "100%",
                height: "12px",
                background: "#1f2937",
                borderRadius: "999px",
                overflow: "hidden",
                marginTop: "20px",
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  background: "#22c55e",
                  animation: "pulse 1.2s infinite",
                }}
              />
            </div>
          </div>
        )}

        {showReport && (
          <div
            style={{
              marginTop: "40px",
              background: "#111827",
              border: "1px solid #1f2937",
              borderRadius: "16px",
              padding: "30px",
            }}
          >
            <h2
              style={{
                color: "#22c55e",
                textAlign: "center",
                marginBottom: "30px",
              }}
            >
              📋 Yaşam AI Analiz Raporu
            </h2>

            <div
              style={{
                display: "grid",
                gap: "18px",
              }}
            >
              <div>📍 <strong>İl:</strong> Adana</div>

              <div>🏙️ <strong>İlçe:</strong> Ceyhan</div>

              <div>💰 <strong>Tahmini m² Değeri:</strong> 17.450 TL</div>

              <div>📈 <strong>Yatırım Skoru:</strong> 92 / 100</div>

              <div>⚠️ <strong>Risk:</strong> Düşük</div>

              <div>🛣️ <strong>Ulaşım:</strong> Çok İyi</div>

              <div>🏗️ <strong>İmar:</strong> Konut Alanı</div><div
                style={{
                  marginTop: "20px",
                  padding: "20px",
                  background: "#0f172a",
                  borderRadius: "12px",
                  lineHeight: "1.8",
                }}
              >
                <strong>🧠 AI Yorumu</strong>

                <p style={{ marginTop: "12px", color: "#d1d5db" }}>
                  Analiz edilen taşınmaz; konumu, ulaşım bağlantıları ve mevcut
                  gelişim potansiyeli dikkate alındığında yatırım açısından
                  güçlü görünmektedir. Bölgenin orta ve uzun vadede değer
                  kazanma ihtimali yüksektir. Gerçek piyasa verileri, belediye
                  kayıtları ve uydu analizleri eklendiğinde rapor daha da
                  detaylandırılacaktır.
                </p>
              </div>

              <button
                onClick={() => {
                  setShowReport(false);
                }}
                style={{
                  marginTop: "30px",
                  width: "100%",
                  padding: "16px",
                  borderRadius: "12px",
                  border: "none",
                  background: "#22c55e",
                  color: "#000",
                  fontWeight: "bold",
                  fontSize: "17px",
                  cursor: "pointer",
                }}
              >
                🔄 Yeni Analiz Yap
              </button>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes pulse {
          0% {
            transform: scaleX(0.2);
            opacity: 0.5;
          }
          50% {
            transform: scaleX(1);
            opacity: 1;
          }
          100% {
            transform: scaleX(0.2);
            opacity: 0.5;
          }
        }
      `}</style>
    </main>
  );
}
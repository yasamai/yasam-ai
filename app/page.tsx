export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0b1220",
        color: "white",
        fontFamily: "Arial, sans-serif",
      }}
    >
      {/* ÜST MENÜ */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "20px 40px",
          borderBottom: "1px solid #1f2937",
        }}
      >
        <h2 style={{ color: "#22c55e", margin: 0 }}>
          🏡 Yaşam AI
        </h2>

        <nav style={{ display: "flex", gap: "24px" }}>
          <span>Ana Sayfa</span>
          <span>Analiz</span>
          <span>İlanlar</span>
          <span>Hakkımızda</span>
          <span>İletişim</span>
        </nav>
      </header>

      {/* HERO */}
      <section
        style={{
          textAlign: "center",
          padding: "90px 20px 60px",
        }}
      >
        <h1
          style={{
            fontSize: "56px",
            color: "#22c55e",
            marginBottom: "20px",
          }}
        >
          Türkiye'nin Yapay Zekâ Destekli
          <br />
          Gayrimenkul Platformu
        </h1>

        <p
          style={{
            maxWidth: "750px",
            margin: "0 auto",
            color: "#cbd5e1",
            fontSize: "20px",
            lineHeight: "1.8",
          }}
        >
          Arsa, daire ve yatırım fırsatlarını saniyeler içinde analiz edin.
          Yapay zekâ destekli raporlarla daha doğru kararlar verin.
        </p>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "20px",
            marginTop: "40px",
            flexWrap: "wrap",
          }}
        >
          <button
            style={{
              background: "#22c55e",
              color: "#000",
              border: "none",
              padding: "16px 34px",
              borderRadius: "12px",
              fontWeight: "bold",
              cursor: "pointer",
              fontSize: "18px",
            }}
          >
            🏡 Arsamı Analiz Et
          </button>

          <button
            style={{
              background: "#1e293b",
              color: "white",
              border: "1px solid #334155",
              padding: "16px 34px",
              borderRadius: "12px",
              cursor: "pointer",
              fontSize: "18px",
            }}
          >
            💰 Evimin Değerini Öğren
          </button>
        </div>
      </section>

      {/* ÖZELLİKLER */}
      <section
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "20px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))",
          gap: "20px",
        }}
      >
        {[
          {
            title: "🤖 AI Arsa Analizi",
            text: "Ada, parsel ve konum bilgileriyle akıllı analiz.",
          },
          {
            title: "📍 Bölge Analizi",
            text: "Mahalle, ulaşım ve çevre değerlendirmesi.",
          },
          {
            title: "📈 Yatırım Skoru",
            text: "Yatırım potansiyelini yapay zekâ hesaplar.",
          },
          {
            title: "🛡️ Risk Analizi",
            text: "Riskleri tek raporda görün.",
          },
        ].map((card) => (
          <div
            key={card.title}
            style={{
              background: "#111827",
              padding: "24px",
              borderRadius: "18px",
              border: "1px solid #1f2937",
            }}
          >
            <h3>{card.title}</h3>

            <p style={{ color: "#94a3b8" }}>
              {card.text}
            </p>
          </div>
        ))}
      </section>

      {/* ALT BÖLÜM */}
      <section
        style={{
          textAlign: "center",
          padding: "80px 20px",
        }}
      >
        <h2 style={{ color: "#22c55e", fontSize: "38px" }}>
          Gayrimenkul Kararlarınızı
          <br />
          Yapay Zekâ ile Güçlendirin
        </h2>

        <p
          style={{
            color: "#94a3b8",
            maxWidth: "700px",
            margin: "20px auto",
          }}
        >
          Yaşam AI; yatırım, değerleme, analiz ve karar süreçlerini tek
          platformda birleştirir.
        </p>
      </section>
    </main>
  );
}
import Link from "next/link";

const features = [
  {
    title: "AI Destekli Değerleme",
    description:
      "Taşınmazın fiyat uygunluğunu, yatırım potansiyelini ve risklerini tek ekranda değerlendirin.",
  },
  {
    title: "Karar Puanları",
    description:
      "Veri güveni, yatırım, fırsat, risk ve likidite puanlarıyla daha bilinçli karar verin.",
  },
  {
    title: "Premium Rapor",
    description:
      "Güçlü yönleri, kritik riskleri ve uygulanabilir eylem planını içeren kapsamlı rapor oluşturun.",
  },
];

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top left, rgba(45, 108, 223, 0.18), transparent 34%), linear-gradient(135deg, #06111f 0%, #0b1f36 52%, #07121f 100%)",
        color: "#ffffff",
        fontFamily:
          "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <section
        style={{
          width: "min(1180px, calc(100% - 32px))",
          margin: "0 auto",
          padding: "28px 0 72px",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "20px",
            padding: "10px 0 44px",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "12px",
                letterSpacing: "0.22em",
                color: "#8db8ff",
                fontWeight: 800,
              }}
            >
              YAŞAM AI
            </div>
            <div
              style={{
                marginTop: "5px",
                fontSize: "20px",
                fontWeight: 800,
              }}
            >
              Gayrimenkul Karar Platformu
            </div>
          </div>

          <Link
            href="/analiz"
            style={{
              textDecoration: "none",
              color: "#ffffff",
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: "14px",
              padding: "12px 18px",
              fontWeight: 750,
              background: "rgba(255,255,255,0.06)",
            }}
          >
            Analiz Ekranına Git
          </Link>
        </header>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "34px",
            alignItems: "center",
            padding: "44px 0 58px",
          }}
        >
          <div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 12px",
                borderRadius: "999px",
                background: "rgba(78, 141, 255, 0.14)",
                border: "1px solid rgba(119, 166, 255, 0.3)",
                color: "#b9d3ff",
                fontSize: "13px",
                fontWeight: 750,
              }}
            >
              Türkiye’nin güvenilir gayrimenkul karar altyapısı
            </div>

            <h1
              style={{
                margin: "22px 0 18px",
                fontSize: "clamp(42px, 7vw, 78px)",
                lineHeight: 0.98,
                letterSpacing: "-0.045em",
                maxWidth: "760px",
              }}
            >
              Bir ilan bulmaktan fazlası.
              <span
                style={{
                  display: "block",
                  color: "#8bb7ff",
                  marginTop: "10px",
                }}
              >
                Doğru kararı verin.
              </span>
            </h1>

            <p
              style={{
                margin: 0,
                maxWidth: "720px",
                color: "#b9c6d6",
                fontSize: "18px",
                lineHeight: 1.75,
              }}
            >
              Yaşam AI; fiyat uygunluğu, veri güveni, yatırım potansiyeli,
              riskler ve likiditeyi tek bir karar ekranında birleştirir.
              Gayrimenkul kararlarınızı tahminle değil, analizle yönetin.
            </p>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "14px",
                marginTop: "30px",
              }}
            >
              <Link
                href="/analiz"
                style={{
                  textDecoration: "none",
                  color: "#06111f",
                  background: "#ffffff",
                  borderRadius: "15px",
                  padding: "15px 22px",
                  fontWeight: 850,
                  boxShadow: "0 16px 42px rgba(0,0,0,0.28)",
                }}
              >
                AI Analizini Başlat
              </Link>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  color: "#90a3bb",
                  fontSize: "14px",
                  padding: "0 4px",
                }}
              >
                V41 • Faz 2’ye hazır altyapı
              </div>
            </div>
          </div>

          <div
            style={{
              borderRadius: "28px",
              padding: "24px",
              background:
                "linear-gradient(145deg, rgba(255,255,255,0.11), rgba(255,255,255,0.045))",
              border: "1px solid rgba(255,255,255,0.13)",
              boxShadow: "0 28px 90px rgba(0,0,0,0.32)",
              backdropFilter: "blur(16px)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "22px",
              }}
            >
              <div>
                <div style={{ color: "#8fa5bf", fontSize: "13px" }}>
                  Örnek karar özeti
                </div>
                <div
                  style={{
                    marginTop: "5px",
                    fontSize: "22px",
                    fontWeight: 850,
                  }}
                >
                  Ceyhan / Konut Analizi
                </div>
              </div>
              <div
                style={{
                  padding: "8px 11px",
                  borderRadius: "12px",
                  background: "rgba(74, 222, 128, 0.12)",
                  color: "#8df0b0",
                  fontSize: "12px",
                  fontWeight: 850,
                }}
              >
                PAZARLIK ET
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: "12px",
              }}
            >
              {[
                ["Veri Güven Skoru", "87"],
                ["Yatırım Puanı", "82"],
                ["Fırsat Puanı", "79"],
                ["Likidite Puanı", "76"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  style={{
                    borderRadius: "17px",
                    padding: "17px",
                    background: "rgba(5, 16, 29, 0.5)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  <div style={{ color: "#8fa5bf", fontSize: "12px" }}>
                    {label}
                  </div>
                  <div
                    style={{
                      marginTop: "7px",
                      fontSize: "30px",
                      fontWeight: 900,
                    }}
                  >
                    {value}
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                marginTop: "14px",
                borderRadius: "17px",
                padding: "18px",
                background: "rgba(246, 190, 71, 0.1)",
                border: "1px solid rgba(246, 190, 71, 0.18)",
              }}
            >
              <div
                style={{
                  color: "#f8d27d",
                  fontSize: "12px",
                  fontWeight: 850,
                }}
              >
                AI KARAR NOTU
              </div>
              <p
                style={{
                  margin: "8px 0 0",
                  color: "#d7dfeb",
                  lineHeight: 1.65,
                }}
              >
                Mevcut veriler, talep edilen fiyat üzerinden %5–%8 pazarlık
                alanı olabileceğini gösteriyor.
              </p>
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "16px",
          }}
        >
          {features.map((feature) => (
            <article
              key={feature.title}
              style={{
                padding: "22px",
                borderRadius: "20px",
                background: "rgba(255,255,255,0.055)",
                border: "1px solid rgba(255,255,255,0.09)",
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: "18px",
                }}
              >
                {feature.title}
              </h2>
              <p
                style={{
                  margin: "10px 0 0",
                  color: "#9fb0c4",
                  lineHeight: 1.65,
                }}
              >
                {feature.description}
              </p>
            </article>
          ))}
        </div>

        <footer
          style={{
            marginTop: "54px",
            paddingTop: "24px",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            color: "#71839a",
            fontSize: "13px",
          }}
        >
          Yaşam AI • Gayrimenkulde doğru kararın yeni altyapısı
        </footer>
      </section>
    </main>
  );
}

"use client";

type AnalysisHeaderProps = {
  title?: string;
  location?: string;
  propertyType?: string;
  dataTrustScore?: number;
  analysisDate?: string;
  aiStatus?: "ready" | "processing" | "limited";
};

export default function AnalysisHeader({
  title = "Yaşam AI Premium Gayrimenkul Analizi",
  location = "Konum bilgisi hazırlanıyor",
  propertyType = "Gayrimenkul",
  dataTrustScore = 88,
  analysisDate = new Date().toLocaleDateString("tr-TR"),
  aiStatus = "ready",
}: AnalysisHeaderProps) {
  const safeScore = Math.min(100, Math.max(0, dataTrustScore));

  const statusContent = {
    ready: {
      label: "AI Analizi Hazır",
      background: "#dcfce7",
      color: "#166534",
      dot: "#22c55e",
    },
    processing: {
      label: "AI Analizi Sürüyor",
      background: "#fef3c7",
      color: "#92400e",
      dot: "#f59e0b",
    },
    limited: {
      label: "Sınırlı Veri",
      background: "#fee2e2",
      color: "#991b1b",
      dot: "#ef4444",
    },
  }[aiStatus];

  return (
    <section
      style={{
        marginBottom: "24px",
        padding: "26px",
        borderRadius: "24px",
        color: "#ffffff",
        background:
          "linear-gradient(135deg, #071a3d 0%, #0f2742 48%, #174a70 100%)",
        boxShadow: "0 20px 50px rgba(7, 26, 61, 0.22)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: "220px",
          height: "220px",
          right: "-80px",
          top: "-100px",
          borderRadius: "999px",
          background: "rgba(56, 189, 248, 0.12)",
        }}
      />

      <div
        style={{
          position: "relative",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "22px",
          flexWrap: "wrap",
        }}
      >
        <div style={{ flex: "1 1 420px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              flexWrap: "wrap",
              marginBottom: "15px",
            }}
          >
            <span
              style={{
                padding: "7px 12px",
                borderRadius: "999px",
                background:
                  "linear-gradient(135deg, #f5d76e 0%, #c99b2e 100%)",
                color: "#172033",
                fontSize: "12px",
                fontWeight: 800,
                letterSpacing: "0.5px",
              }}
            >
              YAŞAM AI GOLD
            </span>

            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "7px",
                padding: "7px 12px",
                borderRadius: "999px",
                background: statusContent.background,
                color: statusContent.color,
                fontSize: "12px",
                fontWeight: 700,
              }}
            >
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "999px",
                  background: statusContent.dot,
                }}
              />
              {statusContent.label}
            </span>
          </div>

          <h1
            style={{
              margin: 0,
              fontSize: "clamp(25px, 4vw, 40px)",
              lineHeight: 1.15,
              letterSpacing: "-0.8px",
            }}
          >
            {title}
          </h1>

          <p
            style={{
              margin: "14px 0 0",
              color: "#cbd5e1",
              fontSize: "15px",
              lineHeight: 1.7,
            }}
          >
            {location} · {propertyType}
          </p>

          <p
            style={{
              margin: "7px 0 0",
              color: "#94a3b8",
              fontSize: "13px",
            }}
          >
            Analiz tarihi: {analysisDate}
          </p>
        </div>

        <div
          style={{
            minWidth: "210px",
            padding: "18px",
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: "20px",
            background: "rgba(255,255,255,0.08)",
            backdropFilter: "blur(10px)",
          }}
        >
          <div
            style={{
              color: "#cbd5e1",
              fontSize: "13px",
              fontWeight: 700,
              marginBottom: "8px",
            }}
          >
            Veri Güven Skoru
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: "5px",
              marginBottom: "13px",
            }}
          >
            <strong
              style={{
                fontSize: "39px",
                lineHeight: 1,
              }}
            >
              {safeScore}
            </strong>

            <span
              style={{
                color: "#94a3b8",
                fontSize: "15px",
                paddingBottom: "4px",
              }}
            >
              /100
            </span>
          </div>

          <div
            style={{
              width: "100%",
              height: "9px",
              borderRadius: "999px",
              background: "rgba(255,255,255,0.15)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${safeScore}%`,
                height: "100%",
                borderRadius: "999px",
                background:
                  "linear-gradient(90deg, #38bdf8 0%, #22c55e 100%)",
              }}
            />
          </div>

          <p
            style={{
              margin: "11px 0 0",
              color: "#cbd5e1",
              fontSize: "12px",
              lineHeight: 1.5,
            }}
          >
            Kullanıcı girdileri, AI değerlendirmesi ve mevcut veri kaynakları
            birlikte analiz edilmiştir.
          </p>
        </div>
      </div>
    </section>
  );
}
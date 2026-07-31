"use client";

type DecisionLevel = "BUY" | "NEGOTIATE" | "WAIT" | "AVOID";

type Props = {
  decision: DecisionLevel;
  headline: string;
  summary: string;
  offerRange?: string;
  confidence?: number;
};

const labels: Record<DecisionLevel, string> = {
  BUY: "ALIM İÇİN UYGUN",
  NEGOTIATE: "PAZARLIK YAP",
  WAIT: "BEKLE",
  AVOID: "UZAK DUR",
};

export default function DecisionSummaryCard({
  decision,
  headline,
  summary,
  offerRange,
  confidence = 85,
}: Props) {
  const safeConfidence = Math.min(100, Math.max(0, confidence));

  return (
    <section style={{
      marginTop: "24px", padding: "24px", borderRadius: "22px",
      border: "1px solid #dbeafe", background: "#ffffff",
      boxShadow: "0 16px 40px rgba(15,23,42,.08)"
    }}>
      <span style={{
        display: "inline-flex", padding: "8px 12px", borderRadius: "999px",
        background: "#dbeafe", color: "#1d4ed8", fontSize: "12px", fontWeight: 900
      }}>{labels[decision]}</span>

      <h2 style={{ margin: "15px 0 0", color: "#0f172a", fontSize: "27px" }}>{headline}</h2>
      <p style={{ margin: "12px 0 0", color: "#475569", fontSize: "14px", lineHeight: 1.75 }}>{summary}</p>

      {offerRange ? (
        <div style={{ marginTop: "16px", padding: "13px 15px", borderRadius: "14px", background: "#f1f5f9", fontWeight: 800 }}>
          Önerilen teklif aralığı: {offerRange}
        </div>
      ) : null}

      <div style={{ marginTop: "16px", color: "#334155", fontWeight: 700 }}>
        AI güven düzeyi: %{safeConfidence}
      </div>
    </section>
  );
}

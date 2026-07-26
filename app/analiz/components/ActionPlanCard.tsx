"use client";

type Props = {
  items: string[];
  title?: string;
};

export default function ActionPlanCard({
  items,
  title = "5 Maddelik Eylem Planı",
}: Props) {
  return (
    <section style={{
      marginTop: "24px", padding: "24px", borderRadius: "22px",
      background: "#ffffff", border: "1px solid #e2e8f0",
      boxShadow: "0 14px 35px rgba(15,23,42,.06)"
    }}>
      <h2 style={{ margin: 0, color: "#0f172a", fontSize: "23px" }}>{title}</h2>
      <div style={{ display: "grid", gap: "12px", marginTop: "17px" }}>
        {items.slice(0, 5).map((item, index) => (
          <div key={`${index}-${item}`} style={{
            display: "grid", gridTemplateColumns: "38px 1fr", gap: "12px",
            alignItems: "start", padding: "14px", borderRadius: "15px",
            background: "#f8fafc", border: "1px solid #e2e8f0"
          }}>
            <div style={{
              display: "grid", placeItems: "center", width: "38px", height: "38px",
              borderRadius: "12px", background: "#0f2742", color: "#ffffff", fontWeight: 900
            }}>{index + 1}</div>
            <p style={{ margin: 0, color: "#334155", fontSize: "14px", lineHeight: 1.65 }}>{item}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

"use client";

type ScoreTone = "positive" | "warning" | "danger" | "info";
type Props = { title: string; value: number; description: string; tone?: ScoreTone; suffix?: string };
const tones = {
  positive: { bg: "#ecfdf5", border: "#bbf7d0", accent: "#16a34a", text: "#166534" },
  warning: { bg: "#fffbeb", border: "#fde68a", accent: "#d97706", text: "#92400e" },
  danger: { bg: "#fef2f2", border: "#fecaca", accent: "#dc2626", text: "#991b1b" },
  info: { bg: "#eff6ff", border: "#bfdbfe", accent: "#2563eb", text: "#1d4ed8" },
} satisfies Record<ScoreTone, { bg: string; border: string; accent: string; text: string }>;
export default function PremiumScoreCard({ title, value, description, tone = "info", suffix = "/100" }: Props) {
  const safe = Math.min(100, Math.max(0, Number(value) || 0)); const p = tones[tone];
  return <article style={{ padding: "20px", borderRadius: "20px", border: `1px solid ${p.border}`, background: `linear-gradient(145deg,${p.bg},#fff)`, boxShadow: "0 12px 30px rgba(15,23,42,.07)" }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: "16px" }}><div><p style={{ margin: 0, color: "#475569", fontSize: "13px", fontWeight: 800 }}>{title}</p><div style={{ display: "flex", alignItems: "flex-end", gap: "5px", marginTop: "10px" }}><strong style={{ color: p.text, fontSize: "38px", lineHeight: 1 }}>{safe}</strong><span style={{ color: "#94a3b8", fontSize: "13px", paddingBottom: "4px" }}>{suffix}</span></div></div><span style={{ width: "12px", height: "12px", borderRadius: "999px", background: p.accent, boxShadow: `0 0 0 7px ${p.border}`, marginTop: "5px" }} /></div>
    <div style={{ width: "100%", height: "8px", marginTop: "16px", borderRadius: "999px", background: "#e2e8f0", overflow: "hidden" }}><div style={{ width: `${safe}%`, height: "100%", borderRadius: "999px", background: p.accent }} /></div>
    <p style={{ margin: "14px 0 0", color: "#64748b", fontSize: "13px", lineHeight: 1.6 }}>{description}</p>
  </article>;
}

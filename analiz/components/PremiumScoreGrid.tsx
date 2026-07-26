"use client";
import PremiumScoreCard from "./PremiumScoreCard";
export type ScoreItem = { title: string; value: number; description: string; tone?: "positive" | "warning" | "danger" | "info" };
type Props = { scores: ScoreItem[]; title?: string; subtitle?: string };
export default function PremiumScoreGrid({ scores, title = "AI Karar Puanları", subtitle = "Yatırım, risk, fırsat, likidite ve veri güveni tek ekranda değerlendirilir." }: Props) {
  return <section style={{ marginTop: "24px", marginBottom: "30px" }}><h2 style={{ margin: 0, color: "#f8fafc", fontSize: "24px" }}>{title}</h2><p style={{ margin: "7px 0 16px", color: "#cbd5e1", fontSize: "14px", lineHeight: 1.6 }}>{subtitle}</p><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: "16px" }}>{scores.map((s) => <PremiumScoreCard key={s.title} {...s} />)}</div></section>;
}

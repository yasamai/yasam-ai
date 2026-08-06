import { emptyScores } from "../constants";
import type { ScoreMap } from "../types";

export function extractText(data: unknown): string {
  if (typeof data === "string") return data;
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    for (const key of ["rapor", "result", "content", "message", "analysis", "response", "text"]) {
      const value = obj[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return "";
}

function extractScore(report: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = report.match(pattern);
    if (match?.[1]) {
      const score = Number(match[1]);
      if (Number.isFinite(score)) return Math.min(100, Math.max(0, score));
    }
  }
  return null;
}

export function scoresFromReport(report: string): ScoreMap {
  if (!report) return emptyScores;
  return {
    trust: extractScore(report, [/(?:Veri Güven Skoru|Güven Skoru)[\s\S]{0,50}?(?:Puan\s*[:\-]?\s*)?(\d{1,3})\s*\/?\s*100/i]),
    investment: extractScore(report, [/(?:Yatırım Puanı|Yatırım Skoru)[\s\S]{0,50}?(?:Puan\s*[:\-]?\s*)?(\d{1,3})\s*\/?\s*100/i]),
    opportunity: extractScore(report, [/(?:Fırsat Puanı|Fırsat Skoru)[\s\S]{0,50}?(?:Puan\s*[:\-]?\s*)?(\d{1,3})\s*\/?\s*100/i]),
    risk: extractScore(report, [/(?:Risk Puanı|Risk Skoru)[\s\S]{0,50}?(?:Puan\s*[:\-]?\s*)?(\d{1,3})\s*\/?\s*100/i]),
    liquidity: extractScore(report, [/(?:Likidite Puanı|Likidite Skoru)[\s\S]{0,50}?(?:Puan\s*[:\-]?\s*)?(\d{1,3})\s*\/?\s*100/i]),
  };
}

export function decisionFromReport(report: string) {
  const match = report.match(/(?:Nihai Karar|Yaşam AI Kararı|Karar)\s*[:\-]?\s*(AL|PAZARLIK YAP|BEKLE|UZAK DUR|RİSKLİ)/i);
  return match?.[1]?.toLocaleUpperCase("tr-TR") ?? "DEĞERLENDİR";
}

export function decisionTone(decision: string) {
  const upper = decision.toLocaleUpperCase("tr-TR");
  if (upper === "AL") return { background: "#e9fff5", borderColor: "#8be1bd", color: "#047857" };
  if (upper.includes("PAZARLIK")) return { background: "#fff8e8", borderColor: "#f5ca72", color: "#9a5b00" };
  if (upper.includes("UZAK") || upper.includes("RİSKLİ")) return { background: "#fff0f2", borderColor: "#f3a6b1", color: "#b42338" };
  if (upper.includes("BEKLE")) return { background: "#f3f0ff", borderColor: "#c4b5fd", color: "#6d28d9" };
  return { background: "#eef5ff", borderColor: "#a9c7f5", color: "#285c9f" };
}

export function scoreTone(score: number | null, inverse = false) {
  if (score === null) return { color: "#73869b", background: "#edf2f7" };
  const effective = inverse ? 100 - score : score;
  if (effective >= 75) return { color: "#047857", background: "#e9fff5" };
  if (effective >= 50) return { color: "#9a5b00", background: "#fff8e8" };
  return { color: "#b42338", background: "#fff0f2" };
}

export function average(values: Array<number | null>) {
  const clean = values.filter((value): value is number => value !== null);
  if (!clean.length) return null;
  return Math.round(clean.reduce((sum, value) => sum + value, 0) / clean.length);
}

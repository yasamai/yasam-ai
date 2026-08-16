import { NextResponse } from "next/server";

const planKeys = {
  premium_monthly: "IYZICO_PREMIUM_MONTHLY_PLAN",
  premium_yearly: "IYZICO_PREMIUM_YEARLY_PLAN",
  gold_monthly: "IYZICO_GOLD_MONTHLY_PLAN",
  gold_yearly: "IYZICO_GOLD_YEARLY_PLAN",
} as const;

export async function GET() {
  const plans = Object.fromEntries(
    Object.entries(planKeys).map(([key, envName]) => [key, Boolean(process.env[envName])]),
  );
  const credentialsReady = Boolean(
    process.env.IYZICO_API_KEY &&
    process.env.IYZICO_SECRET_KEY &&
    process.env.IYZICO_MERCHANT_ID &&
    process.env.SUPABASE_SECRET_KEY,
  );
  return NextResponse.json({
    provider: "iyzico",
    environment: (process.env.IYZICO_BASE_URL || "").includes("sandbox") ? "sandbox" : "production",
    credentialsReady,
    plans,
  });
}

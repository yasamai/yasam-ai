import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const checks = {
    supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabasePublishableKey: Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
    openAiKey: Boolean(process.env.OPENAI_API_KEY),
  };

  const healthy = checks.supabaseUrl && checks.supabasePublishableKey;
  return NextResponse.json(
    {
      service: "yasam-ai",
      version: process.env.npm_package_version ?? "5.3.0",
      status: healthy ? "ok" : "degraded",
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}

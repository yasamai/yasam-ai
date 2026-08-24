import { NextResponse } from "next/server";
import { iyzicoPost } from "../../../../../lib/iyzico-server";
import { getUserFromBearer, supabaseAdmin } from "../../../../../lib/supabase-admin";

export async function POST(request: Request) {
  const user = await getUserFromBearer(request);
  if (!user) {
    return NextResponse.json({ error: "Oturum doğrulanamadı." }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("subscription_profiles")
    .select("status,provider_subscription_ref")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json(
      { error: `Abonelik profili okunamadı: ${profileError.message}` },
      { status: 500 },
    );
  }

  const subscriptionReferenceCode = String(profile?.provider_subscription_ref || "");
  if (!subscriptionReferenceCode) {
    return NextResponse.json(
      { error: "Aktif iyzico abonelik referansı bulunamadı." },
      { status: 409 },
    );
  }

  if (String(profile?.status || "") === "canceled") {
    return NextResponse.json({ ok: true, status: "canceled", alreadyCanceled: true });
  }

  const providerPath =
    `/v2/subscription/subscriptions/${encodeURIComponent(subscriptionReferenceCode)}/cancel`;

  const { response, data } = await iyzicoPost(providerPath, {
    subscriptionReferenceCode,
  });

  if (!response.ok || data?.status !== "success") {
    return NextResponse.json(
      {
        error: data?.errorMessage || "iyzico abonelik iptali başarısız.",
        provider: data,
      },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabaseAdmin
    .from("subscription_profiles")
    .update({
      status: "canceled",
      cancel_at_period_end: false,
      pending_plan: null,
      pending_change_mode: null,
      updated_at: now,
    })
    .eq("user_id", user.id);

  if (updateError) {
    return NextResponse.json(
      {
        error:
          "iyzico aboneliği iptal edildi ancak yerel profil güncellenemedi: " +
          updateError.message,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, status: "canceled" });
}

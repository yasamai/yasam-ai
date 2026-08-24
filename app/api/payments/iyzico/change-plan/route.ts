import { NextResponse } from "next/server";
import { iyzicoPost } from "../../../../../lib/iyzico-server";
import { getUserFromBearer, supabaseAdmin } from "../../../../../lib/supabase-admin";

type Plan = "premium" | "gold";
type Billing = "monthly" | "yearly";

function pricingPlanReference(plan: Plan, billing: Billing) {
  const envName = `IYZICO_${plan.toUpperCase()}_${billing.toUpperCase()}_PLAN`;
  return process.env[envName] || "";
}

export async function POST(request: Request) {
  const user = await getUserFromBearer(request);
  if (!user) {
    return NextResponse.json({ error: "Oturum doğrulanamadı." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const targetPlan = body?.plan as Plan;
  const targetBilling = body?.billingCycle as Billing;

  if (!["premium", "gold"].includes(String(targetPlan))) {
    return NextResponse.json({ error: "Geçersiz hedef plan." }, { status: 400 });
  }
  if (!["monthly", "yearly"].includes(String(targetBilling))) {
    return NextResponse.json({ error: "Geçersiz ödeme dönemi." }, { status: 400 });
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("subscription_profiles")
    .select("plan,billing_cycle,status,provider_subscription_ref")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json(
      { error: `Abonelik profili okunamadı: ${profileError.message}` },
      { status: 500 },
    );
  }

  if (!profile || profile.status !== "active") {
    return NextResponse.json(
      { error: "Plan değişikliği için aktif abonelik gerekli." },
      { status: 409 },
    );
  }

  const currentPlan = String(profile.plan) as Plan;
  const currentBilling = String(profile.billing_cycle) as Billing;
  const subscriptionReferenceCode = String(profile.provider_subscription_ref || "");

  if (!subscriptionReferenceCode) {
    return NextResponse.json(
      { error: "iyzico abonelik referansı bulunamadı." },
      { status: 409 },
    );
  }

  if (currentPlan === targetPlan && currentBilling === targetBilling) {
    return NextResponse.json({
      ok: true,
      unchanged: true,
      plan: currentPlan,
      billingCycle: currentBilling,
    });
  }

  // Bu v27 endpoint'i aynı ödeme periyodu içindeki plan değişimini yönetir.
  // monthly <-> yearly geçişi ayrı abonelik akışı gerektirir.
  if (currentBilling !== targetBilling) {
    return NextResponse.json(
      {
        error:
          "Aylık/yıllık dönem değişikliği bu endpoint ile yapılmaz. Yeni abonelik geçiş akışı gerekir.",
      },
      { status: 409 },
    );
  }

  const newPricingPlanReferenceCode = pricingPlanReference(targetPlan, targetBilling);
  if (!newPricingPlanReferenceCode) {
    return NextResponse.json(
      { error: "Hedef iyzico fiyat planı referansı ortam değişkenlerinde bulunamadı." },
      { status: 503 },
    );
  }

  const downgrade = currentPlan === "gold" && targetPlan === "premium";
  const upgradePeriod = downgrade ? "NEXT_PERIOD" : "NOW";

  const providerPath =
    `/v2/subscription/subscriptions/${encodeURIComponent(subscriptionReferenceCode)}/upgrade`;

  const { response, data } = await iyzicoPost(providerPath, {
    upgradePeriod,
    newPricingPlanReferenceCode,
    useTrial: false,
    resetRecurrenceCount: false,
  });

  if (!response.ok || data?.status !== "success") {
    return NextResponse.json(
      {
        error: data?.errorMessage || "iyzico plan değişikliği başarısız.",
        provider: data,
      },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();

  if (upgradePeriod === "NOW") {
    const { error: updateError } = await supabaseAdmin
      .from("subscription_profiles")
      .update({
        plan: targetPlan,
        pending_plan: null,
        pending_change_mode: null,
        updated_at: now,
      })
      .eq("user_id", user.id);

    if (updateError) {
      return NextResponse.json(
        {
          error:
            "iyzico planı değişti ancak yerel profil güncellenemedi: " +
            updateError.message,
        },
        { status: 500 },
      );
    }
  } else {
    const { error: updateError } = await supabaseAdmin
      .from("subscription_profiles")
      .update({
        pending_plan: targetPlan,
        pending_change_mode: "next_period",
        updated_at: now,
      })
      .eq("user_id", user.id);

    if (updateError) {
      return NextResponse.json(
        {
          error:
            "Plan değişikliği iyzico üzerinde planlandı ancak yerel profil kaydedilemedi: " +
            updateError.message,
        },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    currentPlan,
    targetPlan,
    billingCycle: currentBilling,
    effective: upgradePeriod === "NOW" ? "now" : "next_period",
  });
}

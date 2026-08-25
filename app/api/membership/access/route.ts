import { NextResponse } from "next/server";
import { evaluateSubscriptionAccess, type SubscriptionPlan, type SubscriptionStatus } from "../../../../lib/subscription-access";
import { getUserFromBearer, supabaseAdmin } from "../../../../lib/supabase-admin";

export async function GET(request: Request) {
  const user = await getUserFromBearer(request);
  if (!user) {
    return NextResponse.json({ error: "Oturum doğrulanamadı." }, { status: 401 });
  }

  const { data: profile, error } = await supabaseAdmin
    .from("subscription_profiles")
    .select("plan,status,billing_cycle,current_period_end,provider_subscription_ref,pending_plan,pending_change_mode")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Abonelik profili okunamadı." }, { status: 500 });
  }

  const plan = String(profile?.plan || "standard") as SubscriptionPlan;
  const status = (profile?.status ? String(profile.status) : null) as SubscriptionStatus;
  const paymentConnected = Boolean(profile?.provider_subscription_ref);

  const access = evaluateSubscriptionAccess({
    plan,
    status,
    paymentConnected,
    currentPeriodEnd: profile?.current_period_end ?? null,
  });

  return NextResponse.json({
    ok: true,
    profile: {
      plan,
      status,
      billingCycle: profile?.billing_cycle ?? null,
      currentPeriodEnd: profile?.current_period_end ?? null,
      pendingPlan: profile?.pending_plan ?? null,
      pendingChangeMode: profile?.pending_change_mode ?? null,
      paymentConnected,
    },
    access,
  });
}
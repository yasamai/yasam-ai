import { NextResponse } from "next/server";
import { verifyIyzicoSubscriptionWebhook } from "../../../../../lib/iyzico-server";
import { supabaseAdmin } from "../../../../../lib/supabase-admin";

export async function POST(request: Request) {
  const signature = request.headers.get("x-iyz-signature-v3") || "";
  const payload = await request.json().catch(() => ({}));
  const merchantId = String(process.env.IYZICO_MERCHANT_ID || "");
  const eventType = String(payload.iyziEventType || "");
  const subscriptionReferenceCode = String(payload.subscriptionReferenceCode || "");
  const orderReferenceCode = String(payload.orderReferenceCode || "");
  const customerReferenceCode = String(payload.customerReferenceCode || "");
  const iyziReferenceCode = String(payload.iyziReferenceCode || "");

  const valid = Boolean(
    signature && merchantId && eventType && subscriptionReferenceCode && orderReferenceCode && customerReferenceCode &&
    verifyIyzicoSubscriptionWebhook({ signature, merchantId, eventType, subscriptionReferenceCode, orderReferenceCode, customerReferenceCode }),
  );

  const eventRow = {
    provider: "iyzico",
    environment: (process.env.IYZICO_BASE_URL || "").includes("sandbox") ? "sandbox" : "production",
    event_type: eventType || "unknown",
    iyzi_reference_code: iyziReferenceCode || null,
    merchant_id: merchantId || null,
    subscription_reference_code: subscriptionReferenceCode || null,
    order_reference_code: orderReferenceCode || null,
    customer_reference_code: customerReferenceCode || null,
    signature_header: signature || null,
    signature_valid: valid,
    payload,
    processing_status: valid ? "received" : "ignored",
    processing_error: valid ? null : "signature_invalid",
  };

  if (iyziReferenceCode) {
    await supabaseAdmin.from("payment_webhook_events").upsert(eventRow, { onConflict: "provider,iyzi_reference_code" });
  } else {
    await supabaseAdmin.from("payment_webhook_events").insert(eventRow);
  }
  if (!valid) return NextResponse.json({ ok: false }, { status: 401 });

  const { data: tx } = await supabaseAdmin.from("payment_transactions").select("*")
    .eq("provider_subscription_reference_code", subscriptionReferenceCode)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  const now = new Date().toISOString();

  if (tx && eventType === "subscription.order.success") {
    await supabaseAdmin.from("payment_transactions").update({
      status: "success",
      provider_order_reference_code: orderReferenceCode,
      verified_at: now,
      updated_at: now,
    }).eq("id", tx.id);
    const { data: currentProfile } = await supabaseAdmin
      .from("subscription_profiles")
      .select("pending_plan,pending_change_mode")
      .eq("user_id", tx.user_id)
      .maybeSingle();

    const profileUpdate: Record<string, unknown> = {
      status: "active",
      updated_at: now,
    };

    if (
      currentProfile?.pending_plan &&
      currentProfile?.pending_change_mode === "next_period"
    ) {
      profileUpdate.plan = currentProfile.pending_plan;
      profileUpdate.pending_plan = null;
      profileUpdate.pending_change_mode = null;
    }

    await supabaseAdmin
      .from("subscription_profiles")
      .update(profileUpdate)
      .eq("user_id", tx.user_id);
  } else if (tx && eventType === "subscription.order.failure") {
    await supabaseAdmin.from("payment_transactions").update({
      status: "failure",
      provider_order_reference_code: orderReferenceCode,
      failure_message: "iyzico recurring subscription payment failed",
      updated_at: now,
    }).eq("id", tx.id);
    await supabaseAdmin.from("subscription_profiles").update({ status: "past_due", updated_at: now }).eq("user_id", tx.user_id);
  }

  const updateEvent = supabaseAdmin.from("payment_webhook_events").update({ processing_status: "processed", processed_at: now });
  if (iyziReferenceCode) await updateEvent.eq("provider", "iyzico").eq("iyzi_reference_code", iyziReferenceCode);
  return NextResponse.json({ ok: true });
}

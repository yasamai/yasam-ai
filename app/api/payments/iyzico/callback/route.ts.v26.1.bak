import { iyzicoGet } from "../../../../../lib/iyzico-server";
import { supabaseAdmin } from "../../../../../lib/supabase-admin";

function resultHtml(status: "success" | "failure") {
  const base = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const target = `${base}/analiz?payment=${status}`;
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><title>Yaşam AI Ödeme</title></head><body><script>window.top.location.href=${JSON.stringify(target)};</script><a href=${JSON.stringify(target)}>Yaşam AI'a dön</a></body></html>`, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function tokenFromRequest(request: Request) {
  const url = new URL(request.url);
  const queryToken = url.searchParams.get("token");
  if (queryToken) return queryToken;
  const contentType = request.headers.get("content-type") || "";
  if (request.method === "POST" && contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    return String(body?.token || "");
  }
  if (request.method === "POST") {
    const form = await request.formData().catch(() => null);
    return String(form?.get("token") || "");
  }
  return "";
}

async function handle(request: Request) {
  const token = await tokenFromRequest(request);
  if (!token) return resultHtml("failure");

  const { data: tx } = await supabaseAdmin.from("payment_transactions").select("*").eq("checkout_token", token).maybeSingle();
  if (!tx) return resultHtml("failure");
  if (tx.status === "success" && tx.verified_at) return resultHtml("success");

  const path = `/v2/subscription/checkoutform/${encodeURIComponent(token)}?conversationId=${encodeURIComponent(tx.conversation_id)}`;
  const { response, data } = await iyzicoGet(path);
  const active = response.ok && data?.status === "success" && data?.data?.subscriptionStatus === "ACTIVE";
  if (!active) {
    await supabaseAdmin.from("payment_transactions").update({
      status: "failure",
      callback_received_at: new Date().toISOString(),
      failure_code: data?.errorCode || null,
      failure_message: data?.errorMessage || "Abonelik sonucu iyzico üzerinden doğrulanamadı.",
      provider_response: data,
      updated_at: new Date().toISOString(),
    }).eq("id", tx.id);
    return resultHtml("failure");
  }

  const now = new Date().toISOString();
  const subscriptionRef = String(data.data.referenceCode || "");
  const customerRef = String(data.data.customerReferenceCode || "");
  const startMs = Number(data.data.startDate || data.data.createdDate || 0);
  const endMs = Number(data.data.endDate || 0);
  const periodStart = startMs > 0 ? new Date(startMs).toISOString() : now;
  const periodEnd = endMs > 0 ? new Date(endMs).toISOString() : null;

  await supabaseAdmin.from("payment_transactions").update({
    status: "success",
    callback_received_at: now,
    verified_at: now,
    provider_customer_reference_code: customerRef || null,
    provider_subscription_reference_code: subscriptionRef || null,
    provider_response: data,
    updated_at: now,
  }).eq("id", tx.id);

  if (customerRef) {
    await supabaseAdmin.from("payment_customers").upsert({
      user_id: tx.user_id,
      provider: "iyzico",
      provider_customer_reference_code: customerRef,
      updated_at: now,
    }, { onConflict: "user_id" });
  }

  await supabaseAdmin.from("subscription_profiles").upsert({
    user_id: tx.user_id,
    plan: tx.plan,
    billing_cycle: tx.billing_cycle,
    status: "active",
    current_period_start: periodStart,
    current_period_end: periodEnd,
    cancel_at_period_end: false,
    payment_provider: "iyzico",
    provider_customer_ref: customerRef || null,
    provider_subscription_ref: subscriptionRef || null,
    updated_at: now,
  }, { onConflict: "user_id" });

  await supabaseAdmin.from("subscription_plan_requests").update({
    status: "approved",
    reviewed_at: now,
  }).eq("user_id", tx.user_id).eq("requested_plan", tx.plan).eq("requested_billing_cycle", tx.billing_cycle).eq("status", "pending");

  return resultHtml("success");
}

export async function POST(request: Request) { return handle(request); }
export async function GET(request: Request) { return handle(request); }

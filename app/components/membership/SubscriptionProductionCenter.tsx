"use client";

import { useState } from "react";
import { supabase } from "../../../lib/supabase";

type Plan = "standard" | "premium" | "gold";
type Billing = "monthly" | "yearly";
type Status = "trial" | "active" | "past_due" | "cancelled" | "canceled" | "paused" | null;

type Props = {
  userId: string | null;
  plan: Plan;
  billingCycle: Billing;
  status: Status;
  currentPeriodEnd: string | null;
  paymentConnected: boolean;
  pendingPlan?: Plan | null;
  pendingBillingCycle?: Billing | null;
  onRefresh?: () => void;
};

const planLabel: Record<Plan, string> = {
  standard: "Standart",
  premium: "Premium",
  gold: "Gold Elite",
};

const statusLabel: Record<string, string> = {
  active: "Aktif",
  trial: "Deneme",
  past_due: "Ã–deme bekliyor",
  cancelled: "Ä°ptal edildi",
  canceled: "Ä°ptal edildi",
  paused: "DuraklatÄ±ldÄ±",
};

export default function SubscriptionProductionCenter({
  userId,
  plan,
  billingCycle,
  status,
  currentPeriodEnd,
  paymentConnected,
  pendingPlan = null,
  pendingBillingCycle = null,
  onRefresh,
}: Props) {
  const [busy, setBusy] = useState<"" | "premium" | "gold" | "cancel" | "refresh">("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const activePaid = status === "active" && paymentConnected && (plan === "premium" || plan === "gold");

  async function bearer() {
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const token = data.session?.access_token;
    if (!token) throw new Error("Oturum bulunamadÄ±. LÃ¼tfen tekrar giriÅŸ yapÄ±n.");
    return token;
  }

  async function refresh() {
    setBusy("refresh");
    setError("");
    setNotice("");
    try {
      onRefresh?.();
      setNotice("Ãœyelik bilgileri yenilendi.");
    } finally {
      setTimeout(() => setBusy(""), 350);
    }
  }

  async function changePlan(targetPlan: "premium" | "gold") {
    if (!userId) {
      setError("Plan iÅŸlemi iÃ§in oturum aÃ§manÄ±z gerekiyor.");
      return;
    }

    setBusy(targetPlan);
    setError("");
    setNotice("");

    try {
      if (!activePaid) {
        const params = new URLSearchParams({ plan: targetPlan, billing: billingCycle });
        window.location.href = `/odeme/iyzico?${params.toString()}`;
        return;
      }

      const token = await bearer();
      const response = await fetch("/api/payments/iyzico/change-plan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan: targetPlan, billingCycle }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Plan deÄŸiÅŸikliÄŸi tamamlanamadÄ±.");

      if (payload?.unchanged) {
        setNotice(`${planLabel[targetPlan]} zaten aktif planÄ±nÄ±z.`);
      } else if (payload?.effective === "next_period") {
        setNotice(`${planLabel[targetPlan]} geÃ§iÅŸi sonraki dÃ¶nem iÃ§in planlandÄ±.`);
      } else {
        setNotice(`${planLabel[targetPlan]} planÄ± baÅŸarÄ±yla etkinleÅŸtirildi.`);
      }
      onRefresh?.();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Plan deÄŸiÅŸikliÄŸi tamamlanamadÄ±.");
    } finally {
      setBusy("");
    }
  }

  async function cancelSubscription() {
    if (!userId) {
      setError("Ä°ptal iÅŸlemi iÃ§in oturum aÃ§manÄ±z gerekiyor.");
      return;
    }
    if (!activePaid) {
      setError("Ä°ptal edilecek aktif iyzico aboneliÄŸi bulunmuyor.");
      return;
    }
    if (!window.confirm("Aktif iyzico aboneliÄŸinizi iptal etmek istediÄŸinize emin misiniz?")) return;

    setBusy("cancel");
    setError("");
    setNotice("");
    try {
      const token = await bearer();
      const response = await fetch("/api/payments/iyzico/cancel", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Abonelik iptal edilemedi.");
      setNotice("iyzico aboneliÄŸi iptal edildi. Ãœyelik kaydÄ± yenileniyor.");
      onRefresh?.();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Abonelik iptal edilemedi.");
    } finally {
      setBusy("");
    }
  }

  const periodEnd = currentPeriodEnd
    ? new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(currentPeriodEnd))
    : "â€”";

  return (
    <article
      id="subscription-production-center"
      style={{
        marginTop: 16,
        padding: 20,
        borderRadius: 22,
        border: "1px solid #d8e7f2",
        background: "linear-gradient(145deg,#ffffff,#f5faff)",
        boxShadow: "0 14px 36px rgba(31,64,97,.08)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ color: "#0876c9", fontSize: 11, fontWeight: 950, letterSpacing: 1.4 }}>V28 Â· CANLI ABONELÄ°K YÃ–NETÄ°MÄ°</div>
          <h3 style={{ margin: "7px 0 5px", color: "#153a65", fontSize: 22 }}>iyzico plan yÃ¶netimi tek merkezde</h3>
          <p style={{ margin: 0, color: "#607890", fontSize: 13, lineHeight: 1.55, maxWidth: 760 }}>
            Plan bilgisi sunucudaki abonelik kaydÄ±ndan okunur. Aktif Ã¼cretli aboneliklerde Premium â†” Gold geÃ§iÅŸi ve iptal iÅŸlemi server-side iyzico doÄŸrulamasÄ±yla yÃ¼rÃ¼tÃ¼lÃ¼r.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={Boolean(busy)}
          style={{ padding: "9px 12px", borderRadius: 12, border: "1px solid #cfe1ef", background: "#fff", color: "#176ca5", fontWeight: 900, cursor: "pointer" }}
        >
          {busy === "refresh" ? "Yenileniyor..." : "Durumu Yenile"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginTop: 16 }}>
        {[
          ["Aktif plan", planLabel[plan]],
          ["Ã–deme dÃ¶nemi", billingCycle === "yearly" ? "YÄ±llÄ±k" : "AylÄ±k"],
          ["Abonelik durumu", status ? (statusLabel[status] || status) : "KayÄ±t bekleniyor"],
          ["DÃ¶nem sonu", periodEnd],
        ].map(([label, value]) => (
          <div key={label} style={{ padding: 14, borderRadius: 15, border: "1px solid #e0eaf2", background: "#fff" }}>
            <small style={{ color: "#8194a6", fontWeight: 900 }}>{label}</small>
            <strong style={{ display: "block", marginTop: 5, color: "#153a65", fontSize: 16 }}>{value}</strong>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12, padding: 12, borderRadius: 14, background: activePaid ? "#eef9f5" : "#f7f9fb", border: activePaid ? "1px solid #bfe7d9" : "1px solid #dce5ec", color: activePaid ? "#087b5e" : "#607890", fontSize: 12.5, lineHeight: 1.5 }}>
        <strong>V31 · ERİŞİM POLİTİKASI:</strong>{" "}
        {activePaid
          ? "Provider doğrulanmış aktif ücretli abonelik. Premium/Gold erişimi açık."
          : status === "past_due"
            ? "Tekrarlayan ödeme başarısız. Ücretli erişim güvenlik gereği kapalı; ödeme yenilenince webhook erişimi yeniden açar."
            : status === "canceled" || status === "cancelled"
              ? "Abonelik iptal edilmiş. Ücretli erişim kapalı."
              : status === "paused"
                ? "Abonelik duraklatılmış. Ücretli erişim kapalı."
                : "Ücretli erişim yalnız server-side doğrulanmış ACTIVE abonelikte açılır."}
      </div>
      {pendingPlan ? (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 14, background: "#fff8e6", border: "1px solid #ead7a8", color: "#765a17", fontSize: 12.5, lineHeight: 1.5 }}>
          Bekleyen plan talebi: <strong>{planLabel[pendingPlan]}</strong>{pendingBillingCycle ? ` Â· ${pendingBillingCycle === "yearly" ? "YÄ±llÄ±k" : "AylÄ±k"}` : ""}.
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 15 }}>
        <button
          type="button"
          onClick={() => void changePlan("premium")}
          disabled={Boolean(busy) || (activePaid && plan === "premium")}
          style={{ padding: "11px 14px", borderRadius: 13, border: "1px solid #b9dcf7", background: plan === "premium" ? "#eaf7ff" : "#fff", color: "#0876c9", fontWeight: 950, cursor: "pointer", opacity: activePaid && plan === "premium" ? .65 : 1 }}
        >
          {busy === "premium" ? "Ä°ÅŸleniyor..." : plan === "premium" ? "âœ“ Premium" : "Premium'a GeÃ§"}
        </button>
        <button
          type="button"
          onClick={() => void changePlan("gold")}
          disabled={Boolean(busy) || (activePaid && plan === "gold")}
          style={{ padding: "11px 14px", borderRadius: 13, border: "1px solid #e0c46f", background: plan === "gold" ? "linear-gradient(90deg,#fff4c9,#fffaf0)" : "#fff", color: "#8b6512", fontWeight: 950, cursor: "pointer", opacity: activePaid && plan === "gold" ? .65 : 1 }}
        >
          {busy === "gold" ? "Ä°ÅŸleniyor..." : plan === "gold" ? "âœ“ Gold Elite" : "Gold Elite'a GeÃ§"}
        </button>
        {activePaid ? (
          <button
            type="button"
            onClick={() => void cancelSubscription()}
            disabled={Boolean(busy)}
            style={{ padding: "11px 14px", borderRadius: 13, border: "1px solid #edc7c7", background: "#fff7f7", color: "#a33", fontWeight: 900, cursor: "pointer" }}
          >
            {busy === "cancel" ? "Ä°ptal ediliyor..." : "AboneliÄŸi Ä°ptal Et"}
          </button>
        ) : null}
      </div>

      {!paymentConnected && plan !== "standard" ? (
        <div style={{ marginTop: 12, color: "#6d8194", fontSize: 11.5 }}>
          Ãœcretli plan gÃ¶rÃ¼nÃ¼yor ancak iyzico abonelik referansÄ± henÃ¼z baÄŸlÄ± deÄŸil; plan deÄŸiÅŸtirme yerine gÃ¼venli Ã¶deme akÄ±ÅŸÄ± aÃ§Ä±lÄ±r.
        </div>
      ) : null}
      {notice ? <div style={{ marginTop: 12, padding: 11, borderRadius: 12, background: "#eef9f5", color: "#087b5e", fontSize: 12.5 }}>{notice}</div> : null}
      {error ? <div style={{ marginTop: 12, padding: 11, borderRadius: 12, background: "#fff1f1", color: "#a33", fontSize: 12.5 }}>{error}</div> : null}
    </article>
  );
}
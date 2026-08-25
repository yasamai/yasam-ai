$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
  Write-Host "`n=== $Message ===" -ForegroundColor Cyan
}

$root = (Get-Location).Path
$gitDir = Join-Path $root ".git"
$analysisPath = Join-Path $root "app\analiz\page.tsx"
$componentDir = Join-Path $root "app\components\membership"
$componentPath = Join-Path $componentDir "SubscriptionProductionCenter.tsx"

if (-not (Test-Path $gitDir)) {
  throw "Bu klasor Git ana proje klasoru degil: $root"
}
if (-not (Test-Path $analysisPath)) {
  throw "app\analiz\page.tsx bulunamadi. Dogru projede oldugunuzu kontrol edin."
}

$branch = (git branch --show-current).Trim()
if ($branch -ne "feat/v28-subscription-production") {
  throw "Yanlis branch: '$branch'. Beklenen: feat/v28-subscription-production"
}

Write-Step "V28 guvenli kurulum basliyor"
Write-Host "Proje : $root"
Write-Host "Branch: $branch"

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $root ".v28-backup\$stamp"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
Copy-Item $analysisPath (Join-Path $backupDir "page.tsx") -Force
if (Test-Path $componentPath) {
  Copy-Item $componentPath (Join-Path $backupDir "SubscriptionProductionCenter.tsx") -Force
}
Write-Host "Backup: $backupDir" -ForegroundColor Green

$component = @'
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
  past_due: "Ödeme bekliyor",
  cancelled: "İptal edildi",
  canceled: "İptal edildi",
  paused: "Duraklatıldı",
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
    if (!token) throw new Error("Oturum bulunamadı. Lütfen tekrar giriş yapın.");
    return token;
  }

  async function refresh() {
    setBusy("refresh");
    setError("");
    setNotice("");
    try {
      onRefresh?.();
      setNotice("Üyelik bilgileri yenilendi.");
    } finally {
      setTimeout(() => setBusy(""), 350);
    }
  }

  async function changePlan(targetPlan: "premium" | "gold") {
    if (!userId) {
      setError("Plan işlemi için oturum açmanız gerekiyor.");
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
      if (!response.ok) throw new Error(payload?.error || "Plan değişikliği tamamlanamadı.");

      if (payload?.unchanged) {
        setNotice(`${planLabel[targetPlan]} zaten aktif planınız.`);
      } else if (payload?.effective === "next_period") {
        setNotice(`${planLabel[targetPlan]} geçişi sonraki dönem için planlandı.`);
      } else {
        setNotice(`${planLabel[targetPlan]} planı başarıyla etkinleştirildi.`);
      }
      onRefresh?.();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Plan değişikliği tamamlanamadı.");
    } finally {
      setBusy("");
    }
  }

  async function cancelSubscription() {
    if (!userId) {
      setError("İptal işlemi için oturum açmanız gerekiyor.");
      return;
    }
    if (!activePaid) {
      setError("İptal edilecek aktif iyzico aboneliği bulunmuyor.");
      return;
    }
    if (!window.confirm("Aktif iyzico aboneliğinizi iptal etmek istediğinize emin misiniz?")) return;

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
      setNotice("iyzico aboneliği iptal edildi. Üyelik kaydı yenileniyor.");
      onRefresh?.();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Abonelik iptal edilemedi.");
    } finally {
      setBusy("");
    }
  }

  const periodEnd = currentPeriodEnd
    ? new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(currentPeriodEnd))
    : "—";

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
          <div style={{ color: "#0876c9", fontSize: 11, fontWeight: 950, letterSpacing: 1.4 }}>V28 · CANLI ABONELİK YÖNETİMİ</div>
          <h3 style={{ margin: "7px 0 5px", color: "#153a65", fontSize: 22 }}>iyzico plan yönetimi tek merkezde</h3>
          <p style={{ margin: 0, color: "#607890", fontSize: 13, lineHeight: 1.55, maxWidth: 760 }}>
            Plan bilgisi sunucudaki abonelik kaydından okunur. Aktif ücretli aboneliklerde Premium ↔ Gold geçişi ve iptal işlemi server-side iyzico doğrulamasıyla yürütülür.
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
          ["Ödeme dönemi", billingCycle === "yearly" ? "Yıllık" : "Aylık"],
          ["Abonelik durumu", status ? (statusLabel[status] || status) : "Kayıt bekleniyor"],
          ["Dönem sonu", periodEnd],
        ].map(([label, value]) => (
          <div key={label} style={{ padding: 14, borderRadius: 15, border: "1px solid #e0eaf2", background: "#fff" }}>
            <small style={{ color: "#8194a6", fontWeight: 900 }}>{label}</small>
            <strong style={{ display: "block", marginTop: 5, color: "#153a65", fontSize: 16 }}>{value}</strong>
          </div>
        ))}
      </div>

      {pendingPlan ? (
        <div style={{ marginTop: 12, padding: 12, borderRadius: 14, background: "#fff8e6", border: "1px solid #ead7a8", color: "#765a17", fontSize: 12.5, lineHeight: 1.5 }}>
          Bekleyen plan talebi: <strong>{planLabel[pendingPlan]}</strong>{pendingBillingCycle ? ` · ${pendingBillingCycle === "yearly" ? "Yıllık" : "Aylık"}` : ""}.
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 15 }}>
        <button
          type="button"
          onClick={() => void changePlan("premium")}
          disabled={Boolean(busy) || (activePaid && plan === "premium")}
          style={{ padding: "11px 14px", borderRadius: 13, border: "1px solid #b9dcf7", background: plan === "premium" ? "#eaf7ff" : "#fff", color: "#0876c9", fontWeight: 950, cursor: "pointer", opacity: activePaid && plan === "premium" ? .65 : 1 }}
        >
          {busy === "premium" ? "İşleniyor..." : plan === "premium" ? "✓ Premium" : "Premium'a Geç"}
        </button>
        <button
          type="button"
          onClick={() => void changePlan("gold")}
          disabled={Boolean(busy) || (activePaid && plan === "gold")}
          style={{ padding: "11px 14px", borderRadius: 13, border: "1px solid #e0c46f", background: plan === "gold" ? "linear-gradient(90deg,#fff4c9,#fffaf0)" : "#fff", color: "#8b6512", fontWeight: 950, cursor: "pointer", opacity: activePaid && plan === "gold" ? .65 : 1 }}
        >
          {busy === "gold" ? "İşleniyor..." : plan === "gold" ? "✓ Gold Elite" : "Gold Elite'a Geç"}
        </button>
        {activePaid ? (
          <button
            type="button"
            onClick={() => void cancelSubscription()}
            disabled={Boolean(busy)}
            style={{ padding: "11px 14px", borderRadius: 13, border: "1px solid #edc7c7", background: "#fff7f7", color: "#a33", fontWeight: 900, cursor: "pointer" }}
          >
            {busy === "cancel" ? "İptal ediliyor..." : "Aboneliği İptal Et"}
          </button>
        ) : null}
      </div>

      {!paymentConnected && plan !== "standard" ? (
        <div style={{ marginTop: 12, color: "#6d8194", fontSize: 11.5 }}>
          Ücretli plan görünüyor ancak iyzico abonelik referansı henüz bağlı değil; plan değiştirme yerine güvenli ödeme akışı açılır.
        </div>
      ) : null}
      {notice ? <div style={{ marginTop: 12, padding: 11, borderRadius: 12, background: "#eef9f5", color: "#087b5e", fontSize: 12.5 }}>{notice}</div> : null}
      {error ? <div style={{ marginTop: 12, padding: 11, borderRadius: 12, background: "#fff1f1", color: "#a33", fontSize: 12.5 }}>{error}</div> : null}
    </article>
  );
}
'@

New-Item -ItemType Directory -Force -Path $componentDir | Out-Null
[System.IO.File]::WriteAllText($componentPath, $component, (New-Object System.Text.UTF8Encoding($false)))

$page = [System.IO.File]::ReadAllText($analysisPath)

$importLine = 'import SubscriptionProductionCenter from "../components/membership/SubscriptionProductionCenter";'
if (-not $page.Contains($importLine)) {
  $marker = 'import TeamRoleCenter from "../components/membership/TeamRoleCenter";'
  if (-not $page.Contains($marker)) { throw "Import ekleme noktasi bulunamadi." }
  $page = $page.Replace($marker, "$marker`r`n$importLine")
}

if (-not $page.Contains('id="subscription-production-center"') -and -not $page.Contains('<SubscriptionProductionCenter')) {
  $renderMarker = '          <PlatformControlDock'
  if (-not $page.Contains($renderMarker)) { throw "V28 merkez ekleme noktasi bulunamadi." }
  $render = @'
          <SubscriptionProductionCenter
            userId={user?.id ?? null}
            plan={(subscriptionProfile?.plan || membershipPlan) as "standard" | "premium" | "gold"}
            billingCycle={(subscriptionProfile?.billing_cycle || billingCycle) as "monthly" | "yearly"}
            status={subscriptionProfile?.status ?? null}
            currentPeriodEnd={subscriptionProfile?.current_period_end ?? null}
            paymentConnected={subscriptionIntelligence.paymentConnected}
            pendingPlan={subscriptionPlanRequest?.requested_plan ?? null}
            pendingBillingCycle={subscriptionPlanRequest?.requested_billing_cycle ?? null}
            onRefresh={() => void loadSubscriptionCenter()}
          />

'@
  $page = $page.Replace($renderMarker, $render + $renderMarker)
}

$replacements = @{
  'Canlı tahsilat henüz bağlı değildir. Ödeme entegrasyonu açıldığında iyzico veya benzeri lisanslı bir kuruluşun güvenli sayfası, sunucu taraflı abonelik doğrulaması, fatura geçmişi ve iptal akışı kullanılacaktır.' = 'iyzico abonelik altyapısı aktiftir. Ücretli plan yetkisi yalnızca server-side ödeme doğrulamasından sonra açılır; plan değişikliği ve iptal işlemleri V28 üyelik yönetim merkezinden yürütülür.'
  'Premium önizleme açıldı. Canlı ödeme bağlantısı henüz bağlı değildir.' = 'Premium önizleme açıldı. Ücretli üyelik ödemesi iyzico güvenli ödeme akışı üzerinden başlatılır.'
  'Lisanslı ödeme kuruluşunun korumalı sayfası kullanılacaktır.' = 'iyzico güvenli ödeme sayfası kullanılır; kart verisi Yaşam AI tarafından saklanmaz.'
  'Evet. Canlı abonelik sistemi bağlandığında plan yükseltme ve düşürme kontrollü şekilde yapılacaktır.' = 'Evet. Aktif iyzico aboneliğinde Premium ve Gold geçişleri V28 üyelik yönetim merkezinden kontrollü şekilde yapılır.'
  'Canlı ödeme entegrasyonu açıldığında lisanslı ödeme kuruluşu üzerinden güvenli tahsilat ve kullanıcı hesabında fatura geçmişi sağlanacaktır.' = 'Tahsilat iyzico güvenli ödeme altyapısıyla yürütülür; abonelik yetkisi ödeme sonucu sunucu tarafında doğrulandıktan sonra güncellenir.'
}
foreach ($key in $replacements.Keys) {
  if ($page.Contains($key)) { $page = $page.Replace($key, $replacements[$key]) }
}

[System.IO.File]::WriteAllText($analysisPath, $page, (New-Object System.Text.UTF8Encoding($false)))

function Restore-V28 {
  Write-Host "V28 testi basarisiz. Backup geri yukleniyor..." -ForegroundColor Yellow
  Copy-Item (Join-Path $backupDir "page.tsx") $analysisPath -Force
  $oldComponent = Join-Path $backupDir "SubscriptionProductionCenter.tsx"
  if (Test-Path $oldComponent) {
    Copy-Item $oldComponent $componentPath -Force
  } elseif (Test-Path $componentPath) {
    Remove-Item $componentPath -Force
  }
}

Write-Step "Typecheck"
npm run typecheck
if ($LASTEXITCODE -ne 0) {
  Restore-V28
  throw "V28 typecheck basarisiz. Tum V28 degisiklikleri geri alindi."
}

Write-Step "Production build"
npm run build
if ($LASTEXITCODE -ne 0) {
  Restore-V28
  throw "V28 build basarisiz. Tum V28 degisiklikleri geri alindi."
}

Write-Step "Git farki"
git status --short
git diff --stat -- app/analiz/page.tsx app/components/membership/SubscriptionProductionCenter.tsx

Write-Host "`nV28 BASARILI: canli abonelik yonetim merkezi + iyzico plan degisikligi + iptal + metin temizligi + typecheck + build tamamlandi." -ForegroundColor Green
Write-Host "Backup korunuyor: $backupDir" -ForegroundColor DarkGray

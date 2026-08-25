import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const REQUIRED_BRANCH = "feat/v27-subscription-lifecycle";
const created = [];
const backups = [];

function rel(...parts) {
  return path.join(...parts);
}
function abs(...parts) {
  return path.join(ROOT, ...parts);
}
function die(message) {
  console.error("\n❌ V27 DURDU\n" + message + "\n");
  process.exit(1);
}
function run(command) {
  return execSync(command, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}
function exists(file) {
  return fs.existsSync(abs(file));
}
function read(file) {
  return fs.readFileSync(abs(file), "utf8");
}
function mkdirFor(file) {
  fs.mkdirSync(path.dirname(abs(file)), { recursive: true });
}
function backup(file, backupDir) {
  if (!exists(file)) return;
  const dest = path.join(backupDir, file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(abs(file), dest);
  backups.push({ file, dest });
}
function writeNew(file, content) {
  if (exists(file)) die(`${file} zaten var. Güvenlik için üzerine yazılmadı.`);
  mkdirFor(file);
  fs.writeFileSync(abs(file), content, "utf8");
  created.push(file);
  console.log("✅ oluşturuldu:", file);
}
function writeExisting(file, content) {
  fs.writeFileSync(abs(file), content, "utf8");
  console.log("✅ güncellendi:", file);
}
function restoreAll() {
  console.log("\n↩️  Geri alma başlatıldı...");
  for (const file of created.reverse()) {
    try { fs.rmSync(abs(file), { force: true }); } catch {}
  }
  for (const item of backups.reverse()) {
    try {
      mkdirFor(item.file);
      fs.copyFileSync(item.dest, abs(item.file));
    } catch {}
  }
  console.log("↩️  Değişiklikler geri alındı.");
}

/* -------------------------------------------------
   1) ÖN KONTROLLER
-------------------------------------------------- */
console.log("\nYAŞAM AI — v27 Güvenli Kurulum\n");

for (const file of [
  "package.json",
  "lib/iyzico-server.ts",
  "lib/supabase-admin.ts",
  "app/api/payments/iyzico/callback/route.ts",
  "app/api/payments/iyzico/webhook/route.ts",
  "app/api/payments/iyzico/initialize/route.ts",
]) {
  if (!exists(file)) die(`Gerekli dosya bulunamadı: ${file}\nYanlış proje klasöründe olabilirsiniz.`);
}

let branch = "";
try { branch = run("git branch --show-current").trim(); }
catch { die("Git branch okunamadı."); }

if (branch !== REQUIRED_BRANCH) {
  die(`Aktif branch: ${branch}\nBeklenen branch: ${REQUIRED_BRANCH}`);
}

let status = "";
try { status = run("git status --short"); }
catch { die("git status çalışmadı."); }

const trackedChanges = status
  .split(/\r?\n/)
  .filter(Boolean)
  .filter(line => !line.startsWith("??"));

if (trackedChanges.length) {
  die("Takip edilen dosyalarda mevcut değişiklik var. Önce bunları koruyun/commit edin:\n" + trackedChanges.join("\n"));
}

console.log("✅ doğru proje yapısı");
console.log("✅ doğru branch");
console.log("✅ tracked çalışma alanı temiz");

console.log("\n🔎 Başlangıç typecheck...");
try {
  run("npm run typecheck");
  console.log("✅ başlangıç typecheck temiz");
} catch (e) {
  die("Mevcut proje typecheck aşamasında zaten hata veriyor. Hiçbir dosya değiştirilmedi.");
}

/* -------------------------------------------------
   2) MEVCUT WEBHOOK YAPISINI DOĞRULA
-------------------------------------------------- */
const webhookFile = "app/api/payments/iyzico/webhook/route.ts";
const webhook = read(webhookFile);

for (const token of [
  "subscription.order.success",
  "subscription.order.failure",
  "subscription_profiles",
  "payment_transactions",
]) {
  if (!webhook.includes(token)) {
    die(`Webhook beklenen yapıda değil: "${token}" bulunamadı. Hiçbir dosya değiştirilmedi.`);
  }
}

/* -------------------------------------------------
   3) YEDEK
-------------------------------------------------- */
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupDir = abs(".v27-backup", stamp);
fs.mkdirSync(backupDir, { recursive: true });

backup(webhookFile, backupDir);
console.log("✅ webhook yedeği:", path.relative(ROOT, backupDir));

/* -------------------------------------------------
   4) YENİ ROUTE'LAR
-------------------------------------------------- */
const cancelRoute = `import { NextResponse } from "next/server";
import { iyzicoPost } from "../../../../../../lib/iyzico-server";
import { getUserFromBearer, supabaseAdmin } from "../../../../../../lib/supabase-admin";

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
      { error: \`Abonelik profili okunamadı: \${profileError.message}\` },
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
    \`/v2/subscription/subscriptions/\${encodeURIComponent(subscriptionReferenceCode)}/cancel\`;

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
`;

const changePlanRoute = `import { NextResponse } from "next/server";
import { iyzicoPost } from "../../../../../../lib/iyzico-server";
import { getUserFromBearer, supabaseAdmin } from "../../../../../../lib/supabase-admin";

type Plan = "premium" | "gold";
type Billing = "monthly" | "yearly";

function pricingPlanReference(plan: Plan, billing: Billing) {
  const envName = \`IYZICO_\${plan.toUpperCase()}_\${billing.toUpperCase()}_PLAN\`;
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
      { error: \`Abonelik profili okunamadı: \${profileError.message}\` },
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
    \`/v2/subscription/subscriptions/\${encodeURIComponent(subscriptionReferenceCode)}/upgrade\`;

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
`;

writeNew("app/api/payments/iyzico/cancel/route.ts", cancelRoute);
writeNew("app/api/payments/iyzico/change-plan/route.ts", changePlanRoute);

/* -------------------------------------------------
   5) SUPABASE SQL
-------------------------------------------------- */
const sql = `-- YAŞAM AI v27 — Subscription Lifecycle
-- Supabase SQL Editor'da BİR KEZ çalıştırılacak.
-- Mevcut kolonları silmez/değiştirmez; yalnızca eksik v27 alanlarını ekler.

alter table public.subscription_profiles
  add column if not exists pending_plan text,
  add column if not exists pending_change_mode text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscription_profiles_pending_plan_check'
  ) then
    alter table public.subscription_profiles
      add constraint subscription_profiles_pending_plan_check
      check (pending_plan is null or pending_plan in ('premium', 'gold'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscription_profiles_pending_change_mode_check'
  ) then
    alter table public.subscription_profiles
      add constraint subscription_profiles_pending_change_mode_check
      check (pending_change_mode is null or pending_change_mode in ('next_period'));
  end if;
end $$;
`;

writeNew("supabase-v27-subscription-lifecycle.sql", sql);

/* -------------------------------------------------
   6) WEBHOOK'A PENDING DOWNGRADE UYGULAMASI
   Mevcut success bloğunu yapısal olarak bulup güvenli ekleme yapar.
-------------------------------------------------- */
const marker = `await supabaseAdmin.from("subscription_profiles").update({ status: "active", updated_at: now }).eq("user_id", tx.user_id);`;

if (!webhook.includes(marker)) {
  restoreAll();
  die(
    "Webhook success güncelleme satırı beklenen formatta bulunamadı. " +
    "Güvenlik için oluşturulan v27 dosyaları geri alındı ve mevcut webhook korunmuştur."
  );
}

const replacement = `const { data: currentProfile } = await supabaseAdmin
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
      .eq("user_id", tx.user_id);`;

const webhookUpdated = webhook.replace(marker, replacement);
writeExisting(webhookFile, webhookUpdated);

/* -------------------------------------------------
   7) TYPECHECK + OTOMATİK GERİ ALMA
-------------------------------------------------- */
console.log("\n🔎 Son typecheck...");
try {
  run("npm run typecheck");
  console.log("✅ v27 typecheck temiz");
} catch (e) {
  restoreAll();
  console.error("\nTypecheck hatası:\n", e?.stderr || e?.message || e);
  die("v27 typecheck başarısız oldu. Script tüm v27 değişikliklerini otomatik geri aldı.");
}

console.log("\n==========================================");
console.log("✅ V27 KOD KURULUMU TAMAMLANDI");
console.log("==========================================");
console.log("Oluşturulan:");
console.log("  app/api/payments/iyzico/cancel/route.ts");
console.log("  app/api/payments/iyzico/change-plan/route.ts");
console.log("  supabase-v27-subscription-lifecycle.sql");
console.log("Güncellenen:");
console.log("  app/api/payments/iyzico/webhook/route.ts");
console.log("");
console.log("ŞİMDİ DURUN.");
console.log("1) Önce git diff incelenecek.");
console.log("2) Sonra Supabase SQL çalıştırılacak.");
console.log("3) Sonra sandbox testleri yapılacak.");
console.log("4) En son commit/push yapılacak.");
console.log("");
console.log("Backup:", path.relative(ROOT, backupDir));

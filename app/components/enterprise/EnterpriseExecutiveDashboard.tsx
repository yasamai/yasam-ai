"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";

type Plan = "standard" | "premium" | "gold";
type Organization = { id: string; name: string; status: string };
type Summary = {
  team?: { active_members?: number; admins_managers?: number };
  tasks?: { open?: number; critical?: number; done?: number; overdue?: number };
  workspace?: { active_items?: number };
  legal?: { open_matters?: number; high_risk?: number; expert_review?: number };
  transactions?: { active_rooms?: number; negotiation?: number; closing?: number; completed?: number; pending_offers?: number; pending_offer_value?: number };
  generated_at?: string;
};
type PipelineRow = { status: string; room_count: number; asking_value_try: number; pending_offer_value_try: number };
type ActivityRow = { source: string; activity_id: string; action_type: string; summary: string | null; created_at: string };
type Snapshot = { id: string; report_type: string; title: string; created_at: string };

const card: React.CSSProperties = { background: "#fff", border: "1px solid #dbe6ef", borderRadius: 18, padding: 16, boxShadow: "0 8px 24px rgba(15,23,42,.06)" };
const muted: React.CSSProperties = { fontSize: 12, color: "#64748b", lineHeight: 1.45 };
const button: React.CSSProperties = { border: 0, borderRadius: 12, padding: "11px 14px", fontWeight: 800, cursor: "pointer", background: "linear-gradient(90deg,#0f766e,#0891b2)", color: "#fff" };
const selectStyle: React.CSSProperties = { width: "100%", border: "1px solid #cbd5e1", borderRadius: 12, padding: "11px 12px", fontSize: 14, background: "#fff", color: "#0f172a" };

const statusLabels: Record<string, string> = {
  draft: "Taslak", negotiation: "Pazarlık", agreement: "Anlaşma", due_diligence: "İnceleme", closing: "Kapanış", completed: "Tamamlandı", cancelled: "İptal",
};
const sourceLabels: Record<string, string> = { organization: "Şirket", legal: "Hukuk", transaction: "İşlem" };

function n(value: unknown) { const num = Number(value ?? 0); return Number.isFinite(num) ? num : 0; }
function money(value: unknown) { return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(n(value)); }
function date(value: string | undefined) { return value ? new Date(value).toLocaleString("tr-TR") : "—"; }

function Kpi({ label, value, note }: { label: string; value: string | number; note: string }) {
  return <div style={{ ...card, minHeight: 112 }}><div style={{ ...muted, fontWeight: 800 }}>{label}</div><div style={{ fontSize: 28, fontWeight: 950, color: "#0f172a", marginTop: 8 }}>{value}</div><div style={{ ...muted, marginTop: 5 }}>{note}</div></div>;
}

export default function EnterpriseExecutiveDashboard({ userId, plan }: { userId: string | null; plan: Plan }) {
  void plan; // UI uyumlulugu icin tutulur; yetki server-side abonelik durumundan gelir.
  const [membershipChecked, setMembershipChecked] = useState(false);
  const [goldAllowed, setGoldAllowed] = useState(false);
  const [membershipReason, setMembershipReason] = useState("");
  const gold = membershipChecked && goldAllowed;
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [pipeline, setPipeline] = useState<PipelineRow[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedOrg = useMemo(() => organizations.find((o) => o.id === organizationId) ?? organizations[0] ?? null, [organizations, organizationId]);

    useEffect(() => {
    setMembershipChecked(false);
    setGoldAllowed(false);
    setMembershipReason("");
    void verifyGoldAccess();
  }, [userId]);

  useEffect(() => {
    if (!userId || !gold) return;
    void loadOrganizations();
  }, [userId, gold]);

  useEffect(() => {
    if (!selectedOrg?.id || !gold) return;
    if (organizationId !== selectedOrg.id) setOrganizationId(selectedOrg.id);
    void loadDashboard(selectedOrg.id);
  }, [selectedOrg?.id, gold]);

  async function verifyGoldAccess() {
    if (!userId) {
      setMembershipChecked(true);
      setGoldAllowed(false);
      setMembershipReason("Oturum gerekli");
      return;
    }

    try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const token = data.session?.access_token;
      if (!token) throw new Error("Aktif oturum bulunamadı.");

      const response = await fetch("/api/membership/access", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "Üyelik erişimi doğrulanamadı.");

      setGoldAllowed(Boolean(payload?.access?.goldAccess));
      setMembershipReason(String(payload?.access?.reason || ""));
      setMembershipChecked(true);
    } catch (membershipError) {
      setGoldAllowed(false);
      setMembershipChecked(true);
      setMembershipReason("Doğrulama başarısız");
      setError(membershipError instanceof Error ? membershipError.message : "Gold erişimi doğrulanamadı.");
    }
  }
  async function loadOrganizations() {
    const { data, error: orgError } = await supabase.from("organizations").select("id,name,status").eq("status", "active").order("name");
    if (orgError) { setError(`Şirket listesi yüklenemedi: ${orgError.message}`); return; }
    const rows = (data ?? []) as Organization[];
    setOrganizations(rows);
    if (!organizationId && rows[0]?.id) setOrganizationId(rows[0].id);
  }

  async function loadDashboard(orgId = organizationId) {
    if (!orgId || !gold) return;
    setLoading(true); setError(""); setNotice("");
    const [summaryRes, pipelineRes, activityRes, snapshotRes] = await Promise.all([
      supabase.rpc("get_enterprise_dashboard_summary", { p_organization_id: orgId }),
      supabase.rpc("get_enterprise_transaction_pipeline", { p_organization_id: orgId }),
      supabase.rpc("get_enterprise_recent_activity", { p_organization_id: orgId, p_limit: 25 }),
      supabase.from("organization_report_snapshots").select("id,report_type,title,created_at").eq("organization_id", orgId).order("created_at", { ascending: false }).limit(8),
    ]);
    const firstError = summaryRes.error || pipelineRes.error || activityRes.error || snapshotRes.error;
    if (firstError) setError(`Yönetici dashboard yüklenemedi: ${firstError.message}`);
    else {
      setSummary((summaryRes.data ?? {}) as Summary);
      setPipeline((pipelineRes.data ?? []) as PipelineRow[]);
      setActivity((activityRes.data ?? []) as ActivityRow[]);
      setSnapshots((snapshotRes.data ?? []) as Snapshot[]);
    }
    setLoading(false);
  }

  async function createSnapshot() {
    if (!organizationId || !gold) return;
    setSaving(true); setError(""); setNotice("");
    const { error: rpcError } = await supabase.rpc("create_enterprise_report_snapshot", {
      p_organization_id: organizationId,
      p_report_type: "executive",
      p_title: `${selectedOrg?.name ?? "Yaşam AI"} Yönetici Raporu`,
    });
    if (rpcError) setError(`Rapor snapshot oluşturulamadı: ${rpcError.message}`);
    else { setNotice("Kurumsal yönetici raporu snapshot'ı oluşturuldu."); await loadDashboard(organizationId); }
    setSaving(false);
  }

  const transactions = summary?.transactions ?? {};
  const tasks = summary?.tasks ?? {};
  const legal = summary?.legal ?? {};
  const team = summary?.team ?? {};

  const pipelineTotals = useMemo(
    () =>
      pipeline.reduce(
        (acc, row) => ({
          rooms: acc.rooms + n(row.room_count),
          asking: acc.asking + n(row.asking_value_try),
          offers: acc.offers + n(row.pending_offer_value_try),
        }),
        { rooms: 0, asking: 0, offers: 0 }
      ),
    [pipeline]
  );

  const offerCoverage =
    pipelineTotals.asking > 0 ? Math.min(100, Math.round((pipelineTotals.offers / pipelineTotals.asking) * 100)) : 0;
  const executiveRiskCount = n(tasks.overdue) + n(tasks.critical) + n(legal.high_risk);
  const executiveRiskLabel =
    executiveRiskCount >= 8 ? "Yüksek" : executiveRiskCount >= 3 ? "Orta" : "Kontrollü";
  const executiveReadiness =
    !summary ? "Veri bekleniyor" :
    executiveRiskCount >= 8 ? "Müdahale gerekli" :
    n(transactions.closing) > 0 ? "Kapanış odaklı" :
    n(transactions.negotiation) > 0 ? "Pazarlık odaklı" :
    "Operasyon stabil";

  return (
    <section id="enterprise-executive-dashboard" style={{ marginTop: 16, borderRadius: 24, border: "1px solid #cfe1ea", background: "linear-gradient(180deg,#f8fcff,#f8fffd)", padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 950, letterSpacing: ".08em", color: "#0f766e" }}>v24 · KURUMSAL YÖNETİCİ DASHBOARD</div>
          <h2 style={{ margin: "5px 0 5px", fontSize: 24, color: "#0f172a" }}>Şirketin tüm karar akışı tek ekranda.</h2>
          <div style={{ ...muted, maxWidth: 760 }}>Ekip, görev, hukuk, güvenli işlem, teklif hacmi ve faaliyetleri üst yönetim seviyesinde birleştirir.</div>
        </div>
        <div style={{ borderRadius: 999, padding: "8px 12px", fontSize: 12, fontWeight: 900, background: gold ? "#ecfdf5" : "#fff7ed", color: gold ? "#047857" : "#9a3412", border: `1px solid ${gold ? "#a7f3d0" : "#fed7aa"}` }}>{!membershipChecked ? "Üyelik doğrulanıyor..." : gold ? "✓ Server-side doğrulanmış Gold Elite" : `Gold erişimi kapalı${membershipReason ? ` · ${membershipReason}` : ""}`}</div>
      </div>

      {!userId ? <div style={{ ...card, marginTop: 14 }}>Dashboard için oturum açmalısınız.</div> : null}
      {userId && !gold ? <div style={{ ...card, marginTop: 14, background: "#fffaf0" }}><b>Kurumsal Yönetici Dashboard Gold Elite özelliğidir.</b><div style={{ ...muted, marginTop: 5 }}>Kurumsal KPI, işlem pipeline ve yönetici raporları Gold erişiminde açılır.</div></div> : null}

      {userId && gold ? <>
        <div style={{ ...card, marginTop: 14, display: "grid", gridTemplateColumns: "minmax(220px,1fr) auto auto", gap: 10, alignItems: "center" }}>
          <select style={selectStyle} value={organizationId} onChange={(e) => setOrganizationId(e.target.value)}>
            {organizations.length === 0 ? <option value="">Aktif şirket alanı bulunamadı</option> : organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
          <button style={button} disabled={!organizationId || loading} onClick={() => void loadDashboard()}>{loading ? "Yükleniyor..." : "Dashboard'u Yenile"}</button>
          <button style={{ ...button, background: "linear-gradient(90deg,#1e3a8a,#0f766e)" }} disabled={!organizationId || saving} onClick={() => void createSnapshot()}>{saving ? "Kaydediliyor..." : "Yönetici Raporu Oluştur"}</button>
        </div>
        {error ? <div style={{ ...card, marginTop: 10, borderColor: "#fecaca", color: "#991b1b", background: "#fff7f7" }}>{error}</div> : null}
        {notice ? <div style={{ ...card, marginTop: 10, borderColor: "#bbf7d0", color: "#166534", background: "#f0fdf4" }}>{notice}</div> : null}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(175px,1fr))", gap: 10, marginTop: 12 }}>
          <Kpi label="Aktif ekip" value={n(team.active_members)} note={`${n(team.admins_managers)} yönetici / admin`} />
          <Kpi label="Açık görev" value={n(tasks.open)} note={`${n(tasks.overdue)} gecikmiş · ${n(tasks.critical)} kritik`} />
          <Kpi label="Hukuk dosyası" value={n(legal.open_matters)} note={`${n(legal.high_risk)} yüksek risk · ${n(legal.expert_review)} uzman incelemede`} />
          <Kpi label="Aktif işlem" value={n(transactions.active_rooms)} note={`${n(transactions.negotiation)} pazarlık · ${n(transactions.closing)} kapanış`} />
          <Kpi label="Bekleyen teklif" value={n(transactions.pending_offers)} note={money(transactions.pending_offer_value)} />
          <Kpi label="Tamamlanan işlem" value={n(transactions.completed)} note={`Son güncelleme: ${date(summary?.generated_at)}`} />
                </div>

        <div style={{ ...card, marginTop: 12, background: "linear-gradient(135deg,#f8fbff,#f4fffb)", borderColor: "#c9e2df" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 950, color: "#0f766e", letterSpacing: ".08em" }}>YÖNETİCİ KARAR NABZI</div>
              <div style={{ fontSize: 20, fontWeight: 950, color: "#0f172a", marginTop: 5 }}>{executiveReadiness}</div>
              <div style={{ ...muted, marginTop: 4 }}>Mevcut görev, hukuk ve işlem verilerinden türetilen operasyon özeti.</div>
            </div>
            <div style={{ padding: "9px 12px", borderRadius: 999, background: executiveRiskLabel === "Yüksek" ? "#fef2f2" : executiveRiskLabel === "Orta" ? "#fff7ed" : "#ecfdf5", color: executiveRiskLabel === "Yüksek" ? "#991b1b" : executiveRiskLabel === "Orta" ? "#9a3412" : "#047857", fontWeight: 900, fontSize: 12 }}>
              Yönetim riski: {executiveRiskLabel}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(165px,1fr))", gap: 9, marginTop: 12 }}>
            <Kpi label="Pipeline hacmi" value={money(pipelineTotals.asking)} note={`${pipelineTotals.rooms} işlem aşaması`} />
            <Kpi label="Bekleyen teklif hacmi" value={money(pipelineTotals.offers)} note={`Talep değerinin %${offerCoverage}'i`} />
            <Kpi label="Yönetim risk sayacı" value={executiveRiskCount} note={`${n(tasks.overdue)} gecikmiş · ${n(tasks.critical)} kritik görev · ${n(legal.high_risk)} yüksek risk hukuk`} />
            <Kpi label="Kapanış odağı" value={n(transactions.closing)} note={`${n(transactions.negotiation)} işlem pazarlıkta`} />
          </div>

          <div style={{ marginTop: 12, padding: 12, borderRadius: 13, border: "1px solid #dbe8ee", background: "#fff", color: "#475569", fontSize: 12, lineHeight: 1.55 }}>
            <b style={{ color: "#0f172a" }}>Yönetim notu:</b>{" "}
            {executiveRiskLabel === "Yüksek"
              ? "Gecikmiş/kritik görevler ve yüksek riskli hukuk dosyaları öncelikli yönetim incelemesi gerektiriyor."
              : n(transactions.closing) > 0
                ? "Kapanış aşamasındaki işlemler için belge, hukuk ve teklif akışını aynı gün kontrol edin."
                : n(transactions.negotiation) > 0
                  ? "Pazarlık aşamasındaki işlemlerde teklif hacmi ve bekleyen kararları yakın takip edin."
                  : "Operasyon görünümü stabil; yeni faaliyet ve risk sinyallerini birleşik akıştan izleyin."}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.05fr) minmax(0,.95fr)", gap: 12, marginTop: 12 }}>
          <div style={card}>
            <div style={{ fontWeight: 950, color: "#0f172a" }}>İşlem pipeline</div>
            <div style={{ ...muted, marginTop: 3 }}>Aktif kurumsal işlemlerin aşama bazlı görünümü.</div>
            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {pipeline.length === 0 ? <div style={muted}>Henüz kurumsal işlem verisi yok.</div> : pipeline.map((row) => <div key={row.status} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, padding: 11, border: "1px solid #e2e8f0", borderRadius: 12 }}><div><b>{statusLabels[row.status] ?? row.status}</b><div style={muted}>{n(row.room_count)} işlem · Talep {money(row.asking_value_try)}</div></div><div style={{ textAlign: "right" }}><b>{money(row.pending_offer_value_try)}</b><div style={muted}>bekleyen teklif</div></div></div>)}
            </div>
          </div>

          <div style={card}>
            <div style={{ fontWeight: 950, color: "#0f172a" }}>Birleşik faaliyet akışı</div>
            <div style={{ ...muted, marginTop: 3 }}>Şirket + hukuk + güvenli işlem hareketleri.</div>
            <div style={{ marginTop: 10, display: "grid", gap: 8, maxHeight: 330, overflowY: "auto" }}>
              {activity.length === 0 ? <div style={muted}>Henüz faaliyet yok.</div> : activity.map((a) => <div key={`${a.source}-${a.activity_id}`} style={{ padding: 10, borderBottom: "1px solid #eef2f7" }}><div style={{ fontSize: 11, fontWeight: 900, color: "#0f766e" }}>{sourceLabels[a.source] ?? a.source} · {a.action_type}</div><div style={{ fontSize: 13, fontWeight: 750, color: "#1e293b", marginTop: 3 }}>{a.summary || "Faaliyet kaydı"}</div><div style={{ ...muted, marginTop: 2 }}>{date(a.created_at)}</div></div>)}
            </div>
          </div>
        </div>

        <div style={{ ...card, marginTop: 12 }}>
          <div style={{ fontWeight: 950, color: "#0f172a" }}>Yönetici rapor geçmişi</div>
          <div style={{ ...muted, marginTop: 3 }}>Karar anlarını snapshot olarak saklar; ileride PDF / paylaşım katmanına bağlanabilir.</div>
          <div style={{ marginTop: 10, display: "grid", gap: 7 }}>
            {snapshots.length === 0 ? <div style={muted}>Henüz yönetici raporu oluşturulmadı.</div> : snapshots.map((s) => <div key={s.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, border: "1px solid #e2e8f0", borderRadius: 12, padding: 10 }}><div><b>{s.title}</b><div style={muted}>{s.report_type}</div></div><div style={{ ...muted, textAlign: "right" }}>{date(s.created_at)}</div></div>)}
          </div>
        </div>
      </> : null}
    </section>
  );
}

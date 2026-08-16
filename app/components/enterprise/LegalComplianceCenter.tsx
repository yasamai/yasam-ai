"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";

type Plan = "standard" | "premium" | "gold";
type MatterType = "purchase" | "sale" | "lease" | "title_deed" | "contractor" | "construction" | "zoning" | "due_diligence" | "compliance" | "dispute" | "corporate" | "other";
type MatterStatus = "draft" | "ai_review" | "expert_review" | "reviewed" | "closed" | "archived";
type RiskLevel = "unknown" | "low" | "medium" | "high" | "critical";
type DocumentType = "title_deed" | "lease_contract" | "sale_contract" | "promise_to_sell" | "construction_contract" | "power_of_attorney" | "zoning_document" | "permit" | "expert_report" | "court_document" | "corporate_document" | "identity_supporting" | "other";
type AccessRole = "viewer" | "editor" | "legal_reviewer";
type ReviewType = "ai_draft" | "attorney_review" | "compliance_review";

type Organization = { id: string; name: string; status: string };
type Matter = {
  id: string;
  owner_user_id: string;
  organization_id: string | null;
  title: string;
  matter_type: MatterType;
  status: MatterStatus;
  risk_level: RiskLevel;
  property_reference: string | null;
  summary: string | null;
  created_at: string;
  updated_at: string;
};
type LegalDocument = { id: string; matter_id: string; document_type: DocumentType; file_name: string; analysis_status: string; created_at: string };
type RiskFlag = { id: string; source_type: "ai" | "legal_reviewer" | "system"; category: string; severity: Exclude<RiskLevel, "unknown">; title: string; description: string | null; recommendation: string | null; status: string; verified_by_expert: boolean; created_at: string };
type Grant = { id: string; granted_to_user_id: string; access_role: AccessRole; expires_at: string | null; revoked_at: string | null; created_at: string };
type Review = { id: string; reviewer_user_id: string; review_type: ReviewType; status: string; opinion_text: string | null; disclaimer: string | null; is_final_legal_opinion: boolean; signed_at: string | null; created_at: string };
type Activity = { id: string; action_type: string; summary: string | null; created_at: string };

const matterTypeLabels: Record<MatterType, string> = {
  purchase: "Satın alma",
  sale: "Satış",
  lease: "Kira",
  title_deed: "Tapu",
  contractor: "Müteahhit sözleşmesi",
  construction: "İnşaat",
  zoning: "İmar",
  due_diligence: "Hukuki durum tespiti",
  compliance: "Uyum",
  dispute: "Uyuşmazlık",
  corporate: "Kurumsal",
  other: "Diğer",
};

const statusLabels: Record<MatterStatus, string> = {
  draft: "Taslak",
  ai_review: "AI ön inceleme",
  expert_review: "Uzman incelemesi",
  reviewed: "İncelendi",
  closed: "Kapalı",
  archived: "Arşiv",
};

const riskLabels: Record<RiskLevel, string> = { unknown: "Belirsiz", low: "Düşük", medium: "Orta", high: "Yüksek", critical: "Kritik" };
const documentLabels: Record<DocumentType, string> = {
  title_deed: "Tapu",
  lease_contract: "Kira sözleşmesi",
  sale_contract: "Satış sözleşmesi",
  promise_to_sell: "Satış vaadi",
  construction_contract: "İnşaat sözleşmesi",
  power_of_attorney: "Vekâletname",
  zoning_document: "İmar belgesi",
  permit: "Ruhsat / izin",
  expert_report: "Uzman raporu",
  court_document: "Yargı belgesi",
  corporate_document: "Kurumsal belge",
  identity_supporting: "Kimlik destek belgesi",
  other: "Diğer",
};

function asNull(value: string) { const v = value.trim(); return v ? v : null; }
function date(value: string | null) { return value ? new Date(value).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"; }

export default function LegalComplianceCenter({ userId, plan }: { userId: string | null; plan: Plan }) {
  const entitled = plan === "premium" || plan === "gold";
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [matters, setMatters] = useState<Matter[]>([]);
  const [selectedMatterId, setSelectedMatterId] = useState("");
  const [documents, setDocuments] = useState<LegalDocument[]>([]);
  const [risks, setRisks] = useState<RiskFlag[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [matterType, setMatterType] = useState<MatterType>("due_diligence");
  const [organizationId, setOrganizationId] = useState("");
  const [propertyReference, setPropertyReference] = useState("");
  const [summary, setSummary] = useState("");

  const [documentType, setDocumentType] = useState<DocumentType>("title_deed");
  const [documentName, setDocumentName] = useState("");

  const [riskCategory, setRiskCategory] = useState("Sözleşme");
  const [riskSeverity, setRiskSeverity] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [riskTitle, setRiskTitle] = useState("");
  const [riskDescription, setRiskDescription] = useState("");
  const [riskRecommendation, setRiskRecommendation] = useState("");

  const [grantUserId, setGrantUserId] = useState("");
  const [grantRole, setGrantRole] = useState<AccessRole>("legal_reviewer");
  const [grantExpiry, setGrantExpiry] = useState("");

  const [reviewText, setReviewText] = useState("");

  const selectedMatter = useMemo(() => matters.find((m) => m.id === selectedMatterId) ?? matters[0] ?? null, [matters, selectedMatterId]);
  const canManage = Boolean(selectedMatter && userId && selectedMatter.owner_user_id === userId);
  const canReview = useMemo(() => grants.some((g) => g.granted_to_user_id === userId && g.access_role === "legal_reviewer" && !g.revoked_at && (!g.expires_at || new Date(g.expires_at).getTime() > Date.now())), [grants, userId]);
  const openRisks = risks.filter((r) => r.status === "open");
  const expertVerified = risks.filter((r) => r.verified_by_expert).length;

  async function logActivity(matterId: string, actionType: string, text: string, entityType?: string, entityId?: string) {
    if (!userId) return;
    await supabase.from("legal_activity").insert({ matter_id: matterId, actor_user_id: userId, action_type: actionType, entity_type: entityType ?? null, entity_id: entityId ?? null, summary: text });
  }

  async function loadMatters() {
    if (!userId) return;
    setLoading(true); setError("");
    const [{ data: orgData }, { data, error: loadError }] = await Promise.all([
      supabase.from("organizations").select("id,name,status").eq("status", "active").order("created_at", { ascending: false }),
      supabase.from("legal_matters").select("id,owner_user_id,organization_id,title,matter_type,status,risk_level,property_reference,summary,created_at,updated_at").order("updated_at", { ascending: false }),
    ]);
    setOrganizations((orgData ?? []) as Organization[]);
    if (loadError) { setError(`Hukuk merkezi yüklenemedi: ${loadError.message}`); setLoading(false); return; }
    const next = (data ?? []) as Matter[];
    setMatters(next);
    setSelectedMatterId((current) => current && next.some((m) => m.id === current) ? current : next[0]?.id ?? "");
    setLoading(false);
  }

  async function loadMatterDetail(matterId: string) {
    if (!matterId) { setDocuments([]); setRisks([]); setGrants([]); setReviews([]); setActivity([]); return; }
    const [d, r, g, v, a] = await Promise.all([
      supabase.from("legal_documents").select("id,matter_id,document_type,file_name,analysis_status,created_at").eq("matter_id", matterId).order("created_at", { ascending: false }),
      supabase.from("legal_risk_flags").select("id,source_type,category,severity,title,description,recommendation,status,verified_by_expert,created_at").eq("matter_id", matterId).order("created_at", { ascending: false }),
      supabase.from("legal_access_grants").select("id,granted_to_user_id,access_role,expires_at,revoked_at,created_at").eq("matter_id", matterId).order("created_at", { ascending: false }),
      supabase.from("legal_reviews").select("id,reviewer_user_id,review_type,status,opinion_text,disclaimer,is_final_legal_opinion,signed_at,created_at").eq("matter_id", matterId).order("created_at", { ascending: false }),
      supabase.from("legal_activity").select("id,action_type,summary,created_at").eq("matter_id", matterId).order("created_at", { ascending: false }).limit(20),
    ]);
    const firstError = d.error || r.error || g.error || v.error || a.error;
    if (firstError) setError(`Dosya detayı yüklenemedi: ${firstError.message}`);
    setDocuments((d.data ?? []) as LegalDocument[]); setRisks((r.data ?? []) as RiskFlag[]); setGrants((g.data ?? []) as Grant[]); setReviews((v.data ?? []) as Review[]); setActivity((a.data ?? []) as Activity[]);
  }

  useEffect(() => { void loadMatters(); }, [userId]);
  useEffect(() => { if (selectedMatter?.id) void loadMatterDetail(selectedMatter.id); }, [selectedMatter?.id]);

  async function createMatter(event: FormEvent) {
    event.preventDefault(); if (!userId || !entitled || !title.trim()) return;
    setSaving(true); setError(""); setNotice("");
    const { data, error: insertError } = await supabase.rpc("create_legal_matter", {
      p_title: title.trim(),
      p_matter_type: matterType,
      p_organization_id: asNull(organizationId),
      p_property_reference: asNull(propertyReference),
      p_summary: asNull(summary),
    });
    if (insertError) setError(`Hukuki dosya oluşturulamadı: ${insertError.message}`);
    else {
      const matterId = String(data);
      setTitle(""); setPropertyReference(""); setSummary(""); setNotice("Hukuki dosya oluşturuldu.");
      await logActivity(matterId, "matter_created", "Hukuki dosya oluşturuldu.", "legal_matter", matterId);
      await loadMatters(); setSelectedMatterId(matterId);
    }
    setSaving(false);
  }

  async function addDocument(event: FormEvent) {
    event.preventDefault(); if (!selectedMatter || !userId || !documentName.trim()) return;
    setSaving(true); setError("");
    const { data, error: insertError } = await supabase.from("legal_documents").insert({ matter_id: selectedMatter.id, uploaded_by: userId, document_type: documentType, file_name: documentName.trim(), analysis_status: "pending" }).select("id").single();
    if (insertError) setError(`Belge kaydı eklenemedi: ${insertError.message}`);
    else { setDocumentName(""); setNotice("Belge metadata kaydı eklendi. Gerçek dosya yükleme Storage katmanında bağlanacak."); await logActivity(selectedMatter.id, "document_added", `Belge eklendi: ${documentName.trim()}`, "legal_document", data.id); await loadMatterDetail(selectedMatter.id); }
    setSaving(false);
  }

  async function addRisk(event: FormEvent) {
    event.preventDefault(); if (!selectedMatter || !userId || !riskTitle.trim()) return;
    setSaving(true); setError("");
    const source = canReview ? "legal_reviewer" : "ai";
    const { data, error: insertError } = await supabase.from("legal_risk_flags").insert({ matter_id: selectedMatter.id, created_by: userId, source_type: source, category: riskCategory.trim() || "general", severity: riskSeverity, title: riskTitle.trim(), description: asNull(riskDescription), recommendation: asNull(riskRecommendation), verified_by_expert: canReview }).select("id").single();
    if (insertError) setError(`Risk sinyali kaydedilemedi: ${insertError.message}`);
    else { setRiskTitle(""); setRiskDescription(""); setRiskRecommendation(""); setNotice(canReview ? "Uzman risk değerlendirmesi kaydedildi." : "Ön inceleme risk sinyali kaydedildi; nihai hukuki görüş değildir."); await logActivity(selectedMatter.id, "risk_flag_added", `Risk sinyali: ${riskTitle.trim()}`, "legal_risk_flag", data.id); await loadMatterDetail(selectedMatter.id); }
    setSaving(false);
  }

  async function grantAccess(event: FormEvent) {
    event.preventDefault(); if (!selectedMatter || !userId || !canManage || !grantUserId.trim()) return;
    setSaving(true); setError("");
    const { data, error: insertError } = await supabase.from("legal_access_grants").insert({ matter_id: selectedMatter.id, granted_to_user_id: grantUserId.trim(), granted_by_user_id: userId, access_role: grantRole, expires_at: grantExpiry ? new Date(`${grantExpiry}T23:59:59`).toISOString() : null }).select("id").single();
    if (insertError) setError(`Uzman erişimi verilemedi: ${insertError.message}`);
    else { setGrantUserId(""); setGrantExpiry(""); setNotice("Dosya erişimi verildi."); await logActivity(selectedMatter.id, "access_granted", `${grantRole} erişimi verildi.`, "legal_access_grant", data.id); await loadMatterDetail(selectedMatter.id); }
    setSaving(false);
  }

  async function revokeGrant(grant: Grant) {
    if (!selectedMatter || !canManage) return;
    const { error: updateError } = await supabase.from("legal_access_grants").update({ revoked_at: new Date().toISOString() }).eq("id", grant.id);
    if (updateError) setError(`Erişim iptal edilemedi: ${updateError.message}`);
    else { setNotice("Dosya erişimi iptal edildi."); await logActivity(selectedMatter.id, "access_revoked", "Dosya erişimi iptal edildi.", "legal_access_grant", grant.id); await loadMatterDetail(selectedMatter.id); }
  }

  async function saveReview(event: FormEvent) {
    event.preventDefault(); if (!selectedMatter || !userId || !reviewText.trim()) return;
    setSaving(true); setError("");
    const finalOpinion = canReview;
    const { data, error: insertError } = await supabase.from("legal_reviews").insert({ matter_id: selectedMatter.id, reviewer_user_id: userId, review_type: finalOpinion ? "attorney_review" : "ai_draft", status: finalOpinion ? "approved" : "draft", opinion_text: reviewText.trim(), disclaimer: finalOpinion ? "Yetkili uzman incelemesi." : "Bu kayıt AI/ön inceleme taslağıdır; nihai hukuki görüş değildir.", is_final_legal_opinion: finalOpinion, signed_at: finalOpinion ? new Date().toISOString() : null }).select("id").single();
    if (insertError) setError(`İnceleme kaydedilemedi: ${insertError.message}`);
    else { setReviewText(""); setNotice(finalOpinion ? "Nihai uzman görüşü kaydedildi." : "Ön inceleme taslağı kaydedildi; hukuki görüş değildir."); await logActivity(selectedMatter.id, "review_saved", finalOpinion ? "Uzman hukuki görüşü kaydedildi." : "Ön inceleme taslağı kaydedildi.", "legal_review", data.id); await loadMatterDetail(selectedMatter.id); }
    setSaving(false);
  }

  async function updateMatterStatus(status: MatterStatus) {
    if (!selectedMatter || !canManage) return;
    const { error: updateError } = await supabase.from("legal_matters").update({ status }).eq("id", selectedMatter.id);
    if (updateError) setError(`Dosya durumu güncellenemedi: ${updateError.message}`);
    else { await logActivity(selectedMatter.id, "matter_status_updated", `Dosya durumu: ${statusLabels[status]}`); await loadMatters(); }
  }

  const shell = { border: "1px solid #d8e2ea", borderRadius: 22, background: "linear-gradient(180deg,#fbfdff,#f6f9fc)", padding: 18, marginTop: 14 } as const;
  const card = { border: "1px solid #dfe7ee", borderRadius: 16, background: "#fff", padding: 14 } as const;
  const input = { width: "100%", padding: "10px 12px", borderRadius: 11, border: "1px solid #d8e0e8", background: "#fff", fontSize: 13, color: "#183247", boxSizing: "border-box" as const };
  const button = { border: 0, borderRadius: 11, padding: "10px 14px", background: "linear-gradient(90deg,#0d6c7a,#158b8b)", color: "#fff", fontWeight: 850, cursor: "pointer" } as const;

  return <section id="legal-compliance-center" style={shell}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div><div style={{ fontSize: 11, fontWeight: 900, letterSpacing: 1.3, color: "#0d6c7a" }}>v22 · HUKUK & UYUM MERKEZİ</div><h3 style={{ margin: "6px 0 4px", fontSize: 24, color: "#183247" }}>Gayrimenkul kararına hukuki güven katmanı.</h3><div style={{ fontSize: 13, color: "#637789", maxWidth: 820 }}>Belge, risk sinyali, uzman erişimi ve denetlenebilir inceleme akışı tek dosyada. AI/ön inceleme çıktıları nihai hukuki görüş değildir; nihai görüş yalnızca yetkili uzman rolüyle kaydedilebilir.</div></div>
      <div style={{ borderRadius: 999, padding: "8px 12px", fontSize: 11, fontWeight: 900, background: entitled ? "#e8f8ef" : "#fff4dc", color: entitled ? "#257a4b" : "#9b6a13" }}>{entitled ? "✓ PREMIUM / GOLD ERİŞİM" : "🔒 PREMIUM GEREKLİ"}</div>
    </div>

    {!entitled && <div style={{ ...card, marginTop: 14, background: "#fff9ed", color: "#8b6512" }}>Hukuk & Uyum Merkezi Premium ve Gold planlarda açılır.</div>}
    {error && <div style={{ ...card, marginTop: 14, borderColor: "#f0c9c9", background: "#fff7f7", color: "#9b3131" }}>{error}</div>}
    {notice && <div style={{ ...card, marginTop: 14, borderColor: "#bfe3cf", background: "#f4fbf7", color: "#2b7450" }}>{notice}</div>}

    <div style={{ display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", gap: 10, marginTop: 14 }}>
      {[["Hukuki dosya", matters.length], ["Belge", documents.length], ["Açık risk", openRisks.length], ["Uzman doğrulama", expertVerified], ["İnceleme", reviews.length]].map(([label, value]) => <div key={String(label)} style={card}><div style={{ fontSize: 10, fontWeight: 800, color: "#789" }}>{label}</div><div style={{ fontSize: 22, fontWeight: 900, color: "#183247", marginTop: 4 }}>{value}</div></div>)}
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "minmax(280px,.8fr) minmax(340px,1.2fr)", gap: 12, marginTop: 14 }}>
      <form onSubmit={createMatter} style={card}>
        <div style={{ fontWeight: 900, color: "#183247", marginBottom: 10 }}>Yeni hukuki dosya</div>
        <div style={{ display: "grid", gap: 8 }}>
          <input style={input} placeholder="Dosya başlığı" value={title} onChange={(e) => setTitle(e.target.value)} disabled={!entitled || saving} />
          <select style={input} value={matterType} onChange={(e) => setMatterType(e.target.value as MatterType)} disabled={!entitled || saving}>{Object.entries(matterTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select style={input} value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} disabled={!entitled || saving}><option value="">Bireysel dosya</option>{organizations.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
          <input style={input} placeholder="Taşınmaz / proje referansı" value={propertyReference} onChange={(e) => setPropertyReference(e.target.value)} disabled={!entitled || saving} />
          <textarea style={{ ...input, minHeight: 78, resize: "vertical" }} placeholder="Kısa dosya özeti" value={summary} onChange={(e) => setSummary(e.target.value)} disabled={!entitled || saving} />
          <button style={button} disabled={!entitled || saving || !title.trim()}>{saving ? "Kaydediliyor…" : "Hukuki Dosya Oluştur"}</button>
        </div>
      </form>

      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}><div style={{ fontWeight: 900, color: "#183247" }}>Aktif dosya</div><span style={{ fontSize: 11, color: "#789" }}>{loading ? "Yükleniyor…" : `${matters.length} dosya`}</span></div>
        <select style={{ ...input, marginTop: 10 }} value={selectedMatter?.id ?? ""} onChange={(e) => setSelectedMatterId(e.target.value)}><option value="">Dosya seçin</option>{matters.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}</select>
        {selectedMatter ? <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}><div><div style={{ fontSize: 17, fontWeight: 900, color: "#183247" }}>{selectedMatter.title}</div><div style={{ fontSize: 12, color: "#6b7d8b", marginTop: 3 }}>{matterTypeLabels[selectedMatter.matter_type]} · Risk: {riskLabels[selectedMatter.risk_level]}</div></div><div style={{ fontSize: 11, fontWeight: 850, padding: "6px 9px", borderRadius: 999, background: "#eef5f8", color: "#376476" }}>{statusLabels[selectedMatter.status]}</div></div>
          <div style={{ fontSize: 12, color: "#526979", marginTop: 8 }}>{selectedMatter.summary || "Dosya özeti girilmemiş."}</div>
          {canManage && <select style={{ ...input, marginTop: 10 }} value={selectedMatter.status} onChange={(e) => void updateMatterStatus(e.target.value as MatterStatus)}>{Object.entries(statusLabels).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select>}
        </div> : <div style={{ marginTop: 14, color: "#789", fontSize: 13 }}>Henüz hukuki dosya yok.</div>}
      </div>
    </div>

    {selectedMatter && <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12, marginTop: 12 }}>
        <form onSubmit={addDocument} style={card}><div style={{ fontWeight: 900, color: "#183247", marginBottom: 9 }}>Belge merkezi</div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}><select style={input} value={documentType} onChange={(e) => setDocumentType(e.target.value as DocumentType)}>{Object.entries(documentLabels).map(([k,v]) => <option key={k} value={k}>{v}</option>)}</select><input style={input} placeholder="Dosya adı (ör. tapu.pdf)" value={documentName} onChange={(e) => setDocumentName(e.target.value)} /></div><button style={{ ...button, marginTop: 8, width: "100%" }} disabled={!documentName.trim() || saving}>Belge Kaydı Ekle</button><div style={{ fontSize: 11, color: "#7d8b96", marginTop: 8 }}>Bu sürüm metadata altyapısını test eder. Dosya binary yükleme/Storage bağlantısı sonraki güvenlik katmanında açılır.</div><div style={{ display: "grid", gap: 7, marginTop: 10 }}>{documents.slice(0,5).map((d) => <div key={d.id} style={{ borderTop: "1px solid #edf1f4", paddingTop: 7 }}><b style={{ fontSize: 12 }}>{documentLabels[d.document_type]}</b><div style={{ fontSize: 12, color: "#617684" }}>{d.file_name} · {d.analysis_status}</div></div>)}</div></form>

        <form onSubmit={addRisk} style={card}><div style={{ fontWeight: 900, color: "#183247", marginBottom: 9 }}>{canReview ? "Uzman risk değerlendirmesi" : "Ön inceleme risk sinyali"}</div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}><input style={input} value={riskCategory} onChange={(e) => setRiskCategory(e.target.value)} placeholder="Kategori" /><select style={input} value={riskSeverity} onChange={(e) => setRiskSeverity(e.target.value as typeof riskSeverity)}><option value="low">Düşük</option><option value="medium">Orta</option><option value="high">Yüksek</option><option value="critical">Kritik</option></select></div><input style={{ ...input, marginTop: 8 }} value={riskTitle} onChange={(e) => setRiskTitle(e.target.value)} placeholder="Risk başlığı" /><textarea style={{ ...input, marginTop: 8, minHeight: 62 }} value={riskDescription} onChange={(e) => setRiskDescription(e.target.value)} placeholder="Tespit / açıklama" /><input style={{ ...input, marginTop: 8 }} value={riskRecommendation} onChange={(e) => setRiskRecommendation(e.target.value)} placeholder="Önerilen kontrol" /><button style={{ ...button, marginTop: 8, width: "100%" }} disabled={!riskTitle.trim() || saving}>Risk Sinyalini Kaydet</button><div style={{ display: "grid", gap: 7, marginTop: 10 }}>{risks.slice(0,4).map((r) => <div key={r.id} style={{ borderTop: "1px solid #edf1f4", paddingTop: 7 }}><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><b style={{ fontSize: 12 }}>{r.title}</b><span style={{ fontSize: 10, fontWeight: 850 }}>{riskLabels[r.severity]}</span></div><div style={{ fontSize: 11, color: r.verified_by_expert ? "#2a7450" : "#8a6b2d" }}>{r.verified_by_expert ? "Uzman doğrulamalı" : "Ön inceleme · nihai görüş değil"}</div></div>)}</div></form>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12, marginTop: 12 }}>
        <form onSubmit={grantAccess} style={card}><div style={{ fontWeight: 900, color: "#183247", marginBottom: 9 }}>Uzman / avukat erişimi</div><input style={input} placeholder="Yetki verilecek kullanıcı UUID" value={grantUserId} onChange={(e) => setGrantUserId(e.target.value)} disabled={!canManage} /><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}><select style={input} value={grantRole} onChange={(e) => setGrantRole(e.target.value as AccessRole)} disabled={!canManage}><option value="viewer">Görüntüleyici</option><option value="editor">Editör</option><option value="legal_reviewer">Hukuk uzmanı</option></select><input style={input} type="date" value={grantExpiry} onChange={(e) => setGrantExpiry(e.target.value)} disabled={!canManage} /></div><button style={{ ...button, width: "100%", marginTop: 8 }} disabled={!canManage || !grantUserId.trim() || saving}>Dosya Erişimi Ver</button><div style={{ display: "grid", gap: 7, marginTop: 10 }}>{grants.map((g) => <div key={g.id} style={{ borderTop: "1px solid #edf1f4", paddingTop: 7, display: "flex", justifyContent: "space-between", gap: 8 }}><div><b style={{ fontSize: 11 }}>{g.access_role}</b><div style={{ fontSize: 10, color: "#789" }}>{g.granted_to_user_id.slice(0,8)}… · {g.revoked_at ? "İptal" : `Bitiş: ${date(g.expires_at)}`}</div></div>{canManage && !g.revoked_at && <button type="button" onClick={() => void revokeGrant(g)} style={{ border: "1px solid #d9e0e6", background: "#fff", borderRadius: 9, padding: "5px 8px", cursor: "pointer" }}>İptal</button>}</div>)}</div></form>

        <form onSubmit={saveReview} style={card}><div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><div style={{ fontWeight: 900, color: "#183247" }}>{canReview ? "Yetkili uzman görüşü" : "İnceleme taslağı"}</div><span style={{ fontSize: 10, fontWeight: 850, color: canReview ? "#247248" : "#8a6b2d" }}>{canReview ? "NİHAİ GÖRÜŞ YETKİSİ" : "HUKUKİ GÖRÜŞ DEĞİL"}</span></div><textarea style={{ ...input, marginTop: 9, minHeight: 105 }} value={reviewText} onChange={(e) => setReviewText(e.target.value)} placeholder={canReview ? "Uzman hukuki değerlendirmesi" : "Ön inceleme / çalışma taslağı"} /><button style={{ ...button, width: "100%", marginTop: 8 }} disabled={!reviewText.trim() || saving}>{canReview ? "Uzman Görüşünü Kaydet" : "Taslağı Kaydet"}</button><div style={{ display: "grid", gap: 7, marginTop: 10 }}>{reviews.slice(0,4).map((r) => <div key={r.id} style={{ borderTop: "1px solid #edf1f4", paddingTop: 7 }}><div style={{ fontSize: 11, fontWeight: 850, color: r.is_final_legal_opinion ? "#247248" : "#8a6b2d" }}>{r.is_final_legal_opinion ? "Nihai uzman görüşü" : "Ön inceleme taslağı"} · {date(r.created_at)}</div><div style={{ fontSize: 12, color: "#526979", marginTop: 3 }}>{r.opinion_text}</div></div>)}</div></form>
      </div>

      <div style={{ ...card, marginTop: 12 }}><div style={{ fontWeight: 900, color: "#183247", marginBottom: 8 }}>Hukuki faaliyet akışı</div>{activity.length === 0 ? <div style={{ color: "#789", fontSize: 12 }}>Henüz faaliyet kaydı yok.</div> : <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }}>{activity.slice(0,9).map((a) => <div key={a.id} style={{ border: "1px solid #edf1f4", borderRadius: 11, padding: 9 }}><div style={{ fontSize: 11, fontWeight: 850, color: "#315d70" }}>{a.summary || a.action_type}</div><div style={{ fontSize: 10, color: "#8a98a3", marginTop: 4 }}>{date(a.created_at)}</div></div>)}</div>}</div>
    </>}
  </section>;
}

"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "../../../lib/supabase";

type Plan = "standard" | "premium" | "gold";
type OrgType = "company" | "agency" | "developer" | "valuation" | "bank" | "technical";
type OrgRole = "owner" | "admin" | "manager" | "analyst" | "member" | "viewer";

type Organization = {
  id: string;
  owner_user_id: string;
  name: string;
  slug: string | null;
  organization_type: OrgType;
  status: "active" | "suspended" | "archived";
};

type Member = {
  id: string;
  organization_id: string;
  user_id: string | null;
  email: string;
  role: OrgRole;
  status: "pending" | "active" | "revoked";
  created_at: string;
};

type Invitation = {
  id: string;
  organization_id: string;
  email: string;
  role: Exclude<OrgRole, "owner">;
  status: "pending" | "accepted" | "expired" | "revoked";
  expires_at: string;
  created_at: string;
};

const roleLabels: Record<OrgRole, string> = {
  owner: "Sahip",
  admin: "Yönetici",
  manager: "Operasyon Yöneticisi",
  analyst: "Analist",
  member: "Ekip Üyesi",
  viewer: "Görüntüleyici",
};

const typeLabels: Record<OrgType, string> = {
  company: "Şirket",
  agency: "Emlak Ofisi",
  developer: "Müteahhit",
  valuation: "Değerleme",
  bank: "Banka / Finans",
  technical: "Mimar / Mühendis",
};

function slugify(value: string) {
  return value
    .toLocaleLowerCase("tr-TR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 54);
}

export default function TeamRoleCenter({ userId, userEmail, plan }: { userId: string | null; userEmail: string | null; plan: Plan }) {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [orgName, setOrgName] = useState("");
  const [orgType, setOrgType] = useState<OrgType>("company");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<Exclude<OrgRole, "owner">>("member");

  const gold = plan === "gold";
  const selectedOrg = useMemo(() => organizations.find((item) => item.id === selectedOrgId) ?? organizations[0] ?? null, [organizations, selectedOrgId]);
  const activeMembers = members.filter((item) => item.status === "active");
  const pendingInvites = invitations.filter((item) => item.status === "pending");
  const admins = activeMembers.filter((item) => item.role === "owner" || item.role === "admin").length + (selectedOrg?.owner_user_id === userId ? 1 : 0);

  async function loadOrganizations() {
    if (!userId) return;
    setLoading(true);
    setError("");
    const { data, error: loadError } = await supabase.from("organizations").select("id,owner_user_id,name,slug,organization_type,status").order("created_at", { ascending: false });
    if (loadError) {
      setError(`Ekip merkezi yüklenemedi: ${loadError.message}`);
      setLoading(false);
      return;
    }
    const next = (data ?? []) as Organization[];
    setOrganizations(next);
    const nextId = selectedOrgId && next.some((item) => item.id === selectedOrgId) ? selectedOrgId : next[0]?.id ?? "";
    setSelectedOrgId(nextId);
    setLoading(false);
  }

  async function loadOrganizationDetail(orgId: string) {
    if (!orgId || !userId) {
      setMembers([]);
      setInvitations([]);
      return;
    }
    const [{ data: memberData, error: memberError }, { data: inviteData, error: inviteError }] = await Promise.all([
      supabase.from("organization_members").select("id,organization_id,user_id,email,role,status,created_at").eq("organization_id", orgId).order("created_at", { ascending: true }),
      supabase.from("organization_invitations").select("id,organization_id,email,role,status,expires_at,created_at").eq("organization_id", orgId).order("created_at", { ascending: false }),
    ]);
    if (memberError || inviteError) setError(memberError?.message || inviteError?.message || "Ekip detayları yüklenemedi.");
    setMembers((memberData ?? []) as Member[]);
    setInvitations((inviteData ?? []) as Invitation[]);
  }

  useEffect(() => { void loadOrganizations(); }, [userId]);
  useEffect(() => { void loadOrganizationDetail(selectedOrgId); }, [selectedOrgId, userId]);

  async function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId || !gold || !orgName.trim()) return;
    setSaving(true); setError(""); setNotice("");
    const baseSlug = slugify(orgName) || "yasam-ekip";
    const slug = `${baseSlug}-${Date.now().toString(36).slice(-5)}`;
    const { data, error: insertError } = await supabase.from("organizations").insert({ owner_user_id: userId, name: orgName.trim(), slug, organization_type: orgType }).select("id").single();
    if (insertError) {
      setError(`Şirket oluşturulamadı: ${insertError.message}`);
      setSaving(false);
      return;
    }
    if (userEmail) {
      await supabase.from("organization_members").insert({ organization_id: data.id, user_id: userId, email: userEmail.toLocaleLowerCase("tr-TR"), role: "owner", status: "active", invited_by: userId, joined_at: new Date().toISOString() });
    }
    setOrgName("");
    setNotice("Kurumsal ekip alanı oluşturuldu.");
    await loadOrganizations();
    setSelectedOrgId(data.id);
    setSaving(false);
  }

  async function inviteMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!userId || !gold || !selectedOrg || !inviteEmail.trim()) return;
    setSaving(true); setError(""); setNotice("");
    const email = inviteEmail.trim().toLocaleLowerCase("tr-TR");
    const { error: inviteError } = await supabase.from("organization_invitations").insert({ organization_id: selectedOrg.id, email, role: inviteRole, invited_by: userId });
    if (inviteError) setError(`Davet oluşturulamadı: ${inviteError.message}`);
    else {
      await supabase.from("organization_members").upsert({ organization_id: selectedOrg.id, email, role: inviteRole, status: "pending", invited_by: userId }, { onConflict: "organization_id,email" });
      setInviteEmail("");
      setNotice("Davet kaydı oluşturuldu. E-posta gönderim servisi bağlandığında otomatik davet iletilecek.");
      await loadOrganizationDetail(selectedOrg.id);
    }
    setSaving(false);
  }

  async function updateMemberRole(memberId: string, role: OrgRole) {
    if (!gold || !selectedOrg) return;
    setSaving(true); setError("");
    const { error: updateError } = await supabase.from("organization_members").update({ role, updated_at: new Date().toISOString() }).eq("id", memberId);
    if (updateError) setError(`Rol güncellenemedi: ${updateError.message}`);
    else { setNotice("Ekip rolü güncellendi."); await loadOrganizationDetail(selectedOrg.id); }
    setSaving(false);
  }

  async function revokeInvitation(id: string) {
    if (!gold || !selectedOrg) return;
    setSaving(true); setError("");
    const { error: revokeError } = await supabase.from("organization_invitations").update({ status: "revoked" }).eq("id", id);
    if (revokeError) setError(`Davet iptal edilemedi: ${revokeError.message}`);
    else { setNotice("Davet iptal edildi."); await loadOrganizationDetail(selectedOrg.id); }
    setSaving(false);
  }

  const card = { border: "1px solid #dbe7f3", borderRadius: 18, background: "#fff", padding: 17, boxShadow: "0 10px 26px rgba(31,64,97,.06)" } as const;
  const input = { width: "100%", padding: "11px 12px", borderRadius: 11, border: "1px solid #cdddea", background: "#fff", color: "#153a65", fontSize: 13, outline: "none" } as const;
  const button = { padding: "11px 13px", borderRadius: 11, border: 0, fontSize: 12.5, fontWeight: 900, cursor: "pointer" } as const;

  return <article id="team-role-center" style={{ scrollMarginTop: 22, marginTop: 16, padding: 20, borderRadius: 24, border: gold ? "1px solid #e5cd8e" : "1px solid #dbe7f3", background: gold ? "linear-gradient(145deg,#fffdf8,#fff8df)" : "linear-gradient(145deg,#f8fbfe,#fff)", boxShadow: "0 16px 38px rgba(31,64,97,.08)" }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
      <div>
        <div style={{ color: gold ? "#9a7318" : "#0b6f9c", fontSize: 10.5, fontWeight: 950, letterSpacing: 1.45 }}>GOLD ELITE · EKİP & ROL MERKEZİ</div>
        <h3 style={{ margin: "6px 0 5px", color: "#153a65", fontSize: 22 }}>Kurumsal ekibinizi yetki seviyeleriyle yönetin.</h3>
        <p style={{ margin: 0, color: "#607890", fontSize: 13, lineHeight: 1.55, maxWidth: 760 }}>Şirket alanı oluşturun, ekip üyelerini davet edin ve erişimi rol bazlı yönetin. Yazma yetkileri Supabase RLS ile sunucu tarafında Gold plana bağlıdır.</p>
      </div>
      <span style={{ padding: "7px 10px", borderRadius: 999, border: `1px solid ${gold ? "#e5cd8e" : "#d8e3ec"}`, background: gold ? "#fff0b9" : "#eef3f7", color: gold ? "#80600e" : "#607890", fontSize: 10.5, fontWeight: 950 }}>{gold ? "✓ GOLD YETKİSİ AÇIK" : "🔒 GOLD GEREKLİ"}</span>
    </div>

    {!gold ? <div style={{ marginTop: 14, padding: 14, borderRadius: 14, background: "#f6f8fa", border: "1px solid #dbe3e9", color: "#52697a", fontSize: 12.5, lineHeight: 1.55 }}><strong style={{ color: "#153a65" }}>Ekip yönetimi kilitli.</strong> Gold Elite aktif olduğunda şirket oluşturma, davet ve rol değiştirme açılır. Veritabanı katmanı bu kontrolü yalnızca arayüzde değil RLS seviyesinde de uygular.</div> : null}

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginTop: 14 }}>
      {[["Kurumsal alan", organizations.length],["Aktif ekip", activeMembers.length],["Bekleyen davet", pendingInvites.length],["Yönetici", admins]].map(([label,value]) => <div key={String(label)} style={{ ...card, padding: 14 }}><span style={{ color: "#74899e", fontSize: 10.5, fontWeight: 850 }}>{label}</span><strong style={{ display: "block", marginTop: 5, color: "#153a65", fontSize: 23 }}>{String(value)}</strong></div>)}
    </div>

    {error ? <div style={{ marginTop: 12, padding: 11, borderRadius: 12, background: "#fff0f0", border: "1px solid #f0caca", color: "#9b3030", fontSize: 12 }}>{error}</div> : null}
    {notice ? <div style={{ marginTop: 12, padding: 11, borderRadius: 12, background: "#eef9f5", border: "1px solid #cce7dc", color: "#087b5e", fontSize: 12 }}>{notice}</div> : null}

    <div style={{ display: "grid", gridTemplateColumns: "minmax(280px,.75fr) minmax(0,1.25fr)", gap: 14, marginTop: 14 }}>
      <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
        <form onSubmit={createOrganization} style={card}>
          <strong style={{ color: "#153a65", fontSize: 15 }}>Yeni kurumsal alan</strong>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            <input value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Şirket / ekip adı" style={input} disabled={!gold || saving} />
            <select value={orgType} onChange={(e) => setOrgType(e.target.value as OrgType)} style={input} disabled={!gold || saving}>{Object.entries(typeLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
            <button type="submit" disabled={!gold || saving || !orgName.trim()} style={{ ...button, background: gold ? "linear-gradient(135deg,#c99a35,#f2d67d)" : "#e6ebef", color: gold ? "#241a05" : "#8192a0", cursor: gold ? "pointer" : "not-allowed" }}>{saving ? "İşleniyor…" : "Kurumsal Alan Oluştur"}</button>
          </div>
        </form>

        <div style={card}>
          <strong style={{ color: "#153a65", fontSize: 15 }}>Kurumsal alanlar</strong>
          <div style={{ display: "grid", gap: 7, marginTop: 10 }}>
            {organizations.length ? organizations.map((org) => <button type="button" key={org.id} onClick={() => setSelectedOrgId(org.id)} style={{ textAlign: "left", padding: 11, borderRadius: 11, border: selectedOrg?.id === org.id ? "1px solid #88c8ed" : "1px solid #e0e8ef", background: selectedOrg?.id === org.id ? "#edf8ff" : "#fff", cursor: "pointer" }}><strong style={{ display: "block", color: "#153a65", fontSize: 12.5 }}>{org.name}</strong><span style={{ display: "block", marginTop: 3, color: "#74899e", fontSize: 10 }}>{typeLabels[org.organization_type]} · {org.status === "active" ? "Aktif" : org.status}</span></button>) : <div style={{ color: "#8395a5", fontSize: 12 }}>{loading ? "Yükleniyor…" : "Henüz kurumsal alan yok."}</div>}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 12, alignContent: "start" }}>
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}><div><strong style={{ color: "#153a65", fontSize: 16 }}>{selectedOrg?.name || "Ekip seçilmedi"}</strong><span style={{ display: "block", color: "#74899e", fontSize: 10.5, marginTop: 3 }}>{selectedOrg ? typeLabels[selectedOrg.organization_type] : "Önce kurumsal alan oluşturun."}</span></div>{selectedOrg ? <span style={{ padding: "5px 8px", borderRadius: 999, background: "#eef9f5", color: "#087b5e", fontSize: 9.5, fontWeight: 900 }}>AKTİF ORGANİZASYON</span> : null}</div>

          <form onSubmit={inviteMember} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(150px,.35fr) auto", gap: 8, marginTop: 12 }}>
            <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} type="email" placeholder="ekip@firma.com" style={input} disabled={!gold || !selectedOrg || saving} />
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Exclude<OrgRole,"owner">)} style={input} disabled={!gold || !selectedOrg || saving}>{(["admin","manager","analyst","member","viewer"] as const).map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select>
            <button type="submit" disabled={!gold || !selectedOrg || saving || !inviteEmail.trim()} style={{ ...button, background: "#0876c9", color: "#fff", opacity: !gold || !selectedOrg ? .45 : 1 }}>Davet Oluştur</button>
          </form>
        </div>

        <div style={card}>
          <strong style={{ color: "#153a65", fontSize: 15 }}>Ekip üyeleri</strong>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {members.length ? members.map((member) => <div key={member.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 170px 82px", gap: 8, alignItems: "center", padding: 10, borderRadius: 12, border: "1px solid #e2eaf1" }}><div><strong style={{ display: "block", color: "#34556c", fontSize: 12 }}>{member.email}</strong><span style={{ color: member.status === "active" ? "#087b5e" : "#9a7318", fontSize: 9.5, fontWeight: 850 }}>{member.status === "active" ? "Aktif" : member.status === "pending" ? "Davet bekliyor" : "Erişim kaldırıldı"}</span></div><select value={member.role} onChange={(e) => void updateMemberRole(member.id, e.target.value as OrgRole)} disabled={!gold || saving || member.role === "owner"} style={{ ...input, padding: "8px 9px", fontSize: 11 }}>{(["owner","admin","manager","analyst","member","viewer"] as const).map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select><span style={{ textAlign: "right", color: "#91a2b2", fontSize: 9.5 }}>{new Date(member.created_at).toLocaleDateString("tr-TR")}</span></div>) : <div style={{ color: "#8395a5", fontSize: 12 }}>Bu alanda henüz ekip üyesi yok.</div>}
          </div>
        </div>

        <div style={card}>
          <strong style={{ color: "#153a65", fontSize: 15 }}>Bekleyen davetler</strong>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {pendingInvites.length ? pendingInvites.map((invite) => <div key={invite.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", padding: 10, borderRadius: 12, background: "#fffaf0", border: "1px solid #ead7aa" }}><div><strong style={{ display: "block", color: "#5f4c20", fontSize: 12 }}>{invite.email}</strong><span style={{ color: "#8b784d", fontSize: 9.5 }}>{roleLabels[invite.role]} · {new Date(invite.expires_at).toLocaleDateString("tr-TR")} tarihine kadar</span></div><button type="button" disabled={!gold || saving} onClick={() => void revokeInvitation(invite.id)} style={{ ...button, padding: "7px 9px", background: "#fff", color: "#9b3030", border: "1px solid #efcaca" }}>İptal</button></div>) : <div style={{ color: "#8395a5", fontSize: 12 }}>Bekleyen davet bulunmuyor.</div>}
          </div>
        </div>
      </div>
    </div>
  </article>;
}

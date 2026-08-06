import { createClient } from "@supabase/supabase-js";
import Link from "next/link";

export const dynamic = "force-dynamic";

type VerificationRecord = {
  report_id: string;
  report_date: string;
  report_version: string;
  verification_status: string;
  location: string | null;
  property_type: string | null;
  decision: string | null;
  created_at: string;
  updated_at: string;
};

function getPublicSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "long", timeStyle: "short" }).format(new Date(value));
}

export default async function VerificationPage({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId: rawReportId } = await params;
  const reportId = decodeURIComponent(rawReportId).trim().toUpperCase();
  const validFormat = /^YAI-\d{4}-[A-Z0-9]{7}$/.test(reportId);
  const supabase = getPublicSupabase();

  let record: VerificationRecord | null = null;
  let serviceError = false;
  if (validFormat && supabase) {
    const { data, error } = await supabase
      .from("report_verifications")
      .select("report_id,report_date,report_version,verification_status,location,property_type,decision,created_at,updated_at")
      .eq("report_id", reportId)
      .maybeSingle();
    record = data as VerificationRecord | null;
    serviceError = Boolean(error);
  } else if (!supabase) {
    serviceError = true;
  }

  const verified = Boolean(record && record.verification_status === "active");
  return (
    <main style={{ minHeight: "100vh", background: "linear-gradient(145deg,#063b76,#0b66b2)", padding: "48px 18px", fontFamily: "Arial, sans-serif" }}>
      <section style={{ maxWidth: 760, margin: "0 auto", background: "#fff", borderRadius: 24, overflow: "hidden", boxShadow: "0 24px 70px rgba(0,0,0,.24)" }}>
        <header style={{ padding: "34px 38px", background: "linear-gradient(135deg,#123d72,#285d9c)", color: "white" }}>
          <div style={{ fontFamily: "Georgia,serif", fontSize: 34, fontWeight: 800 }}>Yaşam <span style={{ color: "#f0c66f" }}>AI</span></div>
          <div style={{ marginTop: 8, letterSpacing: 2, fontSize: 12, fontWeight: 800 }}>DİJİTAL RAPOR DOĞRULAMA SİSTEMİ</div>
        </header>
        <div style={{ padding: "34px 38px" }}>
          <div style={{ display: "inline-block", padding: "8px 12px", borderRadius: 999, fontWeight: 800, background: verified ? "#e7f7ef" : "#fff3df", color: verified ? "#16794a" : "#9a5b00" }}>
            {verified ? "✓ Rapor kaydı doğrulandı" : "! Doğrulama tamamlanamadı"}
          </div>
          <h1 style={{ color: "#183a63", fontFamily: "Georgia,serif", fontSize: 30, marginBottom: 12 }}>
            {verified ? "Geçerli Yaşam AI raporu" : serviceError ? "Doğrulama servisine ulaşılamadı" : "Kayıt bulunamadı"}
          </h1>
          {!verified ? (
            <p style={{ color: "#64748b", lineHeight: 1.7 }}>
              {serviceError ? "Servis geçici olarak yanıt vermiyor. Daha sonra yeniden deneyin." : "Bu rapor kimliği Yaşam AI doğrulama kayıtlarında bulunamadı. Kimliği kontrol edin; ekran görüntüsü veya değiştirilmiş belgeyi geçerli kabul etmeyin."}
            </p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 14, marginTop: 26 }}>
              {[
                ["Rapor kimliği", record!.report_id],
                ["Rapor tarihi", formatDate(record!.report_date)],
                ["Sürüm", record!.report_version],
                ["Durum", "Aktif doğrulama kaydı"],
                ["Konum", record!.location || "Belirtilmedi"],
                ["Taşınmaz türü", record!.property_type || "Belirtilmedi"],
                ["Karar", record!.decision || "Belirtilmedi"],
                ["Son güncelleme", formatDate(record!.updated_at)],
              ].map(([label, value]) => (
                <div key={label} style={{ border: "1px solid #dbe7f3", borderRadius: 14, padding: 16, background: "#f8fbff" }}>
                  <div style={{ color: "#718096", fontSize: 11, fontWeight: 800, letterSpacing: 1 }}>{label.toUpperCase()}</div>
                  <div style={{ color: "#173b67", fontWeight: 800, marginTop: 7 }}>{value}</div>
                </div>
              ))}
            </div>
          )}
          <div style={{ marginTop: 28, paddingTop: 18, borderTop: "1px solid #e7eef6", color: "#718096", fontSize: 12, lineHeight: 1.6 }}>
            Bu doğrulama, raporun Yaşam AI sisteminde oluşturulduğunu ve sürüm izinin bulunduğunu gösterir. Tapu, imar, teknik durum, piyasa değeri veya yatırım sonucunu resmî olarak tasdik etmez.
          </div>
          <Link href="/" style={{ display: "inline-block", marginTop: 22, color: "#0756a5", fontWeight: 800, textDecoration: "none" }}>← Yaşam AI ana sayfası</Link>
        </div>
      </section>
    </main>
  );
}

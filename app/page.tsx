import Link from "next/link";

const modules = [
  "AI Gayrimenkul Analizi",
  "Türkiye Veri Operasyon Merkezi",
  "Rapor Geçmişi ve Karşılaştırma",
  "Premium Karar ve Pazarlık Sistemi",
];

export default function HomePage() {
  return (
    <main style={{ minHeight: "100vh", background: "linear-gradient(145deg,#071a33,#10365f 55%,#f7f3e8 55%)", padding: "48px 24px", fontFamily: "Arial, sans-serif" }}>
      <section style={{ maxWidth: 1120, margin: "0 auto", color: "white" }}>
        <div style={{ maxWidth: 720, padding: "60px 0 90px" }}>
          <p style={{ letterSpacing: 3, color: "#d6b86a", fontWeight: 800 }}>YAŞAM AI</p>
          <h1 style={{ fontSize: "clamp(42px,7vw,82px)", lineHeight: 1.02, margin: "14px 0 24px" }}>Türkiye’nin gayrimenkul karar platformu.</h1>
          <p style={{ fontSize: 21, lineHeight: 1.6, color: "#d7e3f0" }}>İlan bulmaktan öte; doğru fiyatı, riski, fırsatı ve yatırım kararını anlaşılır bir rapora dönüştürür.</p>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 32 }}>
            <Link href="/giris" style={{ background: "#d6b86a", color: "#071a33", padding: "15px 24px", borderRadius: 12, fontWeight: 800, textDecoration: "none" }}>Giriş Yap</Link>
            <Link href="/analiz" style={{ border: "1px solid #7895b3", color: "white", padding: "15px 24px", borderRadius: 12, fontWeight: 700, textDecoration: "none" }}>Analiz Merkezini Aç</Link>
          </div>
        </div>
        <div style={{ background: "white", color: "#102a43", borderRadius: 24, padding: 28, boxShadow: "0 24px 70px rgba(0,0,0,.22)", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 16 }}>
          {modules.map((item, index) => <div key={item} style={{ border: "1px solid #e5ebf1", borderRadius: 16, padding: 22 }}><strong style={{ color: "#b08b32" }}>0{index+1}</strong><h2 style={{ fontSize: 18 }}>{item}</h2><p style={{ color: "#60758a", lineHeight: 1.5 }}>Güvenilir veri, şeffaf puanlama ve uygulanabilir karar adımları.</p></div>)}
        </div>
      </section>
    </main>
  );
}

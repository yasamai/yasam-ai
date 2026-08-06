import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#f4f7fb" }}>
      <section style={{ textAlign: "center", maxWidth: 560 }}>
        <p style={{ color: "#d19b17", fontWeight: 900, letterSpacing: 2 }}>404</p>
        <h1 style={{ color: "#0a3156", fontSize: 40 }}>Bu sayfa bulunamadı.</h1>
        <p style={{ color: "#60788d", lineHeight: 1.7 }}>Bağlantı değişmiş olabilir. Yaşam AI ana merkezine dönerek devam edin.</p>
        <Link href="/" style={{ display: "inline-block", marginTop: 16, padding: "13px 20px", background: "#0b5ea8", color: "white", borderRadius: 12, textDecoration: "none", fontWeight: 800 }}>Ana merkeze dön</Link>
      </section>
    </main>
  );
}

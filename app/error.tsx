"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Yaşam AI uygulama hatası", error);
  }, [error]);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#f4f7fb" }}>
      <section style={{ maxWidth: 620, padding: 32, borderRadius: 24, background: "white", boxShadow: "0 18px 50px rgba(8,38,68,.12)" }}>
        <p style={{ color: "#b7791f", fontWeight: 800, letterSpacing: 1.4 }}>YAŞAM AI GÜVENLİ MOD</p>
        <h1 style={{ color: "#0a3156", fontSize: 34, margin: "8px 0 14px" }}>Bir şey beklediğimiz gibi çalışmadı.</h1>
        <p style={{ color: "#536b80", lineHeight: 1.7 }}>Verileriniz silinmedi. İşlemi yeniden deneyebilir veya ana sayfaya dönebilirsiniz.</p>
        <div style={{ display: "flex", gap: 12, marginTop: 22, flexWrap: "wrap" }}>
          <button onClick={reset} style={{ border: 0, borderRadius: 12, padding: "12px 18px", fontWeight: 800, background: "#0b5ea8", color: "white", cursor: "pointer" }}>Yeniden dene</button>
          <Link href="/" style={{ borderRadius: 12, padding: "12px 18px", fontWeight: 800, border: "1px solid #b9cada", color: "#0a3156", textDecoration: "none" }}>Ana sayfa</Link>
        </div>
        {error.digest ? <small style={{ display: "block", marginTop: 18, color: "#8a9aac" }}>Hata kodu: {error.digest}</small> : null}
      </section>
    </main>
  );
}

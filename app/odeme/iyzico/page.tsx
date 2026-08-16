"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";

type Plan = "premium" | "gold";
type Billing = "monthly" | "yearly";

type CheckoutStatus = {
  credentialsReady: boolean;
  environment: "sandbox" | "production";
  plans: Record<string, boolean>;
};

export default function IyzicoPaymentPage() {
  const [plan, setPlan] = useState<Plan>("premium");
  const [billing, setBilling] = useState<Billing>("monthly");
  const [status, setStatus] = useState<CheckoutStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [checkoutHtml, setCheckoutHtml] = useState("");
  const checkoutRef = useRef<HTMLDivElement | null>(null);
  const [form, setForm] = useState({
    name: "", surname: "", email: "", gsmNumber: "+90", identityNumber: "",
    contactName: "", address: "", zipCode: "", city: "", country: "Turkey",
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const p = params.get("plan");
    const b = params.get("billing");
    if (p === "premium" || p === "gold") setPlan(p);
    if (b === "monthly" || b === "yearly") setBilling(b);
    void fetch("/api/payments/iyzico/status", { cache: "no-store" }).then((r) => r.json()).then(setStatus).catch(() => setStatus(null));
    void supabase.auth.getUser().then(({ data }) => setForm((current) => ({ ...current, email: data.user?.email || current.email })));
  }, []);

  const planReady = useMemo(() => Boolean(status?.credentialsReady && status?.plans?.[`${plan}_${billing}`]), [status, plan, billing]);

  useEffect(() => {
    if (!checkoutHtml || !checkoutRef.current) return;
    const host = checkoutRef.current;
    host.innerHTML = `<div id="iyzipay-checkout-form" class="responsive"></div>`;
    const wrapper = document.createElement("div");
    wrapper.innerHTML = checkoutHtml;
    for (const node of Array.from(wrapper.childNodes)) {
      if (node.nodeName.toLowerCase() === "script") {
        const source = node as HTMLScriptElement;
        const script = document.createElement("script");
        for (const attr of Array.from(source.attributes)) script.setAttribute(attr.name, attr.value);
        script.text = source.text;
        host.appendChild(script);
      } else host.appendChild(node.cloneNode(true));
    }
    return () => { host.innerHTML = ""; };
  }, [checkoutHtml]);

  async function startCheckout(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Oturum bulunamadı. Lütfen tekrar giriş yapın.");
      const response = await fetch("/api/payments/iyzico/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          plan,
          billingCycle: billing,
          customer: {
            name: form.name,
            surname: form.surname,
            email: form.email,
            gsmNumber: form.gsmNumber,
            identityNumber: form.identityNumber,
            billingAddress: { address: form.address, zipCode: form.zipCode, contactName: form.contactName || `${form.name} ${form.surname}`, city: form.city, country: form.country },
          },
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "Ödeme formu başlatılamadı.");
      setCheckoutHtml(String(result.checkoutFormContent || ""));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ödeme formu başlatılamadı.");
    } finally { setLoading(false); }
  }

  if (checkoutHtml) {
    return <main style={{ minHeight: "100vh", background: "#f3f7fa", padding: "32px 16px" }}><div style={{ maxWidth: 760, margin: "0 auto" }}><button onClick={() => setCheckoutHtml("")} style={{ border: 0, background: "transparent", color: "#176ca5", fontWeight: 800, cursor: "pointer", marginBottom: 14 }}>← Bilgilere dön</button><section style={{ background: "#fff", border: "1px solid #dbe7f3", borderRadius: 24, padding: 20, boxShadow: "0 20px 50px rgba(20,60,90,.10)" }}><h1 style={{ color: "#153a65", marginTop: 0 }}>iyzico Güvenli Ödeme</h1><p style={{ color: "#607890" }}>Kart bilgileri Yaşam AI tarafından saklanmaz. Sandbox ortamında test işlemi yapıyorsunuz.</p><div ref={checkoutRef} /></section></div></main>;
  }

  return <main style={{ minHeight: "100vh", background: "linear-gradient(135deg,#edf7ff,#f7fafc)", padding: "32px 16px" }}><div style={{ maxWidth: 760, margin: "0 auto" }}><a href="/analiz" style={{ color: "#176ca5", fontWeight: 800, textDecoration: "none" }}>← Üyelik merkezine dön</a><section style={{ marginTop: 16, background: "#fff", border: "1px solid #dbe7f3", borderRadius: 26, padding: 24, boxShadow: "0 22px 55px rgba(20,60,90,.10)" }}><div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 1.4, color: "#0b789f" }}>YAŞAM AI · IYZICO</div><h1 style={{ color: "#153a65", margin: "8px 0" }}>{plan === "gold" ? "Gold Elite" : "Premium"} · {billing === "yearly" ? "Yıllık" : "Aylık"}</h1><p style={{ color: "#607890", lineHeight: 1.6 }}>Ödeme sonucu iyzico üzerinden ayrıca doğrulanmadan abonelik yetkisi açılmaz.</p>{status && !planReady ? <div style={{ padding: 14, borderRadius: 14, background: "#fff7e6", border: "1px solid #ead7aa", color: "#715820", lineHeight: 1.5 }}>iyzico Sandbox abonelik plan kodu henüz aktif değil. Destek aktivasyonu tamamlandığında bu ekran otomatik olarak ödeme formunu başlatmaya hazır olacak. Şu an kart bilgisi girmenize gerek yok.</div> : null}{error ? <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: "#fff0f0", color: "#a33" }}>{error}</div> : null}{planReady ? <form onSubmit={startCheckout} style={{ display: "grid", gap: 12, marginTop: 18 }}><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 10 }}>{[["Ad","name"],["Soyad","surname"],["E-posta","email"],["Telefon (+90...)","gsmNumber"],["Kimlik/Vergi No","identityNumber"],["Fatura adı","contactName"],["Şehir","city"],["Posta kodu","zipCode"]].map(([label,key]) => <label key={key} style={{ display: "grid", gap: 6, color: "#34556c", fontWeight: 800, fontSize: 13 }}>{label}<input required={!['zipCode'].includes(key)} value={(form as any)[key]} onChange={(e) => setForm((c) => ({ ...c, [key]: e.target.value }))} style={{ padding: "12px 13px", border: "1px solid #cad9e6", borderRadius: 12, fontSize: 14 }} /></label>)}</div><label style={{ display: "grid", gap: 6, color: "#34556c", fontWeight: 800, fontSize: 13 }}>Fatura adresi<textarea required value={form.address} onChange={(e) => setForm((c) => ({ ...c, address: e.target.value }))} rows={3} style={{ padding: "12px 13px", border: "1px solid #cad9e6", borderRadius: 12, fontSize: 14, resize: "vertical" }} /></label><button disabled={loading} type="submit" style={{ marginTop: 6, padding: "14px 16px", border: 0, borderRadius: 14, background: "linear-gradient(90deg,#0876c9,#0f9de0)", color: "#fff", fontWeight: 900, fontSize: 15, cursor: "pointer" }}>{loading ? "iyzico hazırlanıyor..." : "iyzico Güvenli Ödemeyi Aç"}</button><small style={{ color: "#6d8194", lineHeight: 1.5 }}>Kart numarası, CVV ve kart son kullanma tarihi bu forma girilmez; bu bilgiler yalnızca iyzico Checkout Form içinde işlenir.</small></form> : null}</section></div></main>;
}

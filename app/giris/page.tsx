"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => { void supabase.auth.getSession().then(({ data }) => { if (data.session) router.replace("/analiz"); }); }, [router]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setMessage("");
    const result = mode === "login"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (result.error) { setMessage(result.error.message); return; }
    if (mode === "signup" && !result.data.session) { setMessage("Kayıt oluşturuldu. E-posta doğrulama bağlantısını kontrol edin."); return; }
    router.replace("/analiz"); router.refresh();
  }

  return <main style={{ minHeight:"100vh",display:"grid",placeItems:"center",padding:24,background:"linear-gradient(135deg,#06182f,#16466f)",fontFamily:"Arial,sans-serif" }}>
    <form onSubmit={submit} style={{ width:"min(440px,100%)",background:"white",padding:32,borderRadius:22,boxShadow:"0 24px 70px rgba(0,0,0,.3)" }}>
      <div style={{ color:"#b08b32",fontWeight:900,letterSpacing:2 }}>YAŞAM AI</div>
      <h1 style={{ color:"#102a43",fontSize:32,marginBottom:8 }}>{mode === "login" ? "Hesabınıza giriş yapın" : "Yeni hesap oluşturun"}</h1>
      <p style={{ color:"#66788a",marginBottom:24 }}>Gayrimenkul karar merkezinize güvenli erişim.</p>
      <label style={{ display:"block",fontWeight:700,marginBottom:7 }}>E-posta</label>
      <input required type="email" value={email} onChange={e=>setEmail(e.target.value)} style={{ width:"100%",boxSizing:"border-box",padding:14,border:"1px solid #cbd5df",borderRadius:10,marginBottom:16 }} />
      <label style={{ display:"block",fontWeight:700,marginBottom:7 }}>Şifre</label>
      <input required minLength={6} type="password" value={password} onChange={e=>setPassword(e.target.value)} style={{ width:"100%",boxSizing:"border-box",padding:14,border:"1px solid #cbd5df",borderRadius:10,marginBottom:16 }} />
      {message && <p style={{ background:"#fff5e5",padding:12,borderRadius:9,color:"#8a5700" }}>{message}</p>}
      <button disabled={loading} style={{ width:"100%",padding:15,border:0,borderRadius:11,background:"#0d355d",color:"white",fontWeight:800,cursor:"pointer" }}>{loading ? "İşleniyor…" : mode === "login" ? "Giriş Yap" : "Kayıt Ol"}</button>
      <button type="button" onClick={()=>{setMode(mode === "login" ? "signup" : "login");setMessage("");}} style={{ width:"100%",marginTop:12,padding:12,border:0,background:"transparent",color:"#315f88",cursor:"pointer" }}>{mode === "login" ? "Hesabınız yok mu? Kayıt olun" : "Zaten hesabınız var mı? Giriş yapın"}</button>
    </form>
  </main>;
}

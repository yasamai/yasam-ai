"use client";

import { FormEvent, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";

type Mode = "login" | "signup" | "reset";

export default function GirisPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    return url && key ? createClient(url, key) : null;
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setIsError(false);

    if (!supabase) {
      setMessage("Supabase bağlantısı bulunamadı. .env.local dosyasını kontrol edin.");
      setIsError(true);
      return;
    }

    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      setMessage("E-posta adresini girin.");
      setIsError(true);
      return;
    }

    if (mode !== "reset" && password.length < 6) {
      setMessage("Şifre en az 6 karakter olmalıdır.");
      setIsError(true);
      return;
    }

    setLoading(true);

    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: { full_name: fullName.trim() },
            emailRedirectTo: `${window.location.origin}/giris`,
          },
        });

        if (error) throw error;

        if (data.session) {
          router.push("/analiz");
          router.refresh();
          return;
        }

        setMessage("Hesabınız oluşturuldu. E-postanıza gelen doğrulama bağlantısına tıklayın.");
        return;
      }

      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: `${window.location.origin}/giris`,
        });

        if (error) throw error;
        setMessage("Şifre yenileme bağlantısı e-posta adresinize gönderildi.");
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) throw error;

      router.push("/analiz");
      router.refresh();
    } catch (error: unknown) {
      const text =
        error &&
        typeof error === "object" &&
        "message" in error &&
        typeof (error as { message?: unknown }).message === "string"
          ? (error as { message: string }).message
          : "Beklenmeyen bir hata oluştu.";

      setMessage(text);
      setIsError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-slate-100">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl overflow-hidden rounded-[32px] border border-white/10 bg-slate-900 shadow-2xl lg:grid-cols-2">
        <section className="relative hidden overflow-hidden p-12 lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(37,99,235,0.35),_transparent_45%),radial-gradient(circle_at_bottom_right,_rgba(124,58,237,0.28),_transparent_45%)]" />

          <div className="relative">
            <div className="inline-flex rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold tracking-[0.2em] text-blue-200">
              YAŞAM AI
            </div>

            <h1 className="mt-8 max-w-xl text-5xl font-semibold leading-tight">
              Gayrimenkul kararlarınız için kişisel analiz merkezi.
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
              Analizlerinizi kaydedin, geçmiş raporlarınıza erişin ve yatırım kararlarınızı tek merkezden yönetin.
            </p>
          </div>

          <div className="relative grid gap-4 sm:grid-cols-3">
            {[
              ["AI Karar Motoru", "Yatırım, fırsat, risk ve likidite analizi"],
              ["Güvenli Raporlar", "Her analiz hesabınıza kaydedilir"],
              ["Tek Merkez", "Rapor, portföy ve karar geçmişi"],
            ].map(([title, text]) => (
              <div key={title} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="font-semibold">{title}</div>
                <div className="mt-2 text-sm leading-6 text-slate-300">{text}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="flex items-center bg-white px-6 py-10 text-slate-900 sm:px-10 lg:px-14">
          <div className="mx-auto w-full max-w-md">
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-blue-600">
              Kullanıcı ve Rapor Merkezi
            </p>

            <h2 className="mt-3 text-3xl font-bold">
              {mode === "signup"
                ? "Hesap oluştur"
                : mode === "reset"
                  ? "Şifreni yenile"
                  : "Giriş yap"}
            </h2>

            <p className="mt-3 leading-7 text-slate-600">
              Yaşam AI hesabınıza güvenli şekilde erişin.
            </p>

            <div className="mt-8 grid grid-cols-2 rounded-2xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setMessage("");
                }}
                className={`rounded-xl px-4 py-3 text-sm font-semibold ${
                  mode === "login" ? "bg-white shadow" : "text-slate-500"
                }`}
              >
                Giriş Yap
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setMessage("");
                }}
                className={`rounded-xl px-4 py-3 text-sm font-semibold ${
                  mode === "signup" ? "bg-white shadow" : "text-slate-500"
                }`}
              >
                Kayıt Ol
              </button>
            </div>

            <form onSubmit={handleSubmit} className="mt-7 space-y-5">
              {mode === "signup" && (
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold">Ad Soyad</span>
                  <input
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3.5 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    placeholder="Adınız ve soyadınız"
                  />
                </label>
              )}

              <label className="block">
                <span className="mb-2 block text-sm font-semibold">E-posta</span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3.5 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                  placeholder="ornek@email.com"
                />
              </label>

              {mode !== "reset" && (
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold">Şifre</span>
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    minLength={6}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3.5 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    placeholder="En az 6 karakter"
                  />
                </label>
              )}

              {message && (
                <div
                  className={`rounded-2xl border px-4 py-3 text-sm ${
                    isError
                      ? "border-red-200 bg-red-50 text-red-700"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {message}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-2xl bg-gradient-to-r from-blue-600 to-violet-600 px-5 py-4 font-bold text-white disabled:opacity-60"
              >
                {loading
                  ? "İşlem yapılıyor..."
                  : mode === "signup"
                    ? "Hesabımı Oluştur"
                    : mode === "reset"
                      ? "Yenileme Bağlantısı Gönder"
                      : "Güvenli Giriş Yap"}
              </button>
            </form>

            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => {
                  setMode(mode === "reset" ? "login" : "reset");
                  setMessage("");
                }}
                className="text-sm font-semibold text-blue-600"
              >
                {mode === "reset" ? "Giriş ekranına dön" : "Şifremi unuttum"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

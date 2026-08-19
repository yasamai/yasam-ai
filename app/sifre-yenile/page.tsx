"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function SifreYenilePage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [passwordAgain, setPasswordAgain] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");

    if (password.length < 6) {
      setMessage("Şifre en az 6 karakter olmalıdır.");
      return;
    }

    if (password !== passwordAgain) {
      setMessage("Şifreler eşleşmiyor.");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({
      password,
    });

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage("Şifreniz başarıyla yenilendi.");

    setTimeout(() => {
      router.replace("/giris");
    }, 1500);
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "linear-gradient(135deg,#063a78,#0b74c9)",
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: "min(440px,100%)",
          background: "white",
          padding: 32,
          borderRadius: 20,
        }}
      >
        <div
          style={{
            color: "#b08b32",
            fontWeight: 900,
            letterSpacing: 2,
            marginBottom: 8,
          }}
        >
          YAŞAM AI
        </div>

        <h1 style={{ color: "#102a43", fontSize: 32, marginBottom: 8 }}>
          Yeni şifre belirleyin
        </h1>

        <p style={{ color: "#66788a", marginBottom: 24 }}>
          Hesabınız için yeni şifrenizi oluşturun.
        </p>

        <label
          style={{
            display: "block",
            fontWeight: 700,
            marginBottom: 7,
          }}
        >
          Yeni şifre
        </label>

        <input
          required
          minLength={6}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            width: "100%",
            padding: 14,
            marginBottom: 16,
            borderRadius: 10,
            border: "1px solid #ccd6e0",
          }}
        />

        <label
          style={{
            display: "block",
            fontWeight: 700,
            marginBottom: 7,
          }}
        >
          Yeni şifre tekrar
        </label>

        <input
          required
          minLength={6}
          type="password"
          value={passwordAgain}
          onChange={(e) => setPasswordAgain(e.target.value)}
          style={{
            width: "100%",
            padding: 14,
            marginBottom: 16,
            borderRadius: 10,
            border: "1px solid #ccd6e0",
          }}
        />

        {message && (
          <p
            style={{
              background: "#fff5e5",
              padding: 12,
              borderRadius: 9,
              color: "#8a5700",
            }}
          >
            {message}
          </p>
        )}

        <button
          disabled={loading}
          type="submit"
          style={{
            width: "100%",
            padding: 15,
            border: 0,
            borderRadius: 11,
            background: "#1769aa",
            color: "white",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          {loading ? "Kaydediliyor..." : "Şifreyi Yenile"}
        </button>
      </form>
    </main>
  );
}
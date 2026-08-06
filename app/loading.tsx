export default function Loading() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f4f7fb", color: "#0a3156" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 58, height: 58, borderRadius: "50%", border: "6px solid #dce9f4", borderTopColor: "#d6a928", margin: "0 auto 18px", animation: "spin 1s linear infinite" }} />
        <strong>Yaşam AI hazırlanıyor…</strong>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </main>
  );
}

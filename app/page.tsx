import Link from "next/link";
import KonumSecici from "./components/KonumSecici";

const scoreRows = [
  { score: 91, label: "Yatırım skoru", status: "Güçlü" },
  { score: 87, label: "Veri güveni", status: "Yüksek" },
  { score: 74, label: "Likidite", status: "Dengeli" },
  { score: 18, label: "Risk seviyesi", status: "Düşük", inverse: true },
];

const tools = [
  { icon: "⌂", title: "Evinin Değeri", subtitle: "Değer Analizi", href: "/analiz", featured: true },
  { icon: "⌖", title: "Arsa Analizi", subtitle: "İmar ve Çevre", href: "/analiz" },
  { icon: "↗", title: "Yatırım Fırsatları", subtitle: "Günün Fırsatları", href: "/analiz" },
  { icon: "✓", title: "Rapor Doğrulama", subtitle: "QR ile Doğrula", href: "/dogrula" },
  { icon: "◇", title: "Türkiye Haritası", subtitle: "Bölgesel Analiz", href: "/analiz" },
  { icon: "✦", title: "AI Karar Merkezi", subtitle: "Karar Motoru", href: "/analiz" },
];


const professionalAreas = [
  { icon: "⌂", title: "Emlak Danışmanı", description: "Portföy, müşteri ve AI ilan yönetimi", href: "/analiz" },
  { icon: "▦", title: "Müteahhit", description: "Arsa fizibilitesi, kat karşılığı ve maliyet analizi", href: "/analiz" },
  { icon: "△", title: "Mimar", description: "Plan, cephe ve proje önerileri", href: "/analiz" },
  { icon: "⚙", title: "İnşaat Mühendisi", description: "Statik, deprem ve teknik ön değerlendirme", href: "/analiz" },
  { icon: "▣", title: "Banka / Ekspertiz", description: "Teminat, risk ve ekspertiz raporları", href: "/analiz" },
  { icon: "◆", title: "Yatırımcı", description: "Portföy, getiri ve risk analizi", href: "/analiz" },
  { icon: "◉", title: "Bireysel Kullanıcı", description: "Ev, arsa ve yatırım karar desteği", href: "/analiz" },
];

const decisionSteps = [
  ["01", "Konumu ve taşınmazı tanımlar", "İl, ilçe, mahalle ve taşınmaz özelliklerini tek karar dosyasında toplar."],
  ["02", "Veriyi puanlar", "Değer, kira, likidite, gelişim ve risk göstergelerini şeffaf biçimde değerlendirir."],
  ["03", "Kararı açıklar", "AL, PAZARLIK YAP, BEKLE veya ALMA sonucunu gerekçeleriyle sunar."],
  ["04", "Raporu doğrular", "Her premium rapora benzersiz kimlik ve dijital doğrulama izi ekler."],
];

const radarItems = [
  ["Değer artışı", "88"],
  ["Kira", "82"],
  ["Veri güveni", "91"],
  ["Likidite", "74"],
  ["Yatırım", "89"],
  ["Risk", "18"],
];

export default function HomePage() {
  return (
    <main className="v4-shell">
      <nav className="v4-nav" aria-label="Ana menü">
        <Link href="/" className="v4-brand" aria-label="Yaşam AI ana sayfa">
          <span className="v4-brand-mark">Y</span>
          <span><strong>YAŞAM AI</strong><small>Gayrimenkul Karar Platformu</small></span>
        </Link>
        <div className="v4-nav-links">
          <a href="#nasil-calisir">Nasıl çalışır?</a>
          <a href="#karar-motoru">Karar motoru</a>
          <a href="#turkiye">Türkiye veri altyapısı</a>
          <Link href="/giris">Giriş</Link>
          <Link href="/analiz" className="v4-nav-cta">Analize Başla <span>→</span></Link>
        </div>
      </nav>

      <section className="v4-hero">
        <div className="v4-map-glow" aria-hidden="true" />
        <div className="v4-hero-copy">
          <div className="v4-kicker"><span /> TÜRKİYE GENELİ · YAPAY ZEKÂ DESTEKLİ</div>
          <h1>Gayrimenkulde ilanı değil, <em>doğru kararı</em> bulun.</h1>
          <p className="v4-lead">Yaşam AI; fiyat, kira, risk, gelişim ve likidite verilerini tek bir karar motorunda birleştirir. Size yalnızca sonucu değil, o sonuca neden ulaşıldığını da gösterir.</p>

          <div className="v4-ai-box">
            <div className="v4-ai-icon">✦</div>
            <div className="v4-ai-copy">
              <strong>Bugün hangi gayrimenkul kararını vermek istiyorsunuz?</strong>
              <span>Örnek: “Ankara Çankaya’da yatırım için 3+1 daireyi analiz et.”</span>
            </div>
            <Link href="/analiz" className="v4-ai-button">AI Analizini Başlat <span>→</span></Link>
          </div>

          <div className="v4-trust-row">
            <span>✓ Türkiye geneli analiz</span>
            <span>✓ Açıklanabilir AI kararı</span>
            <span>✓ Dijital rapor doğrulama</span>
          </div>
        </div>

        <aside className="v4-decision-card" id="karar-motoru" aria-label="Örnek Yaşam AI karar kartı">
          <div className="v4-card-head">
            <div><small>YAŞAM AI KARARI</small><h2>PAZARLIK YAP</h2></div>
            <div className="v4-score-wrap"><div className="v4-score-ring"><strong>89</strong><span>/100</span></div><small>Güven Skoru</small></div>
          </div>
          <p className="v4-card-summary">İlan güçlü bir bölgede; ancak mevcut fiyat tahmini piyasa değerinin üzerinde.</p>
          <div className="v4-price-grid">
            <div><span>Tahmini piyasa değeri</span><strong>7.840.000 TL</strong></div>
            <div><span>Önerilen teklif</span><strong>7.250.000 TL</strong></div>
          </div>
          <div className="v4-score-list">
            {scoreRows.map((item) => (
              <div key={item.label}>
                <span className="v4-mini-score">{item.score}</span>
                <p><strong>{item.label}</strong><small>{item.status}</small></p>
                <i style={{ "--score": `${item.inverse ? 100 - item.score : item.score}%` } as React.CSSProperties} />
              </div>
            ))}
          </div>
          <div className="v4-verified">◆ Premium Karar Motoru v4.0 · Doğrulanabilir rapor</div>
        </aside>
      </section>

      <section className="v4-tools" aria-label="Yaşam AI araçları">
        {tools.map((tool) => (
          <Link key={tool.title} href={tool.href} className={`v4-tool-card${tool.featured ? " is-featured" : ""}`}>
            <span className="v4-tool-icon">{tool.icon}</span><strong>{tool.title}</strong><small>{tool.subtitle}</small>
          </Link>
        ))}
      </section>

      <section className="v4-live-strip" aria-label="Platform kapsamı">
        <div><span>81/81</span><small>İl kapsama mimarisi</small></div>
        <div><span>4</span><small>Net karar seçeneği</small></div>
        <div><span>7</span><small>Temel skor bileşeni</small></div>
        <div><span>QR</span><small>Dijital rapor doğrulama</small></div>
        <div><span>V4</span><small>Premium karar motoru</small></div>
      </section>

      <section className="v4-intelligence" id="turkiye">
        <div className="v4-intro-copy">
          <span className="v4-section-label">YAŞAM AI V4</span>
          <h2>Türkiye’nin doğrulanabilir gayrimenkul karar altyapısı.</h2>
          <p>Tek bir taşınmazdan Türkiye geneline kadar aynı karar standardını uygular; veriyi anlaşılır, şeffaf ve uygulanabilir bir sonuca dönüştürür.</p>
          <div className="v4-badges"><span>81 il mimarisi</span><span>İlçe & mahalle katmanı</span><span>Doğrulanabilir rapor</span></div>
          <Link href="/analiz" className="v4-secondary-cta">Türkiye genelinde analiz başlat <span>→</span></Link>
        </div>

        <div className="v4-radar-panel">
          <div className="v4-panel-title"><div><small>KARAR GÜVEN RADARI</small><h3>Güçlü ve zayıf yönleri tek bakışta görün.</h3></div><span>89/100</span></div>
          <div className="v4-radar-content">
            <div className="v4-radar" aria-hidden="true"><span className="r1"/><span className="r2"/><span className="r3"/><span className="r4"/><span className="r5"/><span className="r6"/><i/></div>
            <div className="v4-radar-list">
              {radarItems.map(([label, score]) => <div key={label}><span>{label}</span><strong>{score}</strong></div>)}
            </div>
          </div>
        </div>
      </section>

      <section className="v4-simulator">
        <div className="v4-simulator-copy"><span className="v4-section-label">YATIRIM SİMÜLATÖRÜ</span><h2>Bugünkü fiyatı gelecekteki değere dönüştürün.</h2><p>Alış fiyatı, kira, değer artışı ve amortisman süresini aynı senaryoda görün. V4 arayüzü bu hesapları karar motoruna bağlayacak şekilde hazırlandı.</p></div>
        <div className="v4-simulator-card">
          <div><span>Örnek alış fiyatı</span><strong>7.250.000 TL</strong></div>
          <div><span>5 yıl tahmini değer</span><strong>11.480.000 TL</strong></div>
          <div><span>Aylık kira senaryosu</span><strong>42.500 TL</strong></div>
          <div><span>Tahmini amortisman</span><strong>14,2 yıl</strong></div>
          <Link href="/analiz">Kendi senaryonu hesapla <span>→</span></Link>
        </div>
      </section>


      <section className="v4-professionals" aria-labelledby="professional-title">
        <div className="v4-professionals-head">
          <div>
            <span className="v4-section-label">PROFESYONEL ÇALIŞMA ALANLARI</span>
            <h2 id="professional-title">Gayrimenkul sektörünün her rolü için özel AI çalışma alanı.</h2>
          </div>
          <p>Bugün tek platformda görünür; ilerleyen sürümlerde her kart kendi profesyonel paneline dönüşür.</p>
        </div>
        <div className="v4-professional-grid">
          {professionalAreas.map((area) => (
            <Link key={area.title} href={area.href} className="v4-professional-card">
              <div className="v4-professional-top">
                <span className="v4-professional-icon" aria-hidden="true">{area.icon}</span>
                <small>YAKINDA</small>
              </div>
              <strong>{area.title}</strong>
              <p>{area.description}</p>
              <span className="v4-professional-link">Çalışma alanını keşfet <b>→</b></span>
            </Link>
          ))}
        </div>
        <p className="v4-professional-note">Yakında her meslek grubuna özel yapay zekâ destekli çalışma alanları hizmete açılacaktır.</p>
      </section>

      <section className="v4-process" id="nasil-calisir">
        <div className="v4-process-title"><span className="v4-section-label">NASIL ÇALIŞIR?</span><h2>Dört adımda daha güvenli gayrimenkul kararı.</h2></div>
        <div className="v4-process-grid">
          {decisionSteps.map(([number, title, description]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{description}</p></article>)}
        </div>
      </section>

      <KonumSecici />

      <section className="v4-final-cta">
        <div><span className="v4-section-label">KARARINIZI ŞANSA BIRAKMAYIN</span><h2>İlk gayrimenkul analizinizi şimdi başlatın.</h2><p>Yaşam AI size yalnızca bir fiyat değil; karar, risk, fırsat ve pazarlık yol haritası sunar.</p></div>
        <Link href="/analiz">Analiz Merkezini Aç <span>→</span></Link>
      </section>

      <footer className="v4-footer">
        <div className="v4-brand footer-brand"><span className="v4-brand-mark">Y</span><span><strong>YAŞAM AI</strong><small>Türkiye’nin Gayrimenkul Karar Platformu</small></span></div>
        <p>© 2026 Yaşam AI. Güven, şeffaflık ve doğrulanabilir karar.</p>
      </footer>
    </main>
  );
}

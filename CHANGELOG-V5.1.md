# Yaşam AI V5.1 — AI Decision Engine

## Eklenenler
- Tek merkezli `lib/ai` karar motoru mimarisi.
- Değerleme, kira, güven, risk, likidite, fırsat, yatırım, pazarlık ve açıklama modülleri.
- Tapu/imar teyidi ve doğrulanmış emsal sayısına dayalı dinamik güven modeli.
- Güven düşükse otomatik `DOĞRULAMA BEKLİYOR` kararı.
- Riskin teklif bantlarını aşağı çektiği güvenli fiyat hesaplaması.
- Açıklanabilir `decisionChain` çıktısı.
- Mevcut `lib/decision-engine` çağrıları için geriye uyumlu dışa aktarımlar.

## Kontrol
- `npm run typecheck` başarıyla tamamlandı.
- Linux ortamında ZIP içindeki Windows `node_modules` nedeniyle ESLint çalıştırılamadı (`Permission denied`). Bu, kaynak kod hatası değil paket izin/işletim sistemi uyumsuzluğudur.

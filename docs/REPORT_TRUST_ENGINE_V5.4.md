# Yaşam AI Report Trust Engine v5.4

Bu sürüm rapor güven dilini ve teklif metodolojisini kurumsal seviyeye taşır.

## Ana değişiklikler

- Yanıltıcı `YAŞAM AI VERIFIED` ibaresi kaldırıldı; `YAŞAM AI RAPOR KAYDI` kullanıldı.
- Dijital kayıt ile taşınmazın resmî doğrulanması birbirinden ayrıldı.
- Rapor sürümü `Yaşam AI Enterprise Report Engine v5.4` olarak güncellendi.
- Localhost QR adresi canlı Vercel adresine güvenli fallback ile yönlendirildi.
- Mahalle verisi yoksa kullanılan veri kapsamı raporda açıkça gösterilir.
- Sabit %7 teklif yaklaşımı kaldırıldı; veri güveni, risk, likidite, resmî teyit, emsal doğrulaması, veri kapsamı ve kira getirisi birlikte değerlendirilir.
- “Güvenli teklif” yerine “Başlangıç teklif önerisi”, “Maksimum teklif” yerine “Üst teklif sınırı” ifadeleri kullanıldı.
- Rapor güven seviyesi ayrı bir modelle hesaplanır: Kayıtlı, Ön Doğrulama, Uzman Doğrulaması Gerekli veya Doğrulanmış.

## Canlı URL

`.env.local` veya Vercel Environment Variables içinde:

```env
NEXT_PUBLIC_APP_URL=https://yasam-ai.vercel.app
```

Kendi alan adına geçildiğinde yalnızca bu değer değiştirilir.

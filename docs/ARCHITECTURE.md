# Mimari

## Katmanlar
- `app/`: Next.js sayfaları ve API rotaları
- `app/analiz/model/`: analiz ekranının tip, sabit ve saf yardımcıları
- `lib/decision-engine/`: deterministik skor ve karar hesapları
- `lib/ai/`: AI destekli açıklama ve öneri katmanı
- `lib/data-center/`: veri doğrulama, CSV ve istatistik
- `features/`: bağımsız ürün modülü sınırları
- `supabase/migrations/`: sürümlenmiş veritabanı şeması

## Karar sırası
1. Kullanıcı girdisi doğrulanır.
2. Bölgesel veri güveni ve örneklem değerlendirilir.
3. Deterministik karar metrikleri hesaplanır.
4. AI yalnızca açıklama ve yapılandırılmış rapor üretir.
5. Eksik/çelişkili veri karar güvenini düşürür.
6. Kritik farklarda “doğrulama bekliyor” sonucu üretilir.

## Hedef refactor
`app/analiz/page.tsx` aşamalı biçimde görünüm bileşenleri ve hook’lara ayrılacaktır. Her faz tek başına derlenebilir ve geri alınabilir olmalıdır.

# Yaşam AI Ürün Mimarisi

## Çekirdek ürün
Yaşam AI, ilan sitesi değil; gayrimenkul karar platformudur. İlk çalışan çekirdek analiz, rapor geçmişi, karşılaştırma, Türkiye veri operasyonu ve üyelik altyapısıdır.

## Katmanlar
1. Sunum: Next.js App Router sayfaları ve yeniden kullanılabilir bileşenler.
2. Ürün modülleri: `features/` altında bağımsız iş alanları.
3. Veri erişimi: Supabase istemcileri ve ileride sunucu repository katmanı.
4. Yapay zekâ: Sunucu API rotaları, doğrulanmış prompt şablonları ve model çıktısı doğrulaması.
5. Güvenlik: RLS, sunucuda saklanan gizli anahtarlar, kullanıcı bazlı veri erişimi.

## Aşamalı geliştirme
- Aşama 1: Çekirdek analiz ve kullanıcı hesabı
- Aşama 2: Gerçek veri kalitesi ve doğrulama motoru
- Aşama 3: Premium/Gold/Kurumsal paketler ve ödeme
- Aşama 4: Müteahhit fizibilitesi ve profesyonel paneller
- Aşama 5: Pazarlık asistanı, dijital ihale merkezi ve kurumsal API

Boş modüller, üründe çalışıyormuş gibi gösterilmez. Her modül veri modeli, servis ve arayüzü tamamlandığında etkinleştirilir.

# Yaşam AI V5.3 Enterprise Foundation

Türkiye geneli yapay zekâ destekli gayrimenkul karar platformu.

## Kurulum
```bash
npm ci
copy .env.example .env.local
npm run dev
```

## Kalite kontrolü
```bash
npm run verify
```

## GitHub çalışma düzeni
- `main`: her zaman çalışan üretim sürümü
- `feature/...`: geliştirme dalları
- Test + PR kontrolü tamamlanmadan `main` birleşimi yapılmaz

## Güvenli ürün ilkesi
Yaşam AI çıktıları ön değerlendirmedir; resmî ekspertiz, hukuk, mühendislik, kredi veya yatırım tavsiyesi değildir. Tapu, imar, teknik durum, kira ve emsal verileri yetkili kaynaklardan doğrulanmalıdır.

Ayrıntılı plan ve mimari için `docs/` klasörüne bakın.

# Yaşam AI

Türkiye'nin güvenilir gayrimenkul karar platformunun Next.js uygulaması.

## Kurulum
1. `.env.example` dosyasını `.env.local` olarak kopyalayın ve anahtarları doldurun.
2. `npm install`
3. Supabase SQL Editor içinde `supabase/migrations/001_core_schema.sql` dosyasını çalıştırın.
4. `npm run dev`

## Kontroller
- `npm run lint`
- `npx tsc --noEmit`
- `npm run build`

## Güvenlik
`.env.local`, `.next`, `node_modules` ve servis rolü anahtarı paylaşılmamalı veya Git'e eklenmemelidir.

## Ana yollar
- `/` Kurumsal ana sayfa
- `/giris` Giriş ve kayıt
- `/analiz` Yaşam AI karar merkezi
- `/api/chat` OpenAI destekli analiz servisi

Mimari ve yol haritası: `docs/architecture/ROADMAP.md`

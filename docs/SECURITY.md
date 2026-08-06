# Güvenlik

- `.env.local` ve gerçek anahtarlar GitHub’a eklenmez.
- `OPENAI_API_KEY` yalnızca sunucu tarafında kullanılır.
- Supabase RLS politikaları kullanıcı verilerini kullanıcı kimliğiyle sınırlar.
- Üretim öncesi açık anahtarlar yenilenir.
- API rotalarında kullanıcı girdisi doğrulanır, hata ayrıntıları istemciye sızdırılmaz.
- Rapor doğrulama kayıtları değiştirilemez kimlik ve zaman bilgisiyle saklanır.

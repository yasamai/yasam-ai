# YAŞAM AI — V31 Production Subscription & Access Control Finalization

Tarih: 2026-08-25 22:45
Branch: feat/v31-production-subscription

## Yol haritası kapsamı
- iyzico subscription production-ready
- upgrade / downgrade / cancel / past_due
- webhook subscription lifecycle
- erişim kontrolünün server-side üyelik durumuna bağlanması
- production QA öncesi ödeme/üyelik çekirdeğinin sıkılaştırılması

## Bu kurulumun doğruladığı / uyguladığı noktalar
- X-IYZ-SIGNATURE-V3 webhook doğrulama yapısı mevcut
- subscription.order.success ve subscription.order.failure eventleri mevcut
- başarısız recurring payment -> past_due mantığı mevcut
- cancel resmi endpoint yapısı mevcut
- upgrade resmi endpoint yapısı mevcut
- cancel ve change-plan kullanıcı kimliğini server-side doğruluyor
- payment_webhook_events event kaydı mevcut
- merkezi subscription access policy eklendi
- /api/membership/access server-side erişim endpoint'i eklendi
- ACTIVE/TRIAL dışındaki ücretli durumlarda ücretli erişim fail-closed politikası uygulanır
- UI, past_due/canceled/paused erişim durumunu açık biçimde gösterir
- webhook ortam etiketi sandbox/production env'e göre dinamikleştirildi

## iyzico resmi dokümantasyon doğrulaması — 2026-08-25
- Webhook subscription eventleri: subscription.order.success / subscription.order.failure
- Webhook imzası: X-IYZ-SIGNATURE-V3
- Cancel: POST /v2/subscription/subscriptions/{subscriptionReferenceCode}/cancel
- Upgrade: POST /v2/subscription/subscriptions/{subscriptionReferenceCode}/upgrade
- Başarısız recurring payment için retry: POST /v2/subscription/operation/retry

## Bilinçli güvenlik kararı
Provider ACTIVE/TRIAL olarak doğrulanmayan Premium/Gold profil bilgisi tek başına ücretli erişim açmaz.
past_due / unpaid / canceled / cancelled / paused / pending / expired durumları fail-closed davranır.

## Otomatik testler
- npm run typecheck
- npm run build

## Canlıya geçmeden önce manuel E2E
Kodun başarılı build olması gerçek provider tahsilatını taklit etmez.
Production QA aşamasında gerçek sandbox test hesabıyla success + recurring failure/past_due + upgrade + downgrade + cancel senaryoları uçtan uca doğrulanmalıdır.
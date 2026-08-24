-- YAŞAM AI v27 — Subscription Lifecycle
-- Supabase SQL Editor'da BİR KEZ çalıştırılacak.
-- Mevcut kolonları silmez/değiştirmez; yalnızca eksik v27 alanlarını ekler.

alter table public.subscription_profiles
  add column if not exists pending_plan text,
  add column if not exists pending_change_mode text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscription_profiles_pending_plan_check'
  ) then
    alter table public.subscription_profiles
      add constraint subscription_profiles_pending_plan_check
      check (pending_plan is null or pending_plan in ('premium', 'gold'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'subscription_profiles_pending_change_mode_check'
  ) then
    alter table public.subscription_profiles
      add constraint subscription_profiles_pending_change_mode_check
      check (pending_change_mode is null or pending_change_mode in ('next_period'));
  end if;
end $$;

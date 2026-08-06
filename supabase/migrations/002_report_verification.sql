create table if not exists public.report_verifications (
  id uuid primary key default gen_random_uuid(),
  report_id text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  report_date timestamptz not null,
  report_version text not null,
  verification_status text not null default 'active' check (verification_status in ('active','revoked','expired')),
  location text,
  property_type text,
  decision text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.report_verifications enable row level security;

drop policy if exists "report_verifications_insert_own" on public.report_verifications;
create policy "report_verifications_insert_own" on public.report_verifications
for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "report_verifications_update_own" on public.report_verifications;
create policy "report_verifications_update_own" on public.report_verifications
for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "report_verifications_select_public" on public.report_verifications;
create policy "report_verifications_select_public" on public.report_verifications
for select to anon, authenticated using (verification_status in ('active','revoked','expired'));

create index if not exists report_verifications_user_created_idx
on public.report_verifications(user_id, created_at desc);

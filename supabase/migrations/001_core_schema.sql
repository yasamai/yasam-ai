create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'user',
  membership_tier text not null default 'standard',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.analysis_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  city text,
  district text,
  neighborhood text,
  property_type text,
  area text,
  asking_price text,
  notes text,
  report text,
  decision text,
  is_favorite boolean not null default false,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.market_data (
  id uuid primary key default gen_random_uuid(),
  city text not null,
  district text not null,
  neighborhood text,
  property_type text not null,
  period_date date not null,
  source text not null default 'manual_verified',
  sample_size integer not null default 0,
  average_price_m2 numeric,
  median_price_m2 numeric,
  average_rent_m2 numeric,
  annual_change_percent numeric,
  confidence integer not null default 0 check (confidence between 0 and 100),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(city,district,neighborhood,property_type,period_date,source)
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tier text not null default 'standard',
  status text not null default 'inactive',
  starts_at timestamptz,
  ends_at timestamptz,
  provider text,
  provider_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.analysis_reports enable row level security;
alter table public.market_data enable row level security;
alter table public.subscriptions enable row level security;

create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);
create policy "reports_select_own" on public.analysis_reports for select using (auth.uid() = user_id);
create policy "reports_insert_own" on public.analysis_reports for insert with check (auth.uid() = user_id);
create policy "reports_update_own" on public.analysis_reports for update using (auth.uid() = user_id);
create policy "reports_delete_own" on public.analysis_reports for delete using (auth.uid() = user_id);
create policy "market_data_read_authenticated" on public.market_data for select to authenticated using (true);
create policy "subscriptions_select_own" on public.subscriptions for select using (auth.uid() = user_id);

create index if not exists analysis_reports_user_created_idx on public.analysis_reports(user_id, created_at desc);
create index if not exists market_data_location_idx on public.market_data(city, district, neighborhood, property_type, period_date desc);

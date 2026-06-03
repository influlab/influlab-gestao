-- InfluLAB — Schema do banco de dados
-- Execute este script no Supabase Studio (SQL Editor)

-- Habilitar extensão para UUIDs
create extension if not exists "uuid-ossp";

-- ============================================================
-- PRESTADORES DE SERVIÇO
-- ============================================================
create table if not exists service_providers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  service_type text,
  email text,
  phone text,
  payment_amount numeric(12,2),
  payment_frequency text check (payment_frequency in ('monthly', 'weekly', 'biweekly', 'per_service', 'annual')),
  notes text,
  active boolean default true,
  start_date date not null default current_date,
  end_date date,
  created_at timestamptz default now()
);

-- ============================================================
-- ASSINATURAS
-- ============================================================
create table if not exists subscriptions (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  amount numeric(12,2) not null,
  billing_cycle text not null check (billing_cycle in ('monthly', 'annual', 'weekly', 'quarterly')),
  billing_day int check (billing_day between 1 and 31),
  category text,
  active boolean default true,
  start_date date not null default current_date,
  end_date date,
  created_at timestamptz default now()
);

-- ============================================================
-- CUSTOS FIXOS
-- ============================================================
create table if not exists fixed_costs (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  amount numeric(12,2) not null,
  billing_day int check (billing_day between 1 and 31),
  category text,
  active boolean default true,
  start_date date not null default current_date,
  end_date date,
  created_at timestamptz default now()
);

-- ============================================================
-- CUSTOS AVULSOS
-- ============================================================
create table if not exists variable_costs (
  id uuid primary key default uuid_generate_v4(),
  description text not null,
  amount numeric(12,2) not null,
  date date not null default current_date,
  category text,
  payment_method text,
  notes text,
  created_at timestamptz default now()
);

-- ============================================================
-- ENTRADAS (RECEITAS)
-- ============================================================
create table if not exists revenue_entries (
  id uuid primary key default uuid_generate_v4(),
  platform text not null check (platform in ('kiwify', 'ticto', 'manual', 'other')),
  product_name text,
  gross_amount numeric(12,2) not null,
  net_amount numeric(12,2),
  customer_name text,
  customer_email text,
  transaction_id text,
  date date not null default current_date,
  status text default 'approved' check (status in ('approved', 'refunded', 'pending', 'cancelled')),
  raw_payload jsonb,
  created_at timestamptz default now()
);

-- ============================================================
-- GASTOS EM ANÚNCIOS
-- ============================================================
create table if not exists ad_costs (
  id uuid primary key default uuid_generate_v4(),
  platform text not null check (platform in ('meta', 'google', 'tiktok', 'kwai', 'other')),
  campaign_name text,
  amount numeric(12,2) not null,
  date date not null default current_date,
  notes text,
  created_at timestamptz default now()
);

-- ============================================================
-- RLS (Row Level Security) — habilitar para todas as tabelas
-- ============================================================
alter table service_providers enable row level security;
alter table subscriptions enable row level security;
alter table fixed_costs enable row level security;
alter table variable_costs enable row level security;
alter table revenue_entries enable row level security;
alter table ad_costs enable row level security;

-- Políticas: usuários autenticados têm acesso total
create policy "authenticated_full_access" on service_providers
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on subscriptions
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on fixed_costs
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on variable_costs
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on revenue_entries
  for all to authenticated using (true) with check (true);

create policy "authenticated_full_access" on ad_costs
  for all to authenticated using (true) with check (true);

-- Política especial para webhooks (service_role ignora RLS por padrão)
-- Os webhooks usam a service_role key no backend, não a anon key

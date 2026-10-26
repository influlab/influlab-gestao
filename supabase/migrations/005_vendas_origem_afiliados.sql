-- Etapa 1 do SPEC de expansão (dashboard-kiwify-spec.md): modelo de dados para
-- produtos, afiliados, origem de tráfego (UTM) e configurações de imposto.
-- 100% aditivo: tabelas novas + colunas nullable em revenue_entries, nada é
-- removido/renomeado/alterado de tipo nas tabelas existentes.

-- ============================================================
-- ORIGENS (catálogo de origem de tráfego)
-- ============================================================
create table if not exists origens (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  created_at timestamptz default now()
);

alter table origens enable row level security;
create policy "authenticated_full_access" on origens
  for all to authenticated using (true) with check (true);

insert into origens (name) values
  ('Meta Ads'),
  ('TikTok Ads'),
  ('Google Ads'),
  ('Impulsionar Instagram'),
  ('Impulsionar TikTok'),
  ('Orgânico'),
  ('Afiliados'),
  ('Não identificado')
on conflict (name) do nothing;

-- ============================================================
-- PRODUTOS (mapeamento de origem padrão por produto)
-- ============================================================
create table if not exists produtos (
  id uuid primary key default uuid_generate_v4(),
  platform text not null,
  external_id text not null,
  name text not null,
  nickname text,
  default_origem_id uuid references origens(id),
  active boolean not null default true,
  created_at timestamptz default now(),
  unique (platform, external_id)
);

alter table produtos enable row level security;
create policy "authenticated_full_access" on produtos
  for all to authenticated using (true) with check (true);

-- ============================================================
-- AFILIADOS
-- ============================================================
create table if not exists afiliados (
  id uuid primary key default uuid_generate_v4(),
  platform text not null,
  external_id text not null,
  name text,
  email text,
  created_at timestamptz default now(),
  unique (platform, external_id)
);

alter table afiliados enable row level security;
create policy "authenticated_full_access" on afiliados
  for all to authenticated using (true) with check (true);

-- ============================================================
-- REGRAS DE UTM (prioridade editável, menor número = mais prioridade)
-- ============================================================
create table if not exists regras_utm (
  id uuid primary key default uuid_generate_v4(),
  field text not null check (field in ('utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'src', 'sck')),
  operator text not null check (operator in ('igual', 'contem', 'comeca_com')),
  value text not null,
  origem_id uuid not null references origens(id),
  priority int not null default 0,
  active boolean not null default true,
  created_at timestamptz default now()
);

alter table regras_utm enable row level security;
create policy "authenticated_full_access" on regras_utm
  for all to authenticated using (true) with check (true);

-- ============================================================
-- CONFIGURAÇÕES (imposto, taxa de gateway — linha única editável)
-- ============================================================
create table if not exists configuracoes (
  id uuid primary key default uuid_generate_v4(),
  aliquota_imposto_mensal numeric(5,2) not null default 3.00,
  aliquota_reserva_trimestral numeric(5,2) not null default 3.00,
  base_imposto text not null default 'bruto_aprovado' check (base_imposto in ('bruto_aprovado', 'liquido')),
  taxa_gateway_percentual numeric(5,2) default 3.49,
  taxa_gateway_fixa numeric(10,2) default 2.49,
  updated_at timestamptz default now()
);

alter table configuracoes enable row level security;
create policy "authenticated_full_access" on configuracoes
  for all to authenticated using (true) with check (true);

insert into configuracoes (aliquota_imposto_mensal, aliquota_reserva_trimestral, base_imposto, taxa_gateway_percentual, taxa_gateway_fixa)
select 3.00, 3.00, 'bruto_aprovado', 3.49, 2.49
where not exists (select 1 from configuracoes);

-- ============================================================
-- REVENUE_ENTRIES — colunas novas (UTM, afiliado, produto, order bump, origem)
-- ============================================================
alter table revenue_entries add column if not exists utm_source text;
alter table revenue_entries add column if not exists utm_medium text;
alter table revenue_entries add column if not exists utm_campaign text;
alter table revenue_entries add column if not exists utm_content text;
alter table revenue_entries add column if not exists utm_term text;
alter table revenue_entries add column if not exists src text;
alter table revenue_entries add column if not exists sck text;
alter table revenue_entries add column if not exists affiliate_id uuid references afiliados(id);
alter table revenue_entries add column if not exists product_id uuid references produtos(id);
alter table revenue_entries add column if not exists order_item_type text not null default 'principal' check (order_item_type in ('principal', 'orderbump'));
alter table revenue_entries add column if not exists parent_order_id text;
alter table revenue_entries add column if not exists origem_id uuid references origens(id);
alter table revenue_entries add column if not exists fonte text not null default 'manual' check (fonte in ('webhook', 'importacao', 'manual'));

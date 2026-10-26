-- Log de todos os webhooks recebidos (Kiwify, Ticto), antes de qualquer processamento.
-- Permite diagnosticar payloads reais e auditar tentativas com assinatura inválida.
create table if not exists webhook_logs (
  id uuid primary key default uuid_generate_v4(),
  source text not null check (source in ('kiwify', 'ticto')),
  payload jsonb,
  headers jsonb,
  signature_valid boolean,
  processed boolean not null default false,
  error text,
  created_at timestamptz default now()
);

alter table webhook_logs enable row level security;

create policy "authenticated_full_access" on webhook_logs
  for all to authenticated using (true) with check (true);

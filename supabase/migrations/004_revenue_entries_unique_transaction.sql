-- Evita duplicar a mesma venda (mesma plataforma + mesmo transaction_id).
-- NULL nunca conflita com NULL em UNIQUE no Postgres, então lançamentos
-- manuais (sem transaction_id) continuam livres para se repetir.
alter table revenue_entries
  add constraint revenue_entries_platform_transaction_id_key unique (platform, transaction_id);

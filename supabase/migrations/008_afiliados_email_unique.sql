-- resolveAfiliadoId() busca por e-mail antes de criar um novo afiliado, mas
-- sem uma constraint no banco essa checagem não é atômica: quando dois
-- webhooks do mesmo afiliado chegam quase ao mesmo tempo (ex.: produto
-- principal + order bump da mesma venda, cada um disparando sua própria
-- requisição), os dois podem fazer o SELECT antes de qualquer um gravar o
-- INSERT, e cada um cria um registro novo pro mesmo e-mail. Confirmado em
-- produção: duplicatas criadas a poucos milissegundos de diferença mesmo
-- depois do fix em src/lib/afiliados.ts.
--
-- Normaliza e-mails existentes pra minúsculo (upsert por e-mail passa a
-- comparar case-insensitive guardando tudo já em minúsculo) e cria um índice
-- único que o Postgres garante mesmo sob concorrência.
update afiliados set email = lower(email) where email is not null and email <> lower(email);

-- Sem "where email is not null": um índice único parcial não pode ser usado
-- como alvo de ON CONFLICT (platform, email) sem repetir o WHERE na própria
-- query, que o upsert do supabase-js não gera. Um índice único "cheio"
-- funciona igual pro caso que importa (duas linhas com o mesmo e-mail não-nulo
-- colidem) porque, no Postgres, NULL nunca é igual a NULL — várias linhas com
-- email NULL continuam permitidas sem conflito.
create unique index if not exists afiliados_platform_email_key
  on afiliados (platform, email);

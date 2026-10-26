-- As tabelas originais do app (service_providers, subscriptions, fixed_costs,
-- variable_costs, revenue_entries, ad_costs) aceitam escrita da chave "anon"
-- na prática, porque o app usa autenticação própria (cookie HMAC) e nunca
-- autentica no Supabase Auth — ou seja, o browser sempre fala com o banco
-- como "anon", nunca como "authenticated". Essa policy extra pra "anon"
-- nunca foi versionada em nenhuma migration (foi adicionada direto no
-- Studio em algum momento antes desta sessão).
--
-- As tabelas novas da expansão Kiwify só tinham a policy "authenticated",
-- copiada do padrão das migrations anteriores — por isso o botão de
-- cadastrar origem (e qualquer escrita em regras_utm/produtos/afiliados/
-- configuracoes pelo navegador) falhava com "new row violates row-level
-- security policy". Esta migration alinha essas tabelas ao comportamento
-- real do resto do app.
--
-- webhook_logs fica de fora de propósito: só o webhook (service_role,
-- que ignora RLS) escreve nela, e os payloads podem conter dados pessoais
-- (CPF, telefone, e-mail do cliente) que não devem ficar expostos à chave
-- pública "anon" sem uma necessidade de tela que já exista hoje.

create policy "anon_full_access" on origens
  for all to anon using (true) with check (true);

create policy "anon_full_access" on produtos
  for all to anon using (true) with check (true);

create policy "anon_full_access" on afiliados
  for all to anon using (true) with check (true);

create policy "anon_full_access" on regras_utm
  for all to anon using (true) with check (true);

create policy "anon_full_access" on configuracoes
  for all to anon using (true) with check (true);

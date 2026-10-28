# InfluLAB Gestão — Contexto do Projeto

## Visão Geral

Dashboard financeiro da InfluencersLAB para gestão de receitas, custos e lucro. Integra automaticamente vendas via webhooks (Kiwify e Ticto) e permite lançamentos manuais.

---

## 🧭 Status atual (ler isto primeiro numa sessão nova)

**Onde paramos:** a Etapa 4 do plano de expansão do SPEC (`dashboard-kiwify-spec.md`) está concluída e validada em produção — webhook Kiwify validando assinatura, com idempotência, capturando UTM/produto/afiliado e calculando `origem_id`; telas `/produtos`, `/regras-utm` e `/origens` (CRUD completo) no ar e confirmadas pelo usuário direto em produção (deploy do commit `f48c0a8` ok). Entrando na próxima fase do SPEC, o usuário escolheu **importação de histórico via CSV** como prioridade (entre as 4 pendências listadas abaixo). Construída a tela **`/entradas/importar`**: upload de CSV, preview linha a linha com validação (data, valor, plataforma, status), origem única aplicada ao lote, e upsert por `(platform, transaction_id)` pra reimportação não duplicar quando o CSV traz `transaction_id`. Parser CSV próprio em `src/lib/csv.ts` (RFC4180, sem dependência nova — `papaparse` não foi adicionado de propósito). Commit `791cedc`, empurrado pro GitHub — **ainda não deployado/testado em produção**.

**Incidente encontrado e corrigido no início desta sessão (27/10/2026) — vendas reais sendo perdidas:** ao checar `webhook_logs` pra retomar o trabalho, apareceu um burst de eventos `order_approved`/`paid` com `signature_valid: false` começando ~16:08 UTC do próprio dia, para 4 pedidos distintos que nunca entraram em `revenue_entries`. Investigando o payload: eram de uma **segunda loja/produto Kiwify** ("Laboratório de Influencers IA - A", `store_id: FMuQDgYGEYIn3h1`), diferente da loja principal (`store_id: NGAPoCASkJLAMjW`, cujas vendas continuavam validando normalmente) — ou seja, essa segunda loja tem um token de webhook próprio no painel da Kiwify, diferente do valor único salvo em `KIWIFY_WEBHOOK_SECRET`. O usuário forneceu o token dessa segunda loja. Corrigido em `src/app/api/webhooks/kiwify/route.ts` (commit `e34663c`): `isValidSignature` agora testa a assinatura contra **uma lista de segredos**, e `KIWIFY_WEBHOOK_SECRET` passa a aceitar múltiplos valores separados por vírgula. As 4 vendas perdidas (R$ 601,29 bruto / R$ 431,06 líquido) foram recuperadas manualmente, reprocessando o payload já salvo em `webhook_logs` com a mesma lógica do webhook. **Resolvido e confirmado em produção**: usuário atualizou `KIWIFY_WEBHOOK_SECRET` no EasyPanel e fez o deploy; a partir de 16:38 UTC do mesmo dia, vendas da loja `FMuQDgYGEYIn3h1` voltaram a validar (`signature_valid: true`) e as 4 recuperadas continuam íntegras (sem duplicata, mesmo com a Kiwify reenviando os eventos depois do deploy — o upsert por `transaction_id` absorveu os reenvios).

**Importador CSV reescrito pra ler o export nativo da Kiwify (27/10/2026)**: o usuário colocou um export real da Kiwify na raiz do projeto (`sales_2ah1o_1793119272995.csv`, 10.519 vendas, ~5MB — **contém CPF/telefone/endereço/e-mail de clientes reais**; adicionado `*.csv` ao `.gitignore` nesta sessão como rede de segurança, mas o ideal é apagar o arquivo da raiz depois de confirmado o import, não depender só do gitignore) e pediu pra usar o formato nativo da Kiwify em vez do template genérico que tínhamos construído antes (commit `791cedc`, descontinuado). Reescrito em `src/app/(app)/entradas/importar/` (commit `5c7c217`): agora lê direto as colunas do export (`ID da venda`, `Status`, `Produto`, `Preço base do produto`/`Total com acréscimo`, `Valor líquido`, datas, tracking UTM). Decisões tomadas:
- **Status**: `paid→approved`, `waiting_payment→pending`, `refused→cancelled`, `refunded→refunded`, `chargedback→refunded` (chargeback tratado como reembolso).
- **Datas**: não existe coluna "data de aprovação" no export — usamos `Data de Atualização` pra vendas `paid` (aproxima o momento da aprovação) e `Data de Criação` pras demais.
- **Valores**: `gross_amount = Total com acréscimo` (cai pro `Preço base do produto` quando vazio — mesma semântica do `charge_amount` do webhook), `net_amount = Valor líquido` (já é o líquido do produtor, confirmado batendo a conta: base − taxas − comissão de afiliado/coprodutor).
- **`origem_id` por linha** (não mais uma origem única pro lote): reaproveita `calcularOrigemId()`, igual ao webhook — regra de UTM ativa → produto mapeado (por **nome**, já que o export não traz o `product_id` interno da Kiwify, só o nome) → origem padrão escolhida na tela. **Hoje não há nenhuma regra de UTM ativa nem produto com `default_origem_id` configurado em produção — então toda venda importada cai em "Não identificado" a menos que uma origem padrão seja selecionada na tela.** Isso não é bug: é esperado até o usuário configurar `/regras-utm`/`/produtos`, e passa a funcionar automaticamente depois (mesma lógica do webhook).
- **Afiliados não são linkados** nessa importação — o export só tem nome/CPF/e-mail do afiliado, não o código interno da Kiwify que a tabela `afiliados` usa como chave (`external_id`), então ligar os dois exigiria heurística arriscada. Fica como limitação conhecida.
- **Dedup contra o webhook** (achado importante): o export identifica a venda por `ID da venda`, que é o `order_ref` (código curto, ex. `T4ATD9V`) — **diferente** do `order_id` (UUID) que o webhook usa como `transaction_id`. Sem checar isso, reimportar vendas recentes já capturadas pelo webhook duplicaria a receita. A tela agora cruza o `ID da venda` de cada linha contra `transaction_id` **e** `raw_payload->>order_ref` de tudo que já está em `revenue_entries` (`platform='kiwify'`) antes de montar o preview, e marca como "já existe" (ignorada, não conta como erro) em vez de reimportar.
- Testado localmente (fora do navegador, sem gravar nada) com o arquivo real do usuário: **10.428 válidas, 90 já existentes (dedup funcionou), 1 com erro** (única linha em moeda USD — sem taxa de câmbio pra converter, fica de fora até decidirem o que fazer com ela).

**Motor de impostos real no dashboard (27/10/2026)**: usuário escolheu essa pendência do SPEC como próxima fase. `(app)/page.tsx` usava `0.06` fixo hardcoded; agora usa a tabela `configuracoes` de verdade. Implementado em `src/lib/impostos.ts` (commit `7595a2d`) + cards novos em `dashboard-client.tsx`:
- **Base de cálculo** configurável (`bruto_aprovado` padrão, ou `liquido`).
- **Imposto mensal**: alíquota × base do **período selecionado** no filtro do dashboard.
- **Reserva trimestral**: mesma alíquota, mas com dois cards adicionais calculados sempre pela data real de hoje (independente do filtro de período selecionado): **"Trimestral a pagar este mês"** (só aparece quando o mês atual é jan/abr/jul/out, somando os 3 meses do trimestre anterior — ex.: em outubro, soma jul+ago+set) e **"Reserva acumulada do trimestre corrente"** (sempre visível, do início do trimestre atual até hoje).
- `/configuracoes` ganhou um formulário pra editar as alíquotas e a base de cálculo (antes só dava pra mudar direto no Supabase Studio).
- Funções de data testadas manualmente contra os 4 exemplos do SPEC (jan→out+nov+dez, abr→jan+fev+mar, jul→abr+mai+jun, out→jul+ago+set) e validadas em leitura contra dados reais de produção — confirmado que outubro é mês de vencimento trimestral e os números batem com a soma manual do período.

**Webhook da Ticto corrigido (27/10/2026) — nunca tinha validado nem gravado uma venda real**: ao seguir pra pendência "fora do dashboard" seguinte (segurança), descobri — confirmando contra a documentação oficial (`help.ticto.com.br/.../webhook` e `webhook.ticto.dev/docs/v2`) — duas suposições erradas desde a implementação original: (1) o token vem como campo `token` **dentro do corpo JSON**, não como `?token=` na URL (que a Ticto nunca envia — todo postback real batia 401 silenciosamente); (2) o status de venda aprovada é `"authorized"`, não `"approved"`/`"paid"`/`"completed"`. Confirmado em produção: as 7 linhas `platform='ticto'` existentes são todas `fonte='manual'` — nenhuma venda da Ticto nunca foi gravada automaticamente, mesmo padrão do bug histórico da Kiwify (`order` wrapper) antes desta sessão, só que a Ticto nem tinha `webhook_logs` pra algum dia descobrir isso sozinha. Reescrito em `src/app/api/webhooks/ticto/route.ts` (commit `6f9a1fd`) seguindo a mesma estrutura do webhook da Kiwify: grava em `webhook_logs` sempre (faltava completamente), token validado com comparação timing-safe, idempotência por upsert em `(platform, transaction_id = order.hash)`, campos extraídos da estrutura real (`item`/`customer`/`producer`/`affiliates`/`tracking`, não `product`/`amount` como antes), captura UTM e calcula `origem_id` igual à Kiwify. `/configuracoes` também corrigido (a URL de webhook mostrada orientava a colocar `?token=`, o que nunca funcionaria). **Ainda falta**: o usuário reconfigurar no painel da Ticto (Tictools → Webhooks) a URL sem `?token=` e garantir que o token cadastrado lá bate com `TICTO_WEBHOOK_TOKEN` do EasyPanel — e fazer o deploy do commit.

**Importação do CSV da Kiwify — concluída pelo usuário direto na tela (27/10/2026)**: eu tentei rodar via script e o sandbox bloqueou (escrita em massa em produção exige aprovação explícita), então o usuário fez o deploy e importou ele mesmo pela tela `/entradas/importar`. Usou um export mais completo que o arquivo que estava na raiz do projeto (esse cobria só outubro; o que ele importou cobre **12/03/2026 a 26/10/2026**). Confirmado em produção: **24.525 linhas `fonte='importacao'`** (19.654 com status `approved`), **zero duplicata** com as vendas já capturadas pelo webhook (cruzei as 214 vendas `fonte='webhook'` por `order_ref` contra as importadas — nenhum ID em comum). O dedup por `order_ref`/`transaction_id` funcionou como projetado. Arquivo `sales_2ah1o_1793119272995.csv` apagado da raiz do projeto nesta sessão (já tinha sido superado pelo export maior que o usuário usou).

**Webhook da Ticto confirmado funcionando em produção (27/10/2026)**: usuário disparou o "Enviar evento de teste" da Ticto (status `waiting_payment`, produto de teste "Paki Guthrie") depois de corrigir o `TICTO_WEBHOOK_TOKEN` no EasyPanel (o `.env.local` local ainda tinha um token antigo de 25 caracteres — causa do primeiro 401; corrigido). `webhook_logs` confirmou `signature_valid: true`/`processed: true`, entrada gravada certinha (pendente, não entra no faturamento). Linha e produto de teste apagados logo depois (pedido do usuário).

**Order bumps — classificação por produto, não por payload (27/10/2026)**: usuário tem produtos que são sempre order bump ("Acesso Vitalício", "Seja meu Sócio", "+120 Prompts Ultra-realista", "Suporte Premium" — e as variantes "- N" de cada um, que existem como produtos Kiwify separados). Como nunca chegou um payload real de venda com order bump (nem da Kiwify nem da Ticto) pra saber como a plataforma marca isso no JSON, implementei a classificação pelo lado do produto em vez de tentar adivinhar a estrutura: migration `007_produtos_orderbump.sql` (`produtos.is_orderbump`), checkbox "É order bump" em `/produtos`, e os 3 pontos que gravam `order_item_type` (webhook Kiwify, webhook Ticto, importador CSV) consultam essa flag do produto resolvido e marcam `orderbump`/`principal` de acordo. Botão "Recalcular order bumps" em `/produtos` reprocessa o histórico existente quando a flag de um produto muda. **Rodado e confirmado em produção (27/10/2026)**: usuário aplicou a migration, marcou os 6 produtos, fez o deploy e clicou "Recalcular" — 18.369 vendas reclassificadas como `orderbump` (R$ 918.558,93 em bruto), conferido linha a linha por produto. Commit `7dc5739`.

**Lançamentos manuais antigos de Kiwify duplicando o CSV importado — encontrados e apagados (27/10/2026)**: usuário pediu pra conferir se a importação do CSV criou divergência com lançamentos manuais pré-existentes. Dos 23 registros `platform='kiwify' fonte='manual'`, 14 eram as vendas reais recuperadas do incidente da segunda loja (já tinham `transaction_id`/`order_ref` reais — cruzei contra as importadas e confirmei zero duplicata, corretamente ignoradas pelo dedup do importador). Os outros **9 eram os antigos totais mensais aproximados** (de março a agosto/2026, `transaction_id` nulo, sem produto/cliente, criados antes desta sessão) — como não tinham `transaction_id`, o dedup da importação não tinha como detectá-los, e ficaram somando **em dobro** em cima das vendas reais já importadas pro mesmo período (ex.: março tinha R$259.615,78 de total manual aproximado **além** das 3.249 vendas reais somando R$582.542,36 já importadas). **Apagados os 9, confirmados em produção** (R$ 3.848.182,94 em bruto removidos do total — jan/fev/set/out não tinham esse problema, só mar-ago). Não mexi nos lançamentos manuais da Ticto (não pedido, e não há CSV importado lá pra causar o mesmo tipo de divergência).

**Tabela de Order bumps no dashboard (27/10/2026)**: `(app)/page.tsx` agrupa as vendas aprovadas com `order_item_type='orderbump'` do período filtrado por produto (qtd, faturamento) e calcula taxa de conversão = vendas do bump ÷ total de pedidos principais aprovados no período. **Limitação assumida e documentada na própria tela**: sem um payload real com order bump, não existe vínculo confiável entre um bump e o pedido principal específico que ele acompanhou (`parent_order_id` nunca foi populado) — então a taxa é relativa ao total de pedidos principais do período inteiro, não a um produto principal específico. Validado contra dados reais de outubro/2026 antes de commitar (ex.: "Acesso Vitalício - N" com 836 vendas, taxa 22,3%). Commit `b6d2945`.

**Resto das seções do SPEC pro dashboard (27/10/2026)**: usuário pediu pra completar o que faltava do SPEC original na tela de Dashboard. Implementado em `(app)/page.tsx` + `dashboard-client.tsx` + `dashboard-filter.tsx` (commit `0387355`):
- **Cards extras**: Faturamento bruto, Nº de vendas, Ticket médio — sempre sobre o período inteiro (não respeitam o filtro extra abaixo, só o período).
- **Gráfico "Faturamento × investimento por dia"**: linha dupla (faturamento aprovado vs. gasto em anúncios) dia a dia dentro do período filtrado. Investimento não é filtrável por produto/origem/afiliado porque `ad_costs` ainda não tem esse vínculo (é a pendência de ROAS).
- **Tabela Vendas por produto** (só `order_item_type='principal'` — order bump já tem a tabela própria) e **Tabela Vendas por afiliado** (vendas + faturamento; **"comissão paga" não está nessa tabela** porque não é capturada hoje nem pelo webhook nem pela importação — fica como limitação documentada, igual ao padrão usado pra order bumps).
- **Filtro extra por produto/origem/afiliado** + presets de período **Hoje/Ontem/7 dias** (o "Personalizado" do SPEC já existia como os dois inputs de data manuais). **Decisão importante**: o filtro extra só afeta o gráfico diário, a Receita por plataforma e as tabelas de produto/order bump/afiliado — os cards do topo (Receita, Custos, Lucro, Margem, impostos) continuam somando o período inteiro, porque não há como atribuir custos (anúncios, fixos, assinaturas) a um produto/origem/afiliado específico ainda. Isso está avisado na própria tela quando um filtro extra está ativo.
- Validado com dados reais de produção antes de commitar (outubro/2026: 6.008 vendas aprovadas, ticket médio R$165,03, top produto "Laboratório de Influencers IA - AF" com 3.067 vendas).
- **Ainda não construído do SPEC**: "Reembolsos e chargebacks do período" (o usuário não pediu essa quando escolhi as seções) e investimento em tráfego com ROAS (pendência à parte, decisão já tomada de reaproveitar `ad_costs`).

**Bug encontrado e corrigido na tabela "Vendas por afiliado" (27/10/2026)**: usuário reportou que a tabela não somava todas as vendas de um mesmo afiliado numa linha só. Causa raiz: os webhooks (Kiwify e Ticto) usavam o campo `id` de dentro de `Commissions.commissioned_stores`/`affiliates[]` como `external_id` pra criar/buscar o registro em `afiliados` — mas esse `id` identifica o registro de **comissão daquela venda**, não o afiliado, e muda a cada venda mesmo sendo o mesmo e-mail (confirmado comparando o payload de várias vendas de "Tiago Carneiro": `id` diferente em todas, `email` igual em todas). Resultado: cada venda de afiliado criava um registro novo em `afiliados` em vez de reaproveitar o existente — **247 registros em `afiliados` representavam só 31 pessoas reais**. Corrigido em `src/lib/afiliados.ts` (`resolveAfiliadoId()`, usado pelos dois webhooks, commit `57afb48`): busca por e-mail primeiro, só cria um novo registro quando não há e-mail. Histórico também corrigido: mesclados os 217 duplicados nos 31 reais e repontadas as vendas afetadas pro `affiliate_id` certo (confirmado em produção — "Tiago Carneiro" agora é 1 linha com as vendas somadas, não 4 linhas separadas). **Ainda precisa de deploy** do commit `57afb48` pra parar de criar novos duplicados (o deploy anterior, `31236a8`, não incluía esse fix — qualquer venda de afiliado processada entre esses deploys volta a duplicar até o deploy deste commit).

**Bug encontrado e corrigido na atribuição de origem (27/10/2026)**: usuário reportou que o faturamento líquido do filtro "Comercial" aparecia muito abaixo do esperado (~R$10 mil vs. os >R$80 mil reais). Causa: produtos com `default_origem_id` configurado em `/produtos` só aplicam esse mapeamento em vendas processadas **depois** da configuração — vendas já existentes no banco (principalmente as ~505 vindas da importação do CSV, de antes do mapeamento "Comercial" ter sido criado) continuam com o `origem_id` antigo ("Não identificado") até alguém clicar em "Reprocessar origens" em `/regras-utm`. Encontradas **4.929 vendas** no total presas assim (não só Comercial — também afeta Afiliados/Orgânico/Influencers). Não é bug de código, é falta de reprocessamento depois de configurar mapeamentos novos — **usuário avisado pra clicar em "Reprocessar origens"**, não processado ainda nesta sessão (tentativa de rodar via script bloqueada pelo sandbox por ser escrita em massa).

**Primeira coisa a fazer numa sessão nova:**
1. **Confirmar o deploy dos commits `b6d2945` e `0387355`** (order bumps + resto do dashboard) e olhar em produção — nenhuma dessas seções novas foi vista rodando num navegador de verdade ainda.
2. Se o usuário quiser atribuição de origem melhor que "Não identificado" pras vendas importadas (hoje a maioria cai lá, já que não há regra de UTM nem produto com `default_origem_id` configurado), configurar `/regras-utm`/`/produtos` e usar "Reprocessar origens" em `/regras-utm`.
3. **Pendência crítica ainda aberta**: rotacionar as chaves-demo do Supabase (`JWT_SECRET`/`anon`/`service_role`) — exige acesso à infraestrutura do Supabase self-hosted no EasyPanel, é do usuário executar. Ver seção "Pendências" mais abaixo.
4. **Última pendência do SPEC**: investimento em tráfego com origem vinculada/ROAS (reaproveitar `ad_costs`, decisão já tomada — ligar a uma `origem_id` e calcular ROAS por origem no dashboard). Perguntar ao usuário se quer encarar isso a seguir.

**Mistério resolvido numa sessão anterior**: por que as tabelas financeiras funcionavam com a auth custom mesmo com RLS escrito pra role `authenticated`? Porque elas têm uma policy extra pra role `anon` que nunca foi versionada em nenhuma migration (foi adicionada direto no Supabase Studio em algum momento antes desta sessão). As tabelas novas (`origens`, `produtos`, `afiliados`, `regras_utm`, `configuracoes`) só tinham a policy `authenticated`, copiada do padrão errado — por isso o botão de nova origem não funcionava. Migration `006_rls_anon_access.sql` alinha o comportamento. **Isso significa que, na prática, qualquer tabela do app aceita escrita da chave `anon` — que é a chave-demo pública (ver pendência crítica abaixo). O verdadeiro controle de acesso hoje é só de UI (`useIsAdmin`), não de banco.**

**Próxima fase do plano**: das pendências do SPEC, só resta o investimento em tráfego com ROAS — importação de CSV, motor de impostos e order bumps já estão implementados e confirmados em produção (ver parágrafos acima com data 27/10/2026).

**Gotchas operacionais importantes:**
- **O deploy no EasyPanel NÃO é automático.** Está conectado ao GitHub (`influlab/influlab-gestao`, branch `master`), mas precisa disparar manualmente a cada push. Isso já causou ~5 meses de defasagem entre código e produção (descoberto nesta sessão). **Sempre pedir confirmação de deploy depois de um `git push`, e verificar em produção antes de considerar uma etapa concluída** — não basta o código compilar/passar lint.
- **Como verificar algo em produção sem builds/UI**: ler `.env.local` manualmente (sem `dotenv`, que não está instalado) e consultar via `@supabase/supabase-js` com a `SUPABASE_SERVICE_ROLE_KEY`. Exemplo usado várias vezes nesta sessão:
  ```bash
  node -e '
  const fs = require("fs");
  const env = {};
  fs.readFileSync(".env.local", "utf8").split("\n").forEach(line => {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  });
  const { createClient } = require("@supabase/supabase-js");
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  supabase.from("webhook_logs").select("*").order("created_at", { ascending: false }).limit(5)
    .then(({ data, error }) => console.log(JSON.stringify(data ?? error, null, 2)));
  '
  ```
  Isso é leitura segura (service role, sem RLS) — útil para diagnosticar sem depender do Supabase Studio. **Nunca usar isso para inserir dados de teste em produção sem confirmar com o usuário antes** (o sandbox já bloqueou isso uma vez nesta sessão).
- **`npm run build --webpack` falha localmente** nesta máquina por falta do binário nativo `lightningcss.darwin-arm64.node` (dependência do Tailwind v4) — problema de ambiente, não do código. `npx tsc --noEmit` + `npx eslint` são a verificação disponível localmente; o build real só acontece no EasyPanel.
- **`node_modules` tem ~5 meses** (última atualização de dependências antes do início desta sessão) — se precisar mexer em dependências, considerar isso.

**Pendência crítica de segurança (ainda não resolvida — não é do usuário, é dele agir):** as chaves do Supabase (`NEXT_PUBLIC_SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY`) são as chaves-demo padrão do template oficial de self-host (`"iss": "supabase-demo"`), nunca rotacionadas. Ver detalhes na seção "Pendências" abaixo.

**Pendência de segurança menor:** o webhook da **Ticto** não tem nenhuma validação de assinatura/token consistente nem idempotência — mesmo risco que o Kiwify tinha antes desta sessão. Não corrigido ainda (fora do escopo pedido até agora).

---

## Stack Técnica

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 16.2.6 (App Router, RSC) — `middleware.ts` foi renomeado para **`src/proxy.ts`** nesta versão (breaking change real, não é erro) |
| UI | React 19 + TypeScript 5 strict |
| Estilo | Tailwind CSS v4 + shadcn/ui (style: "default") — primitivos em `src/components/ui/*`, mas a maioria das telas usa Tailwind puro diretamente, não os componentes shadcn |
| Banco | Supabase (PostgreSQL) — self-hosted no EasyPanel (`gestao-supabase.ommpuj.easypanel.host`) |
| Auth | **Autenticação própria** (não é Supabase Auth): tabela `app_users` (pbkdf2) + cookie HMAC (`src/lib/auth.ts`), validado em `src/proxy.ts`. Controle de acesso admin/member é só de UI (`useIsAdmin`), sem checagem equivalente no banco. |
| ORM | Nenhum — `supabase-js` direto, inclusive CRUD disparado do browser nos Client Components (não há Server Actions para isso) |
| Testes | Não existe nenhum framework de teste no projeto |
| Build | `next build --webpack` (Turbopack quebra por causa do `ã` no path) — ver gotcha acima sobre falha local |
| Deploy | Docker standalone, EasyPanel conectado ao GitHub — **deploy manual, não automático** (ver gotcha acima) |

**Arquivo de configuração-chave:** `next.config.ts` — output `standalone`, `outputFileTracingRoot`.

---

## Módulos / Páginas

| Rota | Tabela principal | Descrição |
|---|---|---|
| `/` | — | Dashboard com KPIs e gráficos |
| `/entradas` | `revenue_entries` | Receitas (manual + webhooks) |
| `/anuncios` | `ad_costs` | Gastos em anúncios |
| `/custos/fixos` | `fixed_costs` | Custos fixos mensais |
| `/custos/avulsos` | `variable_costs` | Custos pontuais |
| `/assinaturas` | `subscriptions` | Assinaturas recorrentes |
| `/prestadores` | `service_providers` | Prestadores de serviço |
| `/origens` | `origens` | Catálogo de origens de tráfego — editar nome, excluir (bloqueado se em uso) |
| `/produtos` | `produtos` | Mapeamento de origem padrão por produto (criados automaticamente pelo webhook) |
| `/regras-utm` | `regras_utm` | Regras de origem por UTM + botão "Reprocessar origens" |
| `/configuracoes` | — | Configurações |
| `/login` | — | Autenticação |

**Webhooks:** `POST /api/webhooks/kiwify` (assinatura validada, idempotente) e `POST /api/webhooks/ticto` (sem proteção ainda)

---

## Schema do Banco de Dados

### Tabelas com data pontual (filtro direto por período)

```sql
revenue_entries  — platform, gross_amount, net_amount, date (DATE), status, transaction_id
ad_costs         — platform, campaign_name, amount, date (DATE)
variable_costs   — description, amount, date (DATE), category, payment_method
```

### Tabelas de custos recorrentes (sem data por lançamento)

```sql
subscriptions (
  id, name, description, amount, billing_cycle, billing_day, category,
  active BOOLEAN,
  start_date DATE NOT NULL DEFAULT current_date,   -- adicionado na sessão
  end_date   DATE                                   -- adicionado na sessão
)

fixed_costs (
  id, name, description, amount, billing_day, category,
  active BOOLEAN,
  start_date DATE NOT NULL DEFAULT current_date,   -- adicionado na sessão
  end_date   DATE                                   -- adicionado na sessão
)

service_providers (
  id, name, service_type, email, phone, payment_amount, payment_frequency, notes,
  active BOOLEAN,
  start_date DATE NOT NULL DEFAULT current_date,   -- adicionado na sessão
  end_date   DATE                                   -- adicionado na sessão
)
```

**Migration já executada no Supabase Studio:**
```sql
alter table subscriptions     add column if not exists start_date date not null default current_date;
alter table subscriptions     add column if not exists end_date date;
alter table fixed_costs        add column if not exists start_date date not null default current_date;
alter table fixed_costs        add column if not exists end_date date;
alter table service_providers  add column if not exists start_date date not null default current_date;
alter table service_providers  add column if not exists end_date date;
```

**Tabelas novas da expansão Kiwify (ver seção "Expansão" abaixo para detalhes completos):** `webhook_logs`, `origens`, `produtos`, `afiliados`, `regras_utm`, `configuracoes`. Mais colunas novas em `revenue_entries`: `utm_source/medium/campaign/content/term`, `src`, `sck`, `affiliate_id`, `product_id`, `order_item_type`, `parent_order_id`, `origem_id`, `fonte`. Também há `unique (platform, transaction_id)` em `revenue_entries` (migration `004`).

---

## Regras de Negócio

### Dashboard — Filtro de Período

- A página `(app)/page.tsx` lê `searchParams` (`from` e `to`) da URL.
- Default: primeiro e último dia do mês atual (calculado server-side).
- O filtro é aplicado via botões preset no `DashboardFilter` que atualiza a URL com `router.push('/?from=...&to=...')`.
- Presets disponíveis: Este mês, Mês passado, Últimos 3 meses, Este ano.

### Custos Recorrentes — Regra `inPeriod`

Custos recorrentes (subscriptions, fixed_costs, service_providers) **não têm data por lançamento**, portanto são filtrados em JavaScript após fetch. O campo `active` é ignorado — visibilidade é controlada **apenas por datas**.

```js
const inPeriod = (row) => {
  const start = row.start_date ?? null
  const end   = row.end_date   ?? null
  if (start && start > to)   return false  // ainda não havia começado
  if (end   && end   < from) return false  // já havia terminado
  // billing_day: se end_date cai antes do vencimento desse mês, não inclui
  if (row.billing_day && end) {
    const [year, month] = from.split('-')
    const billingDate = `${year}-${month}-${String(row.billing_day).padStart(2, '0')}`
    if (end < billingDate) return false
  }
  return true
}
```

**Tabela de comportamento:**

| start_date | end_date | billing_day | Resultado |
|---|---|---|---|
| null | null | qualquer | Aparece em todos os meses |
| `<= fim do período` | null | qualquer | Aparece do início em diante |
| `<= fim do período` | `>= data vencimento do mês` | definido | Aparece (vencimento ainda ativo) |
| `<= fim do período` | `< data vencimento do mês` | definido | **Não aparece** (encerrou antes do vencimento) |
| `> fim do período` | qualquer | qualquer | Não aparece (ainda não começou) |
| qualquer | `< início do período` | qualquer | Não aparece (já encerrou antes do período) |

**Exemplo:** assinatura com `start_date=2026-05-05`, `billing_day=5`, `end_date=2026-06-04`
- Maio (from=2026-05-01): billingDate=2026-05-05, end(2026-06-04) >= billingDate → **aparece** ✓
- Junho (from=2026-06-01): billingDate=2026-06-05, end(2026-06-04) < billingDate → **não aparece** ✓

### Prestadores — Cálculo Proporcional

Se um prestador trabalhou apenas parte do período, o valor no dashboard é proporcional aos dias efetivos:

```js
const providerAmount = (row) => {
  const effectiveStart = max(row.start_date, from)
  const effectiveEnd   = min(row.end_date ?? to, to)
  const activeDays  = dias entre effectiveStart e effectiveEnd (inclusive)
  const periodDays  = dias do período from→to
  return activeDays >= periodDays ? payment_amount : payment_amount * activeDays / periodDays
}
```

**Exemplo:** prestador com `start_date=2026-06-01`, `end_date=2026-06-15`, `payment_amount=1500`
- activeDays = 15, periodDays = 30 → custo no dashboard = R$ 750,00

### Campo `active`

O campo `active` **não é mais usado** para filtrar no dashboard nem nas queries. Visibilidade é controlada **exclusivamente por `start_date`, `end_date` e `billing_day`**. Todos os inserts/updates enviam `active: true` para compatibilidade com a coluna no banco, mas esse valor é ignorado na lógica de negócio.

### Status nas páginas de lista (Assinaturas, Custos Fixos, Prestadores)

Badge derivado das datas:
- **Ativo** (verde) — `start_date <= hoje` e (`end_date` null ou `>= hoje`)
- **Encerrado** (cinza) — `end_date < hoje`
- **Agendado** (amarelo) — `start_date > hoje`

### Receita

- Apenas entradas com `status = 'approved'` entram no `totalRevenue`.
- Usa `net_amount` quando disponível, senão `gross_amount`.

### Prestadores — Billing Cycle

O `payment_frequency` dos prestadores (`monthly`, `weekly`, `biweekly`, `per_service`, `annual`) é informativo. No dashboard, o valor considerado é sempre o `payment_amount` cadastrado (valor mensal acordado).

### Assinaturas — Total Mensal (página /assinaturas)

O "Total mensal" exibido na página de Assinaturas considera apenas registros cujo período inclui hoje:

```js
data.filter(s =>
  s.active &&
  (!s.start_date || s.start_date <= todayStr) &&
  (!s.end_date   || s.end_date   >= todayStr)
)
```

Mesmo critério se aplica ao "Total mensal" em Custos Fixos.

---

## Arquitetura do Dashboard

```
(app)/page.tsx  ← Server Component, force-dynamic
  └─ lê searchParams (from, to)
  └─ queries Supabase server-side
  └─ aplica inPeriod em JS para custos recorrentes
  └─ passa props para DashboardClient (Client Component)

(app)/_components/dashboard-filter.tsx  ← Client Component
  └─ calcula datas dos presets no browser
  └─ usa router.push() para atualizar URL

(app)/_components/dashboard-client.tsx  ← Client Component
  └─ recebe totais prontos via props
  └─ renderiza KPI cards, gráficos (recharts)
```

**Importante:** O `DashboardClient` recebe todos os totais calculados — **nunca** faz queries diretas ao banco.

---

## Bugs Corrigidos Nesta Sessão

1. **Filtro de mês ignorado** — `page.tsx` usava `new Date()` hardcoded, ignorando os `searchParams` da URL. Corrigido para ler `params.from` e `params.to`.

2. **Custos recorrentes sem data de início/fim** — `subscriptions`, `fixed_costs` e `service_providers` apareciam em todos os meses históricos. Corrigido adicionando `start_date`/`end_date` e a função `inPeriod`.

3. **Props faltando no DashboardClient** — `page.tsx` não passava `from`, `to`, `totalVariable`, `totalSubscriptions`, `totalFixed`, `totalProviders`. Corrigido.

4. **Prestadores não contabilizados** — `service_providers` nunca era consultado no dashboard. Corrigido.

5. **Total mensal nas páginas individuais** — Assinaturas e Custos Fixos somavam todos os registros `active=true` sem checar `start_date`/`end_date`. Corrigido.

---

## Pendências / Próximos Passos

- Testar o dashboard após restart do servidor (cache `.next` foi deletado).
- Atualizar manualmente os `start_date` dos registros existentes no Supabase Studio para as datas de início reais (os registros criados antes da migration receberam `current_date` como default).
- Avaliar se o campo `active` deve ser setado automaticamente para `false` quando `end_date < today`.
- **CRÍTICO — rotacionar o JWT secret do Supabase self-hosted.** As chaves em `.env.local` (`NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`) decodificam para `"iss": "supabase-demo"` — são as chaves de exemplo publicadas na documentação oficial de self-host do Supabase, nunca rotacionadas para esta instância. Qualquer pessoa que conheça o `JWT_SECRET` padrão do template pode forjar um token válido (inclusive `service_role`, que ignora RLS) para este banco. Agora que confirmamos que a chave `anon` sozinha já tem escrita liberada em **todas** as tabelas (ver "Auth custom vs. RLS" na seção Expansão), isso fica ainda mais sensível — rotacionar o `JWT_SECRET`, gerar novas chaves `anon`/`service_role` e atualizar `.env.local` + ambiente do EasyPanel. **Ainda não resolvido.**

---

## Expansão — Dashboard Kiwify Avançado (em andamento)

Baseado em `dashboard-kiwify-spec.md` (roteiro originalmente escrito para um projeto novo com Drizzle/centavos — adaptado à stack e ao banco já existentes, sem recriar nada do zero).

### Decisões tomadas

- **Valores monetários continuam em reais (`numeric(12,2)`)** — não migrar para centavos. Risco de mudança de tipo em colunas com dados reais não compensa.
- **Base do imposto = faturamento bruto aprovado** do período (padrão do SPEC).
- **Data de referência da venda = data de aprovação** (`approved_date`), como já é hoje.
- **Pix/boleto pendente continua sendo ignorado** até aprovar (só `status = 'approved'` entra nos totais).
- **Importação de histórico será só CSV** (sem adicionar dependência de `.xlsx`/SheetJS).
- **Investimento em tráfego reaproveita a tabela `ad_costs`** existente (ganha coluna de origem vinculada depois), em vez de criar `investimentos_trafego` paralela.
- **Auth custom vs. RLS do Supabase — diagnosticado e resolvido**: o app usa autenticação própria (cookie HMAC, tabela `app_users`), não Supabase Auth, então o browser sempre fala com o banco como role `anon`, nunca `authenticated`. As tabelas originais (`fixed_costs`, `subscriptions` etc.) têm uma policy extra pra `anon` que nunca foi versionada em nenhuma migration (adicionada direto no Studio antes desta sessão) — por isso "funcionavam". As tabelas novas só tinham a policy `authenticated`, copiada do padrão errado, e por isso o botão de nova origem (e qualquer escrita em `produtos`/`regras_utm`/`afiliados`/`configuracoes` pelo navegador) falhava com `new row violates row-level security policy`. Corrigido na migration `006_rls_anon_access.sql`, rodada e confirmada em produção em 26/10/2026. **Conclusão prática: hoje não existe controle de acesso de verdade no banco — qualquer tabela aceita escrita da chave `anon`, que é pública e é a chave-demo padrão (ver pendência crítica). O único controle de acesso é de UI (`useIsAdmin`).** Resolver isso de verdade (ex.: mover escritas sensíveis para rotas de API server-side que checam o cookie) é uma refatoração maior, ainda não priorizada.

### Webhook Kiwify — mecanismo de assinatura confirmado

A Kiwify assina o webhook via **HMAC-SHA1 do corpo bruto da requisição**, usando o token configurado no painel (mesmo valor de `KIWIFY_WEBHOOK_SECRET`), enviado no parâmetro **`?signature=`** da URL (não é header, não é campo dentro do JSON). O corpo continua sendo `{"order": {...}}` — confirmado com um payload real de venda aprovada.

Estrutura real do `Commissions` (payload de produção, venda com afiliado + coprodutor):

```json
"Commissions": {
  "charge_amount": 8675,
  "kiwify_fee": 244,
  "my_commission": 3272,
  "commissioned_stores": [
    { "type": "affiliate", "value": "3373" },
    { "type": "coproducer", "value": "101" },
    { "type": "producer", "value": "3272" }
  ]
}
```

`my_commission` já é o valor líquido que cabe à conta dona da integração (bate com a entrada `commissioned_stores` do tipo correspondente) — não precisa recalcular. Order bump ainda não foi observado em nenhum payload real; o parser será ajustado quando aparecer um.

### `webhook_logs` (nova tabela, migration `003_webhook_logs.sql`)

Grava **todo** payload recebido nos webhooks (Kiwify/Ticto), antes de qualquer processamento — inclusive tentativas com assinatura inválida. Migration já rodada em produção.

```sql
webhook_logs (
  id, source ('kiwify' | 'ticto'), payload jsonb, headers jsonb,
  signature_valid boolean, processed boolean, error text, created_at
)
```

### Etapa 0 — concluída e validada em produção

`src/app/api/webhooks/kiwify/route.ts` valida `?signature=` (HMAC-SHA1 do corpo bruto com `KIWIFY_WEBHOOK_SECRET`), grava em `webhook_logs` em qualquer cenário, e faz upsert por `transaction_id` (idempotência). Validado com reenvios reais da Kiwify em produção em 26/10/2026.

**Bug crítico encontrado e corrigido**: o payload da Kiwify **não** tem um campo `order` envolvendo tudo — `order_id`, `Product`, `Customer`, `Commissions`, `order_status`, `webhook_event_type` etc. ficam na **raiz do JSON**. Essa suposição errada existia desde o commit original da integração (`317d0b0`, junho/2026) — ou seja, é muito provável que **nenhuma venda real da Kiwify tenha sido gravada automaticamente pelo webhook** até esta correção. Os registros antigos de `revenue_entries` com `platform='kiwify'`, `transaction_id` nulo e valores redondos de dezenas/centenas de milhares são lançamentos manuais de totais mensais, não vendas individuais.

**Trava de idempotência em duas camadas**: checagem no código (`select` antes de `insert`/`update`) + `unique (platform, transaction_id)` em `revenue_entries` (migration `004_revenue_entries_unique_transaction.sql`), para blindar contra requisições simultâneas do mesmo pedido.

**Pendência conhecida**: o webhook da **Ticto** não tem nenhuma dessas proteções (sem validação de assinatura/token consistente, sem idempotência) — ainda não corrigido, mesmo risco se duplicar.

### Etapa 1 — modelo de dados (migration `005_vendas_origem_afiliados.sql`)

Tabelas novas (todas com RLS `authenticated_full_access`, seguindo o padrão das existentes):

- `origens` — catálogo de origem de tráfego, com seed padrão (Meta Ads, TikTok Ads, Google Ads, Impulsionar Instagram, Impulsionar TikTok, Orgânico, Afiliados, Não identificado).
- `produtos` — `(platform, external_id)` único, nome, apelido, `default_origem_id` (mapeamento de origem padrão por produto).
- `afiliados` — `(platform, external_id)` único, nome, email.
- `regras_utm` — campo (`utm_source`/`utm_medium`/`utm_campaign`/`utm_content`/`utm_term`/`src`/`sck`), operador (`igual`/`contem`/`comeca_com`), valor, `origem_id`, `priority` (menor = mais prioridade).
- `configuracoes` — linha única editável: `aliquota_imposto_mensal` (padrão 3%), `aliquota_reserva_trimestral` (padrão 3%), `base_imposto` (padrão `bruto_aprovado`), taxa de gateway.

Colunas novas em `revenue_entries` (todas nullable ou com default, não quebram nada existente): `utm_source/medium/campaign/content/term`, `src`, `sck`, `affiliate_id`, `product_id`, `order_item_type` (`principal`/`orderbump`, default `principal`), `parent_order_id`, `origem_id`, `fonte` (`webhook`/`importacao`/`manual`, default `manual` — registros antigos ficam como `manual` por aproximação histórica).

### Etapa 2 — webhook conectado ao modelo novo

`src/app/api/webhooks/kiwify/route.ts` agora: captura `TrackingParameters` (UTM/`src`/`sck`) em `revenue_entries`; cria `produtos`/`afiliados` automaticamente via upsert em `(platform, external_id)` quando aparecem pela primeira vez (sem sobrescrever `default_origem_id`/`nickname`/`active` configurados manualmente depois); marca `fonte='webhook'`; e a idempotência passou a usar `upsert` de verdade via a constraint `unique (platform, transaction_id)` (sem mais select-then-insert manual).

Afiliado é identificado em `Commissions.commissioned_stores` pelo item com `type === 'affiliate'` (ignora `coproducer`/`producer`).

### Etapa 4 — telas, `calcularOrigem()` e reprocessamento

- `/produtos` e `/regras-utm`: CRUD completo (ver sidebar).
- `src/lib/origem.ts` — `calcularOrigemId()` (pura, testável) + `loadOrigemContext()`, implementando a prioridade do SPEC: regra de UTM mais específica → mapeamento por produto → afiliado sem regra ("Afiliados") → "Não identificado".
- O webhook Kiwify já calcula `origem_id` em toda venda nova.
- Botão **"Reprocessar origens"** em `/regras-utm`: recalcula `origem_id` de todo o histórico de `revenue_entries` e avisa quantas vendas mudaram.
- `src/components/origem-select.tsx` — select de origem reaproveitado em `/produtos` e `/regras-utm` com botão "+" para cadastrar uma origem nova sem precisar do Supabase Studio.

**Bug encontrado e corrigido durante os testes em produção**: a mesma URL do webhook também recebe eventos de **carrinho abandonado** da Kiwify (`status: "abandoned"`, sem `order_id`/`Commissions`, aparentemente sem a mesma assinatura das vendas) — estavam sendo rejeitados com 401 repetidamente e logados como "assinatura inválida". Agora esses eventos são identificados antes da checagem de assinatura (não têm `order_id`) e respondidos com 200 sem exigir assinatura, já que nunca viram `revenue_entries`. Vendas de verdade continuam exigindo assinatura válida.

**Bug encontrado e corrigido depois ("+" de nova origem não funcionava)**: as tabelas novas (`origens`, `produtos`, `afiliados`, `regras_utm`, `configuracoes`) só liberavam RLS pra role `authenticated`, mas o browser sempre fala com o banco como `anon` (ver "Auth custom vs. RLS" acima). Migration `006_rls_anon_access.sql` libera `anon` nessas tabelas, igualando ao comportamento (não documentado antes) das tabelas originais. **Rodada e confirmada em produção em 26/10/2026** (testado insert+delete com a chave `anon` nas 4 tabelas, sem erro de RLS).

**Segundo bug no mesmo botão, encontrado depois da migration 006**: mesmo com o RLS corrigido, o botão "Adicionar" de `OrigemSelect` continuava sem funcionar — mas dessa vez era um bug de CSS, não de banco. Diagnosticado com automação de navegador direto em produção: o input da linha "nova origem" tinha `flex-1` sem `min-w-0`, então o flexbox não deixava ele encolher abaixo da largura mínima intrínseca do navegador, empurrando o botão "Adicionar" pra fora da coluna "Origem" e pra dentro da área da coluna vizinha "Prioridade" (`grid-cols-2`) — que intercepta o clique silenciosamente por vir depois no DOM (sem erro no console, sem requisição de rede, clique nunca chegava no botão de verdade). Corrigido no commit `40c6e65` (`min-w-0` no input + `shrink-0` no botão). **Ainda precisa de deploy no EasyPanel** (é código do app, não SQL).

**Pedido do usuário depois da Etapa 4**: tela `/origens` com CRUD completo (até então só dava pra criar origem nova pelo "+" dentro de Produtos/Regras de UTM, não editar nome nem excluir). Implementado em `src/app/(app)/origens/`: mostra em quantos produtos/regras de UTM/vendas cada origem está em uso (3 queries agregadas no server component, sem FK constraint ao vivo) e bloqueia a exclusão com mensagem amigável quando em uso (`origem_id`/`default_origem_id` não têm `on delete cascade`, então o Postgres rejeitaria com erro de foreign key cru sem essa checagem). Commit `f48c0a8` — validado e confirmado em produção pelo próprio usuário (26/10/2026).

### Próxima fase — Importação de histórico via CSV

**Escolhida pelo usuário** como primeira pendência a encarar depois da Etapa 4 (entre order bumps, CSV, ROAS e motor de impostos). Implementada em `src/app/(app)/entradas/importar/` (`page.tsx` + `_components/importar-client.tsx`), com botão "Importar CSV" ao lado de "Entrada manual" na tela `/entradas`.

- **Parser CSV próprio** em `src/lib/csv.ts` — RFC4180 (aspas, vírgula dentro de campo, `""` escapada, CRLF/LF). Decisão deliberada de não adicionar `papaparse`/nenhuma dependência nova: o `node_modules` já está ~5 meses desatualizado (ver gotcha no topo do arquivo) e um parser de ~50 linhas cobre o caso de uso sem risco de mexer no lockfile.
- **Colunas do CSV**: `data`* (`AAAA-MM-DD` ou `DD/MM/AAAA`), `plataforma` (`kiwify`/`ticto`/`manual`/`other`, default `manual`), `produto`, `valor_bruto`*, `valor_liquido`, `cliente`, `email`, `status` (`approved`/`refunded`/`pending`/`cancelled`, default `approved`), `transaction_id`. `*` obrigatório. Botão "Baixar modelo CSV" gera um exemplo via `Blob`/download no navegador, sem round-trip ao servidor.
- **Validação por linha antes de gravar**: cada linha é parseada e mostrada numa tabela de preview com erro inline (data inválida, `valor_bruto` não numérico/≤0, `plataforma`/`status` fora do enum do banco — os `check` constraints de `platform`/`status`/`fonte` em `supabase/schema.sql` e `005_vendas_origem_afiliados.sql` são replicados no client pra não estourar erro cru do Postgres). Só as linhas sem erro ficam disponíveis pro botão de importar; linhas com erro continuam visíveis na tabela, marcadas em vermelho, pra o usuário corrigir o CSV e reimportar.
- **Origem**: um único `OrigemSelect` (reaproveitado de `/produtos`/`/regras-utm`) aplica a mesma `origem_id` a todas as linhas do lote — decisão deliberada de não rodar `calcularOrigemId()`/UTM por linha, já que vendas históricas de CSV não têm dados de tracking (regra do SPEC pra origem é sobre tráfego pago, não aplicável aqui).
- **Idempotência**: grava com `fonte: 'importacao'` e `.upsert(chunk, { onConflict: 'platform,transaction_id' })` (mesmo padrão do webhook Kiwify, `src/app/api/webhooks/kiwify/route.ts`), em lotes de 200 linhas. Linhas sem `transaction_id` no CSV **não são protegidas contra duplicata** — isso é esperado (Postgres trata `NULL` como distinto de `NULL` numa unique constraint) e está avisado no texto de ajuda da própria tela. Linhas com `transaction_id` preenchido podem ser reimportadas com segurança.
- **Gate de acesso**: página inteira (não só os botões) escondida atrás de `useIsAdmin()` — é a primeira tela do projeto a fazer esse gate no nível da página inteira em vez de só esconder botões de escrita, porque é uma feature 100% de escrita em lote (sem nada pra um membro não-admin ver).
- Commit `791cedc`, empurrado pro GitHub. **Ainda não deployado/testado em produção** — só `tsc --noEmit`/`eslint` localmente + testes unitários manuais (via `node -e`) das funções puras de parsing (`parseCSV`, `parseNumber`, `parseDate`), cobrindo: CSV com vírgula dentro de campo entre aspas, número formato BR (`1.234,56`) vs. US, data `31/02` e mês `13` inválidos, campos vazios. **Não foi possível testar a tela em si num navegador**: a sessão que construiu não tinha credencial de login (nem local nem produção), e escrever dado de teste em produção exige aprovação explícita do usuário a cada vez (igual ao fluxo já usado pra `/origens`).

**Pendências que ainda restam do SPEC**: ver "Próxima fase do plano" na seção "Status atual" no topo do arquivo — só falta investimento em tráfego/ROAS.

---

## Como Rodar Localmente

```bash
cd "influlab-gestao"
npm install         # só na primeira vez
npm run dev         # inicia em http://localhost:3000
```

**Build de produção:**
```bash
npm run build --webpack   # obrigatório --webpack por causa do path com ã
npm run start
```

**Variáveis de ambiente (.env.local):**
```
NEXT_PUBLIC_SUPABASE_URL=https://gestao-supabase.ommpuj.easypanel.host
NEXT_PUBLIC_SUPABASE_ANON_KEY=...   (chave-demo padrão — ver pendência crítica no topo do arquivo)
SUPABASE_SERVICE_ROLE_KEY=...        (idem)
NEXT_PUBLIC_APP_URL=https://gestao-gestao.ommpuj.easypanel.host
KIWIFY_WEBHOOK_SECRET=...   (token configurado no painel de webhooks da Kiwify, não um valor inventado)
TICTO_WEBHOOK_TOKEN=...
```

Essas mesmas variáveis (principalmente `KIWIFY_WEBHOOK_SECRET`) também precisam estar corretas no ambiente do serviço no EasyPanel — não só no `.env.local` local.

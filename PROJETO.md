# InfluLAB Gestão — Contexto do Projeto

## Visão Geral

Dashboard financeiro da InfluencersLAB para gestão de receitas, custos e lucro. Integra automaticamente vendas via webhooks (Kiwify e Ticto) e permite lançamentos manuais.

---

## 🧭 Status atual (ler isto primeiro numa sessão nova)

**Onde paramos:** terminamos a Etapa 4 do plano de expansão do SPEC (`dashboard-kiwify-spec.md`) — webhook Kiwify validando assinatura, com idempotência, capturando UTM/produto/afiliado e calculando `origem_id`; telas `/produtos` e `/regras-utm` no ar; mistério da RLS/auth custom resolvido (ver abaixo).

**Pendente de confirmação, primeira coisa a fazer numa sessão nova:**
1. **Rodar `006_rls_anon_access.sql` no Supabase Studio** (não precisa de deploy do app, é só SQL) — sem isso, os formulários de `/produtos` e `/regras-utm` (inclusive o botão "+" de nova origem) continuam dando `new row violates row-level security policy` no navegador.
2. Depois disso, pedir um reenvio de webhook (ou esperar uma venda real) e conferir `webhook_logs`/`revenue_entries` pra confirmar que `origem_id` está sendo calculado e que o evento de carrinho abandonado não gera mais erro de assinatura (último deploy confirmado foi o commit `875e538`; os commits depois dele — `6e3cba8`, a migration de RLS — não precisam de deploy do app).

**Mistério resolvido nesta sessão**: por que as tabelas financeiras funcionavam com a auth custom mesmo com RLS escrito pra role `authenticated`? Porque elas têm uma policy extra pra role `anon` que nunca foi versionada em nenhuma migration (foi adicionada direto no Supabase Studio em algum momento antes desta sessão). As tabelas novas (`origens`, `produtos`, `afiliados`, `regras_utm`, `configuracoes`) só tinham a policy `authenticated`, copiada do padrão errado — por isso o botão de nova origem não funcionava. Migration `006_rls_anon_access.sql` alinha o comportamento. **Isso significa que, na prática, qualquer tabela do app aceita escrita da chave `anon` — que é a chave-demo pública (ver pendência crítica abaixo). O verdadeiro controle de acesso hoje é só de UI (`useIsAdmin`), não de banco.**

**Próxima etapa do plano** (ver seção "Expansão" abaixo para o plano completo): order bumps (falta payload real de exemplo), importação de histórico (CSV), investimento em tráfego com origem vinculada/ROAS, e o motor de impostos mensal (3%) + reserva trimestral (3%) no dashboard (hoje ainda usa um `0.06` fixo hardcoded em `(app)/page.tsx`).

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
- Rodar a migration `006_rls_anon_access.sql` no Supabase Studio (corrige o botão de nova origem e qualquer escrita em `produtos`/`regras_utm`/`afiliados`/`configuracoes` pelo navegador — ver "Status atual" no topo do arquivo).

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
- **Auth custom vs. RLS do Supabase — diagnosticado e resolvido**: o app usa autenticação própria (cookie HMAC, tabela `app_users`), não Supabase Auth, então o browser sempre fala com o banco como role `anon`, nunca `authenticated`. As tabelas originais (`fixed_costs`, `subscriptions` etc.) têm uma policy extra pra `anon` que nunca foi versionada em nenhuma migration (adicionada direto no Studio antes desta sessão) — por isso "funcionavam". As tabelas novas só tinham a policy `authenticated`, copiada do padrão errado, e por isso o botão de nova origem (e qualquer escrita em `produtos`/`regras_utm`/`afiliados`/`configuracoes` pelo navegador) falhava com `new row violates row-level security policy`. Corrigido na migration `006_rls_anon_access.sql`. **Conclusão prática: hoje não existe controle de acesso de verdade no banco — qualquer tabela aceita escrita da chave `anon`, que é pública e é a chave-demo padrão (ver pendência crítica). O único controle de acesso é de UI (`useIsAdmin`).** Resolver isso de verdade (ex.: mover escritas sensíveis para rotas de API server-side que checam o cookie) é uma refatoração maior, ainda não priorizada.

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

**Bug encontrado e corrigido depois ("+" de nova origem não funcionava)**: as tabelas novas (`origens`, `produtos`, `afiliados`, `regras_utm`, `configuracoes`) só liberavam RLS pra role `authenticated`, mas o browser sempre fala com o banco como `anon` (ver "Auth custom vs. RLS" acima). Migration `006_rls_anon_access.sql` libera `anon` nessas tabelas, igualando ao comportamento (não documentado antes) das tabelas originais. **Precisa ser rodada no Supabase Studio** — não depende de deploy do app, é só SQL.

**Pendências que ainda restam do SPEC**: order bumps (falta um payload real de exemplo), importação de histórico (CSV), investimento em tráfego com origem vinculada/ROAS, e os cards de imposto mensal/trimestral no dashboard (hoje o dashboard ainda usa o `0.06` fixo antigo — `lib/metricas.ts` da Etapa 5 do plano original ainda não foi feito).

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

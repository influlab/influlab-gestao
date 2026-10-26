# InfluLAB Gestão — Contexto do Projeto

## Visão Geral

Dashboard financeiro da InfluencersLAB para gestão de receitas, custos e lucro. Integra automaticamente vendas via webhooks (Kiwify e Ticto) e permite lançamentos manuais.

---

## Stack Técnica

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 16.2.6 (App Router, RSC) |
| UI | React 19 + TypeScript 5 strict |
| Estilo | Tailwind CSS v4 + shadcn/ui (style: "default") |
| Banco | Supabase (PostgreSQL) — self-hosted na VPS |
| Auth | Supabase SSR (`@supabase/ssr`) com cookies |
| Build | `next build --webpack` (Turbopack quebra por causa do `ã` no path) |
| Deploy | Docker standalone, VPS `89.116.186.109:3000` |

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
| `/configuracoes` | — | Configurações |
| `/login` | — | Autenticação |

**Webhooks:** `POST /api/webhooks/kiwify` e `POST /api/webhooks/ticto`

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
- **CRÍTICO — rotacionar o JWT secret do Supabase self-hosted.** As chaves em `.env.local` (`NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`) decodificam para `"iss": "supabase-demo"` — são as chaves de exemplo publicadas na documentação oficial de self-host do Supabase, nunca rotacionadas para esta instância. Qualquer pessoa que conheça o `JWT_SECRET` padrão do template pode forjar um token `service_role` válido para este banco e ler/escrever em qualquer tabela ignorando RLS. Precisa gerar um `JWT_SECRET` novo no servidor, gerar novas chaves `anon`/`service_role` a partir dele e atualizar `.env.local` e o ambiente do EasyPanel.
- Rodar a migration `003_webhook_logs.sql` no Supabase Studio (ver seção abaixo).
- Fazer uma compra/reembolso de teste na Kiwify para validar o fluxo completo do webhook com a assinatura reativada (não foi testado contra o banco de produção nesta sessão, só a rejeição de assinatura inválida/ausente).

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
- **Auth custom vs. RLS do Supabase**: o app usa autenticação própria (cookie HMAC, tabela `app_users`), não Supabase Auth — mas as policies RLS liberam tudo para a role `authenticated` do Supabase Auth, que o app nunca autentica no browser. Como as chaves são as chaves-demo padrão (ver pendência crítica acima), isso ainda não foi diagnosticado a fundo; vira uma etapa própria de diagnóstico antes de criar tabelas novas sensíveis (regras de UTM, configuração de imposto).

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

Grava **todo** payload recebido nos webhooks (Kiwify/Ticto), antes de qualquer processamento — inclusive tentativas com assinatura inválida. Rodar a migration no Supabase Studio (SQL Editor), igual às anteriores.

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

**Ainda não implementado** (fica para a Etapa 4, que inclui as telas): `origem_id` continua null — depende de `calcularOrigem()` e de regras em `regras_utm`, que hoje está vazia. Mapeamento de origem por produto (`/produtos`) e CRUD de regras de UTM (`/regras-utm`) ainda não existem como tela — hoje só dá pra ver essas tabelas no Supabase Studio.

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
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_APP_URL=http://89.116.186.109:3000
KIWIFY_WEBHOOK_SECRET=influlab-kiwify-secret-2024
TICTO_WEBHOOK_TOKEN=influlab-ticto-token-2024
```

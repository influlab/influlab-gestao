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

# Dashboard Financeiro Kiwify — Especificação + Roteiro para Claude Code

## Como usar este arquivo

1. Crie uma pasta vazia (ex.: `dashboard-kiwify`), abra o terminal nela e rode `claude`.
2. Salve este arquivo na raiz da pasta como `SPEC.md`.
3. Cole o **Prompt 0** abaixo. Depois cole os prompts das fases **um por vez**, só avançando quando a fase anterior estiver testada.
4. Antes de cada fase, peça `/plan` (ou "planeje antes de codar") se quiser revisar o plano primeiro.

> Dica: depois do Prompt 0, o Claude Code vai gerar um `CLAUDE.md`. Ele é a "memória" do projeto — se algo mudar (ex.: alíquota), atualize lá.

---

## Stack recomendada

| Camada | Escolha | Por quê |
|---|---|---|
| Frontend + API | **Next.js 15 (App Router) + TypeScript** | Webhook e dashboard no mesmo projeto |
| Banco + Auth | **Supabase (Postgres)** — sua instância self-hosted | Você já usa; RLS + login prontos |
| ORM / queries | **Drizzle ORM** (ou supabase-js) | Tipagem e migrations versionadas |
| UI | **Tailwind + shadcn/ui + Recharts** | Tabelas, filtros e gráficos rápidos |
| Upload de planilha | **SheetJS (xlsx) + Papaparse** | Lê .xlsx e .csv da Kiwify |
| Datas | **date-fns + date-fns-tz** (fuso `America/Sao_Paulo`) | "Hoje/Ontem" corretos |
| Deploy | **Docker → Coolify ou Easypanel** | HTTPS público para o webhook |

---

## Regras de negócio (o coração do sistema)

### Valores de cada venda
Guardar sempre, por item de pedido:
- `valor_bruto` — o que o cliente pagou
- `taxa_gateway` — taxa Kiwify (hoje 3,49% + R$ 2,49 por venda aprovada; **configurável**)
- `comissao_afiliado` — valor pago ao afiliado (vem no payload; não recalcular)
- `valor_liquido_produtor` — o que sobra para você
- `status` — `paid`, `refunded`, `chargedback`, `waiting_payment`, `refused`

**Venda válida** = status `paid`. Reembolso e chargeback **saem** do faturamento na data do evento (e aparecem como linha própria no dashboard).

### Impostos (6% total, separados em duas linhas)
Base de cálculo: **faturamento bruto aprovado** do período (menos reembolsos/chargebacks). Base e alíquotas devem ficar em uma tabela `configuracoes`, editável na tela.

1. **Imposto mensal — 3%**: 3% sobre o faturamento do próprio mês. Mostrado no período selecionado.
2. **Reserva imposto trimestral — 3%**: 3% sobre o faturamento de cada mês vai para a "reserva". O pagamento acontece no **primeiro mês do trimestre seguinte**, somando os 3 meses do trimestre anterior:
   - Jan → paga Out+Nov+Dez (ano anterior)
   - Abr → paga Jan+Fev+Mar
   - Jul → paga Abr+Mai+Jun
   - **Out → paga Jul+Ago+Set**

No dashboard, mostrar:
- Imposto mensal do período
- Reserva provisionada no período (3% do faturamento selecionado)
- Card "Trimestral a pagar neste mês" (quando o mês atual for Jan/Abr/Jul/Out) com o valor e os 3 meses de origem
- Card "Reserva acumulada do trimestre corrente" (ex.: em novembro, mostra 3% de Out+Nov até agora)

### Lucro do período
```
Lucro = Líquido do produtor
      − Imposto mensal (3%)
      − Reserva trimestral (3%)
      − Investimento em tráfego/impulsionar
      − Custos variáveis do período
      − Custos fixos proporcionais ao período
```
Custo fixo mensal proporcional = valor mensal × (dias do período ÷ dias do mês). Para "Esse mês" e "Mês anterior", usar o valor cheio.

### Origem do tráfego (prioridade)
1. **Mapeamento por UTM** (regra mais específica vence) — ex.: `utm_source=fb` → "Meta Ads"
2. **Mapeamento por produto** — ex.: produto "LAB IA - Checkout TikTok" → "TikTok Orgânico"
3. Se for venda de afiliado sem regra → "Afiliados"
4. Senão → "Não identificado"

Regras de UTM aceitam: campo (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `src`, `sck`), operador (`igual`, `contém`, `começa com`) e valor. Ordem de prioridade editável. **Ao mudar uma regra, reclassificar o histórico** (botão "Reprocessar origens").

---

## Modelo de dados (tabelas)

- `pedidos` — order_id Kiwify (único), data de aprovação, status, método de pagamento, cliente (nome/email/telefone), UTMs + src/sck, origem_calculada, afiliado_id, payload bruto (`jsonb`), fonte (`webhook` | `importacao`)
- `pedido_itens` — pedido_id, produto_id, tipo (`principal` | `orderbump`), valores (bruto, taxa, comissão, líquido)
- `produtos` — id Kiwify, nome, apelido, origem padrão (mapeamento), ativo
- `afiliados` — id/email Kiwify, nome
- `regras_utm` — campo, operador, valor, origem, prioridade
- `origens` — lista de origens (Meta Ads, TikTok Ads, Google, Orgânico, Afiliados…)
- `custos_fixos` — descrição, categoria, valor mensal, início, fim (opcional)
- `custos_variaveis` — descrição, categoria, data, valor (ou % do faturamento)
- `investimentos_trafego` — data, plataforma (Meta, TikTok, Google, Impulsionar Instagram/TikTok…), origem vinculada, campanha (opcional), valor
- `configuracoes` — alíquotas, base do imposto, taxa do gateway, token do webhook
- `webhook_logs` — payload bruto, headers, assinatura válida?, processado?, erro
- `importacoes` — arquivo, data, linhas lidas/inseridas/atualizadas/ignoradas

Valores monetários em **centavos (integer)** para não ter erro de arredondamento.

---

## Telas

1. **Login** (Supabase Auth, só você e quem você convidar)
2. **Dashboard**
   - Filtro de período: Hoje · Ontem · 7 dias · Esse mês · Mês anterior · Personalizado
   - Filtros extras: produto, origem, afiliado
   - Cards: Faturamento bruto · Líquido · Nº vendas · Ticket médio · Investimento tráfego · ROAS · Imposto mensal · Reserva trimestral · Custos · **Lucro**
   - Card do trimestral a pagar (quando aplicável)
   - Gráfico de faturamento × investimento por dia
   - Tabela **Vendas por produto mapeado**
   - Tabela **Order bumps** (produto, qtd, faturamento, taxa de conversão = bumps ÷ pedidos do produto principal)
   - Tabela **Vendas por afiliado** (vendas, faturamento, comissão paga)
   - Tabela **Vendas por origem / UTM** (com ROAS por origem quando houver investimento vinculado)
   - Reembolsos e chargebacks do período
3. **Vendas** — lista pesquisável com detalhe do pedido (inclui payload bruto)
4. **Produtos** — mapear origem e marcar apelidos
5. **Regras de UTM** — CRUD + botão "Reprocessar origens"
6. **Custos fixos** / **Custos variáveis** / **Investimento em tráfego** — CRUDs com lançamento rápido
7. **Importar histórico** — upload, prévia, mapeamento de colunas, relatório final
8. **Configurações** — alíquotas, taxa gateway, URL e token do webhook, logs do webhook

---

## Roteiro de prompts para o Claude Code

### Prompt 0 — Contexto e setup
```
Leia o SPEC.md inteiro. Vamos construir esse dashboard em fases.
Crie um CLAUDE.md resumindo stack, regras de negócio (impostos, origem de tráfego,
lucro), convenções (valores em centavos, fuso America/Sao_Paulo, TypeScript estrito)
e a lista de fases. Depois crie o projeto Next.js 15 + TypeScript + Tailwind + shadcn/ui,
configure Drizzle apontando para meu Supabase via DATABASE_URL e crie um .env.example.
Não implemente features ainda. Me mostre a estrutura de pastas ao final.
```

### Prompt 1 — Banco de dados
```
Implemente o modelo de dados do SPEC.md com Drizzle: schema, migrations e seed com
as origens padrão (Meta Ads, TikTok Ads, Google Ads, Impulsionar Instagram,
Impulsionar TikTok, Orgânico, Afiliados, Não identificado) e configurações padrão
(imposto mensal 3%, reserva trimestral 3%, taxa gateway 3,49% + R$ 2,49).
Ative RLS permitindo acesso só a usuários autenticados. Rode a migration e confirme.
```

### Prompt 2 — Webhook da Kiwify
```
Crie a rota POST /api/webhooks/kiwify.
1. Salve SEMPRE o payload bruto em webhook_logs antes de qualquer processamento.
2. Valide a assinatura: a Kiwify envia ?signature= na URL, que é HMAC-SHA1 do corpo
   bruto usando o token do webhook. Confirme isso na documentação oficial da Kiwify
   antes de implementar. Se inválida, registre e responda 401.
3. Faça upsert idempotente por order_id (o mesmo pedido pode chegar várias vezes com
   status diferentes: aprovado, reembolsado, chargeback).
4. Extraia: produto, cliente, Commissions (valor cobrado, taxa Kiwify, comissão do
   afiliado, líquido do produtor), TrackingParameters (utm_*, src, sck), afiliado.
5. Order bumps: descubra no payload como eles aparecem (item extra no mesmo pedido
   ou webhook separado com referência ao pedido pai) e trate os dois casos,
   gravando em pedido_itens com tipo 'orderbump'.
6. Crie produtos e afiliados automaticamente quando não existirem.
7. Calcule origem_calculada segundo a prioridade do SPEC.
8. Responda 200 rápido. Erros de processamento ficam no log, não derrubam a resposta.
Crie testes com 3 payloads de exemplo (venda direta, venda com bump, venda de afiliado,
reembolso) e um script para eu disparar um payload de teste localmente.
```
> Ao terminar, cadastre a URL na Kiwify (Apps → Webhooks), escolha os eventos (compra aprovada, reembolso, chargeback, etc.) e faça uma compra teste. Copie um payload **real** do `webhook_logs` e peça: *"ajuste o parser com base neste payload real"*.

### Prompt 3 — Importação do histórico
```
Crie a tela Importar histórico que aceita o relatório de vendas exportado da Kiwify
(.xlsx ou .csv). Fluxo: upload → leitura no servidor → prévia das 20 primeiras linhas
→ mapeamento de colunas (com sugestão automática pelos nomes das colunas) → confirmação.
Regras: upsert por ID do pedido (se o webhook já trouxe o pedido, não duplicar —
manter os dados do webhook e só completar campos vazios); converter datas para
America/Sao_Paulo; valores BR ("1.234,56") para centavos; identificar order bumps
e afiliados pelas colunas disponíveis; fonte = 'importacao'. Processe em lotes de 500.
Ao final mostre o relatório: lidas, inseridas, atualizadas, ignoradas (com motivo).
Salve o mapeamento de colunas para reutilizar na próxima importação.
```
> Exporte o relatório em Kiwify → Vendas → Exportar e envie um arquivo com poucas linhas ao Claude Code para ele ver as colunas reais: *"aqui está um exemplo real do relatório, ajuste o importador"*.

### Prompt 4 — Mapeamentos (produtos e UTM)
```
Crie as telas Produtos e Regras de UTM conforme o SPEC. Regras de UTM com campo,
operador (igual/contém/começa com, sem diferenciar maiúsculas), valor, origem e
prioridade arrastável. Crie a função única calcularOrigem(pedido) usada pelo webhook,
pela importação e pelo botão "Reprocessar origens" (que recalcula todo o histórico
e mostra quantos pedidos mudaram de origem). Escreva testes para a prioridade.
```

### Prompt 5 — Custos e investimentos
```
Crie as telas Custos fixos, Custos variáveis e Investimento em tráfego (CRUD com
tabela, edição inline e formulário rápido). Investimento tem plataforma e origem
vinculada para calcular ROAS por origem. Adicione importação de investimento via CSV
(data, plataforma, campanha, valor) para eu subir gastos exportados do Gerenciador.
```

### Prompt 6 — Motor de cálculos
```
Crie um módulo lib/metricas.ts com funções puras e testadas:
- resolverPeriodo(preset | datas) no fuso America/Sao_Paulo
- faturamento, líquido, vendas, ticket médio, reembolsos
- custosFixosProporcionais(periodo)
- impostoMensal(periodo) e reservaTrimestral(periodo)
- trimestralAPagar(mes): se mês ∈ {jan, abr, jul, out}, soma 3% dos 3 meses do
  trimestre anterior (ex.: outubro = jul+ago+set)
- reservaAcumuladaTrimestreAtual(hoje)
- lucro(periodo) conforme fórmula do SPEC
- agrupamentos por produto, orderbump, afiliado, origem, UTM
Faça as agregações no Postgres (views ou SQL), não em JS. Testes cobrindo virada de
mês, virada de trimestre/ano e reembolso de venda feita em mês anterior.
```

### Prompt 7 — Dashboard
```
Crie a tela Dashboard do SPEC usando lib/metricas.ts: filtro de período com presets
e calendário, filtros por produto/origem/afiliado, cards, gráfico diário faturamento ×
investimento (Recharts), tabelas de produto, order bumps (com taxa de conversão),
afiliados, origem/UTM com ROAS e reembolsos. Cards de imposto separados (mensal 3% e
reserva 3%) + card "Trimestral a pagar este mês" com os meses de origem. Valores em
R$ formatados pt-BR. Layout responsivo (vou olhar no celular). Estados de carregando
e vazio.
```

### Prompt 8 — Deploy
```
Prepare o deploy: Dockerfile multi-stage para Next.js (output standalone),
healthcheck em /api/health, e um guia DEPLOY.md para Coolify/Easypanel com as
variáveis de ambiente necessárias. Garanta que a rota do webhook fica pública e
todo o resto exige login.
```

### Prompt 9 — Revisão final
```
Revise o projeto inteiro contra o SPEC.md e liste o que falta ou diverge.
Rode todos os testes. Verifique: idempotência do webhook, duplicidade entre webhook e
importação, cálculos de imposto no trimestre e se nenhuma rota além do webhook está
pública.
```

---

## Checklist de validação (faça você mesmo)

- [ ] Compra teste chega no webhook e aparece no dashboard em "Hoje"
- [ ] Reembolso do mesmo pedido atualiza o status (sem duplicar)
- [ ] Venda com order bump aparece separada na tabela de bumps
- [ ] Venda de afiliado mostra a comissão correta
- [ ] Importar o relatório antigo não duplica pedidos já recebidos pelo webhook
- [ ] Total de "Mês anterior" bate com o relatório da Kiwify do mesmo mês
- [ ] Em outubro, o card trimestral mostra 3% de jul+ago+set
- [ ] Mudar uma regra de UTM e reprocessar altera as origens antigas

## Pontos para decidir antes de começar

- **Base do imposto**: bruto aprovado (padrão aqui) ou líquido após taxa Kiwify? Confirme com seu contador.
- **Data de referência**: data da aprovação (padrão) ou data da liberação do saldo?
- **Boleto/Pix pendente**: ignorar até aprovar (padrão) ou mostrar como "a receber"?
- **Assinaturas/recorrência**: se tiver, cada cobrança conta como venda nova.

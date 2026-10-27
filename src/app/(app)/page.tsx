export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import {
  CONFIGURACOES_DEFAULT,
  baseImposto,
  isMesDeVencimentoTrimestral,
  periodoTrimestreAnterior,
  periodoTrimestreAtualParcial,
  somaAprovados,
  type Configuracoes,
} from '@/lib/impostos'
import { DashboardClient } from './_components/dashboard-client'

function getDefaultDates() {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  return {
    from: new Date(y, m, 1).toISOString().split('T')[0],
    to: new Date(y, m + 1, 0).toISOString().split('T')[0],
  }
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>
}) {
  const supabase = await createClient()
  const params = await searchParams
  const defaults = getDefaultDates()
  const from = params.from || defaults.from
  const to = params.to || defaults.to

  const hoje = new Date()
  const precisaTrimestralAPagar = isMesDeVencimentoTrimestral(hoje.getMonth())
  const trimestreAnteriorRange = periodoTrimestreAnterior(hoje)
  const trimestreAtualRange = periodoTrimestreAtualParcial(hoje)

  const [revenues, adCosts, variableCosts, subscriptions, fixedCosts, providers, configRes, trimestreAnteriorRes, trimestreAtualRes, produtosRes] = await Promise.all([
    supabase.from('revenue_entries').select('gross_amount, net_amount, date, platform, status, order_item_type, product_id').gte('date', from).lte('date', to),
    supabase.from('ad_costs').select('amount, date, platform').gte('date', from).lte('date', to),
    supabase.from('variable_costs').select('amount, date, category').gte('date', from).lte('date', to),
    supabase.from('subscriptions').select('*')
      .lte('start_date', to)
      .or(`end_date.is.null,end_date.gte.${from}`),
    supabase.from('fixed_costs').select('*')
      .lte('start_date', to)
      .or(`end_date.is.null,end_date.gte.${from}`),
    supabase.from('service_providers').select('*')
      .lte('start_date', to)
      .or(`end_date.is.null,end_date.gte.${from}`),
    supabase.from('configuracoes').select('aliquota_imposto_mensal, aliquota_reserva_trimestral, base_imposto').limit(1).maybeSingle(),
    precisaTrimestralAPagar
      ? supabase.from('revenue_entries').select('gross_amount, net_amount, status').gte('date', trimestreAnteriorRange.from).lte('date', trimestreAnteriorRange.to)
      : Promise.resolve({ data: [] as { gross_amount: number | null; net_amount: number | null; status: string }[] }),
    supabase.from('revenue_entries').select('gross_amount, net_amount, status').gte('date', trimestreAtualRange.from).lte('date', trimestreAtualRange.to),
    supabase.from('produtos').select('id, name, nickname'),
  ])

  const config: Configuracoes = configRes.data ?? CONFIGURACOES_DEFAULT

  const approvedRevenues = (revenues.data ?? []).filter(r => r.status === 'approved')
  const totalRevenue = approvedRevenues.reduce((s, r) => s + (r.net_amount ?? r.gross_amount), 0)
  const totalGrossRevenue = approvedRevenues.reduce((s, r) => s + (r.gross_amount ?? r.net_amount ?? 0), 0)

  // Order bumps: taxa de conversão = vendas do bump ÷ pedidos principais aprovados
  // no período. Sem parent_order_id de verdade (nunca veio um payload real com
  // order bump pra saber o vínculo exato), a taxa é relativa ao total de pedidos
  // principais do período, não a um produto principal específico.
  const produtoNomeById = new Map((produtosRes.data ?? []).map(p => [p.id, p.nickname || p.name]))
  const approvedPrincipalCount = approvedRevenues.filter(r => r.order_item_type === 'principal').length
  const orderBumpGroups = new Map<string, { count: number; revenue: number }>()
  for (const r of approvedRevenues) {
    if (r.order_item_type !== 'orderbump') continue
    const key = r.product_id ?? 'sem-produto'
    const g = orderBumpGroups.get(key) ?? { count: 0, revenue: 0 }
    g.count += 1
    g.revenue += r.net_amount ?? r.gross_amount ?? 0
    orderBumpGroups.set(key, g)
  }
  const orderBumpStats = Array.from(orderBumpGroups.entries())
    .map(([productId, g]) => ({
      productName: produtoNomeById.get(productId) ?? 'Produto não identificado',
      count: g.count,
      revenue: g.revenue,
      conversionRate: approvedPrincipalCount > 0 ? (g.count / approvedPrincipalCount) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)

  const totalAds = (adCosts.data ?? []).reduce((s, r) => s + r.amount, 0)
  const totalVariable = (variableCosts.data ?? []).reduce((s, r) => s + r.amount, 0)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inPeriod = (row: any) => {
    const start = row.start_date ? String(row.start_date).slice(0, 10) : null
    const end = row.end_date ? String(row.end_date).slice(0, 10) : null
    if (start && start > to) return false
    if (end && end < from) return false
    // Se tem billing_day, o custo só vale no mês se o end_date é >= ao dia de vencimento desse mês
    if (row.billing_day && end) {
      const [year, month] = from.split('-')
      const billingDate = `${year}-${month}-${String(row.billing_day).padStart(2, '0')}`
      if (end < billingDate) return false
    }
    return true
  }

  // Calcula valor proporcional do prestador conforme dias efetivos no período
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const providerAmount = (row: any) => {
    const amount = row.payment_amount ?? 0
    const start = row.start_date ? String(row.start_date).slice(0, 10) : from
    const end = row.end_date ? String(row.end_date).slice(0, 10) : to
    const effectiveStart = start > from ? start : from
    const effectiveEnd = end < to ? end : to
    const activeDays = (new Date(effectiveEnd).getTime() - new Date(effectiveStart).getTime()) / 86400000 + 1
    const periodDays = (new Date(to).getTime() - new Date(from).getTime()) / 86400000 + 1
    if (activeDays >= periodDays) return amount
    return Math.round(amount * activeDays / periodDays * 100) / 100
  }

  const totalSubscriptions = (subscriptions.data ?? []).filter(inPeriod).reduce((s: number, r: any) => s + r.amount, 0)
  const totalFixed = (fixedCosts.data ?? []).filter(inPeriod).reduce((s: number, r: any) => s + r.amount, 0)
  const totalProviders = (providers.data ?? []).filter(inPeriod).reduce((s: number, r: any) => s + providerAmount(r), 0)

  const baseImpostoPeriodo = baseImposto(config, totalGrossRevenue, totalRevenue)
  const impostoMensal = Math.round(baseImpostoPeriodo * config.aliquota_imposto_mensal / 100 * 100) / 100
  const reservaTrimestral = Math.round(baseImpostoPeriodo * config.aliquota_reserva_trimestral / 100 * 100) / 100
  const totalTax = impostoMensal + reservaTrimestral

  let trimestralAPagar: { value: number; meses: string } | null = null
  if (precisaTrimestralAPagar) {
    const s = somaAprovados(trimestreAnteriorRes.data ?? [])
    const base = baseImposto(config, s.gross, s.net)
    trimestralAPagar = {
      value: Math.round(base * config.aliquota_reserva_trimestral / 100 * 100) / 100,
      meses: trimestreAnteriorRange.meses,
    }
  }

  const sAtual = somaAprovados(trimestreAtualRes.data ?? [])
  const baseAtual = baseImposto(config, sAtual.gross, sAtual.net)
  const reservaAcumulada = {
    value: Math.round(baseAtual * config.aliquota_reserva_trimestral / 100 * 100) / 100,
    meses: trimestreAtualRange.meses,
  }

  const totalCosts = totalAds + totalVariable + totalSubscriptions + totalFixed + totalProviders + totalTax
  const profit = totalRevenue - totalCosts

  return (
    <DashboardClient
      from={from}
      to={to}
      totalRevenue={totalRevenue}
      totalCosts={totalCosts}
      totalAds={totalAds}
      totalVariable={totalVariable}
      totalSubscriptions={totalSubscriptions}
      totalFixed={totalFixed}
      totalProviders={totalProviders}
      impostoMensal={impostoMensal}
      reservaTrimestral={reservaTrimestral}
      aliquotaImpostoMensal={config.aliquota_imposto_mensal}
      aliquotaReservaTrimestral={config.aliquota_reserva_trimestral}
      trimestralAPagar={trimestralAPagar}
      reservaAcumulada={reservaAcumulada}
      orderBumpStats={orderBumpStats}
      profit={profit}
      revenueEntries={revenues.data ?? []}
      adCostEntries={adCosts.data ?? []}
    />
  )
}

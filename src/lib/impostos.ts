// Motor de impostos (dashboard-kiwify-spec.md, seção "Impostos (6% total, separados
// em duas linhas)"): imposto mensal (3% do faturamento do próprio período) + reserva
// trimestral (3% de cada mês, recolhida no 1º mês do trimestre seguinte somando os
// 3 meses do trimestre anterior: Jan paga Out+Nov+Dez, Abr paga Jan+Fev+Mar, etc.).

export type Configuracoes = {
  aliquota_imposto_mensal: number // percentual, ex.: 3.00 (não fração)
  aliquota_reserva_trimestral: number
  base_imposto: 'bruto_aprovado' | 'liquido'
}

export const CONFIGURACOES_DEFAULT: Configuracoes = {
  aliquota_imposto_mensal: 3,
  aliquota_reserva_trimestral: 3,
  base_imposto: 'bruto_aprovado',
}

const MESES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function ymd(d: Date): string {
  return d.toISOString().split('T')[0]
}

export function baseImposto(config: Configuracoes, grossRevenue: number, netRevenue: number): number {
  return config.base_imposto === 'liquido' ? netRevenue : grossRevenue
}

export function somaAprovados(rows: { gross_amount: number | null; net_amount: number | null; status: string }[]) {
  const approved = rows.filter((r) => r.status === 'approved')
  return {
    gross: approved.reduce((s, r) => s + (r.gross_amount ?? r.net_amount ?? 0), 0),
    net: approved.reduce((s, r) => s + (r.net_amount ?? r.gross_amount ?? 0), 0),
  }
}

// Meses em que vence o recolhimento do trimestre anterior: Jan, Abr, Jul, Out.
export function isMesDeVencimentoTrimestral(monthIndex0: number): boolean {
  return [0, 3, 6, 9].includes(monthIndex0)
}

// Os 3 meses do trimestre que vence neste mês (só faz sentido chamar quando
// isMesDeVencimentoTrimestral(hoje) for true).
export function periodoTrimestreAnterior(hoje: Date): { from: string; to: string; meses: string } {
  const year = hoje.getFullYear()
  const month = hoje.getMonth()
  const startMonth = month - 3
  const m1 = ((startMonth % 12) + 12) % 12
  const yearInicio = startMonth < 0 ? year - 1 : year
  const from = ymd(new Date(yearInicio, m1, 1))
  const to = ymd(new Date(yearInicio, m1 + 3, 0))
  const meses = [0, 1, 2].map((i) => MESES_PT[(m1 + i) % 12]).join('+')
  return { from, to, meses }
}

// Do início do trimestre corrente até hoje (reserva acumulada "em progresso").
export function periodoTrimestreAtualParcial(hoje: Date): { from: string; to: string; meses: string } {
  const year = hoje.getFullYear()
  const month = hoje.getMonth()
  const startMonth = Math.floor(month / 3) * 3
  const from = ymd(new Date(year, startMonth, 1))
  const to = ymd(hoje)
  const mesesCount = month - startMonth + 1
  const meses = Array.from({ length: mesesCount }, (_, i) => MESES_PT[startMonth + i]).join('+')
  return { from, to, meses }
}

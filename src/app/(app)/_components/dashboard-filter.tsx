'use client'

import { useRouter } from 'next/navigation'

const presets = [
  { label: 'Hoje', key: 'today' },
  { label: 'Ontem', key: 'yesterday' },
  { label: '7 dias', key: 'last_7_days' },
  { label: 'Este mês', key: 'this_month' },
  { label: 'Mês passado', key: 'last_month' },
  { label: 'Últimos 3 meses', key: 'last_3_months' },
  { label: 'Este ano', key: 'this_year' },
]

function toLocalISODate(d: Date): string {
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()
  return `${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
}

function getPresetDates(key: string): { from: string; to: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()

  if (key === 'today') {
    const d = toLocalISODate(now)
    return { from: d, to: d }
  }
  if (key === 'yesterday') {
    const yest = new Date(now)
    yest.setDate(yest.getDate() - 1)
    const d = toLocalISODate(yest)
    return { from: d, to: d }
  }
  if (key === 'last_7_days') {
    const start = new Date(now)
    start.setDate(start.getDate() - 6)
    return { from: toLocalISODate(start), to: toLocalISODate(now) }
  }
  if (key === 'last_month') {
    const first = new Date(y, m - 1, 1)
    const last = new Date(y, m, 0)
    return { from: first.toISOString().split('T')[0], to: last.toISOString().split('T')[0] }
  }
  if (key === 'last_3_months') {
    const first = new Date(y, m - 2, 1)
    const last = new Date(y, m + 1, 0)
    return { from: first.toISOString().split('T')[0], to: last.toISOString().split('T')[0] }
  }
  if (key === 'this_year') {
    return { from: `${y}-01-01`, to: `${y}-12-31` }
  }
  // this_month (default)
  const first = new Date(y, m, 1)
  const last = new Date(y, m + 1, 0)
  return { from: first.toISOString().split('T')[0], to: last.toISOString().split('T')[0] }
}

function detectPreset(from: string, to: string): string | null {
  for (const p of presets) {
    const d = getPresetDates(p.key)
    if (d.from === from && d.to === to) return p.key
  }
  return null
}

interface Props {
  from: string
  to: string
  produtos: { id: string; name: string; nickname: string | null }[]
  origens: { id: string; name: string }[]
  afiliados: { id: string; name: string | null }[]
  produtoSelecionado: string
  origemSelecionada: string
  afiliadoSelecionado: string
}

export function DashboardFilter({
  from, to, produtos, origens, afiliados,
  produtoSelecionado, origemSelecionada, afiliadoSelecionado,
}: Props) {
  const router = useRouter()
  const activePreset = detectPreset(from, to)

  function pushParams(partial: { from?: string; to?: string; produto?: string; origem?: string; afiliado?: string }) {
    const next = {
      from: partial.from ?? from,
      to: partial.to ?? to,
      produto: partial.produto ?? produtoSelecionado,
      origem: partial.origem ?? origemSelecionada,
      afiliado: partial.afiliado ?? afiliadoSelecionado,
    }
    const qs = new URLSearchParams()
    qs.set('from', next.from)
    qs.set('to', next.to)
    if (next.produto) qs.set('produto', next.produto)
    if (next.origem) qs.set('origem', next.origem)
    if (next.afiliado) qs.set('afiliado', next.afiliado)
    router.push(`/?${qs.toString()}`)
  }

  function apply(newFrom: string, newTo: string) {
    pushParams({ from: newFrom, to: newTo })
  }

  function applyPreset(key: string) {
    const { from, to } = getPresetDates(key)
    apply(from, to)
  }

  return (
    <div className="flex flex-col items-stretch md:items-end gap-2 w-full md:w-auto">
      <div className="flex flex-wrap items-center gap-2">
        {presets.map((p) => (
          <button
            key={p.key}
            onClick={() => applyPreset(p.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activePreset === p.key
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {p.label}
          </button>
        ))}

        <div className="flex flex-wrap items-center gap-1.5 md:ml-2">
          <input
            type="date"
            value={from}
            onChange={(e) => apply(e.target.value, to)}
            className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0"
          />
          <span className="text-xs text-slate-400">até</span>
          <input
            type="date"
            value={to}
            onChange={(e) => apply(from, e.target.value)}
            className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-0"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <select
          value={produtoSelecionado}
          onChange={(e) => pushParams({ produto: e.target.value })}
          className="w-full sm:w-auto max-w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos os produtos</option>
          {produtos.map((p) => (
            <option key={p.id} value={p.id}>{p.nickname || p.name}</option>
          ))}
        </select>
        <select
          value={origemSelecionada}
          onChange={(e) => pushParams({ origem: e.target.value })}
          className="w-full sm:w-auto max-w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todas as origens</option>
          {origens.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
        <select
          value={afiliadoSelecionado}
          onChange={(e) => pushParams({ afiliado: e.target.value })}
          className="w-full sm:w-auto max-w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Todos os afiliados</option>
          {afiliados.map((a) => (
            <option key={a.id} value={a.id}>{a.name || 'Sem nome'}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

'use client'

import { useRouter, useSearchParams } from 'next/navigation'

const presets = [
  { label: 'Este mês', key: 'this_month' },
  { label: 'Mês passado', key: 'last_month' },
  { label: 'Últimos 3 meses', key: 'last_3_months' },
  { label: 'Este ano', key: 'this_year' },
]

function getPresetDates(key: string): { from: string; to: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()

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
}

export function DashboardFilter({ from, to }: Props) {
  const router = useRouter()
  const activePreset = detectPreset(from, to)

  function apply(newFrom: string, newTo: string) {
    router.push(`/?from=${newFrom}&to=${newTo}`)
  }

  function applyPreset(key: string) {
    const { from, to } = getPresetDates(key)
    apply(from, to)
  }

  return (
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

      <div className="flex items-center gap-1.5 ml-2">
        <input
          type="date"
          value={from}
          onChange={(e) => apply(e.target.value, to)}
          className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <span className="text-xs text-slate-400">até</span>
        <input
          type="date"
          value={to}
          onChange={(e) => apply(from, e.target.value)}
          className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </div>
  )
}

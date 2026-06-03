'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import { TrendingUp, TrendingDown, DollarSign, Percent } from 'lucide-react'
import { DashboardFilter } from './dashboard-filter'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']

function formatBRL(value: number) {
  return ((value ?? 0) as number).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

interface Props {
  from: string
  to: string
  totalRevenue: number
  totalCosts: number
  totalAds: number
  totalVariable: number
  totalSubscriptions: number
  totalFixed: number
  totalProviders: number
  totalTax: number
  profit: number
  revenueEntries: { gross_amount: number; net_amount: number | null; date: string; platform: string; status: string }[]
  adCostEntries: { amount: number; date: string; platform: string }[]
}

export function DashboardClient({
  from, to,
  totalRevenue, totalCosts, totalAds, totalVariable,
  totalSubscriptions, totalFixed, totalProviders, totalTax = 0,
  profit, revenueEntries, adCostEntries,
}: Props) {
  const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0

  const barData = [
    { name: 'Receita', value: totalRevenue },
    { name: 'Custos', value: totalCosts },
    { name: 'Lucro', value: Math.max(profit, 0) },
  ]

  const platformMap = revenueEntries.reduce<Record<string, number>>((acc, r) => {
    if (r.status !== 'approved') return acc
    acc[r.platform] = (acc[r.platform] ?? 0) + (r.net_amount ?? r.gross_amount)
    return acc
  }, {})
  const pieData = Object.entries(platformMap).map(([name, value]) => ({ name, value }))

  const costBreakdown = [
    { label: 'Anúncios', value: totalAds, color: 'bg-orange-500' },
    { label: 'Fixos', value: totalFixed, color: 'bg-red-500' },
    { label: 'Assinaturas', value: totalSubscriptions, color: 'bg-purple-500' },
    { label: 'Prestadores', value: totalProviders, color: 'bg-blue-500' },
    { label: 'Avulsos', value: totalVariable, color: 'bg-yellow-500' },
    { label: 'Impostos (6%)', value: totalTax, color: 'bg-teal-500' },
  ]

  const now = new Date()
  const monthName = now.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Dashboard</h2>
          <p className="text-sm text-slate-500 mt-0.5 capitalize">{monthName}</p>
        </div>
        <DashboardFilter from={from} to={to} />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Receita</span>
            <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
              <TrendingUp size={15} className="text-green-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900">{formatBRL(totalRevenue)}</p>
          <p className="text-xs text-slate-400 mt-1">Vendas aprovadas no mês</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Custos</span>
            <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
              <TrendingDown size={15} className="text-red-600" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-900">{formatBRL(totalCosts)}</p>
          <p className="text-xs text-slate-400 mt-1">Total de despesas</p>
        </div>

        <div className={`rounded-xl border p-5 ${profit >= 0 ? 'bg-blue-600 border-blue-600' : 'bg-red-600 border-red-600'}`}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-white/70 uppercase tracking-wide">Lucro</span>
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
              <DollarSign size={15} className="text-white" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white">{formatBRL(profit)}</p>
          <p className="text-xs text-white/60 mt-1">Resultado líquido</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Margem</span>
            <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center">
              <Percent size={15} className="text-slate-600" />
            </div>
          </div>
          <p className={`text-2xl font-bold ${margin >= 0 ? 'text-slate-900' : 'text-red-600'}`}>
            {margin.toFixed(1)}%
          </p>
          <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${margin >= 0 ? 'bg-blue-500' : 'bg-red-500'}`}
              style={{ width: `${Math.min(Math.abs(margin), 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Breakdown de custos */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 mb-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Breakdown de custos</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {costBreakdown.map(({ label, value, color }) => {
            const pct = totalCosts > 0 ? (value / totalCosts) * 100 : 0
            return (
              <div key={label} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${color} shrink-0`} />
                  <span className="text-xs text-slate-500">{label}</span>
                </div>
                <p className="text-base font-semibold text-slate-900">{formatBRL(value)}</p>
                <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="text-xs text-slate-400">{pct.toFixed(0)}% do total</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Resumo do mês</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData} barSize={40}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(value) => formatBRL(Number(value ?? 0))}
                contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
              />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {barData.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={index === 0 ? '#10b981' : index === 1 ? '#ef4444' : '#3b82f6'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Receita por plataforma</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40}>
                  {pieData.map((_, index) => (
                    <Cell key={index} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value) => formatBRL(Number(value ?? 0))}
                  contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-slate-400 text-sm">
              Nenhuma receita registrada neste mês
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

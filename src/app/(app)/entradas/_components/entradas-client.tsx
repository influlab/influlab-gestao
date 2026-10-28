'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatBRL, formatDate } from '@/lib/utils'
import { useIsAdmin } from '@/components/role-context'
import { Plus, Pencil, Trash2, Upload, ChevronLeft, ChevronRight, Search } from 'lucide-react'

type RevenueEntry = {
  id: string
  platform: string
  product_name: string | null
  gross_amount: number
  net_amount: number | null
  customer_name: string | null
  customer_email: string | null
  transaction_id: string | null
  date: string
  status: string
}

const platforms = ['kiwify', 'ticto', 'manual', 'other']
const platformLabels: Record<string, string> = { kiwify: 'Kiwify', ticto: 'Ticto', manual: 'Manual', other: 'Outro' }
const statusLabels: Record<string, string> = { approved: 'Aprovado', refunded: 'Reembolsado', pending: 'Pendente', cancelled: 'Cancelado' }
const statusColors: Record<string, string> = { approved: 'bg-green-100 text-green-700', refunded: 'bg-orange-100 text-orange-700', pending: 'bg-yellow-100 text-yellow-700', cancelled: 'bg-red-100 text-red-700' }
const today = new Date().toISOString().split('T')[0]
const emptyForm = { platform: 'manual', product_name: '', gross_amount: '', net_amount: '', customer_name: '', customer_email: '', transaction_id: '', date: today, status: 'approved' }

export function EntradasClient({
  initialData,
  totalCount,
  page,
  pageSize,
  platform: filter,
  q: initialQ,
  totalApproved,
}: {
  initialData: RevenueEntry[]
  totalCount: number
  page: number
  pageSize: number
  platform: string
  q: string
  totalApproved: number
}) {
  const router = useRouter()
  const [data, setData] = useState(initialData)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<RevenueEntry | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(false)
  const [searchInput, setSearchInput] = useState(initialQ)
  const supabase = createClient()
  const isAdmin = useIsAdmin()

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  function goTo(newPage: number, overrides: { platform?: string; q?: string } = {}) {
    const qs = new URLSearchParams()
    qs.set('page', String(newPage))
    qs.set('platform', overrides.platform ?? filter)
    const nextQ = overrides.q ?? initialQ
    if (nextQ) qs.set('q', nextQ)
    router.push(`/entradas?${qs.toString()}`)
  }

  function setFilter(p: string) {
    goTo(1, { platform: p })
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    goTo(1, { q: searchInput.trim() })
  }

  function openNew() {
    setEditing(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  function openEdit(item: RevenueEntry) {
    setEditing(item)
    setForm({
      platform: item.platform,
      product_name: item.product_name ?? '',
      gross_amount: item.gross_amount.toString(),
      net_amount: item.net_amount?.toString() ?? '',
      customer_name: item.customer_name ?? '',
      customer_email: item.customer_email ?? '',
      transaction_id: item.transaction_id ?? '',
      date: item.date,
      status: item.status,
    })
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const payload = {
      platform: form.platform,
      product_name: form.product_name || null,
      gross_amount: parseFloat(form.gross_amount),
      net_amount: form.net_amount ? parseFloat(form.net_amount) : null,
      customer_name: form.customer_name || null,
      customer_email: form.customer_email || null,
      transaction_id: form.transaction_id || null,
      date: form.date,
      status: form.status,
    }
    if (editing) {
      const { data: u } = await supabase.from('revenue_entries').update(payload).eq('id', editing.id).select().single()
      if (u) setData(d => d.map(x => x.id === editing.id ? u : x))
    } else {
      const { data: c } = await supabase.from('revenue_entries').insert(payload).select().single()
      if (c) setData(d => [c, ...d])
    }
    setShowForm(false)
    setLoading(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir esta entrada?')) return
    await supabase.from('revenue_entries').delete().eq('id', id)
    setData(d => d.filter(x => x.id !== id))
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Entradas</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {totalCount} registro(s) · Líquido aprovado: <span className="font-semibold text-green-700">{formatBRL(totalApproved)}</span>
          </p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/entradas/importar" className="flex items-center gap-2 border px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
              <Upload size={16} /> Importar CSV
            </Link>
            <button onClick={openNew} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
              <Plus size={16} /> Entrada manual
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex flex-wrap gap-2">
          {['all', ...platforms].map(p => (
            <button key={p} onClick={() => setFilter(p)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === p ? 'bg-blue-600 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}>
              {p === 'all' ? 'Todas' : platformLabels[p]}
            </button>
          ))}
        </div>
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 flex-1 min-w-[220px] max-w-sm">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Buscar por e-mail, ID da venda ou CPF/CNPJ"
              className="w-full border rounded-lg pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button type="submit" className="px-3 py-1.5 text-sm border rounded-lg text-gray-600 hover:bg-gray-50">Buscar</button>
          {initialQ && (
            <button type="button" onClick={() => { setSearchInput(''); goTo(1, { q: '' }) }} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">
              Limpar
            </button>
          )}
        </form>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <h3 className="text-lg font-semibold mb-4">{editing ? 'Editar entrada' : 'Nova entrada manual'}</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Plataforma *</label>
                  <select value={form.platform} onChange={e => setForm(f => ({ ...f, platform: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
                    {platforms.map(p => <option key={p} value={p}>{platformLabels[p]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data *</label>
                  <input required type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Valor bruto (R$) *</label>
                  <input required type="number" step="0.01" value={form.gross_amount} onChange={e => setForm(f => ({ ...f, gross_amount: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Valor líquido (R$)</label>
                  <input type="number" step="0.01" value={form.net_amount} onChange={e => setForm(f => ({ ...f, net_amount: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Produto</label>
                  <input value={form.product_name} onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome do cliente</label>
                  <input value={form.customer_name} onChange={e => setForm(f => ({ ...f, customer_name: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
                    {Object.entries(statusLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">Cancelar</button>
                <button type="submit" disabled={loading} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{loading ? 'Salvando...' : 'Salvar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Plataforma</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Produto</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Cliente</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Data</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Bruto</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Líquido</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && <tr><td colSpan={8} className="text-center py-12 text-gray-400">Nenhuma entrada encontrada</td></tr>}
            {data.map(item => (
              <tr key={item.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{platformLabels[item.platform] ?? item.platform}</td>
                <td className="px-4 py-3 text-gray-600">{item.product_name ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600">{item.customer_name ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600">{formatDate(item.date)}</td>
                <td className="px-4 py-3 text-right text-gray-900">{formatBRL(item.gross_amount)}</td>
                <td className="px-4 py-3 text-right text-gray-900">{item.net_amount ? formatBRL(item.net_amount) : '—'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[item.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {statusLabels[item.status] ?? item.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {isAdmin && (
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(item)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded"><Pencil size={14} /></button>
                      <button onClick={() => handleDelete(item.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded"><Trash2 size={14} /></button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-gray-400">Página {page} de {totalPages}</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => goTo(page - 1)}
              disabled={page <= 1}
              className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white"
            >
              <ChevronLeft size={14} /> Anterior
            </button>
            <button
              onClick={() => goTo(page + 1)}
              disabled={page >= totalPages}
              className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-white"
            >
              Próxima <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

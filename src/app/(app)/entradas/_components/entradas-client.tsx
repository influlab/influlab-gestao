'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatBRL, formatDate } from '@/lib/utils'
import { useIsAdmin } from '@/components/role-context'
import { Plus, Trash2 } from 'lucide-react'

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

export function EntradasClient({ initialData }: { initialData: RevenueEntry[] }) {
  const [data, setData] = useState(initialData)
  const [showForm, setShowForm] = useState(false)
  const [filter, setFilter] = useState('all')
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()
  const isAdmin = useIsAdmin()

  const filtered = filter === 'all' ? data : data.filter(x => x.platform === filter)
  const total = filtered.filter(x => x.status === 'approved').reduce((s, x) => s + (x.net_amount ?? x.gross_amount), 0)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true)
    const payload = {
      platform: form.platform, product_name: form.product_name || null,
      gross_amount: parseFloat(form.gross_amount),
      net_amount: form.net_amount ? parseFloat(form.net_amount) : null,
      customer_name: form.customer_name || null, customer_email: form.customer_email || null,
      transaction_id: form.transaction_id || null, date: form.date, status: form.status,
    }
    const { data: c } = await supabase.from('revenue_entries').insert(payload).select().single()
    if (c) setData(d => [c, ...d])
    setShowForm(false); setLoading(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir esta entrada?')) return
    await supabase.from('revenue_entries').delete().eq('id', id)
    setData(d => d.filter(x => x.id !== id))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Entradas</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {filtered.length} registro(s) · Líquido aprovado: <span className="font-semibold text-green-700">{formatBRL(total)}</span>
          </p>
        </div>
        {isAdmin && (
          <button onClick={() => { setForm(emptyForm); setShowForm(true) }} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            <Plus size={16} /> Entrada manual
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-6">
        {['all', ...platforms].map(p => (
          <button key={p} onClick={() => setFilter(p)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filter === p ? 'bg-blue-600 text-white' : 'bg-white border text-gray-600 hover:bg-gray-50'}`}>
            {p === 'all' ? 'Todas' : platformLabels[p]}
          </button>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <h3 className="text-lg font-semibold mb-4">Nova entrada manual</h3>
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
        <table className="w-full text-sm">
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
            {filtered.length === 0 && <tr><td colSpan={8} className="text-center py-12 text-gray-400">Nenhuma entrada registrada</td></tr>}
            {filtered.map(item => (
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
                  {isAdmin && <button onClick={() => handleDelete(item.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded"><Trash2 size={14} /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

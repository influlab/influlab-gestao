'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatBRL, formatDate } from '@/lib/utils'
import { useIsAdmin } from '@/components/role-context'
import { Plus, Pencil, Trash2 } from 'lucide-react'

type FixedCost = { id: string; name: string; description: string | null; amount: number; billing_day: number | null; category: string | null; start_date: string; end_date: string | null }
const today = new Date().toISOString().split('T')[0]
const emptyForm = { name: '', description: '', amount: '', billing_day: '', category: '', start_date: today, end_date: '' }

export function CustosFixosClient({ initialData }: { initialData: FixedCost[] }) {
  const [data, setData] = useState(initialData)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<FixedCost | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()
  const isAdmin = useIsAdmin()

  function openNew() { setEditing(null); setForm(emptyForm); setShowForm(true) }
  function openEdit(item: FixedCost) {
    setEditing(item)
    setForm({ name: item.name, description: item.description ?? '', amount: item.amount.toString(), billing_day: item.billing_day?.toString() ?? '', category: item.category ?? '', start_date: item.start_date, end_date: item.end_date ?? '' })
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true)
    const payload = { name: form.name, description: form.description || null, amount: parseFloat(form.amount), billing_day: form.billing_day ? parseInt(form.billing_day) : null, category: form.category || null, active: true, start_date: form.start_date, end_date: form.end_date || null }
    if (editing) {
      const { data: u } = await supabase.from('fixed_costs').update(payload).eq('id', editing.id).select().single()
      if (u) setData(d => d.map(x => x.id === editing.id ? u : x))
    } else {
      const { data: c } = await supabase.from('fixed_costs').insert(payload).select().single()
      if (c) setData(d => [c, ...d])
    }
    setShowForm(false); setLoading(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir este custo fixo?')) return
    await supabase.from('fixed_costs').delete().eq('id', id)
    setData(d => d.filter(x => x.id !== id))
  }

  const todayStr = new Date().toISOString().split('T')[0]
  const currentItems = data.filter(x =>
    x.start_date <= todayStr &&
    (!x.end_date || x.end_date >= todayStr)
  )
  const total = currentItems.reduce((s, x) => s + x.amount, 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Custos Fixos</h2>
          <p className="text-sm text-gray-500 mt-0.5">Total mensal: <span className="font-semibold text-gray-800">{formatBRL(total)}</span></p>
        </div>
        {isAdmin && (
          <button onClick={openNew} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            <Plus size={16} /> Novo custo fixo
          </button>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-4">{editing ? 'Editar custo fixo' : 'Novo custo fixo'}</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$) *</label>
                  <input required type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dia de vencimento</label>
                  <input type="number" min={1} max={31} value={form.billing_day} onChange={e => setForm(f => ({ ...f, billing_day: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                  <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data de início *</label>
                  <input required type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data de término</label>
                  <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
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
              <th className="text-left px-4 py-3 font-medium text-gray-600">Nome</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Categoria</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Valor</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Venc.</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Início</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && <tr><td colSpan={6} className="text-center py-12 text-gray-400">Nenhum custo fixo cadastrado</td></tr>}
            {data.map(item => (
              <tr key={item.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                <td className="px-4 py-3 text-gray-600">{item.category ?? '—'}</td>
                <td className="px-4 py-3 text-right text-gray-900">{formatBRL(item.amount)}</td>
                <td className="px-4 py-3 text-gray-600">{item.billing_day ? `Dia ${item.billing_day}` : '—'}</td>
                <td className="px-4 py-3 text-gray-600">{formatDate(item.start_date)}</td>
                <td className="px-4 py-3">
                  {(() => {
                    if (item.start_date > todayStr) return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">Agendado</span>
                    if (item.end_date && item.end_date < todayStr) return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Encerrado</span>
                    return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Ativo</span>
                  })()}
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
  )
}

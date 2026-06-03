'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatBRL, formatDate } from '@/lib/utils'
import { useIsAdmin } from '@/components/role-context'
import { Plus, Pencil, Trash2 } from 'lucide-react'

type VariableCost = { id: string; description: string; amount: number; date: string; category: string | null; payment_method: string | null; notes: string | null }
const today = new Date().toISOString().split('T')[0]
const emptyForm = { description: '', amount: '', date: today, category: '', payment_method: '', notes: '' }

export function CustosAvulsosClient({ initialData }: { initialData: VariableCost[] }) {
  const [data, setData] = useState(initialData)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<VariableCost | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()
  const isAdmin = useIsAdmin()

  function openNew() { setEditing(null); setForm(emptyForm); setShowForm(true) }
  function openEdit(item: VariableCost) {
    setEditing(item)
    setForm({ description: item.description, amount: item.amount.toString(), date: item.date, category: item.category ?? '', payment_method: item.payment_method ?? '', notes: item.notes ?? '' })
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true)
    const payload = { description: form.description, amount: parseFloat(form.amount), date: form.date, category: form.category || null, payment_method: form.payment_method || null, notes: form.notes || null }
    if (editing) {
      const { data: u } = await supabase.from('variable_costs').update(payload).eq('id', editing.id).select().single()
      if (u) setData(d => d.map(x => x.id === editing.id ? u : x))
    } else {
      const { data: c } = await supabase.from('variable_costs').insert(payload).select().single()
      if (c) setData(d => [c, ...d])
    }
    setShowForm(false); setLoading(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir este custo?')) return
    await supabase.from('variable_costs').delete().eq('id', id)
    setData(d => d.filter(x => x.id !== id))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Custos Avulsos</h2>
        {isAdmin && (
          <button onClick={openNew} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            <Plus size={16} /> Novo custo
          </button>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-4">{editing ? 'Editar custo' : 'Novo custo avulso'}</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição *</label>
                <input required value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$) *</label>
                  <input required type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data *</label>
                  <input required type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
                  <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Forma de pagamento</label>
                  <input value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="PIX, Cartão..." />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
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
              <th className="text-left px-4 py-3 font-medium text-gray-600">Descrição</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Categoria</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Data</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Valor</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Pagamento</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && <tr><td colSpan={6} className="text-center py-12 text-gray-400">Nenhum custo avulso registrado</td></tr>}
            {data.map(item => (
              <tr key={item.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{item.description}</td>
                <td className="px-4 py-3 text-gray-600">{item.category ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600">{formatDate(item.date)}</td>
                <td className="px-4 py-3 text-right text-gray-900">{formatBRL(item.amount)}</td>
                <td className="px-4 py-3 text-gray-600">{item.payment_method ?? '—'}</td>
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

'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatBRL, formatDate } from '@/lib/utils'
import { useIsAdmin } from '@/components/role-context'
import { Plus, Pencil, Trash2 } from 'lucide-react'

type Provider = {
  id: string
  name: string
  service_type: string | null
  email: string | null
  phone: string | null
  payment_amount: number | null
  payment_frequency: string | null
  notes: string | null
  start_date: string | null
  end_date: string | null
}

const frequencyLabels: Record<string, string> = {
  monthly: 'Mensal',
  weekly: 'Semanal',
  biweekly: 'Quinzenal',
  per_service: 'Por serviço',
  annual: 'Anual',
}

const today = new Date().toISOString().split('T')[0]
const emptyForm = {
  name: '', service_type: '', email: '', phone: '',
  payment_amount: '', payment_frequency: 'monthly', notes: '', start_date: today, end_date: '',
}

export function PrestadoresClient({ initialData }: { initialData: Provider[] }) {
  const [data, setData] = useState(initialData)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Provider | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()
  const isAdmin = useIsAdmin()

  function openNew() {
    setEditing(null)
    setForm(emptyForm)
    setShowForm(true)
  }

  function openEdit(item: Provider) {
    setEditing(item)
    setForm({
      name: item.name,
      service_type: item.service_type ?? '',
      email: item.email ?? '',
      phone: item.phone ?? '',
      payment_amount: item.payment_amount?.toString() ?? '',
      payment_frequency: item.payment_frequency ?? 'monthly',
      notes: item.notes ?? '',
      start_date: item.start_date ?? today,
      end_date: item.end_date ?? '',
    })
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)

    const payload = {
      name: form.name,
      service_type: form.service_type || null,
      email: form.email || null,
      phone: form.phone || null,
      payment_amount: form.payment_amount ? parseFloat(form.payment_amount) : null,
      payment_frequency: form.payment_frequency || null,
      notes: form.notes || null,
      active: true,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
    }

    if (editing) {
      const { data: updated } = await supabase.from('service_providers').update(payload).eq('id', editing.id).select().single()
      if (updated) setData(d => d.map(x => x.id === editing.id ? updated : x))
    } else {
      const { data: created } = await supabase.from('service_providers').insert(payload).select().single()
      if (created) setData(d => [created, ...d])
    }

    setShowForm(false)
    setLoading(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir este prestador?')) return
    await supabase.from('service_providers').delete().eq('id', id)
    setData(d => d.filter(x => x.id !== id))
  }

  const todayStr = new Date().toISOString().split('T')[0]
  const currentItems = data.filter(p =>
    p.start_date && p.start_date <= todayStr &&
    (!p.end_date || p.end_date >= todayStr)
  )
  const totalMensal = currentItems.reduce((s, p) => s + (p.payment_amount ?? 0), 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Prestadores de Serviço</h2>
          <p className="text-sm text-gray-500 mt-0.5">Total mensal: <span className="font-semibold text-gray-800">{formatBRL(totalMensal)}</span></p>
        </div>
        {isAdmin && (
          <button onClick={openNew} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            <Plus size={16} /> Novo prestador
          </button>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <h3 className="text-lg font-semibold mb-4">{editing ? 'Editar prestador' : 'Novo prestador'}</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                  <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de serviço</label>
                  <input value={form.service_type} onChange={e => setForm(f => ({ ...f, service_type: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Ex: Designer, Copywriter" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Valor</label>
                  <input type="number" step="0.01" value={form.payment_amount} onChange={e => setForm(f => ({ ...f, payment_amount: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="0,00" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Frequência</label>
                  <select value={form.payment_frequency} onChange={e => setForm(f => ({ ...f, payment_frequency: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
                    {Object.entries(frequencyLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                  <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data de início *</label>
                  <input required type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data de término</label>
                  <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                  <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
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
              <th className="text-left px-4 py-3 font-medium text-gray-600">Serviço</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Contato</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Valor</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Frequência</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Início</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Situação</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && (
              <tr><td colSpan={7} className="text-center py-12 text-gray-400">Nenhum prestador cadastrado</td></tr>
            )}
            {data.map(item => (
              <tr key={item.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                <td className="px-4 py-3 text-gray-600">{item.service_type ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600">{item.email ?? item.phone ?? '—'}</td>
                <td className="px-4 py-3 text-right text-gray-900">{item.payment_amount ? formatBRL(item.payment_amount) : '—'}</td>
                <td className="px-4 py-3 text-gray-600">{item.payment_frequency ? frequencyLabels[item.payment_frequency] : '—'}</td>
                <td className="px-4 py-3 text-gray-600">{item.start_date ? formatDate(item.start_date) : '—'}</td>
                <td className="px-4 py-3">
                  {(() => {
                    if (!item.start_date || item.start_date > todayStr) return <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">Agendado</span>
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

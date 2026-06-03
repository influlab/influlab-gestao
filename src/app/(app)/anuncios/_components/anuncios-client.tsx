'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatBRL, formatDate } from '@/lib/utils'
import { Plus, Pencil, Trash2 } from 'lucide-react'

type AdCost = { id: string; platform: string; campaign_name: string | null; amount: number; date: string; notes: string | null }
const platforms = ['meta', 'google', 'tiktok', 'kwai', 'other']
const platformLabels: Record<string, string> = { meta: 'Meta Ads', google: 'Google Ads', tiktok: 'TikTok Ads', kwai: 'Kwai Ads', other: 'Outro' }
const today = new Date().toISOString().split('T')[0]
const emptyForm = { platform: 'meta', campaign_name: '', amount: '', date: today, notes: '' }

export function AnunciosClient({ initialData }: { initialData: AdCost[] }) {
  const [data, setData] = useState(initialData)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<AdCost | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  function openNew() { setEditing(null); setForm(emptyForm); setShowForm(true) }
  function openEdit(item: AdCost) {
    setEditing(item)
    setForm({ platform: item.platform, campaign_name: item.campaign_name ?? '', amount: item.amount.toString(), date: item.date, notes: item.notes ?? '' })
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true)
    const payload = { platform: form.platform, campaign_name: form.campaign_name || null, amount: parseFloat(form.amount), date: form.date, notes: form.notes || null }
    if (editing) {
      const { data: u } = await supabase.from('ad_costs').update(payload).eq('id', editing.id).select().single()
      if (u) setData(d => d.map(x => x.id === editing.id ? u : x))
    } else {
      const { data: c } = await supabase.from('ad_costs').insert(payload).select().single()
      if (c) setData(d => [c, ...d])
    }
    setShowForm(false); setLoading(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir este gasto?')) return
    await supabase.from('ad_costs').delete().eq('id', id)
    setData(d => d.filter(x => x.id !== id))
  }

  const totalByPlatform = platforms.reduce<Record<string, number>>((acc, p) => {
    acc[p] = data.filter(x => x.platform === p).reduce((s, x) => s + x.amount, 0)
    return acc
  }, {})

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Gastos em Anúncios</h2>
        <button onClick={openNew} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
          <Plus size={16} /> Novo gasto
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {platforms.map(p => (
          <div key={p} className="bg-white rounded-xl border p-4">
            <p className="text-xs text-gray-500">{platformLabels[p]}</p>
            <p className="text-lg font-bold text-gray-900 mt-0.5">{formatBRL(totalByPlatform[p])}</p>
          </div>
        ))}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-4">{editing ? 'Editar gasto' : 'Novo gasto em anúncio'}</h3>
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
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Campanha</label>
                <input value={form.campaign_name} onChange={e => setForm(f => ({ ...f, campaign_name: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Nome da campanha (opcional)" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$) *</label>
                <input required type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
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
              <th className="text-left px-4 py-3 font-medium text-gray-600">Plataforma</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Campanha</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Data</th>
              <th className="text-right px-4 py-3 font-medium text-gray-600">Valor</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && <tr><td colSpan={5} className="text-center py-12 text-gray-400">Nenhum gasto em anúncio registrado</td></tr>}
            {data.map(item => (
              <tr key={item.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-900">{platformLabels[item.platform] ?? item.platform}</td>
                <td className="px-4 py-3 text-gray-600">{item.campaign_name ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600">{formatDate(item.date)}</td>
                <td className="px-4 py-3 text-right text-gray-900">{formatBRL(item.amount)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => openEdit(item)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded"><Pencil size={14} /></button>
                    <button onClick={() => handleDelete(item.id)} className="p-1.5 text-gray-400 hover:text-red-600 rounded"><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

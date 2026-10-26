'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useIsAdmin } from '@/components/role-context'
import { Plus, Pencil, Trash2 } from 'lucide-react'

type RegraUtm = {
  id: string
  field: string
  operator: string
  value: string
  origem_id: string
  priority: number
  active: boolean
}
type Origem = { id: string; name: string }

const fields = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'src', 'sck']
const operators = ['igual', 'contem', 'comeca_com']
const operatorLabels: Record<string, string> = { igual: 'é igual a', contem: 'contém', comeca_com: 'começa com' }
const emptyForm = { field: 'utm_source', operator: 'igual', value: '', origem_id: '', priority: '0', active: true }

export function RegrasUtmClient({ initialData, origens }: { initialData: RegraUtm[]; origens: Origem[] }) {
  const [data, setData] = useState(initialData)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<RegraUtm | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()
  const isAdmin = useIsAdmin()

  const origemName = (id: string) => origens.find((o) => o.id === id)?.name ?? '—'

  function openNew() { setEditing(null); setForm(emptyForm); setShowForm(true) }
  function openEdit(item: RegraUtm) {
    setEditing(item)
    setForm({ field: item.field, operator: item.operator, value: item.value, origem_id: item.origem_id, priority: String(item.priority), active: item.active })
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true)
    const payload = {
      field: form.field,
      operator: form.operator,
      value: form.value,
      origem_id: form.origem_id,
      priority: parseInt(form.priority) || 0,
      active: form.active,
    }
    if (editing) {
      const { data: u } = await supabase.from('regras_utm').update(payload).eq('id', editing.id).select().single()
      if (u) setData((d) => d.map((x) => (x.id === editing.id ? u : x)).sort((a, b) => a.priority - b.priority))
    } else {
      const { data: c } = await supabase.from('regras_utm').insert(payload).select().single()
      if (c) setData((d) => [...d, c].sort((a, b) => a.priority - b.priority))
    }
    setShowForm(false); setLoading(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir esta regra?')) return
    await supabase.from('regras_utm').delete().eq('id', id)
    setData((d) => d.filter((x) => x.id !== id))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Regras de UTM</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Define a origem da venda a partir dos parâmetros de rastreamento. Prioridade menor é avaliada primeiro.
          </p>
        </div>
        {isAdmin && (
          <button onClick={openNew} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            <Plus size={16} /> Nova regra
          </button>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-4">{editing ? 'Editar regra' : 'Nova regra de UTM'}</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Campo *</label>
                  <select value={form.field} onChange={(e) => setForm((f) => ({ ...f, field: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
                    {fields.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Operador *</label>
                  <select value={form.operator} onChange={(e) => setForm((f) => ({ ...f, operator: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
                    {operators.map((o) => <option key={o} value={o}>{operatorLabels[o]}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Valor *</label>
                <input required value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="ex.: fb, tiktok-stories..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Origem *</label>
                  <select required value={form.origem_id} onChange={(e) => setForm((f) => ({ ...f, origem_id: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="">Selecione...</option>
                    {origens.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Prioridade *</label>
                  <input required type="number" min={0} value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
                  <p className="text-xs text-gray-400 mt-1">Menor número = avaliada primeiro</p>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
                Ativa
              </label>
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
              <th className="text-left px-4 py-3 font-medium text-gray-600">Prioridade</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Condição</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Origem</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && <tr><td colSpan={5} className="text-center py-12 text-gray-400">Nenhuma regra cadastrada — vendas caem em &quot;Afiliados&quot; ou &quot;Não identificado&quot;</td></tr>}
            {data.map((item) => (
              <tr key={item.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-600">{item.priority}</td>
                <td className="px-4 py-3 font-medium text-gray-900">
                  <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{item.field}</code>{' '}
                  {operatorLabels[item.operator] ?? item.operator}{' '}
                  <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{item.value}</code>
                </td>
                <td className="px-4 py-3 text-gray-600">{origemName(item.origem_id)}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${item.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {item.active ? 'Ativa' : 'Inativa'}
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
  )
}

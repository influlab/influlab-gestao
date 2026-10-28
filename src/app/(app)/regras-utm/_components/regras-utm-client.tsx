'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useIsAdmin } from '@/components/role-context'
import { Plus, Pencil, Trash2, RefreshCw } from 'lucide-react'
import { calcularOrigemId, loadOrigemContext } from '@/lib/origem'
import { OrigemSelect, type Origem } from '@/components/origem-select'

type RegraUtm = {
  id: string
  field: string
  operator: string
  value: string
  origem_id: string
  priority: number
  active: boolean
}

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
  const [reprocessing, setReprocessing] = useState(false)
  const [origensState, setOrigensState] = useState(origens)
  const supabase = createClient()
  const isAdmin = useIsAdmin()

  async function handleReprocess() {
    setReprocessing(true)
    try {
      const ctx = await loadOrigemContext(supabase)
      const { data: entries } = await supabase
        .from('revenue_entries')
        .select('id, utm_source, utm_medium, utm_campaign, utm_content, utm_term, src, sck, product_id, affiliate_id, origem_id, order_item_type, customer_email, platform, date')

      const recalculadas = (entries ?? []).map((entry) => ({
        ...entry,
        novaOrigemId: calcularOrigemId(entry, entry.product_id, entry.affiliate_id, ctx) as string | null,
      }))

      // Order bump não tem tráfego/UTM próprio — veio "de carona" na mesma
      // compra do produto principal — então herda a origem (já recalculada)
      // dele em vez da calculada isoladamente. Sem id de pedido compartilhado
      // no banco, o proxy é e-mail do cliente + mesma plataforma + mesmo dia
      // (mesma aproximação usada na importação de CSV).
      const principaisPorChave = new Map<string, string | null>()
      for (const e of recalculadas) {
        if (e.order_item_type !== 'principal' || !e.customer_email || !e.date) continue
        const key = `${e.platform}|${e.customer_email.toLowerCase()}|${e.date}`
        if (!principaisPorChave.has(key)) principaisPorChave.set(key, e.novaOrigemId)
      }
      for (const e of recalculadas) {
        if (e.order_item_type !== 'orderbump' || !e.customer_email || !e.date) continue
        const key = `${e.platform}|${e.customer_email.toLowerCase()}|${e.date}`
        if (principaisPorChave.has(key)) e.novaOrigemId = principaisPorChave.get(key) ?? null
      }

      const updates = recalculadas
        .map((e) => ({ id: e.id, novaOrigemId: e.novaOrigemId, origemAtual: e.origem_id }))
        .filter((e) => e.novaOrigemId !== e.origemAtual)

      const chunkSize = 200
      for (let i = 0; i < updates.length; i += chunkSize) {
        const chunk = updates.slice(i, i + chunkSize)
        await Promise.all(chunk.map((u) => supabase.from('revenue_entries').update({ origem_id: u.novaOrigemId }).eq('id', u.id)))
      }

      alert(`${updates.length} venda(s) tiveram a origem recalculada.`)
    } finally {
      setReprocessing(false)
    }
  }

  const origemName = (id: string) => origensState.find((o) => o.id === id)?.name ?? '—'

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
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Regras de UTM</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Define a origem da venda a partir dos parâmetros de rastreamento. Prioridade menor é avaliada primeiro.
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <button onClick={handleReprocess} disabled={reprocessing} className="flex items-center gap-2 bg-white border px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors">
              <RefreshCw size={16} className={reprocessing ? 'animate-spin' : ''} /> {reprocessing ? 'Reprocessando...' : 'Reprocessar origens'}
            </button>
            <button onClick={openNew} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
              <Plus size={16} /> Nova regra
            </button>
          </div>
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
                  <OrigemSelect
                    required
                    origens={origensState}
                    onOrigensChange={setOrigensState}
                    value={form.origem_id}
                    onChange={(id) => setForm((f) => ({ ...f, origem_id: id }))}
                    emptyLabel="Selecione..."
                  />
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
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
    </div>
  )
}

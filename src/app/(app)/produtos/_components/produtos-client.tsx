'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils'
import { useIsAdmin } from '@/components/role-context'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { OrigemSelect, type Origem } from '@/components/origem-select'

type Produto = {
  id: string
  platform: string
  external_id: string
  name: string
  nickname: string | null
  default_origem_id: string | null
  active: boolean
  created_at: string
}

const platforms = ['kiwify', 'ticto', 'manual', 'other']
const platformLabels: Record<string, string> = { kiwify: 'Kiwify', ticto: 'Ticto', manual: 'Manual', other: 'Outro' }
const emptyForm = { platform: 'kiwify', external_id: '', name: '', nickname: '', default_origem_id: '', active: true }

export function ProdutosClient({ initialData, origens }: { initialData: Produto[]; origens: Origem[] }) {
  const [data, setData] = useState(initialData)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Produto | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(false)
  const [origensState, setOrigensState] = useState(origens)
  const supabase = createClient()
  const isAdmin = useIsAdmin()

  const origemName = (id: string | null) => origensState.find((o) => o.id === id)?.name ?? '—'

  function openNew() { setEditing(null); setForm(emptyForm); setShowForm(true) }
  function openEdit(item: Produto) {
    setEditing(item)
    setForm({
      platform: item.platform,
      external_id: item.external_id,
      name: item.name,
      nickname: item.nickname ?? '',
      default_origem_id: item.default_origem_id ?? '',
      active: item.active,
    })
    setShowForm(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true)
    const payload = {
      platform: form.platform,
      external_id: form.external_id,
      name: form.name,
      nickname: form.nickname || null,
      default_origem_id: form.default_origem_id || null,
      active: form.active,
    }
    if (editing) {
      const { data: u } = await supabase.from('produtos').update(payload).eq('id', editing.id).select().single()
      if (u) setData((d) => d.map((x) => (x.id === editing.id ? u : x)))
    } else {
      const { data: c } = await supabase.from('produtos').insert(payload).select().single()
      if (c) setData((d) => [c, ...d])
    }
    setShowForm(false); setLoading(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir este produto?')) return
    await supabase.from('produtos').delete().eq('id', id)
    setData((d) => d.filter((x) => x.id !== id))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Produtos</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Mapeie a origem padrão de cada produto. Produtos novos são criados automaticamente pelo webhook da Kiwify.
          </p>
        </div>
        {isAdmin && (
          <button onClick={openNew} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            <Plus size={16} /> Novo produto
          </button>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold mb-4">{editing ? 'Editar produto' : 'Novo produto'}</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Plataforma *</label>
                  <select value={form.platform} onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
                    {platforms.map((p) => <option key={p} value={p}>{platformLabels[p]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ID na plataforma *</label>
                  <input required value={form.external_id} onChange={(e) => setForm((f) => ({ ...f, external_id: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="product_id da Kiwify" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Apelido</label>
                <input value={form.nickname} onChange={(e) => setForm((f) => ({ ...f, nickname: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Nome curto para exibir nos relatórios" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Origem padrão</label>
                <OrigemSelect
                  origens={origensState}
                  onOrigensChange={setOrigensState}
                  value={form.default_origem_id}
                  onChange={(id) => setForm((f) => ({ ...f, default_origem_id: id }))}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
                Ativo
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
              <th className="text-left px-4 py-3 font-medium text-gray-600">Produto</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Plataforma</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Origem padrão</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Criado em</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && <tr><td colSpan={6} className="text-center py-12 text-gray-400">Nenhum produto cadastrado ainda — aparecem aqui automaticamente na primeira venda</td></tr>}
            {data.map((item) => (
              <tr key={item.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{item.nickname || item.name}</p>
                  {item.nickname && <p className="text-xs text-gray-400">{item.name}</p>}
                </td>
                <td className="px-4 py-3 text-gray-600">{platformLabels[item.platform] ?? item.platform}</td>
                <td className="px-4 py-3 text-gray-600">{origemName(item.default_origem_id)}</td>
                <td className="px-4 py-3 text-gray-600">{formatDate(item.created_at.slice(0, 10))}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${item.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {item.active ? 'Ativo' : 'Inativo'}
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

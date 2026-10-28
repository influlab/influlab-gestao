'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils'
import { useIsAdmin } from '@/components/role-context'
import { Plus, Pencil, Trash2 } from 'lucide-react'

type Origem = { id: string; name: string; created_at: string }
type Usage = { produtos: Record<string, number>; regras: Record<string, number>; vendas: Record<string, number> }

export function OrigensClient({ initialData, usage }: { initialData: Origem[]; usage: Usage }) {
  const [data, setData] = useState(initialData)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Origem | null>(null)
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()
  const isAdmin = useIsAdmin()

  function openNew() { setEditing(null); setName(''); setShowForm(true) }
  function openEdit(item: Origem) { setEditing(item); setName(item.name); setShowForm(true) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setLoading(true)
    if (editing) {
      const { data: u, error } = await supabase.from('origens').update({ name: trimmed }).eq('id', editing.id).select().single()
      setLoading(false)
      if (error) { alert('Erro ao salvar: ' + error.message); return }
      if (u) setData((d) => d.map((x) => (x.id === editing.id ? u : x)).sort((a, b) => a.name.localeCompare(b.name)))
    } else {
      const { data: c, error } = await supabase.from('origens').insert({ name: trimmed }).select().single()
      setLoading(false)
      if (error) { alert('Erro ao criar: ' + error.message); return }
      if (c) setData((d) => [...d, c].sort((a, b) => a.name.localeCompare(b.name)))
    }
    setShowForm(false)
  }

  function usageOf(id: string) {
    return {
      produtos: usage.produtos[id] ?? 0,
      regras: usage.regras[id] ?? 0,
      vendas: usage.vendas[id] ?? 0,
    }
  }

  async function handleDelete(item: Origem) {
    const u = usageOf(item.id)
    const emUso = u.produtos + u.regras + u.vendas > 0
    if (emUso) {
      alert(
        `"${item.name}" está em uso (${u.produtos} produto(s), ${u.regras} regra(s) de UTM, ${u.vendas} venda(s)) e não pode ser excluída. Reatribua esses registros a outra origem antes de excluir.`
      )
      return
    }
    if (!confirm(`Excluir a origem "${item.name}"?`)) return
    const { error } = await supabase.from('origens').delete().eq('id', item.id)
    if (error) {
      if (error.code === '23503') {
        alert(`"${item.name}" está em uso em outro registro e não pode ser excluída.`)
      } else {
        alert('Erro ao excluir: ' + error.message)
      }
      return
    }
    setData((d) => d.filter((x) => x.id !== item.id))
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Origens</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Catálogo de origens de tráfego usado em Produtos e Regras de UTM.
          </p>
        </div>
        {isAdmin && (
          <button onClick={openNew} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            <Plus size={16} /> Nova origem
          </button>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-semibold mb-4">{editing ? 'Editar origem' : 'Nova origem'}</h3>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                <input required autoFocus value={name} onChange={(e) => setName(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="ex.: Kwai Ads" />
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
              <th className="text-left px-4 py-3 font-medium text-gray-600">Origem</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Criada em</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">Em uso</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {data.length === 0 && <tr><td colSpan={4} className="text-center py-12 text-gray-400">Nenhuma origem cadastrada</td></tr>}
            {data.map((item) => {
              const u = usageOf(item.id)
              const emUso = u.produtos + u.regras + u.vendas > 0
              return (
                <tr key={item.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                  <td className="px-4 py-3 text-gray-600">{item.created_at ? formatDate(item.created_at.slice(0, 10)) : '—'}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {emUso ? (
                      <span className="text-xs">
                        {u.produtos > 0 && <span className="inline-block mr-2">{u.produtos} produto(s)</span>}
                        {u.regras > 0 && <span className="inline-block mr-2">{u.regras} regra(s)</span>}
                        {u.vendas > 0 && <span className="inline-block">{u.vendas} venda(s)</span>}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">Não usada</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {isAdmin && (
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(item)} className="p-1.5 text-gray-400 hover:text-blue-600 rounded"><Pencil size={14} /></button>
                        <button onClick={() => handleDelete(item)} className="p-1.5 text-gray-400 hover:text-red-600 rounded"><Trash2 size={14} /></button>
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  )
}

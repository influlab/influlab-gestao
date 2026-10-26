'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus } from 'lucide-react'

export type Origem = { id: string; name: string }

export function OrigemSelect({
  origens,
  onOrigensChange,
  value,
  onChange,
  required,
  allowEmpty = true,
  emptyLabel = 'Nenhuma',
}: {
  origens: Origem[]
  onOrigensChange: (origens: Origem[]) => void
  value: string
  onChange: (id: string) => void
  required?: boolean
  allowEmpty?: boolean
  emptyLabel?: string
}) {
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  async function handleAdd() {
    const name = newName.trim()
    if (!name) return
    setSaving(true)
    const { data, error } = await supabase.from('origens').insert({ name }).select().single()
    setSaving(false)
    if (error) {
      alert('Erro ao criar origem: ' + error.message)
      return
    }
    if (data) {
      onOrigensChange([...origens, data].sort((a, b) => a.name.localeCompare(b.name)))
      onChange(data.id)
      setNewName('')
      setAdding(false)
    }
  }

  return (
    <div>
      <div className="flex gap-2">
        <select
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm"
        >
          {allowEmpty && <option value="">{emptyLabel}</option>}
          {origens.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setAdding((a) => !a)}
          title="Cadastrar nova origem"
          className="shrink-0 px-3 border rounded-lg text-sm text-gray-500 hover:bg-gray-50"
        >
          <Plus size={14} />
        </button>
      </div>
      {adding && (
        <div className="flex gap-2 mt-2">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); handleAdd() }
            }}
            placeholder="Nome da nova origem (ex.: Kwai Ads)"
            className="flex-1 border rounded-lg px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={saving}
            onClick={handleAdd}
            className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '...' : 'Adicionar'}
          </button>
        </div>
      )}
    </div>
  )
}

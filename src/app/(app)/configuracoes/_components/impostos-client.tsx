'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useIsAdmin } from '@/components/role-context'

type ConfigRow = {
  id: string | null
  aliquota_imposto_mensal: number
  aliquota_reserva_trimestral: number
  base_imposto: 'bruto_aprovado' | 'liquido'
}

export function ImpostosClient({ initialConfig }: { initialConfig: ConfigRow }) {
  const isAdmin = useIsAdmin()
  const supabase = createClient()

  const [config, setConfig] = useState(initialConfig)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    setSaving(true)
    setError('')
    setSaved(false)

    const payload = {
      aliquota_imposto_mensal: config.aliquota_imposto_mensal,
      aliquota_reserva_trimestral: config.aliquota_reserva_trimestral,
      base_imposto: config.base_imposto,
    }

    if (config.id) {
      const { error } = await supabase.from('configuracoes').update(payload).eq('id', config.id)
      if (error) { setError(error.message); setSaving(false); return }
    } else {
      const { data, error } = await supabase.from('configuracoes').insert(payload).select('id').single()
      if (error) { setError(error.message); setSaving(false); return }
      setConfig((c) => ({ ...c, id: data?.id ?? null }))
    }

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="bg-white rounded-xl border p-6">
      <h3 className="font-semibold text-gray-900 mb-1">Impostos</h3>
      <p className="text-sm text-gray-500 mb-4">
        Alíquotas usadas no cálculo do dashboard: imposto mensal e reserva trimestral.
      </p>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Imposto mensal (%)</label>
            <input
              type="number"
              step="0.01"
              disabled={!isAdmin}
              value={config.aliquota_imposto_mensal}
              onChange={(e) => setConfig((c) => ({ ...c, aliquota_imposto_mensal: Number(e.target.value) }))}
              className="w-full border rounded-lg px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reserva trimestral (%)</label>
            <input
              type="number"
              step="0.01"
              disabled={!isAdmin}
              value={config.aliquota_reserva_trimestral}
              onChange={(e) => setConfig((c) => ({ ...c, aliquota_reserva_trimestral: Number(e.target.value) }))}
              className="w-full border rounded-lg px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Base de cálculo</label>
          <select
            disabled={!isAdmin}
            value={config.base_imposto}
            onChange={(e) => setConfig((c) => ({ ...c, base_imposto: e.target.value as ConfigRow['base_imposto'] }))}
            className="w-full border rounded-lg px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-400"
          >
            <option value="bruto_aprovado">Faturamento bruto aprovado</option>
            <option value="liquido">Faturamento líquido aprovado</option>
          </select>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
            {saved && <span className="text-sm text-green-600">Salvo.</span>}
            {error && <span className="text-sm text-red-600">{error}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

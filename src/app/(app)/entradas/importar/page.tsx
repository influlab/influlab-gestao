export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { loadOrigemContext } from '@/lib/origem'
import { ImportarClient } from './_components/importar-client'

export default async function ImportarCsvPage() {
  const supabase = await createClient()

  const [{ data: origens }, origemContext, { data: produtosNome }, { data: existentes }] = await Promise.all([
    supabase.from('origens').select('id, name').order('name'),
    loadOrigemContext(supabase),
    supabase.from('produtos').select('id, name'),
    // dedup: vendas da Kiwify já capturadas via webhook usam como transaction_id o
    // "order_id" (UUID), não o "ID da venda" (order_ref, código curto) do export CSV.
    // Pra não duplicar, cruzamos contra os dois: transaction_id direto (cobre
    // reimportações de CSV) e raw_payload.order_ref (cobre vendas vindas do webhook).
    supabase.from('revenue_entries').select('transaction_id, raw_payload').eq('platform', 'kiwify'),
  ])

  const existingOrderRefs = Array.from(
    new Set(
      (existentes ?? []).flatMap((r) => {
        const refs: string[] = []
        if (r.transaction_id) refs.push(r.transaction_id)
        const orderRef = (r.raw_payload as Record<string, unknown> | null)?.order_ref
        if (typeof orderRef === 'string') refs.push(orderRef)
        return refs
      })
    )
  )

  return (
    <ImportarClient
      origens={origens ?? []}
      origemContext={origemContext}
      produtosNome={produtosNome ?? []}
      existingOrderRefs={existingOrderRefs}
    />
  )
}

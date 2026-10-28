export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { loadOrigemContext } from '@/lib/origem'
import { ImportarClient } from './_components/importar-client'

export default async function ImportarCsvPage() {
  const supabase = await createClient()

  const [{ data: origens }, origemContext, { data: produtosNome }, { data: existentes }] = await Promise.all([
    supabase.from('origens').select('id, name').order('name'),
    loadOrigemContext(supabase),
    supabase.from('produtos').select('id, name, is_orderbump'),
    // dedup: vendas da Kiwify já capturadas via webhook usam como transaction_id o
    // "order_id" (UUID), não o "ID da venda" (order_ref, código curto) do export CSV.
    // Pra não duplicar, cruzamos contra os dois: transaction_id direto (cobre
    // reimportações de CSV) e raw_payload.order_ref (cobre vendas vindas do webhook).
    // Também carrega o "id" real da linha — necessário pro backfill de afiliado/CPF
    // abaixo, que teve que passar a fazer update por id (upsert por
    // platform+transaction_id falha pra vendas de webhook: o "ID da venda" do CSV só
    // bate com raw_payload.order_ref nesse caso, nunca com o transaction_id de fato).
    supabase.from('revenue_entries').select('id, transaction_id, raw_payload').eq('platform', 'kiwify'),
  ])

  const existingOrderRefs: [string, string][] = []
  const seenRefs = new Set<string>()
  for (const r of existentes ?? []) {
    if (r.transaction_id && !seenRefs.has(r.transaction_id)) {
      seenRefs.add(r.transaction_id)
      existingOrderRefs.push([r.transaction_id, r.id])
    }
    const orderRef = (r.raw_payload as Record<string, unknown> | null)?.order_ref
    if (typeof orderRef === 'string' && !seenRefs.has(orderRef)) {
      seenRefs.add(orderRef)
      existingOrderRefs.push([orderRef, r.id])
    }
  }

  return (
    <ImportarClient
      origens={origens ?? []}
      origemContext={origemContext}
      produtosNome={produtosNome ?? []}
      existingOrderRefs={existingOrderRefs}
    />
  )
}

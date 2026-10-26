export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { OrigensClient } from './_components/origens-client'

function countBy(rows: Record<string, string | null>[] | null, key: string) {
  const map: Record<string, number> = {}
  for (const row of rows ?? []) {
    const id = row[key]
    if (id) map[id] = (map[id] ?? 0) + 1
  }
  return map
}

export default async function OrigensPage() {
  const supabase = await createClient()
  const [origens, produtos, regras, entradas] = await Promise.all([
    supabase.from('origens').select('*').order('name'),
    supabase.from('produtos').select('default_origem_id'),
    supabase.from('regras_utm').select('origem_id'),
    supabase.from('revenue_entries').select('origem_id').not('origem_id', 'is', null),
  ])

  const usage = {
    produtos: countBy(produtos.data, 'default_origem_id'),
    regras: countBy(regras.data, 'origem_id'),
    vendas: countBy(entradas.data, 'origem_id'),
  }

  return <OrigensClient initialData={origens.data ?? []} usage={usage} />
}

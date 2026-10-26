export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { ProdutosClient } from './_components/produtos-client'

export default async function ProdutosPage() {
  const supabase = await createClient()
  const [produtos, origens] = await Promise.all([
    supabase.from('produtos').select('*').order('name'),
    supabase.from('origens').select('id, name').order('name'),
  ])

  return <ProdutosClient initialData={produtos.data ?? []} origens={origens.data ?? []} />
}

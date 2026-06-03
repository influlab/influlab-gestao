export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { CustosAvulsosClient } from './_components/custos-avulsos-client'

export default async function CustosAvulsosPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('variable_costs')
    .select('*')
    .order('date', { ascending: false })

  return <CustosAvulsosClient initialData={data ?? []} />
}

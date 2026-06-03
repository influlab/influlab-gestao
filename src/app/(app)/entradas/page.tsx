export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { EntradasClient } from './_components/entradas-client'

export default async function EntradasPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('revenue_entries')
    .select('*')
    .order('date', { ascending: false })

  return <EntradasClient initialData={data ?? []} />
}

export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { CustosFixosClient } from './_components/custos-fixos-client'

export default async function CustosFixosPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('fixed_costs')
    .select('*')
    .order('created_at', { ascending: false })

  return <CustosFixosClient initialData={data ?? []} />
}

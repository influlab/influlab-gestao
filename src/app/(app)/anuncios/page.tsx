export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { AnunciosClient } from './_components/anuncios-client'

export default async function AnunciosPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('ad_costs')
    .select('*')
    .order('date', { ascending: false })

  return <AnunciosClient initialData={data ?? []} />
}

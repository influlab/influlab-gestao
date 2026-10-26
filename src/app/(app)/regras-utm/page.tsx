export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { RegrasUtmClient } from './_components/regras-utm-client'

export default async function RegrasUtmPage() {
  const supabase = await createClient()
  const [regras, origens] = await Promise.all([
    supabase.from('regras_utm').select('*').order('priority'),
    supabase.from('origens').select('id, name').order('name'),
  ])

  return <RegrasUtmClient initialData={regras.data ?? []} origens={origens.data ?? []} />
}

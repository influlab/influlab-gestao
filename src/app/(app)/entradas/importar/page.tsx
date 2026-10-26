export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { ImportarClient } from './_components/importar-client'

export default async function ImportarCsvPage() {
  const supabase = await createClient()
  const { data: origens } = await supabase.from('origens').select('id, name').order('name')

  return <ImportarClient origens={origens ?? []} />
}

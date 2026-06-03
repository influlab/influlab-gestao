export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { AssinaturasClient } from './_components/assinaturas-client'

export default async function AssinaturasPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('subscriptions')
    .select('*')
    .order('created_at', { ascending: false })

  return <AssinaturasClient initialData={data ?? []} />
}

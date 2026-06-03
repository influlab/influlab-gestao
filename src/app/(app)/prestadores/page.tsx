export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { PrestadoresClient } from './_components/prestadores-client'

export default async function PrestadoresPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('service_providers')
    .select('*')
    .order('created_at', { ascending: false })

  return <PrestadoresClient initialData={data ?? []} />
}

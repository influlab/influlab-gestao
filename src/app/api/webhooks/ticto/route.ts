import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') ?? ''
  const expectedToken = process.env.TICTO_WEBHOOK_TOKEN ?? ''

  if (expectedToken && token !== expectedToken) {
    return new Response('Unauthorized', { status: 401 })
  }

  let payload: Record<string, unknown>
  try {
    payload = await request.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const status = (payload.status as string) ?? ''
  if (!['approved', 'paid', 'completed', 'refunded'].includes(status)) {
    return new Response('Ignored', { status: 200 })
  }

  const customer = payload.customer as Record<string, unknown> | undefined
  const product = payload.product as Record<string, unknown> | undefined

  await supabase.from('revenue_entries').insert({
    platform: 'ticto',
    transaction_id: (payload.id as string) ?? null,
    product_name: (product?.name as string) ?? null,
    gross_amount: parseFloat((payload.amount as string) ?? '0') / 100,
    net_amount: null,
    customer_name: (customer?.name as string) ?? null,
    customer_email: (customer?.email as string) ?? null,
    date: new Date().toISOString().split('T')[0],
    status: status === 'refunded' ? 'refunded' : 'approved',
    raw_payload: payload,
  })

  return new Response('OK', { status: 200 })
}

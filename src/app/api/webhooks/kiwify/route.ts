import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'

export async function GET() {
  return new Response('OK', { status: 200 })
}

export async function POST(request: NextRequest) {
  let payload: Record<string, unknown>
  try {
    payload = await request.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const order = payload.order as Record<string, unknown> | undefined
  if (!order) return new Response('No order in payload', { status: 400 })

  const eventType = (order.webhook_event_type as string) ?? ''
  const orderStatus = (order.order_status as string) ?? ''

  let status: string
  if (eventType === 'order_approved' || orderStatus === 'paid' || orderStatus === 'complete') {
    status = 'approved'
  } else if (eventType === 'order_refunded' || orderStatus === 'refunded') {
    status = 'refunded'
  } else {
    return new Response(`Ignored: eventType=${eventType} orderStatus=${orderStatus}`, { status: 200 })
  }

  const product = order.Product as Record<string, unknown> | undefined
  const customer = order.Customer as Record<string, unknown> | undefined
  const commissions = order.Commissions as Record<string, unknown> | undefined

  const rawDate = (order.approved_date as string) ?? (order.created_at as string) ?? null
  const date = rawDate ? rawDate.split(' ')[0] : new Date().toISOString().split('T')[0]

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { error } = await supabase.from('revenue_entries').insert({
    platform: 'kiwify',
    transaction_id: (order.order_id as string) ?? null,
    product_name: (product?.product_name as string) ?? null,
    gross_amount: (Number(commissions?.charge_amount) || 0) / 100,
    net_amount: commissions?.my_commission ? Number(commissions.my_commission) / 100 : null,
    customer_name: (customer?.full_name as string) ?? null,
    customer_email: (customer?.email as string) ?? null,
    date,
    status,
    raw_payload: payload,
  })

  if (error) {
    console.error('[kiwify webhook] DB error:', JSON.stringify(error))
    return new Response(`DB Error: ${error.message}`, { status: 500 })
  }

  return new Response('OK', { status: 200 })
}

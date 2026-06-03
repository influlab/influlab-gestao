import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import crypto from 'crypto'

export async function GET() {
  return new Response('OK', { status: 200 })
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('x-kiwify-signature') ?? ''
  const secret = process.env.KIWIFY_WEBHOOK_SECRET ?? ''

  if (secret) {
    const expected = crypto.createHmac('sha1', secret).update(body).digest('hex')
    if (signature !== expected) {
      return new Response('Unauthorized', { status: 401 })
    }
  }

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(body)
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const order = payload.order as Record<string, unknown> | undefined
  const customer = payload.customer as Record<string, unknown> | undefined
  const product = payload.product as Record<string, unknown> | undefined
  const status = (payload.order_status as string) ?? 'approved'

  if (!['paid', 'approved', 'complete'].includes(status) && status !== 'refunded') {
    return new Response('Ignored', { status: 200 })
  }

  await supabase.from('revenue_entries').insert({
    platform: 'kiwify',
    transaction_id: (order?.id as string) ?? null,
    product_name: (product?.name as string) ?? null,
    gross_amount: parseFloat((order?.total_value as string) ?? '0'),
    net_amount: parseFloat((order?.commission as Record<string, unknown>)?.store_value as string ?? '0') || null,
    customer_name: (customer?.full_name as string) ?? null,
    customer_email: (customer?.email as string) ?? null,
    date: new Date().toISOString().split('T')[0],
    status: status === 'refunded' ? 'refunded' : 'approved',
    raw_payload: payload,
  })

  return new Response('OK', { status: 200 })
}

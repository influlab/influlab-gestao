import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import crypto from 'crypto'

export async function GET() {
  return new Response('OK', { status: 200 })
}

// A Kiwify envia a assinatura como HMAC-SHA1 do corpo bruto no parâmetro
// ?signature= da URL do webhook, usando o token configurado no painel.
function isValidSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !secret) return false
  const expected = crypto.createHmac('sha1', secret).update(rawBody).digest('hex')
  const provided = Buffer.from(signature, 'hex')
  const computed = Buffer.from(expected, 'hex')
  if (provided.length !== computed.length) return false
  return crypto.timingSafeEqual(provided, computed)
}

export async function POST(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const rawBody = await request.text()
  const signature = request.nextUrl.searchParams.get('signature')
  const secret = process.env.KIWIFY_WEBHOOK_SECRET ?? ''
  const signatureValid = isValidSignature(rawBody, signature, secret)

  let payload: Record<string, unknown> | null = null
  try {
    payload = JSON.parse(rawBody)
  } catch {
    payload = null
  }

  const { data: logRow } = await supabase
    .from('webhook_logs')
    .insert({
      source: 'kiwify',
      payload: payload ?? { raw: rawBody },
      headers: Object.fromEntries(request.headers),
      signature_valid: signatureValid,
      processed: false,
      error: signatureValid ? null : 'Assinatura inválida ou ausente',
    })
    .select('id')
    .single()

  if (!signatureValid) {
    console.error('[kiwify webhook] Assinatura inválida')
    return new Response('Unauthorized', { status: 401 })
  }

  async function finish(response: Response, error?: string) {
    if (logRow?.id) {
      await supabase
        .from('webhook_logs')
        .update({ processed: !error, error: error ?? null })
        .eq('id', logRow.id)
    }
    return response
  }

  if (!payload) {
    return finish(new Response('Invalid JSON', { status: 400 }), 'JSON inválido')
  }

  const order = payload.order as Record<string, unknown> | undefined
  if (!order) {
    return finish(new Response('No order in payload', { status: 400 }), 'Payload sem "order"')
  }

  const eventType = (order.webhook_event_type as string) ?? ''
  const orderStatus = (order.order_status as string) ?? ''

  let status: string
  if (eventType === 'order_approved' || orderStatus === 'paid' || orderStatus === 'complete') {
    status = 'approved'
  } else if (eventType === 'order_refunded' || orderStatus === 'refunded') {
    status = 'refunded'
  } else {
    return finish(new Response(`Ignored: eventType=${eventType} orderStatus=${orderStatus}`, { status: 200 }))
  }

  const product = order.Product as Record<string, unknown> | undefined
  const customer = order.Customer as Record<string, unknown> | undefined
  const commissions = order.Commissions as Record<string, unknown> | undefined

  const rawDate = (order.approved_date as string) ?? (order.created_at as string) ?? null
  const date = rawDate ? rawDate.split(' ')[0] : new Date().toISOString().split('T')[0]

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
    return finish(new Response(`DB Error: ${error.message}`, { status: 500 }), error.message)
  }

  return finish(new Response('OK', { status: 200 }))
}

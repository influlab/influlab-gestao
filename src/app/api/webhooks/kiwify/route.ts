import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { calcularOrigemId, loadOrigemContext } from '@/lib/origem'

export async function GET() {
  return new Response('OK', { status: 200 })
}

// A Kiwify envia a assinatura como HMAC-SHA1 do corpo bruto no parâmetro
// ?signature= da URL do webhook, usando o token configurado no painel.
// Suporta múltiplas lojas/produtos Kiwify, cada uma com seu próprio token
// de webhook: KIWIFY_WEBHOOK_SECRET aceita uma lista separada por vírgula.
function isValidSignature(rawBody: string, signature: string | null, secrets: string[]): boolean {
  if (!signature || secrets.length === 0) return false
  const provided = Buffer.from(signature, 'hex')
  return secrets.some((secret) => {
    const expected = crypto.createHmac('sha1', secret).update(rawBody).digest('hex')
    const computed = Buffer.from(expected, 'hex')
    if (provided.length !== computed.length) return false
    return crypto.timingSafeEqual(provided, computed)
  })
}

export async function POST(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const rawBody = await request.text()
  const signature = request.nextUrl.searchParams.get('signature')
  const secrets = (process.env.KIWIFY_WEBHOOK_SECRET ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const signatureValid = isValidSignature(rawBody, signature, secrets)

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
      error: null,
    })
    .select('id')
    .single()

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

  // O corpo do webhook da Kiwify É o próprio pedido (order_id, Product, Customer,
  // Commissions etc. na raiz) — não existe um campo "order" envolvendo tudo.
  // A mesma URL também recebe outros tipos de evento sem relação com vendas
  // (ex.: carrinho abandonado, status "abandoned", sem order_id/Commissions) —
  // esses não exigem assinatura válida porque nunca são processados.
  const order = payload
  const isOrderEvent = typeof order.order_id === 'string' && order.order_id.length > 0
  if (!isOrderEvent) {
    return finish(new Response('Ignored: evento sem order_id (não é uma venda)', { status: 200 }))
  }

  if (!signatureValid) {
    console.error('[kiwify webhook] Assinatura inválida')
    return finish(new Response('Unauthorized', { status: 401 }), 'Assinatura inválida ou ausente')
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
  const tracking = order.TrackingParameters as Record<string, unknown> | undefined

  const rawDate = (order.approved_date as string) ?? (order.created_at as string) ?? null
  const date = rawDate ? rawDate.split(' ')[0] : new Date().toISOString().split('T')[0]
  const transactionId = order.order_id as string

  // Cria produto/afiliado automaticamente quando ainda não existem (upsert por
  // (platform, external_id), não sobrescreve default_origem_id/nickname/active
  // já configurados manualmente, porque essas colunas não entram no upsert).
  async function getOrCreateId(
    table: 'produtos' | 'afiliados',
    externalId: string | null | undefined,
    extra: Record<string, unknown>
  ): Promise<string | null> {
    if (!externalId) return null
    const { data, error } = await supabase
      .from(table)
      .upsert({ platform: 'kiwify', external_id: externalId, ...extra }, { onConflict: 'platform,external_id' })
      .select('id')
      .single()
    if (error) {
      console.error(`[kiwify webhook] erro ao criar/buscar ${table}:`, JSON.stringify(error))
      return null
    }
    return data?.id ?? null
  }

  const commissionedStores = (commissions?.commissioned_stores as Array<Record<string, unknown>> | undefined) ?? []
  const affiliateEntry = commissionedStores.find((s) => s.type === 'affiliate')

  const productId = await getOrCreateId('produtos', product?.product_id as string | undefined, {
    name: (product?.product_name as string) ?? null,
  })
  const affiliateId = await getOrCreateId('afiliados', affiliateEntry?.id as string | undefined, {
    name: (affiliateEntry?.custom_name as string) ?? null,
    email: (affiliateEntry?.email as string) ?? null,
  })

  const tracking_ = {
    utm_source: (tracking?.utm_source as string) ?? null,
    utm_medium: (tracking?.utm_medium as string) ?? null,
    utm_campaign: (tracking?.utm_campaign as string) ?? null,
    utm_content: (tracking?.utm_content as string) ?? null,
    utm_term: (tracking?.utm_term as string) ?? null,
    src: (tracking?.src as string) ?? null,
    sck: (tracking?.sck as string) ?? null,
  }
  const origemContext = await loadOrigemContext(supabase)
  const origemId = calcularOrigemId(tracking_, productId, affiliateId, origemContext)

  const revenueData = {
    platform: 'kiwify',
    transaction_id: transactionId,
    product_name: (product?.product_name as string) ?? null,
    gross_amount: (Number(commissions?.charge_amount) || 0) / 100,
    net_amount: commissions?.my_commission ? Number(commissions.my_commission) / 100 : null,
    customer_name: (customer?.full_name as string) ?? null,
    customer_email: (customer?.email as string) ?? null,
    date,
    status,
    raw_payload: payload,
    ...tracking_,
    product_id: productId,
    affiliate_id: affiliateId,
    origem_id: origemId,
    fonte: 'webhook',
  }

  // Idempotência: o mesmo pedido pode chegar várias vezes (aprovado, depois
  // reembolsado, ou reenviado pela Kiwify) — upsert por transaction_id em vez
  // de duplicar (trava garantida pela constraint unique (platform, transaction_id)).
  const { error } = await supabase
    .from('revenue_entries')
    .upsert(revenueData, { onConflict: 'platform,transaction_id' })

  if (error) {
    console.error('[kiwify webhook] DB error:', JSON.stringify(error))
    return finish(new Response(`DB Error: ${error.message}`, { status: 500 }), error.message)
  }

  return finish(new Response('OK', { status: 200 }))
}

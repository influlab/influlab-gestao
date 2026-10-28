import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { calcularOrigemId, loadOrigemContext, origemDoPedidoPrincipal } from '@/lib/origem'
import { resolveAfiliadoId } from '@/lib/afiliados'

export async function GET() {
  return new Response('OK', { status: 200 })
}

// A Ticto envia o token como campo de primeiro nível no corpo JSON (`token`),
// não como header nem query string (confirmado em help.ticto.com.br/.../webhook
// e webhook.ticto.dev/docs/v2 — a implementação anterior checava ?token= na URL,
// que a Ticto nunca envia, então nenhuma venda via webhook era validada).
function isValidToken(provided: string | null, secret: string): boolean {
  if (!provided || !secret) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(secret)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

// Status documentados em webhook.ticto.dev/docs/v2. "authorized" é a venda
// aprovada (não "approved"/"paid" como a implementação anterior assumia, por
// isso nenhuma venda nunca batia nesse filtro). Status fora deste mapa
// (abandoned_cart, trial, subscription_canceled, pix_expired tratado como
// cancelado etc.) são logados mas não geram linha em revenue_entries.
const STATUS_MAP: Record<string, string> = {
  authorized: 'approved',
  refunded: 'refunded',
  chargeback: 'refunded',
  refused: 'cancelled',
  pix_expired: 'cancelled',
  waiting_payment: 'pending',
  pix_created: 'pending',
  bank_slip_created: 'pending',
}

export async function POST(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const rawBody = await request.text()
  let payload: Record<string, unknown> | null = null
  try {
    payload = JSON.parse(rawBody)
  } catch {
    payload = null
  }

  const secret = process.env.TICTO_WEBHOOK_TOKEN ?? ''
  const tokenValid = payload ? isValidToken((payload.token as string) ?? null, secret) : false

  const { data: logRow } = await supabase
    .from('webhook_logs')
    .insert({
      source: 'ticto',
      payload: payload ?? { raw: rawBody },
      headers: Object.fromEntries(request.headers),
      signature_valid: tokenValid,
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

  if (!tokenValid) {
    console.error('[ticto webhook] Token inválido ou ausente')
    return finish(new Response('Unauthorized', { status: 401 }), 'Token inválido ou ausente')
  }

  const order = payload.order as Record<string, unknown> | undefined
  const orderHash = (order?.hash as string) ?? null
  if (!orderHash) {
    return finish(new Response('Ignored: evento sem order.hash (não é uma venda)', { status: 200 }))
  }

  const statusRaw = (payload.status as string) ?? ''
  const status = STATUS_MAP[statusRaw]
  if (!status) {
    return finish(new Response(`Ignored: status "${statusRaw}" não mapeado`, { status: 200 }))
  }

  const item = payload.item as Record<string, unknown> | undefined
  const customer = payload.customer as Record<string, unknown> | undefined
  const producer = payload.producer as Record<string, unknown> | undefined
  const affiliates = (payload.affiliates as Array<Record<string, unknown>> | undefined) ?? []
  const affiliateEntry = affiliates[0]
  const tracking = payload.tracking as Record<string, unknown> | undefined

  const naoInformado = (v: unknown) => (typeof v === 'string' && v !== 'Não Informado' ? v : null)

  // Sem campo documentado de "data de aprovação": status_date aproxima o
  // momento da aprovação pra vendas authorized; order_date (criação) pras demais.
  const statusDate = (payload.status_date as string) ?? null
  const orderDate = (order?.order_date as string) ?? null
  const rawDate = status === 'approved' ? (statusDate ?? orderDate) : (orderDate ?? statusDate)
  const date = rawDate ? rawDate.split(' ')[0] : new Date().toISOString().split('T')[0]

  // Upsert por (platform, external_id), igual ao webhook da Kiwify — não
  // sobrescreve default_origem_id/nickname/active configurados manualmente.
  async function getOrCreateId(
    table: 'produtos' | 'afiliados',
    externalId: string | number | null | undefined,
    extra: Record<string, unknown>
  ): Promise<string | null> {
    if (externalId === null || externalId === undefined || externalId === '') return null
    const { data, error } = await supabase
      .from(table)
      .upsert({ platform: 'ticto', external_id: String(externalId), ...extra }, { onConflict: 'platform,external_id' })
      .select('id')
      .single()
    if (error) {
      console.error(`[ticto webhook] erro ao criar/buscar ${table}:`, JSON.stringify(error))
      return null
    }
    return data?.id ?? null
  }

  const productId = await getOrCreateId('produtos', item?.product_id as string | number | undefined, {
    name: (item?.product_name as string) ?? null,
  })
  // Mesmo cuidado do webhook da Kiwify: busca por e-mail primeiro, porque o "id"
  // de dentro de affiliates[] pode ser por-venda em vez de por-afiliado.
  const affiliateId = await resolveAfiliadoId(supabase, 'ticto', {
    externalId: affiliateEntry?.id !== undefined && affiliateEntry?.id !== null ? String(affiliateEntry.id) : null,
    name: (affiliateEntry?.name as string) ?? null,
    email: (affiliateEntry?.email as string) ?? null,
  })

  // Mesmo critério do webhook da Kiwify: classificação por produto (flag
  // manual em /produtos), não por estrutura do payload — sem exemplo real
  // de order bump da Ticto ainda.
  let orderItemType: 'principal' | 'orderbump' = 'principal'
  if (productId) {
    const { data: produtoRow } = await supabase.from('produtos').select('is_orderbump').eq('id', productId).single()
    if (produtoRow?.is_orderbump) orderItemType = 'orderbump'
  }

  const tracking_ = {
    utm_source: naoInformado(tracking?.utm_source),
    utm_medium: naoInformado(tracking?.utm_medium),
    utm_campaign: naoInformado(tracking?.utm_campaign),
    utm_content: naoInformado(tracking?.utm_content),
    utm_term: naoInformado(tracking?.utm_term),
    src: naoInformado(tracking?.src),
    sck: naoInformado(tracking?.sck),
  }
  const origemContext = await loadOrigemContext(supabase)
  let origemId = calcularOrigemId(tracking_, productId, affiliateId, origemContext)

  const customerEmail = (customer?.email as string) ?? null
  if (orderItemType === 'orderbump') {
    const origemDoPrincipal = await origemDoPedidoPrincipal(supabase, 'ticto', customerEmail)
    if (origemDoPrincipal !== undefined) origemId = origemDoPrincipal
  }

  // paid_amount/item.amount são em centavos (confirmado: producer.amount bate
  // com producer.cms, ex. 11052 centavos == "110.52" de comissão).
  const grossCents = Number(order?.paid_amount) || Number(item?.amount) || 0
  const netCents = producer?.amount != null ? Number(producer.amount) : null

  const revenueData = {
    platform: 'ticto',
    transaction_id: orderHash,
    product_name: (item?.product_name as string) ?? null,
    gross_amount: grossCents / 100,
    net_amount: netCents !== null ? netCents / 100 : null,
    customer_name: (customer?.name as string) ?? null,
    customer_email: customerEmail,
    customer_document: (customer?.cpf as string) || (customer?.cnpj as string) || null,
    date,
    status,
    raw_payload: payload,
    ...tracking_,
    product_id: productId,
    affiliate_id: affiliateId,
    origem_id: origemId,
    order_item_type: orderItemType,
    fonte: 'webhook',
  }

  // Idempotência: o mesmo pedido chega de novo a cada mudança de status
  // (waiting_payment -> authorized -> refunded/chargeback) — upsert por
  // transaction_id (order.hash, estável durante todo o ciclo de vida do
  // pedido) em vez de duplicar.
  const { error } = await supabase
    .from('revenue_entries')
    .upsert(revenueData, { onConflict: 'platform,transaction_id' })

  if (error) {
    console.error('[ticto webhook] DB error:', JSON.stringify(error))
    return finish(new Response(`DB Error: ${error.message}`, { status: 500 }), error.message)
  }

  return finish(new Response('OK', { status: 200 }))
}

export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { EntradasClient } from './_components/entradas-client'

const PAGE_SIZE = 50

// Caracteres com significado especial na sintaxe de filtro do PostgREST
// (vírgula separa condições, parênteses agrupam) — removidos da busca pra
// não quebrar o .or() nem deixar o usuário montar um filtro diferente do
// pretendido. E-mail, ID da venda e CPF/CNPJ nunca legitimamente têm esses
// caracteres.
function sanitizeSearch(raw: string): string {
  return raw.trim().replace(/[,()]/g, '')
}

export default async function EntradasPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; platform?: string; q?: string }>
}) {
  const params = await searchParams
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1)
  const platform = params.platform && params.platform !== 'all' ? params.platform : null
  const q = sanitizeSearch(params.q ?? '')

  const supabase = await createClient()

  // revenue_entries tem ~77 mil linhas — select(*) sem paginação baixava a
  // tabela inteira (~55MB, 5+s) a cada navegação pra /entradas. Agora só
  // busca a página atual, com as colunas que a tela realmente mostra (sem
  // raw_payload/UTM/origem, que não aparecem aqui).
  let query = supabase
    .from('revenue_entries')
    .select('id, platform, product_name, gross_amount, net_amount, customer_name, customer_email, transaction_id, date, status', { count: 'exact' })
    .order('date', { ascending: false })
    .order('id', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

  if (platform) query = query.eq('platform', platform)
  if (q) {
    // "ID da venda" pode ser o transaction_id (importação/Ticto) ou o
    // order_ref dentro do raw_payload (vendas da Kiwify via webhook, que
    // usam o order_id/UUID como transaction_id — mesma distinção já tratada
    // no dedup do importador de CSV).
    query = query.or(
      `customer_email.ilike.%${q}%,transaction_id.ilike.%${q}%,customer_document.ilike.%${q}%,raw_payload->>order_ref.ilike.%${q}%`
    )
  }

  // Com busca ativa, o total "Líquido aprovado" tem que refletir só o que
  // bateu na busca — a função revenue_total_approved só agrega por
  // plataforma (não vale a pena parametrizar por busca livre pra um caso que
  // já devolve poucas linhas), então nesse caso soma direto os valores do
  // resultado filtrado em vez de usar a função.
  const totalApprovedQuery = q
    ? (async () => {
        let aq = supabase.from('revenue_entries').select('net_amount, gross_amount').eq('status', 'approved')
        if (platform) aq = aq.eq('platform', platform)
        aq = aq.or(
          `customer_email.ilike.%${q}%,transaction_id.ilike.%${q}%,customer_document.ilike.%${q}%,raw_payload->>order_ref.ilike.%${q}%`
        )
        const { data: approvedRows } = await aq
        return (approvedRows ?? []).reduce((s, r) => s + (r.net_amount ?? r.gross_amount ?? 0), 0)
      })()
    : supabase.rpc('revenue_total_approved', { p_platform: platform }).then(({ data }) => data ?? 0)

  const [{ data, count }, totalApproved] = await Promise.all([query, totalApprovedQuery])

  return (
    <EntradasClient
      initialData={data ?? []}
      totalCount={count ?? 0}
      page={page}
      pageSize={PAGE_SIZE}
      platform={platform ?? 'all'}
      q={params.q ?? ''}
      totalApproved={totalApproved}
    />
  )
}

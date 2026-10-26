import type { SupabaseClient } from '@supabase/supabase-js'

// Prioridade de cálculo da origem de uma venda (dashboard-kiwify-spec.md):
// 1. Regra de UTM mais específica (menor "priority" vence)
// 2. Mapeamento por produto (default_origem_id)
// 3. Venda de afiliado sem regra -> "Afiliados"
// 4. Senão -> "Não identificado"

export type TrackingFields = {
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  utm_content?: string | null
  utm_term?: string | null
  src?: string | null
  sck?: string | null
}

type RegraUtm = {
  field: string
  operator: string
  value: string
  origem_id: string
  priority: number
}

type Produto = { id: string; default_origem_id: string | null }

export type OrigemContext = {
  regras: RegraUtm[]
  produtos: Produto[]
  origemAfiliadosId: string | null
  origemNaoIdentificadoId: string | null
}

export async function loadOrigemContext(supabase: SupabaseClient): Promise<OrigemContext> {
  const [regrasRes, produtosRes, origensRes] = await Promise.all([
    supabase.from('regras_utm').select('field, operator, value, origem_id, priority').eq('active', true),
    supabase.from('produtos').select('id, default_origem_id'),
    supabase.from('origens').select('id, name'),
  ])
  const origens = (origensRes.data ?? []) as { id: string; name: string }[]
  return {
    regras: ((regrasRes.data ?? []) as RegraUtm[]).sort((a, b) => a.priority - b.priority),
    produtos: (produtosRes.data ?? []) as Produto[],
    origemAfiliadosId: origens.find((o) => o.name === 'Afiliados')?.id ?? null,
    origemNaoIdentificadoId: origens.find((o) => o.name === 'Não identificado')?.id ?? null,
  }
}

export function calcularOrigemId(
  tracking: TrackingFields,
  productId: string | null,
  affiliateId: string | null,
  ctx: OrigemContext
): string | null {
  const fields: Record<string, string | null | undefined> = {
    utm_source: tracking.utm_source,
    utm_medium: tracking.utm_medium,
    utm_campaign: tracking.utm_campaign,
    utm_content: tracking.utm_content,
    utm_term: tracking.utm_term,
    src: tracking.src,
    sck: tracking.sck,
  }

  for (const regra of ctx.regras) {
    const fieldValue = fields[regra.field]
    if (!fieldValue) continue
    const haystack = fieldValue.toLowerCase()
    const needle = regra.value.toLowerCase()
    const matches =
      regra.operator === 'igual' ? haystack === needle
      : regra.operator === 'contem' ? haystack.includes(needle)
      : regra.operator === 'comeca_com' ? haystack.startsWith(needle)
      : false
    if (matches) return regra.origem_id
  }

  if (productId) {
    const produto = ctx.produtos.find((p) => p.id === productId)
    if (produto?.default_origem_id) return produto.default_origem_id
  }

  if (affiliateId && ctx.origemAfiliadosId) return ctx.origemAfiliadosId

  return ctx.origemNaoIdentificadoId
}

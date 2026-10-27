import type { SupabaseClient } from '@supabase/supabase-js'

// O campo "id" que vem dentro de Commissions.commissioned_stores (Kiwify) ou
// affiliates[] (Ticto) identifica o registro de COMISSÃO daquela venda, não o
// afiliado em si — ele muda a cada venda, mesmo pro mesmo afiliado real
// (confirmado comparando várias vendas do mesmo e-mail). Usar isso como
// external_id criava um registro novo em `afiliados` a cada venda, duplicando
// o mesmo afiliado dezenas de vezes e quebrando a soma de "vendas por
// afiliado" no dashboard. O e-mail é o único campo estável observado — busca
// por e-mail primeiro, só cria/usa o external_id quando não há e-mail.
export async function resolveAfiliadoId(
  supabase: SupabaseClient,
  platform: string,
  info: { externalId: string | null; email: string | null; name: string | null }
): Promise<string | null> {
  if (info.email) {
    const { data: existente } = await supabase
      .from('afiliados')
      .select('id')
      .eq('platform', platform)
      .ilike('email', info.email)
      .limit(1)
      .maybeSingle()
    if (existente?.id) return existente.id
  }

  if (!info.externalId) return null
  const { data, error } = await supabase
    .from('afiliados')
    .upsert(
      { platform, external_id: info.externalId, name: info.name, email: info.email },
      { onConflict: 'platform,external_id' }
    )
    .select('id')
    .single()
  if (error) {
    console.error('[afiliados] erro ao criar/buscar afiliado:', JSON.stringify(error))
    return null
  }
  return data?.id ?? null
}

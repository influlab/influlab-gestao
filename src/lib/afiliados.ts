import type { SupabaseClient } from '@supabase/supabase-js'
import crypto from 'crypto'

// O campo "id" que vem dentro de Commissions.commissioned_stores (Kiwify) ou
// affiliates[] (Ticto) identifica o registro de COMISSÃO daquela venda, não o
// afiliado em si — ele muda a cada venda, mesmo pro mesmo afiliado real
// (confirmado comparando várias vendas do mesmo e-mail). Usar isso como
// external_id criava um registro novo em `afiliados` a cada venda, duplicando
// o mesmo afiliado dezenas de vezes e quebrando a soma de "vendas por
// afiliado" no dashboard. O e-mail é o único campo estável observado.
//
// Buscar por e-mail com um select antes de decidir criar (SELECT-então-INSERT)
// não é atômico: quando dois webhooks do mesmo afiliado chegam quase ao mesmo
// tempo (ex.: produto principal + order bump da mesma venda, cada um com sua
// própria requisição), os dois fazem o select antes de qualquer um gravar, e
// cada um cria um registro novo — confirmado em produção, duplicatas criadas
// a poucos milissegundos de diferença mesmo com esse código já no ar. Por
// isso o caminho com e-mail usa upsert por (platform, email) direto (migration
// 008, índice único), que o Postgres resolve de forma atômica mesmo sob
// concorrência — sem select antes.
export async function resolveAfiliadoId(
  supabase: SupabaseClient,
  platform: string,
  info: { externalId: string | null; email: string | null; name: string | null }
): Promise<string | null> {
  if (info.email) {
    const email = info.email.toLowerCase()
    const { data, error } = await supabase
      .from('afiliados')
      .upsert(
        { platform, email, external_id: info.externalId ?? crypto.randomUUID(), name: info.name },
        { onConflict: 'platform,email' }
      )
      .select('id')
      .single()
    if (!error) return data?.id ?? null
    console.error('[afiliados] erro ao criar/buscar afiliado por e-mail:', JSON.stringify(error))
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

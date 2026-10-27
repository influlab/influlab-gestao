export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { CONFIGURACOES_DEFAULT } from '@/lib/impostos'
import { UsuariosClient } from './_components/usuarios-client'
import { ImpostosClient } from './_components/impostos-client'

type AppUser = {
  id: string
  email: string
  name: string
  role: 'admin' | 'member'
  active: boolean
  created_at: string
}

async function getUsers(): Promise<AppUser[]> {
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('app_users')
      .select('id, email, name, role, active, created_at')
      .order('created_at', { ascending: true })
    return data ?? []
  } catch {
    return []
  }
}

async function getConfig() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('configuracoes')
    .select('id, aliquota_imposto_mensal, aliquota_reserva_trimestral, base_imposto')
    .limit(1)
    .maybeSingle()
  return data ?? { id: null, ...CONFIGURACOES_DEFAULT }
}

export default async function ConfiguracoesPage() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://seu-dominio.com'
  const users = await getUsers()
  const config = await getConfig()

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Configurações</h2>

      <div className="space-y-6 max-w-2xl">
        <UsuariosClient initialUsers={users} />

        <ImpostosClient initialConfig={config} />

        <div className="bg-white rounded-xl border p-6">
          <h3 className="font-semibold text-gray-900 mb-1">Webhooks de Vendas</h3>
          <p className="text-sm text-gray-500 mb-4">
            Configure estas URLs nas plataformas de venda para receber as entradas automaticamente.
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kiwify — URL do Webhook</label>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={`${appUrl}/api/webhooks/kiwify?token=SEU_TOKEN`}
                  className="flex-1 border rounded-lg px-3 py-2 text-sm bg-gray-50 font-mono"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Substitua SEU_TOKEN pelo valor de KIWIFY_WEBHOOK_SECRET configurado no EasyPanel.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ticto — URL do Webhook</label>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={`${appUrl}/api/webhooks/ticto`}
                  className="flex-1 border rounded-lg px-3 py-2 text-sm bg-gray-50 font-mono"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                A Ticto envia o token de autenticação dentro do corpo da requisição (campo <code>token</code>), não na URL — cole essa URL sem parâmetros no painel da Ticto (Tictools → Webhooks) e configure lá o mesmo valor de TICTO_WEBHOOK_TOKEN do EasyPanel.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border p-6">
          <h3 className="font-semibold text-gray-900 mb-1">Variáveis de Ambiente</h3>
          <p className="text-sm text-gray-500 mb-4">Configure estas variáveis no EasyPanel (Serviço → Environment):</p>
          <div className="bg-gray-900 rounded-lg p-4 text-sm font-mono text-green-400 space-y-1">
            <div>NEXT_PUBLIC_SUPABASE_URL=http://seu-vps:8000</div>
            <div>NEXT_PUBLIC_SUPABASE_ANON_KEY=...</div>
            <div>SUPABASE_SERVICE_ROLE_KEY=...</div>
            <div>NEXT_PUBLIC_APP_URL=https://seu-dominio.com</div>
            <div>KIWIFY_WEBHOOK_SECRET=...</div>
            <div>TICTO_WEBHOOK_TOKEN=...</div>
          </div>
        </div>
      </div>
    </div>
  )
}

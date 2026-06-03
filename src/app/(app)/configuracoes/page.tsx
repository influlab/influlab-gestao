export const dynamic = 'force-dynamic'

export default function ConfiguracoesPage() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://seu-dominio.com'

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Configurações</h2>

      <div className="space-y-6 max-w-2xl">
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
                  value={`${appUrl}/api/webhooks/kiwify`}
                  className="flex-1 border rounded-lg px-3 py-2 text-sm bg-gray-50 font-mono"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                No painel Kiwify: Configurações → Webhooks → adicionar esta URL. Configure o mesmo valor de KIWIFY_WEBHOOK_SECRET.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ticto — URL do Webhook</label>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={`${appUrl}/api/webhooks/ticto?token=SEU_TOKEN`}
                  className="flex-1 border rounded-lg px-3 py-2 text-sm bg-gray-50 font-mono"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Substitua SEU_TOKEN pelo valor de TICTO_WEBHOOK_TOKEN configurado no EasyPanel.
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

        <div className="bg-white rounded-xl border p-6">
          <h3 className="font-semibold text-gray-900 mb-1">Convidar usuários</h3>
          <p className="text-sm text-gray-500">
            Para adicionar membros da equipe, acesse o Supabase Studio → Authentication → Users → Invite user.
            A conta deve usar o mesmo domínio configurado nas políticas RLS.
          </p>
        </div>
      </div>
    </div>
  )
}

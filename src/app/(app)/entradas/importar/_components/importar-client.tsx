'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useIsAdmin } from '@/components/role-context'
import { OrigemSelect, type Origem } from '@/components/origem-select'
import { calcularOrigemId, type OrigemContext } from '@/lib/origem'
import { resolveAfiliadoId } from '@/lib/afiliados'
import { parseCSV } from '@/lib/csv'
import { formatBRL } from '@/lib/utils'
import { ArrowLeft, Upload, AlertTriangle } from 'lucide-react'

// Mapeamento do status nativo da Kiwify pro enum de status usado no app.
// "chargedback" (estorno pela operadora do cartão) é tratado como "refunded"
// porque, na prática, o dinheiro também volta pro cliente.
const STATUS_MAP: Record<string, string> = {
  paid: 'approved',
  waiting_payment: 'pending',
  refused: 'cancelled',
  refunded: 'refunded',
  chargedback: 'refunded',
}
const STATUS_LABELS: Record<string, string> = {
  approved: 'Aprovado',
  pending: 'Pendente',
  cancelled: 'Cancelado',
  refunded: 'Reembolsado',
}

const REQUIRED_HEADERS = ['ID da venda', 'Status', 'Produto', 'Data de Criação', 'Preço base do produto']

type ParsedRow = {
  line: number
  orderRef: string
  productName: string | null
  productId: string | null
  grossAmount: number | null
  netAmount: number | null
  customerName: string | null
  customerEmail: string | null
  customerDocument: string | null
  affiliateName: string | null
  affiliateEmail: string | null
  date: string | null
  status: string
  origemId: string | null
  origemNome: string | null
  orderItemType: 'principal' | 'orderbump'
  duplicate: boolean
  errors: string[]
  tracking: {
    utm_source: string | null
    utm_medium: string | null
    utm_campaign: string | null
    utm_content: string | null
    utm_term: string | null
    src: string | null
    sck: string | null
  }
}

function parseNumber(raw: string): number | null {
  const s = raw.trim()
  if (!s) return null
  const normalized = /,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

// Aceita "AAAA-MM-DD", "DD/MM/AAAA" ou "DD/MM/AAAA HH:MM:SS" (formato do export da Kiwify).
function parseDate(raw: string): string | null {
  const s = raw.trim().split(' ')[0]
  if (!s) return null

  let y = 0, m = 0, d = 0
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    ;[y, m, d] = s.split('-').map(Number)
  } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [dd, mm, yyyy] = s.split('/').map(Number)
    d = dd; m = mm; y = yyyy
  } else {
    return null
  }

  const date = new Date(Date.UTC(y, m - 1, d))
  const valid = date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
  if (!valid) return null
  return `${y.toString().padStart(4, '0')}-${m.toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`
}

export function ImportarClient({
  origens: initialOrigens,
  origemContext,
  produtosNome,
  existingOrderRefs,
}: {
  origens: Origem[]
  origemContext: OrigemContext
  produtosNome: { id: string; name: string; is_orderbump: boolean }[]
  existingOrderRefs: [string, string][]
}) {
  const isAdmin = useIsAdmin()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [origens, setOrigens] = useState(initialOrigens)
  const [fallbackOrigemId, setFallbackOrigemId] = useState('')
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [globalError, setGlobalError] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ inserted: number; failed: number; affiliatesBackfilled: number; documentsBackfilled: number; error?: string } | null>(null)

  const produtoIdByName = useMemo(() => new Map(produtosNome.map((p) => [p.name, p.id])), [produtosNome])
  const orderbumpProductIds = useMemo(() => new Set(produtosNome.filter((p) => p.is_orderbump).map((p) => p.id)), [produtosNome])
  const origemNomeById = useMemo(() => new Map(origens.map((o) => [o.id, o.name])), [origens])
  const rowIdByOrderRef = useMemo(() => new Map(existingOrderRefs), [existingOrderRefs])
  const existingRefsSet = useMemo(() => new Set(rowIdByOrderRef.keys()), [rowIdByOrderRef])

  if (!isAdmin) {
    return <p className="text-sm text-gray-500">Você não tem permissão para importar dados.</p>
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setResult(null)
    setGlobalError('')

    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      const table = parseCSV(text).filter(r => r.some(c => c.trim() !== ''))
      if (table.length === 0) {
        setGlobalError('O arquivo está vazio.')
        setRows([])
        return
      }

      const header = table[0].map(h => h.trim())
      const missing = REQUIRED_HEADERS.filter(h => !header.includes(h))
      if (missing.length > 0) {
        setGlobalError(
          `Esse arquivo não parece ser o export de vendas da Kiwify — faltam as colunas: ${missing.join(', ')}. ` +
          `No painel da Kiwify: Vendas → Exportar.`
        )
        setRows([])
        return
      }

      const idx = (name: string) => header.indexOf(name)
      const parsed: ParsedRow[] = table.slice(1).map((cols, i) => {
        const get = (name: string) => {
          const colIdx = idx(name)
          return colIdx === -1 ? '' : (cols[colIdx] ?? '').trim()
        }
        const errors: string[] = []

        const orderRef = get('ID da venda')
        if (!orderRef) errors.push('"ID da venda" ausente')

        const statusRaw = get('Status').toLowerCase()
        const status = STATUS_MAP[statusRaw]
        if (!status) errors.push(`status desconhecido: "${statusRaw}"`)

        const moeda = get('Moeda')
        if (moeda && moeda !== 'BRL') errors.push(`moeda não suportada: ${moeda}`)

        // Pra vendas aprovadas, "Data de Atualização" aproxima o momento da
        // aprovação (quando o status mudou pra "paid"); pras demais, usamos a
        // criação — já que não existe uma coluna "Data de aprovação" no export.
        const dateRaw = status === 'approved' ? (get('Data de Atualização') || get('Data de Criação')) : get('Data de Criação')
        const date = parseDate(dateRaw)
        if (!date) errors.push('data inválida')

        const grossRaw = get('Total com acréscimo') || get('Preço base do produto')
        const gross = parseNumber(grossRaw)
        if (gross === null || gross <= 0) errors.push('valor bruto inválido')

        const netRaw = get('Valor líquido')
        const net = netRaw ? parseNumber(netRaw) : null

        const productName = get('Produto') || null
        const productId = productName ? produtoIdByName.get(productName) ?? null : null

        const tracking = {
          utm_source: get('Tracking utm_source') || null,
          utm_medium: get('Tracking utm_medium') || null,
          utm_campaign: get('Tracking utm_campaign') || null,
          utm_content: get('Tracking utm_content') || null,
          utm_term: get('Tracking utm_term') || null,
          src: get('Tracking src') || null,
          sck: get('Tracking sck') || null,
        }

        let origemId = calcularOrigemId(tracking, productId, null, origemContext)
        if (origemId === origemContext.origemNaoIdentificadoId && fallbackOrigemId) {
          origemId = fallbackOrigemId
        }

        const duplicate = orderRef ? existingRefsSet.has(orderRef) : false
        const orderItemType: 'principal' | 'orderbump' = productId && orderbumpProductIds.has(productId) ? 'orderbump' : 'principal'

        return {
          line: i + 2,
          orderRef,
          productName,
          productId,
          grossAmount: gross,
          netAmount: net,
          customerName: get('Cliente') || null,
          customerEmail: get('Email') || null,
          customerDocument: get('CPF / CNPJ') || null,
          affiliateName: get('Nome do afiliado') || null,
          affiliateEmail: get('Email do afiliado') || null,
          date,
          status: status ?? statusRaw,
          origemId,
          origemNome: origemId ? origemNomeById.get(origemId) ?? null : null,
          orderItemType,
          duplicate,
          errors,
          tracking,
        }
      })

      // Order bump veio "de carona" na mesma compra do produto principal — não
      // tem tráfego próprio, então herda a origem do principal em vez da
      // calculada isoladamente (que cairia no padrão do produto bump ou em
      // "Não identificado"). O CSV não traz um id de pedido compartilhado entre
      // os dois, então o proxy é e-mail do cliente + mesmo dia (mesma
      // aproximação usada no webhook, mas por dia em vez de por minutos, já
      // que o export não guarda o horário da venda).
      const origemPrincipalPorGrupo = new Map<string, string | null>()
      for (const r of parsed) {
        if (r.orderItemType !== 'principal' || !r.customerEmail || !r.date) continue
        const key = `${r.customerEmail.toLowerCase()}|${r.date}`
        if (!origemPrincipalPorGrupo.has(key)) origemPrincipalPorGrupo.set(key, r.origemId)
      }
      for (const r of parsed) {
        if (r.orderItemType !== 'orderbump' || !r.customerEmail || !r.date) continue
        const key = `${r.customerEmail.toLowerCase()}|${r.date}`
        if (origemPrincipalPorGrupo.has(key)) {
          r.origemId = origemPrincipalPorGrupo.get(key) ?? null
          r.origemNome = r.origemId ? origemNomeById.get(r.origemId) ?? null : null
        }
      }

      setRows(parsed)
    }
    reader.readAsText(file, 'utf-8')
  }

  const validRows = rows.filter(r => r.errors.length === 0 && !r.duplicate)
  const duplicateRows = rows.filter(r => r.errors.length === 0 && r.duplicate)
  const invalidRows = rows.filter(r => r.errors.length > 0)

  async function handleImport() {
    // Vendas já existentes no banco (duplicate=true) não são reimportadas,
    // mas podem ter vindo de uma importação anterior a este fix e estar sem
    // afiliado vinculado — ainda vale reprocessar essas pra fazer o backfill
    // abaixo, mesmo quando não sobra nenhuma linha nova pra inserir.
    const duplicatesComAfiliado = duplicateRows.filter(r => r.affiliateEmail)
    const duplicatesComDocumento = duplicateRows.filter(r => r.customerDocument)
    if (validRows.length === 0 && duplicatesComAfiliado.length === 0 && duplicatesComDocumento.length === 0) return
    setImporting(true)
    setResult(null)

    // O export traz nome/e-mail do afiliado por linha (não o código interno
    // da Kiwify) — resolve por e-mail (resolveAfiliadoId), mesma lógica usada
    // pelos webhooks, reaproveitando o afiliado existente em vez de duplicar.
    // Resolvido uma vez por e-mail único antes de montar o payload, pra não
    // repetir o upsert pra cada linha do mesmo afiliado.
    const afiliadoIdByEmail = new Map<string, string | null>()
    const afiliadosUnicos = new Map<string, string | null>()
    for (const r of [...validRows, ...duplicatesComAfiliado]) {
      if (!r.affiliateEmail) continue
      const key = r.affiliateEmail.toLowerCase()
      if (!afiliadosUnicos.has(key)) afiliadosUnicos.set(key, r.affiliateName)
    }
    for (const [email, name] of afiliadosUnicos) {
      const id = await resolveAfiliadoId(supabase, 'kiwify', { externalId: null, email, name })
      afiliadoIdByEmail.set(email, id)
    }

    const payload = validRows.map(r => ({
      platform: 'kiwify',
      transaction_id: r.orderRef,
      product_name: r.productName,
      gross_amount: r.grossAmount,
      net_amount: r.netAmount,
      customer_name: r.customerName,
      customer_email: r.customerEmail,
      customer_document: r.customerDocument,
      date: r.date,
      status: r.status,
      utm_source: r.tracking.utm_source,
      utm_medium: r.tracking.utm_medium,
      utm_campaign: r.tracking.utm_campaign,
      utm_content: r.tracking.utm_content,
      utm_term: r.tracking.utm_term,
      src: r.tracking.src,
      sck: r.tracking.sck,
      product_id: r.productId,
      affiliate_id: r.affiliateEmail ? afiliadoIdByEmail.get(r.affiliateEmail.toLowerCase()) ?? null : null,
      origem_id: r.origemId,
      order_item_type: r.orderItemType,
      fonte: 'importacao',
    }))

    let inserted = 0
    const chunkSize = 200
    for (let i = 0; i < payload.length; i += chunkSize) {
      const chunk = payload.slice(i, i + chunkSize)
      const { error, count } = await supabase
        .from('revenue_entries')
        .upsert(chunk, { onConflict: 'platform,transaction_id', count: 'exact' })
      if (error) {
        setResult({ inserted, failed: payload.length - inserted, affiliatesBackfilled: 0, documentsBackfilled: 0, error: error.message })
        setImporting(false)
        return
      }
      inserted += count ?? chunk.length
    }

    // Backfill: vendas que já estavam no banco (fora do upsert acima) ganham
    // o afiliado/CPF agora, se o CSV trazia esse dado mas a venda foi
    // importada antes desse vínculo existir. Update direto por "id" (não
    // upsert por platform+transaction_id): pra vendas vindas do webhook da
    // Kiwify, o transaction_id de verdade é o order_id (UUID) — o "ID da
    // venda" do CSV só bate com raw_payload.order_ref nesse caso — então um
    // upsert por transaction_id não encontra conflito e tenta inserir uma
    // linha nova, que falha por faltar coluna obrigatória (confirmado rodando
    // em produção). Com "id" o update sempre acerta a linha certa. Em
    // paralelo controlado porque não dá pra batelar valores diferentes por
    // linha num update só.
    async function runWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
      let i = 0
      async function worker() {
        while (i < items.length) {
          const item = items[i++]
          await fn(item)
        }
      }
      await Promise.all(Array.from({ length: limit }, worker))
    }

    let affiliatesBackfilled = 0
    const backfillAfiliado = duplicatesComAfiliado
      .map(r => ({ rowId: rowIdByOrderRef.get(r.orderRef), affiliateId: r.affiliateEmail ? afiliadoIdByEmail.get(r.affiliateEmail.toLowerCase()) ?? null : null }))
      .filter((r): r is { rowId: string; affiliateId: string } => !!r.rowId && !!r.affiliateId)
    await runWithConcurrency(backfillAfiliado, 20, async (c) => {
      const { error } = await supabase.from('revenue_entries').update({ affiliate_id: c.affiliateId }).eq('id', c.rowId)
      if (!error) affiliatesBackfilled++
    })

    let documentsBackfilled = 0
    const backfillDocumento = duplicatesComDocumento
      .map(r => ({ rowId: rowIdByOrderRef.get(r.orderRef), document: r.customerDocument }))
      .filter((r): r is { rowId: string; document: string } => !!r.rowId && !!r.document)
    await runWithConcurrency(backfillDocumento, 20, async (c) => {
      const { error } = await supabase.from('revenue_entries').update({ customer_document: c.document }).eq('id', c.rowId)
      if (!error) documentsBackfilled++
    })

    setResult({ inserted, failed: 0, affiliatesBackfilled, documentsBackfilled })
    setRows([])
    setFileName('')
    if (fileInputRef.current) fileInputRef.current.value = ''
    setImporting(false)
  }

  return (
    <div>
      <div className="mb-4">
        <Link href="/entradas" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft size={14} /> Voltar para Entradas
        </Link>
      </div>

      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Importar histórico (CSV da Kiwify)</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Importa o export nativo de vendas da Kiwify (painel da Kiwify: Vendas → Exportar).
        </p>
      </div>

      <div className="bg-white rounded-xl border p-6 space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Arquivo CSV</label>
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFile} className="block w-full text-sm" />
          {fileName && <p className="text-xs text-gray-400 mt-1">{fileName}</p>}
          <p className="text-xs text-gray-400 mt-2">
            Usa as colunas do export da Kiwify (<code>ID da venda</code>, <code>Status</code>, <code>Produto</code>,{' '}
            <code>Preço base do produto</code>/<code>Total com acréscimo</code>, <code>Valor líquido</code>, datas, tracking UTM etc.).
            {' '}Vendas que já estão no sistema (via webhook ou importação anterior) são detectadas e ignoradas automaticamente —
            não duplicam. Origem é calculada por linha (regra de UTM → produto mapeado → origem padrão abaixo).
            {' '}Afiliado é vinculado por e-mail (colunas &quot;Nome do afiliado&quot;/&quot;Email do afiliado&quot; do export) — reaproveita o afiliado existente quando o e-mail já é conhecido.
          </p>
        </div>

        <div className="max-w-xs">
          <label className="block text-sm font-medium text-gray-700 mb-1">Origem padrão (sem regra de UTM nem produto mapeado)</label>
          <OrigemSelect
            origens={origens}
            onOrigensChange={setOrigens}
            value={fallbackOrigemId}
            onChange={setFallbackOrigemId}
            allowEmpty
            emptyLabel='Nenhuma (fica como "Não identificado")'
          />
        </div>

        {globalError && (
          <p className="text-sm text-red-600 flex items-center gap-1"><AlertTriangle size={14} /> {globalError}</p>
        )}
      </div>

      {rows.length > 0 && (
        <div className="bg-white rounded-xl border overflow-hidden mb-6">
          <div className="px-4 py-3 border-b flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-gray-600">
              {validRows.length} válida(s)
              {validRows.filter(r => r.affiliateEmail).length > 0 && (
                <span className="text-gray-500"> · {validRows.filter(r => r.affiliateEmail).length} com afiliado</span>
              )}
              {duplicateRows.length > 0 && <span className="text-amber-600"> · {duplicateRows.length} já existe(m) (ignoradas)</span>}
              {invalidRows.length > 0 && <span className="text-red-600"> · {invalidRows.length} com erro</span>}
            </p>
            <button
              onClick={handleImport}
              disabled={importing || (validRows.length === 0 && duplicateRows.every(r => !r.affiliateEmail && !r.customerDocument))}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              <Upload size={16} /> {importing ? 'Importando...' : `Importar ${validRows.length} registro(s)`}
            </button>
          </div>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Linha</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Data</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Produto</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Bruto</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Líquido</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Status</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Origem</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Afiliado</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Validação</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.line} className={`border-b last:border-0 ${r.errors.length > 0 ? 'bg-red-50' : r.duplicate ? 'bg-amber-50' : ''}`}>
                    <td className="px-3 py-2 text-gray-500">{r.line}</td>
                    <td className="px-3 py-2">{r.date ?? '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{r.productName ?? '—'}</td>
                    <td className="px-3 py-2 text-right">{r.grossAmount !== null ? formatBRL(r.grossAmount) : '—'}</td>
                    <td className="px-3 py-2 text-right">{r.netAmount !== null ? formatBRL(r.netAmount) : '—'}</td>
                    <td className="px-3 py-2">{STATUS_LABELS[r.status] ?? r.status}</td>
                    <td className="px-3 py-2 text-gray-600">{r.origemNome ?? '—'}</td>
                    <td className="px-3 py-2 text-gray-600">{r.affiliateName ?? '—'}</td>
                    <td className="px-3 py-2">
                      {r.errors.length > 0 ? (
                        <span className="text-red-600 text-xs">{r.errors.join('; ')}</span>
                      ) : r.duplicate ? (
                        <span className="text-amber-600 text-xs">Já existe</span>
                      ) : (
                        <span className="text-green-600 text-xs">OK</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {result && (
        <div className={`rounded-xl border p-4 text-sm ${result.error ? 'bg-red-50 border-red-200 text-red-700' : 'bg-green-50 border-green-200 text-green-700'}`}>
          {result.error
            ? `Falha ao importar: ${result.error} (${result.inserted} de ${result.inserted + result.failed} importados antes do erro)`
            : `${result.inserted} entrada(s) importada(s) com sucesso.${result.affiliatesBackfilled > 0 ? ` ${result.affiliatesBackfilled} venda(s) já existente(s) tiveram o afiliado vinculado agora.` : ''}${result.documentsBackfilled > 0 ? ` ${result.documentsBackfilled} venda(s) já existente(s) tiveram o CPF/CNPJ vinculado agora.` : ''}`}
        </div>
      )}
    </div>
  )
}

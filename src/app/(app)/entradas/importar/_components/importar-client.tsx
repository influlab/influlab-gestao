'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useIsAdmin } from '@/components/role-context'
import { OrigemSelect, type Origem } from '@/components/origem-select'
import { parseCSV } from '@/lib/csv'
import { formatBRL } from '@/lib/utils'
import { ArrowLeft, Upload, Download, CheckCircle2, AlertTriangle } from 'lucide-react'

const PLATFORMS = ['kiwify', 'ticto', 'manual', 'other']
const PLATFORM_LABELS: Record<string, string> = { kiwify: 'Kiwify', ticto: 'Ticto', manual: 'Manual', other: 'Outro' }
const STATUSES = ['approved', 'refunded', 'pending', 'cancelled']
const STATUS_LABELS: Record<string, string> = { approved: 'Aprovado', refunded: 'Reembolsado', pending: 'Pendente', cancelled: 'Cancelado' }

const REQUIRED_HEADERS = ['data', 'valor_bruto']

const TEMPLATE_CSV = `data,plataforma,produto,valor_bruto,valor_liquido,cliente,email,status,transaction_id
2026-03-15,kiwify,Curso de Edição,497.00,420.00,Maria Souza,maria@email.com,approved,abc123
`

type ParsedRow = {
  line: number
  platform: string
  product_name: string | null
  gross_amount: number | null
  net_amount: number | null
  customer_name: string | null
  customer_email: string | null
  transaction_id: string | null
  date: string | null
  status: string
  errors: string[]
}

function parseNumber(raw: string): number | null {
  const s = raw.trim()
  if (!s) return null
  const normalized = /,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

function parseDate(raw: string): string | null {
  const s = raw.trim()
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

export function ImportarClient({ origens: initialOrigens }: { origens: Origem[] }) {
  const isAdmin = useIsAdmin()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [origens, setOrigens] = useState(initialOrigens)
  const [origemId, setOrigemId] = useState('')
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [globalError, setGlobalError] = useState('')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ inserted: number; failed: number; error?: string } | null>(null)

  if (!isAdmin) {
    return <p className="text-sm text-gray-500">Você não tem permissão para importar dados.</p>
  }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'modelo-importacao-entradas.csv'
    a.click()
    URL.revokeObjectURL(url)
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

      const header = table[0].map(h => h.trim().toLowerCase())
      const missing = REQUIRED_HEADERS.filter(h => !header.includes(h))
      if (missing.length > 0) {
        setGlobalError(`Faltam as colunas obrigatórias: ${missing.join(', ')}.`)
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

        const date = parseDate(get('data'))
        if (!date) errors.push('data inválida')

        const gross = parseNumber(get('valor_bruto'))
        if (gross === null || gross <= 0) errors.push('valor_bruto inválido')

        const netRaw = get('valor_liquido')
        const net = netRaw ? parseNumber(netRaw) : null
        if (netRaw && net === null) errors.push('valor_liquido inválido')

        const platformRaw = get('plataforma').toLowerCase()
        if (platformRaw && !PLATFORMS.includes(platformRaw)) errors.push(`plataforma "${platformRaw}" inválida`)
        const platform = PLATFORMS.includes(platformRaw) ? platformRaw : 'manual'

        const statusRaw = get('status').toLowerCase()
        if (statusRaw && !STATUSES.includes(statusRaw)) errors.push(`status "${statusRaw}" inválido`)
        const status = STATUSES.includes(statusRaw) ? statusRaw : 'approved'

        return {
          line: i + 2,
          platform,
          product_name: get('produto') || null,
          gross_amount: gross,
          net_amount: net,
          customer_name: get('cliente') || null,
          customer_email: get('email') || null,
          transaction_id: get('transaction_id') || null,
          date,
          status,
          errors,
        }
      })
      setRows(parsed)
    }
    reader.readAsText(file, 'utf-8')
  }

  const validRows = rows.filter(r => r.errors.length === 0)
  const invalidRows = rows.filter(r => r.errors.length > 0)

  async function handleImport() {
    if (validRows.length === 0) return
    setImporting(true)
    setResult(null)

    const payload = validRows.map(r => ({
      platform: r.platform,
      product_name: r.product_name,
      gross_amount: r.gross_amount,
      net_amount: r.net_amount,
      customer_name: r.customer_name,
      customer_email: r.customer_email,
      transaction_id: r.transaction_id,
      date: r.date,
      status: r.status,
      origem_id: origemId || null,
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
        setResult({ inserted, failed: payload.length - inserted, error: error.message })
        setImporting(false)
        return
      }
      inserted += count ?? chunk.length
    }

    setResult({ inserted, failed: 0 })
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

      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Importar histórico (CSV)</h2>
          <p className="text-sm text-gray-500 mt-0.5">Importa vendas antigas em lote a partir de um arquivo CSV.</p>
        </div>
        <button onClick={downloadTemplate} className="flex items-center gap-2 border px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
          <Download size={16} /> Baixar modelo CSV
        </button>
      </div>

      <div className="bg-white rounded-xl border p-6 space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Arquivo CSV</label>
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFile} className="block w-full text-sm" />
          {fileName && <p className="text-xs text-gray-400 mt-1">{fileName}</p>}
          <p className="text-xs text-gray-400 mt-2">
            Colunas aceitas: <code>data</code>* (AAAA-MM-DD ou DD/MM/AAAA), <code>plataforma</code> (kiwify/ticto/manual/other),{' '}
            <code>produto</code>, <code>valor_bruto</code>*, <code>valor_liquido</code>, <code>cliente</code>, <code>email</code>,{' '}
            <code>status</code> (approved/refunded/pending/cancelled), <code>transaction_id</code>. * obrigatório.
            {' '}Linhas com <code>transaction_id</code> preenchido não duplicam em reimportações; sem ele, reimportar cria registros repetidos.
          </p>
        </div>

        <div className="max-w-xs">
          <label className="block text-sm font-medium text-gray-700 mb-1">Origem (aplicada a todas as linhas)</label>
          <OrigemSelect
            origens={origens}
            onOrigensChange={setOrigens}
            value={origemId}
            onChange={setOrigemId}
            allowEmpty
            emptyLabel="Nenhuma"
          />
        </div>

        {globalError && (
          <p className="text-sm text-red-600 flex items-center gap-1"><AlertTriangle size={14} /> {globalError}</p>
        )}
      </div>

      {rows.length > 0 && (
        <div className="bg-white rounded-xl border overflow-hidden mb-6">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <p className="text-sm text-gray-600">
              {validRows.length} válida(s)
              {invalidRows.length > 0 && <span className="text-red-600"> · {invalidRows.length} com erro</span>}
            </p>
            <button
              onClick={handleImport}
              disabled={importing || validRows.length === 0}
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
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Plataforma</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Produto</th>
                  <th className="text-right px-3 py-2 font-medium text-gray-600">Bruto</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Status</th>
                  <th className="text-left px-3 py-2 font-medium text-gray-600">Validação</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.line} className={`border-b last:border-0 ${r.errors.length > 0 ? 'bg-red-50' : ''}`}>
                    <td className="px-3 py-2 text-gray-500">{r.line}</td>
                    <td className="px-3 py-2">{r.date ?? '—'}</td>
                    <td className="px-3 py-2">{PLATFORM_LABELS[r.platform] ?? r.platform}</td>
                    <td className="px-3 py-2 text-gray-600">{r.product_name ?? '—'}</td>
                    <td className="px-3 py-2 text-right">{r.gross_amount !== null ? formatBRL(r.gross_amount) : '—'}</td>
                    <td className="px-3 py-2">{STATUS_LABELS[r.status] ?? r.status}</td>
                    <td className="px-3 py-2">
                      {r.errors.length > 0 ? (
                        <span className="text-red-600 text-xs">{r.errors.join('; ')}</span>
                      ) : (
                        <span className="text-green-600 inline-flex items-center gap-1 text-xs"><CheckCircle2 size={12} /> OK</span>
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
            : `${result.inserted} entrada(s) importada(s) com sucesso.`}
        </div>
      )}
    </div>
  )
}

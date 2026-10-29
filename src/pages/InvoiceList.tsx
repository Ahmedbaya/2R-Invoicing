import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { dec, formatNumber } from '../../shared/calc'
import type { InvoiceListRow } from '../../shared/types'
import StatusBadge from '../components/StatusBadge'
import { confirmAction } from '../lib/confirm'
import { localToday } from '../lib/date'
import { useI18n } from '../lib/i18n'
import { useToast } from '../lib/toast'
import { getUserName } from '../lib/user'

type StatusFilter = 'all' | 'draft' | 'edited' | 'finalized'

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const frDate = (iso: string) => iso.split('-').reverse().join('/')
const kind = (r: InvoiceListRow): Exclude<StatusFilter, 'all'> => (r.status === 'finalized' ? 'finalized' : r.number ? 'edited' : 'draft')

export default function InvoiceList() {
  const { t } = useI18n()
  const toast = useToast()
  const navigate = useNavigate()
  const [rows, setRows] = useState<InvoiceListRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [year, setYear] = useState('')
  const [clientName, setClientName] = useState('')

  const load = () => window.api.invoices.list().then(setRows).catch((e: Error) => setError(e.message))
  useEffect(() => { load() }, [])

  const indexed = useMemo(
    () =>
      (rows ?? []).map((r) => ({
        r,
        hay: norm(
          [
            r.number ?? '',
            r.number ? `${r.number}/${r.year}` : '',
            r.client_name ?? '',
            r.search_text ?? '',
            frDate(r.issue_date),
            r.issue_date,
            r.total_amount,
          ].join(' '),
        ),
      })),
    [rows],
  )

  const years = useMemo(() => [...new Set((rows ?? []).map((r) => r.issue_date.slice(0, 4)))].sort().reverse(), [rows])
  const clientNames = useMemo(
    () => [...new Set((rows ?? []).map((r) => r.client_name).filter((n): n is string => !!n))].sort((a, b) => a.localeCompare(b)),
    [rows],
  )

  const filtered = useMemo(() => {
    const tokens = norm(query).split(/\s+/).filter((tok) => /[a-z0-9]/.test(tok))
    return indexed
      .filter(({ r, hay }) =>
        (status === 'all' || kind(r) === status) &&
        (!year || r.issue_date.startsWith(year)) &&
        (!clientName || r.client_name === clientName) &&
        tokens.every((tok) => hay.includes(tok)),
      )
      .map((x) => x.r)
  }, [indexed, query, status, year, clientName])

  const totals = useMemo(() => {
    const byCurrency: Record<string, string> = {}
    for (const r of filtered) byCurrency[r.currency] = dec(byCurrency[r.currency] ?? '0').plus(r.total_amount).toFixed(2)
    return Object.entries(byCurrency)
  }, [filtered])

  const hasFilters = query !== '' || status !== 'all' || year !== '' || clientName !== ''
  const clear = () => { setQuery(''); setStatus('all'); setYear(''); setClientName('') }

  const remove = async (r: InvoiceListRow) => {
    setError(null)
    try {
      const msg = r.number ? t('list.confirmInvoice', { number: `${r.number} / ${r.year}` }) : t('list.confirmDraft')
      if (!(await confirmAction(msg))) return
      await window.api.invoices.remove(r.id)
      await load()
    } catch (e) { setError((e as Error).message) }
  }

  const duplicate = async (r: InvoiceListRow) => {
    try {
      const copy = await window.api.invoices.duplicate({ id: r.id, issue_date: localToday(), created_by: getUserName() })
      toast.success(t('list.duplicated'))
      navigate(`/invoices/${copy.id}`)
    } catch (e) { toast.error((e as Error).message) }
  }
    const exportList = async () => {
    try {
      const p = await window.api.invoices.exportListExcel(filtered.map((r) => r.id))
      if (p) toast.success(t('list.excelSaved', { path: p }))
    } catch (e) { toast.error((e as Error).message) }
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('list.title')}</h1>
        <Link to="/invoices/new" className="btn-primary">{t('list.new')}</Link>        <div className="flex gap-2">
          <button className="btn-quiet" disabled={filtered.length === 0} onClick={exportList}>{t('list.exportExcel')}</button>
          <Link to="/invoices/new" className="btn-primary">{t('list.new')}</Link>
        </div>
      </div>
      {error && <p role="alert" className="mb-3 text-alert">{error}</p>}
      {rows && rows.length === 0 && <p>{t('list.empty')}</p>}

      {rows && rows.length > 0 && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <input
              type="search"
              aria-label={t('list.search')}
              placeholder={t('list.search')}
              className="input min-w-64 flex-1"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select aria-label={t('col.status')} className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
              <option value="all">{t('list.allStatuses')}</option>
              <option value="draft">{t('status.draft')}</option>
              <option value="edited">{t('status.beingEdited')}</option>
              <option value="finalized">{t('status.finalized')}</option>
            </select>
            <select aria-label={t('col.date')} className="input w-auto" value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="">{t('list.allYears')}</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <select aria-label={t('col.client')} className="input w-auto max-w-56" value={clientName} onChange={(e) => setClientName(e.target.value)}>
              <option value="">{t('list.allClients')}</option>
              {clientNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            {hasFilters && <button className="btn-quiet" onClick={clear}>{t('list.clear')}</button>}
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm">{t('list.noMatch')}</p>
          ) : (
            <table className="w-full overflow-hidden rounded border border-rule bg-white text-sm">
              <thead className="bg-mist text-left">
                <tr>
                  <th className="p-2">{t('col.number')}</th><th className="p-2">{t('col.client')}</th><th className="p-2">{t('col.date')}</th>
                  <th className="p-2 num">{t('col.total')}</th><th className="p-2">{t('col.status')}</th><th className="p-2" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t border-rule hover:bg-mist/60">
                    <td className="p-2"><Link className="text-thread underline" to={`/invoices/${r.id}`}>{r.number ? `${r.number} / ${r.year}` : t('status.draft')}</Link></td>
                    <td className="p-2">{r.client_name ?? t('common.noClient')}</td>
                    <td className="p-2">{frDate(r.issue_date)}</td>
                    <td className="p-2 num">{formatNumber(r.total_amount, 2)} {r.currency}</td>
                    <td className="p-2"><StatusBadge status={r.status} hasNumber={r.number !== null} /></td>
                    <td className="p-2 text-right whitespace-nowrap">
                      <button className="mr-3 text-thread underline" onClick={() => duplicate(r)}>{t('list.duplicate')}</button>
                      <button className="text-alert underline" onClick={() => remove(r)}>{t('common.delete')}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-ink/70">{filtered.length === 1 ? t('list.countOne') : t('list.countMany', { n: filtered.length })}</span>
            {filtered.length > 0 && (
              <span className="font-medium tabular-nums">
                {t('list.total')} : {totals.map(([cur, v]) => `${formatNumber(v, 2)} ${cur}`).join('  ·  ')}
              </span>
            )}
          </div>
        </>
      )}
    </>
  )
}
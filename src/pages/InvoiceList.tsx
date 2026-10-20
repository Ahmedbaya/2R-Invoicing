import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatNumber } from '../../shared/calc'
import type { InvoiceListRow } from '../../shared/types'
import StatusBadge from '../components/StatusBadge'
import { confirmAction } from '../lib/confirm'
import { useI18n } from '../lib/i18n'

export default function InvoiceList() {
  const { t } = useI18n()
  const [rows, setRows] = useState<InvoiceListRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = () => window.api.invoices.list().then(setRows).catch((e: Error) => setError(e.message))
  useEffect(() => { load() }, [])

  const remove = async (r: InvoiceListRow) => {
    setError(null)
    try {
      const msg = r.number ? t('list.confirmInvoice', { number: `${r.number} / ${r.year}` }) : t('list.confirmDraft')
      if (!(await confirmAction(msg))) return
      await window.api.invoices.remove(r.id)
      await load()
    } catch (e) { setError((e as Error).message) }
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('list.title')}</h1>
        <Link to="/invoices/new" className="btn-primary">{t('list.new')}</Link>
      </div>
      {error && <p role="alert" className="mb-3 text-alert">{error}</p>}
      {rows && rows.length === 0 && <p>{t('list.empty')}</p>}
      {rows && rows.length > 0 && (
        <table className="w-full overflow-hidden rounded border border-rule bg-white text-sm">
          <thead className="bg-mist text-left">
            <tr>
              <th className="p-2">{t('col.number')}</th><th className="p-2">{t('col.client')}</th><th className="p-2">{t('col.date')}</th>
              <th className="p-2 num">{t('col.total')}</th><th className="p-2">{t('col.status')}</th><th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-rule hover:bg-mist/60">
                <td className="p-2"><Link className="text-thread underline" to={`/invoices/${r.id}`}>{r.number ? `${r.number} / ${r.year}` : t('status.draft')}</Link></td>
                <td className="p-2">{r.client_name ?? t('common.noClient')}</td>
                <td className="p-2">{r.issue_date.split('-').reverse().join('/')}</td>
                <td className="p-2 num">{formatNumber(r.total_amount, 2)} {r.currency}</td>
                <td className="p-2"><StatusBadge status={r.status} hasNumber={r.number !== null} /></td>
                <td className="p-2 text-right"><button className="text-alert underline" onClick={() => remove(r)}>{t('common.delete')}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}
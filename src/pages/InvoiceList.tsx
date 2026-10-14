import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatNumber } from '../../shared/calc'
import type { InvoiceListRow } from '../../shared/types'

export default function InvoiceList() {
  const [rows, setRows] = useState<InvoiceListRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = () => window.api.invoices.list().then(setRows).catch((e: Error) => setError(e.message))
  useEffect(() => { load() }, [])

  const remove = async (r: InvoiceListRow) => {
    const label = r.number ? `invoice ${r.number} / ${r.year}` : 'this draft'
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return
    setError(null)
    try { await window.api.invoices.remove(r.id); load() } catch (e) { setError((e as Error).message) }
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Invoices</h1>
        <Link to="/invoices/new" className="btn-primary">New invoice</Link>
      </div>
      {error && <p role="alert" className="mb-3 text-alert">{error}</p>}
      {rows && rows.length === 0 && <p>No invoices yet. Create the first one with “New invoice”.</p>}
      {rows && rows.length > 0 && (
        <table className="w-full overflow-hidden rounded border border-rule bg-white text-sm">
          <thead className="bg-mist text-left">
            <tr><th className="p-2">Number</th><th className="p-2">Client</th><th className="p-2">Date</th><th className="p-2 num">Total</th><th className="p-2">Status</th><th className="p-2" /></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-rule hover:bg-mist/60">
                <td className="p-2"><Link className="text-thread underline" to={`/invoices/${r.id}`}>{r.number ? `${r.number} / ${r.year}` : 'Draft'}</Link></td>
                <td className="p-2">{r.client_name ?? 'No client'}</td>
                <td className="p-2">{r.issue_date.split('-').reverse().join('/')}</td>
                <td className="p-2 num">{formatNumber(r.total_amount, 2)} {r.currency}</td>
                <td className="p-2">{r.status === 'finalized' ? 'Finalized' : r.number ? 'Being edited' : 'Draft'}</td>
                <td className="p-2 text-right"><button className="text-alert underline" onClick={() => remove(r)}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}

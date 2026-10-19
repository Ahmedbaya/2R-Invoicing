import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { amountInWordsFr } from '../../shared/amountInWords'
import { computeTotals, formatNumber } from '../../shared/calc'
import type { Category, Client, InvoiceRecord, Product } from '../../shared/types'
import { getUserName } from '../lib/user'

interface Row { key: string; product_id: number | null; item_code: string; order_name: string; customs_code: string; description: string; quantity: string; unit_price: string }
const newRow = (): Row => ({ key: crypto.randomUUID(), product_id: null, item_code: '', order_name: '', customs_code: '', description: '', quantity: '', unit_price: '' })
const today = () => new Date().toISOString().slice(0, 10)

export default function InvoiceEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [clients, setClients] = useState<Client[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [meta, setMeta] = useState<{ id?: number; version?: number; status: 'draft' | 'finalized'; number: number | null; year: number | null }>({ status: 'draft', number: null, year: null })
  const [clientId, setClientId] = useState('')
  const [issueDate, setIssueDate] = useState(today())
  const [currency, setCurrency] = useState('EUR')
  const [vatNote, setVatNote] = useState('')
  const [rows, setRows] = useState<Row[]>([newRow()])
  const [lg, setLg] = useState({ customs_declaration: '', transporter: '', gross_weight_kg: '', net_weight_kg: '', pallets: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const readOnly = meta.status === 'finalized'
  const totals = useMemo(() => computeTotals(rows), [rows])
  const words = useMemo(() => { try { return amountInWordsFr(totals.totalAmount) } catch { return '' } }, [totals.totalAmount])

  const hydrate = (r: InvoiceRecord) => {
    setMeta({ id: r.id, version: r.version, status: r.status, number: r.number, year: r.year })
    setClientId(r.client_id ? String(r.client_id) : '')
    setIssueDate(r.issue_date)
    setCurrency(r.currency)
    setVatNote(r.vat_note)
    setRows(r.items.length ? r.items.map((i) => ({ key: crypto.randomUUID(), product_id: i.product_id, item_code: i.item_code, order_name: i.order_name, customs_code: i.customs_code, description: i.description, quantity: i.quantity, unit_price: i.unit_price })) : [newRow()])
    setLg({ ...r.logistics, pallets: r.logistics.pallets === null ? '' : String(r.logistics.pallets) })
  }

  useEffect(() => {
    Promise.all([window.api.clients.list(), window.api.products.list(), window.api.categories.list()])
      .then(([c, p, cat]) => { setClients(c); setProducts(p); setCategories(cat) })
      .catch((e: Error) => setError(e.message))
    if (id) window.api.invoices.get(Number(id)).then(hydrate).catch((e: Error) => setError(e.message))
  }, [id])

  const patchRow = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  const onPick = (key: string, field: 'item_code' | 'description', value: string) => {
    const match = products.find((p) => (field === 'item_code' ? p.code === value : p.name === value))
    const current = rows.find((r) => r.key === key)
    if (match) {
      patchRow(key, {
        product_id: match.id,
        item_code: match.code ?? '',
        description: match.name,
        customs_code: match.customs_code ?? '',
        unit_price: current?.unit_price || match.default_price,
      })
    } else {
      patchRow(key, { [field]: value, product_id: null })
    }
  }

  const persist = async (): Promise<InvoiceRecord> => {
    const rec = await window.api.invoices.saveDraft({
      id: meta.id, version: meta.version,
      client_id: clientId ? Number(clientId) : null,
      issue_date: issueDate, currency, vat_note: vatNote,
      items: rows.map(({ key, ...r }) => r),
      logistics: { ...lg, pallets: lg.pallets === '' ? null : Number(lg.pallets) },
      created_by: getUserName(),
    })
    hydrate(rec)
    if (!id) navigate(`/invoices/${rec.id}`, { replace: true })
    return rec
  }

  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true); setError(null); setNotice(null)
    try { const msg = await fn(); if (msg) setNotice(msg) } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  const saveDraft = () => run(async () => { await persist(); return 'Draft saved.' })
  const finalize = () => run(async () => {
    const msg = meta.number
      ? `Lock invoice ${meta.number} / ${meta.year} again? Its number stays the same.`
      : 'Finalize this invoice? It gets its official number and is locked until you choose to edit it.'
    if (!window.confirm(msg)) return
    const saved = await persist()
    const done = await window.api.invoices.finalize({ id: saved.id, version: saved.version })
    hydrate(done)
    return `Invoice ${done.number} / ${done.year} finalized.`
  })
  const unlock = () => run(async () => {
    if (!window.confirm(`Edit invoice ${meta.number} / ${meta.year}? It keeps its number and stays unlocked until you finalize it again.`)) return
    hydrate(await window.api.invoices.unlock({ id: meta.id!, version: meta.version! }))
    return 'Invoice unlocked. Finalize it again when you are done.'
  })
  const remove = () => run(async () => {
    const label = meta.number ? `invoice ${meta.number} / ${meta.year}` : 'this draft'
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return
    await window.api.invoices.remove(meta.id!)
    navigate('/invoices', { replace: true })
  })
  const exportPdf = () => run(async () => {
    const saved = readOnly ? null : await persist()
    const path = await window.api.invoices.exportPdf(saved?.id ?? meta.id!)
    return path ? `PDF saved to ${path}` : undefined
  })

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{meta.number ? `Invoice ${meta.number} / ${meta.year}${readOnly ? '' : ' (being edited)'}` : 'New invoice'}</h1>
        <div className="flex gap-2">
          {meta.id && <button className="btn-quiet text-alert" disabled={busy} onClick={remove}>Delete</button>}
          {readOnly && <button className="btn-quiet" disabled={busy} onClick={unlock}>Edit invoice</button>}
          {!readOnly && <button className="btn-quiet" disabled={busy} onClick={saveDraft}>{meta.number ? 'Save changes' : 'Save draft'}</button>}
          <button className="btn-quiet" disabled={busy || (!meta.id && rows.every((r) => !r.description))} onClick={exportPdf}>Export PDF</button>
          {!readOnly && <button className="btn-primary" disabled={busy} onClick={finalize}>Finalize</button>}
        </div>
      </div>
      {error && <p role="alert" className="mb-3 rounded bg-alert/10 p-2 text-alert">{error}</p>}
      {notice && <p role="status" className="mb-3 rounded bg-thread/10 p-2 text-thread-dark">{notice}</p>}
      {readOnly && <p className="mb-3 text-sm">This invoice is finalized. Select “Edit invoice” to change it.</p>}

      <fieldset disabled={readOnly || busy} className="space-y-5">
        <section className="grid grid-cols-4 gap-3 rounded border border-rule bg-white p-4">
          <div className="col-span-2">
            <label className="label" htmlFor="client">Client</label>
            <select id="client" className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">Choose a client</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
            </select>
          </div>
          <div><label className="label" htmlFor="date">Issue date</label>
            <input id="date" type="date" className="input" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></div>
          <div><label className="label" htmlFor="cur">Currency</label>
            <input id="cur" maxLength={3} className="input" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} /></div>
          <div className="col-span-4"><label className="label" htmlFor="vat">Tax / VAT mention (printed under the total)</label>
            <input id="vat" className="input" value={vatNote} onChange={(e) => setVatNote(e.target.value)} /></div>
        </section>

        <section className="rounded border border-rule bg-white p-4">
          <datalist id="codes">{products.filter((p) => p.code).map((p) => <option key={p.id} value={p.code!}>{p.name}</option>)}</datalist>
          <datalist id="names">{products.map((p) => <option key={p.id} value={p.name}>{p.code}</option>)}</datalist>
          <table className="w-full text-sm">
            <thead><tr className="text-left"><th className="w-24 pb-1 num">Q.TE</th><th className="w-28 pb-1 pl-2">CODE</th><th className="w-40 pb-1 pl-2">COMMANDE</th><th className="pb-1 pl-2">ARTICOLO</th><th className="w-52 pb-1 pl-2">CODE DOUANE</th><th className="w-24 pb-1 num">PRIX</th><th className="w-28 pb-1 num">TOTAL</th><th className="w-10" /></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.key}>
                  <td className="py-1"><input aria-label="Quantity" inputMode="decimal" className="input num" value={r.quantity} onChange={(e) => patchRow(r.key, { quantity: e.target.value })} /></td>
                  <td className="p-1"><input aria-label="Product code" list="codes" className="input" value={r.item_code} onChange={(e) => onPick(r.key, 'item_code', e.target.value)} /></td>
                  <td className="p-1"><input aria-label="Order name" className="input" value={r.order_name} onChange={(e) => patchRow(r.key, { order_name: e.target.value })} /></td>
                  <td className="p-1"><input aria-label="Description" list="names" className="input" value={r.description} onChange={(e) => onPick(r.key, 'description', e.target.value)} /></td>
                  <td className="p-1">
                    <select aria-label="Customs code" className="input" value={r.customs_code} onChange={(e) => patchRow(r.key, { customs_code: e.target.value })}>
                      <option value="">Choose</option>
                      {r.customs_code && !categories.some((c) => c.customs_code === r.customs_code) && (
                        <option value={r.customs_code}>{r.customs_code}</option>
                      )}
                      {categories.map((c) => <option key={c.id} value={c.customs_code}>{c.customs_code} · {c.name}</option>)}
                    </select>
                  </td>
                  <td className="py-1"><input aria-label="Unit price" inputMode="decimal" className="input num" value={r.unit_price} onChange={(e) => patchRow(r.key, { unit_price: e.target.value })} /></td>
                  <td className="num py-1 pl-2">{formatNumber(totals.lines[i], 2)}</td>
                  <td className="py-1 text-center">
                    {rows.length > 1 && <button type="button" aria-label="Remove line" className="px-2 text-alert" onClick={() => setRows(rows.filter((x) => x.key !== r.key))}>✕</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="btn-quiet mt-3" onClick={() => setRows([...rows, { ...newRow(), order_name: rows[rows.length - 1]?.order_name ?? '' }])}>Add line</button>
          <div className="mt-4 space-y-1 border-t border-rule pt-3 text-sm">
            <div className="flex justify-between"><span>Total quantity</span><b className="tabular-nums">{formatNumber(totals.totalQuantity)}</b></div>
            <div className="flex justify-between text-base"><span>Total {currency}</span><b className="tabular-nums">{formatNumber(totals.totalAmount, 2)}</b></div>
            <p className="pt-1 font-medium">{words}</p>
          </div>
        </section>

        <section className="grid grid-cols-4 gap-3 rounded border border-rule bg-white p-4">
          <h2 className="col-span-4 font-semibold">Shipping details</h2>
          <div className="col-span-4"><label className="label" htmlFor="customs">Origin declaration</label>
            <input id="customs" className="input" value={lg.customs_declaration} onChange={(e) => setLg({ ...lg, customs_declaration: e.target.value })} /></div>
          <div className="col-span-2"><label className="label" htmlFor="tr">Transporter</label>
            <input id="tr" className="input" value={lg.transporter} onChange={(e) => setLg({ ...lg, transporter: e.target.value })} /></div>
          <div><label className="label" htmlFor="gw">Gross weight (kg)</label>
            <input id="gw" inputMode="decimal" className="input num" value={lg.gross_weight_kg} onChange={(e) => setLg({ ...lg, gross_weight_kg: e.target.value })} /></div>
          <div><label className="label" htmlFor="nw">Net weight (kg)</label>
            <input id="nw" inputMode="decimal" className="input num" value={lg.net_weight_kg} onChange={(e) => setLg({ ...lg, net_weight_kg: e.target.value })} /></div>
          <div><label className="label" htmlFor="pal">Pallets</label>
            <input id="pal" inputMode="numeric" className="input num" value={lg.pallets} onChange={(e) => setLg({ ...lg, pallets: e.target.value.replace(/\D/g, '') })} /></div>
        </section>
      </fieldset>
    </>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { amountInWordsFr } from '../../shared/amountInWords'
import { computeTotals, formatNumber } from '../../shared/calc'
import type { Category, Client, InvoiceRecord, Product } from '../../shared/types'
import StatusBadge from '../components/StatusBadge'
import { confirmAction } from '../lib/confirm'
import { useI18n } from '../lib/i18n'
import { useToast } from '../lib/toast'
import { getUserName } from '../lib/user'
import { localToday } from '../lib/date'

interface Row { key: string; product_id: number | null; item_code: string; order_name: string; customs_code: string; description: string; quantity: string; unit_price: string }
const newRow = (): Row => ({ key: crypto.randomUUID(), product_id: null, item_code: '', order_name: '', customs_code: '', description: '', quantity: '', unit_price: '' })
const today = () => new Date().toISOString().slice(0, 10)

export default function InvoiceEditor() {
  const { t } = useI18n()
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const [clients, setClients] = useState<Client[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [meta, setMeta] = useState<{ id?: number; version?: number; status: 'draft' | 'finalized'; number: number | null; year: number | null }>({ status: 'draft', number: null, year: null })
  const [clientId, setClientId] = useState('')
  const [issueDate, setIssueDate] = useState(today())
  const [currency, setCurrency] = useState('EUR')
  const [numberText, setNumberText] = useState('')
  const [lastNum, setLastNum] = useState<number | null>(null)
  const [vatNote, setVatNote] = useState('')
  const [rows, setRows] = useState<Row[]>([newRow()])
  const [lg, setLg] = useState({ customs_declaration: '', transporter: '', gross_weight_kg: '', net_weight_kg: '', pallets: '' })
  const [busy, setBusy] = useState(false)

  const readOnly = meta.status === 'finalized'
  const totals = useMemo(() => computeTotals(rows), [rows])
  const words = useMemo(() => { try { return amountInWordsFr(totals.totalAmount) } catch { return '' } }, [totals.totalAmount])
  const invoiceLabel = meta.number ? `${meta.number} / ${meta.year}` : ''

  const hydrate = (r: InvoiceRecord) => {
    setMeta({ id: r.id, version: r.version, status: r.status, number: r.number, year: r.year })
    setClientId(r.client_id ? String(r.client_id) : '')
    setIssueDate(r.issue_date)
    setCurrency(r.currency)
    setNumberText(r.number ? String(r.number) : '')
    setVatNote(r.vat_note)
    setRows(
      r.items.length
        ? r.items.map((i) => ({ key: crypto.randomUUID(), product_id: i.product_id, item_code: i.item_code, order_name: i.order_name, customs_code: i.customs_code, description: i.description, quantity: i.quantity, unit_price: i.unit_price }))
        : [newRow()],
    )
    setLg({ ...r.logistics, pallets: r.logistics.pallets === null ? '' : String(r.logistics.pallets) })
  }
    useEffect(() => {
    const year = Number(issueDate.slice(0, 4))
    if (!clientId || !year) { setLastNum(null); return }
    window.api.invoices.lastNumber({ client_id: Number(clientId), year }).then(setLastNum).catch(() => setLastNum(null))
  }, [clientId, issueDate, meta.version])

  useEffect(() => {
    Promise.all([window.api.clients.list(), window.api.products.list(), window.api.categories.list()])
      .then(([c, p, cat]) => { setClients(c); setProducts(p); setCategories(cat) })
      .catch((e: Error) => toast.error(e.message))
    if (id) window.api.invoices.get(Number(id)).then(hydrate).catch((e: Error) => toast.error(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      number: numberText ? Number(numberText) : null,
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
    setBusy(true)
    try {
      const msg = await fn()
      if (msg) toast.success(msg)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const saveDraft = () => run(async () => { await persist(); return t('ed.saved') })

  const finalize = () => run(async () => {
    if (!numberText) throw new Error(t('ed.needNumber'))
    const msg = t('ed.confirmFinalize', { number: `${numberText} / ${issueDate.slice(0, 4)}` })
    if (!(await confirmAction(msg))) return
    const saved = await persist()
    const done = await window.api.invoices.finalize({ id: saved.id, version: saved.version })
    hydrate(done)
    return t('ed.finalized', { number: `${done.number} / ${done.year}` })
  })

  const unlock = () => run(async () => {
    if (!(await confirmAction(t('ed.confirmUnlock', { number: invoiceLabel })))) return
    hydrate(await window.api.invoices.unlock({ id: meta.id!, version: meta.version! }))
    return t('ed.unlocked')
  })

  const remove = () => run(async () => {
    const msg = meta.number ? t('ed.confirmDelNum', { number: invoiceLabel }) : t('ed.confirmDelDraft')
    if (!(await confirmAction(msg))) return
    await window.api.invoices.remove(meta.id!)
    navigate('/invoices', { replace: true })
  })
    const duplicate = () => run(async () => {
    const saved = readOnly ? null : await persist()
    const copy = await window.api.invoices.duplicate({ id: saved?.id ?? meta.id!, issue_date: localToday(), created_by: getUserName() })
    navigate(`/invoices/${copy.id}`)
    return t('ed.duplicated')
  })
  const exportPdf = () => run(async () => {
    const saved = readOnly ? null : await persist()
    const path = await window.api.invoices.exportPdf(saved?.id ?? meta.id!)
    return path ? t('ed.pdfSaved', { path }) : undefined
  })

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">{meta.number ? t('ed.title', { number: invoiceLabel }) : t('ed.new')}</h1>
          {meta.id && <StatusBadge status={meta.status} hasNumber={meta.number !== null} />}
        </div>
        <div className="flex gap-2">
          {meta.id && <button className="btn-quiet" disabled={busy} onClick={duplicate}>{t('ed.duplicate')}</button>}
          {meta.id && <button className="btn-quiet text-alert" disabled={busy} onClick={remove}>{t('common.delete')}</button>}
          {readOnly && <button className="btn-quiet" disabled={busy} onClick={unlock}>{t('ed.edit')}</button>}
          {!readOnly && <button className="btn-quiet" disabled={busy} onClick={saveDraft}>{meta.number ? t('ed.saveChanges') : t('ed.saveDraft')}</button>}
          <button className="btn-quiet" disabled={busy || (!meta.id && rows.every((r) => !r.description))} onClick={exportPdf}>{t('ed.export')}</button>
          {!readOnly && <button className="btn-primary" disabled={busy} onClick={finalize}>{t('ed.finalize')}</button>}
        </div>
      </div>
      {readOnly && <p className="mb-3 text-sm">{t('ed.lockedNote')}</p>}

      <fieldset disabled={readOnly || busy} className="space-y-5">
        <section className="grid grid-cols-4 gap-3 rounded border border-rule bg-white p-4">
          <div className="col-span-2">
            <label className="label" htmlFor="client">{t('ed.client')}</label>
            <select id="client" className="input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">{t('ed.chooseClient')}</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
            </select>
          </div>
          <div><label className="label" htmlFor="date">{t('ed.date')}</label>
            <input id="date" type="date" className="input" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></div>
          <div><label className="label" htmlFor="cur">{t('ed.currency')}</label>
            <input id="cur" maxLength={3} className="input" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} /></div>
          <div className="col-span-4"><label className="label" htmlFor="vat">
                      <div>
            <label className="label" htmlFor="num">{t('ed.number')}</label>
            <input id="num" inputMode="numeric" className="input num" value={numberText} onChange={(e) => setNumberText(e.target.value.replace(/\D/g, ''))} />
          </div>
          <div className="col-span-3 flex items-end pb-2 text-sm text-ink/70">
            {clientId
              ? lastNum
                ? t('ed.lastNumber', { year: issueDate.slice(0, 4), n: lastNum })
                : t('ed.noNumberYet', { year: issueDate.slice(0, 4) })
              : t('ed.pickClientFirst')}
          </div>
            {t('ed.vat')}</label>
            <input id="vat" className="input" value={vatNote} onChange={(e) => setVatNote(e.target.value)} /></div>
        </section>

        <section className="rounded border border-rule bg-white p-4">
          <datalist id="codes">{products.filter((p) => p.code).map((p) => <option key={p.id} value={p.code!}>{p.name}</option>)}</datalist>
          <datalist id="names">{products.map((p) => <option key={p.id} value={p.name}>{p.code}</option>)}</datalist>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th className="w-24 pb-1 num">{t('ed.qty')}</th>
                <th className="w-28 pb-1 pl-2">{t('ed.code')}</th>
                <th className="w-40 pb-1 pl-2">{t('ed.order')}</th>
                <th className="pb-1 pl-2">{t('ed.article')}</th>
                <th className="w-52 pb-1 pl-2">{t('ed.customs')}</th>
                <th className="w-24 pb-1 num">{t('ed.price')}</th>
                <th className="w-28 pb-1 num">{t('ed.lineTotal')}</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.key}>
                  <td className="py-1"><input aria-label={t('ed.aria.qty')} inputMode="decimal" className="input num" value={r.quantity} onChange={(e) => patchRow(r.key, { quantity: e.target.value })} /></td>
                  <td className="p-1"><input aria-label={t('ed.aria.code')} list="codes" className="input" value={r.item_code} onChange={(e) => onPick(r.key, 'item_code', e.target.value)} /></td>
                  <td className="p-1"><input aria-label={t('ed.aria.order')} className="input" value={r.order_name} onChange={(e) => patchRow(r.key, { order_name: e.target.value })} /></td>
                  <td className="p-1"><input aria-label={t('ed.aria.desc')} list="names" className="input" value={r.description} onChange={(e) => onPick(r.key, 'description', e.target.value)} /></td>
                  <td className="p-1">
                    <select aria-label={t('ed.aria.customs')} className="input" value={r.customs_code} onChange={(e) => patchRow(r.key, { customs_code: e.target.value })}>
                      <option value="">{t('ed.choose')}</option>
                      {r.customs_code && !categories.some((c) => c.customs_code === r.customs_code) && (
                        <option value={r.customs_code}>{r.customs_code}</option>
                      )}
                      {categories.map((c) => <option key={c.id} value={c.customs_code}>{c.customs_code} · {c.name}</option>)}
                    </select>
                  </td>
                  <td className="py-1"><input aria-label={t('ed.aria.price')} inputMode="decimal" className="input num" value={r.unit_price} onChange={(e) => patchRow(r.key, { unit_price: e.target.value })} /></td>
                  <td className="num py-1 pl-2">{formatNumber(totals.lines[i], 2)}</td>
                  <td className="py-1 text-center">
                    {rows.length > 1 && <button type="button" aria-label={t('ed.removeLine')} className="px-2 text-alert" onClick={() => setRows(rows.filter((x) => x.key !== r.key))}>✕</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="btn-quiet mt-3" onClick={() => setRows([...rows, { ...newRow(), order_name: rows[rows.length - 1]?.order_name ?? '' }])}>{t('ed.addLine')}</button>
          <div className="mt-4 space-y-1 border-t border-rule pt-3 text-sm">
            <div className="flex justify-between"><span>{t('ed.totalQty')}</span><b className="tabular-nums">{formatNumber(totals.totalQuantity)}</b></div>
            <div className="flex justify-between text-base"><span>{t('ed.totalAmount', { currency })}</span><b className="tabular-nums">{formatNumber(totals.totalAmount, 2)}</b></div>
            <p className="pt-1 font-medium">{words}</p>
          </div>
        </section>

        <section className="grid grid-cols-4 gap-3 rounded border border-rule bg-white p-4">
          <h2 className="col-span-4 font-semibold">{t('ed.shipping')}</h2>
          <div className="col-span-4"><label className="label" htmlFor="customs">{t('ed.origin')}</label>
            <input id="customs" className="input" value={lg.customs_declaration} onChange={(e) => setLg({ ...lg, customs_declaration: e.target.value })} /></div>
          <div className="col-span-2"><label className="label" htmlFor="tr">{t('ed.transporter')}</label>
            <input id="tr" className="input" value={lg.transporter} onChange={(e) => setLg({ ...lg, transporter: e.target.value })} /></div>
          <div><label className="label" htmlFor="gw">{t('ed.gross')}</label>
            <input id="gw" inputMode="decimal" className="input num" value={lg.gross_weight_kg} onChange={(e) => setLg({ ...lg, gross_weight_kg: e.target.value })} /></div>
          <div><label className="label" htmlFor="nw">{t('ed.net')}</label>
            <input id="nw" inputMode="decimal" className="input num" value={lg.net_weight_kg} onChange={(e) => setLg({ ...lg, net_weight_kg: e.target.value })} /></div>
          <div><label className="label" htmlFor="pal">{t('ed.pallets')}</label>
            <input id="pal" inputMode="numeric" className="input num" value={lg.pallets} onChange={(e) => setLg({ ...lg, pallets: e.target.value.replace(/\D/g, '') })} /></div>
        </section>
      </fieldset>
    </>
  )
}
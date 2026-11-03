import { useState } from 'react'
import { formatNumber } from '../../shared/calc'
import { clean, isProductSuffix, norm, splitByFragment } from '../../shared/oldInvoice'
import type { Category, OldImportPreview, OldImportRules, OldManualEntry, OldReviewLine, Product } from '../../shared/types'
import { confirmAction } from '../lib/confirm'
import { useI18n } from '../lib/i18n'
import { useToast } from '../lib/toast'

const K_MANUAL = 'invoicing.old.manual'
const K_MIN = 'invoicing.old.minWords'
const badge = {
  ok: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  duplicate: 'bg-amber-50 text-amber-800 ring-amber-200',
  error: 'bg-red-50 text-red-800 ring-red-200',
}
const stateStyle = {
  none: 'text-alert',
  ambiguous: 'text-alert',
  partial: 'text-amber-700',
  manual: 'text-emerald-700',
}

function loadManual(): Record<string, OldManualEntry> {
  try { return JSON.parse(localStorage.getItem(K_MANUAL) ?? '{}') } catch { return {} }
}

export default function OldInvoiceImport({ onDone }: { onDone: () => void }) {
  const { t } = useI18n()
  const toast = useToast()
  const [preview, setPreview] = useState<OldImportPreview | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [catalog, setCatalog] = useState<Product[]>([])
  const [manual, setManual] = useState<Record<string, OldManualEntry>>(loadManual)
  const [minWords, setMinWords] = useState<number>(() => Number(localStorage.getItem(K_MIN)) || 1)
  const [busy, setBusy] = useState(false)

  // Only valid entries are sent: a chosen product from the list, or a new name that is the end of the line.
  const valid = (e: OldManualEntry) => !!e.pick || (!!clean(e.name) && isProductSuffix(e.text, e.name))
  const current = (): OldImportRules => ({ minWords, manual: Object.values(manual).filter(valid) })

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try { await fn() } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }

  const choose = () => run(async () => {
    const p = await window.api.oldImport.choose(current())
    if (!p) return
    const [cats, prods] = await Promise.all([window.api.categories.list(), window.api.products.list()])
    setCategories(cats)
    setCatalog(prods)
    setPreview(p)
  })
  const refresh = () => run(async () => setPreview(await window.api.oldImport.preview(current())))
  const apply = () => run(async () => {
    if (!preview || !(await confirmAction(t('oi.confirm', { n: preview.ok })))) return
    const r = await window.api.oldImport.apply(current())
    toast.success(t('oi.done', { n: r.imported, s: r.skipped }))
    if (r.failed.length) toast.error(t('oi.failed', { n: r.failed.length, msg: `${r.failed[0].file}: ${r.failed[0].message}` }))
    setPreview(null)
    onDone()
  })

  const edit = (line: OldReviewLine, patch: Partial<OldManualEntry>) => {
    const k = norm(line.text)
    const base = manual[k] ?? { text: line.text, name: clean(line.text), code: '', customs_code: '', add: false, pick: null }
    const next = { ...manual, [k]: { ...base, ...patch } }
    setManual(next)
    localStorage.setItem(K_MANUAL, JSON.stringify(next))
  }
  const changeMin = (n: number) => { setMinWords(n); localStorage.setItem(K_MIN, String(n)) }

  const customsOptions = (() => {
    const byCode = new Map<string, string[]>()
    for (const c of categories) byCode.set(c.customs_code, [...(byCode.get(c.customs_code) ?? []), c.name])
    return [...byCode]
  })()
  const label = (s: 'ok' | 'duplicate' | 'error') => (s === 'ok' ? t('oi.ready') : s === 'duplicate' ? t('oi.exists') : t('oi.problem'))
  const stateLabel = (s: OldReviewLine['state']) =>
    s === 'none' ? t('oi.stateNone') : s === 'ambiguous' ? t('oi.stateAmbiguous') : s === 'partial' ? t('oi.statePartial') : t('oi.stateManual')

  return (
    <>
      <button className="btn-quiet" disabled={busy} onClick={choose}>{t('oi.button')}</button>
      {preview && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-6">
          <div role="dialog" aria-modal="true" className="flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-lg bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold">{t('oi.title')}</h2>
            <p className="mt-1 text-sm">{t('oi.summary', { ok: preview.ok, dup: preview.duplicates, err: preview.errors })}</p>
            <p className="mt-1 text-sm">
              {t('oi.matchSummary2', { m: preview.matched_total, p: preview.partial_total, x: preview.manual_total, u: preview.unmatched_total })}
            </p>
            {preview.new_clients.length > 0 && <p className="mt-1 text-sm text-ink/80">{t('oi.newClients', { names: preview.new_clients.join(', ') })}</p>}
            <p className="mt-2 text-sm text-ink/80">{t('oi.intro')}</p>

            <div className="mt-3 overflow-auto">
              <datalist id="oi-products">{catalog.map((p) => <option key={p.id} value={p.name} />)}</datalist>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{t('oi.reviewTitle', { n: preview.review.length })}</h3>
                <div className="flex items-center gap-2">
                  <label className="text-sm" htmlFor="oi-min">{t('oi.minWords')}</label>
                  <select id="oi-min" className="input w-auto" value={minWords} onChange={(e) => changeMin(Number(e.target.value))}>
                    {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <button className="btn-quiet" disabled={busy} onClick={refresh}>{t('oi.update')}</button>
                </div>
              </div>
              <p className="mb-2 text-xs text-ink/70">{t('oi.reviewHelp')}</p>

              {preview.review.length === 0 ? (
                <p className="text-sm text-ink/70">{t('oi.allMatched')}</p>
              ) : (
                <div className="max-h-[40vh] overflow-auto rounded border border-rule">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-mist text-left">
                      <tr>
                        <th className="p-2">{t('oi.colLine')}</th><th className="p-2">{t('oi.colProduct')}</th>
                        <th className="w-28 p-2">{t('oi.colCode')}</th><th className="w-52 p-2">{t('oi.colCustoms')}</th><th className="w-20 p-2">{t('oi.colAdd')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.review.map((line) => {
                        const e = manual[norm(line.text)]
                        const full = clean(line.text)
                        const shown = e ? e.name : line.state === 'partial' ? line.product ?? '' : line.state === 'ambiguous' ? '' : full
                        const hit = catalog.find((p) => norm(p.name) === norm(shown))
                        let info = ''
                        let bad = false
                        if (!clean(shown)) {
                          info = line.candidates.length ? t('oi.candidates', { names: line.candidates.join(' | ') }) : ''
                        } else if (hit) {
                          const s = splitByFragment(full, hit.name)
                          info = s.found ? (s.order ? t('oi.orderIs', { order: s.order }) : t('oi.orderNone')) : t('oi.noCommon')
                        } else if (isProductSuffix(full, shown)) {
                          const order = full.slice(0, full.length - clean(shown).length).trim()
                          info = order ? t('oi.orderIs', { order }) : t('oi.orderNone')
                        } else {
                          info = t('oi.mustEnd')
                          bad = true
                        }
                        const canNew = !hit && !!clean(shown) && !bad
                        return (
                          <tr key={norm(line.text)} className="border-t border-rule align-top">
                            <td className="p-2">
                              {full} <span className="text-ink/60">× {line.count}</span>
                              <div className={`text-xs ${stateStyle[line.state]}`}>{stateLabel(line.state)}</div>
                            </td>
                            <td className="p-2">
                              <input
                                aria-label={t('oi.colProduct')}
                                list="oi-products"
                                placeholder={t('oi.productPlaceholder')}
                                className="input"
                                value={shown}
                                onChange={(ev) => {
                                  const v = ev.target.value
                                  const h = catalog.find((p) => norm(p.name) === norm(v))
                                  edit(line, { name: v, pick: h ? h.id : null })
                                }}
                              />
                              <div className={`mt-0.5 text-xs ${bad ? 'text-alert' : 'text-ink/70'}`}>{info}</div>
                            </td>
                            <td className="p-2">
                              <input
                                aria-label={t('oi.colCode')}
                                className="input"
                                disabled={!canNew}
                                value={hit ? hit.code ?? '' : e?.code ?? ''}
                                onChange={(ev) => edit(line, { code: ev.target.value })}
                              />
                            </td>
                            <td className="p-2">
                              <select
                                aria-label={t('oi.colCustoms')}
                                className="input"
                                disabled={!canNew}
                                value={hit ? hit.customs_code ?? '' : e?.customs_code ?? ''}
                                onChange={(ev) => edit(line, { customs_code: ev.target.value })}
                              >
                                <option value="">{t('ed.choose')}</option>
                                {customsOptions.map(([code, names]) => <option key={code} value={code}>{code} · {names.join(', ')}</option>)}
                              </select>
                            </td>
                            <td className="p-2 text-center">
                              <input
                                type="checkbox"
                                aria-label={t('oi.colAdd')}
                                checked={e?.add ?? false}
                                disabled={!canNew || !clean(e?.code ?? '')}
                                onChange={(ev) => edit(line, { add: ev.target.checked })}
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <table className="mt-4 w-full text-sm">
                <thead className="bg-mist text-left">
                  <tr>
                    <th className="p-2">{t('oi.file')}</th><th className="p-2">{t('oi.number')}</th><th className="p-2">{t('oi.client')}</th>
                    <th className="p-2 num">{t('oi.lines')}</th><th className="p-2 num">{t('col.total')}</th><th className="p-2">{t('oi.result')}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.files.map((f) => (
                    <tr key={f.file} className="border-t border-rule align-top">
                      <td className="p-2">{f.file}</td>
                      <td className="p-2">{f.number ? `${f.number} / ${f.year}` : '-'}</td>
                      <td className="p-2">{f.client ?? '-'}</td>
                      <td className="p-2 num">{f.lines}</td>
                      <td className="p-2 num">{formatNumber(f.total, 2)}</td>
                      <td className="p-2">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${badge[f.status]}`}>{label(f.status)}</span>
                        {[...f.problems, ...f.warnings].map((m) => <div key={m} className="mt-0.5 text-xs text-ink/70">{m}</div>)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-quiet" disabled={busy} onClick={() => setPreview(null)}>{t('common.cancel')}</button>
              <button className="btn-primary" disabled={busy || preview.ok === 0} onClick={apply}>{t('oi.run', { n: preview.ok })}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
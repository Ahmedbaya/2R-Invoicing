import { useState } from 'react'
import { formatNumber } from '../../shared/calc'
import { clean, isProductSuffix, norm } from '../../shared/oldInvoice'
import type { Category, OldImportPreview, OldImportRules, OldManualEntry, OldReviewLine } from '../../shared/types'
import { confirmAction } from '../lib/confirm'
import { useI18n } from '../lib/i18n'
import { useToast } from '../lib/toast'

const STORAGE = 'invoicing.old.manual'
const badge = {
  ok: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  duplicate: 'bg-amber-50 text-amber-800 ring-amber-200',
  error: 'bg-red-50 text-red-800 ring-red-200',
}

function loadManual(): Record<string, OldManualEntry> {
  try { return JSON.parse(localStorage.getItem(STORAGE) ?? '{}') } catch { return {} }
}

export default function OldInvoiceImport({ onDone }: { onDone: () => void }) {
  const { t } = useI18n()
  const toast = useToast()
  const [preview, setPreview] = useState<OldImportPreview | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [manual, setManual] = useState<Record<string, OldManualEntry>>(loadManual)
  const [busy, setBusy] = useState(false)

  // Only entries whose product name really is the end of the line are sent.
  const current = (): OldImportRules => ({
    manual: Object.values(manual).filter((e) => clean(e.name) && isProductSuffix(e.text, e.name)),
  })

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try { await fn() } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }

  const choose = () => run(async () => {
    const p = await window.api.oldImport.choose(current())
    if (!p) return
    setCategories(await window.api.categories.list())
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
    const base = manual[k] ?? { text: line.text, name: clean(line.text), code: '', customs_code: '', add: false }
    const next = { ...manual, [k]: { ...base, ...patch } }
    setManual(next)
    localStorage.setItem(STORAGE, JSON.stringify(next))
  }

  const customsOptions = (() => {
    const byCode = new Map<string, string[]>()
    for (const c of categories) byCode.set(c.customs_code, [...(byCode.get(c.customs_code) ?? []), c.name])
    return [...byCode]
  })()
  const label = (s: 'ok' | 'duplicate' | 'error') => (s === 'ok' ? t('oi.ready') : s === 'duplicate' ? t('oi.exists') : t('oi.problem'))

  return (
    <>
      <button className="btn-quiet" disabled={busy} onClick={choose}>{t('oi.button')}</button>
      {preview && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-6">
          <div role="dialog" aria-modal="true" className="flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-lg bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold">{t('oi.title')}</h2>
            <p className="mt-1 text-sm">{t('oi.summary', { ok: preview.ok, dup: preview.duplicates, err: preview.errors })}</p>
            <p className="mt-1 text-sm">{t('oi.matchSummary', { m: preview.matched_total, x: preview.manual_total, u: preview.unmatched_total })}</p>
            {preview.new_clients.length > 0 && <p className="mt-1 text-sm text-ink/80">{t('oi.newClients', { names: preview.new_clients.join(', ') })}</p>}
            <p className="mt-2 text-sm text-ink/80">{t('oi.intro')}</p>

            <div className="mt-3 overflow-auto">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">{t('oi.reviewTitle', { n: preview.review.length })}</h3>
                <button className="btn-quiet" disabled={busy} onClick={refresh}>{t('oi.update')}</button>
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
                        const name = e?.name ?? full
                        const valid = isProductSuffix(full, name)
                        const order = valid ? full.slice(0, full.length - clean(name).length).trim() : ''
                        return (
                          <tr key={norm(line.text)} className="border-t border-rule align-top">
                            <td className="p-2">
                              {full} <span className="text-ink/60">× {line.count}</span>
                              {line.state === 'manual' && <span className="ml-1 text-emerald-700">✓</span>}
                            </td>
                            <td className="p-2">
                              <input aria-label={t('oi.colProduct')} className="input" value={name} onChange={(ev) => edit(line, { name: ev.target.value })} />
                              <div className={`mt-0.5 text-xs ${valid ? 'text-ink/70' : 'text-alert'}`}>
                                {valid ? (order ? t('oi.orderIs', { order }) : t('oi.orderNone')) : t('oi.mustEnd')}
                              </div>
                            </td>
                            <td className="p-2">
                              <input aria-label={t('oi.colCode')} className="input" value={e?.code ?? ''} onChange={(ev) => edit(line, { code: ev.target.value })} />
                            </td>
                            <td className="p-2">
                              <select aria-label={t('oi.colCustoms')} className="input" value={e?.customs_code ?? ''} onChange={(ev) => edit(line, { customs_code: ev.target.value })}>
                                <option value="">{t('ed.choose')}</option>
                                {customsOptions.map(([code, names]) => <option key={code} value={code}>{code} · {names.join(', ')}</option>)}
                              </select>
                            </td>
                            <td className="p-2 text-center">
                              <input type="checkbox" aria-label={t('oi.colAdd')} checked={e?.add ?? false} disabled={!clean(e?.code ?? '')} onChange={(ev) => edit(line, { add: ev.target.checked })} />
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
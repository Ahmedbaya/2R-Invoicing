import { useState } from 'react'
import type { ImportPreview } from '../../shared/types'
import { useI18n } from '../lib/i18n'
import { useToast } from '../lib/toast'

const badge = {
  new: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  update: 'bg-amber-50 text-amber-800 ring-amber-200',
  error: 'bg-red-50 text-red-800 ring-red-200',
}

export default function ProductImport({ onDone }: { onDone: () => void }) {
  const { t } = useI18n()
  const toast = useToast()
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [busy, setBusy] = useState(false)

  const choose = async () => {
    setBusy(true)
    try {
      const p = await window.api.products.importPreview()
      if (p) setPreview(p)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const apply = async () => {
    setBusy(true)
    try {
      const r = await window.api.products.importApply()
      toast.success(t('imp.done', { c: r.created, u: r.updated }))
      setPreview(null)
      onDone()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const ok = preview ? preview.newCount + preview.updateCount : 0
  const label = (a: 'new' | 'update' | 'error') => (a === 'new' ? t('imp.new') : a === 'update' ? t('imp.update') : t('imp.skip'))

  return (
    <>
      <button className="btn-quiet" disabled={busy} onClick={choose}>{t('imp.button')}</button>
      {preview && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-6">
          <div role="dialog" aria-modal="true" className="flex max-h-full w-full max-w-4xl flex-col rounded-lg bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold">{t('imp.title', { file: preview.fileName })}</h2>
            <p className="mt-1 text-sm">{t('imp.summary', { n: preview.newCount, u: preview.updateCount, e: preview.errorCount })}</p>
            {preview.errorCount > 0 && <p className="mt-1 text-sm text-ink/70">{t('imp.hint')}</p>}
            <div className="mt-3 overflow-auto rounded border border-rule">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-mist text-left">
                  <tr>
                    <th className="p-2">{t('imp.line')}</th><th className="p-2">{t('pr.code')}</th><th className="p-2">{t('pr.name')}</th>
                    <th className="p-2">{t('pr.category')}</th><th className="p-2 num">{t('pr.price')}</th><th className="p-2">{t('imp.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.line} className="border-t border-rule">
                      <td className="p-2 text-ink/60">{r.line}</td>
                      <td className="p-2">{r.code}</td>
                      <td className="p-2">{r.name}</td>
                      <td className="p-2">{r.category}</td>
                      <td className="p-2 num">{r.price}</td>
                      <td className="p-2">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${badge[r.action]}`}>{label(r.action)}</span>
                        {r.message && <span className="ml-2 text-xs text-alert">{r.message}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-quiet" disabled={busy} onClick={() => setPreview(null)}>{t('common.cancel')}</button>
              <button className="btn-primary" disabled={busy || ok === 0} onClick={apply}>{t('imp.run', { n: ok })}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
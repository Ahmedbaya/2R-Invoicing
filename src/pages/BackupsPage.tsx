import { useCallback, useEffect, useState } from 'react'
import type { BackupList } from '../../shared/types'
import { useI18n } from '../lib/i18n'
import { useToast } from '../lib/toast'

const size = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)

export default function BackupsPage() {
  const { t, locale } = useI18n()
  const toast = useToast()
  const [data, setData] = useState<BackupList | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(
    () => window.api.backup.list().then(setData).catch((e: Error) => toast.error(e.message)),
    [toast],
  )
  useEffect(() => { load() }, [load])

  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true)
    try {
      const msg = await fn()
      if (msg) toast.success(msg)
      await load()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const backupNow = () => run(async () => t('bk.done', { name: (await window.api.backup.now()).name }))
  const saveAs = () => run(async () => {
    const p = await window.api.backup.saveAs()
    return p ? t('bk.copySaved', { path: p }) : undefined
  })

  const newest = data?.files[0]
  const stale = !newest || Date.now() - new Date(newest.modified).getTime() > 7 * 86400000
  const fmt = (iso: string) => new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <>
      <h1 className="mb-2 text-2xl font-semibold">{t('bk.title')}</h1>
      <p className="mb-4 max-w-3xl text-sm text-ink/80">{t('bk.intro')}</p>

      {data && (
        <div className={`mb-4 rounded-lg border p-4 text-sm ${stale ? 'border-amber-300 bg-amber-50' : 'border-rule bg-white'}`}>
          <div className="font-medium">{newest ? t('bk.last', { date: fmt(newest.modified) }) : t('bk.none')}</div>
          {newest && stale && <div className="mt-1">{t('bk.warnOld')}</div>}
          <div className="mt-1 text-ink/70">{t('bk.folder')}: {data.dir}</div>
        </div>
      )}

      <div className="mb-6 flex flex-wrap gap-2">
        <button className="btn-primary" disabled={busy} onClick={backupNow}>{t('bk.now')}</button>
        <button className="btn-quiet" disabled={busy} onClick={saveAs}>{t('bk.saveAs')}</button>
        <button className="btn-quiet" disabled={busy} onClick={() => window.api.backup.openFolder().catch((e: Error) => toast.error(e.message))}>{t('bk.openFolder')}</button>
      </div>

      <h2 className="mb-2 font-semibold">{t('bk.list')}</h2>
      {data && data.files.length === 0 && <p className="text-sm">{t('bk.empty')}</p>}
      {data && data.files.length > 0 && (
        <table className="w-full overflow-hidden rounded border border-rule bg-white text-sm">
          <thead className="bg-mist text-left">
            <tr><th className="p-2">{t('bk.date')}</th><th className="p-2">{t('bk.file')}</th><th className="p-2 num">{t('bk.size')}</th></tr>
          </thead>
          <tbody>
            {data.files.map((f) => (
              <tr key={f.name} className="border-t border-rule">
                <td className="p-2">{fmt(f.modified)}</td>
                <td className="p-2">{f.name}</td>
                <td className="p-2 num">{size(f.size)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-4 max-w-3xl text-sm text-ink/70">{t('bk.restoreNote')}</p>
    </>
  )
}
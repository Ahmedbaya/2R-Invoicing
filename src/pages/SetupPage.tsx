import { useState } from 'react'
import { useI18n } from '../lib/i18n'
import { useToast } from '../lib/toast'

export default function SetupPage({ onSaved, firstRun }: { onSaved: () => void; firstRun: boolean }) {
  const { t } = useI18n()
  const toast = useToast()
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await window.api.config.save(url)
      toast.success(t('setup.saved'))
      onSaved()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={firstRun ? 'flex min-h-screen items-center justify-center p-6' : ''}>
      <div className="w-full max-w-xl rounded-lg border border-rule bg-white p-6">
        <h1 className="mb-2 text-xl font-semibold">{t('setup.title')}</h1>
        <p className="mb-4 text-sm text-ink/80">{t('setup.intro')}</p>
        <label className="label" htmlFor="dburl">{t('setup.label')}</label>
        <input id="dburl" type="password" autoComplete="off" className="input" placeholder="postgresql://…" value={url} onChange={(e) => setUrl(e.target.value)} />
        <p className="mt-2 text-xs text-ink/70">{t('setup.warn')}</p>
        {error && <p role="alert" className="mt-3 text-sm text-alert">{error}</p>}
        <button className="btn-primary mt-4" disabled={busy || !url.trim()} onClick={save}>{busy ? t('setup.testing') : t('setup.save')}</button>
      </div>
    </div>
  )
}
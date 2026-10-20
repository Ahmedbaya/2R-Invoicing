import { useEffect, useState } from 'react'
import type { Category, CategoryInput } from '../../shared/types'
import { confirmAction } from '../lib/confirm'
import { useI18n } from '../lib/i18n'

const blank: CategoryInput = { name: '', customs_code: '' }

export default function CategoriesPage() {
  const { t } = useI18n()
  const [categories, setCategories] = useState<Category[]>([])
  const [form, setForm] = useState<CategoryInput>(blank)
  const [error, setError] = useState<string | null>(null)

  const load = () => window.api.categories.list().then(setCategories).catch((e: Error) => setError(e.message))
  useEffect(() => { load() }, [])

  const save = async () => {
    setError(null)
    try {
      await window.api.categories.save(form)
      setForm(blank)
      await load()
    } catch (e) { setError((e as Error).message) }
  }

  const remove = async (c: Category) => {
    setError(null)
    try {
      if (!(await confirmAction(t('ca.confirmDelete', { name: c.name })))) return
      await window.api.categories.remove(c.id)
      if (form.id === c.id) setForm(blank)
      await load()
    } catch (e) { setError((e as Error).message) }
  }

  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">{t('ca.title')}</h1>
      <section className="mb-6 grid grid-cols-3 gap-3 rounded border border-rule bg-white p-4">
        <div>
          <label className="label" htmlFor="cname">{t('ca.name')}</label>
          <input id="cname" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="ccode">{t('ca.customs')}</label>
          <input id="ccode" placeholder="61124190" className="input" value={form.customs_code} onChange={(e) => setForm({ ...form, customs_code: e.target.value })} />
        </div>
        <div className="flex items-end gap-2">
          <button className="btn-primary" onClick={save}>{form.id ? t('ca.save') : t('ca.add')}</button>
          {form.id && <button className="btn-quiet" onClick={() => setForm(blank)}>{t('common.cancel')}</button>}
        </div>
        {error && <p role="alert" className="col-span-3 text-alert">{error}</p>}
      </section>
      <ul className="divide-y divide-rule rounded border border-rule bg-white text-sm">
        {categories.length === 0 && <li className="p-3">{t('ca.empty')}</li>}
        {categories.map((c) => (
          <li key={c.id} className="flex items-center justify-between p-3">
            <span><b>{c.name}</b> <span className="text-ink/70">· {c.customs_code}</span></span>
            <span className="flex gap-2">
              <button className="btn-quiet" onClick={() => setForm(c)}>{t('common.edit')}</button>
              <button className="btn-quiet text-alert" onClick={() => remove(c)}>{t('common.delete')}</button>
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}
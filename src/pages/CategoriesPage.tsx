import { useEffect, useState } from 'react'
import type { Category, CategoryInput } from '../../shared/types'
import { confirmAction } from '../lib/confirm'

const blank: CategoryInput = { name: '', customs_code: '' }

export default function CategoriesPage() {
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
      load()
    } catch (e) { setError((e as Error).message) }
  }

    const remove = async (c: Category) => {
    setError(null)
    try {
      if (!(await confirmAction(`Delete the category "${c.name}"?`))) return
      await window.api.categories.remove(c.id)
      if (form.id === c.id) setForm(blank)
      await load()
    } catch (e) { setError((e as Error).message) }
  }
  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">Categories</h1>
      <section className="mb-6 grid grid-cols-3 gap-3 rounded border border-rule bg-white p-4">
        <div>
          <label className="label" htmlFor="cname">Name (internal, never printed)</label>
          <input id="cname" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="ccode">Customs code (printed on the invoice)</label>
          <input id="ccode" placeholder="61124190" className="input" value={form.customs_code} onChange={(e) => setForm({ ...form, customs_code: e.target.value })} />
        </div>
        <div className="flex items-end gap-2">
          <button className="btn-primary" onClick={save}>{form.id ? 'Save category' : 'Add category'}</button>
          {form.id && <button className="btn-quiet" onClick={() => setForm(blank)}>Cancel</button>}
        </div>
        {error && <p role="alert" className="col-span-3 text-alert">{error}</p>}
      </section>
      <ul className="divide-y divide-rule rounded border border-rule bg-white text-sm">
        {categories.length === 0 && <li className="p-3">No categories yet.</li>}
        {categories.map((c) => (
          <li key={c.id} className="flex items-center justify-between p-3">
            <span><b>{c.name}</b> <span className="text-ink/70">· {c.customs_code}</span></span>
            <span className="flex gap-2">
              <button className="btn-quiet" onClick={() => setForm(c)}>Edit</button>
              <button className="btn-quiet text-alert" onClick={() => remove(c)}>Delete</button>
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}
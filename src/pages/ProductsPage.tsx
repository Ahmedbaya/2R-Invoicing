import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Category, Product, ProductInput } from '../../shared/types'
import { confirmAction } from '../lib/confirm'
import { useI18n } from '../lib/i18n'

const blank: ProductInput = { code: '', name: '', description: '', category_id: 0, default_price: '' }

export default function ProductsPage() {
  const { t } = useI18n()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [form, setForm] = useState<ProductInput>(blank)
  const [error, setError] = useState<string | null>(null)

  const load = () =>
    Promise.all([window.api.products.list(), window.api.categories.list()])
      .then(([p, c]) => { setProducts(p); setCategories(c) })
      .catch((e: Error) => setError(e.message))
  useEffect(() => { load() }, [])

  const save = async () => {
    setError(null)
    if (!form.category_id) { setError(t('pr.needCategory')); return }
    try {
      await window.api.products.save(form)
      setForm(blank)
      await load()
    } catch (e) { setError((e as Error).message) }
  }

  const edit = (p: Product) =>
    setForm({ id: p.id, code: p.code ?? '', name: p.name, description: p.description ?? '', category_id: p.category_id ?? 0, default_price: p.default_price })

  const remove = async (p: Product) => {
    setError(null)
    try {
      if (!(await confirmAction(t('pr.confirmDelete', { name: p.name })))) return
      await window.api.products.remove(p.id)
      if (form.id === p.id) setForm(blank)
      await load()
    } catch (e) { setError((e as Error).message) }
  }

  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">{t('pr.title')}</h1>
      <section className="mb-6 grid grid-cols-4 gap-3 rounded border border-rule bg-white p-4">
        <div>
          <label className="label" htmlFor="code">{t('pr.code')}</label>
          <input id="code" placeholder="OK0001" className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
        </div>
        <div className="col-span-2">
          <label className="label" htmlFor="name">{t('pr.name')}</label>
          <input id="name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="price">{t('pr.price')}</label>
          <input id="price" inputMode="decimal" className="input num" value={form.default_price} onChange={(e) => setForm({ ...form, default_price: e.target.value })} />
        </div>
        <div className="col-span-2">
          <label className="label" htmlFor="cat">{t('pr.category')}</label>
          <select id="cat" className="input" value={form.category_id || ''} onChange={(e) => setForm({ ...form, category_id: Number(e.target.value) })}>
            <option value="">{t('pr.chooseCategory')}</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.customs_code})</option>)}
          </select>
          {categories.length === 0 && (
            <p className="mt-1 text-sm">{t('pr.noCategories')} <Link className="text-thread underline" to="/categories">{t('pr.addFirst')}</Link>.</p>
          )}
        </div>
        <div className="col-span-2">
          <label className="label" htmlFor="desc">{t('pr.description')}</label>
          <input id="desc" className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="col-span-4 flex gap-2">
          <button className="btn-primary" onClick={save}>{form.id ? t('pr.save') : t('pr.add')}</button>
          {form.id && <button className="btn-quiet" onClick={() => setForm(blank)}>{t('common.cancel')}</button>}
        </div>
        {error && <p role="alert" className="col-span-4 text-alert">{error}</p>}
      </section>

      <ul className="divide-y divide-rule rounded border border-rule bg-white text-sm">
        {products.length === 0 && <li className="p-3">{t('pr.empty')}</li>}
        {products.map((p) => (
          <li key={p.id} className="flex items-center justify-between p-3">
            <span>
              <b>{p.code ?? t('pr.noCode')}</b> {p.name}{' '}
              <span className="text-ink/70">· {p.customs_code ? t('pr.customsOf', { code: p.customs_code }) : t('pr.noCategory')} · {p.default_price}</span>
            </span>
            <span className="flex gap-2">
              <button className="btn-quiet" onClick={() => edit(p)}>{t('common.edit')}</button>
              <button className="btn-quiet text-alert" onClick={() => remove(p)}>{t('common.delete')}</button>
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}
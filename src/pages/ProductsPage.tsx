import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Category, Product, ProductInput } from '../../shared/types'

const blank: ProductInput = { code: '', name: '', description: '', category_id: 0, default_price: '' }

export default function ProductsPage() {
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
    if (!form.category_id) { setError('Choose a category for this product.'); return }
    try {
      await window.api.products.save(form)
      setForm(blank)
      load()
    } catch (e) { setError((e as Error).message) }
  }

  const edit = (p: Product) =>
    setForm({ id: p.id, code: p.code ?? '', name: p.name, description: p.description ?? '', category_id: p.category_id ?? 0, default_price: p.default_price })

  const remove = async (p: Product) => {
    if (!(await window.api.confirm(`Delete "${p.name}"? Existing invoices are not affected.`))) return
    setError(null)
    try {
      await window.api.products.remove(p.id)
      if (form.id === p.id) setForm(blank)
      load()
    } catch (e) { setError((e as Error).message) }
  }

  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">Products</h1>
      <section className="mb-6 grid grid-cols-4 gap-3 rounded border border-rule bg-white p-4">
        <div>
          <label className="label" htmlFor="code">Code</label>
          <input id="code" placeholder="OK0001" className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
        </div>
        <div className="col-span-2">
          <label className="label" htmlFor="name">Name</label>
          <input id="name" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="price">Price</label>
          <input id="price" inputMode="decimal" className="input num" value={form.default_price} onChange={(e) => setForm({ ...form, default_price: e.target.value })} />
        </div>
        <div className="col-span-2">
          <label className="label" htmlFor="cat">Category</label>
          <select id="cat" className="input" value={form.category_id || ''} onChange={(e) => setForm({ ...form, category_id: Number(e.target.value) })}>
            <option value="">Choose a category</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.customs_code})</option>)}
          </select>
          {categories.length === 0 && <p className="mt-1 text-sm">No categories yet. <Link className="text-thread underline" to="/categories">Add one first</Link>.</p>}
        </div>
        <div className="col-span-2">
          <label className="label" htmlFor="desc">Description</label>
          <input id="desc" className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="col-span-4 flex gap-2">
          <button className="btn-primary" onClick={save}>{form.id ? 'Save product' : 'Add product'}</button>
          {form.id && <button className="btn-quiet" onClick={() => setForm(blank)}>Cancel</button>}
        </div>
        {error && <p role="alert" className="col-span-4 text-alert">{error}</p>}
      </section>

      <ul className="divide-y divide-rule rounded border border-rule bg-white text-sm">
        {products.length === 0 && <li className="p-3">No products yet. Add recurring items so invoice lines fill in faster.</li>}
        {products.map((p) => (
          <li key={p.id} className="flex items-center justify-between p-3">
            <span>
              <b>{p.code ?? 'No code'}</b> {p.name}{' '}
              <span className="text-ink/70">· {p.customs_code ? `customs ${p.customs_code}` : 'no category yet'} · {p.default_price}</span>
            </span>
            <span className="flex gap-2">
              <button className="btn-quiet" onClick={() => edit(p)}>Edit</button>
              <button className="btn-quiet text-alert" onClick={() => remove(p)}>Delete</button>
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}
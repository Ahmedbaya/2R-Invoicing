import { useEffect, useState } from 'react'
import type { Product, ProductInput } from '../../shared/types'

const blank: ProductInput = { sku: '', description: '', default_price: '' }

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [form, setForm] = useState<ProductInput>(blank)
  const [error, setError] = useState<string | null>(null)

  const load = () => window.api.products.list().then(setProducts).catch((e: Error) => setError(e.message))
  useEffect(() => { load() }, [])

  const save = async () => {
    setError(null)
    try {
      await window.api.products.save(form)
      setForm(blank)
      load()
    } catch (e) { setError((e as Error).message) }
  }
    const remove = async (p: Product) => {
    if (!window.confirm(`Delete "${p.description}"? Existing invoices are not affected.`)) return
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
        <div><label className="label" htmlFor="sku">SKU</label>
          <input id="sku" className="input" value={form.sku ?? ''} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></div>
        <div className="col-span-2"><label className="label" htmlFor="desc">Description (ARTICOLO)</label>
          <input id="desc" className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <div><label className="label" htmlFor="price">Default price</label>
          <input id="price" inputMode="decimal" className="input num" value={form.default_price} onChange={(e) => setForm({ ...form, default_price: e.target.value })} /></div>
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
            <span><b>{p.description}</b> <span className="text-ink/70">{p.sku} · {p.default_price}</span></span>
                        <span className="flex gap-2">
              <button className="btn-quiet" onClick={() => setForm(p)}>Edit</button>
              <button className="btn-quiet text-alert" onClick={() => remove(p)}>Delete</button>
            </span>
          </li>
        ))}
      </ul>
    </>
  )
  
}

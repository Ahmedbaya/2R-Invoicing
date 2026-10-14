import { useEffect, useState } from 'react'
import type { Client, ClientInput } from '../../shared/types'

const blank: ClientInput = { company_name: '', address_1: '', address_2: '', country: '', tax_id: '' }

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [form, setForm] = useState<ClientInput>(blank)
  const [error, setError] = useState<string | null>(null)

  const load = () => window.api.clients.list().then(setClients).catch((e: Error) => setError(e.message))
  useEffect(() => { load() }, [])

  const save = async () => {
    setError(null)
    try {
      await window.api.clients.save(form)
      setForm(blank)
      load()
    } catch (e) { setError((e as Error).message) }
  }
    const remove = async (c: Client) => {
    if (!window.confirm(`Delete ${c.company_name}? This cannot be undone.`)) return
    setError(null)
    try {
      await window.api.clients.remove(c.id)
      if (form.id === c.id) setForm(blank)
      load()
    } catch (e) { setError((e as Error).message) }
  }
  const field = (key: keyof ClientInput, label: string) => (
    <div>
      <label className="label" htmlFor={key}>{label}</label>
      <input id={key} className="input" value={(form[key] as string) ?? ''} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </div>
  )

  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold">Clients</h1>
      <section className="mb-6 grid grid-cols-2 gap-3 rounded border border-rule bg-white p-4">
        {field('company_name', 'Company name')}
        {field('tax_id', 'Tax ID')}
        {field('address_1', 'Address line 1')}
        {field('address_2', 'Address line 2')}
        {field('country', 'Country')}
        <div className="flex items-end gap-2">
          <button className="btn-primary" onClick={save}>{form.id ? 'Save client' : 'Add client'}</button>
          {form.id && <button className="btn-quiet" onClick={() => setForm(blank)}>Cancel</button>}
        </div>
        {error && <p role="alert" className="col-span-2 text-alert">{error}</p>}
      </section>
      <ul className="divide-y divide-rule rounded border border-rule bg-white text-sm">
        {clients.length === 0 && <li className="p-3">No clients yet. Add your first client above.</li>}
        {clients.map((c) => (
          <li key={c.id} className="flex items-center justify-between p-3">
            <span><b>{c.company_name}</b> <span className="text-ink/70">{[c.address_1, c.country].filter(Boolean).join(', ')}</span></span>
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

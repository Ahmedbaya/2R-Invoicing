import { useEffect, useState } from 'react'
import type { Client, ClientInput } from '../../shared/types'
import { confirmAction } from '../lib/confirm'
import { useI18n } from '../lib/i18n'

const blank: ClientInput = { company_name: '', address_1: '', address_2: '', country: '', tax_id: '' }

export default function ClientsPage() {
  const { t } = useI18n()
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
      await load()
    } catch (e) { setError((e as Error).message) }
  }

  const remove = async (c: Client) => {
    setError(null)
    try {
      if (!(await confirmAction(t('cl.confirmDelete', { name: c.company_name })))) return
      await window.api.clients.remove(c.id)
      if (form.id === c.id) setForm(blank)
      await load()
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
      <h1 className="mb-4 text-2xl font-semibold">{t('cl.title')}</h1>
      <section className="mb-6 grid grid-cols-2 gap-3 rounded border border-rule bg-white p-4">
        {field('company_name', t('cl.company'))}
        {field('tax_id', t('cl.taxId'))}
        {field('address_1', t('cl.addr1'))}
        {field('address_2', t('cl.addr2'))}
        {field('country', t('cl.country'))}
        <div className="flex items-end gap-2">
          <button className="btn-primary" onClick={save}>{form.id ? t('cl.save') : t('cl.add')}</button>
          {form.id && <button className="btn-quiet" onClick={() => setForm(blank)}>{t('common.cancel')}</button>}
        </div>
        {error && <p role="alert" className="col-span-2 text-alert">{error}</p>}
      </section>
      <ul className="divide-y divide-rule rounded border border-rule bg-white text-sm">
        {clients.length === 0 && <li className="p-3">{t('cl.empty')}</li>}
        {clients.map((c) => (
          <li key={c.id} className="flex items-center justify-between p-3">
            <span><b>{c.company_name}</b> <span className="text-ink/70">{[c.address_1, c.country].filter(Boolean).join(', ')}</span></span>
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
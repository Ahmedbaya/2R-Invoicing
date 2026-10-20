import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { formatNumber } from '../../shared/calc'
import type { DashboardStats } from '../../shared/types'
import { PlusIcon } from '../components/icons'
import StatusBadge from '../components/StatusBadge'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const eur = (v: string) => `${formatNumber(v, 2)} €`
const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace('.', ',')} k` : String(Math.round(n)))

function Card({ label, value, hint, to, warn }: { label: string; value: string; hint?: ReactNode; to?: string; warn?: boolean }) {
  const body = (
    <>
      <div className="text-sm text-ink/70">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-ink/70">{hint}</div>}
    </>
  )
  const cls = `block rounded-lg border p-4 ${warn ? 'border-amber-300 bg-amber-50' : 'border-rule bg-white'}`
  return to ? <Link to={to} className={`${cls} hover:shadow-sm`}>{body}</Link> : <div className={cls}>{body}</div>
}

function Panel({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-rule bg-white p-4 ${className}`}>
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function trend(cur: string, prev: string) {
  const c = Number(cur)
  const p = Number(prev)
  if (!p) return <span>No finalized invoices last month</span>
  const pct = ((c - p) / p) * 100
  return <span className={pct >= 0 ? 'text-emerald-700' : 'text-alert'}>{pct >= 0 ? '▲' : '▼'} {Math.abs(pct).toFixed(0)} % vs last month</span>
}

function BarChart({ values, currentMonth }: { values: number[]; currentMonth: number }) {
  const W = 600
  const base = 190
  const top = 20
  const max = Math.max(...values, 1)
  const slot = W / 12
  const bw = slot * 0.6
  return (
    <svg viewBox={`0 0 ${W} 214`} className="w-full" role="img" aria-label="Revenue by month">
      <line x1="0" x2={W} y1={base} y2={base} className="stroke-rule" />
      {values.map((v, i) => {
        const h = (v / max) * (base - top)
        const x = i * slot + (slot - bw) / 2
        return (
          <g key={i}>
            <rect x={x} y={base - h} width={bw} height={v > 0 ? Math.max(h, 2) : 0} rx="3" className={i === currentMonth ? 'fill-thread' : 'fill-thread/40'}>
              <title>{`${MONTHS[i]}: ${eur(String(v))}`}</title>
            </rect>
            {v > 0 && <text x={x + bw / 2} y={base - h - 5} textAnchor="middle" className="fill-ink text-[10px]">{compact(v)}</text>}
            <text x={x + bw / 2} y={base + 16} textAnchor="middle" className="fill-ink/60 text-[11px]">{MONTHS[i]}</text>
          </g>
        )
      })}
    </svg>
  )
}

export default function Dashboard() {
  const [s, setS] = useState<DashboardStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setError(null)
    window.api.dashboard.stats().then(setS).catch((e: Error) => setError(e.message))
  }
  useEffect(() => { load() }, [])

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const yearTotal = Number(s?.revenue_year ?? 0)

  return (
    <>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-ink/70">{today}</p>
        </div>
        <div className="flex gap-2">
          <Link to="/clients" className="btn-quiet">Add client</Link>
          <Link to="/products" className="btn-quiet">Add product</Link>
          <Link to="/invoices/new" className="btn-primary gap-2"><PlusIcon /> New invoice</Link>
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded border border-alert/30 bg-white p-3 text-sm text-alert">
          {error} <button className="ml-2 underline" onClick={load}>Try again</button>
        </div>
      )}
      {!s && !error && <p>Loading…</p>}

      {s && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card label="Revenue this month" value={eur(s.revenue_month)} hint={trend(s.revenue_month, s.revenue_prev_month)} />
            <Card label={`Revenue ${s.year}`} value={eur(s.revenue_year)} hint={`${s.invoices_month} invoice${s.invoices_month === 1 ? '' : 's'} issued this month`} />
            <Card label="Drafts waiting" value={String(s.drafts)} hint={s.drafts > 0 ? 'Open the list to finish them' : 'Nothing pending'} to="/invoices" warn={s.drafts > 0} />
            <Card label="Next invoice number" value={`${s.next_number} / ${s.year}`} hint="Assigned when you finalize" />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title={`Monthly revenue ${s.year}`} className="lg:col-span-2">
              {yearTotal === 0 ? <p className="text-sm text-ink/70">No finalized invoices yet this year.</p>
                : <BarChart values={s.monthly.map(Number)} currentMonth={new Date().getMonth()} />}
            </Panel>
            <Panel title="Revenue by customs category">
              {s.by_category.length === 0 ? <p className="text-sm text-ink/70">Nothing to show yet.</p> : (
                <ul className="space-y-3 text-sm">
                  {s.by_category.map((c) => {
                    const total = Number(c.total)
                    const max = Math.max(...s.by_category.map((x) => Number(x.total)), 1)
                    return (
                      <li key={c.customs_code}>
                        <div className="flex justify-between gap-2">
                          <span>{c.customs_code || 'No customs code'}{c.name ? ` · ${c.name}` : ''}</span>
                          <span className="tabular-nums">{yearTotal ? ((total / yearTotal) * 100).toFixed(0) : 0} %</span>
                        </div>
                        <div className="mt-1 h-2 rounded bg-thread/10"><div className="h-2 rounded bg-thread" style={{ width: `${(total / max) * 100}%` }} /></div>
                        <div className="mt-0.5 text-xs text-ink/70 tabular-nums">{eur(c.total)}</div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Panel>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title={`Top clients ${s.year}`}>
              {s.top_clients.length === 0 ? <p className="text-sm text-ink/70">Nothing to show yet.</p> : (
                <ol className="space-y-2 text-sm">
                  {s.top_clients.map((c, i) => (
                    <li key={c.name} className="flex items-center justify-between gap-2">
                      <span><span className="mr-2 text-ink/50">{i + 1}.</span>{c.name} <span className="text-xs text-ink/60">({c.count})</span></span>
                      <span className="tabular-nums">{eur(c.total)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </Panel>
            <Panel title="Recent invoices" className="lg:col-span-2">
              {s.recent.length === 0 ? (
                <p className="text-sm">No invoices yet. <Link className="text-thread underline" to="/invoices/new">Create the first one</Link>.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-ink/70">
                    <tr><th className="pb-1">Number</th><th className="pb-1">Client</th><th className="pb-1">Date</th><th className="pb-1 num">Total</th><th className="pb-1 pl-3">Status</th></tr>
                  </thead>
                  <tbody>
                    {s.recent.map((r) => (
                      <tr key={r.id} className="border-t border-rule">
                        <td className="py-1.5"><Link className="text-thread underline" to={`/invoices/${r.id}`}>{r.number ? `${r.number} / ${r.year}` : 'Draft'}</Link></td>
                        <td className="py-1.5">{r.client_name ?? 'No client'}</td>
                        <td className="py-1.5">{r.issue_date.split('-').reverse().join('/')}</td>
                        <td className="py-1.5 num">{formatNumber(r.total_amount, 2)} {r.currency}</td>
                        <td className="py-1.5 pl-3"><StatusBadge status={r.status} hasNumber={r.number !== null} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          </div>
        </div>
      )}
    </>
  )
}
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { formatNumber } from '../../shared/calc'
import type { DashboardStats } from '../../shared/types'
import { PlusIcon } from '../components/icons'
import StatusBadge from '../components/StatusBadge'
import { useI18n } from '../lib/i18n'

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

function BarChart({ values, months, currentMonth, label }: { values: number[]; months: string[]; currentMonth: number; label: string }) {
  const W = 600
  const base = 190
  const top = 20
  const max = Math.max(...values, 1)
  const slot = W / 12
  const bw = slot * 0.6
  return (
    <svg viewBox={`0 0 ${W} 214`} className="w-full" role="img" aria-label={label}>
      <line x1="0" x2={W} y1={base} y2={base} className="stroke-rule" />
      {values.map((v, i) => {
        const h = (v / max) * (base - top)
        const x = i * slot + (slot - bw) / 2
        return (
          <g key={i}>
            <rect x={x} y={base - h} width={bw} height={v > 0 ? Math.max(h, 2) : 0} rx="3" className={i === currentMonth ? 'fill-thread' : 'fill-thread/40'}>
              <title>{`${months[i]}: ${eur(String(v))}`}</title>
            </rect>
            {v > 0 && <text x={x + bw / 2} y={base - h - 5} textAnchor="middle" className="fill-ink text-[10px]">{compact(v)}</text>}
            <text x={x + bw / 2} y={base + 16} textAnchor="middle" className="fill-ink/60 text-[11px]">{months[i]}</text>
          </g>
        )
      })}
    </svg>
  )
}

export default function Dashboard() {
  const { t, locale } = useI18n()
  const [s, setS] = useState<DashboardStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setError(null)
    window.api.dashboard.stats().then(setS).catch((e: Error) => setError(e.message))
  }
  useEffect(() => { load() }, [])

  const months = useMemo(
    () => Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString(locale, { month: 'short' })),
    [locale],
  )
  const today = new Date().toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  const yearTotal = Number(s?.revenue_year ?? 0)

  const trend = (cur: string, prev: string) => {
    const c = Number(cur)
    const p = Number(prev)
    if (!p) return <span>{t('dash.trendNone')}</span>
    const pct = ((c - p) / p) * 100
    return (
      <span className={pct >= 0 ? 'text-emerald-700' : 'text-alert'}>
        {pct >= 0 ? '▲' : '▼'} {t('dash.trendVs', { pct: Math.abs(pct).toFixed(0) })}
      </span>
    )
  }

  return (
    <>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t('dash.title')}</h1>
          <p className="text-sm text-ink/70">{today}</p>
        </div>
        <div className="flex gap-2">
          <Link to="/clients" className="btn-quiet">{t('dash.addClient')}</Link>
          <Link to="/products" className="btn-quiet">{t('dash.addProduct')}</Link>
          <Link to="/invoices/new" className="btn-primary gap-2"><PlusIcon /> {t('dash.newInvoice')}</Link>
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded border border-alert/30 bg-white p-3 text-sm text-alert">
          {error} <button className="ml-2 underline" onClick={load}>{t('db.tryAgain')}</button>
        </div>
      )}
      {!s && !error && <p>{t('common.loading')}</p>}

      {s && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card label={t('dash.revenueMonth')} value={eur(s.revenue_month)} hint={trend(s.revenue_month, s.revenue_prev_month)} />
            <Card label={t('dash.revenueYear', { year: s.year })} value={eur(s.revenue_year)}
              hint={s.invoices_month === 1 ? t('dash.issuedOne') : t('dash.issuedMany', { n: s.invoices_month })} />
            <Card label={t('dash.drafts')} value={String(s.drafts)} to="/invoices" warn={s.drafts > 0}
              hint={s.drafts > 0 ? t('dash.draftsHint') : t('dash.nothingPending')} />
            <Card label={t('dash.nextNumber')} value={`${s.next_number} / ${s.year}`} hint={t('dash.nextNumberHint')} />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Panel title={t('dash.monthly', { year: s.year })} className="lg:col-span-2">
              {yearTotal === 0 ? <p className="text-sm text-ink/70">{t('dash.noFinalized')}</p>
                : <BarChart values={s.monthly.map(Number)} months={months} currentMonth={new Date().getMonth()} label={t('dash.chartLabel')} />}
            </Panel>
            <Panel title={t('dash.byCategory')}>
              {s.by_category.length === 0 ? <p className="text-sm text-ink/70">{t('dash.nothingYet')}</p> : (
                <ul className="space-y-3 text-sm">
                  {s.by_category.map((c) => {
                    const total = Number(c.total)
                    const max = Math.max(...s.by_category.map((x) => Number(x.total)), 1)
                    return (
                      <li key={c.customs_code}>
                        <div className="flex justify-between gap-2">
                          <span>{c.customs_code || t('dash.noCustoms')}{c.name ? ` · ${c.name}` : ''}</span>
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
            <Panel title={t('dash.topClients', { year: s.year })}>
              {s.top_clients.length === 0 ? <p className="text-sm text-ink/70">{t('dash.nothingYet')}</p> : (
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
            <Panel title={t('dash.recent')} className="lg:col-span-2">
              {s.recent.length === 0 ? (
                <p className="text-sm">{t('dash.noInvoices')} <Link className="text-thread underline" to="/invoices/new">{t('dash.createFirst')}</Link>.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-left text-ink/70">
                    <tr><th className="pb-1">{t('col.number')}</th><th className="pb-1">{t('col.client')}</th><th className="pb-1">{t('col.date')}</th><th className="pb-1 num">{t('col.total')}</th><th className="pb-1 pl-3">{t('col.status')}</th></tr>
                  </thead>
                  <tbody>
                    {s.recent.map((r) => (
                      <tr key={r.id} className="border-t border-rule">
                        <td className="py-1.5"><Link className="text-thread underline" to={`/invoices/${r.id}`}>{r.number ? `${r.number} / ${r.year}` : t('status.draft')}</Link></td>
                        <td className="py-1.5">{r.client_name ?? t('common.noClient')}</td>
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
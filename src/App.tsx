import { useCallback, useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { CategoriesIcon, ClientsIcon, DashboardIcon, InvoiceIcon, ProductsIcon } from './components/icons'
import { LANGS, useI18n, type Lang } from './lib/i18n'
import { ToastProvider } from './lib/toast'
import { getUserName, setUserName } from './lib/user'
import CategoriesPage from './pages/CategoriesPage'
import ClientsPage from './pages/ClientsPage'
import Dashboard from './pages/Dashboard'
import InvoiceEditor from './pages/InvoiceEditor'
import InvoiceList from './pages/InvoiceList'
import ProductsPage from './pages/ProductsPage'
import type { Key } from './locales/en'

const NAV: { to: string; label: Key; Icon: () => JSX.Element }[] = [
  { to: '/dashboard', label: 'nav.dashboard', Icon: DashboardIcon },
  { to: '/invoices', label: 'nav.invoices', Icon: InvoiceIcon },
  { to: '/clients', label: 'nav.clients', Icon: ClientsIcon },
  { to: '/products', label: 'nav.products', Icon: ProductsIcon },
  { to: '/categories', label: 'nav.categories', Icon: CategoriesIcon },
]

const link = ({ isActive }: { isActive: boolean }) =>
  `mx-2 flex items-center gap-3 rounded-md px-3 py-2 text-sm ${
    isActive ? 'bg-white/15 font-medium text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'
  }`

export default function App() {
  const { t, lang, setLang } = useI18n()
  // undefined = still checking, null = connected, string = error message
  const [dbError, setDbError] = useState<string | null | undefined>(undefined)
  const [name, setName] = useState(getUserName())

  const check = useCallback(() => {
    window.api.db.ping().then(() => setDbError(null)).catch((e: Error) => setDbError(e.message))
  }, [])
  useEffect(() => {
    check()
    const timer = setInterval(check, 60000)
    return () => clearInterval(timer)
  }, [check])

  return (
    <ToastProvider>
      <div className="flex h-screen">
        <aside className="flex w-60 flex-col bg-ink text-white">
          <div className="flex items-center gap-3 px-4 py-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-sm font-bold text-ink">2R</div>
            <div>
              <div className="text-sm font-semibold leading-tight">2R Confection</div>
              <div className="text-xs text-white/60">{t('app.subtitle')}</div>
            </div>
          </div>
          <nav className="flex-1 space-y-1">
            {NAV.map(({ to, label, Icon }) => (
              <NavLink key={to} to={to} className={link}><Icon /> {t(label)}</NavLink>
            ))}
          </nav>
          <div className="space-y-3 p-4">
            <div role="status" className="flex items-center gap-2 text-xs text-white/70">
              <span className={`h-2 w-2 rounded-full ${dbError === undefined ? 'bg-amber-400' : dbError ? 'bg-red-500' : 'bg-emerald-400'}`} />
              {dbError === undefined ? t('db.connecting') : dbError ? t('db.offline') : t('db.connected')}
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/70" htmlFor="lang">{t('lang.label')}</label>
              <select id="lang" value={lang} onChange={(e) => setLang(e.target.value as Lang)}
                className="w-full rounded bg-white/10 px-2 py-1 text-sm text-white [&>option]:text-ink">
                {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-white/70" htmlFor="me">{t('user.nameLabel')}</label>
              <input id="me" className="w-full rounded bg-white/10 px-2 py-1 text-sm" value={name}
                onChange={(e) => { setName(e.target.value); setUserName(e.target.value) }} />
            </div>
          </div>
        </aside>
        <main className="flex-1 overflow-auto">
          {dbError && (
            <div role="alert" className="flex items-center justify-between bg-alert px-6 py-2 text-sm text-white">
              <span>{dbError}</span>
              <button className="underline" onClick={check}>{t('db.tryAgain')}</button>
            </div>
          )}
          <div className="mx-auto max-w-6xl p-6">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/invoices" element={<InvoiceList />} />
              <Route path="/invoices/new" element={<InvoiceEditor />} />
              <Route path="/invoices/:id" element={<InvoiceEditor />} />
              <Route path="/clients" element={<ClientsPage />} />
              <Route path="/products" element={<ProductsPage />} />
              <Route path="/categories" element={<CategoriesPage />} />
            </Routes>
          </div>
        </main>
      </div>
    </ToastProvider>
  )
}
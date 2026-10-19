import { useCallback, useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { getUserName, setUserName } from './lib/user'
import ClientsPage from './pages/ClientsPage'
import InvoiceEditor from './pages/InvoiceEditor'
import InvoiceList from './pages/InvoiceList'
import ProductsPage from './pages/ProductsPage'
import CategoriesPage from './pages/CategoriesPage'

const link = ({ isActive }: { isActive: boolean }) =>
  `block border-l-4 px-4 py-2 text-sm ${isActive ? 'border-white bg-white/10 font-medium' : 'border-transparent hover:bg-white/5'}`

export default function App() {
  const [dbError, setDbError] = useState<string | null>(null)
  const [name, setName] = useState(getUserName())

  const check = useCallback(() => {
    window.api.db.ping().then(() => setDbError(null)).catch((e: Error) => setDbError(e.message))
  }, [])
  useEffect(check, [check])

  return (
    <div className="flex h-screen">
      <aside className="flex w-56 flex-col bg-ink text-white">
        <div className="px-4 py-5 text-lg font-semibold">2R Confection</div>
        <nav className="flex-1">
          <NavLink to="/invoices" className={link}>Invoices</NavLink>
          <NavLink to="/clients" className={link}>Clients</NavLink>
          <NavLink to="/categories" className={link}>Categories</NavLink>
          <NavLink to="/products" className={link}>Products</NavLink>
        </nav>
        <div className="p-4">
          <label className="mb-1 block text-xs text-white/70" htmlFor="me">Your name (saved on invoices)</label>
          <input id="me" className="w-full rounded bg-white/10 px-2 py-1 text-sm" value={name}
            onChange={(e) => { setName(e.target.value); setUserName(e.target.value) }} />
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        {dbError && (
          <div role="alert" className="flex items-center justify-between bg-alert px-6 py-2 text-sm text-white">
            <span>{dbError}</span>
            <button className="underline" onClick={check}>Try again</button>
          </div>
        )}
        <div className="mx-auto max-w-5xl p-6">
          <Routes>
            <Route path="/" element={<Navigate to="/invoices" replace />} />
            <Route path="/invoices" element={<InvoiceList />} />
            <Route path="/invoices/new" element={<InvoiceEditor />} />
            <Route path="/invoices/:id" element={<InvoiceEditor />} />
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/products" element={<ProductsPage />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

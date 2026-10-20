import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

type Kind = 'success' | 'error'
interface ToastItem { id: number; kind: Kind; text: string }
interface ToastApi { success(text: string): void; error(text: string): void }

const Ctx = createContext<ToastApi>({ success: () => {}, error: () => {} })
export const useToast = () => useContext(Ctx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), [])
  const push = useCallback(
    (kind: Kind, text: string) => {
      const id = Date.now() + Math.random()
      setItems((l) => [...l, { id, kind, text }])
      setTimeout(() => dismiss(id), kind === 'error' ? 8000 : 4000)
    },
    [dismiss],
  )
  const api = useMemo<ToastApi>(() => ({ success: (t) => push('success', t), error: (t) => push('error', t) }), [push])

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex items-start justify-between gap-3 rounded-lg border border-l-4 bg-white px-3 py-2 text-sm shadow-lg ${
              t.kind === 'error' ? 'border-rule border-l-alert text-alert' : 'border-rule border-l-emerald-600 text-ink'
            }`}
          >
            <span className="break-words">{t.text}</span>
            <button aria-label="Dismiss" className="text-ink/50 hover:text-ink" onClick={() => dismiss(t.id)}>✕</button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { en, type Key } from '../locales/en'
import { fr } from '../locales/fr'
import { it } from '../locales/it'

export type Lang = 'en' | 'fr' | 'it'
export const LANGS: { code: Lang; label: string }[] = [
  { code: 'fr', label: 'Français' },
  { code: 'it', label: 'Italiano' },
  { code: 'en', label: 'English' },
]

const DICTS: Record<Lang, Record<Key, string>> = { en, fr, it }
const LOCALES: Record<Lang, string> = { en: 'en-GB', fr: 'fr-FR', it: 'it-IT' }
const STORAGE = 'invoicing.lang'

function initialLang(): Lang {
  const saved = localStorage.getItem(STORAGE)
  if (saved === 'en' || saved === 'fr' || saved === 'it') return saved
  const nav = navigator.language.slice(0, 2)
  return nav === 'en' || nav === 'it' ? nav : 'fr'
}

type Vars = Record<string, string | number>
interface I18n {
  lang: Lang
  setLang(l: Lang): void
  locale: string
  t(key: Key, vars?: Vars): string
}
const Ctx = createContext<I18n | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang)

  const setLang = useCallback((l: Lang) => {
    localStorage.setItem(STORAGE, l)
    document.documentElement.lang = l
    setLangState(l)
  }, [])

  const value = useMemo<I18n>(
    () => ({
      lang,
      setLang,
      locale: LOCALES[lang],
      t: (key, vars) => {
        let s = DICTS[lang][key] ?? en[key]
        if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v))
        return s
      },
    }),
    [lang, setLang],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useI18n(): I18n {
  const c = useContext(Ctx)
  if (!c) throw new Error('useI18n must be used inside I18nProvider')
  return c
}
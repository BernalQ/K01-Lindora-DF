import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Language } from '../types/catalog'
import { translate, terminoLabel, type TranslationKey } from '../i18n/translations'

interface LanguageContextValue {
  language: Language
  setLanguage: (language: Language) => void
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
  terminoLabel: (termino: string) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>('es')

  useEffect(() => {
    // Actualiza el atributo lang del documento por accesibilidad.
    // No afecta la impresión de tickets (siempre en español).
    document.documentElement.lang = language
  }, [language])

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      t: (key, vars) => translate(language, key, vars),
      terminoLabel: (termino) => terminoLabel(termino, language),
    }),
    [language],
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (!ctx) {
    // Fallback seguro: si algún componente se renderiza fuera del provider,
    // no rompemos la app, simplemente usamos español por defecto.
    return {
      language: 'es',
      setLanguage: () => {},
      t: (key, vars) => translate('es', key, vars),
      terminoLabel: (termino) => terminoLabel(termino, 'es'),
    }
  }
  return ctx
}

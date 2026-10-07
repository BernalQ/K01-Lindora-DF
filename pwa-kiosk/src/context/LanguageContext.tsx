import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Language } from '../types/catalog'
import { translate, terminoLabel } from '../i18n/translations'
import { LanguageContext, type LanguageContextValue } from './languageContextBase'

/**
 * Este archivo exporta ÚNICAMENTE el componente `LanguageProvider` (ver
 * `useLanguage.ts` para el hook y `languageContextBase.ts` para la instancia
 * del contexto) — así cumple con la regla de oxlint
 * `react(only-export-components)`, necesaria para que React Fast Refresh
 * pueda actualizar este componente en caliente sin recargar toda la página.
 */
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

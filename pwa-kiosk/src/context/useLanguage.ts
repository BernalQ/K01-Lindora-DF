import { useContext } from 'react'
import { translate, terminoLabel } from '../i18n/translations'
import { LanguageContext, type LanguageContextValue } from './languageContextBase'

/**
 * Hook de conveniencia para leer/cambiar el idioma activo, separado de
 * `LanguageContext.tsx` (que ahora sólo exporta el componente
 * `LanguageProvider`) para que ese archivo cumpla con la regla de oxlint
 * `react(only-export-components)` (ver doc en `languageContextBase.ts`).
 */
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

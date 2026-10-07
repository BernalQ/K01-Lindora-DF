import { createContext } from 'react'
import type { Language } from '../types/catalog'
import type { TranslationKey } from '../i18n/translations'

/**
 * Instancia del contexto de idioma, separada de `LanguageContext.tsx` (el
 * `Provider`) y de `useLanguage.ts` (el hook) en su propio archivo sin JSX.
 *
 * Motivo: oxlint (regla `react(only-export-components)`) exige que un
 * archivo `.tsx` que exporta un componente no exporte además otras cosas
 * (hooks, instancias de contexto, etc.), para que React Fast Refresh pueda
 * actualizar ese componente en caliente sin recargar toda la página. Antes,
 * `LanguageContext.tsx` exportaba tanto `LanguageProvider` (componente) como
 * `useLanguage` (hook), lo cual disparaba esa advertencia. Al mover la
 * instancia del contexto aquí, `LanguageContext.tsx` queda con un único
 * export (el componente) y `useLanguage.ts` con el suyo (el hook) — ningún
 * comportamiento en runtime cambia, es puramente una reorganización de
 * archivos.
 */
export interface LanguageContextValue {
  language: Language
  setLanguage: (language: Language) => void
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
  terminoLabel: (termino: string) => string
}

export const LanguageContext = createContext<LanguageContextValue | null>(null)

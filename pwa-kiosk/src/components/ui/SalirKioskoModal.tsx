import { useEffect, useState } from 'react'
import { salirDeKiosko } from '../../services/systemBridge'
import { useLanguage } from '../../context/LanguageContext'

/** Misma clave numérica de 6 dígitos que protege `AdminScreen` (ver ese archivo). */
const PIN_VALIDO = '123456'
const LARGO_PIN = 6

interface SalirKioskoModalProps {
  onClose: () => void
}

type Estado = 'ingresando' | 'error' | 'saliendo' | 'fallo'

/**
 * Pop-up (no pantalla completa, a diferencia de `AdminScreen`) que pide la
 * misma clave numérica de 6 dígitos antes de cerrar el navegador en modo
 * kiosko. Al validarse, llama a `salirDeKiosko()` (`services/systemBridge.ts`),
 * que le pide al `print-bridge` local que mate el proceso del navegador —
 * eso mismo revela el escritorio de Windows detrás, sin ningún paso extra.
 */
export default function SalirKioskoModal({ onClose }: SalirKioskoModalProps) {
  const { t } = useLanguage()
  const [pin, setPin] = useState('')
  const [estado, setEstado] = useState<Estado>('ingresando')

  useEffect(() => {
    if (estado !== 'ingresando' || pin.length < LARGO_PIN) return

    if (pin !== PIN_VALIDO) {
      setEstado('error')
      const id = setTimeout(() => {
        setPin('')
        setEstado('ingresando')
      }, 900)
      return () => clearTimeout(id)
    }

    let cancelado = false
    setEstado('saliendo')
    salirDeKiosko().then((resultado) => {
      if (cancelado) return
      // Si tuvo éxito, el navegador debería cerrarse solo en los próximos
      // instantes (ver `system.ts` en print-bridge); no hace falta hacer
      // nada más aquí. Si falló (ej. print-bridge no disponible), se avisa.
      if (!resultado.ok) setEstado('fallo')
    })
    return () => {
      cancelado = true
    }
  }, [pin, estado])

  const digitar = (d: string) => {
    if (estado !== 'ingresando' || pin.length >= LARGO_PIN) return
    setPin((prev) => prev + d)
  }

  const borrar = () => {
    if (estado !== 'ingresando') return
    setPin((prev) => prev.slice(0, -1))
  }

  const reintentar = () => {
    setPin('')
    setEstado('ingresando')
  }

  const teclas = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫']

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div
        className="flex w-full max-w-sm flex-col items-center gap-6 rounded-3xl bg-gradient-to-b from-wood-950 via-wood-900 to-wood-950 px-6 py-8 text-cream-50 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-xl font-bold">{t('salirKiosko.titulo')}</h1>
          <p className="text-sm text-cream-200/70">{t('salirKiosko.subtitulo')}</p>
        </div>

        {estado === 'saliendo' && <p className="text-base font-semibold text-cream-50">{t('salirKiosko.saliendo')}</p>}

        {estado === 'fallo' && (
          <div className="flex flex-col items-center gap-3 text-center">
            <p className="text-sm font-semibold text-red-400">{t('salirKiosko.fallo')}</p>
            <button
              type="button"
              onClick={reintentar}
              className="rounded-full bg-white/10 px-5 py-2 text-sm font-semibold text-cream-50 transition-transform active:scale-95"
            >
              {t('salirKiosko.reintentar')}
            </button>
          </div>
        )}

        {(estado === 'ingresando' || estado === 'error') && (
          <>
            <div className="flex gap-3">
              {Array.from({ length: LARGO_PIN }).map((_, i) => (
                <span
                  key={i}
                  className={`h-4 w-4 rounded-full border-2 transition-colors ${
                    i < pin.length
                      ? estado === 'error'
                        ? 'border-red-400 bg-red-400'
                        : 'border-cream-50 bg-cream-50'
                      : 'border-cream-50/30 bg-transparent'
                  }`}
                />
              ))}
            </div>

            {estado === 'error' && <p className="text-sm font-semibold text-red-400">{t('salirKiosko.pinError')}</p>}

            <div className="grid grid-cols-3 gap-3">
              {teclas.map((tecla, i) =>
                tecla === '' ? (
                  <span key={i} />
                ) : (
                  <button
                    key={i}
                    type="button"
                    onClick={() => (tecla === '⌫' ? borrar() : digitar(tecla))}
                    aria-label={tecla === '⌫' ? t('admin.pinBorrar') : tecla}
                    className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-cream-50/20 bg-white/5 text-xl font-bold text-cream-50 transition-transform active:scale-90 sm:h-16 sm:w-16 sm:text-2xl"
                  >
                    {tecla}
                  </button>
                ),
              )}
            </div>
          </>
        )}

        <button
          type="button"
          onClick={onClose}
          className="text-sm font-semibold text-cream-50/50 underline underline-offset-4"
        >
          {t('salirKiosko.cancelar')}
        </button>
      </div>
    </div>
  )
}

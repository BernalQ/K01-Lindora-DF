import { useState } from 'react'
import { buscarCliente } from '../../services/facturacion'
import type { Cliente } from '../../types/factura'
import { useLanguage } from '../../context/LanguageContext'

interface CedulaScreenProps {
  onBack: () => void
  onEncontrado: (cliente: Cliente) => void
  onNoEncontrado: (cedula: string) => void
}

/**
 * Primer paso del flujo "Pago y Factura Electrónica": el cliente digita su
 * cédula. Se consulta primero el Excel local (vía print-bridge); si existe,
 * se pasa directo con los datos ya guardados; si no, se envía a registrar
 * sus datos (RegistroClienteScreen).
 */
export default function CedulaScreen({ onBack, onEncontrado, onNoEncontrado }: CedulaScreenProps) {
  const { t } = useLanguage()
  const [cedula, setCedula] = useState('')
  const [buscando, setBuscando] = useState(false)

  const puedeBuscar = cedula.trim().length > 0 && !buscando

  const handleBuscar = async () => {
    const valor = cedula.trim()
    if (!valor) return
    setBuscando(true)
    const cliente = await buscarCliente(valor)
    setBuscando(false)
    if (cliente) {
      onEncontrado(cliente)
    } else {
      onNoEncontrado(valor)
    }
  }

  return (
    <div className="flex h-full min-h-screen w-full flex-col bg-cream-50">
      <header className="flex items-center gap-4 bg-wood-950 px-6 py-4">
        <button
          type="button"
          onClick={onBack}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-wood-800 text-cream-50 transition-transform active:scale-90"
          aria-label={t('cedula.backToPayment')}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-xl font-semibold text-cream-50">{t('cedula.title')}</h1>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center">
        <p className="max-w-sm text-lg text-wood-600">{t('cedula.subtitle')}</p>

        <div className="w-full max-w-sm text-left">
          <label htmlFor="cedula" className="mb-2 block text-lg font-bold text-wood-900">
            {t('cedula.label')}
          </label>
          <input
            id="cedula"
            type="text"
            inputMode="numeric"
            autoFocus
            value={cedula}
            onChange={(e) => setCedula(e.target.value.replace(/[^0-9-]/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleBuscar()
            }}
            placeholder={t('cedula.placeholder')}
            className="w-full rounded-xl border-2 border-wood-200 bg-white px-4 py-4 text-2xl font-bold text-wood-900 outline-none focus:border-brand-red"
          />
        </div>

        <button
          type="button"
          onClick={handleBuscar}
          disabled={!puedeBuscar}
          className={`w-full max-w-sm rounded-2xl py-5 text-xl font-bold transition-transform ${
            puedeBuscar ? 'bg-brand-red text-white active:scale-98' : 'bg-wood-200 text-wood-500'
          }`}
        >
          {buscando ? t('cedula.buscando') : t('cedula.buscar')}
        </button>
      </main>
    </div>
  )
}

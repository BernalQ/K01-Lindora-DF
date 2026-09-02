import { useState } from 'react'
import { guardarCliente } from '../../services/facturacion'
import type { Cliente } from '../../types/factura'
import { useLanguage } from '../../context/LanguageContext'

interface RegistroClienteScreenProps {
  cedula: string
  onBack: () => void
  onGuardado: (cliente: Cliente) => void
}

/**
 * Segundo paso del flujo "Pago y Factura Electrónica" cuando la cédula no
 * existe todavía en el Excel local: se piden los datos mínimos y se guarda
 * como cliente nuevo (cédula = llave primaria) para la próxima visita.
 */
export default function RegistroClienteScreen({ cedula, onBack, onGuardado }: RegistroClienteScreenProps) {
  const { t } = useLanguage()
  const [nombre, setNombre] = useState('')
  const [correo, setCorreo] = useState('')
  const [telefono, setTelefono] = useState('')
  const [direccion, setDireccion] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [avisoSinConexion, setAvisoSinConexion] = useState(false)

  const puedeGuardar = nombre.trim().length > 0 && !guardando

  const handleGuardar = async () => {
    if (!puedeGuardar) return
    const cliente: Cliente = {
      cedula,
      nombre: nombre.trim(),
      correo: correo.trim(),
      telefono: telefono.trim(),
      direccion: direccion.trim(),
    }
    setGuardando(true)
    const resultado = await guardarCliente(cliente)
    setGuardando(false)
    if (!resultado.ok) setAvisoSinConexion(true)
    // Continuamos aunque el guardado local haya fallado: generarFactura()
    // vuelve a intentar guardar el cliente en el servidor al facturar.
    onGuardado(cliente)
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
        <h1 className="text-xl font-semibold text-cream-50">{t('registro.title')}</h1>
      </header>

      <main className="flex-1 overflow-y-auto p-6 pb-32">
        <p className="mb-6 text-wood-600">{t('registro.subtitle', { cedula })}</p>

        <div className="mx-auto flex max-w-md flex-col gap-4">
          <div>
            <label htmlFor="nombre" className="mb-1 block text-base font-bold text-wood-900">
              {t('registro.nombre')}
            </label>
            <input
              id="nombre"
              type="text"
              autoFocus
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="w-full rounded-xl border-2 border-wood-200 bg-white px-4 py-3 text-lg text-wood-900 outline-none focus:border-brand-red"
            />
          </div>

          <div>
            <label htmlFor="correo" className="mb-1 block text-base font-bold text-wood-900">
              {t('registro.correo')}
            </label>
            <input
              id="correo"
              type="email"
              inputMode="email"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              className="w-full rounded-xl border-2 border-wood-200 bg-white px-4 py-3 text-lg text-wood-900 outline-none focus:border-brand-red"
            />
          </div>

          <div>
            <label htmlFor="telefono" className="mb-1 block text-base font-bold text-wood-900">
              {t('registro.telefono')}
            </label>
            <input
              id="telefono"
              type="tel"
              inputMode="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              className="w-full rounded-xl border-2 border-wood-200 bg-white px-4 py-3 text-lg text-wood-900 outline-none focus:border-brand-red"
            />
          </div>

          <div>
            <label htmlFor="direccion" className="mb-1 block text-base font-bold text-wood-900">
              {t('registro.direccion')}
            </label>
            <input
              id="direccion"
              type="text"
              value={direccion}
              onChange={(e) => setDireccion(e.target.value)}
              className="w-full rounded-xl border-2 border-wood-200 bg-white px-4 py-3 text-lg text-wood-900 outline-none focus:border-brand-red"
            />
          </div>

          {avisoSinConexion && (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
              {t('registro.avisoSinConexion')}
            </p>
          )}
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 bg-wood-950 p-6">
        <button
          type="button"
          onClick={handleGuardar}
          disabled={!puedeGuardar}
          className={`mx-auto block w-full max-w-md rounded-2xl py-5 text-xl font-bold transition-transform ${
            puedeGuardar ? 'bg-brand-red text-white active:scale-98' : 'bg-wood-800 text-wood-500'
          }`}
        >
          {guardando ? t('registro.guardando') : t('registro.guardar')}
        </button>
      </div>
    </div>
  )
}

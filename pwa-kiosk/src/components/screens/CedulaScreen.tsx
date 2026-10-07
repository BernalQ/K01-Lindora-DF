import { useState } from 'react'
import { buscarCliente } from '../../services/facturacion'
import { buscarClienteCodisa, completarTipoPersonaPorCedula } from '../../services/wsdf'
import CedulaErrorPopup, { type ErrorCedula } from '../ui/CedulaErrorPopup'
import type { Cliente } from '../../types/factura'
import { useLanguage } from '../../context/useLanguage'

interface CedulaScreenProps {
  onBack: () => void
  onEncontrado: (cliente: Cliente) => void
  onNoEncontrado: (cedula: string) => void
}

/**
 * Primer paso del flujo "Pago y Factura Electrónica": el cliente digita su
 * cédula. Se consulta primero a Codisa (`buscarClienteCodisa`, API real de
 * factura electrónica — ver `services/wsdf.ts`), que valida el formato de
 * la cédula antes de mandar nada por red y es la fuente de verdad para
 * autocompletar nombre/cédula/dirección/correo/teléfono; si Codisa no la
 * tiene (pero sí respondió), se consulta como respaldo el Excel local (vía
 * print-bridge, clientes guardados en visitas anteriores aunque no estén
 * en Codisa); si ninguna de las dos la encuentra, se envía a registrar sus
 * datos manualmente (`RegistroClienteScreen`). Un formato de cédula
 * inválido o un error de conexión con Codisa se muestran en un pop-up
 * (`CedulaErrorPopup`), sin avanzar el flujo.
 */
export default function CedulaScreen({ onBack, onEncontrado, onNoEncontrado }: CedulaScreenProps) {
  const { t } = useLanguage()
  const [cedula, setCedula] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [errorCedula, setErrorCedula] = useState<ErrorCedula | null>(null)

  const puedeBuscar = cedula.trim().length > 0 && !buscando

  const handleBuscar = async () => {
    const valor = cedula.trim()
    if (!valor) return
    setErrorCedula(null)
    setBuscando(true)
    const resultadoCodisa = await buscarClienteCodisa(valor)

    if (resultadoCodisa.categoria === 'encontrado') {
      setBuscando(false)
      onEncontrado(resultadoCodisa.cliente)
      return
    }

    if (resultadoCodisa.categoria === 'invalida') {
      setBuscando(false)
      // La cédula no calza con ningún formato conocido (ver
      // `clasificarCedula` en `services/wsdf.ts`), pero ya no es un
      // callejón sin salida (ver hallazgo de auditoría): se ofrece
      // continuar directo al registro manual sin tener que cerrar el
      // pop-up y adivinar qué hacer.
      setErrorCedula({
        categoria: 'invalida',
        mensaje: resultadoCodisa.mensaje,
        permiteReintentar: false,
        permiteRegistroManual: true,
      })
      return
    }

    if (resultadoCodisa.categoria === 'error-conexion') {
      setBuscando(false)
      setErrorCedula({ categoria: 'error-conexion', mensaje: resultadoCodisa.mensaje, permiteReintentar: true })
      return
    }

    // 'error-api': Codisa sí respondió pero reportó un error real de su lado
    // (coderror distinto de "0") — distinto de 'no-encontrado' (búsqueda
    // exitosa, cliente no existe). Se muestra en el mismo pop-up visual que
    // 'error-conexion' (ámbar, reintentable — ver `CedulaErrorPopup`), pero
    // con el mensaje específico que ya trae `resultadoCodisa`, para que el
    // operador sepa que fue un error de Codisa y no simplemente "no
    // encontrado" (no debe caer silenciosamente al registro manual).
    if (resultadoCodisa.categoria === 'error-api') {
      setBuscando(false)
      setErrorCedula({ categoria: 'error-conexion', mensaje: resultadoCodisa.mensaje, permiteReintentar: true })
      return
    }

    // 'no-encontrado' en Codisa: respaldo con el Excel local antes de pedir registro manual.
    const cliente = await buscarCliente(valor)
    setBuscando(false)
    if (cliente) {
      // El registro del Excel es anterior a la distinción tipoPersona/
      // tipoIdentificacion (sólo Codisa la trae directamente) — se completa
      // aquí a partir de la cédula para que `construirPedidoWsDf` no asuma
      // por defecto "física" en un cliente que en realidad es jurídico o
      // extranjero (ver hallazgo de auditoría).
      onEncontrado(completarTipoPersonaPorCedula(cliente))
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

      {errorCedula && (
        <CedulaErrorPopup
          error={errorCedula}
          onReintentar={() => {
            setErrorCedula(null)
            handleBuscar()
          }}
          onCerrar={() => setErrorCedula(null)}
          onRegistroManual={() => {
            setErrorCedula(null)
            onNoEncontrado(cedula.trim())
          }}
        />
      )}
    </div>
  )
}

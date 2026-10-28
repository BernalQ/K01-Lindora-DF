import { useState } from 'react'
import { buscarCliente } from '../../services/facturacion'
import { buscarClienteCodisa, completarTipoPersonaPorCedula } from '../../services/wsdf'
import CedulaErrorPopup, { type ErrorCedula } from '../ui/CedulaErrorPopup'
import VirtualKeyboard from '../ui/VirtualKeyboard'
import type { Cliente } from '../../types/factura'
import { useLanguage } from '../../context/useLanguage'

interface CedulaScreenProps {
  onBack: () => void
  onEncontrado: (cliente: Cliente) => void
  onNoEncontrado: (cedula: string) => void
}

/**
 * Tipo de identificación elegido en el dropdown nuevo — puramente visual:
 * sólo cambia el placeholder de ejemplo mostrado en el campo (ver
 * `placeholderCedula` abajo). Deliberadamente NO se manda a
 * `buscarClienteCodisa` ni altera su lógica de clasificación: esa sigue
 * siendo por longitud de cédula (`clasificarCedula` en `services/wsdf.ts`),
 * que ya es inequívoca para las longitudes reales usadas en Costa Rica (9 =
 * física, 10 = jurídica, 11-12 = DIMEX/NITE/extranjero) y es la única fuente
 * de verdad — este selector es sólo una ayuda visual para el cliente, igual
 * como se pidió ("al cambiar el tipo de identificación, debe mantenerse el
 * mismo flujo actual de consulta a Codisa").
 */
type TipoIdentificacion = 'fisica' | 'juridica'

/**
 * Estado visual de la consulta — reemplaza las transiciones instantáneas y
 * silenciosas que tenía antes esta pantalla (ver hallazgo de auditoría:
 * "cliente encontrado" navegaba sin avisar, y "no encontrado" mandaba
 * directo a registro manual sin mostrar nada en pantalla ni dar opción de
 * reintentar con otra cédula).
 */
type EstadoConsulta = 'idle' | 'consultando' | 'encontrado' | 'no-encontrado'

/** Cuánto se muestra el mensaje "Cliente encontrado" antes de avanzar a la siguiente pantalla — breve pero perceptible, no un simple parpadeo. */
const DURACION_MENSAJE_ENCONTRADO_MS = 700

/**
 * Primer paso del flujo "Pago y Factura Electrónica": el cliente digita su
 * cédula. Se consulta primero a Codisa (`buscarClienteCodisa`, API real de
 * factura electrónica — ver `services/wsdf.ts`), que valida el formato de
 * la cédula antes de mandar nada por red y es la fuente de verdad para
 * autocompletar nombre/cédula/dirección/correo/teléfono; si Codisa no la
 * tiene (pero sí respondió), se consulta como respaldo el Excel local (vía
 * print-bridge, clientes guardados en visitas anteriores aunque no estén
 * en Codisa); si ninguna de las dos la encuentra, se muestra un mensaje en
 * pantalla con un botón explícito "Digitar datos manualmente" (antes
 * mandaba directo a `RegistroClienteScreen` sin avisar — ver hallazgo de
 * auditoría). Un formato de cédula inválido o un error de conexión/API con
 * Codisa se muestran en un pop-up (`CedulaErrorPopup`), que ahora también
 * ofrece "Continuar con registro manual" en los tres casos (antes sólo en
 * cédula inválida).
 */
export default function CedulaScreen({ onBack, onEncontrado, onNoEncontrado }: CedulaScreenProps) {
  const { t } = useLanguage()
  const [tipoId, setTipoId] = useState<TipoIdentificacion>('fisica')
  const [cedula, setCedula] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [estadoConsulta, setEstadoConsulta] = useState<EstadoConsulta>('idle')
  const [errorCedula, setErrorCedula] = useState<ErrorCedula | null>(null)
  // Controla el teclado táctil propio (ver `VirtualKeyboard`) en vez de
  // depender de que el teclado del sistema operativo del kiosko se
  // despliegue solo — el input de cédula es `readOnly` (ver abajo), así que
  // esto es la única forma de escribir en él.
  const [tecladoAbierto, setTecladoAbierto] = useState(false)

  const puedeBuscar = cedula.trim().length > 0 && !buscando

  /**
   * Único punto de escritura del campo cédula (desde `VirtualKeyboard`):
   * filtra cualquier caracter no numérico — el teclado propio ya no tiene
   * guion (ver `VirtualKeyboard`), pero esto cubre también cualquier otra
   * vía de entrada — y limpia un mensaje de "no encontrado"/resultado
   * previo en cuanto el usuario vuelve a escribir, para que no quede
   * pegado un estado viejo mientras corrige o intenta con otra cédula.
   */
  const handleCedulaChange = (valor: string) => {
    const soloDigitos = valor.replace(/\D/g, '')
    setCedula(soloDigitos)
    setEstadoConsulta((estadoPrevio) => (estadoPrevio === 'consultando' ? estadoPrevio : 'idle'))
  }

  const handleBuscar = async () => {
    const valor = cedula.trim()
    if (!valor) return
    setErrorCedula(null)
    setBuscando(true)
    setEstadoConsulta('consultando')
    const resultadoCodisa = await buscarClienteCodisa(valor)

    if (resultadoCodisa.categoria === 'encontrado') {
      setEstadoConsulta('encontrado')
      setTimeout(() => {
        setBuscando(false)
        onEncontrado(resultadoCodisa.cliente)
      }, DURACION_MENSAJE_ENCONTRADO_MS)
      return
    }

    if (resultadoCodisa.categoria === 'invalida') {
      setBuscando(false)
      setEstadoConsulta('idle')
      // La cédula no calza con ningún formato conocido (ver
      // `clasificarCedula` en `services/wsdf.ts`), pero no es un callejón
      // sin salida: se ofrece continuar directo al registro manual sin
      // tener que cerrar el pop-up y adivinar qué hacer.
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
      setEstadoConsulta('idle')
      // Antes no ofrecía registro manual aquí (ver hallazgo de auditoría) —
      // un error de comunicación con Codisa tampoco debe dejar al operador
      // sin ninguna salida distinta de "Intentar de nuevo".
      setErrorCedula({
        categoria: 'error-conexion',
        mensaje: resultadoCodisa.mensaje,
        permiteReintentar: true,
        permiteRegistroManual: true,
      })
      return
    }

    // 'error-api': Codisa sí respondió pero reportó un error real de su lado
    // (coderror distinto de "0") — distinto de 'no-encontrado' (búsqueda
    // exitosa, cliente no existe). Se muestra en el mismo pop-up visual que
    // 'error-conexion' (ámbar, reintentable — ver `CedulaErrorPopup`), pero
    // con el mensaje específico que ya trae `resultadoCodisa`, y también
    // ofrece registro manual, igual que los otros dos casos de error.
    if (resultadoCodisa.categoria === 'error-api') {
      setBuscando(false)
      setEstadoConsulta('idle')
      setErrorCedula({
        categoria: 'error-conexion',
        mensaje: resultadoCodisa.mensaje,
        permiteReintentar: true,
        permiteRegistroManual: true,
      })
      return
    }

    // 'no-encontrado' en Codisa: respaldo con el Excel local antes de
    // mostrar el mensaje final de "no encontrado" en pantalla.
    const cliente = await buscarCliente(valor)
    if (cliente) {
      // El registro del Excel es anterior a la distinción tipoPersona/
      // tipoIdentificacion (sólo Codisa la trae directamente) — se completa
      // aquí a partir de la cédula para que `construirPedidoWsDf` no asuma
      // por defecto "física" en un cliente que en realidad es jurídico o
      // extranjero (ver hallazgo de auditoría).
      setEstadoConsulta('encontrado')
      setTimeout(() => {
        setBuscando(false)
        onEncontrado(completarTipoPersonaPorCedula(cliente))
      }, DURACION_MENSAJE_ENCONTRADO_MS)
      return
    }

    setBuscando(false)
    setEstadoConsulta('no-encontrado')
  }

  const placeholderCedula = tipoId === 'fisica' ? t('cedula.placeholderFisica') : t('cedula.placeholderJuridica')

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

      <main className={`flex flex-1 flex-col items-center justify-center gap-5 p-6 text-center ${tecladoAbierto ? 'pb-80' : ''}`}>
        <p className="max-w-sm text-lg text-wood-600">{t('cedula.subtitle')}</p>

        <div className="w-full max-w-sm text-left">
          <label htmlFor="tipoId" className="mb-2 block text-base font-bold text-wood-900">
            {t('cedula.tipoIdLabel')}
          </label>
          <select
            id="tipoId"
            value={tipoId}
            onChange={(e) => setTipoId(e.target.value as TipoIdentificacion)}
            className="w-full rounded-xl border-2 border-wood-200 bg-white px-4 py-3 text-lg font-semibold text-wood-900 outline-none focus:border-brand-red"
          >
            <option value="fisica">{t('cedula.tipoIdFisica')}</option>
            <option value="juridica">{t('cedula.tipoIdJuridica')}</option>
          </select>
        </div>

        <div className="w-full max-w-sm text-left">
          <label htmlFor="cedula" className="mb-2 block text-lg font-bold text-wood-900">
            {t('cedula.label')}
          </label>
          {/*
            `readOnly` a propósito (ver comentario en `VirtualKeyboard`): evita
            que el teclado táctil del sistema operativo del kiosko aparezca y
            compita con el teclado propio de abajo — toda la escritura pasa
            por `onChange` del `VirtualKeyboard`, nunca por tipeo directo en
            este input. Sigue recibiendo foco (`onFocus`) para abrirlo.
          */}
          <input
            id="cedula"
            type="text"
            inputMode="none"
            readOnly
            autoFocus
            value={cedula}
            onFocus={() => setTecladoAbierto(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleBuscar()
            }}
            placeholder={placeholderCedula}
            className="w-full rounded-xl border-2 border-wood-200 bg-white px-4 py-4 text-2xl font-bold text-wood-900 outline-none focus:border-brand-red"
          />
          <p className="mt-2 text-sm text-wood-500">{t('cedula.ayuda')}</p>
        </div>

        {estadoConsulta === 'consultando' && (
          <p className="text-base font-semibold text-wood-600">{t('cedula.consultando')}</p>
        )}

        {estadoConsulta === 'encontrado' && (
          <p className="flex items-center gap-2 text-base font-bold text-green-700">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-sm">✓</span>
            {t('cedula.clienteEncontrado')}
          </p>
        )}

        {estadoConsulta === 'no-encontrado' ? (
          <div className="flex w-full max-w-sm flex-col items-center gap-3">
            <p className="text-base font-semibold text-wood-700">{t('cedula.clienteNoEncontrado')}</p>
            <button
              type="button"
              onClick={() => onNoEncontrado(cedula.trim())}
              className="w-full rounded-2xl bg-brand-red py-5 text-xl font-bold text-white shadow-md shadow-brand-red/30 transition-all duration-100 active:scale-98 active:shadow-sm"
            >
              {t('cedula.digitarManualmente')}
            </button>
            <button
              type="button"
              onClick={() => {
                setCedula('')
                setEstadoConsulta('idle')
              }}
              className="w-full rounded-2xl bg-wood-100 py-3 text-base font-bold text-wood-800 transition-all duration-100 active:scale-98"
            >
              {t('cedula.buscarOtra')}
            </button>
          </div>
        ) : (
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
        )}
      </main>

      {tecladoAbierto && (
        <VirtualKeyboard
          layout="numeric"
          value={cedula}
          onChange={handleCedulaChange}
          onEnter={handleBuscar}
          onClose={() => setTecladoAbierto(false)}
        />
      )}

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

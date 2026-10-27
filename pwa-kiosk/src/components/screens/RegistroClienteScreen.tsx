import { useState } from 'react'
import { guardarCliente } from '../../services/facturacion'
import { completarTipoPersonaPorCedula } from '../../services/wsdf'
import type { Cliente } from '../../types/factura'
import { useLanguage } from '../../context/useLanguage'
import VirtualKeyboard, { type VirtualKeyboardLayout } from '../ui/VirtualKeyboard'

/** Un solo campo activo a la vez (el formulario es secuencial), así que un único `VirtualKeyboard` compartido alcanza — se reconecta a `value`/`onChange` del campo que tenga foco. */
type CampoActivo = 'nombre' | 'correo' | 'telefono' | 'direccion' | null

interface RegistroClienteScreenProps {
  cedula: string
  onBack: () => void
  onGuardado: (cliente: Cliente) => void
}

/**
 * Formato mínimo aceptable de correo electrónico (no pretende cubrir el
 * 100% del RFC 5322, sólo atrapar errores obvios de tipeo —
 * "algo@algo.algo"). Ambos campos (correo/teléfono) son opcionales: un
 * campo vacío siempre se considera válido, sólo se valida el formato cuando
 * el cliente escribió algo (ver `correoValido`/`telefonoValido` abajo).
 */
const CORREO_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** Acepta dígitos, espacios, "+" y "-", entre 8 y 15 caracteres — suficiente para números locales (ej. "8888-8888") o con código de país (ej. "+506 8888 8888"). */
const TELEFONO_REGEX = /^[0-9+\-\s]{8,15}$/

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
  // Igual que en `CedulaScreen`: controla el teclado táctil propio en vez de
  // depender del teclado del sistema operativo del kiosko. Los 4 inputs son
  // `readOnly` (ver abajo), así que esto es la única forma de escribir.
  const [campoActivo, setCampoActivo] = useState<CampoActivo>(null)

  const CONFIG_CAMPO: Record<
    Exclude<CampoActivo, null>,
    { layout: VirtualKeyboardLayout; valor: string; setValor: (v: string) => void; maxLength?: number }
  > = {
    nombre: { layout: 'text', valor: nombre, setValor: setNombre },
    correo: { layout: 'email', valor: correo, setValor: setCorreo },
    telefono: { layout: 'phone', valor: telefono, setValor: setTelefono, maxLength: 15 },
    direccion: { layout: 'text', valor: direccion, setValor: setDireccion },
  }

  // Campos opcionales: vacío siempre es válido, sólo se exige el formato
  // correcto cuando el operador/cliente escribió algo (ver hallazgo de
  // auditoría — antes no se validaba el formato de correo/teléfono).
  const correoValido = correo.trim().length === 0 || CORREO_REGEX.test(correo.trim())
  const telefonoValido = telefono.trim().length === 0 || TELEFONO_REGEX.test(telefono.trim())

  const puedeGuardar = nombre.trim().length > 0 && correoValido && telefonoValido && !guardando

  const handleGuardar = async () => {
    if (!puedeGuardar) return
    // `completarTipoPersonaPorCedula` deriva tipoPersona/tipoIdentificacion
    // de la longitud de la cédula (ver services/wsdf.ts) — este registro
    // manual no pide ese dato explícitamente, así que sin esto el pedido
    // WsDf asumiría por defecto "física nacional" aunque la cédula tecleada
    // sea en realidad jurídica o de extranjero (ver hallazgo de auditoría).
    const cliente: Cliente = completarTipoPersonaPorCedula({
      cedula,
      nombre: nombre.trim(),
      correo: correo.trim(),
      telefono: telefono.trim(),
      direccion: direccion.trim(),
    })
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

      <main className={`flex-1 overflow-y-auto p-6 ${campoActivo ? 'pb-96' : 'pb-32'}`}>
        <p className="mb-6 text-wood-600">{t('registro.subtitle', { cedula })}</p>

        {/*
          Los 4 inputs son `readOnly` a propósito (ver comentario en
          `VirtualKeyboard`): evita que el teclado táctil del sistema
          operativo del kiosko aparezca y compita con el teclado propio de
          abajo. `onFocus` marca cuál campo queda "activo" para reconectarle
          el `VirtualKeyboard` compartido (ver `CONFIG_CAMPO`).
        */}
        <div className="mx-auto flex max-w-md flex-col gap-4">
          <div>
            <label htmlFor="nombre" className="mb-1 block text-base font-bold text-wood-900">
              {t('registro.nombre')}
            </label>
            <input
              id="nombre"
              type="text"
              inputMode="none"
              readOnly
              autoFocus
              value={nombre}
              onFocus={() => setCampoActivo('nombre')}
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
              inputMode="none"
              readOnly
              value={correo}
              onFocus={() => setCampoActivo('correo')}
              className={`w-full rounded-xl border-2 bg-white px-4 py-3 text-lg text-wood-900 outline-none focus:border-brand-red ${
                correoValido ? 'border-wood-200' : 'border-amber-400'
              }`}
            />
            {!correoValido && <p className="mt-1 text-sm text-amber-600">{t('registro.correoInvalido')}</p>}
          </div>

          <div>
            <label htmlFor="telefono" className="mb-1 block text-base font-bold text-wood-900">
              {t('registro.telefono')}
            </label>
            <input
              id="telefono"
              type="tel"
              inputMode="none"
              readOnly
              value={telefono}
              onFocus={() => setCampoActivo('telefono')}
              className={`w-full rounded-xl border-2 bg-white px-4 py-3 text-lg text-wood-900 outline-none focus:border-brand-red ${
                telefonoValido ? 'border-wood-200' : 'border-amber-400'
              }`}
            />
            {!telefonoValido && <p className="mt-1 text-sm text-amber-600">{t('registro.telefonoInvalido')}</p>}
          </div>

          <div>
            <label htmlFor="direccion" className="mb-1 block text-base font-bold text-wood-900">
              {t('registro.direccion')}
            </label>
            <input
              id="direccion"
              type="text"
              inputMode="none"
              readOnly
              value={direccion}
              onFocus={() => setCampoActivo('direccion')}
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

      {/*
        El teclado y la barra fija de "Guardar" ocupan el mismo espacio
        (`fixed inset-x-0 bottom-0`) — se muestran de forma excluyente: con
        el teclado abierto, "Listo" (ver `VirtualKeyboard`) sólo lo cierra
        (no hay `onEnter` acá, porque guardar requiere los 3 campos, no uno
        solo); al cerrarlo vuelve a aparecer la barra de "Guardar" de abajo.
      */}
      {campoActivo ? (
        <VirtualKeyboard
          layout={CONFIG_CAMPO[campoActivo].layout}
          value={CONFIG_CAMPO[campoActivo].valor}
          onChange={CONFIG_CAMPO[campoActivo].setValor}
          maxLength={CONFIG_CAMPO[campoActivo].maxLength}
          onClose={() => setCampoActivo(null)}
        />
      ) : (
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
      )}
    </div>
  )
}

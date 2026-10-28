import { useState } from 'react'
import { guardarCliente } from '../../services/facturacion'
import { clasificarCedula, limpiarCedula } from '../../services/wsdf'
import type { Cliente } from '../../types/factura'
import { useLanguage } from '../../context/useLanguage'
import VirtualKeyboard, { type VirtualKeyboardLayout } from '../ui/VirtualKeyboard'

/** Un solo campo activo a la vez (el formulario es secuencial), así que un único `VirtualKeyboard` compartido alcanza — se reconecta a `value`/`onChange` del campo que tenga foco. */
type CampoActivo = 'nombre' | 'correo' | 'telefono' | 'direccion'

/** Orden de avance al presionar "Listo" en el teclado (ver `avanzarCampo` abajo) — mismo orden visual en que aparecen los campos en la columna izquierda. */
const ORDEN_CAMPOS: CampoActivo[] = ['nombre', 'correo', 'telefono', 'direccion']

/** Mismas dos opciones que el dropdown de `CedulaScreen` (ver su doc ahí) — aquí SÍ determina el `tipoPersona`/`tipoIdentificacion` real que se guarda (ver `handleGuardar`), porque este formulario es la única fuente de esos datos cuando Codisa no reconoce al cliente. */
type TipoIdentificacion = 'fisica' | 'juridica'

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
  //
  // A diferencia de `CedulaScreen` (un solo campo), aquí el teclado vive
  // siempre visible en una columna fija a la derecha (ver JSX más abajo, prop
  // `variante="panel"` de `VirtualKeyboard`) — por eso nunca es `null`:
  // arranca en 'nombre' (coincide con el `autoFocus` del primer input) y se
  // reconecta al campo que tenga foco, pero el panel del teclado en sí nunca
  // se oculta.
  const [campoActivo, setCampoActivo] = useState<CampoActivo>('nombre')

  // Clasificación automática por longitud de la cédula (ver `clasificarCedula`
  // en services/wsdf.ts) — sólo para proponer un valor inicial razonable al
  // dropdown de abajo; el operador puede corregirlo si hace falta (ej. una
  // cédula jurídica de 10 dígitos digitada con un espacio/guion de más que
  // la hiciera clasificar distinto). Se calcula una sola vez porque `cedula`
  // no cambia durante la vida de esta pantalla.
  const [formatoAutoDetectado] = useState(() => clasificarCedula(limpiarCedula(cedula)))
  const [tipoId, setTipoId] = useState<TipoIdentificacion>(formatoAutoDetectado?.tipoPersona === 'J' ? 'juridica' : 'fisica')

  const CONFIG_CAMPO: Record<
    CampoActivo,
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

  /**
   * "Listo" del teclado: como el panel ya no se oculta (ver `campoActivo`
   * arriba), se reutiliza para avanzar al siguiente campo del formulario
   * (cíclico: después de "dirección" vuelve a "nombre") en vez de cerrar
   * nada — mantiene al operador moviéndose hacia adelante sin tener que
   * tocar manualmente cada input.
   */
  const avanzarCampo = () => {
    const siguiente = ORDEN_CAMPOS[(ORDEN_CAMPOS.indexOf(campoActivo) + 1) % ORDEN_CAMPOS.length]
    setCampoActivo(siguiente)
  }

  const handleGuardar = async () => {
    if (!puedeGuardar) return
    // `tipoPersona`/`tipoIdentificacion` ya NO se derivan a ciegas de la
    // longitud de la cédula (antes vía `completarTipoPersonaPorCedula`):
    // ahora el dropdown de arriba es la fuente real, porque este registro
    // manual es la única oportunidad de capturar ese dato cuando Codisa no
    // reconoce al cliente (ver hallazgo de auditoría sobre `fe`/`ORA-02291`).
    // Excepción: si la cédula clasificó como DIMEX/NITE/pasaporte
    // (`tipoIdentificacion: '3'`) y el operador deja "Física" seleccionado
    // (su valor por defecto para ese caso), se conserva el '3' en vez de
    // forzarlo a '1' — sólo se pierde si el operador cambia explícitamente
    // a "Jurídica".
    const tipoPersona: 'F' | 'J' = tipoId === 'juridica' ? 'J' : 'F'
    const tipoIdentificacion =
      tipoId === 'juridica' ? '2' : formatoAutoDetectado?.tipoIdentificacion === '3' ? '3' : '1'
    const cliente: Cliente = {
      cedula,
      nombre: nombre.trim(),
      correo: correo.trim(),
      telefono: telefono.trim(),
      direccion: direccion.trim(),
      tipoPersona,
      tipoIdentificacion,
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

      {/*
        Layout de dos columnas (antes: campos arriba, teclado tapando toda la
        parte baja al enfocar uno): a la izquierda los 4 campos en una sola
        columna, a la derecha el teclado táctil SIEMPRE visible (`variante="panel"`
        de `VirtualKeyboard`, ver su doc) — así el operador ve el campo
        actualizarse en tiempo real a la izquierda mientras escribe, sin que
        el teclado le tape nada. En pantallas angostas (`lg` hacia abajo) cae
        a una sola columna apilada (teclado debajo de los campos) para no
        romper en kioskos sin suficiente ancho.
      */}
      <main className="flex-1 overflow-y-auto p-6 pb-32">
        <p className="mb-6 text-wood-600">{t('registro.subtitle', { cedula })}</p>

        <div className="mx-auto flex max-w-5xl flex-col gap-8 lg:flex-row lg:items-start">
          {/*
            Los 4 inputs son `readOnly` a propósito (ver comentario en
            `VirtualKeyboard`): evita que el teclado táctil del sistema
            operativo del kiosko aparezca y compita con el teclado propio de
            la derecha. `onFocus` marca cuál campo queda "activo" para
            reconectarle el `VirtualKeyboard` compartido (ver `CONFIG_CAMPO`).
          */}
          <div className="flex w-full flex-col gap-4 lg:max-w-xs">
            {/* Tipo de identificación: mismas dos opciones/estilo que el dropdown de `CedulaScreen`, pero aquí sí determina `tipoPersona`/`tipoIdentificacion` reales (ver `handleGuardar`) — necesario porque este formulario es la única fuente de ese dato cuando Codisa no reconoce al cliente. */}
            <div>
              <label htmlFor="tipoId" className="mb-1 block text-base font-bold text-wood-900">
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
                className={`w-full rounded-xl border-2 bg-white px-4 py-3 text-lg text-wood-900 outline-none focus:border-brand-red ${
                  campoActivo === 'nombre' ? 'border-brand-red' : 'border-wood-200'
                }`}
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
                  !correoValido ? 'border-amber-400' : campoActivo === 'correo' ? 'border-brand-red' : 'border-wood-200'
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
                  !telefonoValido ? 'border-amber-400' : campoActivo === 'telefono' ? 'border-brand-red' : 'border-wood-200'
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
                className={`w-full rounded-xl border-2 bg-white px-4 py-3 text-lg text-wood-900 outline-none focus:border-brand-red ${
                  campoActivo === 'direccion' ? 'border-brand-red' : 'border-wood-200'
                }`}
              />
            </div>

            {avisoSinConexion && (
              <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
                {t('registro.avisoSinConexion')}
              </p>
            )}
          </div>

          {/* Columna derecha: teclado táctil siempre visible, reconectado al campo activo de la izquierda. */}
          <div className="flex w-full justify-center lg:flex-1">
            <VirtualKeyboard
              variante="panel"
              layout={CONFIG_CAMPO[campoActivo].layout}
              value={CONFIG_CAMPO[campoActivo].valor}
              onChange={CONFIG_CAMPO[campoActivo].setValor}
              maxLength={CONFIG_CAMPO[campoActivo].maxLength}
              onClose={avanzarCampo}
            />
          </div>
        </div>
      </main>

      {/*
        Antes compartía espacio con el teclado (`fixed inset-x-0 bottom-0`,
        mostrado de forma excluyente). Ahora el teclado vive en su propia
        columna (ver arriba) y ya nunca se oculta, así que esta barra queda
        siempre visible también, sin ninguna condición.
      */}
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

import { useState } from 'react'
import { guardarCliente } from '../../services/facturacion'
import { completarTipoPersonaPorCedula } from '../../services/wsdf'
import type { Cliente } from '../../types/factura'
import { useLanguage } from '../../context/useLanguage'

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
  // En modo DEV (ver `App.tsx` -> `handleSolicitarFactura`) se llega a esta
  // pantalla sin pasar por `CedulaScreen`, así que `cedula` viene vacía ("")
  // en vez de pre-llenada — se habilita un campo editable sólo para ese
  // caso (producción nunca activa este bloque: `import.meta.env.DEV` se
  // elimina en el build real). Fuera de DEV, `cedula` sigue siendo de sólo
  // lectura (ya viene validada por `CedulaScreen`).
  const cedulaEditable = import.meta.env.DEV
  const [cedulaManual, setCedulaManual] = useState(cedula)
  const [nombre, setNombre] = useState('')
  const [correo, setCorreo] = useState('')
  const [telefono, setTelefono] = useState('')
  const [direccion, setDireccion] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [avisoSinConexion, setAvisoSinConexion] = useState(false)

  const cedulaFinal = cedulaEditable ? cedulaManual.trim() : cedula

  // Campos opcionales: vacío siempre es válido, sólo se exige el formato
  // correcto cuando el operador/cliente escribió algo (ver hallazgo de
  // auditoría — antes no se validaba el formato de correo/teléfono).
  const correoValido = correo.trim().length === 0 || CORREO_REGEX.test(correo.trim())
  const telefonoValido = telefono.trim().length === 0 || TELEFONO_REGEX.test(telefono.trim())

  const puedeGuardar =
    nombre.trim().length > 0 && cedulaFinal.length > 0 && correoValido && telefonoValido && !guardando

  const handleGuardar = async () => {
    if (!puedeGuardar) return
    // `completarTipoPersonaPorCedula` deriva tipoPersona/tipoIdentificacion
    // de la longitud de la cédula (ver services/wsdf.ts) — este registro
    // manual no pide ese dato explícitamente, así que sin esto el pedido
    // WsDf asumiría por defecto "física nacional" aunque la cédula tecleada
    // sea en realidad jurídica o de extranjero (ver hallazgo de auditoría).
    const cliente: Cliente = completarTipoPersonaPorCedula({
      cedula: cedulaFinal,
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

      <main className="flex-1 overflow-y-auto p-6 pb-32">
        {!cedulaEditable && <p className="mb-6 text-wood-600">{t('registro.subtitle', { cedula })}</p>}

        <div className="mx-auto flex max-w-md flex-col gap-4">
          {cedulaEditable && (
            <div>
              <label htmlFor="cedula" className="mb-1 block text-base font-bold text-wood-900">
                {t('registro.cedula')}
              </label>
              <input
                id="cedula"
                type="text"
                inputMode="numeric"
                autoFocus
                value={cedulaManual}
                onChange={(e) => setCedulaManual(e.target.value)}
                className="w-full rounded-xl border-2 border-wood-200 bg-white px-4 py-3 text-lg text-wood-900 outline-none focus:border-brand-red"
              />
            </div>
          )}

          <div>
            <label htmlFor="nombre" className="mb-1 block text-base font-bold text-wood-900">
              {t('registro.nombre')}
            </label>
            <input
              id="nombre"
              type="text"
              autoFocus={!cedulaEditable}
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
              inputMode="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
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

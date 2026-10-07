import { useLanguage } from '../../context/useLanguage'
import type { TranslationKey } from '../../i18n/translations'

export type CategoriaErrorCedula = 'invalida' | 'error-conexion'

export interface ErrorCedula {
  categoria: CategoriaErrorCedula
  mensaje: string
  /** 'invalida' nunca se reintenta tal cual (el usuario debe corregir la cédula primero); 'error-conexion' sí. */
  permiteReintentar: boolean
  /**
   * `true` cuando, a pesar del error, tiene sentido ofrecer continuar al
   * registro manual (`RegistroClienteScreen`) en vez de dejar al operador
   * sin ninguna salida — hoy sólo aplica a `categoria: 'invalida'` cuando la
   * longitud de la cédula no calza con ningún formato conocido (ver
   * `clasificarCedula` en `services/wsdf.ts`): antes este caso era un
   * callejón sin salida (ver hallazgo de auditoría).
   */
  permiteRegistroManual?: boolean
}

interface CedulaErrorPopupProps {
  error: ErrorCedula
  /** Sólo se llama si `error.permiteReintentar` (el botón no se renderiza si no aplica). */
  onReintentar: () => void
  onCerrar: () => void
  /** Sólo se llama si `error.permiteRegistroManual` y esta prop está presente (el botón no se renderiza si no aplica). */
  onRegistroManual?: () => void
}

/**
 * Mismo criterio de color usado por `DatafonoPopup`/`CodisaOrdenPopup`: rojo
 * para un error definitivo/no reintentable por el usuario tal cual está
 * (`invalida` — debe corregir la cédula), ámbar para un error de
 * sistema/comunicación que sí puede resolverse reintentando igual
 * (`error-conexion`).
 */
const APARIENCIA: Record<CategoriaErrorCedula, { tituloKey: TranslationKey; fondo: string; trazo: string }> = {
  invalida: { tituloKey: 'cedula.errorInvalidaTitulo', fondo: 'bg-red-100', trazo: 'text-red-600' },
  'error-conexion': { tituloKey: 'cedula.errorConexionTitulo', fondo: 'bg-amber-100', trazo: 'text-amber-600' },
}

/**
 * Pop-up de error del paso de búsqueda de cliente por cédula (ver
 * `CedulaScreen`): "Cédula inválida" (formato incorrecto, no se llegó a
 * mandar ninguna petición — ver `buscarClienteCodisa` en
 * `services/wsdf.ts`) o "Error de conexión" (no se pudo contactar a Codisa,
 * respondió con un HTTP de error, agotó el tiempo de espera, o Codisa
 * reportó un error de API al buscar — ver categoría `error-api` en
 * `ResultadoBusquedaClienteCodisa`), con botón "Intentar de nuevo" sólo en
 * el segundo caso.
 */
export default function CedulaErrorPopup({ error, onReintentar, onCerrar, onRegistroManual }: CedulaErrorPopupProps) {
  const { t } = useLanguage()
  const apariencia = APARIENCIA[error.categoria]
  const muestraRegistroManual = Boolean(error.permiteRegistroManual && onRegistroManual)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl bg-white p-6 text-center shadow-2xl">
        <div className={`flex h-20 w-20 items-center justify-center rounded-full ${apariencia.fondo}`}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className={`h-10 w-10 ${apariencia.trazo}`}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </div>

        <h2 className="text-xl font-bold text-wood-900">{t(apariencia.tituloKey)}</h2>
        <p className="text-base text-wood-600">{error.mensaje}</p>

        <div className="flex w-full flex-col gap-2 pt-1">
          {error.permiteReintentar && (
            <button
              type="button"
              onClick={onReintentar}
              className="w-full rounded-2xl bg-brand-red py-4 text-base font-bold text-white transition-transform active:scale-98"
            >
              {t('payment.reintentar')}
            </button>
          )}
          {muestraRegistroManual && (
            <button
              type="button"
              onClick={onRegistroManual}
              className="w-full rounded-2xl bg-brand-red py-4 text-base font-bold text-white transition-transform active:scale-98"
            >
              {t('cedula.continuarRegistroManual')}
            </button>
          )}
          <button
            type="button"
            onClick={onCerrar}
            className={
              error.permiteReintentar || muestraRegistroManual
                ? 'w-full rounded-2xl bg-wood-100 py-4 text-base font-bold text-wood-800 transition-transform active:scale-98'
                : 'w-full rounded-2xl bg-brand-red py-4 text-base font-bold text-white transition-transform active:scale-98'
            }
          >
            {t('common.cerrar')}
          </button>
        </div>
      </div>
    </div>
  )
}

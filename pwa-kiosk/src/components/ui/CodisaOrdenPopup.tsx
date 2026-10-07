import { useLanguage } from '../../context/useLanguage'
import type { TranslationKey } from '../../i18n/translations'
import type { CategoriaResultadoOrdenCodisa, ResultadoOrdenCodisa } from '../../types/wsdf'

interface CodisaOrdenPopupProps {
  resultado: ResultadoOrdenCodisa
  /** Sólo se llama si `resultado.permiteReintentar` (el botón no se renderiza si no aplica). */
  onReintentar: () => void
  onCerrar: () => void
}

/** Color e ícono (check verde / X roja o ámbar) por categoría, mismo mapeo usado por `DatafonoPopup`. */
const APARIENCIA: Record<
  CategoriaResultadoOrdenCodisa,
  { icono: 'check' | 'x'; fondo: string; trazo: string; tituloKey: TranslationKey }
> = {
  enviado: { icono: 'check', fondo: 'bg-green-100', trazo: 'text-green-600', tituloKey: 'codisaOrden.tituloEnviado' },
  rechazado: { icono: 'x', fondo: 'bg-red-100', trazo: 'text-red-600', tituloKey: 'codisaOrden.tituloRechazado' },
  'error-validacion': {
    icono: 'x',
    fondo: 'bg-amber-100',
    trazo: 'text-amber-600',
    tituloKey: 'codisaOrden.tituloErrorValidacion',
  },
  'error-http': {
    icono: 'x',
    fondo: 'bg-amber-100',
    trazo: 'text-amber-600',
    tituloKey: 'codisaOrden.tituloErrorHttp',
  },
  'error-red': {
    icono: 'x',
    fondo: 'bg-amber-100',
    trazo: 'text-amber-600',
    tituloKey: 'codisaOrden.tituloErrorRed',
  },
  'en-curso': {
    icono: 'x',
    fondo: 'bg-amber-100',
    trazo: 'text-amber-600',
    tituloKey: 'codisaOrden.tituloEnCurso',
  },
  'tiempo-agotado': {
    icono: 'x',
    fondo: 'bg-amber-100',
    trazo: 'text-amber-600',
    tituloKey: 'codisaOrden.tituloTiempoAgotado',
  },
}

/**
 * Pop-up de resultado del envío del pedido a Codisa (factura electrónica,
 * `?action=orden` — ver `services/wsdf.ts`): "Pedido enviado correctamente"
 * en verde, o un error (rechazado/validación/comunicación) en rojo/ámbar
 * con botón "Intentar de nuevo" cuando aplica. Se muestra justo después de
 * `WsDfPopup` (verificación), al confirmar el envío — ver `PaymentScreen`.
 */
export default function CodisaOrdenPopup({ resultado, onReintentar, onCerrar }: CodisaOrdenPopupProps) {
  const { t } = useLanguage()
  const apariencia = APARIENCIA[resultado.categoria]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl bg-white p-6 text-center shadow-2xl">
        <div className={`flex h-20 w-20 items-center justify-center rounded-full ${apariencia.fondo}`}>
          {apariencia.icono === 'check' ? (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className={`h-10 w-10 ${apariencia.trazo}`}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className={`h-10 w-10 ${apariencia.trazo}`}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          )}
        </div>

        <h2 className="text-xl font-bold text-wood-900">{t(apariencia.tituloKey)}</h2>
        <p className="text-base text-wood-600">{resultado.mensaje}</p>

        <div className="flex w-full flex-col gap-2 pt-1">
          {resultado.permiteReintentar && (
            <button
              type="button"
              onClick={onReintentar}
              className="w-full rounded-2xl bg-brand-red py-4 text-base font-bold text-white transition-transform active:scale-98"
            >
              {t('payment.reintentar')}
            </button>
          )}
          <button
            type="button"
            onClick={onCerrar}
            className={
              resultado.permiteReintentar
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

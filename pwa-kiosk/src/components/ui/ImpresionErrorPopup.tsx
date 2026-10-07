import { NOMBRES_IMPRESORA, type PrinterId } from '../../services/tickets'
import { useLanguage } from '../../context/useLanguage'

interface ImpresionErrorPopupProps {
  /** IDs de las impresoras que fallaron de verdad (`ok: false, simulado: false`), para listarlas por nombre en el mensaje. */
  impresoras: PrinterId[]
  reintentando?: boolean
  onReintentar: () => void
  onContinuar: () => void
}

/**
 * Pop-up de error real de impresión al cerrar una mesa compartida (ver
 * `handleOtraOrdenNo`/`intentarImprimirCierre` en `PaymentScreen.tsx`):
 * antes `handleOtraOrdenNo` no revisaba el resultado de `enviarTicket` y
 * simplemente avanzaba el flujo sin avisar si la impresión falló de verdad
 * (ver hallazgo de auditoría). Ahora, si el tiquete consolidado de
 * carnicería/restaurante falla con un error real (no el caso simulado de
 * desarrollo), se muestra este pop-up con opción de reintentar o continuar
 * sin imprimir — el pedido ya quedó registrado de todas formas, así que no
 * se bloquea el cierre de la mesa indefinidamente.
 */
export default function ImpresionErrorPopup({
  impresoras,
  reintentando,
  onReintentar,
  onContinuar,
}: ImpresionErrorPopupProps) {
  const { t } = useLanguage()
  const nombres = impresoras.map((p) => NOMBRES_IMPRESORA[p]).join(', ')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl bg-white p-6 text-center shadow-2xl">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-amber-100">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-10 w-10 text-amber-600">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </div>

        <h2 className="text-xl font-bold text-wood-900">{t('payment.impresionCierreErrorTitulo')}</h2>
        <p className="text-base text-wood-600">
          {t('payment.impresionCierreErrorMensaje', { impresoras: nombres })}
        </p>

        <div className="flex w-full flex-col gap-2 pt-1">
          <button
            type="button"
            onClick={onReintentar}
            disabled={reintentando}
            className="w-full rounded-2xl bg-brand-red py-4 text-base font-bold text-white transition-transform active:scale-98 disabled:opacity-50"
          >
            {reintentando ? t('payment.reintentando') : t('payment.reintentar')}
          </button>
          <button
            type="button"
            onClick={onContinuar}
            disabled={reintentando}
            className="w-full rounded-2xl bg-wood-100 py-4 text-base font-bold text-wood-800 transition-transform active:scale-98 disabled:opacity-50"
          >
            {t('payment.continuarSinImprimir')}
          </button>
        </div>
      </div>
    </div>
  )
}

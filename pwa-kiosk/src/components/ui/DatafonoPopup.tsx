import { useState } from 'react'
import { useLanguage } from '../../context/useLanguage'
import type { TranslationKey } from '../../i18n/translations'
import type { CategoriaResultadoDatafono, ResultadoDatafono } from '../../types/datafono'

interface DatafonoPopupProps {
  resultado: ResultadoDatafono
  /** Sólo se llama si `resultado.permiteReintentar` (el botón no se renderiza si no aplica). */
  onReintentar: () => void
  onCerrar: () => void
}

/**
 * Ícono y título por categoría. El color (verde/rojo/ámbar) NO se fija aquí
 * por categoría — se deriva en `colorPorResultado` a partir de
 * `resultado.permiteReintentar` (ver hallazgo de auditoría: antes `invalida`
 * — códigos 13/14, que SÍ permiten reintentar — se pintaba en rojo igual que
 * `denegada`/`rechazo-generico`, que no lo permiten; eso mezclaba la
 * convención rojo = error definitivo / ámbar = se puede reintentar que sí se
 * respetaba en los demás casos).
 */
const APARIENCIA: Record<CategoriaResultadoDatafono, { icono: 'check' | 'x'; tituloKey: TranslationKey }> = {
  aprobada: { icono: 'check', tituloKey: 'datafono.tituloAprobada' },
  denegada: { icono: 'x', tituloKey: 'datafono.tituloDenegada' },
  invalida: { icono: 'x', tituloKey: 'datafono.tituloInvalida' },
  'error-sistema': { icono: 'x', tituloKey: 'datafono.tituloErrorSistema' },
  'rechazo-generico': { icono: 'x', tituloKey: 'datafono.tituloRechazoGenerico' },
  'error-http': { icono: 'x', tituloKey: 'datafono.tituloErrorHttp' },
  'error-red': { icono: 'x', tituloKey: 'datafono.tituloErrorRed' },
  'transaccion-en-curso': { icono: 'x', tituloKey: 'datafono.tituloEnCurso' },
  'tiempo-agotado': { icono: 'x', tituloKey: 'datafono.tituloTiempoAgotado' },
  'monto-invalido': { icono: 'x', tituloKey: 'datafono.tituloMontoInvalido' },
}

/**
 * Verde si fue aprobada; de lo contrario rojo cuando NO se puede reintentar
 * (error definitivo: el cliente/operador debe corregir algo o el banco ya
 * rechazó la tarjeta) y ámbar cuando sí se puede reintentar (falla
 * transitoria de comunicación/sistema, o un dato corregible como monto o
 * tarjeta — ver `interpretarResponseCode` en `services/datafono.ts`).
 */
function colorPorResultado(resultado: ResultadoDatafono): { fondo: string; trazo: string } {
  if (resultado.categoria === 'aprobada') return { fondo: 'bg-green-100', trazo: 'text-green-600' }
  if (resultado.permiteReintentar) return { fondo: 'bg-amber-100', trazo: 'text-amber-600' }
  return { fondo: 'bg-red-100', trazo: 'text-red-600' }
}

/**
 * Pop-up de resultado del cobro con datáfono (BAC Transaction Manager, ver
 * `services/datafono.ts`): único punto de la PWA donde se muestra el
 * desenlace de una transacción de tarjeta, sea aprobada, denegada, inválida,
 * error de sistema, rechazo genérico, o un problema de comunicación con el
 * terminal. Sólo se activa en el flujo de pago con datáfono (ver
 * `PaymentScreen.handleCobrar`) — no se reutiliza para factura/WS DF/tickets,
 * que ya tienen sus propios pop-ups.
 */
export default function DatafonoPopup({ resultado, onReintentar, onCerrar }: DatafonoPopupProps) {
  const { t } = useLanguage()
  const apariencia = APARIENCIA[resultado.categoria]
  const color = colorPorResultado(resultado)
  // Un timeout es el único caso donde la petición sí pudo haber llegado al
  // terminal físico (a diferencia de 'error-red', que normalmente falla
  // antes de tocar el datáfono, o un `responseCode` explícito, que ya es la
  // respuesta real del banco) — reintentar a ciegas aquí podría cobrar dos
  // veces si la transacción anterior en realidad sí se completó del lado del
  // datáfono (ver hallazgo de auditoría). Se pide confirmación explícita,
  // pidiendo revisar el datáfono físico antes de reintentar, igual que
  // `WsDfPopup` ya pide confirmación antes de cancelar una factura.
  const [confirmandoReintento, setConfirmandoReintento] = useState(false)
  const requiereConfirmacionReintento = resultado.categoria === 'tiempo-agotado'

  const handleClickReintentar = () => {
    if (requiereConfirmacionReintento) {
      setConfirmandoReintento(true)
      return
    }
    onReintentar()
  }

  if (confirmandoReintento) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
        <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl bg-white p-6 text-center shadow-2xl">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-amber-100">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-10 w-10 text-amber-600">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-wood-900">{t('datafono.tituloTiempoAgotado')}</h2>
          <p className="text-base text-wood-600">{t('datafono.confirmarReintentoTimeoutMensaje')}</p>
          <div className="flex w-full flex-col gap-2 pt-1">
            <button
              type="button"
              onClick={() => setConfirmandoReintento(false)}
              className="w-full rounded-2xl bg-wood-100 py-4 text-base font-bold text-wood-800 transition-transform active:scale-98"
            >
              {t('datafono.confirmarReintentoTimeoutNo')}
            </button>
            <button
              type="button"
              onClick={onReintentar}
              className="w-full rounded-2xl bg-brand-red py-4 text-base font-bold text-white transition-transform active:scale-98"
            >
              {t('datafono.confirmarReintentoTimeoutSi')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl bg-white p-6 text-center shadow-2xl">
        <div className={`flex h-20 w-20 items-center justify-center rounded-full ${color.fondo}`}>
          {apariencia.icono === 'check' ? (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className={`h-10 w-10 ${color.trazo}`}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className={`h-10 w-10 ${color.trazo}`}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          )}
        </div>

        <h2 className="text-xl font-bold text-wood-900">{t(apariencia.tituloKey)}</h2>
        <p className="text-base text-wood-600">{resultado.mensaje}</p>

        {(resultado.authorizationNumber || resultado.referenceNumber) && (
          <dl className="grid w-full grid-cols-2 gap-x-3 gap-y-1 rounded-xl bg-wood-50 p-3 text-sm">
            {resultado.authorizationNumber && (
              <>
                <dt className="text-left font-semibold text-wood-500">{t('datafono.autorizacion')}</dt>
                <dd className="text-right font-mono text-wood-900">{resultado.authorizationNumber}</dd>
              </>
            )}
            {resultado.referenceNumber && (
              <>
                <dt className="text-left font-semibold text-wood-500">{t('datafono.referencia')}</dt>
                <dd className="text-right font-mono text-wood-900">{resultado.referenceNumber}</dd>
              </>
            )}
          </dl>
        )}

        <div className="flex w-full flex-col gap-2 pt-1">
          {resultado.permiteReintentar && (
            <button
              type="button"
              onClick={handleClickReintentar}
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
            {resultado.categoria === 'aprobada' ? t('payment.continue') : t('common.cerrar')}
          </button>
        </div>
      </div>
    </div>
  )
}

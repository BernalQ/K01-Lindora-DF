import { PRODUCTS, formatCRC, productDisplayName } from '../../data/catalog'
import { useLanguage } from '../../context/LanguageContext'
import type { Venta } from '../../types/order'
import type { ValidacionWsDf, WsDfPayload } from '../../types/wsdf'

interface WsDfPopupProps {
  venta: Venta
  payload: WsDfPayload
  validacion: ValidacionWsDf
  onConfirmar: () => void
  onCancelar: () => void
}

/** Nombre legible de un artículo a partir de su `id_articulo` (= productId), con respaldo al ID crudo si no se encuentra en el catálogo. */
function nombreArticulo(idArticulo: string, language: 'es' | 'en'): string {
  const product = PRODUCTS.find((p) => p.id === idArticulo)
  return product ? productDisplayName(product, language) : idArticulo
}

/**
 * Pop-up de verificación previo a la integración real con el API WS DF de
 * Codisa: muestra, de forma legible, los datos que se enviarían al
 * confirmar el pago (ver `services/wsdf.ts`), junto con el JSON crudo
 * completo. En esta fase el botón "Confirmar envío" sólo registra un stub
 * local (`enviarPedidoWsDf`) — el envío real al endpoint todavía no está
 * activo.
 */
export default function WsDfPopup({ venta, payload, validacion, onConfirmar, onCancelar }: WsDfPopupProps) {
  const { language, t } = useLanguage()
  const { pedido } = payload

  const fechaTexto = new Date(venta.fechaHora).toLocaleString('es-CR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  })

  const clienteTexto = venta.cliente
    ? `${venta.cliente.nombre} (${venta.cliente.cedula})`
    : t('wsdf.clienteAnonimo')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="shrink-0 bg-wood-950 px-5 py-4">
          <h2 className="text-lg font-bold text-cream-50">{t('wsdf.title')}</h2>
          <p className="mt-0.5 text-xs text-cream-200">{t('wsdf.subtitle')}</p>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex flex-col gap-4">
            {!validacion.ok && (
              <div className="rounded-xl border-2 border-red-300 bg-red-50 p-3 text-sm text-red-700">
                <p className="mb-1 font-bold">{t('wsdf.erroresTitle')}</p>
                <ul className="list-disc pl-5">
                  {validacion.errores.map((error, i) => (
                    <li key={i}>{error}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Resumen legible */}
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl border border-wood-100 p-4 text-sm">
              <dt className="font-semibold text-wood-500">{t('wsdf.idPedido')}</dt>
              <dd className="text-right font-mono text-wood-900">{pedido.id}</dd>

              <dt className="font-semibold text-wood-500">{t('wsdf.idTienda')}</dt>
              <dd className="text-right font-mono text-wood-900">{pedido.id_tienda}</dd>

              <dt className="font-semibold text-wood-500">{t('wsdf.cliente')}</dt>
              <dd className="text-right text-wood-900">{clienteTexto}</dd>

              <dt className="font-semibold text-wood-500">{t('wsdf.fecha')}</dt>
              <dd className="text-right text-wood-900">{fechaTexto}</dd>

              <dt className="font-semibold text-wood-500">{t('wsdf.totalNeto')}</dt>
              <dd className="text-right font-bold text-brand-red">{formatCRC(Number(pedido.total_neto))}</dd>
            </dl>

            {/* Detalle de artículos */}
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-wood-500">
                {t('wsdf.detalleTitle')}
              </p>
              <div className="overflow-hidden rounded-xl border border-wood-100">
                <table className="w-full text-sm">
                  <thead className="bg-wood-50 text-xs font-bold uppercase text-wood-500">
                    <tr>
                      <th className="px-3 py-2 text-left">{t('wsdf.colArticulo')}</th>
                      <th className="px-3 py-2 text-right">{t('wsdf.colCantidad')}</th>
                      <th className="px-3 py-2 text-right">{t('wsdf.colPrecio')}</th>
                      <th className="px-3 py-2 text-right">{t('wsdf.colTotal')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pedido.detalle.map((linea, i) => (
                      <tr key={i} className="border-t border-wood-100">
                        <td className="px-3 py-2 text-wood-900">
                          {nombreArticulo(linea.id_articulo, language)}
                        </td>
                        <td className="px-3 py-2 text-right text-wood-700">{linea.cantidad}</td>
                        <td className="px-3 py-2 text-right text-wood-700">
                          {formatCRC(Number(linea.precio))}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-wood-900">
                          {formatCRC(Number(linea.total_neto))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* JSON crudo, para verificar la estructura exacta que se enviaría */}
            <details className="rounded-xl border-2 border-dashed border-wood-200 p-3">
              <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-wood-500">
                {t('wsdf.verJson')}
              </summary>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-5 text-wood-900">
                {JSON.stringify(payload, null, 2)}
              </pre>
            </details>

            <p className="text-center text-xs text-wood-400">{t('wsdf.envioPendienteNota')}</p>
          </div>
        </div>

        <div className="flex shrink-0 gap-3 border-t border-wood-100 p-5">
          <button
            type="button"
            onClick={onCancelar}
            className="flex-1 rounded-2xl bg-wood-100 py-4 text-base font-bold text-wood-800 transition-transform active:scale-98"
          >
            {t('wsdf.cancelar')}
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            className="flex-1 rounded-2xl bg-brand-red py-4 text-base font-bold text-white transition-transform active:scale-98"
          >
            {t('wsdf.confirmarEnvio')}
          </button>
        </div>
      </div>
    </div>
  )
}

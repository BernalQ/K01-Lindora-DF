import { RED_CONFIG } from './redConfig'
import { codigoArticuloParaCodisa } from '../data/catalog'
import type { Venta } from '../types/order'
import type { ValidacionWsDf, WsDfPayload } from '../types/wsdf'

/**
 * Configuración de la integración con el API WS DF de Codisa.
 *
 * `endpoint` se arma sobre `RED_CONFIG.ipGateway` (10.0.5.1, ver
 * `services/redConfig.ts`): el gateway de red fijo del kiosko es el punto
 * de salida para todo el JSON que se envía hacia Codisa.
 *
 * TODO: reemplazar `idTienda` por el ID real que Codisa asigne a este
 * kiosko antes de activar el envío real (ver `enviarPedidoWsDf`, aún no
 * implementado). Se hardcodea aquí siguiendo el mismo patrón ya usado en
 * el resto del proyecto para configuración de integraciones externas
 * (ver `BRIDGE_URL` en `services/facturacion.ts` y `PRINT_BRIDGE_URL` en
 * `services/printBridge.ts`), ya que el proyecto no usa variables de
 * entorno (`.env` / `import.meta.env`) en ningún otro lado todavía.
 */
export const WSDF_CONFIG = {
  idTienda: '1',
  /** ID de cliente genérico para ventas sin factura electrónica (consumidor final / anónimo). */
  idClienteAnonimo: '1',
  endpoint: `https://${RED_CONFIG.ipGateway}/wsdf/df_api.php?action=kiosko`,
}

/**
 * Construye el payload JSON compatible con el API WS DF a partir de una
 * venta ya confirmada (pago aprobado). No envía nada: sólo arma el objeto,
 * listo para mostrarse en el pop-up de verificación (`WsDfPopup`) y, más
 * adelante, para enviarse vía `enviarPedidoWsDf`.
 */
export function construirPedidoWsDf(venta: Venta): WsDfPayload {
  const conFactura = venta.tipoPago === 'factura' && !!venta.cliente

  const detalle = venta.items.map((item) => {
    const totalLinea = item.price * item.quantity
    return {
      // Código de artículo Codisa: usa el código específico de la variante
      // elegida cuando aplica (ej. "Gaseosa" vs "Tropical", o la marca de
      // cerveza — ver `CODIGOS_POR_VARIANTE` en `data/catalog.ts`),
      // si no `Product.codigoArticulo`, y como último respaldo el
      // `productId` interno — así el envío a Codisa nunca se rompe por
      // falta de código (ver `codigoArticuloParaCodisa`).
      id_articulo: codigoArticuloParaCodisa(item.productId, item.variante),
      cantidad: String(item.quantity),
      precio: String(item.price),
      porc_desc: 0,
      porc_iv: '0',
      total_neto: String(totalLinea),
      observaciones: '',
    }
  })

  return {
    pedido: {
      id: venta.id,
      id_tienda: WSDF_CONFIG.idTienda,
      id_cliente: conFactura ? (venta.cliente?.cedula ?? WSDF_CONFIG.idClienteAnonimo) : WSDF_CONFIG.idClienteAnonimo,
      fecha: venta.fechaHora,
      total_desc: 0,
      total_imp: '0',
      total_envio: null,
      total_neto: String(venta.total),
      observaciones: '',
      fe: conFactura ? '1' : '0',
      despachar: 'S',
      detalle,
    },
  }
}

/**
 * Valida un payload WS DF antes de mostrarlo/enviarlo, según las reglas
 * mínimas acordadas con Codisa:
 * - Debe existir el objeto raíz "pedido".
 * - `fe` debe ser "0" o "1" (se rechaza cualquier otro valor).
 * - `id_tienda` debe coincidir con la tienda configurada (`WSDF_CONFIG.idTienda`).
 * - `cantidad` y `precio` de cada línea deben ser numéricos.
 * - `total_neto` del pedido debe ser consistente con la suma de las líneas.
 */
export function validarPedidoWsDf(payload: WsDfPayload): ValidacionWsDf {
  const errores: string[] = []

  if (!payload || typeof payload !== 'object' || !payload.pedido) {
    return { ok: false, errores: ['El JSON debe tener un objeto raíz "pedido".'] }
  }

  const { pedido } = payload

  if (pedido.fe !== '0' && pedido.fe !== '1') {
    errores.push(`"fe" debe ser "0" o "1" (recibido: ${String(pedido.fe)}).`)
  }

  if (!pedido.id_tienda || pedido.id_tienda !== WSDF_CONFIG.idTienda) {
    errores.push(`"id_tienda" (${String(pedido.id_tienda)}) no coincide con la tienda configurada.`)
  }

  let sumaDetalle = 0
  pedido.detalle.forEach((linea, i) => {
    const cantidad = Number(linea.cantidad)
    const precio = Number(linea.precio)
    const totalLinea = Number(linea.total_neto)
    if (!Number.isFinite(cantidad)) errores.push(`Línea ${i + 1}: "cantidad" no es numérica.`)
    if (!Number.isFinite(precio)) errores.push(`Línea ${i + 1}: "precio" no es numérico.`)
    if (Number.isFinite(totalLinea)) sumaDetalle += totalLinea
  })

  const totalNeto = Number(pedido.total_neto)
  if (!Number.isFinite(totalNeto)) {
    errores.push(`"total_neto" (${pedido.total_neto}) no es numérico.`)
  } else if (totalNeto !== sumaDetalle) {
    errores.push(
      `"total_neto" (${pedido.total_neto}) no coincide con la suma del detalle (${sumaDetalle}).`,
    )
  }

  return { ok: errores.length === 0, errores }
}

/**
 * Envío real al API WS DF de Codisa (`WSDF_CONFIG.endpoint`).
 *
 * AÚN NO IMPLEMENTADO: en esta fase sólo se genera y se muestra el payload
 * en el pop-up de verificación (`components/ui/WsDfPopup.tsx`); el botón
 * "Confirmar envío" llama a este stub como placeholder para cuando se
 * conecte el endpoint real.
 *
 * Comportamiento documentado por Codisa para cuando se active el envío:
 * - POST del payload (`WsDfPayload`) a `WSDF_CONFIG.endpoint`.
 * - HTTP 200 → `{ success: 1, mensaje: 'OK', No_Transa_Mov }`.
 * - HTTP 400 → `{ success: 0, mensaje: '<error>' }`.
 * - Registrar en bitácora (log/offline queue) el resultado del envío por venta.
 */
export async function enviarPedidoWsDf(payload: WsDfPayload): Promise<{ ok: boolean; mensaje: string }> {
  console.log('[wsdf:stub] Envío real pendiente de integración. Endpoint:', WSDF_CONFIG.endpoint, payload)
  return { ok: false, mensaje: 'Envío no implementado todavía (fase de sólo-visualización).' }
}

import type { Venta } from '../types/order'

/**
 * Interfaz prevista para la sincronización con Codisa POS.
 *
 * No implementada todavía: aún no se confirma si Codisa expone un API
 * para esta empresa. Este stub registra la venta localmente para que el
 * resto del flujo (cobro, impresión, confirmación) no dependa de esta
 * integración y pueda conectarse después sin rediseñar nada.
 *
 * El envío de JSON hacia Codisa que sí tiene contrato documentado es el API
 * WS DF (ver `WSDF_CONFIG`/`enviarPedidoWsDf` en `services/wsdf.ts`), que
 * sale a través del print-bridge local (`http://localhost:4000/...`), no del
 * gateway de red del kiosko.
 */
export async function enviarVentaACodisa(venta: Venta): Promise<{ ok: boolean }> {
  console.log('[codisa:stub] Venta registrada localmente, envío a Codisa pendiente de API:', venta)
  return { ok: true }
}

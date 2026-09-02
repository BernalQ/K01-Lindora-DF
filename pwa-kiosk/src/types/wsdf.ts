/**
 * Tipos del payload esperado por el API WS DF de Codisa
 * (`POST https://10.0.1.24/wsdf/df_api.php?action=kiosko`).
 *
 * NOTA: varios campos numéricos (cantidad, precio, total_neto, id_tienda,
 * id_cliente) se envían como STRING, no como number, siguiendo el formato
 * documentado por Codisa. `porc_desc` es la única excepción numérica.
 */

/** Línea de detalle de un artículo dentro del pedido enviado a WS DF. */
export interface WsDfDetalleItem {
  id_articulo: string
  cantidad: string
  precio: string
  porc_desc: number
  porc_iv: string
  total_neto: string
  observaciones: string
}

/** Cuerpo del pedido, tal como lo espera el API WS DF. */
export interface WsDfPedido {
  id: string
  id_tienda: string
  id_cliente: string
  fecha: string
  total_desc: number
  total_imp: string
  total_envio: null
  total_neto: string
  observaciones: string
  /** "1" = venta con factura electrónica, "0" = venta simple (sin factura). */
  fe: '0' | '1'
  despachar: 'S' | 'N'
  detalle: WsDfDetalleItem[]
}

/** Payload raíz esperado por el API WS DF. */
export interface WsDfPayload {
  pedido: WsDfPedido
}

/** Resultado de validar un `WsDfPayload` antes de mostrarlo/enviarlo. */
export interface ValidacionWsDf {
  ok: boolean
  errores: string[]
}

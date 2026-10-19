import { PRODUCTS } from '../data/catalog'
import { aplicarDisponibilidadRemota, aplicarPrecioRemoto } from './catalogOverrides'

/**
 * Contrato JSON de sincronización de catálogo entre kioskos físicos (ver
 * requerimientos "Disponibilidad de productos" / "Actualización de precios").
 * K001 es el kiosko Master: sólo él emite estos mensajes (ver
 * `esKioskoMaster` en `services/catalogOverrides.ts`); K002 sólo los recibe y
 * aplica. El envío real vive en `services/kioskoTransport.ts` (ver
 * `enviarMensajeCatalogSync` en `services/catalogOverrides.ts`); este archivo
 * fija el formato del mensaje y el punto de entrada para cuando llega del
 * otro kiosko, invocado por `services/kioskoSyncPolling.ts` al drenar la cola
 * de mensajes pendientes.
 */

/** Mensaje emitido por el kiosko Master al cambiar la disponibilidad ("Disponible"/"Agotado") de un producto. */
export interface MensajeUpdateAvailability {
  action: 'updateAvailability'
  /** `Product.id` (slug interno, ej. "ribeye-250"), NO `codigoArticulo` (ver `types/catalog.ts`). */
  productId: string
  available: boolean
}

/** Mensaje emitido por el kiosko Master al cambiar el precio de un producto. */
export interface MensajeUpdatePrice {
  action: 'updatePrice'
  productId: string
  price: number
}

export type MensajeCatalogSync = MensajeUpdateAvailability | MensajeUpdatePrice

/**
 * Punto de entrada único para mensajes de sincronización de catálogo
 * RECIBIDOS del kiosko Master (K001). Invocado por
 * `services/kioskoSyncPolling.ts` con el JSON ya recibido de la cola local
 * (`services/kioskoTransport.ts` -> `consultarPendientes`) y parseado.
 *
 * Aplica el mensaje sobre el array `PRODUCTS` compartido SIN reemitir un
 * mensaje de salida (`aplicarDisponibilidadRemota`/`aplicarPrecioRemoto`, que
 * a propósito no llaman a `enviarMensajeCatalogSync`) — evita un eco infinito
 * y respeta que sólo K001 (Master) debe emitir estos mensajes.
 */
export function recibirMensajeCatalogSync(mensaje: MensajeCatalogSync): void {
  if (mensaje.action === 'updateAvailability') {
    aplicarDisponibilidadRemota(PRODUCTS, mensaje.productId, mensaje.available)
  } else {
    aplicarPrecioRemoto(PRODUCTS, mensaje.productId, mensaje.price)
  }
}

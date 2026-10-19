import { aplicarLockRemoto, aplicarUnlockRemoto } from './mesaLocks'

/**
 * Contrato JSON de sincronización de mesas entre kioskos físicos (ver
 * requerimiento "Sincronización de mesas" / "Liberación automática de
 * mesas"). El envío real vive en `services/kioskoTransport.ts` (ver
 * `enviarMensajeMesaSync` en `services/mesaLocks.ts`); este archivo fija el
 * formato del mensaje y el punto de entrada para cuando llega del otro
 * kiosko, invocado por `services/kioskoSyncPolling.ts` al drenar la cola de
 * mensajes pendientes.
 */

/** Mensaje emitido por el kiosko que OCUPA una mesa (al confirmarse la orden que la ocupa, ver `PaymentScreen.tsx`). */
export interface MensajeLockTable {
  action: 'lockTable'
  /** Identificador de mesa (en este kiosko, la raza de ganado elegida en `MesaSetupScreen`, ver `services/mesaLocks.ts`). */
  tableId: string
  /** Consecutivo de la orden que ocupa la mesa (ver `services/consecutivo.ts`, ej. "010000000123"). */
  orderId: string
  /** `CAJA_ID` de la caja/kiosko que originó el bloqueo (ej. "K001"). */
  source: string
}

/** Mensaje emitido al liberar una mesa, manualmente o por vencimiento automático de los 30 minutos. */
export interface MensajeUnlockTable {
  action: 'unlockTable'
  tableId: string
  /** `CAJA_ID` si fue una liberación manual (ej. "Cancelar Orden"), o el literal `"AUTO_TIMEOUT"` si fue por vencimiento de los 30 minutos (ver `services/mesaLocks.ts`). */
  source: string
}

export type MensajeMesaSync = MensajeLockTable | MensajeUnlockTable

/**
 * Punto de entrada único para mensajes de sincronización de mesas RECIBIDOS
 * del otro kiosko. Invocado por `services/kioskoSyncPolling.ts` con el JSON
 * ya recibido de la cola local (`services/kioskoTransport.ts` ->
 * `consultarPendientes`) y parseado.
 *
 * Aplica el mensaje al estado local de `mesaLocks.ts` SIN reemitir un
 * mensaje de salida — evita un eco infinito entre los dos kioskos (ver
 * `aplicarLockRemoto`/`aplicarUnlockRemoto`, que a propósito no llaman a
 * `enviarMensajeMesaSync`).
 */
export function recibirMensajeMesaSync(mensaje: MensajeMesaSync): void {
  if (mensaje.action === 'lockTable') {
    aplicarLockRemoto(mensaje.tableId, mensaje.orderId, mensaje.source)
  } else {
    aplicarUnlockRemoto(mensaje.tableId)
  }
}

/**
 * Cola en memoria de mensajes de sincronización entre kioskos, RECIBIDOS vía
 * `POST /kiosko-sync/incoming` (ver `server.ts` en esta misma carpeta) desde
 * la máquina del otro kiosko. La PWA de ESTA MISMA máquina los retira vía
 * `GET /kiosko-sync/pending` (ver `services/kioskoTransport.ts` ->
 * `consultarPendientes` en `pwa-kiosk`, que hace polling periódico desde
 * `services/kioskoSyncPolling.ts`).
 *
 * Deliberadamente en memoria (no en disco): si este proceso se reinicia antes
 * de que la PWA drene la cola, los mensajes encolados se pierden — aceptable
 * porque el requerimiento "Modo autónomo" ya contempla que la resincronización
 * automática al recuperar contacto reconstruye el estado completo desde cero
 * (`syncConfig`), así que perder un mensaje puntual de la cola no deja al
 * kiosko en un estado inconsistente de forma permanente.
 */

export interface Envelope {
  tipo: string
  mensaje: unknown
}

/** Tope de la cola: si la PWA receptora deja de hacer polling por mucho tiempo, no crece sin límite — se descartan los mensajes más antiguos. */
const MAX_COLA = 500

let cola: Envelope[] = []

/** Encola un mensaje recibido del otro kiosko. Descarta el más antiguo si se llega al tope (`MAX_COLA`). */
export function pushEnvelope(envelope: Envelope): void {
  cola.push(envelope)
  if (cola.length > MAX_COLA) {
    cola = cola.slice(cola.length - MAX_COLA)
  }
}

/** Retira y vacía la cola completa (consumo destructivo, pensado para un único lector: la PWA de esta misma máquina). */
export function drainEnvelopes(): Envelope[] {
  const envelopes = cola
  cola = []
  return envelopes
}

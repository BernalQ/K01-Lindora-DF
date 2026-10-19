import { consultarPendientes, enviarAOtroKiosko } from './kioskoTransport'
import { recibirMensajeMesaSync } from './mesaSync'
import { recibirMensajeCatalogSync } from './catalogSync'
import {
  construirRespuestaSyncConfig,
  aplicarRespuestaSyncConfig,
  solicitarResincronizacion,
} from './kioskoSync'
import { useSyncStatusStore } from '../store/syncStatusStore'

/**
 * Capa superior de la sincronización entre kioskos: el único archivo que
 * conoce TANTO el transporte (`kioskoTransport.ts`) COMO los tres
 * despachadores de mensajes (`mesaSync.ts`, `catalogSync.ts`, `kioskoSync.ts`)
 * — a propósito, para no crear un import circular (ver comentarios en esos
 * archivos: `kioskoTransport.ts` no puede importar de `kioskoSync.ts` porque
 * `kioskoSync.ts` necesita importar de `kioskoTransport.ts` para enviar).
 *
 * Dos responsabilidades, autónomas entre sí:
 *
 * 1. RECEPCIÓN: cada `INTERVALO_POLLING_MS` consulta la cola de mensajes
 *    pendientes de ESTA MISMA máquina (`consultarPendientes`, ver
 *    `services/kioskoTransport.ts` -> `GET /kiosko-sync/pending` del
 *    print-bridge local) y despacha cada uno según su `tipo` al manejador
 *    correspondiente. "syncConfigRequest"/"syncConfigResponse" se resuelven
 *    aquí mismo (construir+enviar la respuesta, o aplicarla) porque ninguno
 *    de los otros archivos de sync puede depender de `kioskoTransport.ts`
 *    directamente.
 *
 * 2. RECONEXIÓN: se suscribe a `store/syncStatusStore.ts` y, en la transición
 *    `false -> true` de `remotoDisponible` (el otro kiosko volvió a
 *    contestar, detectado por `kioskoTransport.ts` -> `marcarConexion`),
 *    dispara `solicitarResincronizacion()` (requerimiento "Modo autónomo":
 *    "cuando K001 regrese: ejecutar resincronización automática").
 *
 * Ambas arrancan solas apenas se importa este módulo (efectos secundarios a
 * nivel de módulo, mismo patrón que `mesaLocks.ts` ->
 * `iniciarRevisionAutomatica`) — por eso `App.tsx` debe importar
 * `solicitarResincronizacion` DESDE AQUÍ (re-exportada abajo) y no
 * directamente de `kioskoSync.ts`: así se garantiza que este módulo se cargó
 * y sus efectos ya están corriendo.
 */

/** Frecuencia del polling de mensajes pendientes: suficientemente seguido para que mesas/catálogo se vean "casi en tiempo real" en el otro kiosko, sin saturar la red local. */
const INTERVALO_POLLING_MS = 3_000

async function despacharEnvelope(envelope: { tipo: string; mensaje: unknown }): Promise<void> {
  switch (envelope.tipo) {
    case 'mesaSync':
      recibirMensajeMesaSync(envelope.mensaje as Parameters<typeof recibirMensajeMesaSync>[0])
      break
    case 'catalogSync':
      recibirMensajeCatalogSync(envelope.mensaje as Parameters<typeof recibirMensajeCatalogSync>[0])
      break
    case 'syncConfigRequest':
      // El otro kiosko pide nuestro estado completo: se lo contestamos
      // directamente (no hace falta pasar por `kioskoSync.ts` para enviar).
      void enviarAOtroKiosko('syncConfigResponse', construirRespuestaSyncConfig())
      break
    case 'syncConfigResponse':
      aplicarRespuestaSyncConfig(envelope.mensaje as Parameters<typeof aplicarRespuestaSyncConfig>[0])
      break
    default:
      console.log(`[kioskoSyncPolling] Tipo de mensaje desconocido, se ignora: "${envelope.tipo}"`)
  }
}

async function revisarPendientes(): Promise<void> {
  const envelopes = await consultarPendientes()
  for (const envelope of envelopes) {
    await despacharEnvelope(envelope)
  }
}

void revisarPendientes()
setInterval(() => {
  void revisarPendientes()
}, INTERVALO_POLLING_MS)

// Reconexión: dispara una resincronización completa apenas el otro kiosko
// vuelve a contestar después de haber estado caído.
let remotoDisponiblePrevio = useSyncStatusStore.getState().remotoDisponible
useSyncStatusStore.subscribe((state) => {
  const disponibleAhora = state.remotoDisponible
  if (!remotoDisponiblePrevio && disponibleAhora) {
    solicitarResincronizacion()
  }
  remotoDisponiblePrevio = disponibleAhora
})

/** Re-exportada para que `App.tsx` importe de aquí (ver doc del módulo arriba) y así cargue también los efectos de polling/reconexión de este archivo. */
export { solicitarResincronizacion }

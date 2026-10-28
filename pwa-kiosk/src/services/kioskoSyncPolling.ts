import { consultarPendientes, enviarAOtroKiosko, verificarConexionRemota } from './kioskoTransport'
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
 * Tres responsabilidades, autónomas entre sí:
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
 *    "cuando K001 regrese: ejecutar resincronización automática" / "si no
 *    está sync y el health check es positivo, intentar sincronizar de
 *    nuevo"). Esta transición la puede detectar tanto un envío real
 *    (`enviarAOtroKiosko`) como el chequeo de salud en segundo plano del
 *    punto 3 — cualquiera de los dos reactiva el resync igual, y éste a su
 *    vez vuelve a pasar por `enviarAOtroKiosko`, así que conserva los mismos
 *    3 reintentos (`MAX_INTENTOS` en `kioskoTransport.ts`).
 *
 * 3. SALUD EN SEGUNDO PLANO: cada `INTERVALO_VERIFICACION_SALUD_MS` llama a
 *    `verificarConexionRemota()` (ver `services/kioskoTransport.ts`) — un
 *    simple `GET /kiosko-sync/health`, NO un envío de datos — para que el
 *    indicador "Sincronizado"/"No Sync" de `AdminScreen.tsx`
 *    (`EstadoSincronizacion`) se mantenga al día incluso en ratos sin ningún
 *    cambio real de mesas/catálogo que enviar (requerimiento: mostrar "No
 *    Sync" en el admin cuando corresponda, sin depender de que justo haya
 *    algo que sincronizar). Los envíos de datos reales (`enviarAOtroKiosko`,
 *    llamados desde `mesaLocks.ts`/`catalogOverrides.ts`/este mismo archivo)
 *    siguen disparándose únicamente cuando hay un cambio que mandar — este
 *    chequeo de salud nunca reemplaza ni duplica esos envíos.
 *
 * Las tres arrancan solas apenas se importa este módulo (efectos secundarios
 * a nivel de módulo, mismo patrón que `mesaLocks.ts` ->
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

/** Cada cuánto se verifica, en segundo plano, si el otro kiosko sigue respondiendo — ver punto 3 de la doc del módulo arriba. No es tan seguido como `INTERVALO_POLLING_MS` porque no es tiempo-crítico (sólo alimenta un indicador visual en Admin, no bloquea ningún flujo de venta). */
const INTERVALO_VERIFICACION_SALUD_MS = 20_000

// Evita superponer dos chequeos de salud si uno quedó colgado más de
// `INTERVALO_VERIFICACION_SALUD_MS` (ej. red muy lenta) — sin esto, cada
// intento fallido con sus 3 reintentos (hasta ~12s + 2 esperas) podría
// solaparse con el siguiente disparo del `setInterval`.
let verificandoSaludAhora = false

async function verificarSaludPeriodica(): Promise<void> {
  if (verificandoSaludAhora) return
  verificandoSaludAhora = true
  try {
    await verificarConexionRemota()
  } finally {
    verificandoSaludAhora = false
  }
}

void verificarSaludPeriodica()
setInterval(() => {
  void verificarSaludPeriodica()
}, INTERVALO_VERIFICACION_SALUD_MS)

/** Re-exportada para que `App.tsx` importe de aquí (ver doc del módulo arriba) y así cargue también los efectos de polling/reconexión de este archivo. */
export { solicitarResincronizacion }

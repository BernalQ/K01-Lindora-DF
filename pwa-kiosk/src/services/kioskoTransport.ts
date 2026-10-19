import { KIOSKO_SYNC_PORT, ipOtroKiosko } from './kioskoSyncConfig'
import { registrarEventoSync } from './kioskoSyncLogs'
import { useSyncStatusStore } from '../store/syncStatusStore'

/**
 * Transporte real entre kioskos físicos (antes un stub de `console.log` en
 * `services/mesaLocks.ts`/`services/catalogOverrides.ts`/
 * `services/kioskoSync.ts`, ver TODOs ahí — ya resueltos vía este archivo).
 *
 * Cada kiosko le habla DIRECTAMENTE a la IP de la máquina del otro
 * (`ipOtroKiosko()`, ver `services/kioskoSyncConfig.ts`), puerto 3005, un
 * servidor Node dedicado para esto que corre junto al print-bridge normal en
 * cada terminal (ver `print-bridge/src/kioskoSync/server.ts`) — DISTINTO del
 * print-bridge de puerto 4000 (impresión/facturación).
 *
 * Por qué hace falta ese servidor intermedio y no basta con que las dos PWA
 * se hablen directo entre navegadores: un navegador no puede aceptar
 * conexiones entrantes (no hay forma de "escuchar" HTTP desde JS de
 * página). Así que el envío SÍ es directo (esta PWA hace `fetch` cross-origin
 * a la IP de la otra máquina), pero la recepción pasa por ese proceso Node
 * local, que encola lo recibido; la PWA de ESA MISMA máquina lo retira
 * siempre vía `http://localhost:3005` (ver `consultarPendientes` abajo y
 * `services/kioskoSyncPolling.ts`, que hace el polling y despacha cada
 * mensaje a su manejador correspondiente).
 *
 * Este archivo es deliberadamente "tonto": no conoce `mesaSync`/
 * `catalogSync`/`kioskoSync` (evita una dependencia circular con
 * `services/mesaLocks.ts`/`services/catalogOverrides.ts`, que SÍ importan de
 * aquí para enviar) — sólo mueve bytes y marca disponibilidad del kiosko
 * remoto (requerimiento "Modo autónomo").
 */

/** Tiempo máximo de espera por intento de red hacia el otro kiosko: debe fallar rápido para detectar "modo autónomo" sin congelar la UI. */
const TIMEOUT_MS = 4_000

function urlPendientesLocal(): string {
  return `http://localhost:${KIOSKO_SYNC_PORT}/kiosko-sync/pending`
}

function urlIncomingRemoto(): string {
  return `http://${ipOtroKiosko()}:${KIOSKO_SYNC_PORT}/kiosko-sync/incoming`
}

async function conTimeout<T>(hacer: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await hacer(controller.signal)
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Actualiza `remotoDisponible` (ver `store/syncStatusStore.ts`) sólo cuando
 * cambia de valor, para no generar ruido de logs/renders en cada intento
 * exitoso repetido. Loguea "Kiosko remoto no disponible" únicamente en la
 * transición true -> false (requerimiento "Logging"); la reacción a la
 * transición false -> true ("ejecutar resincronización automática") vive en
 * `services/kioskoSyncPolling.ts`, que se suscribe al store — este archivo
 * sólo reporta el hecho, no decide qué hacer con él (evita una dependencia
 * circular con `services/kioskoSync.ts`).
 */
function marcarConexion(disponible: boolean): void {
  const previo = useSyncStatusStore.getState().remotoDisponible
  if (previo === disponible) return
  useSyncStatusStore.getState().fijarRemotoDisponible(disponible)
  if (!disponible) {
    registrarEventoSync('Kiosko remoto no disponible')
  }
}

/**
 * Envía un mensaje al otro kiosko (`tipo` identifica el manejador que debe
 * procesarlo del otro lado — "mesaSync" | "catalogSync" | "syncConfigRequest"
 * | "syncConfigResponse", ver `services/kioskoSyncPolling.ts`). "Fire and
 * forget" desde el punto de vista del llamador (no se espera la promesa en
 * `mesaLocks.ts`/`catalogOverrides.ts`, que son funciones síncronas): si la
 * red falla o el otro kiosko no contesta a tiempo, sólo se marca
 * `remotoDisponible: false` y se sigue — este kiosko YA aplicó el cambio
 * localmente antes de llamar aquí (requerimiento "Modo autónomo": la
 * operación local nunca depende de que el otro kiosko esté disponible).
 */
export async function enviarAOtroKiosko(tipo: string, mensaje: unknown): Promise<void> {
  try {
    const res = await conTimeout((signal) =>
      fetch(urlIncomingRemoto(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, mensaje }),
        signal,
      }),
    )
    if (!res.ok) throw new Error(`Error HTTP ${res.status}`)
    marcarConexion(true)
  } catch (err) {
    console.log(`[kioskoTransport] No se pudo enviar "${tipo}" al otro kiosko:`, err)
    marcarConexion(false)
  }
}

/**
 * Retira (y vacía) la cola de mensajes pendientes acumulados en el servidor
 * de sincronización de ESTA MISMA máquina (ver
 * `print-bridge/src/kioskoSync/server.ts`), llenada por el otro kiosko vía
 * `POST /kiosko-sync/incoming`. Usada por el polling de
 * `services/kioskoSyncPolling.ts`.
 */
export async function consultarPendientes(): Promise<Array<{ tipo: string; mensaje: unknown }>> {
  try {
    const res = await conTimeout((signal) => fetch(urlPendientesLocal(), { signal }))
    if (!res.ok) throw new Error(`Error HTTP ${res.status}`)
    const data = (await res.json()) as { envelopes: Array<{ tipo: string; mensaje: unknown }> }
    return data.envelopes ?? []
  } catch (err) {
    // No se pudo ni consultar el servidor LOCAL de sincronización (ej. el
    // print-bridge de esta misma terminal no está corriendo) — no dice nada
    // sobre si el OTRO kiosko está disponible, así que no se toca
    // `remotoDisponible` aquí.
    console.log('[kioskoTransport] No se pudo consultar mensajes pendientes del servidor local de sincronización:', err)
    return []
  }
}

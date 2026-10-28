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

/**
 * Cuántas veces se intenta una misma operación (enviar un cambio real o
 * verificar salud) contra el otro kiosko antes de darla por fallida y marcar
 * `remotoDisponible: false` — que a su vez enciende el indicador "No Sync"
 * en `AdminScreen.tsx` (`EstadoSincronizacion`, dentro de `PanelKiosko`).
 * Antes era un solo intento ("fire and forget" puro); con una red local
 * (Wi-Fi/LAN del restaurante) vale la pena un par de reintentos cortos antes
 * de rendirse, para no marcar "No Sync" por un simple parpadeo momentáneo de
 * la red.
 */
const MAX_INTENTOS = 3
/** Espera entre reintentos — corta a propósito (no es un backoff largo): si el otro kiosko está vivo pero momentáneamente ocupado/reiniciando, 3 intentos de ~4s + 2 esperas de 800ms ya cubren varios segundos reales sin congelar la UI por mucho tiempo. */
const ESPERA_ENTRE_INTENTOS_MS = 800

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function urlPendientesLocal(): string {
  return `http://localhost:${KIOSKO_SYNC_PORT}/kiosko-sync/pending`
}

function urlIncomingRemoto(): string {
  return `http://${ipOtroKiosko()}:${KIOSKO_SYNC_PORT}/kiosko-sync/incoming`
}

/** `GET /kiosko-sync/health` del OTRO kiosko (ver `print-bridge/src/kioskoSync/server.ts`) — usado sólo para comprobar salud, nunca para mandar ni aplicar datos (ver `verificarConexionRemota` abajo). */
function urlHealthRemoto(): string {
  return `http://${ipOtroKiosko()}:${KIOSKO_SYNC_PORT}/kiosko-sync/health`
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
 * Ejecuta `intentar` hasta `MAX_INTENTOS` veces, deteniéndose en el primer
 * éxito (requerimiento: "que intente 3 veces si no se sincronizó"). Devuelve
 * `true` si algún intento tuvo éxito, `false` si los `MAX_INTENTOS` fallaron
 * — en ese caso el llamador es quien decide marcar `remotoDisponible: false`
 * (este helper no conoce el store, sólo reintenta).
 */
async function conReintentos(etiqueta: string, intentar: () => Promise<void>): Promise<boolean> {
  for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
    try {
      await intentar()
      return true
    } catch (err) {
      const esUltimoIntento = intento === MAX_INTENTOS
      console.log(
        `[kioskoTransport] Intento ${intento}/${MAX_INTENTOS} fallido (${etiqueta})${
          esUltimoIntento ? ', sin más reintentos' : ', reintentando'
        }:`,
        err,
      )
      if (!esUltimoIntento) await esperar(ESPERA_ENTRE_INTENTOS_MS)
    }
  }
  return false
}

/**
 * Actualiza `remotoDisponible` (ver `store/syncStatusStore.ts`). Siempre
 * escribe en el store (para que `ultimaConexionExitosaEn` se refresque en
 * cada éxito, incluso repetido — lo lee `EstadoSincronizacion` en
 * `AdminScreen.tsx`), pero sólo loguea en las TRANSICIONES (true->false y
 * false->true, requerimiento "Logging"), para no llenar la bitácora con la
 * misma caída/recuperación una y otra vez.
 *
 * La transición false -> true (el otro kiosko volvió a contestar — ya sea
 * porque un envío real tuvo éxito o, más seguido, porque lo detectó el
 * chequeo de salud periódico de `services/kioskoSyncPolling.ts` ->
 * `verificarSaludPeriodica`) es justo la señal que dispara
 * `solicitarResincronizacion()` desde el `subscribe` de
 * `services/kioskoSyncPolling.ts` (requerimiento: "si no está sync y el
 * health check es positivo, intentar sincronizar de nuevo") — ese resync
 * pasa de nuevo por `enviarAOtroKiosko` más abajo, así que conserva los
 * mismos `MAX_INTENTOS` reintentos que cualquier otro envío. Este archivo
 * sólo reporta el hecho (marca el store + loguea); la reacción vive allá
 * para evitar una dependencia circular con `services/kioskoSync.ts`.
 */
function marcarConexion(disponible: boolean): void {
  const previo = useSyncStatusStore.getState().remotoDisponible
  useSyncStatusStore.getState().fijarRemotoDisponible(disponible)
  if (previo && !disponible) {
    registrarEventoSync('Kiosko remoto no disponible')
  } else if (!previo && disponible) {
    registrarEventoSync('Kiosko remoto disponible de nuevo')
  }
}

/**
 * Envía un mensaje al otro kiosko (`tipo` identifica el manejador que debe
 * procesarlo del otro lado — "mesaSync" | "catalogSync" | "syncConfigRequest"
 * | "syncConfigResponse", ver `services/kioskoSyncPolling.ts`). "Fire and
 * forget" desde el punto de vista del llamador (no se espera la promesa en
 * `mesaLocks.ts`/`catalogOverrides.ts`, que son funciones síncronas): este
 * kiosko YA aplicó el cambio localmente antes de llamar aquí (requerimiento
 * "Modo autónomo": la operación local nunca depende de que el otro kiosko
 * esté disponible).
 *
 * Reintenta hasta `MAX_INTENTOS` veces (ver `conReintentos`) antes de marcar
 * `remotoDisponible: false` — sólo se intenta reenviar cuando HAY un cambio
 * real que mandar (esta función se llama una vez por cada cambio de
 * mesa/catálogo, nunca en un bucle de fondo sin motivo); el chequeo de salud
 * periódico que SÍ corre en segundo plano sin depender de que haya cambios
 * vive aparte, en `verificarConexionRemota` abajo.
 */
export async function enviarAOtroKiosko(tipo: string, mensaje: unknown): Promise<void> {
  const exito = await conReintentos(`enviar "${tipo}"`, async () => {
    const res = await conTimeout((signal) =>
      fetch(urlIncomingRemoto(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tipo, mensaje }),
        signal,
      }),
    )
    if (!res.ok) throw new Error(`Error HTTP ${res.status}`)
  })
  marcarConexion(exito)
}

/**
 * Comprobación de salud pura del otro kiosko — NO manda ni aplica ningún
 * dato de mesas/catálogo, sólo pregunta "¿estás vivo?" (`GET
 * /kiosko-sync/health`). Existe para que el indicador "Sincronizado"/"No
 * Sync" de `AdminScreen.tsx` refleje la realidad incluso en ratos sin ningún
 * cambio real que enviar (si sólo dependiera de `enviarAOtroKiosko`, una
 * caída del otro kiosko podría pasar desapercibida hasta el próximo cambio
 * de precio o mesa). Se usa desde el chequeo periódico en segundo plano de
 * `services/kioskoSyncPolling.ts` y desde el botón "Verificar ahora" del
 * panel de kiosko. Mismos `MAX_INTENTOS` reintentos que un envío real.
 */
export async function verificarConexionRemota(): Promise<boolean> {
  const exito = await conReintentos('verificar conexión', async () => {
    const res = await conTimeout((signal) => fetch(urlHealthRemoto(), { signal }))
    if (!res.ok) throw new Error(`Error HTTP ${res.status}`)
  })
  marcarConexion(exito)
  return exito
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

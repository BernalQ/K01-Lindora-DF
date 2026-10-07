/**
 * Bloqueo temporal de identificadores de mesa (razas de ganado).
 *
 * Cuando un identificador se elige para una orden nueva (`MesaSetupScreen` →
 * `mesaStore.iniciar`), queda bloqueado por 30 minutos para evitar que dos
 * mesas distintas usen el mismo identificador al mismo tiempo. Pasado ese
 * lapso, el identificador vuelve a estar disponible automáticamente.
 *
 * Se persiste en `localStorage` (en vez de IndexedDB, usado en
 * `offlineQueue.ts` para la cola de ventas) porque sólo se necesita un mapa
 * simple `{ mesaId: expiraEn }` con lectura/escritura síncrona, sin
 * necesidad de consultas complejas.
 *
 * Sincronización: `BroadcastChannel` + evento nativo `storage` (ver
 * `suscribirCambiosMesaLocks` abajo) notifican casi al instante a otras
 * pestañas/ventanas del MISMO dispositivo cuando cambia el mapa de
 * bloqueos, en vez de depender sólo del polling por intervalo que ya hace
 * `MesaSetupScreen`. IMPORTANTE — esto NO resuelve la sincronización entre
 * kioskos físicos distintos (cada uno tiene su propio `localStorage`,
 * aislado del resto): si se despliega más de un kiosko, bloquear una mesa en
 * uno no se refleja en los demás hasta que ese otro kiosko guarde/lea su
 * propio bloqueo vencido o un backend compartido (ej. una tabla central o un
 * WebSocket) reemplace este almacenamiento local (ver hallazgo de
 * auditoría). Mientras no exista ese backend, el polling + este canal sólo
 * cubren el caso de un único kiosko con varias pestañas/ventanas abiertas.
 */

const STORAGE_KEY = 'kiosko:mesaLocks'
const DURACION_BLOQUEO_MS = 30 * 60 * 1000 // 30 minutos
/** Nombre del canal usado para notificar cambios entre pestañas/ventanas del mismo dispositivo. */
const CANAL_NOMBRE = 'kiosko:mesaLocks:canal'

type MapaBloqueos = Record<string, number>

/**
 * `BroadcastChannel` no está disponible en todos los entornos (ej. algunos
 * WebViews antiguos); se crea de forma perezosa y se tolera su ausencia —
 * en ese caso la sincronización entre pestañas queda sólo a cargo del
 * evento `storage` (ver `suscribirCambiosMesaLocks`), que sí es más
 * ampliamente soportado.
 */
function crearCanal(): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CANAL_NOMBRE) : null
  } catch {
    return null
  }
}

const canal = crearCanal()

/** Notifica a otras pestañas/ventanas de este mismo dispositivo que el mapa de bloqueos cambió. */
function notificarCambio(): void {
  try {
    canal?.postMessage({ tipo: 'cambio' })
  } catch {
    // Canal cerrado o no disponible: no es crítico, el evento `storage`
    // sigue funcionando como respaldo para otras pestañas.
  }
}

function leerBloqueos(): MapaBloqueos {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as MapaBloqueos
  } catch {
    return {}
  }
}

function guardarBloqueos(bloqueos: MapaBloqueos): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bloqueos))
  } catch {
    // localStorage no disponible (modo privado, cuota llena, etc.): se
    // ignora, el bloqueo simplemente no persiste en ese caso.
  }
}

/** Quita del mapa las entradas ya vencidas y persiste el resultado limpio. */
function limpiarVencidos(bloqueos: MapaBloqueos): MapaBloqueos {
  const ahora = Date.now()
  const limpio: MapaBloqueos = {}
  let huboVencidos = false
  for (const [mesaId, expiraEn] of Object.entries(bloqueos)) {
    if (expiraEn > ahora) {
      limpio[mesaId] = expiraEn
    } else {
      huboVencidos = true
    }
  }
  if (huboVencidos) guardarBloqueos(limpio)
  return limpio
}

/** Bloquea un identificador de mesa por 30 minutos a partir de ahora. */
export function bloquearMesa(mesaId: string): void {
  if (!mesaId) return
  const bloqueos = limpiarVencidos(leerBloqueos())
  bloqueos[mesaId] = Date.now() + DURACION_BLOQUEO_MS
  guardarBloqueos(bloqueos)
  notificarCambio()
}

/** Conjunto de identificadores de mesa actualmente bloqueados (vigentes). */
export function mesasBloqueadas(): Set<string> {
  return new Set(Object.keys(limpiarVencidos(leerBloqueos())))
}

/**
 * Libera un identificador de mesa de inmediato, sin esperar a que expiren
 * los 30 minutos de bloqueo (ver `bloquearMesa`). Usado cuando se cancela
 * una orden desde `PaymentScreen` ("Cancelar Orden"), para que ese
 * identificador quede disponible enseguida para otra mesa.
 */
export function liberarMesa(mesaId: string): void {
  if (!mesaId) return
  const bloqueos = limpiarVencidos(leerBloqueos())
  if (!(mesaId in bloqueos)) return
  delete bloqueos[mesaId]
  guardarBloqueos(bloqueos)
  notificarCambio()
}

/**
 * Suscribe `callback` a cambios en el mapa de bloqueos originados en OTRA
 * pestaña/ventana de este mismo dispositivo (propia pestaña ya se actualiza
 * de forma síncrona al llamar `bloquearMesa`/`liberarMesa` directamente, no
 * necesita este mecanismo). Usa dos canales en paralelo, por compatibilidad:
 * - `BroadcastChannel`: notificación casi instantánea, pero no disponible en
 *   absolutamente todos los entornos.
 * - Evento nativo `storage`: se dispara en el resto de pestañas cuando
 *   cambia `localStorage[STORAGE_KEY]`; más ampliamente soportado, sirve de
 *   respaldo si `BroadcastChannel` no existe.
 *
 * No reemplaza el polling por intervalo que ya hace `MesaSetupScreen`
 * (sigue siendo necesario para reflejar la expiración por tiempo de los 30
 * minutos, que no dispara ningún evento); esto sólo acelera la reacción a
 * cambios explícitos (bloquear/liberar) mientras tanto.
 *
 * Devuelve una función para des-suscribirse (llamar en el cleanup del
 * `useEffect` del componente).
 */
export function suscribirCambiosMesaLocks(callback: () => void): () => void {
  const manejarMensajeCanal = () => callback()
  const manejarEventoStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) callback()
  }

  canal?.addEventListener('message', manejarMensajeCanal)
  window.addEventListener('storage', manejarEventoStorage)

  return () => {
    canal?.removeEventListener('message', manejarMensajeCanal)
    window.removeEventListener('storage', manejarEventoStorage)
  }
}

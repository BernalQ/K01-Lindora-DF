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
 */

const STORAGE_KEY = 'kiosko:mesaLocks'
const DURACION_BLOQUEO_MS = 30 * 60 * 1000 // 30 minutos

type MapaBloqueos = Record<string, number>

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
}

/**
 * Bitácora liviana de eventos de sincronización entre kioskos (requerimiento
 * "Logging"): mesas ocupadas/liberadas, precio/disponibilidad actualizados,
 * ciclos de resincronización y caídas de disponibilidad del kiosko remoto.
 * Mismo patrón que `codisaLogs.ts`/`datafonoLogs.ts`/`printLogs.ts`: siempre
 * se imprime en consola (`console.log`) y además se persiste en
 * `localStorage` con un tope de entradas, para poder revisar el historial
 * reciente sin depender de que la consola del navegador haya quedado abierta
 * (ej. desde una futura pantalla de diagnóstico en `AdminScreen`).
 */

export type TipoEventoSync =
  | 'Mesa ocupada'
  | 'Mesa liberada'
  | 'Precio actualizado'
  | 'Disponibilidad actualizada'
  | 'Sincronización iniciada'
  | 'Sincronización completada'
  | 'Kiosko remoto no disponible'

export interface LogSyncEntry {
  timestamp: string
  tipo: TipoEventoSync
  detalle?: unknown
}

const CLAVE_LOCALSTORAGE = 'kiosko:syncLogs_v1'
/** Tope de entradas guardadas en `localStorage` (las más antiguas se descartan primero) — evita crecer indefinidamente en un kiosko que queda encendido por días. */
const MAX_ENTRADAS = 200

/** Registra un evento de sincronización: imprime en consola y lo agrega al historial persistido en `localStorage`. */
export function registrarEventoSync(tipo: TipoEventoSync, detalle?: unknown): void {
  const entrada: LogSyncEntry = { timestamp: new Date().toISOString(), tipo, detalle }
  console.log(`[kioskoSync:${tipo}]`, entrada.timestamp, detalle ?? '')

  try {
    const anteriores = obtenerLogsSync()
    anteriores.push(entrada)
    while (anteriores.length > MAX_ENTRADAS) anteriores.shift()
    localStorage.setItem(CLAVE_LOCALSTORAGE, JSON.stringify(anteriores))
  } catch (err) {
    // localStorage puede no estar disponible (ej. modo privado) o estar
    // lleno; un problema de bitácora nunca debe interrumpir el flujo de
    // mesas/catálogo.
    console.warn('[kioskoSync:logs] No se pudo persistir el log en localStorage:', err)
  }
}

/** Historial de eventos guardados (orden cronológico, más antiguo primero). */
export function obtenerLogsSync(): LogSyncEntry[] {
  try {
    const crudo = localStorage.getItem(CLAVE_LOCALSTORAGE)
    return crudo ? (JSON.parse(crudo) as LogSyncEntry[]) : []
  } catch {
    return []
  }
}

/** Borra el historial persistido (ej. desde una futura pantalla de diagnóstico en `AdminScreen`). */
export function limpiarLogsSync(): void {
  try {
    localStorage.removeItem(CLAVE_LOCALSTORAGE)
  } catch {
    // Ignorar: si no se puede limpiar, no hay nada más que hacer aquí.
  }
}

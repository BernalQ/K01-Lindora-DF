/**
 * Bitácora liviana de requests/responses hacia el datáfono BAC (Transaction
 * Manager — ver `services/datafono.ts`), equivalente a `registrarLogCodisa`
 * (`services/codisaLogs.ts`) pero para la integración de cobro con tarjeta.
 * Pensada para depurar transacciones fallidas después del hecho: qué se
 * envió exactamente (incluyendo `terminalId`/`invoice`) y qué contestó el
 * terminal, con marca de tiempo.
 *
 * Siempre se imprime en consola (`console.log`). Además se persiste en
 * `localStorage` (no hay acceso a filesystem real desde el navegador de un
 * kiosko) con un tope de entradas, para poder revisar el historial reciente
 * sin depender de que la consola del navegador haya quedado abierta en el
 * momento del error — ver `obtenerLogsDatafono`/`limpiarLogsDatafono` abajo.
 */

export type FaseLogDatafono = 'request' | 'response'

export interface LogDatafonoEntry {
  timestamp: string
  fase: FaseLogDatafono
  /** Incluye siempre `terminalId` y, cuando aplica (transacciones SALE), `invoice` — ver llamadas en `services/datafono.ts`. */
  detalle: unknown
}

const CLAVE_LOCALSTORAGE = 'datafono_logs_v1'
/** Tope de entradas guardadas en `localStorage` (las más antiguas se descartan primero) — evita crecer indefinidamente en un kiosko que queda encendido por días. */
const MAX_ENTRADAS = 200

/** Registra una entrada de bitácora: imprime en consola y la agrega al historial persistido en `localStorage`. */
export function registrarLogDatafono(fase: FaseLogDatafono, detalle: unknown): void {
  const entrada: LogDatafonoEntry = { timestamp: new Date().toISOString(), fase, detalle }
  console.log(`[datafono:${fase}]`, entrada.timestamp, detalle)

  try {
    const anteriores = obtenerLogsDatafono()
    anteriores.push(entrada)
    while (anteriores.length > MAX_ENTRADAS) anteriores.shift()
    localStorage.setItem(CLAVE_LOCALSTORAGE, JSON.stringify(anteriores))
  } catch (err) {
    // localStorage puede no estar disponible (ej. modo privado) o estar
    // lleno; un problema de bitácora nunca debe interrumpir el flujo de cobro.
    console.warn('[datafono:logs] No se pudo persistir el log en localStorage:', err)
  }
}

/** Historial de entradas guardadas (orden cronológico, más antigua primero). */
export function obtenerLogsDatafono(): LogDatafonoEntry[] {
  try {
    const crudo = localStorage.getItem(CLAVE_LOCALSTORAGE)
    return crudo ? (JSON.parse(crudo) as LogDatafonoEntry[]) : []
  } catch {
    return []
  }
}

/** Borra el historial persistido (ej. desde una futura pantalla de diagnóstico en `AdminScreen`). */
export function limpiarLogsDatafono(): void {
  try {
    localStorage.removeItem(CLAVE_LOCALSTORAGE)
  } catch {
    // Ignorar: si no se puede limpiar, no hay nada más que hacer aquí.
  }
}

import type { PrinterId } from './tickets'

/**
 * Bitácora liviana de intentos de impresión hacia Backend-Print (ver
 * `services/backendPrint.ts`), con el mismo mecanismo que
 * `codisaLogs.ts`/`datafonoLogs.ts`: siempre se imprime en consola y además
 * se persiste en `localStorage` con un tope de entradas, para revisar el
 * historial reciente sin depender de la consola del navegador.
 *
 * Se registra CUALQUIER resultado de `enviarTicket`, incluyendo los
 * `simulado: true` (Backend-Print no estaba corriendo y se "simuló" el
 * envío) — antes esos casos sólo quedaban en un `console.log` suelto, sin
 * forma de ver después cuántas veces/cuándo estuvo caído Backend-Print.
 *
 * No se reutilizan literalmente `registrarLogCodisa`/`registrarLogDatafono`
 * porque su campo `operacion` está tipado a los dominios de Codisa
 * (`'cliente' | 'orden'`) y del datáfono respectivamente; mezclar ahí los
 * intentos de impresión obligaría a forzar un tipo ajeno o a relajarlo para
 * los tres dominios a la vez. Este archivo es una copia intencional del
 * mismo patrón (misma forma de entrada, mismo tope, mismo manejo de
 * errores), para impresión.
 */

export type FaseLogImpresion = 'request' | 'response'

export interface LogImpresionEntry {
  timestamp: string
  printer: PrinterId
  fase: FaseLogImpresion
  detalle: unknown
}

const CLAVE_LOCALSTORAGE = 'print_logs_v1'
/** Tope de entradas guardadas en `localStorage` (las más antiguas se descartan primero) — evita crecer indefinidamente en un kiosko que queda encendido por días. */
const MAX_ENTRADAS = 200

/** Registra una entrada de bitácora de impresión: imprime en consola y la agrega al historial persistido en `localStorage`. */
export function registrarLogImpresion(printer: PrinterId, fase: FaseLogImpresion, detalle: unknown): void {
  const entrada: LogImpresionEntry = { timestamp: new Date().toISOString(), printer, fase, detalle }
  console.log(`[print:${printer}:${fase}]`, entrada.timestamp, detalle)

  try {
    const anteriores = obtenerLogsImpresion()
    anteriores.push(entrada)
    while (anteriores.length > MAX_ENTRADAS) anteriores.shift()
    localStorage.setItem(CLAVE_LOCALSTORAGE, JSON.stringify(anteriores))
  } catch (err) {
    // localStorage puede no estar disponible (ej. modo privado) o estar
    // lleno; un problema de bitácora nunca debe interrumpir el flujo de
    // impresión/pago.
    console.warn('[print:logs] No se pudo persistir el log en localStorage:', err)
  }
}

/** Historial de entradas guardadas (orden cronológico, más antigua primero). */
export function obtenerLogsImpresion(): LogImpresionEntry[] {
  try {
    const crudo = localStorage.getItem(CLAVE_LOCALSTORAGE)
    return crudo ? (JSON.parse(crudo) as LogImpresionEntry[]) : []
  } catch {
    return []
  }
}

/** Borra el historial persistido (ej. desde una futura pantalla de diagnóstico en `AdminScreen`). */
export function limpiarLogsImpresion(): void {
  try {
    localStorage.removeItem(CLAVE_LOCALSTORAGE)
  } catch {
    // Ignorar: si no se puede limpiar, no hay nada más que hacer aquí.
  }
}

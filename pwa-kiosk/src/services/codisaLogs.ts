/**
 * Bitácora liviana de requests/responses hacia Codisa (`df_api.php`,
 * búsqueda de cliente y envío de pedido — ver `services/wsdf.ts`), pensada
 * para depurar cuando Codisa devuelve un error: qué se envió exactamente y
 * qué contestó, con marca de tiempo.
 *
 * Siempre se imprime en consola (`console.log`). Además se persiste en
 * `localStorage` (no hay acceso a filesystem real desde el navegador de un
 * kiosko) con un tope de entradas, para poder revisar el historial reciente
 * sin depender de que la consola del navegador haya quedado abierta en el
 * momento del error — ver `obtenerLogsCodisa`/`limpiarLogsCodisa` abajo.
 */

export type FaseLogCodisa = 'request' | 'response'
export type OperacionLogCodisa = 'cliente' | 'orden'

export interface LogCodisaEntry {
  timestamp: string
  operacion: OperacionLogCodisa
  fase: FaseLogCodisa
  detalle: unknown
}

const CLAVE_LOCALSTORAGE = 'codisa_logs_v1'
/** Tope de entradas guardadas en `localStorage` (las más antiguas se descartan primero) — evita crecer indefinidamente en un kiosko que queda encendido por días. */
const MAX_ENTRADAS = 200

/** Registra una entrada de bitácora: imprime en consola y la agrega al historial persistido en `localStorage`. */
export function registrarLogCodisa(operacion: OperacionLogCodisa, fase: FaseLogCodisa, detalle: unknown): void {
  const entrada: LogCodisaEntry = { timestamp: new Date().toISOString(), operacion, fase, detalle }
  console.log(`[codisa:${operacion}:${fase}]`, entrada.timestamp, detalle)

  try {
    const anteriores = obtenerLogsCodisa()
    anteriores.push(entrada)
    while (anteriores.length > MAX_ENTRADAS) anteriores.shift()
    localStorage.setItem(CLAVE_LOCALSTORAGE, JSON.stringify(anteriores))
  } catch (err) {
    // localStorage puede no estar disponible (ej. modo privado) o estar
    // lleno; un problema de bitácora nunca debe interrumpir el flujo de
    // pago/factura.
    console.warn('[codisa:logs] No se pudo persistir el log en localStorage:', err)
  }
}

/** Historial de entradas guardadas (orden cronológico, más antigua primero). */
export function obtenerLogsCodisa(): LogCodisaEntry[] {
  try {
    const crudo = localStorage.getItem(CLAVE_LOCALSTORAGE)
    return crudo ? (JSON.parse(crudo) as LogCodisaEntry[]) : []
  } catch {
    return []
  }
}

/** Borra el historial persistido (ej. desde una futura pantalla de diagnóstico en `AdminScreen`). */
export function limpiarLogsCodisa(): void {
  try {
    localStorage.removeItem(CLAVE_LOCALSTORAGE)
  } catch {
    // Ignorar: si no se puede limpiar, no hay nada más que hacer aquí.
  }
}

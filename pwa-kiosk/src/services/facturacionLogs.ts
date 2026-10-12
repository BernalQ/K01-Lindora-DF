/**
 * Bitácora liviana de requests/responses hacia el print-bridge local
 * (`services/facturacion.ts`: clientes del Excel, factura electrónica,
 * venta simple), equivalente a `registrarLogDatafono`
 * (`services/datafonoLogs.ts`) y `registrarLogCodisa` (`services/codisaLogs.ts`)
 * pero para esta integración — antes `facturacion.ts` era la única
 * integración crítica sin bitácora persistida, sólo `console.log`/
 * `console.error` sueltos que se perdían al recargar la página (ver
 * hallazgo de auditoría).
 *
 * Siempre se imprime en consola (`console.log`). Además se persiste en
 * `localStorage` (no hay acceso a filesystem real desde el navegador de un
 * kiosko) con un tope de entradas, para poder revisar el historial reciente
 * sin depender de que la consola del navegador haya quedado abierta en el
 * momento del error — ver `obtenerLogsFacturacion`/`limpiarLogsFacturacion` abajo.
 */

export type FaseLogFacturacion = 'request' | 'response'

export interface LogFacturacionEntry {
  timestamp: string
  fase: FaseLogFacturacion
  /** Incluye siempre `operacion` (`buscarCliente`/`guardarCliente`/`generarFactura`/`registrarVentaSimple`) — ver llamadas en `services/facturacion.ts`. */
  detalle: unknown
}

const CLAVE_LOCALSTORAGE = 'facturacion_logs_v1'
/** Tope de entradas guardadas en `localStorage` (las más antiguas se descartan primero) — evita crecer indefinidamente en un kiosko que queda encendido por días. */
const MAX_ENTRADAS = 200

/** Registra una entrada de bitácora: imprime en consola y la agrega al historial persistido en `localStorage`. */
export function registrarLogFacturacion(fase: FaseLogFacturacion, detalle: unknown): void {
  const entrada: LogFacturacionEntry = { timestamp: new Date().toISOString(), fase, detalle }
  console.log(`[facturacion:${fase}]`, entrada.timestamp, detalle)

  try {
    const anteriores = obtenerLogsFacturacion()
    anteriores.push(entrada)
    while (anteriores.length > MAX_ENTRADAS) anteriores.shift()
    localStorage.setItem(CLAVE_LOCALSTORAGE, JSON.stringify(anteriores))
  } catch (err) {
    // localStorage puede no estar disponible (ej. modo privado) o estar
    // lleno; un problema de bitácora nunca debe interrumpir el flujo de
    // facturación/cliente.
    console.warn('[facturacion:logs] No se pudo persistir el log en localStorage:', err)
  }
}

/** Historial de entradas guardadas (orden cronológico, más antigua primero). */
export function obtenerLogsFacturacion(): LogFacturacionEntry[] {
  try {
    const crudo = localStorage.getItem(CLAVE_LOCALSTORAGE)
    return crudo ? (JSON.parse(crudo) as LogFacturacionEntry[]) : []
  } catch {
    return []
  }
}

/** Borra el historial persistido (ej. desde una futura pantalla de diagnóstico en `AdminScreen`). */
export function limpiarLogsFacturacion(): void {
  try {
    localStorage.removeItem(CLAVE_LOCALSTORAGE)
  } catch {
    // Ignorar: si no se puede limpiar, no hay nada más que hacer aquí.
  }
}

/**
 * Consecutivo de orden por punto de venta y mes.
 *
 * Formato: `<puntoVenta>-<año>-<mes>-<consecutivo>` (ej. "01-2026-08-00001").
 * El número de 5 dígitos se reinicia automáticamente cada mes porque se
 * guarda en localStorage bajo una clave `<puntoVenta>-<año>-<mes>`: al
 * cambiar el mes la clave es distinta y el contador simplemente empieza de
 * nuevo en 1, sin necesidad de lógica de "reinicio" explícita.
 */

/**
 * Código de punto de venta / kiosko asignado a este dispositivo. Se usa como
 * prefijo del consecutivo de cada orden y queda impreso en los tiquetes para
 * identificar en qué kiosko se generó.
 *
 * TODO: reemplazar por el código real de cada kiosko cuando haya más de un
 * dispositivo físico (ej. variable de entorno o pantalla de configuración
 * por dispositivo). Se hardcodea aquí siguiendo el mismo patrón ya usado en
 * el resto del proyecto para configuración de integraciones/dispositivo
 * (ver `WSDF_CONFIG.idTienda` en `services/wsdf.ts`), ya que el proyecto no
 * usa variables de entorno (`.env` / `import.meta.env`) en ningún otro lado
 * todavía.
 */
export const PUNTO_VENTA = '01'

const STORAGE_KEY = 'kiosko:consecutivos'

/** Último consecutivo usado, por clave `<puntoVenta>-<año>-<mes>`. */
type ConsecutivosPorPeriodo = Record<string, number>

function leerConsecutivos(): ConsecutivosPorPeriodo {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as ConsecutivosPorPeriodo) : {}
  } catch {
    // localStorage no disponible (modo privado, cuota llena, etc.): se
    // continúa sin historial, el contador arranca en 1 (mismo criterio de
    // degradación silenciosa que `mesaLocks.ts`).
    return {}
  }
}

function guardarConsecutivos(data: ConsecutivosPorPeriodo): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {
    // Ver comentario equivalente en `leerConsecutivos`.
  }
}

function claveDelPeriodo(fecha: Date): { año: string; mes: string; clave: string } {
  const año = String(fecha.getFullYear())
  const mes = String(fecha.getMonth() + 1).padStart(2, '0')
  return { año, mes, clave: `${PUNTO_VENTA}-${año}-${mes}` }
}

/**
 * Genera y persiste el siguiente consecutivo de orden para este punto de
 * venta, con formato `<puntoVenta>-<año>-<mes>-<consecutivo 5 dígitos>`.
 * Debe llamarse exactamente una vez por orden confirmada (ver
 * `PaymentScreen.tsx`, construcción de `nuevaVenta`).
 */
export function generarConsecutivo(fecha: Date = new Date()): string {
  const { año, mes, clave } = claveDelPeriodo(fecha)
  const consecutivos = leerConsecutivos()
  const siguiente = (consecutivos[clave] ?? 0) + 1
  consecutivos[clave] = siguiente
  guardarConsecutivos(consecutivos)
  return `${PUNTO_VENTA}-${año}-${mes}-${String(siguiente).padStart(5, '0')}`
}

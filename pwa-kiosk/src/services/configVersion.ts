/**
 * `configVersion`: contador de versión de la configuración de catálogo
 * (requerimiento "Versionamiento de configuración"). Sube en 1 cada vez que
 * se modifica precio, disponibilidad o configuración general en el kiosko
 * Master (K001, ver `esKioskoMaster` en `services/catalogOverrides.ts`).
 *
 * Sólo el Master incrementa este contador (ver llamadas a
 * `incrementarConfigVersion` en `services/catalogOverrides.ts`, siempre
 * gateadas por `esKioskoMaster()`): si el kiosko no-Master también subiera su
 * propio contador ante ediciones locales, cada kiosko terminaría con una
 * numeración independiente y sin relación con la del otro, lo que invalida
 * la comparación "si la versión remota es más reciente" del requerimiento
 * "Resincronización automática" (ver `services/kioskoSync.ts`). El kiosko
 * no-Master en cambio ADOPTA el número recibido del Master vía
 * `fijarConfigVersion`, nunca lo calcula por su cuenta.
 *
 * Persistido en `localStorage` (mismo patrón que el resto de este módulo de
 * sincronización) para que sobreviva a un refresh/reinicio del kiosko.
 */

const STORAGE_KEY = 'kiosko:configVersion'
/** Valor inicial antes de la primera modificación (ver ejemplo del requerimiento: 101, 102, 103, 104...). */
const VERSION_BASE = 100

/** Versión de configuración actual de ESTE kiosko. */
export function obtenerConfigVersion(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null) return VERSION_BASE
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : VERSION_BASE
  } catch {
    return VERSION_BASE
  }
}

function guardarConfigVersion(version: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(version))
  } catch {
    // localStorage no disponible (modo privado, cuota llena, etc.): se
    // ignora, el contador simplemente no persiste en ese caso.
  }
}

/** Sube la versión en 1 (una modificación de precio/disponibilidad/configuración en el Master) y devuelve el nuevo valor. */
export function incrementarConfigVersion(): number {
  const siguiente = obtenerConfigVersion() + 1
  guardarConfigVersion(siguiente)
  return siguiente
}

/** Adopta directamente un número de versión recibido del otro kiosko (ver `services/kioskoSync.ts` -> `aplicarRespuestaSyncConfig`), sin incrementar. */
export function fijarConfigVersion(version: number): void {
  guardarConfigVersion(version)
}

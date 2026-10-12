/**
 * Consecutivo global de orden, usado como `Venta.id` (ver `types/order.ts`).
 *
 * Formato: número de 9 dígitos (ej. "000000005"), que arranca en
 * "000000000" y sube de 1 en 1 en cada orden confirmada, SIN reiniciarse
 * nunca — ni por mes, ni por punto de venta, ni al reiniciar el kiosko
 * (requerimiento explícito: "el número de orden debe ser consecutivo
 * global, nunca se resetea"). Reemplaza el esquema anterior
 * (`<puntoVenta>-<año>-<mes>-<consecutivo de 5 dígitos>`, con reinicio
 * automático cada mes), que usaba una clave de localStorage distinta por
 * periodo; este usa una única clave fija (`STORAGE_KEY`), así que el
 * contador sigue subiendo sin importar cuánto tiempo pase.
 *
 * `formatInvoiceDatafono` (ver `services/datafono.ts`) sigue funcionando
 * sin cambios con este formato: al no tener guiones, cae directo en su
 * rama de respaldo (quita caracteres no numéricos — ninguno en este caso— y
 * toma los últimos 12), que ya deja pasar un string puramente numérico de 9
 * dígitos tal cual.
 */

const STORAGE_KEY = 'kiosko:consecutivo-global'

/** Cantidad fija de dígitos del consecutivo impreso/guardado (ej. "000000000"). */
const DIGITOS_CONSECUTIVO = 9

function leerUltimoConsecutivo(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const valor = raw === null ? -1 : Number(raw)
    return Number.isFinite(valor) && valor >= -1 ? valor : -1
  } catch {
    // localStorage no disponible (modo privado, cuota llena, etc.): se
    // continúa sin historial, el contador arranca en 0 en esta sesión
    // (mismo criterio de degradación silenciosa que `mesaLocks.ts`).
    return -1
  }
}

function guardarUltimoConsecutivo(valor: number): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(valor))
  } catch {
    // Ver comentario equivalente en `leerUltimoConsecutivo`.
  }
}

/**
 * Genera y persiste el siguiente consecutivo global de orden: arranca en
 * "000000000" y sube de 1 en 1 en cada llamada, sin reiniciarse nunca. Debe
 * llamarse exactamente una vez por orden confirmada (ver `PaymentScreen.tsx`,
 * construcción de `nuevaVenta`), ya que cada llamada consume el número.
 */
export function generarConsecutivo(): string {
  const siguiente = leerUltimoConsecutivo() + 1
  guardarUltimoConsecutivo(siguiente)
  const consecutivo = String(siguiente).padStart(DIGITOS_CONSECUTIVO, '0')
  console.log('[consecutivo] Consecutivo generado:', consecutivo)
  return consecutivo
}

/**
 * Identificador fijo de la caja/kiosko que genera las órdenes, guardado
 * junto con cada orden (`Venta.caja`, ver `types/order.ts`) e impreso en el
 * encabezado del comprobante del cliente ("Caja: K001", ver
 * `encabezadoCliente` en `services/tickets.ts`).
 *
 * TODO: reemplazar por el código real de cada caja/kiosko cuando haya más
 * de un dispositivo físico (ej. variable de entorno o pantalla de
 * configuración por dispositivo) — mismo TODO que tenía `PUNTO_VENTA` del
 * esquema de consecutivo anterior, ya removido junto con éste.
 */
export const CAJA_ID = 'K001'

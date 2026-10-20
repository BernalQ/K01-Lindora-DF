/**
 * Consecutivo de orden POR CAJA/KIOSKO, usado como `Venta.id` (ver
 * `types/order.ts`).
 *
 * Formato: prefijo fijo de 2 dígitos que identifica la caja (ver
 * `PREFIJO_CAJA`, derivado de `CAJA_ID`) + consecutivo incremental de 10
 * dígitos propio de esa caja, para un total de 12 caracteres puramente
 * numéricos (ej. "010000000001" para la primera orden de K001). El
 * consecutivo arranca en "0000000000" y sube de 1 en 1 en cada orden
 * confirmada, SIN reiniciarse nunca — ni por mes, ni por punto de venta, ni
 * al reiniciar el kiosko (mismo criterio que el esquema anterior).
 *
 * Requerimiento vigente: "eliminar consecutivo global compartido;
 * implementar consecutivos independientes por kiosko". El esquema anterior
 * guardaba un único contador bajo una clave fija de `localStorage`
 * (`kiosko:consecutivo-global`) sin ningún dato de qué caja lo generó — si
 * alguna vez corrían dos kioskos (lo normal, ya que cada dispositivo físico
 * tiene su propio `localStorage`), cada uno arrancaba su contador en 0 de
 * forma independiente y podía producir el MISMO `Venta.id` para órdenes
 * distintas, chocando al sincronizar contra un backend central
 * (`offlineQueue.ts`, Codisa, AWS IoT — ver `services/codisa.ts` y
 * `services/awsIot.ts`). Ahora cada caja tiene:
 *   a. Su propia clave de `localStorage` (`STORAGE_KEY`, deriva de
 *      `CAJA_ID`), así que el contador de una caja nunca interfiere con el
 *      de otra aunque llegaran a compartir el mismo navegador/perfil.
 *   b. Un prefijo de 2 dígitos propio (`PREFIJO_CAJA`) embebido en el
 *      consecutivo impreso/guardado, así que aunque dos cajas lleguen
 *      casualmente al mismo número de orden interno, el `Venta.id` completo
 *      sigue siendo distinto (ej. K001 en su orden #1 = "010000000001",
 *      K002 en su orden #1 = "020000000001").
 *
 * `formatInvoiceDatafono` (ver `services/datafono.ts`) sigue funcionando sin
 * cambios con este formato: al no tener guiones, cae directo en su rama de
 * respaldo (quita caracteres no numéricos — ninguno en este caso — y toma
 * los últimos 12), y el nuevo consecutivo mide exactamente 12 dígitos, así
 * que pasa completo, sin truncarse.
 */

/**
 * Clave de `localStorage` donde `services/cajaIdDetect.ts` persiste el
 * último `CAJA_ID` detectado AUTOMÁTICAMENTE según la IP real de esta
 * máquina (ver comentario de `CAJA_ID` abajo). Exportada (no sólo usada
 * aquí) porque `cajaIdDetect.ts` necesita escribir en esta misma clave.
 */
export const STORAGE_KEY_CAJA_ID = 'kiosko:cajaId'

/**
 * Identificador fijo de la caja/kiosko que genera las órdenes, guardado
 * junto con cada orden (`Venta.caja`, ver `types/order.ts`) e impreso en el
 * encabezado del comprobante del cliente ("Caja: K001", ver
 * `encabezadoCliente` en `services/tickets.ts`). También determina el
 * prefijo embebido en el consecutivo (ver `PREFIJO_CAJA`), cuál kiosko es el
 * Master del catálogo (`esKioskoMaster` en `services/catalogOverrides.ts`) y
 * cuál IP es "la propia" vs. "la del otro kiosko" (ver
 * `services/kioskoSyncConfig.ts`).
 *
 * Se resuelve, en orden de prioridad:
 *   1. `VITE_CAJA_ID` en `.env` — override manual explícito; si el operador
 *      lo configura a mano, se respeta sin más preguntas y NUNCA se
 *      autodetecta (ver `services/cajaIdDetect.ts`).
 *   2. El último valor autodetectado y cacheado en `localStorage` (ver
 *      `STORAGE_KEY_CAJA_ID` arriba) — así, en cada recarga posterior, el
 *      valor correcto está disponible de inmediato (síncrono) sin depender
 *      de una consulta de red.
 *   3. `'K001'` por defecto, mientras `cajaIdDetect.ts` hace su primera
 *      detección en segundo plano (requerimiento: "asignar el nombre del
 *      kiosko consultando la IP address" — ver ese archivo para el cómo).
 *
 * Es decir: NO hace falta configurar nada a mano en la mayoría de los casos
 * — basta con que las dos máquinas tengan la IP que les corresponde (ver
 * `.env.example` -> `VITE_IP_KIOSKO_K001`/`VITE_IP_KIOSKO_K002`) y
 * `cajaIdDetect.ts` detecta e inyecta el `CAJA_ID` correcto solo, en el
 * primer arranque de cada máquina.
 */
function resolverCajaIdInicial(): string {
  const override = import.meta.env.VITE_CAJA_ID
  if (override) return override
  try {
    const cacheado = localStorage.getItem(STORAGE_KEY_CAJA_ID)
    if (cacheado) return cacheado
  } catch {
    // localStorage no disponible (modo privado, cuota llena, etc.): se sigue
    // con el valor por defecto, igual que el resto de este archivo.
  }
  return 'K001'
}

export const CAJA_ID = resolverCajaIdInicial()

/** Cantidad fija de dígitos del consecutivo incremental propio de cada caja (ej. "0000000001"). */
const DIGITOS_CONSECUTIVO = 10

/** Cantidad fija de dígitos del prefijo de caja (ej. "01"). */
const DIGITOS_PREFIJO = 2

/**
 * Deriva el prefijo de 2 dígitos de una caja a partir de su `CAJA_ID` (ej.
 * "K001" -> "01"): toma los dígitos del `CAJA_ID`, los interpreta como
 * número de caja módulo 100 y los rellena a 2 dígitos. Si `CAJA_ID` no trae
 * ningún dígito (dato mal configurado), cae a "00" en vez de lanzar, para no
 * bloquear la confirmación de órdenes por un problema de configuración —
 * queda registrado en consola para poder detectarlo.
 */
function derivarPrefijoCaja(cajaId: string): string {
  const match = /(\d+)/.exec(cajaId)
  if (!match) {
    console.warn('[consecutivo] CAJA_ID sin dígitos, usando prefijo "00":', cajaId)
    return '0'.repeat(DIGITOS_PREFIJO)
  }
  const numero = Number(match[1]) % 10 ** DIGITOS_PREFIJO
  return String(numero).padStart(DIGITOS_PREFIJO, '0')
}

/** Prefijo de 2 dígitos de ESTA caja, embebido al inicio de cada consecutivo generado (ver `generarConsecutivo`). */
const PREFIJO_CAJA = derivarPrefijoCaja(CAJA_ID)

/** Clave de `localStorage` del contador propio de ESTA caja (una por kiosko, ver comentario de archivo). */
const STORAGE_KEY = `kiosko:consecutivo:${CAJA_ID}`

/**
 * Clave del esquema anterior (un único contador global compartido por todas
 * las cajas). Se conserva sólo para la migración de `leerUltimoConsecutivo`:
 * el primer kiosko que arranque con este cambio siembra su nuevo contador
 * por-caja con el último valor del contador global, para que la numeración
 * visible para el negocio no "retroceda" a 0 de la nada. Nunca más se
 * escribe en esta clave a partir de este cambio.
 */
const STORAGE_KEY_GLOBAL_LEGACY = 'kiosko:consecutivo-global'

function leerUltimoConsecutivo(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw !== null) {
      const valor = Number(raw)
      return Number.isFinite(valor) && valor >= -1 ? valor : -1
    }
    // Sin historial todavía bajo la clave propia de esta caja: se intenta
    // migrar una sola vez desde el contador global anterior (ver comentario
    // de `STORAGE_KEY_GLOBAL_LEGACY`). En cuanto se guarde el primer valor
    // bajo `STORAGE_KEY` (ver `guardarUltimoConsecutivo`), esta rama deja de
    // usarse para esta caja.
    const legacyRaw = localStorage.getItem(STORAGE_KEY_GLOBAL_LEGACY)
    const legacyValor = legacyRaw === null ? -1 : Number(legacyRaw)
    return Number.isFinite(legacyValor) && legacyValor >= -1 ? legacyValor : -1
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
 * Genera y persiste el siguiente consecutivo de ESTA caja/kiosko: el
 * contador propio de la caja arranca en "0000000000" y sube de 1 en 1 en
 * cada llamada, sin reiniciarse nunca, y se devuelve ya con el prefijo de
 * caja embebido (ej. "010000000001" para la primera orden de K001). Debe
 * llamarse exactamente una vez por orden confirmada (ver `PaymentScreen.tsx`,
 * construcción de `nuevaVenta`), ya que cada llamada consume el número.
 */
export function generarConsecutivo(): string {
  const siguiente = leerUltimoConsecutivo() + 1
  guardarUltimoConsecutivo(siguiente)
  const consecutivo = `${PREFIJO_CAJA}${String(siguiente).padStart(DIGITOS_CONSECUTIVO, '0')}`
  console.log('[consecutivo] Consecutivo generado:', consecutivo, '| caja:', CAJA_ID)
  return consecutivo
}

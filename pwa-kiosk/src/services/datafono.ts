import { RED_CONFIG } from './redConfig'
import { registrarLogDatafono } from './datafonoLogs'
import type {
  CategoriaResultadoDatafono,
  RespuestaDatafonoBody,
  ResultadoDatafono,
  TransaccionDatafono,
} from '../types/datafono'

/**
 * Cliente del datáfono BAC (Transaction Manager), integración real de cobro
 * con tarjeta — reemplaza la simulación con `setTimeout` que antes tenía
 * `PaymentScreen.handleCobrar`.
 *
 * Transaction Manager corre en el mismo gateway de red del kiosko
 * (`RED_CONFIG.ipGateway`, ver `services/redConfig.ts`), puerto 2493, y
 * expone un único endpoint HTTP (sin ruta) que recibe un POST con el JSON de
 * la transacción (ver `TransaccionDatafono` en `types/datafono.ts`) y
 * responde con el resultado de esa misma operación — no hay polling ni
 * webhook, la respuesta del POST ya es el resultado final.
 *
 * Importante — ES PLANO (http), no https: a diferencia de `WSDF_CONFIG`
 * (Codisa, sí usa https sobre el mismo gateway, ver `services/wsdf.ts`),
 * Transaction Manager expone un socket HTTP plano local en la red interna
 * del kiosko; no hay certificado involucrado.
 */
export const DATAFONO_CONFIG = {
  /** ID fijo del terminal físico conectado a este kiosko (único terminal por ahora). */
  terminalId: 'EMVUFID1',
  endpoint: `http://${RED_CONFIG.ipGateway}:2493`,
}

/**
 * Terminales con una transacción actualmente en vuelo (esperando respuesta
 * del datáfono). Transaction Manager documenta una regla dura: NO se debe
 * enviar una segunda transacción al mismo terminal mientras la anterior no
 * haya respondido (el terminal físico sólo puede procesar una operación a la
 * vez). Esto es una salvaguarda a nivel de servicio, independiente de que la
 * UI (`PaymentScreen`) ya deshabilite el botón de cobro mientras
 * `estado === 'procesando'` — si por lo que sea se llama dos veces (ej. doble
 * tap, o un VOID disparado mientras un SALE sigue en curso), la segunda
 * llamada se rechaza aquí mismo, sin llegar a mandar la petición HTTP.
 */
const terminalesConTransaccionActiva = new Set<string>()

/**
 * Tiempo máximo de espera por una respuesta del datáfono antes de abortar la
 * petición (`AbortController`). Transaction Manager no documenta un timeout
 * propio y, al ser HTTP plano sobre la red interna del kiosko, un terminal
 * trabado o desconectado podía dejar la UI esperando indefinidamente (ver
 * hallazgo de auditoría). 35s da margen de sobra para que el cliente
 * inserte/pase la tarjeta físicamente sin disparar un falso timeout.
 */
const TIMEOUT_MS = 35_000

/** Mensajes fijos para códigos HTTP documentados por Transaction Manager, usados cuando la respuesta no es 200 (así que no hay `responseCode` que interpretar). */
const DESCRIPCION_HTTP: Record<number, string> = {
  400: 'Solicitud inválida: error de sintaxis en el JSON enviado al datáfono.',
  404: 'Endpoint del datáfono incorrecto (Transaction Manager no respondió en esa ruta).',
  429: 'Ya hay una transacción concurrente en este terminal. Espere a que finalice.',
  500: 'Error interno del datáfono (Transaction Manager).',
  503: 'Servicio del datáfono no disponible en este momento.',
}

/** Mensajes fijos por `responseCode`, usados sólo como respaldo cuando el terminal no manda su propio `responseCodeDescription`. */
const DESCRIPCION_RESPONSE_CODE: Record<string, string> = {
  '00': 'Transacción aprobada.',
  '05': 'Transacción denegada por el banco emisor.',
  '13': 'Monto inválido.',
  '14': 'Tarjeta inválida.',
  '96': 'Error en el sistema del datáfono.',
}

/**
 * Clasifica un `responseCode` del cuerpo de respuesta (HTTP 200) en la
 * categoría que consume la UI, junto con el mensaje y si corresponde
 * ofrecer "Intentar de nuevo" — siguiendo exactamente el mapeo acordado:
 * 00 aprobada, 05 denegada (sin reintentar — fue el banco quien la rechazó,
 * reintentar con la misma tarjeta no cambia el resultado), 13/14 inválida
 * (sí reintentar — el cliente puede corregir el monto o probar otra
 * tarjeta), 96 error de sistema (sí reintentar — puede ser transitorio),
 * cualquier otro código → rechazo genérico (sí reintentar, por defecto).
 */
function interpretarResponseCode(body: RespuestaDatafonoBody): ResultadoDatafono {
  const codigo = body.responseCode
  const comun = {
    responseCode: codigo,
    authorizationNumber: body.authorizationNumber,
    referenceNumber: body.referenceNumber,
  }

  const porCodigo: Record<string, { categoria: CategoriaResultadoDatafono; permiteReintentar: boolean }> = {
    '00': { categoria: 'aprobada', permiteReintentar: false },
    '05': { categoria: 'denegada', permiteReintentar: false },
    '13': { categoria: 'invalida', permiteReintentar: true },
    '14': { categoria: 'invalida', permiteReintentar: true },
    '96': { categoria: 'error-sistema', permiteReintentar: true },
  }

  const resuelto = porCodigo[codigo] ?? { categoria: 'rechazo-generico' as const, permiteReintentar: true }

  // En `rechazo-generico` el código NO está en nuestro mapeo conocido (00/05/
  // 13/14/96) — se anexa el código crudo entre paréntesis incluso cuando el
  // propio terminal manda su `responseCodeDescription` (ej. "Parámetros
  // inválidos en el request"), porque esa descripción por sí sola no le dice
  // al operador/soporte qué código exacto devolvió el banco/terminal para
  // poder buscarlo en la documentación de BAC (ver hallazgo de auditoría).
  // En los demás casos (código ya conocido) no hace falta, el mensaje fijo
  // ya es suficientemente específico.
  let mensaje: string
  if (body.responseCodeDescription) {
    mensaje =
      resuelto.categoria === 'rechazo-generico'
        ? `${body.responseCodeDescription} (código ${codigo || 'desconocido'})`
        : body.responseCodeDescription
  } else if (DESCRIPCION_RESPONSE_CODE[codigo]) {
    mensaje = DESCRIPCION_RESPONSE_CODE[codigo]
  } else {
    mensaje = `Transacción rechazada (código ${codigo || 'desconocido'}).`
  }

  return { ...comun, ...resuelto, mensaje }
}

/** Intenta extraer un mensaje de detalle legible del cuerpo de una respuesta HTTP de error (4xx/5xx) de Transaction Manager, para anexarlo al mensaje genérico de `DESCRIPCION_HTTP`. El formato del cuerpo en estos casos no está documentado con la misma precisión que el de un 200 (`RespuestaDatafonoBody`), así que se prueban varias claves comunes (`message`/`error`/`responseCodeDescription`/`detail`) sin asumir ninguna en particular; si no hay cuerpo, no es JSON, o ninguna clave trae texto útil, se devuelve `undefined` y el mensaje genérico queda solo. */
function extraerDetalleHttp(cuerpo: unknown): string | undefined {
  if (!cuerpo || typeof cuerpo !== 'object') return undefined
  const posible = cuerpo as Record<string, unknown>
  const candidato = posible.message ?? posible.error ?? posible.responseCodeDescription ?? posible.detail
  return typeof candidato === 'string' && candidato.trim().length > 0 ? candidato.trim() : undefined
}

/**
 * Envía una transacción al datáfono (Transaction Manager, puerto 2493) y
 * devuelve un resultado ya clasificado (`ResultadoDatafono`), listo para
 * mostrarse en `DatafonoPopup` sin que la UI tenga que conocer códigos HTTP
 * ni `responseCode` directamente.
 *
 * Orden de validación (igual al documentado por BAC):
 * 1. Regla de una transacción activa por terminal (ver
 *    `terminalesConTransaccionActiva` arriba) — se revisa antes de mandar
 *    nada por red.
 * 2. Código HTTP de la respuesta (400/404/429/500/503 → `error-http`, sin
 *    intentar leer el cuerpo como JSON de transacción).
 * 3. Si el HTTP fue 200, `responseCode` del cuerpo (ver
 *    `interpretarResponseCode`).
 */
/**
 * Formatea un monto en colones (entero, sin decimales en el dominio del
 * kiosko, ver `formatCRC` en `data/catalog.ts`) al formato que espera
 * Transaction Manager para `totalAmount`: string con exactamente 2
 * decimales (ej. 150 -> "150.00"), según el ejemplo documentado por BAC.
 *
 * Valida ANTES de formatear (`Number.isFinite(monto) && monto > 0`): un
 * carrito corrupto o un total en 0/negativo nunca debe llegar a construirse
 * como transacción y enviarse al datáfono (ver hallazgo de auditoría). Lanza
 * en ese caso — el llamador (`PaymentScreen.handleCobrar`) debe capturarlo
 * ANTES de cambiar `estado` a 'procesando' y mostrar el error en un pop-up,
 * sin llegar a invocar `enviarTransaccionDatafono`.
 */
export function formatMontoDatafono(monto: number): string {
  if (!Number.isFinite(monto) || monto <= 0) {
    throw new Error(`monto inválido (${monto}): debe ser un número finito mayor a cero`)
  }
  return monto.toFixed(2)
}

/**
 * Convierte el consecutivo legible del kiosko (`generarConsecutivo()`, ej.
 * "01-2026-10-00007", 17 caracteres con guiones — ver `services/consecutivo.ts`)
 * en un `invoice` compatible con Transaction Manager.
 *
 * Hallazgo de auditoría: antes se enviaba ese mismo string de 17 caracteres
 * tal cual como `invoice`, que es justo el campo que Transaction Manager
 * rechazaba con "Parámetros inválidos en el request" (categoría
 * `rechazo-generico`) — BAC exige un string puramente numérico de máximo 12
 * caracteres (ver ejemplo documentado "112234"), y el consecutivo del
 * kiosko usa guiones y un año de 4 dígitos porque esa legibilidad sí importa
 * en el tiquete impreso y en Codisa (no se toca `generarConsecutivo` ni su
 * uso en Codisa/tiquete, sólo se deriva de él un `invoice` corto para esta
 * llamada puntual).
 *
 * Se arma concatenando puntoVenta + año (2 dígitos) + mes + consecutivo de 5
 * dígitos, en ese orden, preservando la misma unicidad por mes/punto de
 * venta que ya tenía el consecutivo original (sólo se pierden los dos
 * dígitos de siglo del año, irrelevante en la práctica: "01" + "26" + "10" +
 * "00007" = "01261000007", 11 caracteres, siempre numérico). Como
 * `obtenerNumeroFactura()` en `PaymentScreen` cachea el consecutivo en un
 * ref y lo reutiliza en cada reintento de la MISMA orden, un reintento
 * manda el mismo `invoice` (correcto: sigue siendo la misma transacción) y
 * una orden nueva siempre produce uno distinto.
 *
 * Si el formato no calza con el esperado (ej. cambia `generarConsecutivo` a
 * futuro), se degrada a tomar sólo los dígitos del string original (sin
 * guiones) y quedarse con los últimos 12.
 */
export function formatInvoiceDatafono(numeroFacturaKiosko: string): string {
  const match = /^(\d+)-(\d{4})-(\d{2})-(\d+)$/.exec(numeroFacturaKiosko.trim())
  let invoice: string
  if (match) {
    const [, puntoVenta, año, mes, consecutivo] = match
    invoice = `${puntoVenta}${año.slice(-2)}${mes}${consecutivo}`
  } else {
    invoice = numeroFacturaKiosko.replace(/\D/g, '')
  }
  invoice = invoice.slice(-12)
  if (!invoice) {
    throw new Error(`no se pudo derivar un número de invoice válido a partir de "${numeroFacturaKiosko}"`)
  }
  return invoice
}

export async function enviarTransaccionDatafono(transaccion: TransaccionDatafono): Promise<ResultadoDatafono> {
  const { terminalId } = transaccion

  if (terminalesConTransaccionActiva.has(terminalId)) {
    return {
      categoria: 'transaccion-en-curso',
      mensaje: 'Ya hay una transacción en curso en este terminal. Espere a que finalice antes de enviar otra.',
      permiteReintentar: false,
    }
  }

  terminalesConTransaccionActiva.add(terminalId)
  try {
    registrarLogDatafono('request', transaccion)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

    let res: Response
    try {
      res = await fetch(DATAFONO_CONFIG.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(transaccion),
        signal: controller.signal,
      })
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        const mensaje = `El datáfono no respondió dentro de ${TIMEOUT_MS / 1000} segundos (tiempo de espera agotado).`
        registrarLogDatafono('response', { terminalId, invoice: (transaccion as { invoice?: string }).invoice, error: mensaje })
        return { categoria: 'tiempo-agotado', mensaje, permiteReintentar: true }
      }
      const mensaje = `No se pudo contactar al datáfono: ${(err as Error).message}`
      registrarLogDatafono('response', { terminalId, invoice: (transaccion as { invoice?: string }).invoice, error: mensaje })
      return {
        categoria: 'error-red',
        mensaje,
        permiteReintentar: true,
      }
    } finally {
      clearTimeout(timeoutId)
    }

    if (!res.ok) {
      // A diferencia del camino feliz (HTTP 200, ver más abajo), aquí antes
      // no se leía el cuerpo de la respuesta en absoluto — un 400 Bad
      // Request de Transaction Manager podía traer el detalle del campo
      // mal formado en el body, y se perdía (ver hallazgo de auditoría).
      // `res.json()` sólo puede leerse una vez, así que se intenta aquí
      // antes de descartar la respuesta; si no es JSON válido (ej. cuerpo
      // vacío o texto plano), `extraerDetalleHttp` recibe `undefined` y el
      // mensaje genérico de `DESCRIPCION_HTTP` queda solo, sin romper el flujo.
      const cuerpoError = await res.json().catch(() => undefined)
      const detalle = extraerDetalleHttp(cuerpoError)
      registrarLogDatafono('response', {
        terminalId,
        invoice: (transaccion as { invoice?: string }).invoice,
        httpStatus: res.status,
        body: cuerpoError,
      })
      const mensajeBase =
        DESCRIPCION_HTTP[res.status] ?? `El datáfono respondió con un error inesperado (HTTP ${res.status}).`
      return {
        categoria: 'error-http',
        mensaje: detalle ? `${mensajeBase} (${detalle})` : mensajeBase,
        // 400/404 son errores de la petición misma (no se arreglan reintentando
        // igual); 429/500/503 sí son transitorios.
        permiteReintentar: res.status !== 400 && res.status !== 404,
      }
    }

    const body: RespuestaDatafonoBody = await res.json().catch(() => ({ responseCode: '' }))
    registrarLogDatafono('response', {
      terminalId,
      invoice: (transaccion as { invoice?: string }).invoice,
      body,
    })
    return interpretarResponseCode(body)
  } finally {
    terminalesConTransaccionActiva.delete(terminalId)
  }
}

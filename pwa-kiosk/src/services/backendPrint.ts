import type { PrinterId, TicketLine } from './tickets'
import { RED_CONFIG } from './redConfig'
import { construirBufferTicket } from './escpos'
import { registrarLogImpresion } from './printLogs'

/**
 * Cliente del backend "Backend-Print": reemplaza a `printBridge.ts` (que
 * hablaba con el servicio `print-bridge`, puerto 4000, contrato
 * `{ printer, lines }`, con resolución de IP y formato ESC/POS hechos del
 * lado del servidor).
 *
 * Backend-Print corre en el puerto 3001 y espera `{ printerIP, data }`: la
 * PWA ya resuelve la IP de la impresora (ver `IP_POR_IMPRESORA` abajo, tomado
 * de `redConfig.ts`) y ahora genera ella misma los bytes ESC/POS del tiquete
 * (ver `services/escpos.ts`) en vez de mandar texto plano — Backend-Print
 * recibe el ticket ya armado, listo para escribirse tal cual al socket TCP
 * de la impresora, sin tener que interpretar nada.
 *
 * Nota: `facturacion.ts` (clientes/Excel/Hacienda) y `systemBridge.ts`
 * (salir de modo kiosko) siguen hablando con el `print-bridge` original en
 * el puerto 4000 — ese servicio no es sólo para impresoras térmicas, así
 * que este reemplazo es específico del envío de tiquetes, no de todo
 * `print-bridge`.
 */

const BACKEND_PRINT_URL = 'http://localhost:3001/print'

/** IP guardada por impresora, tomada de la config de red del kiosko (`redConfig.ts`). */
const IP_POR_IMPRESORA: Record<PrinterId, string> = {
  cliente: RED_CONFIG.impresoras.cliente,
  carniceria: RED_CONFIG.impresoras.carniceria,
  // El id interno es "restaurante" (ver PrinterId en tickets.ts); en
  // RED_CONFIG la misma impresora se llama "parrilla".
  restaurante: RED_CONFIG.impresoras.parrilla,
}

/**
 * Forma en que Node.js serializa un `Buffer` a JSON (`JSON.stringify(buf)`
 * produce exactamente `{ type: 'Buffer', data: [...] }`). Backend-Print
 * espera ese mismo formato para los bytes ESC/POS, así que se construye a
 * mano aquí (la PWA corre en el navegador, donde no existe la clase `Buffer`
 * de Node) a partir del `Uint8Array` que arma `construirBufferTicket`.
 */
export interface BufferEscPosJson {
  type: 'Buffer'
  data: number[]
}

function aBufferJson(bytes: Uint8Array): BufferEscPosJson {
  return { type: 'Buffer', data: Array.from(bytes) }
}

type DatoImpresion = string | BufferEscPosJson

type ResultadoCrudo =
  | { estado: 'ok' }
  | { estado: 'error-backend'; mensaje: string }
  | { estado: 'error-red'; mensaje: string }
  | { estado: 'tiempo-agotado'; mensaje: string }

/** Tiempo máximo de espera por una respuesta de Backend-Print antes de abortar la petición y reportar `'tiempo-agotado'` (ver `enviarTicket`) — evita que `handleOtraOrdenNo`/el cierre de mesa en `PaymentScreen.tsx` quede colgado indefinidamente si Backend-Print acepta la conexión pero nunca responde. */
const TIMEOUT_MS = 35_000

/** Única llamada fetch real hacia Backend-Print; `sendPrint` y `enviarTicket` la envuelven con distinta forma de retorno. */
async function postPrint(printerIP: string, data: DatoImpresion): Promise<ResultadoCrudo> {
  const controller = new AbortController()
  const idTimeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(BACKEND_PRINT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ printerIP, data }),
      signal: controller.signal,
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      return { estado: 'tiempo-agotado', mensaje: `Backend-Print no respondió en ${TIMEOUT_MS / 1000}s` }
    }
    return { estado: 'error-red', mensaje: (err as Error).message }
  } finally {
    clearTimeout(idTimeout)
  }

  if (!res.ok) {
    const cuerpo: { error?: string; mensaje?: string } = await res.json().catch(() => ({}))
    return { estado: 'error-backend', mensaje: cuerpo.error ?? cuerpo.mensaje ?? `Error HTTP ${res.status}` }
  }

  return { estado: 'ok' }
}

export interface RespuestaBackendPrint {
  ok: boolean
  /** "Ticket enviado" en éxito, o el mensaje de error del backend/red en fallo. */
  mensaje: string
}

/**
 * Envía una orden de impresión al backend "Backend-Print".
 *
 * - POST http://localhost:3001/print
 * - body: { printerIP, data } — `data` puede ser texto plano o el objeto
 *   `{ type: 'Buffer', data: number[] }` con bytes ESC/POS (ver
 *   `BufferEscPosJson` arriba; `enviarTicket` siempre manda esta segunda
 *   forma para los tickets del kiosko).
 * - éxito: { ok: true, mensaje: 'Ticket enviado' }
 * - fallo (HTTP del backend o red): { ok: false, mensaje: <error> }
 */
export async function sendPrint(printerIP: string, data: DatoImpresion): Promise<RespuestaBackendPrint> {
  const resultado = await postPrint(printerIP, data)

  if (resultado.estado === 'ok') {
    console.log(`[Backend-Print] Ticket enviado a ${printerIP}`)
    return { ok: true, mensaje: 'Ticket enviado' }
  }

  console.error(`[Backend-Print] Error al imprimir en ${printerIP}: ${resultado.mensaje}`)
  return { ok: false, mensaje: resultado.mensaje }
}

export interface ResultadoImpresion {
  printer: PrinterId
  ok: boolean
  simulado: boolean
  error?: string
}

/**
 * Reemplazo directo de `enviarTicket` (antes en `printBridge.ts`): misma
 * firma y mismo contrato de retorno (`ResultadoImpresion`), para que
 * `AdminScreen.tsx` / `PaymentScreen.tsx` sólo necesiten cambiar el import.
 * Internamente ahora:
 * 1. Construye el buffer ESC/POS real del tiquete (`construirBufferTicket`,
 *    ver `services/escpos.ts`) — con el logo de Don Fernando embebido como
 *    imagen (comando `GS v 0`) en vez del texto "Logo Resta", únicamente
 *    para la estación "cliente" (comprobante del comensal).
 * 2. Resuelve la IP guardada de esa impresora y llama a Backend-Print con
 *    `data: { type: 'Buffer', data: [...] }` (ver `BufferEscPosJson`).
 *
 * Mantiene la misma distinción de fallos que tenía `printBridge.ts`:
 * 1. Backend-Print mismo no está corriendo/alcanzable (`fetch` lanza —
 *    típico en desarrollo sin el servicio levantado): se simula el envío en
 *    consola y se devuelve `ok: true, simulado: true`, para no bloquear el
 *    flujo del kiosko en ese escenario de desarrollo.
 * 2. Backend-Print SÍ respondió, pero la impresora física seleccionada no
 *    (apagada, sin red, IP mal configurada): fallo real de hardware, se
 *    devuelve `ok: false, simulado: false` con el mensaje de error, para que
 *    el panel administrativo lo muestre como error real (ver `AdminScreen.tsx`).
 * 3. Backend-Print no respondió dentro de `TIMEOUT_MS` (ver `postPrint`):
 *    tratado igual que un error real (`ok: false, simulado: false`), NO como
 *    el caso simulado de desarrollo — a diferencia de una conexión
 *    rechazada (Backend-Print apagado, detectable al instante), un timeout
 *    normalmente significa que Backend-Print sí está corriendo pero algo se
 *    colgó (impresora ocupada, cable de red con problemas intermitentes,
 *    etc.), así que no debe enmascararse como "modo desarrollo sin
 *    servicio".
 *
 * Todos los desenlaces (éxito, simulado, error real) se registran además con
 * `registrarLogImpresion` (ver `services/printLogs.ts`), incluyendo los
 * `simulado: true`, para tener visibilidad histórica de cuándo estuvo caído
 * Backend-Print — antes esos casos sólo quedaban en un `console.log` suelto.
 */
export async function enviarTicket(printer: PrinterId, lines: TicketLine[]): Promise<ResultadoImpresion> {
  const printerIP = IP_POR_IMPRESORA[printer]
  const bytesEscPos = await construirBufferTicket(lines, { incluirLogo: printer === 'cliente' })
  const data = aBufferJson(bytesEscPos)
  registrarLogImpresion(printer, 'request', { printerIP, bytes: bytesEscPos.length })
  const resultado = await postPrint(printerIP, data)

  if (resultado.estado === 'error-red') {
    console.log(
      `[MOCK] Ticket "${printer}" (Backend-Print no disponible en ${BACKEND_PRINT_URL}): ${bytesEscPos.length} bytes ESC/POS generados pero no enviados`,
    )
    registrarLogImpresion(printer, 'response', { estado: 'simulado', mensaje: resultado.mensaje })
    return { printer, ok: true, simulado: true, error: resultado.mensaje }
  }

  if (resultado.estado === 'error-backend') {
    console.error(`[Backend-Print] Error real de impresora "${printer}" (${printerIP}): ${resultado.mensaje}`)
    registrarLogImpresion(printer, 'response', { estado: 'error-backend', mensaje: resultado.mensaje })
    return { printer, ok: false, simulado: false, error: resultado.mensaje }
  }

  if (resultado.estado === 'tiempo-agotado') {
    console.error(`[Backend-Print] Tiempo agotado al imprimir en "${printer}" (${printerIP}): ${resultado.mensaje}`)
    registrarLogImpresion(printer, 'response', { estado: 'tiempo-agotado', mensaje: resultado.mensaje })
    return { printer, ok: false, simulado: false, error: resultado.mensaje }
  }

  console.log(`[Backend-Print] Ticket enviado a ${printer} (${printerIP}, ${bytesEscPos.length} bytes ESC/POS)`)
  registrarLogImpresion(printer, 'response', { estado: 'ok' })
  return { printer, ok: true, simulado: false }
}

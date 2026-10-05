import type { PrinterId, TicketLine } from './tickets'

const PRINT_BRIDGE_URL = 'http://localhost:4000'

export interface ResultadoImpresion {
  printer: PrinterId
  ok: boolean
  simulado: boolean
  error?: string
}

/**
 * Envía un ticket al print-bridge, distinguiendo dos fallos muy distintos:
 *
 * 1. El servicio print-bridge mismo no está corriendo/alcanzable (`fetch`
 *    lanza una excepción de red, ej. en desarrollo sin el bridge levantado):
 *    se simula el envío en consola y se devuelve `ok: true, simulado: true`,
 *    para no bloquear el flujo del kiosko en ese escenario de desarrollo.
 * 2. El bridge SÍ respondió, pero la impresora física seleccionada no (ej.
 *    apagada, sin red, IP mal configurada en `print-bridge/config/printers.json`
 *    — ver `print-bridge/src/routes/print.ts`, responde 502 en ese caso):
 *    esto es un fallo real de hardware, así que se devuelve `ok: false,
 *    simulado: false`, para que el panel administrativo lo muestre como
 *    error en vez de confundirlo con un simulacro de desarrollo (ver
 *    `AdminScreen.tsx`).
 */
export async function enviarTicket(printer: PrinterId, lines: TicketLine[]): Promise<ResultadoImpresion> {
  let res: Response
  try {
    res = await fetch(`${PRINT_BRIDGE_URL}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ printer, lines }),
    })
  } catch (err) {
    const texto = lines.map((linea) => (typeof linea === 'string' ? linea : linea.text)).join('\n')
    console.log(`[MOCK] Ticket "${printer}" (print-bridge no disponible):\n${texto}`)
    return { printer, ok: true, simulado: true, error: (err as Error).message }
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    const mensaje = data.error ?? `Error HTTP ${res.status}`
    console.error(`[print-bridge] Error real de impresora "${printer}": ${mensaje}`)
    return { printer, ok: false, simulado: false, error: mensaje }
  }

  return { printer, ok: true, simulado: false }
}

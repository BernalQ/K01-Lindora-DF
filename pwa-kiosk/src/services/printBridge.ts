import type { PrinterId, TicketLine } from './tickets'

const PRINT_BRIDGE_URL = 'http://localhost:4000'

export interface ResultadoImpresion {
  printer: PrinterId
  ok: boolean
  simulado: boolean
  error?: string
}

/**
 * Envía un ticket al print-bridge. Si el servicio o las impresoras físicas
 * no están disponibles (piloto sin hardware conectado aún), se simula el
 * envío en consola en vez de bloquear el flujo del kiosko.
 */
export async function enviarTicket(printer: PrinterId, lines: TicketLine[]): Promise<ResultadoImpresion> {
  try {
    const res = await fetch(`${PRINT_BRIDGE_URL}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ printer, lines }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error ?? `Error HTTP ${res.status}`)
    }
    return { printer, ok: true, simulado: false }
  } catch (err) {
    const texto = lines.map((linea) => (typeof linea === 'string' ? linea : linea.text)).join('\n')
    console.log(`[MOCK] Ticket "${printer}" (print-bridge no disponible):\n${texto}`)
    return { printer, ok: true, simulado: true, error: (err as Error).message }
  }
}

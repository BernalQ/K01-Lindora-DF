export type PrinterId = 'carniceria' | 'restaurante' | 'cliente'

/**
 * Línea de ticket: texto plano, o un objeto con estilo (`big`/`bold`) para
 * elementos que deben resaltar en la impresión térmica (ej. el nombre/ID de
 * mesa en el tiquete consolidado de mesa compartida). Mantiene compatible
 * el contrato con el frontend, que envía el mismo tipo (ver
 * pwa-kiosk/src/services/tickets.ts -> TicketLine).
 */
export type TicketLine = string | { text: string; big?: boolean; bold?: boolean }

export interface PrintRequestBody {
  printer: PrinterId
  /** Líneas del ticket (una entrada = una línea impresa). */
  lines: TicketLine[]
}

/** Cliente para facturación electrónica. La cédula es la llave primaria. */
export interface Cliente {
  cedula: string
  nombre: string
  correo: string
  telefono: string
  direccion: string
}

export interface FacturaItem {
  nombre: string
  cantidad: number
  precioUnitario: number
}

export interface FacturaRequestBody {
  mesa: string
  items: FacturaItem[]
  total: number
  cliente: Cliente
  /** Consecutivo de la orden en el kiosko (ej. "01-2026-08-00001"), ver services/consecutivo.ts en pwa-kiosk. */
  numeroFactura?: string
}

export interface VentaSimpleRequestBody {
  mesa: string
  items: FacturaItem[]
  total: number
}

export interface ResultadoFacturaHacienda {
  ok: boolean
  /**
   * Clave numérica de 50 dígitos (formato Hacienda Costa Rica). NO es una
   * clave real autorizada por Hacienda: es un placeholder generado
   * localmente para efectos de trazabilidad interna mientras no exista
   * integración real con el API de Codisa. Ver services/hacienda.ts.
   */
  clave?: string
  mensajeError?: string
}

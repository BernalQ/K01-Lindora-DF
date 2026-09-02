/** Cliente para facturación electrónica. La cédula es la llave primaria. */
export interface Cliente {
  cedula: string
  nombre: string
  correo: string
  telefono: string
  direccion: string
}

export type TipoPago = 'factura' | 'simple'

export interface FacturaItem {
  nombre: string
  cantidad: number
  precioUnitario: number
}

/** Resultado de intentar generar/enviar la factura electrónica (ver services/facturacion.ts). */
export interface ResultadoFactura {
  ok: boolean
  /**
   * Clave de referencia (formato de 50 dígitos de Hacienda). Mientras la
   * integración con Codisa sea un stub, NO es una clave válida ante
   * Hacienda, sólo un número de referencia interno consistente.
   */
  clave?: string
  pdfUrl?: string
  correoEnviado?: boolean
  mensajeError?: string
}

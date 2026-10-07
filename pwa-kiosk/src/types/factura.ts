/**
 * Cliente para facturación electrónica. La cédula es la llave primaria.
 *
 * `nombre` se mantiene como "nombre completo" (un solo string), tal como lo
 * usan hoy `CedulaScreen`/`RegistroClienteScreen`/`PaymentScreen`. Los campos
 * de abajo son específicos del pedido que se envía a Codisa (ver
 * `WsDfPedido` en `types/wsdf.ts`) y son opcionales porque sólo se conocen
 * cuando el cliente viene de la búsqueda en Codisa (`buscarClienteCodisa`,
 * ver `services/wsdf.ts`) — si no están presentes, `construirPedidoWsDf`
 * los deriva de `nombre` (partiéndolo) o usa valores por defecto.
 */
export interface Cliente {
  cedula: string
  nombre: string
  correo: string
  telefono: string
  direccion: string
  /** Primer apellido, si se conoce por separado (ver nota arriba). */
  apellido1?: string
  /** Segundo apellido, si se conoce por separado (ver nota arriba). */
  apellido2?: string
  /** 'F' persona física, 'J' persona jurídica. Por defecto 'F' (consumidor final/persona física). */
  tipoPersona?: 'F' | 'J'
  /** Código Hacienda/Codisa del tipo de identificación (ej. "1" = cédula física). */
  tipoIdentificacion?: string
  genero?: 'M' | 'F' | ''
  estadoCivil?: string
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

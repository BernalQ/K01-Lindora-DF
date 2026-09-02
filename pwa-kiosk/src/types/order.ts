import type { GuarnicionSeleccionada, TerminoCoccion } from './catalog'
import type { Cliente, TipoPago } from './factura'

export interface OrderItem {
  productId: string
  name: string
  /**
   * Nombre canónico en español, usado siempre para imprimir tickets
   * (carnicería, restaurante y cliente), sin importar el idioma de la
   * interfaz. Si no está definido, se usa `name` como respaldo.
   */
  nameEs?: string
  price: number
  quantity: number
  termino?: TerminoCoccion
  /** Términos de cocción por comensal, para platos compartidos (ver CartLine.terminos). */
  terminos?: TerminoCoccion[]
  guarniciones?: GuarnicionSeleccionada[]
  variante?: string
  corte?: string
  /** Ingredientes excluidos (ej. "Sin Tomate"), ver CartLine.extras. */
  extras?: string[]
  /** Opción única elegida (ej. "Con mantequilla"), ver CartLine.opcion. */
  opcion?: string
}

export interface Venta {
  /**
   * Identificador interno de la orden dentro del PWA: el consecutivo
   * generado al confirmar la orden, con formato
   * `<puntoVenta>-<año>-<mes>-<consecutivo>` (ej. "01-2026-08-00001"), ver
   * `services/consecutivo.ts`. Se usa como clave primaria en la cola offline
   * (`offlineQueue.ts`) y se imprime en la parte superior de los tiquetes.
   */
  id: string
  items: OrderItem[]
  mesa: string
  total: number
  fechaHora: string
  /** 'factura': se generó factura electrónica. 'simple': sólo comprobante interno. */
  tipoPago?: TipoPago
  cliente?: Cliente
  /** Clave de referencia devuelta por la factura electrónica (ver types/factura.ts). */
  claveFactura?: string
}

export type EstadoVenta = 'pendiente' | 'impreso' | 'sincronizado' | 'error'

export interface VentaEnCola {
  id: string
  venta: Venta
  estado: EstadoVenta
  intentos: number
  creadaEn: string
}

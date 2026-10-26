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
   * Identificador interno de la orden dentro del PWA: el consecutivo propio
   * de la caja/kiosko que confirmó la orden, generado con
   * `services/consecutivo.ts` -> `generarConsecutivo()`. Número de 10
   * dígitos puramente numérico: 2 dígitos de prefijo de caja + 8 dígitos de
   * consecutivo incremental (ej. "0100000005" para la quinta orden de
   * K001), que arranca en "00000000" y nunca se reinicia. NO es un
   * consecutivo global compartido entre cajas — cada caja lleva su propio
   * contador y su propio prefijo, así que dos cajas nunca producen el mismo
   * `id` (ver comentario de archivo en `consecutivo.ts`). Se usa como clave
   * primaria en la cola offline (`offlineQueue.ts`) y se imprime en la parte
   * superior de los tiquetes (encabezado "Factura de caja <id>" del
   * comprobante del cliente, ver `tickets.ts` -> `encabezadoCliente`).
   */
  id: string
  /**
   * Identificador de la caja/kiosko que generó la orden (ver `CAJA_ID` en
   * `services/consecutivo.ts`, ej. "K001"). Se imprime en el encabezado del
   * comprobante del cliente ("Caja: K001", ver `encabezadoCliente` en
   * `services/tickets.ts`). Opcional para no romper ventas ya guardadas en
   * la cola offline antes de este requerimiento, que no tienen este campo.
   */
  caja?: string
  items: OrderItem[]
  mesa: string
  total: number
  fechaHora: string
  /** 'factura': se generó factura electrónica. 'simple': sólo comprobante interno. */
  tipoPago?: TipoPago
  cliente?: Cliente
  /** Clave de referencia devuelta por la factura electrónica (ver types/factura.ts). */
  claveFactura?: string
  /**
   * `authorizationNumber`/`referenceNumber` devueltos por el Transaction
   * Manager del BAC en una transacción SALE aprobada (ver
   * `ResultadoDatafono` en types/datafono.ts). Sólo presentes cuando el pago
   * se cobró con datáfono (único método de este kiosko); se capturan en
   * `PaymentScreen.tsx` justo antes de cerrarse el pop-up de resultado, y se
   * muestran en el panel de órdenes del día del admin (`AdminScreen.tsx`)
   * para poder conciliar una venta contra su comprobante físico del
   * datáfono.
   */
  autorizacionDatafono?: string
  referenciaDatafono?: string
}

export type EstadoVenta = 'pendiente' | 'impreso' | 'sincronizado' | 'error'

export interface VentaEnCola {
  id: string
  venta: Venta
  estado: EstadoVenta
  intentos: number
  creadaEn: string
}

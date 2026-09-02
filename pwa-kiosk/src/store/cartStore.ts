import { create } from 'zustand'
import { productDisplayName } from '../data/catalog'
import type { GuarnicionSeleccionada, Language, Product, TerminoCoccion } from '../types/catalog'
import type { Cliente, ResultadoFactura, TipoPago } from '../types/factura'

export interface CartLine {
  id: string
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
  /**
   * Términos de cocción por comensal, para platos compartidos con más de un
   * término (ej. Parrillada Mixta para 2). Cuando está presente, sustituye a
   * `termino` para efectos de mostrar/imprimir la personalización, y el
   * plato se mantiene como una sola línea (no una línea por comensal).
   */
  terminos?: TerminoCoccion[]
  /** Guarniciones incluidas elegidas (con su opción de personalización, si aplica). Ver `GuarnicionSeleccionada`. */
  guarniciones?: GuarnicionSeleccionada[]
  variante?: string
  corte?: string
  /** Ingredientes excluidos (ej. "Sin Tomate"), seleccionados junto con el término de cocción. */
  extras?: string[]
  /** Opción única elegida (ej. "Con mantequilla"), ver Product.opcionUnica. */
  opcion?: string
}

interface CartState {
  lines: CartLine[]
  mesa: string
  /**
   * Tipo de pago elegido en la pantalla de pago: 'factura' (con factura
   * electrónica) o 'simple' (comprobante interno, sin factura). `null`
   * mientras el cliente no ha elegido ninguna de las dos opciones.
   */
  tipoPago: TipoPago | null
  /** Cliente identificado/registrado para la factura electrónica (flujo 'factura'). */
  cliente: Cliente | null
  /** Resultado de la última llamada a generarFactura() (éxito, error, clave, PDF). */
  facturaResultado: ResultadoFactura | null
  setMesa: (mesa: string) => void
  setTipoPago: (tipoPago: TipoPago | null) => void
  setCliente: (cliente: Cliente | null) => void
  setFacturaResultado: (resultado: ResultadoFactura | null) => void
  addSimpleItem: (product: Product, language?: Language) => void
  addCustomLine: (line: Omit<CartLine, 'quantity'> & { quantity?: number }) => void
  incrementLine: (lineId: string) => void
  decrementLine: (lineId: string) => void
  removeLine: (lineId: string) => void
  clear: () => void
}

/**
 * Firma de personalización de una línea (producto + variante + término(s) +
 * guarniciones + corte), usada para detectar líneas "iguales" y agruparlas
 * en una sola con la cantidad ajustada, en vez de crear una línea nueva cada
 * vez que se agrega el mismo producto con exactamente la misma
 * personalización. Las guarniciones se ordenan antes de comparar porque el
 * orden de selección no debe importar para considerarlas "la misma" combinación.
 */
function personalizacionKey(
  line: Pick<
    CartLine,
    'productId' | 'variante' | 'termino' | 'terminos' | 'guarniciones' | 'corte' | 'extras' | 'opcion'
  >,
): string {
  return JSON.stringify({
    productId: line.productId,
    variante: line.variante ?? null,
    termino: line.termino ?? null,
    terminos: line.terminos ?? null,
    guarniciones: line.guarniciones
      ? [...line.guarniciones].map((g) => `${g.id}|${g.opcion ?? ''}`).sort()
      : null,
    corte: line.corte ?? null,
    extras: line.extras ? [...line.extras].sort() : null,
    opcion: line.opcion ?? null,
  })
}

export const useCartStore = create<CartState>((set) => ({
  lines: [],
  mesa: '',
  tipoPago: null,
  cliente: null,
  facturaResultado: null,

  setMesa: (mesa) => set({ mesa }),
  setTipoPago: (tipoPago) => set({ tipoPago }),
  setCliente: (cliente) => set({ cliente }),
  setFacturaResultado: (facturaResultado) => set({ facturaResultado }),

  addSimpleItem: (product, language = 'es') =>
    set((state) => {
      const existing = state.lines.find((l) => l.id === product.id)
      if (existing) {
        return {
          lines: state.lines.map((l) =>
            l.id === product.id ? { ...l, quantity: l.quantity + 1 } : l,
          ),
        }
      }
      return {
        lines: [
          ...state.lines,
          {
            id: product.id,
            productId: product.id,
            name: productDisplayName(product, language),
            nameEs: product.name,
            price: product.price,
            quantity: 1,
          },
        ],
      }
    }),

  addCustomLine: (line) =>
    set((state) => {
      // Si ya existe una línea con el mismo producto y exactamente la misma
      // personalización, se agrupa en esa línea sumando la cantidad, en vez
      // de crear una línea duplicada (ver Revisión de pedido: mismo
      // nombre + misma personalización → una sola línea).
      const key = personalizacionKey(line)
      const existing = state.lines.find((l) => personalizacionKey(l) === key)
      if (existing) {
        return {
          lines: state.lines.map((l) =>
            l.id === existing.id ? { ...l, quantity: l.quantity + (line.quantity ?? 1) } : l,
          ),
        }
      }
      return {
        lines: [...state.lines, { ...line, quantity: line.quantity ?? 1 }],
      }
    }),

  incrementLine: (lineId) =>
    set((state) => ({
      lines: state.lines.map((l) => (l.id === lineId ? { ...l, quantity: l.quantity + 1 } : l)),
    })),

  decrementLine: (lineId) =>
    set((state) => {
      const line = state.lines.find((l) => l.id === lineId)
      if (!line) return state
      if (line.quantity <= 1) {
        return { lines: state.lines.filter((l) => l.id !== lineId) }
      }
      return {
        lines: state.lines.map((l) => (l.id === lineId ? { ...l, quantity: l.quantity - 1 } : l)),
      }
    }),

  removeLine: (lineId) =>
    set((state) => ({ lines: state.lines.filter((l) => l.id !== lineId) })),

  clear: () =>
    set({ lines: [], mesa: '', tipoPago: null, cliente: null, facturaResultado: null }),
}))

export function cartItemCount(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.quantity, 0)
}

export function cartTotal(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + l.price * l.quantity, 0)
}

/**
 * Texto de término(s) de cocción de una línea, listo para mostrar en la
 * interfaz. Los platos individuales devuelven un solo término traducido;
 * los platos compartidos (ej. Parrillada Mixta para 2, con un término por
 * comensal) devuelven los términos numerados por comensal en un solo texto,
 * para mantener el ítem en una sola línea con la personalización debajo.
 */
export function lineTerminosTexto(
  line: Pick<CartLine, 'termino' | 'terminos'>,
  terminoLabel: (termino: string) => string,
  comensalLabel: (n: number) => string,
): string | null {
  if (line.terminos && line.terminos.length > 0) {
    return line.terminos
      .map((termino, i) => `${comensalLabel(i + 1)}: ${terminoLabel(termino)}`)
      .join(' · ')
  }
  if (line.termino) return terminoLabel(line.termino)
  return null
}

/**
 * Texto de ingredientes excluidos de una línea (ej. "Sin Tomate, Sin
 * Queso"), listo para mostrar en la interfaz. `null` si la línea no excluyó
 * ningún ingrediente.
 */
export function lineExtrasTexto(line: Pick<CartLine, 'extras'>): string | null {
  if (!line.extras || line.extras.length === 0) return null
  return line.extras.join(', ')
}

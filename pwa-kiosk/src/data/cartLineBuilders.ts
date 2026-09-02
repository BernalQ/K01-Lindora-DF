import { productDisplayName } from './catalog'
import type { GuarnicionSeleccionada, Language, Product, TerminoCoccion } from '../types/catalog'
import type { CartLine } from '../store/cartStore'

/**
 * Lógica compartida de construcción de líneas de carrito para productos que
 * requieren personalización (término de cocción y/o variantes de sabor).
 *
 * Se extrajo de App.tsx para que el popup de personalización
 * (`PersonalizarModal.tsx`) construya las líneas de carrito con el mismo
 * reparto de precio que antes, sin lógica duplicada dentro del componente.
 */

export interface VariantSeleccion {
  variante: string
  cantidad: number
}

/**
 * Cantidad de comensales (selecciones de término de cocción independientes)
 * que requiere un producto. Por defecto 1 si no se especifica o es <= 1.
 */
export function comensalesDe(product: Product): number {
  return product.comensales && product.comensales > 1 ? product.comensales : 1
}

/**
 * Construye la línea de carrito para un producto con término de cocción.
 *
 * - Platos individuales (1 comensal): un único término (`termino`).
 * - Platos para compartir (ej. Parrillada Mixta para 2): se mantiene como
 *   una sola línea de carrito con un término por comensal (`terminos`), en
 *   vez de una línea repetida por comensal. Esto mantiene el ítem en un
 *   único renglón en la revisión del pedido y en los tickets impresos, con
 *   la personalización (los términos de cada comensal) listada debajo.
 */
export function construirLineasTermino(
  product: Product,
  terminos: TerminoCoccion[],
  guarniciones: GuarnicionSeleccionada[],
  language: Language,
  extras: string[] = [],
): CartLine[] {
  const timestamp = Date.now()
  const esCompartido = terminos.length > 1

  return [
    {
      id: `${product.id}-${timestamp}`,
      productId: product.id,
      name: productDisplayName(product, language),
      nameEs: product.name,
      price: product.price,
      quantity: 1,
      termino: esCompartido ? undefined : terminos[0],
      terminos: esCompartido ? terminos : undefined,
      guarniciones,
      extras: extras.length > 0 ? extras : undefined,
    },
  ]
}

/**
 * Construye la línea de carrito para un producto con opción única
 * obligatoria (ej. "Con mantequilla" / "Sin mantequilla"). A diferencia de
 * `construirLineasVariante`, siempre genera una sola línea con el nombre del
 * producto como línea principal (la opción elegida se muestra como
 * personalización debajo, no reemplaza el nombre).
 */
export function construirLineaOpcionUnica(product: Product, opcion: string, language: Language): CartLine[] {
  const timestamp = Date.now()
  return [
    {
      id: `${product.id}-${timestamp}`,
      productId: product.id,
      name: productDisplayName(product, language),
      nameEs: product.name,
      price: product.price,
      quantity: 1,
      opcion,
    },
  ]
}

/** Construye una línea de carrito por cada variante seleccionada (ej. sabores de bebida). */
export function construirLineasVariante(
  product: Product,
  selecciones: VariantSeleccion[],
  language: Language,
): CartLine[] {
  const timestamp = Date.now()
  return selecciones.map(({ variante, cantidad }, index) => ({
    id: `${product.id}-${variante}-${timestamp}-${index}`,
    productId: product.id,
    name: productDisplayName(product, language),
    nameEs: product.name,
    price: product.price,
    quantity: cantidad,
    variante,
  }))
}

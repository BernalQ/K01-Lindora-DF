import type { Product } from '../types/catalog'

/**
 * Cambios al catálogo hechos desde el panel de administración (`AdminScreen`):
 * precio y estado "agotado" por producto.
 *
 * `PRODUCTS` (ver `data/catalog.ts`) es un array plano definido en código,
 * NO un store: se lee directamente en varios lugares (`ProductCard`,
 * `cartStore.addSimpleItem`, etc.). En vez de introducir una capa de
 * indirección (buscar el override en cada lugar que lee `product.price`),
 * este servicio mutua los objetos del array `PRODUCTS` compartido "en el
 * sitio" (in-place) apenas se aplica un cambio, así que toda la app ve el
 * nuevo valor de inmediato sin recargar ni tocar los demás componentes.
 *
 * Se persiste en `localStorage` (mismo patrón que `mesaLocks.ts`) para que
 * los cambios sobrevivan a un refresh/reinicio del kiosko.
 */

const STORAGE_KEY = 'kiosko:catalogOverrides'

interface Overrides {
  precios: Record<string, number>
  agotados: Record<string, boolean>
}

function overridesVacios(): Overrides {
  return { precios: {}, agotados: {} }
}

function leerOverrides(): Overrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return overridesVacios()
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return overridesVacios()
    const { precios, agotados } = parsed as Partial<Overrides>
    return {
      precios: precios && typeof precios === 'object' ? precios : {},
      agotados: agotados && typeof agotados === 'object' ? agotados : {},
    }
  } catch {
    return overridesVacios()
  }
}

function guardarOverrides(overrides: Overrides): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides))
  } catch {
    // localStorage no disponible (modo privado, cuota llena, etc.): se
    // ignora, el cambio queda aplicado en memoria pero no persiste.
  }
}

/**
 * Aplica los overrides ya guardados sobre el array `PRODUCTS` recién
 * construido, mutando cada producto afectado en el sitio. Se llama una sola
 * vez, justo después de declarar `PRODUCTS` en `data/catalog.ts`, para que
 * cualquier cambio hecho en una sesión anterior del kiosko (precio/agotado)
 * siga vigente tras recargar la página.
 */
export function aplicarOverridesGuardados(products: Product[]): void {
  const { precios, agotados } = leerOverrides()
  for (const product of products) {
    if (product.id in precios) product.price = precios[product.id]
    if (product.id in agotados) product.agotado = agotados[product.id]
  }
}

/**
 * Cambia el precio de un producto: lo persiste y lo aplica de inmediato al
 * array `PRODUCTS` compartido, para que el nuevo precio se refleje en toda
 * la app (menú, carrito, tickets) sin recargar la página.
 */
export function actualizarPrecio(products: Product[], productId: string, nuevoPrecio: number): void {
  const overrides = leerOverrides()
  overrides.precios[productId] = nuevoPrecio
  guardarOverrides(overrides)
  const product = products.find((p) => p.id === productId)
  if (product) product.price = nuevoPrecio
}

/**
 * Marca o desmarca un producto como agotado: lo persiste y lo aplica de
 * inmediato al array `PRODUCTS` compartido.
 */
export function actualizarAgotado(products: Product[], productId: string, agotado: boolean): void {
  const overrides = leerOverrides()
  overrides.agotados[productId] = agotado
  guardarOverrides(overrides)
  const product = products.find((p) => p.id === productId)
  if (product) product.agotado = agotado
}

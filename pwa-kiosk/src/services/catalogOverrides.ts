import type { Product } from '../types/catalog'
import { CAJA_ID } from './consecutivo'
import type { MensajeCatalogSync } from './catalogSync'
import { incrementarConfigVersion } from './configVersion'
import { registrarEventoSync } from './kioskoSyncLogs'
import { enviarAOtroKiosko } from './kioskoTransport'

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
 *
 * Sincronización ENTRE KIOSKOS FÍSICOS DISTINTOS (requerimientos
 * "Disponibilidad de productos" / "Actualización de precios"): K001 es
 * SIEMPRE el kiosko Master del catálogo — sólo los cambios hechos en K001
 * (ver `esKioskoMaster` abajo) se emiten hacia el otro kiosko
 * (`updateAvailability`/`updatePrice`, ver `services/catalogSync.ts`). Un
 * cambio hecho en K002 (si `AdminScreen` llegara a abrirse ahí) sigue
 * aplicándose localmente en K002 pero NO se reemite, para que K001 siga
 * siendo la única fuente de verdad del catálogo entre ambos kioskos.
 * `enviarMensajeCatalogSync` más abajo manda el mensaje por HTTP directo a la
 * IP del otro kiosko, puerto 3005 (ver `services/kioskoTransport.ts`).
 */

const STORAGE_KEY = 'kiosko:catalogOverrides'

/** Kiosko Master del catálogo: sólo sus cambios de precio/disponibilidad se sincronizan hacia el otro kiosko. */
const CAJA_MASTER = 'K001'

/** `true` si ESTE kiosko es el Master del catálogo (ver comentario arriba). */
function esKioskoMaster(): boolean {
  return CAJA_ID === CAJA_MASTER
}

/**
 * Envía un mensaje de sincronización de catálogo al otro kiosko (contrato
 * JSON fijado en `services/catalogSync.ts`), vía
 * `services/kioskoTransport.ts`. "Fire and forget": `actualizarPrecio`/
 * `actualizarAgotado` son funciones síncronas y el cambio ya quedó aplicado
 * localmente ANTES de llegar aquí.
 */
function enviarMensajeCatalogSync(mensaje: MensajeCatalogSync): void {
  void enviarAOtroKiosko('catalogSync', mensaje)
}

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
 * Persiste y aplica el precio al array `PRODUCTS` compartido, sin emitir
 * ningún mensaje de sincronización. Usada tanto por `actualizarPrecio`
 * (edición local) como por `aplicarPrecioRemoto` (recibido del Master) — el
 * log "Precio actualizado" (requerimiento "Logging") vive aquí para cubrir
 * ambos orígenes con una sola línea.
 */
function fijarPrecio(products: Product[], productId: string, nuevoPrecio: number): void {
  const overrides = leerOverrides()
  overrides.precios[productId] = nuevoPrecio
  guardarOverrides(overrides)
  const product = products.find((p) => p.id === productId)
  if (product) product.price = nuevoPrecio
  registrarEventoSync('Precio actualizado', { productId, price: nuevoPrecio })
}

/**
 * Persiste y aplica el estado "agotado" al array `PRODUCTS` compartido, sin
 * emitir ningún mensaje de sincronización. Usada tanto por `actualizarAgotado`
 * (edición local) como por `aplicarDisponibilidadRemota` (recibido del
 * Master) — el log "Disponibilidad actualizada" (requerimiento "Logging")
 * vive aquí para cubrir ambos orígenes con una sola línea.
 */
function fijarAgotado(products: Product[], productId: string, agotado: boolean): void {
  const overrides = leerOverrides()
  overrides.agotados[productId] = agotado
  guardarOverrides(overrides)
  const product = products.find((p) => p.id === productId)
  if (product) product.agotado = agotado
  registrarEventoSync('Disponibilidad actualizada', { productId, available: !agotado })
}

/**
 * Cambia el precio de un producto: lo persiste y lo aplica de inmediato al
 * array `PRODUCTS` compartido, para que el nuevo precio se refleje en toda
 * la app (menú, carrito, tickets) sin recargar la página. Si ESTE kiosko es
 * el Master (`esKioskoMaster`), además sincroniza el cambio con el otro
 * kiosko (requerimiento "Actualización de precios": "K002 debe actualizar
 * inmediatamente: catálogo, carrito, futuras órdenes") y sube
 * `configVersion` (requerimiento "Versionamiento de configuración") — sólo el
 * Master sube el contador, ver comentario de `incrementarConfigVersion` en
 * `services/configVersion.ts`.
 */
export function actualizarPrecio(products: Product[], productId: string, nuevoPrecio: number): void {
  fijarPrecio(products, productId, nuevoPrecio)
  if (esKioskoMaster()) {
    incrementarConfigVersion()
    enviarMensajeCatalogSync({ action: 'updatePrice', productId, price: nuevoPrecio })
  }
}

/**
 * Marca o desmarca un producto como agotado: lo persiste y lo aplica de
 * inmediato al array `PRODUCTS` compartido. Si ESTE kiosko es el Master
 * (`esKioskoMaster`), además sincroniza el cambio con el otro kiosko
 * (requerimiento "Disponibilidad de productos": "K002 debe: actualizar
 * catálogo, ocultar producto, impedir venta" — ver filtros por `agotado` en
 * `MenuScreen.tsx`/`PaymentScreen.tsx`) y sube `configVersion` (mismo
 * criterio que `actualizarPrecio`).
 */
export function actualizarAgotado(products: Product[], productId: string, agotado: boolean): void {
  fijarAgotado(products, productId, agotado)
  if (esKioskoMaster()) {
    incrementarConfigVersion()
    enviarMensajeCatalogSync({ action: 'updateAvailability', productId, available: !agotado })
  }
}

/**
 * Aplica un precio RECIBIDO del kiosko Master (ver `services/catalogSync.ts`
 * -> `recibirMensajeCatalogSync`): igual que `actualizarPrecio`, pero SIN
 * reemitir el mensaje de vuelta (evitaría un eco infinito entre kioskos y
 * violaría que sólo K001 debe emitir estos mensajes).
 */
export function aplicarPrecioRemoto(products: Product[], productId: string, nuevoPrecio: number): void {
  fijarPrecio(products, productId, nuevoPrecio)
}

/**
 * Aplica una disponibilidad RECIBIDA del kiosko Master (ver
 * `services/catalogSync.ts` -> `recibirMensajeCatalogSync`): igual que
 * `actualizarAgotado`, pero SIN reemitir el mensaje de vuelta. `available`
 * viene en la polaridad del mensaje de red (`true` = disponible); `agotado`
 * es la polaridad inversa usada internamente por `Product.agotado`.
 */
export function aplicarDisponibilidadRemota(products: Product[], productId: string, available: boolean): void {
  fijarAgotado(products, productId, !available)
}

/**
 * Copia de sólo lectura de los overrides vigentes (precios/agotados por
 * `productId`), para armar el snapshot de la respuesta `syncConfig`
 * (requerimiento "Resincronización automática", ver
 * `services/kioskoSync.ts` -> `construirRespuestaSyncConfig`).
 */
export function obtenerOverrides(): Readonly<Overrides> {
  return leerOverrides()
}

export type CategoryId =
  | 'parrilla'
  | 'guarniciones'
  | 'comenzar'
  | 'bebidas'
  | 'sobremesa'

export type Language = 'es' | 'en'

export interface Category {
  id: CategoryId
  name: string
  nameEn: string
}

export interface Product {
  id: string
  categoryId: CategoryId
  name: string
  nameEn: string
  price: number
  description?: string
  descriptionEn?: string
  /** Lleva selección de término de cocción (solo platos "a la parrilla") */
  requiresTermino: boolean
  /**
   * Cantidad de comensales que requieren su propia selección de término de
   * cocción (ej. platos para compartir como la Parrillada Mixta para 2).
   * Si no se especifica, se asume 1 (una sola selección para todo el plato).
   */
  comensales?: number
  /** Cantidad de guarniciones incluidas que el cliente puede elegir */
  includedGuarniciones: number
  /** Opciones de sabor/marca a elegir (ej. bebidas) */
  variantes?: string[]
  /**
   * Opciones de personalización de selección única y OBLIGATORIA (ej. "Con
   * mantequilla" / "Sin mantequilla"). A diferencia de `variantes` (se
   * pueden elegir varias, cada una con su propia cantidad, ej. sabores de
   * bebida), estas son mutuamente excluyentes: el cliente debe elegir
   * exactamente una para poder agregar el producto al pedido, mediante
   * botones de selección única (no stepper de cantidad).
   */
  opcionUnica?: string[]
  /**
   * Cuál de las opciones de `opcionUnica` se considera la preparación
   * "normal"/por defecto del producto (ej. "Con Chimichurri" en el
   * Choripán, "Con Aderezo" en las ensaladas). Cuando el cliente elige
   * exactamente esta opción, no se muestra ninguna leyenda de
   * personalización en la revisión del pedido ni en los tickets impresos
   * (ver `opcionParaMostrar` en `data/catalog.ts`), porque no representa un
   * cambio respecto a la preparación estándar.
   */
  opcionPorDefecto?: string
  /**
   * Opciones de exclusión de ingredientes, seleccionables junto con el
   * término de cocción (ej. "Sin Tomate" en una hamburguesa). A diferencia
   * de `variantes` (mutuamente excluyentes, con cantidad propia), estas son
   * casillas independientes: se pueden marcar varias a la vez y no tienen
   * cantidad ni afectan el precio.
   */
  extras?: string[]
  imageUrl?: string
  /**
   * Título alternativo para la tarjeta del menú (`ProductCard`), distinto
   * del `name`/`nameEn` canónico usado en el carrito y los tickets impresos.
   * Ej.: el item se llama "Cerveza Premium" para el carrito/cocina/caja,
   * pero en la tarjeta del menú se muestra como "Cerveza Importada" (más
   * atractivo para el cliente), con el detalle de marcas en `description`.
   * Si no se define, la tarjeta usa `productDisplayName` (comportamiento
   * normal de cualquier otro producto).
   */
  nombreMenu?: string
  nombreMenuEn?: string
  /**
   * Si es `true`, `description`/`descriptionEn` se muestra en la tarjeta del
   * menú con estilo resaltado (más pequeño pero en negrita/color de marca)
   * en vez del estilo discreto normal. Ej.: la lista de marcas de "Cerveza
   * Importada" ("Heineken, Bavaria, Corona, Modelo, Peroni").
   */
  descripcionResaltada?: boolean
  /**
   * Si es `true`, el producto está marcado como agotado desde el panel de
   * administración (ver `AdminScreen`/`services/catalogOverrides.ts`): no
   * puede agregarse al pedido (`ProductCard` deshabilita sus botones y
   * muestra una insignia "Agotado") aunque siga visible en el menú, para que
   * el cliente sepa que existe pero no está disponible por ahora.
   */
  agotado?: boolean
}

/**
 * Guarnición elegida como acompañamiento incluido en un plato de parrilla:
 * el id del producto-guarnición, y la opción elegida si esa guarnición
 * exige personalización obligatoria (ver Product.opcionUnica, ej. "Con
 * Natilla" para Papa Asada). `opcion` queda `undefined` para guarniciones
 * sin opciones de personalización.
 */
export interface GuarnicionSeleccionada {
  id: string
  opcion?: string
}

export type TerminoCoccion = 'Azul' | 'Rojo' | 'Medio' | 'Tres Cuartos' | 'Bien Cocido'

/**
 * Orden en que se muestran las opciones de término de cocción en el pop-up
 * de personalización (`PersonalizarModal`): "Azul" va primero, a la
 * izquierda de "Rojo" (el término menos cocido antes que el siguiente en
 * intensidad), seguido de "Medio" (antes "Término Medio"), "Tres Cuartos" y
 * "Bien Cocido".
 */
export const TERMINOS_COCCION: TerminoCoccion[] = [
  'Azul',
  'Rojo',
  'Medio',
  'Tres Cuartos',
  'Bien Cocido',
]

import type { Category, GuarnicionSeleccionada, Language, Product } from '../types/catalog'
import { buildProductImageMap } from './productImages'
import { aplicarOverridesGuardados } from '../services/catalogOverrides'

export const CATEGORIES: Category[] = [
  { id: 'comenzar', name: 'Para Comenzar', nameEn: 'Starters' },
  { id: 'parrilla', name: 'A la Parrilla', nameEn: 'From the Grill' },
  { id: 'guarniciones', name: 'Guarniciones', nameEn: 'Side Dishes' },
  { id: 'bebidas', name: 'Bebidas', nameEn: 'Drinks' },
  { id: 'sobremesa', name: 'Sobremesa', nameEn: 'Dessert' },
]

/**
 * Códigos de artículo (Codisa) tomados de "Catalogo de articulos
 * restaurante 2026" (`src/Catalogo de articulos restaurante 2026.xlsx`),
 * columna "Código Artículo" de cada bloque de categoría. Ver
 * `Product.codigoArticulo` para el porqué (integración WS DF / control
 * interno en `AdminScreen`, nunca visible al cliente).
 */
export const PRODUCTS: Product[] = [
  // A la parrilla
  {
    id: 'ribeye-250',
    categoryId: 'parrilla',
    name: 'Ribeye (250g)',
    nameEn: 'Ribeye (250g)',
    price: 7400,
    requiresTermino: true,
    includedGuarniciones: 1,
    codigoArticulo: '4405',
  },
  {
    id: 'new-york-250',
    categoryId: 'parrilla',
    name: 'New York (250g)',
    nameEn: 'New York Strip (250g)',
    price: 7400,
    requiresTermino: true,
    includedGuarniciones: 1,
    codigoArticulo: '4406',
  },
  {
    id: 'churrasco-400',
    categoryId: 'parrilla',
    name: 'Churrasco (400g, corte mariposa)',
    nameEn: 'Churrasco (400g, butterfly cut)',
    price: 8490,
    requiresTermino: true,
    includedGuarniciones: 1,
    codigoArticulo: '4407',
  },
  {
    id: 'sirloin-600',
    categoryId: 'parrilla',
    name: 'Sirloin (600g)',
    nameEn: 'Sirloin (600g)',
    price: 9490,
    requiresTermino: true,
    includedGuarniciones: 1,
    codigoArticulo: '2923',
  },
  {
    id: 'lomito-250',
    categoryId: 'parrilla',
    name: 'Lomito (250g)',
    nameEn: 'Tenderloin (250g)',
    price: 9600,
    requiresTermino: true,
    includedGuarniciones: 1,
    codigoArticulo: '4415',
  },
  {
    id: 'pechuga-pollo-250',
    categoryId: 'parrilla',
    name: 'Pechuga de Pollo (250g, marinada)',
    nameEn: 'Chicken Breast (250g, marinated)',
    price: 6100,
    requiresTermino: true,
    includedGuarniciones: 1,
    codigoArticulo: '4409',
  },
  {
    id: 'salmon-250',
    categoryId: 'parrilla',
    name: 'Salmón (250g)',
    nameEn: 'Salmon (250g)',
    price: 9600,
    requiresTermino: true,
    includedGuarniciones: 1,
    codigoArticulo: '4418',
  },
  {
    id: 'hamburguesa-sirloin',
    categoryId: 'parrilla',
    name: 'Hamburguesa de Sirloin',
    nameEn: 'Sirloin Burger',
    price: 8290,
    description: 'Con papas campesinas',
    descriptionEn: 'With country-style fries',
    requiresTermino: true,
    includedGuarniciones: 0,
    extras: ['Sin Queso', 'Sin Lechuga', 'Sin Tocineta'],
    codigoArticulo: '4419',
  },
  {
    id: 'parrillada-mixta-2',
    categoryId: 'parrilla',
    name: 'Parrillada Mixta para 2',
    nameEn: 'Mixed Grill for 2',
    price: 16900,
    description: 'Chorizo, pollo y lomo ancho',
    descriptionEn: 'Chorizo, chicken and top loin',
    requiresTermino: true,
    comensales: 2,
    includedGuarniciones: 2,
    codigoArticulo: '4404',
  },

  // Guarniciones
  {
    id: 'papa-asada',
    categoryId: 'guarniciones',
    name: 'Papa Asada',
    nameEn: 'Baked Potato',
    price: 2000,
    requiresTermino: false,
    includedGuarniciones: 0,
    opcionUnica: ['Con Natilla', 'Con Mantequilla', 'Sin Natilla ni Mantequilla', 'Natilla aparte'],
    codigoArticulo: '4211',
  },
  {
    id: 'ensalada-jardinera',
    categoryId: 'guarniciones',
    name: 'Ensalada Jardinera',
    nameEn: 'Garden Salad',
    description: 'Con tomate cherry',
    descriptionEn: 'With cherry tomato',
    price: 1650,
    requiresTermino: false,
    includedGuarniciones: 0,
    opcionUnica: ['Con Aderezo', 'Sin Aderezo'],
    opcionPorDefecto: 'Con Aderezo',
    codigoArticulo: '4212',
  },
  {
    id: 'arroz-blanco',
    categoryId: 'guarniciones',
    name: 'Arroz Blanco',
    nameEn: 'White Rice',
    price: 1000,
    requiresTermino: false,
    includedGuarniciones: 0,
    codigoArticulo: '12001',
  },
  {
    id: 'yuca-moho',
    categoryId: 'guarniciones',
    name: 'Yuca con moho de cebolla y ajo',
    nameEn: 'Cassava with onion and garlic relish',
    price: 2000,
    requiresTermino: false,
    includedGuarniciones: 0,
    codigoArticulo: '12016',
  },
  {
    id: 'vegetales-juliana',
    categoryId: 'guarniciones',
    name: 'Vegetales en juliana',
    nameEn: 'Julienned vegetables',
    price: 1500,
    description: 'Nuevo',
    descriptionEn: 'New',
    requiresTermino: false,
    includedGuarniciones: 0,
    codigoArticulo: '12011',
  },

  // Para comenzar
  {
    id: 'gallo-chorizo',
    categoryId: 'comenzar',
    name: 'Gallo de Chorizo',
    nameEn: 'Chorizo Taco',
    price: 1600,
    requiresTermino: false,
    includedGuarniciones: 0,
    codigoArticulo: '4400',
  },
  {
    id: 'choripan',
    categoryId: 'comenzar',
    name: 'Choripán',
    nameEn: 'Choripán (Chorizo Sandwich)',
    price: 1900,
    requiresTermino: false,
    includedGuarniciones: 0,
    opcionUnica: ['Con Chimichurri', 'Sin Chimichurri', 'Chimichurri aparte'],
    opcionPorDefecto: 'Con Chimichurri',
    codigoArticulo: '4410',
  },
  {
    id: 'chicharron-carne',
    categoryId: 'comenzar',
    name: 'Chicharrón de Carne',
    nameEn: 'Fried Pork Crackling (Meat)',
    price: 3800,
    requiresTermino: false,
    includedGuarniciones: 0,
    codigoArticulo: '2298',
  },
  {
    id: 'chicharron-panza',
    categoryId: 'comenzar',
    name: 'Chicharrón de Panzada',
    nameEn: 'Fried Pork Belly Crackling',
    price: 4800,
    requiresTermino: false,
    includedGuarniciones: 0,
    codigoArticulo: '2299',
  },
  {
    id: 'queso-provolone',
    categoryId: 'comenzar',
    name: 'Queso Provolone',
    nameEn: 'Provolone Cheese',
    price: 4100,
    requiresTermino: false,
    includedGuarniciones: 0,
    codigoArticulo: '4510',
  },
  {
    // Sin código: el documento fuente ("Catalogo de articulos restaurante
    // 2026") repite el código "4400" tanto para "Gallo de Chorizo" como
    // para "Pan Parrillero" (ver fila de Pan Parrillero en el bloque "Para
    // Comenzar" del xlsx) — parece un error de digitación en el origen, ya
    // que un mismo código de artículo no puede identificar dos productos
    // distintos ante Codisa. Se deja sin `codigoArticulo` a propósito
    // (en vez de asumir el 4400 y arriesgar una venta mal clasificada) hasta
    // que el restaurante confirme el código real; mientras tanto, el envío
    // a Codisa usa el `id` interno como respaldo (ver `services/wsdf.ts`).
    id: 'pan-parrillero',
    categoryId: 'comenzar',
    name: 'Pan Parrillero',
    nameEn: 'Grilled Bread',
    price: 2000,
    requiresTermino: false,
    includedGuarniciones: 0,
  },
  {
    id: 'elote',
    categoryId: 'comenzar',
    name: 'Elote',
    nameEn: 'Grilled Corn',
    price: 3100,
    requiresTermino: false,
    includedGuarniciones: 0,
    opcionUnica: ['Con Mantequilla', 'Sin Mantequilla'],
    codigoArticulo: '12003',
  },
  {
    id: 'ensalada-griega',
    categoryId: 'comenzar',
    name: 'Ensalada Griega',
    nameEn: 'Greek Salad',
    price: 2500,
    requiresTermino: false,
    includedGuarniciones: 0,
    opcionUnica: ['Con Aderezo', 'Sin Aderezo'],
    opcionPorDefecto: 'Con Aderezo',
    codigoArticulo: '2728',
  },
  {
    id: 'hongos-tomate-tocineta',
    categoryId: 'comenzar',
    name: 'Hongos con tomate cherry y tocineta',
    nameEn: 'Mushrooms with cherry tomato and bacon',
    price: 2800,
    requiresTermino: false,
    includedGuarniciones: 0,
    codigoArticulo: '2729',
  },

  // Bebidas
  {
    // `variantes` activa el pop-up de personalización (`VarianteBody` en
    // `PersonalizarModal`): el cliente elige cantidad de Gaseosa y/o
    // cantidad de Tropical por separado (stepper independiente por
    // opción), y se agrega una línea del carrito por cada una con su
    // propia cantidad (ver `construirLineasVariante`). El producto en sí
    // queda sin `codigoArticulo` (no representa un artículo real de
    // Codisa) porque el código correcto depende de la variante elegida —
    // ver `CODIGOS_POR_VARIANTE` más abajo, consultado por
    // `codigoArticuloParaCodisa(productId, variante)` antes de caer al
    // `id` interno como respaldo (ver `services/wsdf.ts`).
    id: 'gaseosa-tropical',
    categoryId: 'bebidas',
    name: 'Gaseosa o Tropical',
    nameEn: 'Soda or Tropical Fruit Drink',
    price: 1100,
    requiresTermino: false,
    includedGuarniciones: 0,
    variantes: ['Gaseosa', 'Tropical'],
  },
  {
    id: 'cerveza-nacional',
    categoryId: 'bebidas',
    name: 'Cerveza Nacional',
    nameEn: 'Local Beer',
    price: 1750,
    requiresTermino: false,
    includedGuarniciones: 0,
    codigoArticulo: '4001',
  },
  {
    // `variantes` activa el pop-up de personalización (`VarianteBody`): el
    // cliente elige cantidad por marca (Heineken, Corona, Bavaria,
    // Peroni), con stepper independiente por opción, y se agrega una línea
    // del carrito por cada marca elegida con su propia cantidad (ver
    // `construirLineasVariante`). "Modelo" queda fuera de las opciones
    // seleccionables (no estaba en la lista pedida para este pop-up), por
    // lo que se retiró también de la descripción visible en la tarjeta del
    // menú para no anunciar una marca que no puede pedirse. El producto en
    // sí queda sin `codigoArticulo` porque el código correcto depende de
    // la marca elegida — ver `CODIGOS_POR_VARIANTE` más abajo, consultado
    // por `codigoArticuloParaCodisa(productId, variante)` antes de caer al
    // `id` interno como respaldo (ver `services/wsdf.ts`).
    id: 'cerveza-bavaria-heineken-corona',
    categoryId: 'bebidas',
    name: 'Cerveza Premium',
    nameEn: 'Premium Beer',
    nombreMenu: 'Cerveza Importada',
    nombreMenuEn: 'Imported Beer',
    description: 'Heineken, Corona, Bavaria, Peroni',
    descriptionEn: 'Heineken, Corona, Bavaria, Peroni',
    descripcionResaltada: true,
    price: 2000,
    requiresTermino: false,
    includedGuarniciones: 0,
    variantes: ['Heineken', 'Corona', 'Bavaria', 'Peroni'],
  },
  {
    id: 'vino-altos-hormigas-malbec-375',
    categoryId: 'bebidas',
    name: 'Vino Altos Las Hormigas Malbec Clásico (375ml)',
    nameEn: 'Altos Las Hormigas Malbec Clásico Wine (375ml)',
    price: 8080,
    requiresTermino: false,
    includedGuarniciones: 0,
    codigoArticulo: '4357',
  },
  {
    id: 'vino-maison-castel-cabernet-187',
    categoryId: 'bebidas',
    name: 'Vino Maison Castel Cabernet Sauvignon (187ml)',
    nameEn: 'Maison Castel Cabernet Sauvignon Wine (187ml)',
    price: 3500,
    requiresTermino: false,
    includedGuarniciones: 0,
    codigoArticulo: '2455',
  },
  {
    id: 'vino-maison-castel-chardonnay-187',
    categoryId: 'bebidas',
    name: 'Vino Maison Castel Chardonnay (187ml)',
    nameEn: 'Maison Castel Chardonnay Wine (187ml)',
    price: 3500,
    requiresTermino: false,
    includedGuarniciones: 0,
    codigoArticulo: '2456',
  },
  {
    id: 'vino-la-danza-malbec-750',
    categoryId: 'bebidas',
    name: 'Vino La Danza Malbec Botella (750ml)',
    nameEn: 'La Danza Malbec Wine Bottle (750ml)',
    price: 12010,
    requiresTermino: false,
    includedGuarniciones: 0,
    codigoArticulo: '4356',
  },
  {
    id: 'vino-muga-rosado-750',
    categoryId: 'bebidas',
    name: 'Vino Muga Rosado Botella (750ml)',
    nameEn: 'Muga Rosé Wine Bottle (750ml)',
    price: 13260,
    requiresTermino: false,
    includedGuarniciones: 0,
    codigoArticulo: '4305',
  },
  {
    id: 'agua-san-pellegrino-500',
    categoryId: 'bebidas',
    name: 'Agua San Pellegrino 500ml',
    nameEn: 'San Pellegrino Sparkling Water 500ml',
    price: 2600,
    requiresTermino: false,
    includedGuarniciones: 0,
    codigoArticulo: '4156',
  },
  {
    id: 'agua-natural-panna-500',
    categoryId: 'bebidas',
    name: 'Agua Natural Panna 500ml',
    nameEn: 'Panna Still Water 500ml',
    price: 2150,
    requiresTermino: false,
    includedGuarniciones: 0,
    codigoArticulo: '4511',
  },

  // Sobremesa
  {
    id: 'cafe-capuccino',
    categoryId: 'sobremesa',
    name: 'Café Capuccino',
    nameEn: 'Cappuccino',
    price: 1800,
    requiresTermino: false,
    includedGuarniciones: 0,
    codigoArticulo: '4452',
  },
  {
    id: 'cafe-espresso',
    categoryId: 'sobremesa',
    name: 'Café Espresso',
    nameEn: 'Espresso',
    price: 1500,
    requiresTermino: false,
    includedGuarniciones: 0,
    codigoArticulo: '4453',
  },
  {
    id: 'leche-asada',
    categoryId: 'sobremesa',
    name: 'Leche Asada',
    nameEn: 'Baked Milk Custard',
    price: 1500,
    requiresTermino: false,
    includedGuarniciones: 0,
    codigoArticulo: '4102',
  },
  {
    id: 'pie-pecanas',
    categoryId: 'sobremesa',
    name: 'Pie de Pecanas (porción)',
    nameEn: 'Pecan Pie (slice)',
    price: 2900,
    requiresTermino: false,
    includedGuarniciones: 0,
    codigoArticulo: '2857',
  },
]

// Aplica cambios de precio/agotado hechos desde el panel de administración
// en una sesión anterior (persistidos en localStorage), antes de que
// cualquier pantalla lea `PRODUCTS` (ver `services/catalogOverrides.ts`).
aplicarOverridesGuardados(PRODUCTS)

export const GUARNICIONES = PRODUCTS.filter((p) => p.categoryId === 'guarniciones')

/**
 * Fotos de producto enlazadas automáticamente por nombre desde
 * `src/assets/productos` (ver `productImages.ts`). Si un producto no tiene
 * foto coincidente, simplemente no aparece en este mapa: la interfaz debe
 * mostrar un placeholder genérico en ese caso.
 */
export const PRODUCT_IMAGES: Record<string, string> = buildProductImageMap(PRODUCTS)

export function productImage(product: Product): string | undefined {
  return PRODUCT_IMAGES[product.id]
}

export function formatCRC(amount: number): string {
  return `₡${amount.toLocaleString('es-CR')}`
}

/**
 * Códigos Codisa por variante, para productos de menú que agrupan varios
 * artículos reales de Codisa bajo una sola tarjeta con pop-up de
 * personalización (`variantes` en `Product`, ver `gaseosa-tropical` y
 * `cerveza-bavaria-heineken-corona` arriba). Cada `CartLine` generada por
 * `VarianteBody`/`construirLineasVariante` guarda la opción elegida en
 * `line.variante` (ej. "Gaseosa", "Heineken"), así que `(productId,
 * variante)` identifica el artículo real que hay que reportarle a Codisa.
 * Tomado de "Catalogo de articulos restaurante 2026" (mismo origen que
 * `Product.codigoArticulo`, ver ese campo).
 */
const CODIGOS_POR_VARIANTE: Record<string, Record<string, string>> = {
  'gaseosa-tropical': {
    Gaseosa: '4152',
    Tropical: '4157',
  },
  'cerveza-bavaria-heineken-corona': {
    Heineken: '4005',
    Corona: '4003',
    Bavaria: '4002',
    Peroni: '4000',
  },
}

/**
 * Código de artículo a enviar a Codisa (`id_articulo` en
 * `services/wsdf.ts`) para una línea del carrito, dada su `productId` y,
 * si aplica, la `variante` elegida (ej. "Gaseosa" vs "Tropical", o la
 * marca de cerveza — ver `CODIGOS_POR_VARIANTE`). Orden de resolución:
 * 1. Código por variante (`CODIGOS_POR_VARIANTE[productId][variante]`).
 * 2. `Product.codigoArticulo` del producto (cuando no hay variante o la
 *    variante no tiene código propio).
 * 3. El propio `productId` como último respaldo, para que el envío a
 *    Codisa nunca se rompa por falta de código.
 */
export function codigoArticuloParaCodisa(productId: string, variante?: string): string {
  if (variante) {
    const codigoVariante = CODIGOS_POR_VARIANTE[productId]?.[variante]
    if (codigoVariante) return codigoVariante
  }
  const product = PRODUCTS.find((p) => p.id === productId)
  return product?.codigoArticulo ?? productId
}

/**
 * Nombre legible para un `id_articulo` tal como se envía a Codisa (usado
 * por el pop-up de verificación `WsDfPopup`): busca primero entre los
 * códigos por variante (ej. "4005" → "Heineken"), luego por
 * `Product.codigoArticulo`, y finalmente por `id` de producto (caso en que
 * el código cayó al respaldo del `productId`, ver
 * `codigoArticuloParaCodisa`). Si no encuentra nada, devuelve el valor
 * crudo.
 */
export function nombreParaCodigoCodisa(idArticulo: string, language: Language): string {
  for (const codigosDelProducto of Object.values(CODIGOS_POR_VARIANTE)) {
    const variante = Object.entries(codigosDelProducto).find(([, codigo]) => codigo === idArticulo)?.[0]
    if (variante) return variante
  }
  const product =
    PRODUCTS.find((p) => p.codigoArticulo === idArticulo) ?? PRODUCTS.find((p) => p.id === idArticulo)
  return product ? productDisplayName(product, language) : idArticulo
}

/**
 * Funciones de presentación (sólo afectan la interfaz visible al cliente).
 * Los datos "canónicos" en español (name/description) son los que se usan
 * siempre para generar los tickets de impresión, sin importar el idioma
 * seleccionado en la interfaz.
 */
export function productDisplayName(product: Product, language: Language): string {
  return language === 'en' && product.nameEn ? product.nameEn : product.name
}

/**
 * Título a mostrar en la tarjeta del menú (`ProductCard`): usa
 * `nombreMenu`/`nombreMenuEn` si el producto lo define (ver `Product`), o
 * `productDisplayName` en cualquier otro caso (comportamiento normal). El
 * carrito, los tickets impresos y cualquier otro lugar de la app siguen
 * usando siempre `productDisplayName`/`product.name`, sin cambios.
 */
export function productDisplayTitle(product: Product, language: Language): string {
  if (language === 'en' && product.nombreMenuEn) return product.nombreMenuEn
  if (product.nombreMenu) return product.nombreMenu
  return productDisplayName(product, language)
}

export function productDisplayDescription(product: Product, language: Language): string | undefined {
  return language === 'en' && product.descriptionEn ? product.descriptionEn : product.description
}

export function categoryDisplayName(category: Category, language: Language): string {
  return language === 'en' && category.nameEn ? category.nameEn : category.name
}

/** Nombre de guarnición para mostrar en la interfaz (traducido según el idioma). */
export function guarnicionDisplayName(id: string, language: Language): string {
  const guarnicion = GUARNICIONES.find((g) => g.id === id)
  if (!guarnicion) return id
  return productDisplayName(guarnicion, language)
}

/**
 * Opción de personalización a mostrar como leyenda (en la revisión del
 * pedido y en los tickets impresos) para un producto y la opción elegida.
 * Devuelve `undefined` si no hay opción, o si la opción elegida es la
 * `opcionPorDefecto` del producto (ej. "Con Chimichurri" en el Choripán,
 * "Con Aderezo" en las ensaladas): en ese caso no representa un cambio
 * respecto a la preparación estándar, así que no debe imprimirse ninguna
 * leyenda.
 */
export function opcionParaMostrar(productId: string, opcion: string | undefined): string | undefined {
  if (!opcion) return undefined
  const product = PRODUCTS.find((p) => p.id === productId)
  if (product?.opcionPorDefecto && opcion === product.opcionPorDefecto) return undefined
  return opcion
}

/**
 * Resume una lista de guarniciones elegidas (posiblemente con el mismo id
 * repetido, ej. 2x la misma guarnición, cada una con su propia opción) en un
 * texto legible: agrupa duplicados de id+opción idénticos y agrega
 * "x{cantidad}" cuando esa combinación exacta se eligió más de una vez. Si
 * la guarnición tiene una opción de personalización elegida (ver
 * `Product.opcionUnica`), se muestra entre paréntesis junto al nombre.
 */
export function guarnicionesResumen(guarniciones: GuarnicionSeleccionada[], language: Language): string {
  const counts = new Map<string, { id: string; opcion?: string; count: number }>()
  for (const g of guarniciones) {
    const key = `${g.id}|${g.opcion ?? ''}`
    const actual = counts.get(key)
    if (actual) actual.count += 1
    else counts.set(key, { id: g.id, opcion: g.opcion, count: 1 })
  }
  return Array.from(counts.values())
    .map(({ id, opcion, count }) => {
      const nombre = guarnicionDisplayName(id, language)
      const opcionMostrar = opcionParaMostrar(id, opcion)
      const base = opcionMostrar ? `${nombre} (${opcionMostrar})` : nombre
      return count > 1 ? `${base} x${count}` : base
    })
    .join(', ')
}

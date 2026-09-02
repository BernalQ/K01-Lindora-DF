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
  },
  {
    id: 'new-york-250',
    categoryId: 'parrilla',
    name: 'New York (250g)',
    nameEn: 'New York Strip (250g)',
    price: 7400,
    requiresTermino: true,
    includedGuarniciones: 1,
  },
  {
    id: 'churrasco-400',
    categoryId: 'parrilla',
    name: 'Churrasco (400g, corte mariposa)',
    nameEn: 'Churrasco (400g, butterfly cut)',
    price: 8490,
    requiresTermino: true,
    includedGuarniciones: 1,
  },
  {
    id: 'sirloin-600',
    categoryId: 'parrilla',
    name: 'Sirloin (600g)',
    nameEn: 'Sirloin (600g)',
    price: 9490,
    requiresTermino: true,
    includedGuarniciones: 1,
  },
  {
    id: 'lomito-250',
    categoryId: 'parrilla',
    name: 'Lomito (250g)',
    nameEn: 'Tenderloin (250g)',
    price: 9600,
    requiresTermino: true,
    includedGuarniciones: 1,
  },
  {
    id: 'pechuga-pollo-250',
    categoryId: 'parrilla',
    name: 'Pechuga de Pollo (250g, marinada)',
    nameEn: 'Chicken Breast (250g, marinated)',
    price: 6100,
    requiresTermino: true,
    includedGuarniciones: 1,
  },
  {
    id: 'salmon-250',
    categoryId: 'parrilla',
    name: 'Salmón (250g)',
    nameEn: 'Salmon (250g)',
    price: 9600,
    requiresTermino: true,
    includedGuarniciones: 1,
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
  },
  {
    id: 'arroz-blanco',
    categoryId: 'guarniciones',
    name: 'Arroz Blanco',
    nameEn: 'White Rice',
    price: 1000,
    requiresTermino: false,
    includedGuarniciones: 0,
  },
  {
    id: 'yuca-moho',
    categoryId: 'guarniciones',
    name: 'Yuca con moho de cebolla y ajo',
    nameEn: 'Cassava with onion and garlic relish',
    price: 2000,
    requiresTermino: false,
    includedGuarniciones: 0,
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
  },
  {
    id: 'chicharron-carne',
    categoryId: 'comenzar',
    name: 'Chicharrón de Carne',
    nameEn: 'Fried Pork Crackling (Meat)',
    price: 3800,
    requiresTermino: false,
    includedGuarniciones: 0,
  },
  {
    id: 'chicharron-panza',
    categoryId: 'comenzar',
    name: 'Chicharrón de Panzada',
    nameEn: 'Fried Pork Belly Crackling',
    price: 4800,
    requiresTermino: false,
    includedGuarniciones: 0,
  },
  {
    id: 'queso-provolone',
    categoryId: 'comenzar',
    name: 'Queso Provolone',
    nameEn: 'Provolone Cheese',
    price: 4100,
    requiresTermino: false,
    includedGuarniciones: 0,
  },
  {
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
  },
  {
    id: 'hongos-tomate-tocineta',
    categoryId: 'comenzar',
    name: 'Hongos con tomate cherry y tocineta',
    nameEn: 'Mushrooms with cherry tomato and bacon',
    price: 2800,
    requiresTermino: false,
    includedGuarniciones: 0,
  },

  // Bebidas
  {
    id: 'gaseosa-tropical',
    categoryId: 'bebidas',
    name: 'Gaseosa o Tropical',
    nameEn: 'Soda or Tropical Fruit Drink',
    price: 1100,
    requiresTermino: false,
    includedGuarniciones: 0,
  },
  {
    id: 'cerveza-nacional',
    categoryId: 'bebidas',
    name: 'Cerveza Nacional',
    nameEn: 'Local Beer',
    price: 1750,
    requiresTermino: false,
    includedGuarniciones: 0,
  },
  {
    id: 'cerveza-bavaria-heineken-corona',
    categoryId: 'bebidas',
    name: 'Cerveza Premium',
    nameEn: 'Premium Beer',
    nombreMenu: 'Cerveza Importada',
    nombreMenuEn: 'Imported Beer',
    description: 'Heineken, Bavaria, Corona, Modelo, Peroni',
    descriptionEn: 'Heineken, Bavaria, Corona, Modelo, Peroni',
    descripcionResaltada: true,
    price: 2000,
    requiresTermino: false,
    includedGuarniciones: 0,
  },
  {
    id: 'vino-altos-hormigas-malbec-375',
    categoryId: 'bebidas',
    name: 'Vino Altos Las Hormigas Malbec Clásico (375ml)',
    nameEn: 'Altos Las Hormigas Malbec Clásico Wine (375ml)',
    price: 8080,
    requiresTermino: false,
    includedGuarniciones: 0,
  },
  {
    id: 'vino-maison-castel-cabernet-187',
    categoryId: 'bebidas',
    name: 'Vino Maison Castel Cabernet Sauvignon (187ml)',
    nameEn: 'Maison Castel Cabernet Sauvignon Wine (187ml)',
    price: 3500,
    requiresTermino: false,
    includedGuarniciones: 0,
  },
  {
    id: 'vino-maison-castel-chardonnay-187',
    categoryId: 'bebidas',
    name: 'Vino Maison Castel Chardonnay (187ml)',
    nameEn: 'Maison Castel Chardonnay Wine (187ml)',
    price: 3500,
    requiresTermino: false,
    includedGuarniciones: 0,
  },
  {
    id: 'vino-la-danza-malbec-750',
    categoryId: 'bebidas',
    name: 'Vino La Danza Malbec Botella (750ml)',
    nameEn: 'La Danza Malbec Wine Bottle (750ml)',
    price: 12010,
    requiresTermino: false,
    includedGuarniciones: 0,
  },
  {
    id: 'vino-muga-rosado-750',
    categoryId: 'bebidas',
    name: 'Vino Muga Rosado Botella (750ml)',
    nameEn: 'Muga Rosé Wine Bottle (750ml)',
    price: 13260,
    requiresTermino: false,
    includedGuarniciones: 0,
  },
  {
    id: 'agua-san-pellegrino-500',
    categoryId: 'bebidas',
    name: 'Agua San Pellegrino 500ml',
    nameEn: 'San Pellegrino Sparkling Water 500ml',
    price: 2600,
    requiresTermino: false,
    includedGuarniciones: 0,
  },
  {
    id: 'agua-natural-panna-500',
    categoryId: 'bebidas',
    name: 'Agua Natural Panna 500ml',
    nameEn: 'Panna Still Water 500ml',
    price: 2150,
    requiresTermino: false,
    includedGuarniciones: 0,
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
  },
  {
    id: 'cafe-espresso',
    categoryId: 'sobremesa',
    name: 'Café Espresso',
    nameEn: 'Espresso',
    price: 1500,
    requiresTermino: false,
    includedGuarniciones: 0,
  },
  {
    id: 'leche-asada',
    categoryId: 'sobremesa',
    name: 'Leche Asada',
    nameEn: 'Baked Milk Custard',
    price: 1500,
    requiresTermino: false,
    includedGuarniciones: 0,
  },
  {
    id: 'pie-pecanas',
    categoryId: 'sobremesa',
    name: 'Pie de Pecanas (porción)',
    nameEn: 'Pecan Pie (slice)',
    price: 2900,
    requiresTermino: false,
    includedGuarniciones: 0,
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

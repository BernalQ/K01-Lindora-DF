import type { Product } from '../types/catalog'

/**
 * Enlace automático de fotos de producto para el menú táctil.
 *
 * Al agregar una nueva foto a `src/assets/productos` (formato .jpg/.jpeg/.png/.webp)
 * con un nombre parecido al del producto (ej. "ribeye.jpg" para el producto
 * "Ribeye (250g)"), la imagen se enlaza automáticamente sin tocar código: se
 * recorre la carpeta en build time (import.meta.glob), se normaliza cada
 * nombre de archivo y se compara contra el id/nombre de cada producto del
 * catálogo. Si no hay coincidencia, el producto simplemente no tiene imagen
 * y el componente que la consume debe mostrar un placeholder genérico.
 */
const photoModules = import.meta.glob('../assets/productos/*.{jpg,jpeg,png,webp}', {
  eager: true,
  import: 'default',
}) as Record<string, string>

const STOPWORDS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'o', 'con', 'en', 'a', 'al', 'para'])

/** Modismos ortográficos comunes que deben tratarse como el mismo producto. */
const SPELLING_FIXES: Record<string, string> = {
  expresso: 'espresso',
}

function normalizeToTokens(raw: string): string[] {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita acentos (á, é, í, ó, ú, ñ -> n, etc.)
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '') // quita extensión si viene incluida
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0 && !STOPWORDS.has(token))
    .map((token) => SPELLING_FIXES[token] ?? token)
}

/** Igualdad de palabras con tolerancia de plural simple (gaseosa/gaseosas). */
function tokenEquals(a: string, b: string): boolean {
  return a === b || `${a}s` === b || `${b}s` === a
}

interface PhotoEntry {
  fileName: string
  url: string
  tokens: string[]
  joined: string
}

const photos: PhotoEntry[] = Object.entries(photoModules).map(([path, url]) => {
  const fileName = path.split('/').pop() ?? path
  const tokens = normalizeToTokens(fileName)
  return { fileName, url, tokens, joined: tokens.join('') }
})

function candidateTokens(product: Product): string[] {
  const idTokens = product.id.split('-')
  const nameTokens = normalizeToTokens(product.name)
  return Array.from(new Set([...idTokens, ...nameTokens]))
}

/** Coincidencia "cruda": ¿la foto podría pertenecer a este producto? */
function rawIsMatch(photo: PhotoEntry, product: Product): boolean {
  if (photo.tokens.length === 0) return false

  const candidate = candidateTokens(product)
  const candidateJoined = candidate.join('')

  // Estrategia 1: concatenación en el mismo orden (cubre palabras compuestas,
  // ej. archivo "rib" + "eye" -> "ribeye", dentro de candidato "ribeye250g").
  const containment = candidateJoined.includes(photo.joined) || photo.joined.includes(candidateJoined)

  // Estrategia 2: mismos tokens sin importar el orden (ej. archivo
  // "juliana de vegetales" vs producto "Vegetales en juliana"), con
  // tolerancia de plural (ej. "gaseosas" vs "Gaseosa o Tropical").
  const sameTokens = photo.tokens.every((token) => candidate.some((c) => tokenEquals(c, token)))

  return containment || sameTokens
}

/**
 * Mapa productId -> URL de imagen optimizada, calculado una sola vez al
 * cargar el módulo (no afecta el tiempo de arranque de forma perceptible:
 * son ~30 comparaciones de texto por producto, sin operaciones de red).
 */
export function buildProductImageMap(products: Product[]): Record<string, string> {
  const map: Record<string, string> = {}

  for (const photo of photos) {
    let matches = products.filter((product) => rawIsMatch(photo, product))

    // Si la foto es una sola palabra genérica (ej. "sirloin.jpg") y coincide
    // con más de un producto (ej. "Sirloin (600g)" Y "Hamburguesa de
    // Sirloin"), preferir sólo aquellos donde esa palabra es la principal
    // (primera) del NOMBRE del producto. Así el corte puro se queda con su
    // foto y no se la "roba" un plato que sólo lo menciona como ingrediente.
    if (photo.tokens.length === 1 && matches.length > 1) {
      const word = photo.tokens[0]
      const narrowed = matches.filter((product) => {
        const head = normalizeToTokens(product.name)[0] ?? ''
        return tokenEquals(head, word)
      })
      if (narrowed.length > 0) matches = narrowed
    }

    for (const product of matches) {
      if (!map[product.id]) map[product.id] = photo.url
    }
  }

  return map
}

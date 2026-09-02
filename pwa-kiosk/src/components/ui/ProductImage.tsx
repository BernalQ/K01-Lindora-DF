interface ProductImageProps {
  src?: string
  alt: string
  className?: string
  /**
   * 'default': tarjeta de producto del menú (180px). 'sm': miniatura
   * compacta (56px). 'md': miniatura intermedia (96px), usada en las
   * sugerencias de la pantalla de pago para mejorar su visibilidad sin
   * llegar al tamaño de una tarjeta completa del menú. 'fill': ocupa el
   * 100% del ancho del contenedor padre con proporción cuadrada fija
   * (`aspect-square`), usada en los mini boxes de sugerencias de la
   * pantalla de Revisión de Pedido para que la imagen se ajuste al tamaño
   * real de cada box (según cuántas columnas entren en la grilla) y todas
   * queden con el mismo tamaño relativo y la misma proporción entre sí.
   */
  size?: 'default' | 'sm' | 'md' | 'fill'
}

/**
 * Foto de producto para el menú táctil.
 * - Contenedor de tamaño fijo (misma relación de aspecto y misma altura para
 *   todos los items, 180px por defecto, 56px en tamaño `sm`), con
 *   `object-contain` para que la foto se ajuste completa dentro del bloque
 *   sin recortes bruscos. Las fotos originales no comparten la misma
 *   proporción entre sí (algunas son más panorámicas, otras más cuadradas),
 *   así que `object-contain` conserva siempre la proporción real de cada
 *   una (nunca se ve estirada ni recortada); el contenedor centra la
 *   imagen en ambos ejes (`flex items-center justify-center`) y el
 *   espacio sobrante que deja el "letterbox" se rellena con el mismo fondo
 *   neutro del bloque, así que ese espacio se ve intencional y no como un
 *   recorte irregular.
 * - Fondo neutro detrás de la imagen (o del placeholder cuando no hay foto).
 * - `loading="lazy"` + `decoding="async"` para no afectar el rendimiento del PWA:
 *   las fotos fuera de pantalla no se descargan hasta que el usuario se acerca a ellas.
 */
export default function ProductImage({ src, alt, className = '', size = 'default' }: ProductImageProps) {
  const contenedor =
    size === 'sm'
      ? 'h-14 w-14 shrink-0 rounded-xl'
      : size === 'md'
        ? 'h-24 w-24 shrink-0 rounded-xl'
        : size === 'fill'
          ? 'aspect-square w-full rounded-xl'
          : 'aspect-4/3 h-[180px] w-full'
  const icono = size === 'sm' ? 'h-6 w-6' : size === 'md' || size === 'fill' ? 'h-10 w-10' : 'h-14 w-14'

  return (
    <div
      className={`flex items-center justify-center overflow-hidden bg-linear-to-br from-wood-100 to-wood-200 ${contenedor} ${className}`}
    >
      {src ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-contain"
        />
      ) : (
        <svg
          className={`${icono} text-wood-500/60`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8.25 3v6a2.25 2.25 0 0 0 2.25 2.25v9.75M8.25 3a2.25 2.25 0 0 0-2.25 2.25V9M8.25 3v6M15.75 3v18M15.75 3a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3"
          />
        </svg>
      )}
    </div>
  )
}

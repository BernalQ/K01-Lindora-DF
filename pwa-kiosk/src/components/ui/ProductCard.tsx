import { productDisplayDescription, productDisplayName, productDisplayTitle, productImage } from '../../data/catalog'
import { useCartStore } from '../../store/cartStore'
import type { Product } from '../../types/catalog'
import { useLanguage } from '../../context/useLanguage'
import PrecioConIvi from './PrecioConIvi'
import ProductImage from './ProductImage'

interface ProductCardProps {
  product: Product
  onPersonalizar: (product: Product) => void
}

export default function ProductCard({ product, onPersonalizar }: ProductCardProps) {
  const { language, t } = useLanguage()
  const addSimpleItem = useCartStore((s) => s.addSimpleItem)

  const esPersonalizable =
    product.requiresTermino ||
    (product.variantes && product.variantes.length > 0) ||
    (product.opcionUnica && product.opcionUnica.length > 0) ||
    (product.extras && product.extras.length > 0)

  return (
    <div className="relative flex flex-col overflow-hidden rounded-2xl bg-white shadow-md shadow-wood-900/10">
      {/* Insignia "Agotado": producto marcado desde el panel de
          administración (ver AdminScreen). El producto sigue visible en el
          menú (no se oculta), pero no puede agregarse al pedido. */}
      {product.agotado && (
        <span className="absolute top-2 left-2 z-10 rounded-full bg-wood-950/90 px-3 py-1 text-xs font-bold tracking-wide text-cream-50 uppercase">
          {t('productCard.agotado')}
        </span>
      )}

      <ProductImage src={productImage(product)} alt={productDisplayName(product, language)} />

      <div className={`flex flex-1 flex-col p-3 ${product.agotado ? 'opacity-60' : ''}`}>
        <div className="flex flex-col gap-0.5">
          <h3 className="text-sm leading-tight font-semibold text-wood-900">
            {productDisplayTitle(product, language)}
          </h3>
          {productDisplayDescription(product, language) && (
            <p
              className={
                product.descripcionResaltada
                  ? 'text-xs font-bold text-brand-red'
                  : 'text-xs text-wood-600'
              }
            >
              {productDisplayDescription(product, language)}
            </p>
          )}
          <PrecioConIvi monto={product.price} className="mt-1 text-base font-bold text-brand-red" />
        </div>

        {/* Botón "Agregar"/"Personalizar" siempre alineado al fondo del bloque,
            sin importar cuántas líneas ocupe el nombre/descripción arriba. */}
        <div className="mt-auto pt-2">
          {esPersonalizable ? (
            <button
              type="button"
              onClick={() => onPersonalizar(product)}
              disabled={product.agotado}
              className="w-full rounded-xl bg-wood-900 py-2 text-sm font-semibold text-cream-50 transition-transform active:scale-95 disabled:cursor-not-allowed disabled:active:scale-100"
            >
              {t('productCard.customize')}
            </button>
          ) : (
            // Sin controles de "–"/"+" aquí: cada click en "Agregar" suma
            // directamente el producto a la columna izquierda (revisión de
            // pedido), donde vive el control de cantidad de esa línea.
            <button
              type="button"
              onClick={() => addSimpleItem(product, language)}
              disabled={product.agotado}
              className="w-full rounded-xl bg-brand-red py-2 text-sm font-semibold text-white transition-transform active:scale-95 disabled:cursor-not-allowed disabled:active:scale-100"
            >
              {t('productCard.add')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

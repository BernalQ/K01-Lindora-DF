import { useEffect, useState } from 'react'
import logoBadge from '../../assets/logo/optimized/logo-badge.png'
import {
  CATEGORIES,
  PRODUCTS,
  categoryDisplayName,
  guarnicionesResumen,
  opcionParaMostrar,
} from '../../data/catalog'
import ProductCard from '../ui/ProductCard'
import PersonalizarModal from '../ui/PersonalizarModal'
import PrecioConIvi from '../ui/PrecioConIvi'
import { cartTotal, lineTerminosTexto, useCartStore, type CartLine } from '../../store/cartStore'
import { useMesaStore } from '../../store/mesaStore'
import type { CategoryId, Language, Product } from '../../types/catalog'
import { useLanguage } from '../../context/LanguageContext'

/**
 * Resume, en un solo texto, los detalles de personalización de una línea
 * del carrito (término de cocción, corte y guarniciones). Devuelve `null`
 * cuando la línea no tiene ninguna personalización, para no mostrar una
 * sublínea vacía.
 */
function detallesPersonalizacion(
  line: CartLine,
  language: Language,
  terminoLabel: (termino: string) => string,
  comensalLabel: (n: number) => string,
): string | null {
  const partes: string[] = []
  const opcionMostrar = opcionParaMostrar(line.productId, line.opcion)
  if (opcionMostrar) partes.push(opcionMostrar)
  if (line.corte) partes.push(line.corte)
  const terminoTexto = lineTerminosTexto(line, terminoLabel, comensalLabel)
  if (terminoTexto) partes.push(terminoTexto)
  if (line.guarniciones && line.guarniciones.length > 0) {
    partes.push(guarnicionesResumen(line.guarniciones, language))
  }
  if (line.extras && line.extras.length > 0) {
    partes.push(line.extras.join(', '))
  }
  return partes.length > 0 ? partes.join(' · ') : null
}

interface MenuScreenProps {
  onContinuarAlPago: () => void
}

/**
 * Pantalla unificada de menú + revisión de pedido, en dos columnas:
 * - Columna izquierda (más angosta): revisión del pedido en tiempo real.
 * - Columna derecha (más ancha): menú interactivo por categorías.
 *
 * Reemplaza el flujo anterior de pantallas separadas
 * (CatalogScreen → CustomizeScreen/VariantScreen → CartScreen): la
 * personalización de producto ahora ocurre en un pop-up (`PersonalizarModal`)
 * sin salir de esta pantalla, y el carrito (Zustand `useCartStore`) sigue
 * siendo la única fuente de verdad, por lo que se actualiza automáticamente
 * en ambas columnas sin pasos adicionales.
 */
export default function MenuScreen({ onContinuarAlPago }: MenuScreenProps) {
  const { language, t, terminoLabel } = useLanguage()
  const [categoriaActiva, setCategoriaActiva] = useState<CategoryId>(CATEGORIES[0].id)
  const [productoPersonalizar, setProductoPersonalizar] = useState<Product | null>(null)

  const lines = useCartStore((s) => s.lines)
  const mesa = useCartStore((s) => s.mesa)
  const setMesa = useCartStore((s) => s.setMesa)
  const incrementLine = useCartStore((s) => s.incrementLine)
  const decrementLine = useCartStore((s) => s.decrementLine)
  const addCustomLine = useCartStore((s) => s.addCustomLine)

  const mesaId = useMesaStore((s) => s.mesaId)

  // El ID de mesa ya quedó fijo desde `MesaSetupScreen` (siempre se elige de
  // la lista de razas de ganado, tanto en mesa simple como compartida); lo
  // sincronizamos hacia `cartStore.mesa` para que el resto del flujo (pago,
  // tickets) siga leyendo `cartStore.mesa` sin cambios.
  useEffect(() => {
    if (mesaId) {
      setMesa(mesaId)
    }
  }, [mesaId, setMesa])

  const productos = PRODUCTS.filter((p) => p.categoryId === categoriaActiva)
  const total = cartTotal(lines)
  const puedeContinuar = lines.length > 0 && mesa.trim().length > 0

  const handleConfirmarPersonalizacion = (lineasNuevas: CartLine[]) => {
    lineasNuevas.forEach(addCustomLine)
    setProductoPersonalizar(null)
  }

  return (
    <div className="flex h-full min-h-screen w-full flex-col bg-cream-50">
      {/* Header */}
      <header className="relative flex shrink-0 items-center justify-center bg-wood-950 px-6 py-3">
        <span className="absolute left-6 text-lg font-bold tracking-wide text-cream-50 sm:text-xl">
          Carnes Don Fernando
        </span>
        <img src={logoBadge} alt="Carnes Don Fernando" className="h-14 w-14 sm:h-16 sm:w-16" />
        <h1 className="absolute right-6 text-lg font-extrabold tracking-widest text-cream-50 sm:text-xl">
          {t('catalog.menuTitle')}
        </h1>
      </header>

      {/* Cuerpo: dos columnas en pantallas medianas+, apiladas en móvil */}
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Columna izquierda: revisión del pedido */}
        <aside className="flex min-h-0 w-full flex-col border-b border-wood-100 bg-white md:w-[380px] md:shrink-0 md:border-r md:border-b-0 lg:w-[420px]">
          <div className="shrink-0 px-5 pt-5">
            <h2 className="text-xl font-bold text-wood-900">{t('cart.title')}</h2>
          </div>

          {/* ID de mesa: siempre fijo, elegido en MesaSetupScreen (lista de razas de ganado). */}
          <div className="shrink-0 px-5 pt-4">
            <div className="rounded-xl border-2 border-brand-red/30 bg-brand-red/5 px-4 py-3">
              <span className="block text-xs font-bold tracking-wide text-brand-red uppercase">
                {t('cart.tableIdLabel')}
              </span>
              <span className="block text-xl font-extrabold text-wood-900">{mesaId}</span>
            </div>
          </div>

          {lines.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 px-5 py-10 text-center">
              <p className="text-base text-wood-500">{t('cart.empty')}</p>
            </div>
          ) : (
            <>
              {/* Líneas del pedido: una fila minimalista por producto, con
                  una sublínea de detalles cuando el producto está
                  personalizado (término, corte, guarniciones). */}
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
                <div className="flex flex-col">
                  {lines.map((line) => {
                    const detalle = detallesPersonalizacion(line, language, terminoLabel, (n) =>
                      t('customize.comensalSuffix', { n }),
                    )
                    return (
                    <div
                      key={line.id}
                      className="flex flex-col gap-0.5 border-b border-wood-100 py-3 last:border-0"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-wood-900">
                          {line.variante ?? line.name}
                        </span>
                        <div className="flex shrink-0 items-center gap-2">
                          <div className="flex items-center gap-1.5 rounded-lg bg-wood-100 px-1 py-0.5">
                            <button
                              type="button"
                              onClick={() => decrementLine(line.id)}
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-base font-bold text-wood-900 transition-transform active:scale-90"
                              aria-label={t('common.removeOne')}
                            >
                              –
                            </button>
                            <span className="w-4 text-center text-sm font-bold text-wood-900">
                              {line.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => incrementLine(line.id)}
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-base font-bold text-wood-900 transition-transform active:scale-90"
                              aria-label={t('common.addOne')}
                            >
                              +
                            </button>
                          </div>
                          <PrecioConIvi
                            monto={line.price * line.quantity}
                            className="min-w-16 shrink-0 whitespace-nowrap text-right text-sm font-bold text-brand-red"
                          />
                        </div>
                      </div>
                      {detalle && <span className="text-xs text-wood-500">{detalle}</span>}
                    </div>
                    )
                  })}
                </div>
              </div>

              {/* Subtotal y CTA */}
              <div className="flex shrink-0 flex-col gap-3 border-t border-wood-100 bg-wood-950 p-5">
                <div className="flex items-center justify-between text-cream-50">
                  <span className="text-base">{t('cart.total')}</span>
                  <PrecioConIvi monto={total} className="text-2xl font-bold" />
                </div>
                <button
                  type="button"
                  onClick={onContinuarAlPago}
                  disabled={!puedeContinuar}
                  className={`rounded-2xl py-4 text-lg font-bold transition-transform ${
                    puedeContinuar
                      ? 'bg-brand-red text-white active:scale-98'
                      : 'bg-wood-800 text-wood-500'
                  }`}
                >
                  {mesa.trim().length === 0 ? t('cart.enterTable') : t('cart.continueToPayment')}
                </button>
              </div>
            </>
          )}
        </aside>

        {/* Columna derecha: menú interactivo */}
        <main className="flex min-h-0 flex-1 flex-col">
          {/* Tabs de categoría */}
          <nav className="flex shrink-0 gap-3 overflow-x-auto bg-wood-900 px-6 py-4">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategoriaActiva(cat.id)}
                className={`shrink-0 rounded-full px-6 py-3 text-base font-semibold whitespace-nowrap transition-colors ${
                  categoriaActiva === cat.id
                    ? 'bg-brand-red text-white'
                    : 'bg-wood-800 text-cream-200'
                }`}
              >
                {categoryDisplayName(cat, language)}
              </button>
            ))}
          </nav>

          {/* Grid de productos */}
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {productos.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onPersonalizar={setProductoPersonalizar}
                />
              ))}
            </div>
          </div>
        </main>
      </div>

      {/* Pop-up de personalización */}
      {productoPersonalizar && (
        <PersonalizarModal
          key={productoPersonalizar.id}
          product={productoPersonalizar}
          onClose={() => setProductoPersonalizar(null)}
          onConfirmar={handleConfirmarPersonalizacion}
        />
      )}
    </div>
  )
}

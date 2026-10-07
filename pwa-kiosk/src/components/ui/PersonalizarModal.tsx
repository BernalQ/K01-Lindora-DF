import { useState } from 'react'
import {
  GUARNICIONES,
  guarnicionDisplayName,
  productDisplayDescription,
  productDisplayName,
} from '../../data/catalog'
import {
  comensalesDe,
  construirLineaOpcionUnica,
  construirLineasTermino,
  construirLineasVariante,
  type VariantSeleccion,
} from '../../data/cartLineBuilders'
import type { CartLine } from '../../store/cartStore'
import type { GuarnicionSeleccionada, Product, TerminoCoccion } from '../../types/catalog'
import { TERMINOS_COCCION } from '../../types/catalog'
import { useLanguage } from '../../context/useLanguage'
import PrecioConIvi from './PrecioConIvi'

interface PersonalizarModalProps {
  product: Product
  onClose: () => void
  onConfirmar: (lineas: CartLine[]) => void
}

/**
 * Pop-up de personalización de producto: combina la selección de
 * término de cocción + acompañamientos (antes `CustomizeScreen`) y la
 * selección de variantes/sabor + cantidad (antes `VariantScreen`) en un
 * único componente modal, según lo que requiera el producto.
 *
 * Se monta con `key={product.id}` desde `MenuScreen`, así que cada vez que
 * se abre para un producto distinto (o se vuelve a abrir) arranca con
 * estado limpio sin necesidad de lógica de reseteo manual.
 */
export default function PersonalizarModal({ product, onClose, onConfirmar }: PersonalizarModalProps) {
  const { language, t } = useLanguage()
  const esOpcionUnica = Boolean(product.opcionUnica && product.opcionUnica.length > 0)
  const esVariante = Boolean(product.variantes && product.variantes.length > 0)

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full flex-col overflow-hidden rounded-t-3xl bg-cream-50 sm:max-w-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <header className="flex items-center gap-4 bg-wood-950 px-6 py-4">
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-cream-50">{productDisplayName(product, language)}</h1>
            <PrecioConIvi monto={product.price} className="text-brand-red-light font-bold" />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-wood-800 text-cream-50 transition-transform active:scale-90"
            aria-label={t('personalizar.cancelar')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        {esOpcionUnica ? (
          <OpcionUnicaBody product={product} onClose={onClose} onConfirmar={onConfirmar} />
        ) : esVariante ? (
          <VarianteBody product={product} onClose={onClose} onConfirmar={onConfirmar} />
        ) : (
          <TerminoBody product={product} onClose={onClose} onConfirmar={onConfirmar} />
        )}
      </div>
    </div>
  )
}

/**
 * Cuerpo del pop-up para productos con opción única obligatoria (ej. "Con
 * mantequilla" / "Sin mantequilla"): botones de selección única (no
 * stepper de cantidad, a diferencia de `VarianteBody`) — el cliente debe
 * elegir exactamente una opción para poder confirmar.
 */
function OpcionUnicaBody({ product, onClose, onConfirmar }: PersonalizarModalProps) {
  const { language, t } = useLanguage()
  const [seleccion, setSeleccion] = useState<string | null>(null)
  const opciones = product.opcionUnica ?? []
  const isValid = seleccion !== null

  const handleConfirm = () => {
    if (!isValid) return
    const lineas = construirLineaOpcionUnica(product, seleccion, language)
    onConfirmar(lineas)
  }

  return (
    <>
      <main className="flex-1 overflow-y-auto p-6">
        <section>
          <h2 className="mb-4 text-lg font-bold text-wood-900">{t('customize.chooseOne')}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {opciones.map((opcion) => (
              <button
                key={opcion}
                type="button"
                onClick={() => setSeleccion(opcion)}
                aria-pressed={seleccion === opcion}
                className={`rounded-xl px-4 py-5 text-base font-semibold transition-colors ${
                  seleccion === opcion
                    ? 'bg-brand-red text-white'
                    : 'bg-white text-wood-900 shadow-sm shadow-wood-900/10'
                }`}
              >
                {opcion}
              </button>
            ))}
          </div>
        </section>
      </main>

      <Footer isValid={isValid} onClose={onClose} onConfirm={handleConfirm} />
    </>
  )
}

/**
 * Sub-selector que aparece dentro de `TerminoBody` cuando el cliente elige
 * una guarnición incluida que exige personalización obligatoria (ej. "Con
 * Natilla" / "Con Mantequilla" / "Sin Natilla ni Mantequilla" para Papa
 * Asada, o el aderezo de Ensalada Jardinera): reemplaza temporalmente la
 * grilla de guarniciones hasta que el cliente elige una opción o vuelve
 * atrás sin elegir.
 */
function GuarnicionOpcionPicker({
  guarnicion,
  seleccionActual,
  onElegir,
  onVolver,
}: {
  guarnicion: Product
  seleccionActual: string | null
  onElegir: (opcion: string) => void
  onVolver: () => void
}) {
  const { language, t } = useLanguage()
  const opciones = guarnicion.opcionUnica ?? []

  return (
    <div className="rounded-xl border-2 border-wood-100 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-base font-bold text-wood-900">
          {t('customize.chooseOneFor', { nombre: guarnicionDisplayName(guarnicion.id, language) })}
        </h3>
        <button
          type="button"
          onClick={onVolver}
          className="shrink-0 text-sm font-semibold text-wood-500 underline"
        >
          {t('personalizar.volver')}
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {opciones.map((opcion) => (
          <button
            key={opcion}
            type="button"
            onClick={() => onElegir(opcion)}
            aria-pressed={seleccionActual === opcion}
            className={`rounded-xl px-4 py-4 text-base font-semibold transition-colors ${
              seleccionActual === opcion
                ? 'bg-brand-red text-white'
                : 'bg-wood-50 text-wood-900 shadow-sm shadow-wood-900/10'
            }`}
          >
            {opcion}
          </button>
        ))}
      </div>
    </div>
  )
}

function TerminoBody({ product, onClose, onConfirmar }: PersonalizarModalProps) {
  const { language, t, terminoLabel } = useLanguage()
  const numComensales = comensalesDe(product)
  const [terminos, setTerminos] = useState<(TerminoCoccion | null)[]>(() =>
    Array.from({ length: product.requiresTermino ? numComensales : 0 }, () => null),
  )
  const [guarniciones, setGuarniciones] = useState<GuarnicionSeleccionada[]>([])
  const [extras, setExtras] = useState<string[]>([])
  // Id de la guarnición esperando que el cliente elija su opción de
  // personalización obligatoria (ej. "Con Natilla" para Papa Asada) antes de
  // quedar agregada/incrementada. `null` cuando no hay ninguna pendiente.
  const [guarnicionPendiente, setGuarnicionPendiente] = useState<string | null>(null)

  const permiteGuarniciones = product.includedGuarniciones > 0
  const maxGuarniciones = product.includedGuarniciones
  const seleccionUnica = maxGuarniciones === 1
  const opcionesExtras = product.extras ?? []

  const alternarExtra = (opcion: string) => {
    setExtras((prev) =>
      prev.includes(opcion) ? prev.filter((valor) => valor !== opcion) : [...prev, opcion],
    )
  }

  const seleccionarTermino = (index: number, opcion: TerminoCoccion) => {
    setTerminos((prev) => prev.map((valor, i) => (i === index ? opcion : valor)))
  }

  const requiereOpcion = (id: string) => {
    const guarnicion = GUARNICIONES.find((g) => g.id === id)
    return Boolean(guarnicion?.opcionUnica && guarnicion.opcionUnica.length > 0)
  }

  const seleccionarGuarnicionUnica = (id: string) => {
    if (requiereOpcion(id)) {
      setGuarnicionPendiente(id)
      return
    }
    setGuarniciones([{ id }])
  }

  const contarGuarnicion = (id: string) => guarniciones.filter((g) => g.id === id).length

  const agregarGuarnicion = (id: string) => {
    if (guarniciones.length >= maxGuarniciones) return
    if (requiereOpcion(id)) {
      setGuarnicionPendiente(id)
      return
    }
    setGuarniciones((prev) => [...prev, { id }])
  }

  const quitarGuarnicion = (id: string) => {
    setGuarniciones((prev) => {
      const index = [...prev].reverse().findIndex((g) => g.id === id)
      if (index === -1) return prev
      const realIndex = prev.length - 1 - index
      return [...prev.slice(0, realIndex), ...prev.slice(realIndex + 1)]
    })
  }

  /** Confirma la opción elegida para `guarnicionPendiente`: reemplaza la selección única, o agrega una unidad más en el caso de varias guarniciones incluidas. */
  const confirmarOpcionGuarnicion = (opcion: string) => {
    if (!guarnicionPendiente) return
    if (seleccionUnica) {
      setGuarniciones([{ id: guarnicionPendiente, opcion }])
    } else {
      setGuarniciones((prev) => [...prev, { id: guarnicionPendiente, opcion }])
    }
    setGuarnicionPendiente(null)
  }

  const isValid =
    terminos.every((valor) => valor !== null) &&
    (!permiteGuarniciones || guarniciones.length >= 1) &&
    guarnicionPendiente === null

  const handleConfirm = () => {
    if (!isValid) return
    const lineas = construirLineasTermino(
      product,
      terminos as TerminoCoccion[],
      guarniciones,
      language,
      extras,
    )
    onConfirmar(lineas)
  }

  return (
    <>
      <main className="flex-1 overflow-y-auto p-6">
        {terminos.length > 0 && (
          <section className="mb-8 flex flex-col gap-8">
            {terminos.map((valor, index) => (
              <div key={index}>
                <h2 className="mb-4 text-lg font-bold text-wood-900">
                  {numComensales > 1
                    ? t('customize.terminoComensal', { n: index + 1 })
                    : t('common.terminoCoccion')}
                </h2>
                {/* `sm:grid-cols-5` (antes 4): ahora hay 5 términos
                    (se agregó "Azul" a la izquierda de "Rojo"), así que se
                    ajusta a 5 columnas en pantallas medianas+ para que
                    todas las opciones sigan cabiendo en una sola fila. */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  {TERMINOS_COCCION.map((opcion) => (
                    <button
                      key={opcion}
                      type="button"
                      onClick={() => seleccionarTermino(index, opcion)}
                      className={`rounded-xl px-4 py-5 text-base font-semibold transition-colors ${
                        valor === opcion
                          ? 'bg-brand-red text-white'
                          : 'bg-white text-wood-900 shadow-sm shadow-wood-900/10'
                      }`}
                    >
                      {terminoLabel(opcion)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        {permiteGuarniciones && (
          <section>
            <h2 className="mb-1 text-lg font-bold text-wood-900">{t('customize.acompanamientos')}</h2>
            <p className="mb-4 text-sm text-wood-600">
              {seleccionUnica
                ? t('customize.includeOne')
                : t('customize.includeMany', {
                    max: maxGuarniciones,
                    count: guarniciones.length,
                  })}
            </p>
            {guarnicionPendiente ? (
              <GuarnicionOpcionPicker
                guarnicion={GUARNICIONES.find((g) => g.id === guarnicionPendiente) as Product}
                seleccionActual={
                  seleccionUnica
                    ? (guarniciones.find((g) => g.id === guarnicionPendiente)?.opcion ?? null)
                    : null
                }
                onElegir={confirmarOpcionGuarnicion}
                onVolver={() => setGuarnicionPendiente(null)}
              />
            ) : seleccionUnica ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {GUARNICIONES.map((g) => {
                  const seleccion = guarniciones.find((sel) => sel.id === g.id)
                  const selected = Boolean(seleccion)
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => seleccionarGuarnicionUnica(g.id)}
                      className={`rounded-xl px-4 py-5 text-left text-base font-semibold transition-colors ${
                        selected
                          ? 'bg-wood-900 text-cream-50'
                          : 'bg-white text-wood-900 shadow-sm shadow-wood-900/10'
                      }`}
                    >
                      <span className="block">{guarnicionDisplayName(g.id, language)}</span>
                      {seleccion?.opcion && (
                        <span className="mt-0.5 block text-xs font-normal opacity-80">{seleccion.opcion}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {GUARNICIONES.map((g) => {
                  const count = contarGuarnicion(g.id)
                  const puedeAgregar = guarniciones.length < maxGuarniciones
                  const opcionesElegidas = guarniciones
                    .filter((sel) => sel.id === g.id && sel.opcion)
                    .map((sel) => sel.opcion as string)
                  return (
                    <div
                      key={g.id}
                      className="flex flex-col gap-1 rounded-xl bg-white px-4 py-3 shadow-sm shadow-wood-900/10"
                    >
                      <div className="flex items-center justify-between text-left text-base font-semibold text-wood-900">
                        <span>{guarnicionDisplayName(g.id, language)}</span>
                        <div className="flex items-center gap-1 rounded-xl bg-wood-100">
                          <button
                            type="button"
                            onClick={() => quitarGuarnicion(g.id)}
                            disabled={count === 0}
                            aria-label={t('common.removeOne')}
                            className="flex h-9 w-9 items-center justify-center rounded-xl text-lg font-bold text-wood-900 transition-transform active:scale-90 disabled:opacity-30"
                          >
                            –
                          </button>
                          <span className="w-5 text-center text-base font-bold text-wood-900">{count}</span>
                          <button
                            type="button"
                            onClick={() => agregarGuarnicion(g.id)}
                            disabled={!puedeAgregar}
                            aria-label={t('common.addOne')}
                            className="flex h-9 w-9 items-center justify-center rounded-xl text-lg font-bold text-wood-900 transition-transform active:scale-90 disabled:opacity-30"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      {opcionesElegidas.length > 0 && (
                        <span className="text-xs text-wood-500">{opcionesElegidas.join(', ')}</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )}

        {opcionesExtras.length > 0 && (
          <section className={permiteGuarniciones ? 'mt-8' : undefined}>
            <h2 className="mb-1 text-lg font-bold text-wood-900">{t('customize.extras')}</h2>
            <p className="mb-4 text-sm text-wood-600">{t('customize.extrasHint')}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {opcionesExtras.map((opcion) => {
                const selected = extras.includes(opcion)
                return (
                  <button
                    key={opcion}
                    type="button"
                    onClick={() => alternarExtra(opcion)}
                    aria-pressed={selected}
                    className={`rounded-xl px-4 py-4 text-left text-base font-semibold transition-colors ${
                      selected
                        ? 'bg-wood-900 text-cream-50'
                        : 'bg-white text-wood-900 shadow-sm shadow-wood-900/10'
                    }`}
                  >
                    {opcion}
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {!permiteGuarniciones && productDisplayDescription(product, language) && (
          <p className="text-base text-wood-600">
            {t('customize.includes', { description: productDisplayDescription(product, language) ?? '' })}
          </p>
        )}
      </main>

      <Footer isValid={isValid} onClose={onClose} onConfirm={handleConfirm} />
    </>
  )
}

function VarianteBody({ product, onClose, onConfirmar }: PersonalizarModalProps) {
  const { language, t } = useLanguage()
  const [cantidades, setCantidades] = useState<Record<string, number>>({})

  const opciones = product.variantes ?? []
  const totalUnidades = Object.values(cantidades).reduce((sum, c) => sum + c, 0)
  const isValid = totalUnidades > 0

  const sumar = (opcion: string) => {
    setCantidades((prev) => ({ ...prev, [opcion]: (prev[opcion] ?? 0) + 1 }))
  }

  const restar = (opcion: string) => {
    setCantidades((prev) => {
      const actual = prev[opcion] ?? 0
      if (actual <= 1) {
        const { [opcion]: _omit, ...resto } = prev
        return resto
      }
      return { ...prev, [opcion]: actual - 1 }
    })
  }

  const handleConfirm = () => {
    if (!isValid) return
    const selecciones: VariantSeleccion[] = opciones
      .filter((opcion) => (cantidades[opcion] ?? 0) > 0)
      .map((opcion) => ({ variante: opcion, cantidad: cantidades[opcion] }))
    const lineas = construirLineasVariante(product, selecciones, language)
    onConfirmar(lineas)
  }

  return (
    <>
      <main className="flex-1 overflow-y-auto p-6">
        <section>
          <h2 className="mb-1 text-lg font-bold text-wood-900">{t('variant.chooseOptions')}</h2>
          <p className="mb-4 text-sm text-wood-600">
            {t('variant.addQuantity', { count: totalUnidades })}
          </p>
          <div className="flex flex-col gap-3">
            {opciones.map((opcion) => {
              const cantidad = cantidades[opcion] ?? 0
              const seleccionado = cantidad > 0
              return (
                <div
                  key={opcion}
                  className={`flex items-center justify-between rounded-xl px-4 py-4 transition-colors ${
                    seleccionado
                      ? 'bg-wood-900 text-cream-50'
                      : 'bg-white text-wood-900 shadow-sm shadow-wood-900/10'
                  }`}
                >
                  <span className="text-base font-semibold">{opcion}</span>
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => restar(opcion)}
                      disabled={cantidad === 0}
                      className={`flex h-11 w-11 items-center justify-center rounded-lg text-xl font-bold transition-transform active:scale-90 ${
                        seleccionado ? 'bg-wood-800 text-cream-50' : 'bg-wood-100 text-wood-400'
                      } disabled:opacity-40`}
                      aria-label={t('variant.removeOneOf', { opcion })}
                    >
                      –
                    </button>
                    <span className="w-6 text-center text-lg font-bold">{cantidad}</span>
                    <button
                      type="button"
                      onClick={() => sumar(opcion)}
                      className={`flex h-11 w-11 items-center justify-center rounded-lg text-xl font-bold transition-transform active:scale-90 ${
                        seleccionado ? 'bg-brand-red text-white' : 'bg-wood-100 text-wood-900'
                      }`}
                      aria-label={t('variant.addOneOf', { opcion })}
                    >
                      +
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </main>

      <Footer isValid={isValid} onClose={onClose} onConfirm={handleConfirm} />
    </>
  )
}

function Footer({
  isValid,
  onClose,
  onConfirm,
}: {
  isValid: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const { t } = useLanguage()
  return (
    <footer className="flex gap-3 border-t border-wood-100 bg-cream-50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <button
        type="button"
        onClick={onClose}
        className="flex-1 rounded-2xl bg-wood-100 py-4 text-lg font-bold text-wood-700 transition-transform active:scale-98"
      >
        {t('personalizar.cancelar')}
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={!isValid}
        className={`flex-[2] rounded-2xl py-4 text-lg font-bold shadow-lg shadow-black/10 transition-transform ${
          isValid ? 'bg-brand-red text-white active:scale-98' : 'bg-wood-200 text-wood-400'
        }`}
      >
        {t('personalizar.confirmar')}
      </button>
    </footer>
  )
}

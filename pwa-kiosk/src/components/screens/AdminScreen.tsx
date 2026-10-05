import { useEffect, useState } from 'react'
import { CATEGORIES, PRODUCTS, categoryDisplayName, formatCRC, productDisplayName } from '../../data/catalog'
import { actualizarAgotado, actualizarPrecio } from '../../services/catalogOverrides'
import { obtenerTodasLasVentas } from '../../services/offlineQueue'
import { enviarTicket } from '../../services/printBridge'
import { NOMBRES_IMPRESORA, generarTickets, ticketCierreCaja, type PrinterId, type TicketLine } from '../../services/tickets'
import TicketPopup from '../ui/TicketPopup'
import type { Product } from '../../types/catalog'
import type { VentaEnCola } from '../../types/order'
import { useLanguage } from '../../context/LanguageContext'

interface AdminScreenProps {
  onBack: () => void
}

/** Clave numérica válida para entrar al panel de administración (ver requerimiento del kiosko). */
const PIN_VALIDO = '123456'
const LARGO_PIN = 6

type VistaAdmin = 'menu' | 'precio' | 'agotado' | 'ordenes' | 'cierre'

/**
 * Pantalla de administración del kiosko, accesible desde el botón "ADMIN"
 * de `WelcomeScreen`. Queda protegida por una clave numérica de 6 dígitos
 * (`PinGate`); una vez desbloqueada, ofrece tres paneles:
 * - Cambiar precio de un producto.
 * - Marcar/desmarcar un producto como agotado.
 * - Ver las órdenes registradas hoy, con opción de reenviar impresión.
 *
 * Precio y agotado se aplican mutando directamente el array `PRODUCTS`
 * compartido (ver `services/catalogOverrides.ts`), así que el resto de la
 * app (menú, carrito, tickets) refleja el cambio de inmediato la próxima vez
 * que se monte esa pantalla, sin necesidad de una capa de estado adicional.
 */
export default function AdminScreen({ onBack }: AdminScreenProps) {
  const { t } = useLanguage()
  const [desbloqueado, setDesbloqueado] = useState(false)
  const [vista, setVista] = useState<VistaAdmin>('menu')

  if (!desbloqueado) {
    return <PinGate onDesbloqueado={() => setDesbloqueado(true)} onCancelar={onBack} />
  }

  return (
    <div className="flex h-full min-h-screen w-full flex-col bg-cream-50">
      <header className="flex shrink-0 items-center justify-between bg-wood-950 px-6 py-4">
        <button
          type="button"
          onClick={vista === 'menu' ? onBack : () => setVista('menu')}
          className="rounded-full bg-wood-800 px-4 py-2 text-sm font-semibold text-cream-50 transition-transform active:scale-95"
        >
          {vista === 'menu' ? t('admin.volverInicio') : t('admin.volverMenu')}
        </button>
        <h1 className="text-lg font-extrabold tracking-wide text-cream-50 sm:text-xl">{t('admin.menuTitle')}</h1>
        <span className="w-24" />
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-6">
        {vista === 'menu' && <MenuAdmin onSeleccionar={setVista} />}
        {vista === 'precio' && <PanelCambiarPrecio />}
        {vista === 'agotado' && <PanelMarcarAgotado />}
        {vista === 'ordenes' && <PanelOrdenesDelDia />}
        {vista === 'cierre' && <PanelCierreCaja />}
      </main>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Verificación de acceso: teclado numérico táctil de 6 dígitos.       */
/* ------------------------------------------------------------------ */

interface PinGateProps {
  onDesbloqueado: () => void
  onCancelar: () => void
}

function PinGate({ onDesbloqueado, onCancelar }: PinGateProps) {
  const { t } = useLanguage()
  const [pin, setPin] = useState('')
  const [error, setError] = useState(false)

  useEffect(() => {
    if (pin.length < LARGO_PIN) return
    if (pin === PIN_VALIDO) {
      onDesbloqueado()
      return
    }
    setError(true)
    const id = setTimeout(() => {
      setPin('')
      setError(false)
    }, 900)
    return () => clearTimeout(id)
  }, [pin, onDesbloqueado])

  const digitar = (d: string) => {
    if (error || pin.length >= LARGO_PIN) return
    setPin((prev) => prev + d)
  }

  const borrar = () => {
    if (error) return
    setPin((prev) => prev.slice(0, -1))
  }

  const teclas = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫']

  return (
    <div className="flex h-full min-h-screen w-full flex-col items-center justify-center gap-8 bg-gradient-to-b from-wood-950 via-wood-900 to-wood-950 px-6 text-cream-50">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold">{t('admin.pinTitle')}</h1>
        <p className="text-base text-cream-200/70">{t('admin.pinSubtitle')}</p>
      </div>

      {/* Indicador visual del avance: un punto por dígito ya ingresado. */}
      <div className="flex gap-3">
        {Array.from({ length: LARGO_PIN }).map((_, i) => (
          <span
            key={i}
            className={`h-4 w-4 rounded-full border-2 transition-colors ${
              i < pin.length
                ? error
                  ? 'border-red-400 bg-red-400'
                  : 'border-cream-50 bg-cream-50'
                : 'border-cream-50/30 bg-transparent'
            }`}
          />
        ))}
      </div>

      {error && <p className="text-sm font-semibold text-red-400">{t('admin.pinError')}</p>}

      <div className="grid grid-cols-3 gap-4">
        {teclas.map((tecla, i) =>
          tecla === '' ? (
            <span key={i} />
          ) : (
            <button
              key={i}
              type="button"
              onClick={() => (tecla === '⌫' ? borrar() : digitar(tecla))}
              aria-label={tecla === '⌫' ? t('admin.pinBorrar') : tecla}
              className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-cream-50/20 bg-white/5 text-2xl font-bold text-cream-50 transition-transform active:scale-90 sm:h-20 sm:w-20 sm:text-3xl"
            >
              {tecla}
            </button>
          ),
        )}
      </div>

      <button
        type="button"
        onClick={onCancelar}
        className="mt-2 text-sm font-semibold text-cream-50/50 underline underline-offset-4"
      >
        {t('admin.volverInicio')}
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Menú principal del panel: elegir entre las 3 opciones disponibles.  */
/* ------------------------------------------------------------------ */

function MenuAdmin({ onSeleccionar }: { onSeleccionar: (vista: VistaAdmin) => void }) {
  const { t } = useLanguage()
  const opciones: { vista: VistaAdmin; label: string }[] = [
    { vista: 'precio', label: t('admin.menuCambiarPrecio') },
    { vista: 'agotado', label: t('admin.menuMarcarAgotado') },
    { vista: 'ordenes', label: t('admin.menuVerOrdenes') },
    { vista: 'cierre', label: t('admin.menuCierreCaja') },
  ]

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      {opciones.map((op) => (
        <button
          key={op.vista}
          type="button"
          onClick={() => onSeleccionar(op.vista)}
          className="rounded-2xl bg-wood-900 px-6 py-6 text-left text-lg font-bold text-cream-50 shadow-md shadow-wood-900/10 transition-transform active:scale-98"
        >
          {op.label}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Código de artículo (Codisa): sólo para control interno del admin,   */
/* nunca se muestra en el menú visible al cliente (ver ProductCard).   */
/* ------------------------------------------------------------------ */

function CodigoArticulo({ product }: { product: Product }) {
  const { t } = useLanguage()
  return (
    <span className="font-mono text-xs text-wood-400">
      {product.codigoArticulo
        ? t('admin.codigoArticulo', { codigo: product.codigoArticulo })
        : t('admin.sinCodigoArticulo')}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Panel: Cambiar precio de un producto.                               */
/* ------------------------------------------------------------------ */

function PanelCambiarPrecio() {
  const { language, t } = useLanguage()
  const [seleccionado, setSeleccionado] = useState<Product | null>(null)
  const [nuevoPrecio, setNuevoPrecio] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirmacion, setConfirmacion] = useState<string | null>(null)

  const elegirProducto = (product: Product) => {
    setSeleccionado(product)
    setNuevoPrecio(String(product.price))
    setError(null)
    setConfirmacion(null)
  }

  const guardar = () => {
    if (!seleccionado) return
    const valor = Number(nuevoPrecio)
    if (!Number.isFinite(valor) || valor <= 0) {
      setError(t('admin.precioInvalido'))
      return
    }
    actualizarPrecio(PRODUCTS, seleccionado.id, Math.round(valor))
    setSeleccionado({ ...seleccionado, price: Math.round(valor) })
    setError(null)
    setConfirmacion(t('admin.precioActualizado'))
  }

  if (seleccionado) {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-bold text-wood-900">{productDisplayName(seleccionado, language)}</h2>
          <CodigoArticulo product={seleccionado} />
        </div>
        <p className="text-wood-600">{t('admin.precioActual', { precio: formatCRC(seleccionado.price) })}</p>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-wood-700">{t('admin.precioNuevoLabel')}</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={nuevoPrecio}
            onChange={(e) => {
              setNuevoPrecio(e.target.value)
              setConfirmacion(null)
            }}
            className="rounded-xl border-2 border-wood-200 px-4 py-3 text-lg font-semibold text-wood-900 outline-none focus:border-brand-red"
          />
        </label>

        {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
        {confirmacion && <p className="text-sm font-semibold text-green-700">{confirmacion}</p>}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setSeleccionado(null)}
            className="flex-1 rounded-xl bg-wood-100 py-3 text-base font-semibold text-wood-700 transition-transform active:scale-95"
          >
            {t('admin.precioCancelar')}
          </button>
          <button
            type="button"
            onClick={guardar}
            className="flex-1 rounded-xl bg-brand-red py-3 text-base font-semibold text-white transition-transform active:scale-95"
          >
            {t('admin.precioGuardar')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h2 className="text-lg font-bold text-wood-900">{t('admin.precioSeleccionar')}</h2>
      {CATEGORIES.map((cat) => {
        const productos = PRODUCTS.filter((p) => p.categoryId === cat.id)
        if (productos.length === 0) return null
        return (
          <div key={cat.id} className="flex flex-col gap-2">
            <h3 className="text-sm font-bold tracking-wide text-wood-500 uppercase">
              {categoryDisplayName(cat, language)}
            </h3>
            <div className="flex flex-col divide-y divide-wood-100 rounded-xl bg-white shadow-sm shadow-wood-900/5">
              {productos.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => elegirProducto(product)}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors active:bg-wood-50"
                >
                  <span className="flex flex-col">
                    <span className="font-semibold text-wood-900">{productDisplayName(product, language)}</span>
                    <CodigoArticulo product={product} />
                  </span>
                  <span className="font-bold text-brand-red">{formatCRC(product.price)}</span>
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Panel: Marcar producto como Agotado.                                */
/* ------------------------------------------------------------------ */

function PanelMarcarAgotado() {
  const { language, t } = useLanguage()
  // Contador simple para forzar un re-render tras cada toggle, ya que
  // `PRODUCTS` se muta en el sitio y no es un estado reactivo por sí mismo.
  const [, forceUpdate] = useState(0)

  const alternar = (product: Product) => {
    actualizarAgotado(PRODUCTS, product.id, !product.agotado)
    forceUpdate((n) => n + 1)
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h2 className="text-lg font-bold text-wood-900">{t('admin.agotadoTitle')}</h2>
      {CATEGORIES.map((cat) => {
        const productos = PRODUCTS.filter((p) => p.categoryId === cat.id)
        if (productos.length === 0) return null
        return (
          <div key={cat.id} className="flex flex-col gap-2">
            <h3 className="text-sm font-bold tracking-wide text-wood-500 uppercase">
              {categoryDisplayName(cat, language)}
            </h3>
            <div className="flex flex-col divide-y divide-wood-100 rounded-xl bg-white shadow-sm shadow-wood-900/5">
              {productos.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => alternar(product)}
                  className="flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors active:bg-wood-50"
                >
                  <span className="flex flex-col">
                    <span className="font-semibold text-wood-900">{productDisplayName(product, language)}</span>
                    <CodigoArticulo product={product} />
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-bold ${
                      product.agotado ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                    }`}
                  >
                    {product.agotado ? t('admin.agotadoAgotado') : t('admin.agotadoDisponible')}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Panel: Ver órdenes del día.                                         */
/* ------------------------------------------------------------------ */

function esDeHoy(fechaHora: string): boolean {
  const fecha = new Date(fechaHora)
  const hoy = new Date()
  return fecha.toDateString() === hoy.toDateString()
}

function PanelOrdenesDelDia() {
  const { t } = useLanguage()
  const [ventas, setVentas] = useState<VentaEnCola[] | null>(null)
  const [expandida, setExpandida] = useState<string | null>(null)

  useEffect(() => {
    obtenerTodasLasVentas().then((todas) => {
      const deHoy = todas
        .filter((v) => esDeHoy(v.venta.fechaHora))
        .sort((a, b) => b.venta.fechaHora.localeCompare(a.venta.fechaHora))
      setVentas(deHoy)
    })
  }, [])

  if (ventas === null) {
    return <p className="text-center text-wood-500">{t('admin.cargando')}</p>
  }

  if (ventas.length === 0) {
    return <p className="text-center text-wood-500">{t('admin.ordenesVacio')}</p>
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h2 className="text-lg font-bold text-wood-900">{t('admin.ordenesTitle')}</h2>
      <div className="flex flex-col gap-3">
        {ventas.map(({ venta }) => (
          <div key={venta.id} className="overflow-hidden rounded-xl bg-white shadow-sm shadow-wood-900/5">
            <button
              type="button"
              onClick={() => setExpandida(expandida === venta.id ? null : venta.id)}
              className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
            >
              <div className="flex flex-col">
                <span className="font-bold text-wood-900">#{venta.id}</span>
                <span className="text-sm text-wood-500">
                  {new Date(venta.fechaHora).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}
                  {' · '}
                  {t('admin.ordenesMesa', { mesa: venta.mesa })}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">
                  {venta.tipoPago === 'factura' ? t('admin.ordenesFactura') : t('admin.ordenesPagado')}
                </span>
                <span className="font-bold text-brand-red">{formatCRC(venta.total)}</span>
              </div>
            </button>
            {expandida === venta.id && <DetalleOrden venta={venta} />}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Orden fija de los botones de reimpresión, según lo pedido por el kiosko:
 * Cliente, Parrilla, Carnicería. `NOMBRES_IMPRESORA` (ver `services/tickets.ts`)
 * mantiene su propio orden de declaración (carniceria/restaurante/cliente)
 * por razones internas de ese archivo, así que acá se define un orden de
 * visualización separado sin tocar esa constante compartida.
 */
const ORDEN_IMPRESION: PrinterId[] = ['cliente', 'restaurante', 'carniceria']

/**
 * Estado de un envío de impresión. `'error'` significa que print-bridge SÍ
 * respondió pero la impresora física no (ver `enviarTicket` en
 * `services/printBridge.ts`), distinto de `'simulado'` (print-bridge mismo
 * no está corriendo, escenario normal en desarrollo sin hardware).
 */
type EstadoImpresion = 'enviando' | 'ok' | 'simulado' | 'error' | null

function DetalleOrden({ venta }: { venta: VentaEnCola['venta'] }) {
  const { t } = useLanguage()
  const [estadoEnvio, setEstadoEnvio] = useState<Record<PrinterId, EstadoImpresion>>({
    carniceria: null,
    restaurante: null,
    cliente: null,
  })
  const [erroresEnvio, setErroresEnvio] = useState<Partial<Record<PrinterId, string>>>({})

  const imprimir = async (printer: PrinterId) => {
    setEstadoEnvio((prev) => ({ ...prev, [printer]: 'enviando' }))
    setErroresEnvio((prev) => ({ ...prev, [printer]: undefined }))
    const tickets = generarTickets(venta)
    const resultado = await enviarTicket(printer, tickets[printer])
    if (!resultado.ok) {
      setEstadoEnvio((prev) => ({ ...prev, [printer]: 'error' }))
      setErroresEnvio((prev) => ({ ...prev, [printer]: resultado.error ?? t('admin.ordenesError') }))
      return
    }
    setEstadoEnvio((prev) => ({ ...prev, [printer]: resultado.simulado ? 'simulado' : 'ok' }))
  }

  return (
    <div className="border-t border-wood-100 bg-wood-50 px-4 py-4">
      <h3 className="mb-2 text-sm font-bold tracking-wide text-wood-500 uppercase">{t('admin.ordenesProductos')}</h3>
      <ul className="mb-4 flex flex-col gap-1">
        {venta.items.map((item, i) => (
          <li key={i} className="flex items-center justify-between text-sm text-wood-900">
            <span>
              {item.quantity}x {item.variante ?? item.name}
            </span>
            <span className="font-semibold">{formatCRC(item.price * item.quantity)}</span>
          </li>
        ))}
      </ul>

      <h3 className="mb-2 text-sm font-bold tracking-wide text-wood-500 uppercase">{t('admin.ordenesImprimirEn')}</h3>
      <div className="flex flex-wrap gap-3">
        {ORDEN_IMPRESION.map((printer) => {
          const estado = estadoEnvio[printer]
          return (
            <button
              key={printer}
              type="button"
              onClick={() => imprimir(printer)}
              disabled={estado === 'enviando'}
              className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-cream-50 transition-transform active:scale-95 disabled:opacity-50 ${
                estado === 'error' ? 'bg-red-700' : 'bg-wood-900'
              }`}
            >
              {NOMBRES_IMPRESORA[printer]}
              {estado === 'enviando' && ` · ${t('admin.ordenesEnviando')}`}
              {estado === 'ok' && ` · ${t('admin.ordenesEnviado')}`}
              {estado === 'simulado' && ` · ${t('admin.ordenesSimulado')}`}
              {estado === 'error' && ` · ${t('admin.ordenesError')}`}
            </button>
          )
        })}
      </div>
      {ORDEN_IMPRESION.map(
        (printer) =>
          erroresEnvio[printer] && (
            <p key={printer} className="mt-2 text-xs font-semibold text-red-700">
              {NOMBRES_IMPRESORA[printer]}: {erroresEnvio[printer]}
            </p>
          ),
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Panel: Cierre de caja — resume las ventas del día y envía el tiquete */
/* de cierre (ver `ticketCierreCaja` en `services/tickets.ts`).         */
/* ------------------------------------------------------------------ */

function PanelCierreCaja() {
  const { t } = useLanguage()
  const [ventas, setVentas] = useState<VentaEnCola[] | null>(null)
  const [estado, setEstado] = useState<EstadoImpresion>(null)
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)
  const [vistaPrevia, setVistaPrevia] = useState<TicketLine[] | null>(null)

  useEffect(() => {
    obtenerTodasLasVentas().then((todas) => {
      const deHoy = todas
        .filter((v) => esDeHoy(v.venta.fechaHora))
        .sort((a, b) => a.venta.fechaHora.localeCompare(b.venta.fechaHora))
      setVentas(deHoy)
    })
  }, [])

  if (ventas === null) {
    return <p className="text-center text-wood-500">{t('admin.cargando')}</p>
  }

  const total = ventas.reduce((suma, { venta }) => suma + venta.total, 0)

  // Se imprime en la estación "Cliente" (caja/front), la más lógica para un
  // tiquete de cierre dirigido al cajero, sin necesidad de agregar una
  // estación nueva (ver `PrinterId` en `services/tickets.ts`).
  const imprimirCierre = async () => {
    setEstado('enviando')
    setErrorEnvio(null)
    const ticket = ticketCierreCaja(ventas.map((v) => v.venta))
    const resultado = await enviarTicket('cliente', ticket)
    if (!resultado.ok) {
      setEstado('error')
      setErrorEnvio(resultado.error ?? t('admin.ordenesError'))
      return
    }
    setEstado(resultado.simulado ? 'simulado' : 'ok')
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h2 className="text-lg font-bold text-wood-900">{t('admin.cierreTitle')}</h2>

      {ventas.length === 0 ? (
        <p className="text-center text-wood-500">{t('admin.ordenesVacio')}</p>
      ) : (
        <div className="flex flex-col divide-y divide-wood-100 rounded-xl bg-white shadow-sm shadow-wood-900/5">
          {ventas.map(({ venta }) => (
            <div key={venta.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="font-mono text-sm text-wood-700">#{venta.id}</span>
              <span className="font-semibold text-wood-900">{formatCRC(venta.total)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between rounded-xl bg-wood-900 px-5 py-4">
        <span className="text-sm font-bold tracking-wide text-cream-100 uppercase">{t('admin.cierreTotal')}</span>
        <span className="text-xl font-extrabold text-cream-50">{formatCRC(total)}</span>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setVistaPrevia(ticketCierreCaja(ventas.map((v) => v.venta)))}
          disabled={ventas.length === 0}
          className="flex-1 rounded-2xl bg-wood-100 py-4 text-base font-bold text-wood-800 transition-transform active:scale-98 disabled:opacity-50"
        >
          {t('admin.cierreVistaPrevia')}
        </button>
        <button
          type="button"
          onClick={imprimirCierre}
          disabled={estado === 'enviando' || ventas.length === 0}
          className={`flex-1 rounded-2xl py-4 text-base font-bold text-white transition-transform active:scale-98 disabled:opacity-50 ${
            estado === 'error' ? 'bg-red-700' : 'bg-brand-red'
          }`}
        >
          {t('admin.cierreImprimir')}
          {estado === 'enviando' && ` · ${t('admin.ordenesEnviando')}`}
          {estado === 'ok' && ` · ${t('admin.ordenesEnviado')}`}
          {estado === 'simulado' && ` · ${t('admin.ordenesSimulado')}`}
          {estado === 'error' && ` · ${t('admin.ordenesError')}`}
        </button>
      </div>

      {errorEnvio && <p className="text-center text-sm font-semibold text-red-700">{errorEnvio}</p>}

      {vistaPrevia && (
        <TicketPopup
          titulo={t('admin.cierreTitle')}
          secciones={[{ titulo: NOMBRES_IMPRESORA.cliente, lineas: vistaPrevia }]}
          textoBoton={t('common.cerrar')}
          onCerrar={() => setVistaPrevia(null)}
        />
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { CATEGORIES, PRODUCTS, categoryDisplayName, formatCRC, productDisplayName } from '../../data/catalog'
import { actualizarAgotado, actualizarPrecio } from '../../services/catalogOverrides'
import { obtenerTodasLasVentas } from '../../services/offlineQueue'
import { enviarTicket } from '../../services/backendPrint'
import {
  NOMBRES_IMPRESORA,
  formatHoraAmPm,
  generarTickets,
  ticketCancelacionVoucher,
  ticketCierreCaja,
  type PrinterId,
} from '../../services/tickets'
import { DATAFONO_CONFIG, enviarTransaccionDatafono } from '../../services/datafono'
import { CAJA_ID, STORAGE_KEY_CAJA_ID } from '../../services/consecutivo'
import { obtenerResumenAwsVentas, reenviarVentaAwsManual, type EnvioAwsPendiente } from '../../services/awsVentas'
import type { Product } from '../../types/catalog'
import type { VentaEnCola } from '../../types/order'
import type { ResultadoDatafono } from '../../types/datafono'
import { useLanguage } from '../../context/useLanguage'
import DatafonoPopup from '../ui/DatafonoPopup'

interface AdminScreenProps {
  onBack: () => void
}

/** Clave numérica válida para entrar al panel de administración (ver requerimiento del kiosko). */
const PIN_VALIDO = '123456'
const LARGO_PIN = 6

type VistaAdmin = 'menu' | 'precio' | 'agotado' | 'ordenes' | 'cierre' | 'kiosko' | 'awsVentas'

/**
 * Pantalla de administración del kiosko, accesible desde el botón "ADMIN"
 * de `WelcomeScreen`. Queda protegida por una clave numérica de 6 dígitos
 * (`PinGate`); una vez desbloqueada, ofrece varios paneles:
 * - Cambiar precio de un producto.
 * - Marcar/desmarcar un producto como agotado.
 * - Ver las órdenes registradas hoy, con opción de reenviar impresión.
 * - Cierre de caja.
 * - Elegir cuál de los dos kioskos físicos es esta máquina (`PanelKiosko`
 *   más abajo en este archivo).
 * - Ver el estado de los envíos de venta a nuestro backend en AWS: cuáles se
 *   enviaron y cuáles faltan, con reenvío manual (`PanelAwsVentas` más abajo).
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
        {vista === 'kiosko' && <PanelKiosko />}
        {vista === 'awsVentas' && <PanelAwsVentas />}
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
    { vista: 'kiosko', label: t('admin.menuKiosko') },
    { vista: 'awsVentas', label: t('admin.menuAwsVentas') },
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
                  {formatHoraAmPm(new Date(venta.fechaHora), false)}
                  {' · '}
                  {t('admin.ordenesMesa', { mesa: venta.mesa })}
                </span>
                {/* Autorización/referencia del datáfono BAC (ver
                    `Venta.autorizacionDatafono`/`referenciaDatafono` en
                    types/order.ts): sólo presentes en ventas cobradas con
                    datáfono, no en facturas/ventas antiguas sin estos campos. */}
                {(venta.autorizacionDatafono || venta.referenciaDatafono) && (
                  <span className="text-xs text-wood-400">
                    {venta.autorizacionDatafono &&
                      `${t('admin.ordenesAutorizacion')}: ${venta.autorizacionDatafono}`}
                    {venta.autorizacionDatafono && venta.referenciaDatafono && ' · '}
                    {venta.referenciaDatafono &&
                      `${t('admin.ordenesReferencia')}: ${venta.referenciaDatafono}`}
                  </span>
                )}
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
 * Estado de un envío de impresión. `'error'` significa que Backend-Print SÍ
 * respondió pero la impresora física no (ver `enviarTicket` en
 * `services/backendPrint.ts`), distinto de `'simulado'` (Backend-Print mismo
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

  /** `true` mientras se muestra el diálogo de confirmación antes de anular la orden (ver `cancelarOrden` más abajo). */
  const [mostrarConfirmacionCancelar, setMostrarConfirmacionCancelar] = useState(false)
  /** `true` mientras se espera la respuesta del `VOID` enviado al Transaction Manager del BAC. */
  const [enviandoVoid, setEnviandoVoid] = useState(false)
  /**
   * Resultado del `VOID` enviado al datáfono, mostrado en su propio pop-up
   * de desenlace (aprobado/rechazado) — mismo patrón que `resultadoTm` en
   * `PanelCierreCaja` más abajo en este archivo.
   */
  const [resultadoVoid, setResultadoVoid] = useState<ResultadoDatafono | null>(null)

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

  // El botón de cancelar sólo tiene sentido en órdenes cobradas con
  // datáfono (único método de pago del kiosko, ver `types/order.ts`):
  // anular requiere la autorización/referencia que ese cobro devolvió, no el
  // `invoice` interno del kiosko (ver `TransaccionDatafonoVoid` en
  // `types/datafono.ts`). Si por lo que sea una venta no tiene esos campos
  // (ej. registro antiguo), no se ofrece la acción en vez de mandar un VOID
  // sin los datos que el TM necesita.
  const puedeCancelar = Boolean(venta.autorizacionDatafono && venta.referenciaDatafono)

  /**
   * Anulación (`VOID`) de la orden contra el mismo Transaction Manager del
   * BAC usado para cobrar (`enviarTransaccionDatafono`, ver
   * `services/datafono.ts`), identificada por la autorización/referencia
   * que ese cobro devolvió. Esa función ya registra en la bitácora del
   * datáfono (`registrarLogDatafono`) tanto el JSON enviado como la
   * respuesta recibida, así que sólo falta registrar acá el resultado de la
   * impresión del comprobante de cancelación (ver requerimiento: JSON
   * enviado al TM, respuesta recibida, resultado de impresión).
   *
   * Igual que el cierre de lote en `PanelCierreCaja` (`confirmarCierre`), el
   * comprobante se imprime siempre al final del flujo, sin importar si el
   * VOID fue aprobado o rechazado — el pop-up de resultado ya le avisa al
   * operador cuál fue el desenlace antes de que salga el papel.
   */
  const cancelarOrden = async () => {
    setMostrarConfirmacionCancelar(false)
    if (!venta.autorizacionDatafono || !venta.referenciaDatafono) return

    setEnviandoVoid(true)
    setResultadoVoid(null)
    const resultado = await enviarTransaccionDatafono({
      transactionType: 'VOID',
      terminalId: DATAFONO_CONFIG.terminalId,
      authorizationNumber: venta.autorizacionDatafono,
      referenceNumber: venta.referenciaDatafono,
    })
    setEnviandoVoid(false)
    setResultadoVoid(resultado)

    const ticket = ticketCancelacionVoucher(venta, resultado)
    const resultadoImpresion = await enviarTicket('cliente', ticket)
    console.log('[admin:cancelacion] Resultado de impresión del comprobante de cancelación:', resultadoImpresion)
  }

  return (
    <div className="border-t border-wood-100 bg-wood-50 px-4 py-4">
      {(venta.autorizacionDatafono || venta.referenciaDatafono) && (
        <div className="mb-4 flex flex-wrap gap-4 text-sm text-wood-700">
          {venta.autorizacionDatafono && (
            <span>
              <span className="font-bold">{t('admin.ordenesAutorizacion')}:</span> {venta.autorizacionDatafono}
            </span>
          )}
          {venta.referenciaDatafono && (
            <span>
              <span className="font-bold">{t('admin.ordenesReferencia')}:</span> {venta.referenciaDatafono}
            </span>
          )}
        </div>
      )}
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

      {puedeCancelar && (
        <div className="mt-4 border-t border-wood-200 pt-4">
          <button
            type="button"
            onClick={() => setMostrarConfirmacionCancelar(true)}
            disabled={enviandoVoid}
            className="w-full rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-cream-50 transition-transform active:scale-95 disabled:opacity-50"
          >
            {t('admin.ordenesCancelar')}
            {enviandoVoid && ` · ${t('admin.ordenesCancelarEnviando')}`}
          </button>
        </div>
      )}

      {mostrarConfirmacionCancelar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl bg-white p-6 text-center shadow-2xl">
            <h2 className="text-xl font-bold text-wood-900">{t('admin.ordenesCancelarTitulo')}</h2>
            <p className="text-base text-wood-600">
              {t('admin.ordenesCancelarMensaje', {
                orden: venta.id,
                referencia: venta.referenciaDatafono ?? '',
              })}
            </p>
            <div className="flex w-full flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={cancelarOrden}
                className="w-full rounded-2xl bg-brand-red py-4 text-base font-bold text-white transition-transform active:scale-98"
              >
                {t('admin.ordenesCancelarConfirmar')}
              </button>
              <button
                type="button"
                onClick={() => setMostrarConfirmacionCancelar(false)}
                className="w-full rounded-2xl bg-wood-100 py-4 text-base font-bold text-wood-800 transition-transform active:scale-98"
              >
                {t('admin.ordenesCancelarDescartar')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Desenlace del VOID enviado al Transaction Manager del BAC (ver
          `cancelarOrden` arriba) — se reusa `DatafonoPopup` (mismo
          componente del flujo de cobro en `PaymentScreen`) en vez de un
          pop-up manual: así este flujo también ofrece "Reintentar" cuando
          `resultado.permiteReintentar` (ej. timeout/error de red), que antes
          se perdía con el pop-up simplificado verde/rojo que sólo tenía
          "Cerrar" (ver hallazgo de auditoría). */}
      {resultadoVoid && (
        <DatafonoPopup
          resultado={resultadoVoid}
          onReintentar={cancelarOrden}
          onCerrar={() => setResultadoVoid(null)}
          tituloAprobadaOverride="admin.ordenesCancelarCompletada"
        />
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
  /** `true` mientras se muestra el diálogo de confirmación previo a enviar el cierre (ver hallazgo de auditoría — antes se enviaba con un solo tap, sin confirmar). */
  const [mostrarConfirmacion, setMostrarConfirmacion] = useState(false)
  /** `true` mientras se espera la respuesta del `BATCH_SETTLEMENT` enviado al Transaction Manager del BAC (ver `ejecutarCierre` más abajo). */
  const [enviandoTm, setEnviandoTm] = useState(false)
  /**
   * Resultado del cierre de lote (`BATCH_SETTLEMENT`) enviado al datáfono.
   * No-nulo mientras se muestra el pop-up de desenlace de ese envío
   * (aprobado/rechazado) — independiente del estado de la impresión del
   * tiquete (`estado`/`errorEnvio` arriba), que no tiene pop-up propio.
   */
  const [resultadoTm, setResultadoTm] = useState<ResultadoDatafono | null>(null)

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
  //
  // Guard explícito de reentrada: aunque el botón ya se deshabilita con
  // `disabled={estado === 'enviando'}`, se repite la misma condición aquí
  // dentro de la función (ver hallazgo de auditoría) — así, si por lo que
  // sea esta función se invocara dos veces seguidas (ej. doble tap que
  // alcanza a disparar ambos `onClick` antes de que React re-renderice el
  // botón deshabilitado), la segunda llamada no vuelve a mandar el tiquete.
  const imprimirCierre = async () => {
    if (estado === 'enviando') return
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

  /**
   * Cierre de lote (`BATCH_SETTLEMENT`) contra el mismo Transaction Manager
   * del BAC usado para cobrar (`enviarTransaccionDatafono`, ver
   * `services/datafono.ts`) — esa función ya registra el JSON enviado y la
   * respuesta recibida en la bitácora del datáfono
   * (`registrarLogDatafono`/`obtenerLogsDatafono`), así que no hace falta
   * loggear nada aparte acá. El resultado (aprobado/rechazado, con
   * `responseCodeDescription` cuando aplica) se guarda en `resultadoTm` para
   * mostrarse en un pop-up propio, distinto del de impresión.
   */
  const enviarCierreAlDatafono = async () => {
    setEnviandoTm(true)
    setResultadoTm(null)
    const resultado = await enviarTransaccionDatafono({
      transactionType: 'BATCH_SETTLEMENT',
      terminalId: DATAFONO_CONFIG.terminalId,
    })
    setEnviandoTm(false)
    setResultadoTm(resultado)
  }

  /**
   * "Sí, generar cierre" del diálogo de confirmación: dispara el cierre de
   * lote al datáfono y, SIN IMPORTAR el resultado de esa llamada (aprobado,
   * rechazado, o un error de comunicación), genera e imprime el tiquete de
   * cierre con todas las órdenes del día (ver requerimiento — ambos pasos
   * son independientes entre sí).
   */
  const confirmarCierre = async () => {
    setMostrarConfirmacion(false)
    await enviarCierreAlDatafono()
    await imprimirCierre()
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
          onClick={() => setMostrarConfirmacion(true)}
          disabled={enviandoTm || estado === 'enviando' || ventas.length === 0}
          className={`flex-1 rounded-2xl py-4 text-base font-bold text-white transition-transform active:scale-98 disabled:opacity-50 ${
            estado === 'error' ? 'bg-red-700' : 'bg-brand-red'
          }`}
        >
          {t('admin.cierreImprimir')}
          {enviandoTm && ` · ${t('admin.cierreEnviandoTm')}`}
          {!enviandoTm && estado === 'enviando' && ` · ${t('admin.ordenesEnviando')}`}
          {!enviandoTm && estado === 'ok' && ` · ${t('admin.ordenesEnviado')}`}
          {!enviandoTm && estado === 'simulado' && ` · ${t('admin.ordenesSimulado')}`}
          {!enviandoTm && estado === 'error' && ` · ${t('admin.ordenesError')}`}
        </button>
      </div>

      {errorEnvio && <p className="text-center text-sm font-semibold text-red-700">{errorEnvio}</p>}

      {mostrarConfirmacion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl bg-white p-6 text-center shadow-2xl">
            <h2 className="text-xl font-bold text-wood-900">{t('admin.cierreConfirmarTitulo')}</h2>
            <p className="text-base text-wood-600">{t('admin.cierreConfirmarMensaje', { total: formatCRC(total) })}</p>
            <div className="flex w-full flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={confirmarCierre}
                className="w-full rounded-2xl bg-brand-red py-4 text-base font-bold text-white transition-transform active:scale-98"
              >
                {t('admin.cierreConfirmarSi')}
              </button>
              <button
                type="button"
                onClick={() => setMostrarConfirmacion(false)}
                className="w-full rounded-2xl bg-wood-100 py-4 text-base font-bold text-wood-800 transition-transform active:scale-98"
              >
                {t('admin.cierreConfirmarNo')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Desenlace del cierre de lote (`BATCH_SETTLEMENT`) enviado al
          Transaction Manager del BAC (ver `enviarCierreAlDatafono` arriba) —
          se reusa `DatafonoPopup` (mismo componente del flujo de cobro en
          `PaymentScreen` y del VOID en `PanelOrdenesDelDia` arriba) en vez
          de un pop-up manual: ofrece "Reintentar" (sólo reenvía el
          `BATCH_SETTLEMENT`, no vuelve a imprimir el tiquete — ya se imprime
          una sola vez en `confirmarCierre`) cuando
          `resultado.permiteReintentar` (ver hallazgo de auditoría).
          Independiente del pop-up de confirmación y del estado de impresión
          (que no tiene pop-up propio). */}
      {resultadoTm && (
        <DatafonoPopup
          resultado={resultadoTm}
          onReintentar={enviarCierreAlDatafono}
          onCerrar={() => setResultadoTm(null)}
          tituloAprobadaOverride="admin.cierreCompletado"
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Panel: elegir cuál de los dos kioskos físicos es ESTA máquina.      */
/* ------------------------------------------------------------------ */

/**
 * Los dos kioskos físicos conocidos hoy (ver `IP_KIOSKOS` en
 * `services/kioskoSyncConfig.ts` — misma tabla que usa la sincronización
 * directa entre kioskos, ver `services/kioskoTransport.ts`). `numero` es el
 * mismo valor de 2 dígitos que ya se usa en todos lados para identificar la
 * caja (consecutivo de orden, ticket del cliente, badge de
 * `WelcomeScreen.tsx` — ver `PREFIJO_CAJA` en `services/consecutivo.ts`), así
 * que esta pantalla no introduce una tercera forma de numerar kioskos.
 */
const KIOSKOS_DISPONIBLES: { cajaId: string; numero: string }[] = [
  { cajaId: 'K001', numero: '01' },
  { cajaId: 'K002', numero: '02' },
]

/**
 * Reemplaza el esquema anterior de detección automática por IP (que
 * consultaba al print-bridge local, ver hallazgo de auditoría: "hacerlo más
 * simple, sin involucrar el print-bridge"): acá el operador elige a mano,
 * una sola vez por máquina, cuál de los dos kioskos físicos es esta
 * terminal. La elección se guarda en `localStorage` (`STORAGE_KEY_CAJA_ID`,
 * ver `services/consecutivo.ts`) y sobrevive recargas y reinicios sin volver
 * a pedirse.
 *
 * `CAJA_ID` se resuelve una sola vez al cargar el módulo (ver comentario de
 * `consecutivo.ts`), así que un cambio de kiosko sólo toma efecto real tras
 * recargar la página — por eso el botón de confirmar recarga de inmediato,
 * igual que hacía el esquema anterior tras detectar un cambio.
 */
function PanelKiosko() {
  const { t } = useLanguage()
  const [pendiente, setPendiente] = useState<string | null>(null)

  const elegir = (cajaId: string) => {
    if (cajaId === CAJA_ID) return
    setPendiente(cajaId)
  }

  const confirmar = () => {
    if (!pendiente) return
    try {
      localStorage.setItem(STORAGE_KEY_CAJA_ID, pendiente)
    } catch {
      // localStorage no disponible (modo privado, cuota llena, etc.): se
      // recarga igual, mismo criterio "fail open" que el resto de la app
      // (ver `consecutivo.ts`) — en el peor caso, la elección no queda
      // guardada y hay que repetirla.
    }
    window.location.reload()
  }

  const kioskoPendiente = KIOSKOS_DISPONIBLES.find((k) => k.cajaId === pendiente)

  return (
    <div className="mx-auto flex max-w-md flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-bold text-wood-900">{t('admin.kioskoTitle')}</h2>
        <p className="text-sm text-wood-500">{t('admin.kioskoSubtitle')}</p>
      </div>

      <div className="flex flex-col gap-3">
        {KIOSKOS_DISPONIBLES.map(({ cajaId, numero }) => {
          const activo = cajaId === CAJA_ID
          return (
            <button
              key={cajaId}
              type="button"
              onClick={() => elegir(cajaId)}
              aria-pressed={activo}
              className={`flex items-center justify-between gap-3 rounded-2xl px-6 py-6 text-left text-lg font-bold shadow-md transition-transform active:scale-98 ${
                activo
                  ? 'bg-brand-red text-white shadow-brand-red/20'
                  : 'bg-wood-900 text-cream-50 shadow-wood-900/10'
              }`}
            >
              {t('welcome.kioskoId', { numero })}
              {activo && (
                <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold tracking-wide uppercase">
                  {t('admin.kioskoActivo')}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {kioskoPendiente && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-2xl bg-white p-6 text-center shadow-2xl">
            <h2 className="text-xl font-bold text-wood-900">{t('admin.kioskoConfirmarTitulo')}</h2>
            <p className="text-base text-wood-600">
              {t('admin.kioskoConfirmarMensaje', { numero: kioskoPendiente.numero })}
            </p>
            <div className="flex w-full flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={confirmar}
                className="w-full rounded-2xl bg-brand-red py-4 text-base font-bold text-white transition-transform active:scale-98"
              >
                {t('admin.kioskoConfirmarSi')}
              </button>
              <button
                type="button"
                onClick={() => setPendiente(null)}
                className="w-full rounded-2xl bg-wood-100 py-4 text-base font-bold text-wood-800 transition-transform active:scale-98"
              >
                {t('admin.kioskoConfirmarNo')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Panel: estado de envíos de venta a AWS (enviados / pendientes).     */
/* ------------------------------------------------------------------ */

function formatFechaHoraAdmin(iso: string): string {
  return new Date(iso).toLocaleString('es-CR', { dateStyle: 'short', timeStyle: 'medium' })
}

/**
 * Muestra el estado de `services/awsVentas.ts`: qué ventas ya se confirmaron
 * recibidas por nuestro backend en AWS y cuáles siguen pendientes (con su
 * último error y cuántos intentos automáticos llevan), con un botón de
 * reenvío manual por cada pendiente (`reenviarVentaAwsManual`). Se refresca
 * leyendo de nuevo `obtenerResumenAwsVentas()` cada vez que el operador entra
 * a este panel o presiona "Reenviar" — no hay suscripción reactiva porque el
 * estado vive en `localStorage`, no en un store.
 */
function PanelAwsVentas() {
  const { t } = useLanguage()
  const [resumen, setResumen] = useState(() => obtenerResumenAwsVentas())
  const [reenviando, setReenviando] = useState<string | null>(null)

  const refrescar = () => setResumen(obtenerResumenAwsVentas())

  const reenviar = async (ventaId: string) => {
    setReenviando(ventaId)
    try {
      await reenviarVentaAwsManual(ventaId)
    } finally {
      setReenviando(null)
      refrescar()
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-wood-900">{t('admin.awsVentasTitle')}</h2>
        <button
          type="button"
          onClick={refrescar}
          className="rounded-full bg-wood-100 px-4 py-2 text-sm font-semibold text-wood-700 transition-transform active:scale-95"
        >
          {t('admin.awsVentasRefrescar')}
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-bold tracking-wide text-wood-500 uppercase">
          {t('admin.awsVentasPendientesTitle', { cantidad: String(resumen.pendientes.length) })}
        </h3>
        {resumen.pendientes.length === 0 ? (
          <p className="text-sm text-wood-500">{t('admin.awsVentasPendientesVacio')}</p>
        ) : (
          <div className="flex flex-col divide-y divide-wood-100 rounded-xl bg-white shadow-sm shadow-wood-900/5">
            {resumen.pendientes.map((item: EnvioAwsPendiente) => (
              <div key={item.ventaId} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-mono font-bold text-wood-900">#{item.ventaId}</span>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
                      item.agotado ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                    }`}
                  >
                    {item.agotado
                      ? t('admin.awsVentasAgotado')
                      : t('admin.awsVentasIntentos', { intentos: String(item.intentos) })}
                  </span>
                </div>
                <p className="text-xs text-wood-500">{item.ultimoError}</p>
                {!item.agotado && (
                  <p className="text-xs text-wood-400">
                    {t('admin.awsVentasProximoIntento', { fecha: formatFechaHoraAdmin(item.proximoIntentoEn) })}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => reenviar(item.ventaId)}
                  disabled={reenviando === item.ventaId}
                  className="self-start rounded-xl bg-brand-red px-4 py-2 text-sm font-bold text-white transition-transform active:scale-95 disabled:opacity-60"
                >
                  {reenviando === item.ventaId ? t('admin.awsVentasReenviando') : t('admin.awsVentasReenviar')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-bold tracking-wide text-wood-500 uppercase">
          {t('admin.awsVentasEnviadosTitle', { cantidad: String(resumen.enviados.length) })}
        </h3>
        {resumen.enviados.length === 0 ? (
          <p className="text-sm text-wood-500">{t('admin.awsVentasEnviadosVacio')}</p>
        ) : (
          <div className="flex flex-col divide-y divide-wood-100 rounded-xl bg-white shadow-sm shadow-wood-900/5">
            {resumen.enviados.map((item) => (
              <div key={item.ventaId} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="font-mono font-semibold text-wood-900">#{item.ventaId}</span>
                <span className="text-xs text-wood-500">{formatFechaHoraAdmin(item.enviadoEn)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

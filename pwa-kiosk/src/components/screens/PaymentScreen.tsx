import { useEffect, useRef, useState } from 'react'
import logoBadge from '../../assets/logo/optimized/logo-badge.png'
import {
  PRODUCTS,
  formatCRC,
  guarnicionesResumen,
  opcionParaMostrar,
  productDisplayName,
  productImage,
} from '../../data/catalog'
import PrecioConIvi from '../ui/PrecioConIvi'
import ProductImage from '../ui/ProductImage'
import TicketPopup from '../ui/TicketPopup'
import WsDfPopup from '../ui/WsDfPopup'
import DatafonoPopup from '../ui/DatafonoPopup'
import { cartItemCount, cartTotal, lineTerminosTexto, useCartStore } from '../../store/cartStore'
import { useMesaStore } from '../../store/mesaStore'
import { generarFactura, registrarVentaSimple } from '../../services/facturacion'
import { generarConsecutivo } from '../../services/consecutivo'
import { encolarVenta } from '../../services/offlineQueue'
import { enviarVentaACodisa } from '../../services/codisa'
import { enviarVentaAAwsIot } from '../../services/awsIot'
import { construirPedidoWsDf, enviarPedidoWsDf, validarPedidoWsDf } from '../../services/wsdf'
import { enviarTicket, type ResultadoImpresion } from '../../services/backendPrint'
import ImpresionErrorPopup from '../ui/ImpresionErrorPopup'
import { DATAFONO_CONFIG, enviarTransaccionDatafono, formatMontoDatafono } from '../../services/datafono'
import {
  NOMBRES_IMPRESORA,
  generarTickets,
  ticketConsolidadoCarniceria,
  ticketConsolidadoRestaurante,
  type PrinterId,
  type TicketLine,
} from '../../services/tickets'
import CodisaOrdenPopup from '../ui/CodisaOrdenPopup'
import type { FacturaItem } from '../../types/factura'
import type { OrderItem, Venta } from '../../types/order'
import type { ResultadoOrdenCodisa, ValidacionWsDf, WsDfPayload } from '../../types/wsdf'
import type { ResultadoDatafono } from '../../types/datafono'
import { useLanguage } from '../../context/useLanguage'

/** IDs de "comenzar" que también se ofrecen como sugerencia adicional en el pago. */
const SUGERENCIAS_IDS_EXTRA = ['elote', 'ensalada-griega', 'queso-provolone']

const SUGERENCIAS = PRODUCTS.filter(
  (p) =>
    p.categoryId === 'guarniciones' ||
    p.categoryId === 'sobremesa' ||
    SUGERENCIAS_IDS_EXTRA.includes(p.id),
)

/** Tarifa de IVA en Costa Rica, usada sólo para desglosar subtotal/impuestos en el resumen de pago. */
const IVA_RATE = 0.13

interface PaymentScreenProps {
  onBack: () => void
  /** Navega al flujo de identificación del cliente (cédula → registro) para la factura electrónica. */
  onSolicitarFactura: () => void
  /** Mesa compartida, "Sí, otra orden": limpia el carrito y vuelve al menú bajo el mismo ID de mesa. */
  onNuevaOrdenMismaMesa: () => void
  /** Vuelve a la pantalla de bienvenida y limpia todo (mesa simple, o mesa compartida ya cerrada). */
  onVolverInicio: () => void
}

type EstadoPago = 'idle' | 'procesando' | 'aprobado'
type EstadoFactura = 'idle' | 'generando'

/**
 * Pasos del flujo posterior a la aprobación del pago:
 * - 'ninguno': aún no se procesó (o ya se completó y se salió de la pantalla).
 * - 'popupWsDf': muestra el payload que se enviaría al API WS DF de Codisa
 *   (sólo verificación en esta fase, ver `services/wsdf.ts`).
 * - 'popupCliente': muestra el comprobante del comensal que se imprimiría.
 * - 'preguntaOtraOrden': (sólo mesa compartida) pregunta obligatoria si hay otra orden.
 *
 * El tiquete de carnicería/restaurante (por orden individual en mesa simple,
 * o consolidado al cerrar una mesa compartida) ya NO tiene un pop-up propio:
 * se envía a imprimir directamente (ver el efecto de confirmación de venta y
 * `handleOtraOrdenNo` más abajo), sin ventana emergente de confirmación.
 */
type PasoPostPago = 'ninguno' | 'popupWsDf' | 'popupCliente' | 'preguntaOtraOrden'

export default function PaymentScreen({
  onBack,
  onSolicitarFactura,
  onNuevaOrdenMismaMesa,
  onVolverInicio,
}: PaymentScreenProps) {
  const { language, t, terminoLabel } = useLanguage()
  const lines = useCartStore((s) => s.lines)
  const mesa = useCartStore((s) => s.mesa)
  const addSimpleItem = useCartStore((s) => s.addSimpleItem)
  const tipoPago = useCartStore((s) => s.tipoPago)
  const setTipoPago = useCartStore((s) => s.setTipoPago)
  const cliente = useCartStore((s) => s.cliente)
  const facturaResultado = useCartStore((s) => s.facturaResultado)
  const setFacturaResultado = useCartStore((s) => s.setFacturaResultado)
  const clearCart = useCartStore((s) => s.clear)
  const [estado, setEstado] = useState<EstadoPago>('idle')
  const [estadoFactura, setEstadoFactura] = useState<EstadoFactura>('idle')
  // Resultado de la última transacción enviada al datáfono BAC (Transaction
  // Manager, ver services/datafono.ts). No-nulo mientras el pop-up
  // `DatafonoPopup` está visible — ver `handleCobrar`/`handleReintentarDatafono`/
  // `handleCerrarDatafono` más abajo. Este flujo de pop-ups sólo aplica al
  // pago con datáfono (único método de cobro de este kiosko), nunca a
  // factura/WS DF/tickets, que ya tienen sus propios pop-ups.
  const [resultadoDatafono, setResultadoDatafono] = useState<ResultadoDatafono | null>(null)

  const mesaCompartida = useMesaStore((s) => s.compartida)
  const mesaId = useMesaStore((s) => s.mesaId)
  const registrarOrden = useMesaStore((s) => s.registrarOrden)
  const cerrarMesaStore = useMesaStore((s) => s.cerrar)
  const cancelarMesaStore = useMesaStore((s) => s.cancelar)
  const ordenesMesa = useMesaStore((s) => s.ordenes)

  const total = cartTotal(lines)
  const cantidad = cartItemCount(lines)
  // Los precios del menú ya incluyen el IVA (práctica estándar en
  // restaurantes de Costa Rica); para el desglose del resumen de pago se
  // calcula el subtotal e impuestos a partir del total final, sin afectar
  // ningún otro cálculo (factura electrónica, tickets, etc.) del resto del flujo.
  const subtotal = Math.round(total / (1 + IVA_RATE))
  const impuestos = total - subtotal

  // Estado del flujo de tiquetes/popups posterior a la aprobación del pago.
  const [paso, setPaso] = useState<PasoPostPago>('ninguno')
  const [ticketsGenerados, setTicketsGenerados] = useState<Record<PrinterId, TicketLine[]> | null>(null)
  const [cerrandoMesa, setCerrandoMesa] = useState(false)
  // Resultado real de cada `enviarTicket` (ver services/backendPrint.ts),
  // para poder avisar al operador cuando una impresión falló de verdad
  // (`ok: false, simulado: false`) en vez de asumir silenciosamente que
  // todo salió bien (ver hallazgo de auditoría). `null` = aún no se conoce
  // el resultado (todavía en vuelo, o no aplica en esta mesa/paso).
  const [impresionCliente, setImpresionCliente] = useState<ResultadoImpresion | null>(null)
  const [impresionCarniceria, setImpresionCarniceria] = useState<ResultadoImpresion | null>(null)
  const [impresionRestaurante, setImpresionRestaurante] = useState<ResultadoImpresion | null>(null)
  // No-nulo cuando el tiquete consolidado de cierre de mesa (carnicería
  // y/o restaurante, ver `intentarImprimirCierre`/`handleOtraOrdenNo`) falló
  // con un error real de impresión: muestra `ImpresionErrorPopup` con
  // opción de reintentar o continuar sin imprimir.
  const [cerrandoMesaError, setCerrandoMesaError] = useState<PrinterId[] | null>(null)
  const yaProcesado = useRef(false)
  // Consecutivo de la orden (ver services/consecutivo.ts): se genera una sola
  // vez por venta, sin importar si primero lo consume la generación de la
  // factura (intentarFactura, más abajo) o el efecto de confirmación de la
  // venta — ambos deben usar el MISMO número (requerimiento "Factura de
  // Caja#" del comprobante impreso), por eso se cachea en un ref en vez de
  // llamar generarConsecutivo() en cada lugar.
  const numeroFacturaRef = useRef<string | null>(null)
  const obtenerNumeroFactura = () => {
    if (!numeroFacturaRef.current) numeroFacturaRef.current = generarConsecutivo()
    return numeroFacturaRef.current
  }

  // Datos para el pop-up de verificación del payload WS DF (Codisa), mostrado
  // justo después de aprobarse el pago (ver `services/wsdf.ts`).
  const [ventaConfirmada, setVentaConfirmada] = useState<Venta | null>(null)
  const [wsdfPayload, setWsdfPayload] = useState<WsDfPayload | null>(null)
  const [wsdfValidacion, setWsdfValidacion] = useState<ValidacionWsDf | null>(null)
  // Envío real del pedido a Codisa (`?action=orden`, ver `services/wsdf.ts`):
  // `enviandoOrdenCodisa` controla el texto/disabled de los botones de
  // `WsDfPopup` mientras el POST está en vuelo; `resultadoOrdenCodisa`
  // (no-nulo) hace que se muestre `CodisaOrdenPopup` con el desenlace
  // (éxito/error) en vez del propio `WsDfPopup`.
  const [enviandoOrdenCodisa, setEnviandoOrdenCodisa] = useState(false)
  const [resultadoOrdenCodisa, setResultadoOrdenCodisa] = useState<ResultadoOrdenCodisa | null>(null)

  /**
   * Cobro real con el datáfono BAC (Transaction Manager, ver
   * `services/datafono.ts`): envía una transacción SALE por el monto total
   * de la orden y muestra el resultado en `DatafonoPopup` (ver render más
   * abajo). `estado` permanece en 'procesando' mientras se espera la
   * respuesta Y mientras el pop-up de resultado está abierto — sólo pasa a
   * 'aprobado' (lo que dispara el resto del flujo: tickets, WS DF, etc., ver
   * el efecto más abajo) cuando el usuario cierra un pop-up de transacción
   * aprobada (ver `handleCerrarDatafono`).
   */
  const handleCobrar = async () => {
    // Validación de monto ANTES de tocar red o cambiar `estado`: si el total
    // no es un número finito mayor a cero (ej. carrito corrupto), se corta
    // aquí mismo — `formatMontoDatafono` lanza en ese caso (ver
    // services/datafono.ts) — y se muestra el error en el pop-up habitual,
    // sin llegar a enviar ninguna petición al datáfono.
    let totalAmount: string
    try {
      totalAmount = formatMontoDatafono(total)
    } catch (err) {
      setResultadoDatafono({
        categoria: 'monto-invalido',
        mensaje: `El monto de la orden no es válido para cobrar (${(err as Error).message}). Regrese al menú y revise el pedido.`,
        permiteReintentar: false,
      })
      return
    }

    setEstado('procesando')
    setResultadoDatafono(null)
    const resultado = await enviarTransaccionDatafono({
      transactionType: 'SALE',
      terminalId: DATAFONO_CONFIG.terminalId,
      totalAmount,
      invoice: obtenerNumeroFactura(),
    })
    setResultadoDatafono(resultado)
  }

  /** "Intentar de nuevo" del pop-up de datáfono: reenvía la misma transacción SALE. */
  const handleReintentarDatafono = () => {
    setResultadoDatafono(null)
    handleCobrar()
  }

  /**
   * Cierra el pop-up de resultado del datáfono. Si la transacción fue
   * aprobada, recién ahora se avanza `estado` a 'aprobado' (dispara el
   * efecto de confirmación de venta); si no, se vuelve a 'idle' para que el
   * usuario pueda intentar cobrar de nuevo desde el botón principal.
   *
   * CASO CRÍTICO — 'transaccion-en-curso': esta categoría significa que esta
   * llamada en particular fue rechazada SIN tocar red porque OTRA llamada
   * anterior para el mismo terminal (la transacción real) sigue en vuelo
   * (ver `terminalesConTransaccionActiva` en `services/datafono.ts`). Si
   * aquí revirtiéramos `estado` a 'idle', se reactivarían "Cobrar"/"Cambiar
   * forma de pago" (y, desde ahí, "Cancelar Orden") MIENTRAS la tarjeta del
   * cliente todavía podría estar cobrándose — riesgo real de doble cobro, o
   * de una venta aprobada que nunca llega a registrarse porque el operador
   * ya canceló/reinició el flujo. Por eso NO se toca `estado` en este caso:
   * se deja como 'procesando' (pantalla de "Sigue las instrucciones…", sin
   * botones de cobro/cancelación visibles) hasta que la transacción real
   * resuelva y dispare su propio `setResultadoDatafono` con el desenlace
   * definitivo (aprobada/denegada/etc.), que sí se procesa normalmente.
   */
  const handleCerrarDatafono = () => {
    if (resultadoDatafono?.categoria === 'transaccion-en-curso') {
      setResultadoDatafono(null)
      return
    }
    const fueAprobada = resultadoDatafono?.categoria === 'aprobada'
    setResultadoDatafono(null)
    setEstado(fueAprobada ? 'aprobado' : 'idle')
  }

  /**
   * "Cancelar Orden": disponible antes de cobrar (pantalla inicial de pago).
   * Libera de inmediato el identificador de mesa (en vez de esperar a que
   * expire el bloqueo de 30 min, ver `mesaStore.cancelar`/`mesaLocks.ts`),
   * descarta el número de orden ya reservado en este componente (si aún no
   * se llegó a usar en ninguna venta) y vuelve a la pantalla de bienvenida
   * reutilizando la misma limpieza de carrito/mesa que ya hace `onVolverInicio`.
   */
  const handleCancelarOrden = () => {
    cancelarMesaStore()
    numeroFacturaRef.current = null
    onVolverInicio()
  }

  const intentarFactura = async () => {
    if (!cliente) return
    setEstadoFactura('generando')
    const items: FacturaItem[] = lines.map((l) => ({
      nombre: l.variante ?? l.name,
      cantidad: l.quantity,
      precioUnitario: l.price,
    }))
    const resultado = await generarFactura({
      mesa,
      items,
      total,
      cliente,
      numeroFactura: obtenerNumeroFactura(),
    })
    setFacturaResultado(resultado)
    setEstadoFactura('idle')
  }

  // Al aprobarse el pago, si el cliente eligió factura electrónica, generarla
  // automáticamente (requerimiento 2). Se dispara una sola vez por venta.
  useEffect(() => {
    if (estado === 'aprobado' && tipoPago === 'factura' && cliente && !facturaResultado) {
      intentarFactura()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado, tipoPago])

  const handleContinuarSinFactura = () => {
    setTipoPago('simple')
    setFacturaResultado(null)
  }

  const esperandoFactura =
    tipoPago === 'factura' && (estadoFactura === 'generando' || !facturaResultado)

  // Una vez aprobado el pago (y resuelta la factura, si aplica), se arma la
  // venta, se encola/envía y se genera+envía el comprobante del comensal de
  // inmediato. El tiquete de carnicería/restaurante se envía de inmediato en
  // mesa simple, o se difiere hasta el cierre de mesa en mesa compartida.
  useEffect(() => {
    if (estado !== 'aprobado' || esperandoFactura || yaProcesado.current) return
    yaProcesado.current = true

    const items: OrderItem[] = lines.map((l) => ({
      productId: l.productId,
      name: l.name,
      nameEs: l.nameEs,
      price: l.price,
      quantity: l.quantity,
      termino: l.termino,
      terminos: l.terminos,
      guarniciones: l.guarniciones,
      variante: l.variante,
      corte: l.corte,
      extras: l.extras,
      opcion: l.opcion,
    }))
    const nuevaVenta: Venta = {
      id: obtenerNumeroFactura(),
      items,
      mesa,
      total: cartTotal(lines),
      fechaHora: new Date().toISOString(),
      tipoPago: tipoPago ?? undefined,
      cliente: tipoPago === 'factura' && facturaResultado?.ok ? (cliente ?? undefined) : undefined,
      claveFactura: tipoPago === 'factura' && facturaResultado?.ok ? facturaResultado.clave : undefined,
    }

    encolarVenta(nuevaVenta)
    enviarVentaACodisa(nuevaVenta)
    enviarVentaAAwsIot(nuevaVenta)

    // Arma el payload WS DF (Codisa) y lo valida, para mostrarlo en el
    // pop-up de verificación que se abre a continuación. En esta fase no se
    // envía todavía (ver services/wsdf.ts).
    const payloadWsDf = construirPedidoWsDf(nuevaVenta)
    const validacionWsDf = validarPedidoWsDf(payloadWsDf)
    setVentaConfirmada(nuevaVenta)
    setWsdfPayload(payloadWsDf)
    setWsdfValidacion(validacionWsDf)

    // La venta con factura electrónica ya quedó registrada en el Excel local
    // (ventas.xlsx) por el print-bridge al llamar /factura. Aquí sólo
    // registramos las ventas sin factura, para no duplicar el log.
    if (nuevaVenta.tipoPago !== 'factura') {
      const itemsFactura: FacturaItem[] = nuevaVenta.items.map((item) => ({
        nombre: item.variante ?? item.name,
        cantidad: item.quantity,
        precioUnitario: item.price,
      }))
      registrarVentaSimple({ mesa: nuevaVenta.mesa, items: itemsFactura, total: nuevaVenta.total })
    }

    const tickets = generarTickets(nuevaVenta)

    setImpresionCliente(null)
    setImpresionCarniceria(null)
    setImpresionRestaurante(null)

    if (mesaCompartida) {
      // Mesa compartida: sólo se envía de inmediato el comprobante del
      // comensal; carnicería/restaurante se acumulan y se imprimen
      // consolidados una sola vez al cerrar la mesa (ver handleOtraOrdenNo).
      enviarTicket('cliente', tickets.cliente)
        .then(setImpresionCliente)
        .catch((err) => console.error('[PaymentScreen] Error inesperado enviando ticket de cliente:', err))
      registrarOrden(nuevaVenta)
    } else {
      // Mesa simple: las 3 estaciones (cliente, carnicería, restaurante) se
      // disparan en paralelo hacia Backend-Print — cada `enviarTicket`
      // resuelve su propia IP (ver IP_POR_IMPRESORA en backendPrint.ts) y
      // construye su propio buffer ESC/POS de forma independiente (ver
      // escpos.ts), así que no hay motivo para esperar una antes de lanzar
      // la siguiente. No se bloquea este efecto por el resultado: cada
      // llamada ya maneja sus propios errores/simulación internamente (ver
      // `ResultadoImpresion` en backendPrint.ts) y su resultado se guarda en
      // estado para poder avisar al operador (ver banner no-bloqueante en
      // el render, y `handleReintentarImpresion` para reintentar una sola
      // impresora sin repetir las otras).
      enviarTicket('cliente', tickets.cliente)
        .then(setImpresionCliente)
        .catch((err) => console.error('[PaymentScreen] Error inesperado enviando ticket de cliente:', err))
      enviarTicket('carniceria', tickets.carniceria)
        .then(setImpresionCarniceria)
        .catch((err) => console.error('[PaymentScreen] Error inesperado enviando ticket de carnicería:', err))
      enviarTicket('restaurante', tickets.restaurante)
        .then(setImpresionRestaurante)
        .catch((err) => console.error('[PaymentScreen] Error inesperado enviando ticket de restaurante:', err))
    }

    setTicketsGenerados(tickets)
    setPaso('popupWsDf')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado, esperandoFactura])

  /**
   * "Confirmar envío" del pop-up WS DF: envía el pedido real a Codisa
   * (`enviarPedidoWsDf`, ver `services/wsdf.ts`) y muestra el desenlace en
   * `CodisaOrdenPopup` (éxito o error con reintentar). El `paso` permanece
   * en 'popupWsDf' durante todo este intercambio — sólo avanza a
   * 'popupCliente' cuando el usuario cierra `CodisaOrdenPopup` (ver
   * `handleCerrarOrdenCodisa`), sea cual sea el desenlace: la venta ya
   * quedó cobrada e impresa, así que un error de Codisa no debe bloquear
   * el resto del flujo del kiosko.
   */
  const handleConfirmarEnvioWsDf = async () => {
    if (!wsdfPayload) {
      setPaso('popupCliente')
      return
    }
    setEnviandoOrdenCodisa(true)
    const resultado = await enviarPedidoWsDf(wsdfPayload)
    setEnviandoOrdenCodisa(false)
    setResultadoOrdenCodisa(resultado)
  }

  /** "Cancelar" del pop-up WS DF: no envía nada, simplemente continúa el flujo (la venta ya quedó cobrada e impresa). */
  const handleCancelarWsDf = () => {
    setPaso('popupCliente')
  }

  /** "Intentar de nuevo" del pop-up de resultado de Codisa: reenvía el mismo payload. */
  const handleReintentarOrdenCodisa = () => {
    setResultadoOrdenCodisa(null)
    handleConfirmarEnvioWsDf()
  }

  /** Cierra el pop-up de resultado de Codisa y avanza al siguiente paso del flujo, sin importar el desenlace. */
  const handleCerrarOrdenCodisa = () => {
    setResultadoOrdenCodisa(null)
    setPaso('popupCliente')
  }

  /**
   * Cierra el popup del comprobante del comensal. En mesa compartida avanza
   * a la pregunta de "otra orden"; en mesa simple termina el flujo ahí mismo:
   * los tiquetes de carnicería/restaurante ya se enviaron a imprimir de
   * inmediato junto con el del comensal (ver el efecto de confirmación de
   * venta arriba), sin pop-up de confirmación propio (ver requerimiento), así
   * que no hay nada más que mostrar.
   */
  const handleCerrarPopupCliente = () => {
    if (mesaCompartida) {
      setPaso('preguntaOtraOrden')
      return
    }
    clearCart()
    setPaso('ninguno')
    onVolverInicio()
  }

  /** "Sí, otra orden": limpia el carrito para la siguiente orden, conserva el ID de mesa. */
  const handleOtraOrdenSi = () => {
    clearCart()
    setPaso('ninguno')
    onNuevaOrdenMismaMesa()
  }

  /**
   * "Reintenta" una sola impresora de la venta recién confirmada (mesa
   * simple), usando los mismos tickets ya generados (`ticketsGenerados`) —
   * no se vuelve a generar el ticket ni se reenvían las otras estaciones.
   * Se usa tanto desde el banner no-bloqueante como desde el pop-up del
   * comprobante del comensal (ver `TicketPopup`/render más abajo).
   */
  const handleReintentarImpresion = (printer: PrinterId) => {
    if (!ticketsGenerados) return
    if (printer === 'cliente') {
      setImpresionCliente(null)
      enviarTicket('cliente', ticketsGenerados.cliente).then(setImpresionCliente)
    } else if (printer === 'carniceria') {
      setImpresionCarniceria(null)
      enviarTicket('carniceria', ticketsGenerados.carniceria).then(setImpresionCarniceria)
    } else {
      setImpresionRestaurante(null)
      enviarTicket('restaurante', ticketsGenerados.restaurante).then(setImpresionRestaurante)
    }
  }

  /**
   * Genera y envía el tiquete consolidado de carnicería/restaurante del
   * cierre de mesa (una sola vez, con todas las órdenes de la mesa).
   * Devuelve `true` si ambas estaciones imprimieron sin error real (el caso
   * simulado de desarrollo SÍ cuenta como éxito aquí, igual que en
   * `enviarTicket`); si alguna falló de verdad, guarda cuáles en
   * `cerrandoMesaError` (para `ImpresionErrorPopup`) y devuelve `false`.
   *
   * Antes `handleOtraOrdenNo` no revisaba este resultado y, combinado con
   * la falta de timeout en `postPrint` (ver `services/backendPrint.ts`),
   * podía quedar colgado indefinidamente en "Cerrando mesa…" sin que el
   * operador se enterara de que algo falló (ver hallazgo de auditoría).
   */
  const intentarImprimirCierre = async (): Promise<boolean> => {
    const carniceria = ticketConsolidadoCarniceria(mesaId, ordenesMesa)
    const restaurante = ticketConsolidadoRestaurante(mesaId, ordenesMesa)
    const [resultadoCarniceria, resultadoRestaurante] = await Promise.all([
      enviarTicket('carniceria', carniceria),
      enviarTicket('restaurante', restaurante),
    ])

    const fallidas: PrinterId[] = []
    if (!resultadoCarniceria.ok && !resultadoCarniceria.simulado) fallidas.push('carniceria')
    if (!resultadoRestaurante.ok && !resultadoRestaurante.simulado) fallidas.push('restaurante')

    if (fallidas.length > 0) {
      setCerrandoMesaError(fallidas)
      return false
    }
    return true
  }

  /** Cierra la mesa de verdad: limpia carrito/mesa y vuelve a la bienvenida. Sólo debe llamarse después de que la impresión de cierre tuvo éxito (o el operador decidió continuar sin imprimir). */
  const finalizarCierreMesa = () => {
    cerrarMesaStore()
    clearCart()
    setPaso('ninguno')
    onVolverInicio()
  }

  /**
   * "No, cerrar mesa": intenta imprimir el tiquete consolidado y, si tuvo
   * éxito (real o simulado), cierra la mesa de inmediato — sin pop-up de
   * confirmación propio (ver requerimiento). Si hubo un error real de
   * impresión, `intentarImprimirCierre` ya dejó `cerrandoMesaError` listo
   * para mostrar `ImpresionErrorPopup`; el cierre se completa desde ahí
   * (`handleReintentarImpresionCierre`/`handleContinuarSinImprimirCierre`).
   */
  const handleOtraOrdenNo = async () => {
    if (cerrandoMesa) return
    setCerrandoMesa(true)
    const exito = await intentarImprimirCierre()
    setCerrandoMesa(false)
    if (exito) finalizarCierreMesa()
  }

  /** "Reintentar" del pop-up de error de impresión de cierre: vuelve a generar y enviar el tiquete consolidado. */
  const handleReintentarImpresionCierre = async () => {
    setCerrandoMesaError(null)
    setCerrandoMesa(true)
    const exito = await intentarImprimirCierre()
    setCerrandoMesa(false)
    if (exito) finalizarCierreMesa()
  }

  /** "Continuar sin imprimir" del pop-up de error de impresión de cierre: el pedido ya quedó registrado, así que se cierra la mesa igual. */
  const handleContinuarSinImprimirCierre = () => {
    setCerrandoMesaError(null)
    finalizarCierreMesa()
  }

  /**
   * Contenido de confirmación del pago aprobado (logo, check, total, estado
   * de factura, mensaje de despedida). Se reutiliza como columna izquierda
   * en mesa compartida (junto a la pregunta de "otra orden") y como
   * contenido único y centrado en mesa simple.
   */
  const contenidoConfirmacion = (
    <>
      <img src={logoBadge} alt="Carnes Don Fernando" className="mb-2 w-56 sm:w-64" />
      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-green-100">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-12 w-12 text-green-600">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <p className="text-2xl font-bold text-wood-900">{t('payment.approved')}</p>
      <p className="text-lg text-wood-600">
        <PrecioConIvi monto={total} /> · {t('payment.table', { mesa })}
      </p>

      {tipoPago === 'factura' && (
        <div className="w-full max-w-sm">
          {(estadoFactura === 'generando' || !facturaResultado) && (
            <div className="flex flex-col items-center gap-2 rounded-xl bg-white px-4 py-3 shadow-sm shadow-wood-900/10">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-wood-200 border-t-brand-red" />
              <p className="text-sm font-semibold text-wood-700">{t('payment.generandoFactura')}</p>
            </div>
          )}

          {estadoFactura !== 'generando' && facturaResultado?.ok && (
            <div className="flex flex-col items-center gap-1 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-800">
              <p className="font-bold">{t('payment.facturaAprobadaTitle')}</p>
              {facturaResultado.clave && (
                <p className="font-mono text-xs">
                  {t('payment.facturaClave', {
                    clave: `${facturaResultado.clave.slice(0, 4)}…${facturaResultado.clave.slice(-4)}`,
                  })}
                </p>
              )}
              {facturaResultado.correoEnviado && <p>{t('payment.facturaCorreoEnviado')}</p>}
              {facturaResultado.pdfUrl && (
                <a
                  href={facturaResultado.pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 font-semibold underline"
                >
                  {t('payment.facturaDescargarPdf')}
                </a>
              )}
            </div>
          )}

          {estadoFactura !== 'generando' && facturaResultado && !facturaResultado.ok && (
            <div className="flex flex-col items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              <p className="font-bold">{t('payment.facturaRechazadaTitle')}</p>
              {facturaResultado.mensajeError && <p>{facturaResultado.mensajeError}</p>}
              <div className="mt-1 flex gap-2">
                <button
                  type="button"
                  onClick={intentarFactura}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white active:scale-95"
                >
                  {t('payment.reintentar')}
                </button>
                <button
                  type="button"
                  onClick={handleContinuarSinFactura}
                  className="rounded-lg bg-wood-200 px-4 py-2 text-sm font-semibold text-wood-800 active:scale-95"
                >
                  {t('payment.continuarSinFactura')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <p className="mt-2 text-2xl font-semibold text-wood-700">{t('payment.seeYouSoon')}</p>
    </>
  )

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-cream-50">
      {/* Header: "Regresar a MENU" en la esquina superior izquierda (junto al
          botón de volver), logo centrado (mismo patrón que MenuScreen, para
          consistencia visual) y "Revisión de Pedido" en la esquina superior derecha. */}
      <header className="relative flex shrink-0 items-center justify-center bg-wood-950 px-6 py-3">
        <div className="absolute left-6 flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            disabled={estado !== 'idle'}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-wood-800 text-cream-50 transition-transform active:scale-90 disabled:opacity-40"
            aria-label={t('common.backToOrder')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-6 w-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-extrabold uppercase tracking-widest text-cream-50 sm:text-xl">
            {t('payment.regresarMenu')}
          </h1>
        </div>
        <img src={logoBadge} alt="Carnes Don Fernando" className="h-14 w-14 sm:h-16 sm:w-16" />
        <div className="absolute right-6">
          <h2 className="text-lg font-extrabold uppercase tracking-widest text-cream-50 sm:text-xl">
            {t('payment.revisionPedido')}
          </h2>
        </div>
      </header>

      {estado !== 'aprobado' ? (
        <main className="flex flex-1 flex-col overflow-y-auto p-4">
          <div className="mx-auto flex w-full min-h-0 max-w-5xl flex-1 flex-col gap-3">
            {/*
              min-h-0 en el wrapper, en el grid y en cada `<section>` es
              necesario para que `flex-1`/`h-full` puedan realmente ENCOGER
              las columnas por debajo de su alto de contenido (por defecto
              los hijos flex/grid tienen min-height:auto, así que si el
              listado de productos o las sugerencias son largos, la columna
              se estira más allá del espacio disponible y empuja los botones
              inferiores fuera de la pantalla, obligando a hacer scroll). Con
              min-h-0 la columna queda fija al alto disponible y el listado
              interno hace scroll propio (ver overflow-y-auto en los
              contenedores internos de abajo), dejando siempre visibles los
              botones inferiores. El contenedor raíz además usa
              `h-screen overflow-hidden` (en vez de `min-h-screen`, que
              permite crecer más allá del viewport) para que este límite sea
              real y no sólo teórico en la pantalla del kiosko (M8W).
            */}
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 md:grid-cols-2">
              {/* Columna izquierda: resumen del pago (productos, subtotal, impuestos, total) */}
              <section className="flex h-full min-h-0 flex-col gap-2 rounded-2xl bg-white p-3 shadow-sm shadow-wood-900/10">
                <div className="mb-0.5 flex items-center justify-between">
                  <h2 className="text-base font-bold text-wood-900">{t('payment.orderSummary')}</h2>
                  <span className="text-sm font-semibold text-wood-500">{t('payment.table', { mesa })}</span>
                </div>
                <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
                  {lines.map((line) => {
                    const terminoTexto = lineTerminosTexto(line, terminoLabel, (n) =>
                      t('customize.comensalSuffix', { n }),
                    )
                    const opcionMostrar = opcionParaMostrar(line.productId, line.opcion)
                    return (
                    <div key={line.id} className="flex items-start justify-between gap-3 text-left">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-wood-900">
                          {line.quantity}x {line.variante ?? line.name}
                        </p>
                        {opcionMostrar && (
                          <p className="text-sm text-wood-500">
                            {t('cart.opcion', { value: opcionMostrar })}
                          </p>
                        )}
                        {line.corte && (
                          <p className="text-sm text-wood-500">{t('cart.cut', { value: line.corte })}</p>
                        )}
                        {terminoTexto && (
                          <p className="text-sm text-wood-500">
                            {t('cart.termino', { value: terminoTexto })}
                          </p>
                        )}
                        {line.guarniciones && line.guarniciones.length > 0 && (
                          <p className="text-sm text-wood-500">
                            {t('cart.guarniciones', {
                              value: guarnicionesResumen(line.guarniciones, language),
                            })}
                          </p>
                        )}
                        {line.extras && line.extras.length > 0 && (
                          <p className="text-sm text-wood-500">
                            {t('cart.extras', { value: line.extras.join(', ') })}
                          </p>
                        )}
                      </div>
                      <PrecioConIvi
                        monto={line.price * line.quantity}
                        className="shrink-0 font-semibold text-wood-700"
                      />
                    </div>
                    )
                  })}
                </div>
                <div className="mt-auto flex flex-col gap-1 border-t border-wood-100 pt-2">
                  <div className="flex items-center justify-between text-sm text-wood-600">
                    <span>{t('payment.subtotal')}</span>
                    <span>{formatCRC(subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-wood-600">
                    <span>{t('payment.taxes')}</span>
                    <span>{formatCRC(impuestos)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between border-t border-wood-100 pt-2">
                    <span className="text-sm text-wood-600">
                      {cantidad === 1
                        ? t('payment.productSingular', { count: cantidad })
                        : t('payment.productPlural', { count: cantidad })}
                    </span>
                    <PrecioConIvi monto={total} className="text-2xl font-bold text-wood-900" />
                  </div>
                </div>
              </section>

              {/* Columna derecha: ofrecimiento de más productos (sugerencias/upsell) */}
              <section className="flex h-full min-h-0 flex-col gap-2 rounded-2xl bg-white p-3 shadow-sm shadow-wood-900/10">
                <h2 className="text-base font-bold text-wood-900">{t('payment.suggestionsTitle')}</h2>
                <div className="grid min-h-0 flex-1 grid-cols-3 gap-2 overflow-y-auto pr-1 sm:grid-cols-4">
                  {SUGERENCIAS.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => addSimpleItem(product, language)}
                      className="flex flex-col items-center gap-1.5 rounded-xl bg-wood-50 p-2 text-center shadow-sm shadow-wood-900/5 transition-transform active:scale-95"
                    >
                      {/* size="fill": la imagen ocupa el 100% del ancho de
                          cada mini box (en vez de un cuadrado fijo de 56px),
                          con `aspect-square` para que, sin importar cuántas
                          columnas entren en la grilla, todas las imágenes
                          conserven la misma proporción y el mismo tamaño
                          relativo entre sí. */}
                      <ProductImage
                        src={productImage(product)}
                        alt={productDisplayName(product, language)}
                        size="fill"
                      />
                      {/* El nombre puede ocupar una o dos líneas según el producto;
                          el precio siempre queda pegado al fondo del bloque
                          (mt-auto) para que todos los bloques luzcan uniformes,
                          igual que en las tarjetas del menú (ProductCard). */}
                      <span className="line-clamp-2 text-sm font-medium leading-tight text-wood-800">
                        {productDisplayName(product, language)}
                      </span>
                      <PrecioConIvi
                        monto={product.price}
                        className="mt-auto pt-1 text-sm font-semibold text-brand-red"
                      />
                    </button>
                  ))}
                </div>
              </section>
            </div>

            {/* Botones de pago: siempre al fondo de la página, uno al lado del otro y centrados. */}
            <div className="mt-auto flex shrink-0 flex-col items-center gap-2 border-t border-wood-100 pt-3 text-center">
              {estado === 'idle' && tipoPago === null && (
                <div className="flex w-full max-w-3xl flex-col gap-2 sm:flex-row sm:justify-center">
                  <button
                    type="button"
                    onClick={onSolicitarFactura}
                    className="flex-1 rounded-2xl bg-brand-red px-6 py-3 text-base font-bold text-white shadow-lg shadow-black/20 transition-transform active:scale-95 sm:max-w-xs"
                  >
                    {t('payment.payWithFactura')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipoPago('simple')}
                    className="flex-1 rounded-2xl bg-wood-900 px-6 py-3 text-base font-bold text-white shadow-md shadow-black/10 transition-transform active:scale-95 sm:max-w-xs"
                  >
                    {t('payment.payWithoutFactura')}
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelarOrden}
                    className="flex-1 rounded-2xl border-2 border-wood-300 bg-transparent px-6 py-3 text-base font-bold text-wood-700 transition-transform active:scale-95 sm:max-w-xs"
                  >
                    {t('payment.cancelarOrden')}
                  </button>
                </div>
              )}

              {estado === 'idle' && tipoPago === 'simple' && (
                <div className="flex w-full max-w-sm flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCobrar}
                    className="w-full rounded-2xl bg-brand-red px-16 py-4 text-xl font-bold text-white shadow-2xl shadow-black/20 transition-transform active:scale-95"
                  >
                    {t('payment.payWithCardReader')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipoPago(null)}
                    className="text-sm font-semibold text-wood-500 underline"
                  >
                    {t('payment.cambiarFormaPago')}
                  </button>
                </div>
              )}

              {estado === 'idle' && tipoPago === 'factura' && cliente && (
                <div className="flex w-full max-w-sm flex-col items-center gap-2">
                  <div className="flex w-full items-center justify-between gap-3 rounded-xl bg-wood-100 px-4 py-2.5 text-left text-sm text-wood-700">
                    <span>
                      {t('payment.facturaClienteLabel', { nombre: cliente.nombre, cedula: cliente.cedula })}
                    </span>
                    <button
                      type="button"
                      onClick={onSolicitarFactura}
                      className="shrink-0 font-semibold text-brand-red underline"
                    >
                      {t('payment.cambiarCliente')}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleCobrar}
                    className="w-full rounded-2xl bg-brand-red px-16 py-4 text-xl font-bold text-white shadow-2xl shadow-black/20 transition-transform active:scale-95"
                  >
                    {t('payment.payWithCardReader')}
                  </button>
                </div>
              )}

              {estado === 'procesando' && (
                <div className="flex flex-col items-center gap-3 py-1">
                  <div className="h-12 w-12 animate-spin rounded-full border-4 border-wood-200 border-t-brand-red" />
                  <p className="text-base font-semibold text-wood-700">
                    {t('payment.followInstructions')}
                  </p>
                </div>
              )}
            </div>
          </div>
        </main>
      ) : mesaCompartida ? (
        <main className="flex flex-1 flex-col overflow-y-auto p-4">
          <div className="mx-auto grid w-full max-w-5xl flex-1 grid-cols-1 items-center gap-4 md:grid-cols-2">
            {/* Columna izquierda: confirmación del pago aprobado */}
            <section className="flex flex-col items-center gap-4 text-center">{contenidoConfirmacion}</section>

            {/* Columna derecha: pregunta de otra orden para la misma mesa
                (antes un pop-up), presentada inline con estilo minimalista. */}
            <section className="flex min-h-64 flex-col items-center justify-center gap-4 rounded-3xl bg-white p-8 text-center shadow-sm shadow-wood-900/10">
              {paso === 'preguntaOtraOrden' && (
                <>
                  <p className="text-xl font-semibold text-wood-900">
                    {t('confirmation.otraOrdenPregunta')}
                  </p>
                  <div className="flex w-full flex-col gap-3 sm:flex-row">
                    <button
                      type="button"
                      onClick={handleOtraOrdenSi}
                      disabled={cerrandoMesa}
                      className="flex-1 rounded-2xl bg-brand-red py-4 text-base font-bold text-white transition-transform active:scale-95 disabled:opacity-50"
                    >
                      {t('confirmation.otraOrdenSi')}
                    </button>
                    <button
                      type="button"
                      onClick={handleOtraOrdenNo}
                      disabled={cerrandoMesa}
                      className="flex-1 rounded-2xl bg-wood-100 py-4 text-base font-bold text-wood-800 transition-transform active:scale-95 disabled:opacity-50"
                    >
                      {t('confirmation.otraOrdenNo')}
                    </button>
                  </div>
                  {cerrandoMesa && (
                    <p className="text-sm text-wood-400">{t('confirmation.mesaCerrada')}</p>
                  )}
                </>
              )}
            </section>
          </div>
        </main>
      ) : (
        <main className="flex flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
          {contenidoConfirmacion}
        </main>
      )}

      {/* Popup 0: verificación del payload antes de enviarlo a Codisa (factura electrónica) */}
      {paso === 'popupWsDf' && ventaConfirmada && wsdfPayload && wsdfValidacion && !resultadoOrdenCodisa && (
        <WsDfPopup
          venta={ventaConfirmada}
          payload={wsdfPayload}
          validacion={wsdfValidacion}
          onConfirmar={handleConfirmarEnvioWsDf}
          onCancelar={handleCancelarWsDf}
          enviando={enviandoOrdenCodisa}
        />
      )}

      {/* Popup 0b: desenlace del envío a Codisa (éxito/error, con reintentar) */}
      {paso === 'popupWsDf' && resultadoOrdenCodisa && (
        <CodisaOrdenPopup
          resultado={resultadoOrdenCodisa}
          onReintentar={handleReintentarOrdenCodisa}
          onCerrar={handleCerrarOrdenCodisa}
        />
      )}

      {/* Popup 1: comprobante del comensal (cliente) — refleja el resultado
          real de `enviarTicket` (ver `impresionCliente`), en vez de asumir
          silenciosamente que se imprimió (ver hallazgo de auditoría). */}
      {paso === 'popupCliente' && ticketsGenerados && (
        <TicketPopup
          titulo={t('confirmation.popupClienteTitulo')}
          secciones={[{ titulo: NOMBRES_IMPRESORA.cliente, lineas: ticketsGenerados.cliente }]}
          textoBoton={t('common.cerrar')}
          onCerrar={handleCerrarPopupCliente}
          estadoImpresion={impresionCliente}
          onReintentarImpresion={() => handleReintentarImpresion('cliente')}
        />
      )}

      {/* Banner no-bloqueante: avisa de cualquier impresión con error REAL
          (no el caso simulado de desarrollo) de las estaciones de la venta
          recién confirmada (mesa simple, o el comprobante del comensal en
          mesa compartida), con opción de reintentar sin bloquear el resto
          del flujo (ver hallazgo de auditoría — antes no había feedback
          alguno de impresión fallida). */}
      {([
        { printer: 'carniceria' as const, resultado: impresionCarniceria },
        { printer: 'restaurante' as const, resultado: impresionRestaurante },
        { printer: 'cliente' as const, resultado: impresionCliente },
      ].filter(({ resultado }) => resultado && !resultado.ok && !resultado.simulado).length > 0) && (
        <div className="fixed inset-x-0 top-0 z-40 flex flex-col gap-1 p-2">
          {[
            { printer: 'carniceria' as const, resultado: impresionCarniceria },
            { printer: 'restaurante' as const, resultado: impresionRestaurante },
            { printer: 'cliente' as const, resultado: impresionCliente },
          ]
            .filter(({ resultado }) => resultado && !resultado.ok && !resultado.simulado)
            .map(({ printer }) => (
              <div
                key={printer}
                className="flex items-center justify-between gap-3 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-lg"
              >
                <span>{t('payment.impresionFallidaBanner', { impresora: NOMBRES_IMPRESORA[printer] })}</span>
                <button
                  type="button"
                  onClick={() => handleReintentarImpresion(printer)}
                  className="shrink-0 rounded-lg bg-white/20 px-3 py-1 font-bold underline"
                >
                  {t('payment.reintentar')}
                </button>
              </div>
            ))}
        </div>
      )}

      {/* Pop-up de error real de impresión al cerrar mesa compartida (ver
          `intentarImprimirCierre`/`handleOtraOrdenNo`): con opción de
          reintentar o continuar sin imprimir (el pedido ya quedó
          registrado de todas formas). */}
      {cerrandoMesaError && (
        <ImpresionErrorPopup
          impresoras={cerrandoMesaError}
          reintentando={cerrandoMesa}
          onReintentar={handleReintentarImpresionCierre}
          onContinuar={handleContinuarSinImprimirCierre}
        />
      )}

      {/* La pregunta "¿otra orden?" de mesa compartida ya no es un pop-up:
          se muestra inline en la columna derecha de la pantalla de aprobado
          (ver bloque `mesaCompartida` arriba), para un flujo más claro. */}

      {/* El tiquete de carnicería/restaurante ya NO tiene pop-up de
          confirmación propio (ver requerimiento): se envía a imprimir
          directamente (mesa simple: junto con el de cliente en el efecto de
          confirmación de venta; mesa compartida: consolidado en
          `handleOtraOrdenNo`), sin ventana emergente. */}

      {/* Popup del datáfono (BAC Transaction Manager): aprobada/denegada/inválida/
          error de sistema/rechazo genérico/error de comunicación. Se superpone
          a cualquier otra pantalla mientras `estado === 'procesando'`. */}
      {resultadoDatafono && (
        <DatafonoPopup
          resultado={resultadoDatafono}
          onReintentar={handleReintentarDatafono}
          onCerrar={handleCerrarDatafono}
        />
      )}
    </div>
  )
}

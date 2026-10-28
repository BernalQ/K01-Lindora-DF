import { codigoArticuloParaCodisa } from '../data/catalog'
import { registrarLogCodisa } from './codisaLogs'
import { enviarVentaAws } from './awsVentas'
import type { Cliente } from '../types/factura'
import type { Venta } from '../types/order'
import type {
  CategoriaResultadoOrdenCodisa,
  RespuestaClienteCodisa,
  ResultadoBusquedaClienteCodisa,
  ResultadoOrdenCodisa,
  ValidacionWsDf,
  WsDfPayload,
} from '../types/wsdf'

/**
 * Configuración e integración real con el API `df_api.php` de Codisa —
 * factura electrónica (búsqueda de cliente por cédula + envío de pedido).
 *
 * Host real de Codisa: `10.0.1.24`, puerto 443 (https) — pero `endpointCliente`/
 * `endpointOrden` de abajo NO apuntan ahí directo. Apuntan al `print-bridge`
 * local (`http://localhost:4000`, ver `BRIDGE_URL` en `services/facturacion.ts`,
 * mismo servicio), que hace de proxy server-to-server hacia Codisa (ver
 * `print-bridge/src/routes/codisa.ts`).
 *
 * Por qué el proxy en vez de llamar directo: el servidor de Codisa no
 * responde correctamente al preflight CORS (`OPTIONS`) que todo navegador
 * manda antes de un POST con `Content-Type: application/json` entre
 * orígenes distintos (el kiosko sirve la PWA en `http://localhost:3000`,
 * distinto origen a `https://10.0.1.24`) — Codisa le devuelve 400 Bad
 * Request a ese preflight, y el navegador nunca llega a mandar el POST real
 * (el mismo JSON sí funciona probado con Postman, porque Postman no aplica
 * CORS). Como el equipo de Codisa no tiene a corto plazo ese arreglo
 * disponible de su lado, se resolvió enteramente del lado del kiosko: una
 * petición Node-a-servidor (el `print-bridge`) no está sujeta a CORS en
 * absoluto, así que hace de intermediario y reenvía la respuesta de Codisa
 * tal cual de vuelta a la PWA. Si en el futuro Codisa agrega los headers de
 * CORS necesarios en su servidor, este proxy deja de ser estrictamente
 * necesario, pero no hace daño dejarlo (misma forma de JSON de ida y vuelta).
 */
export const WSDF_CONFIG = {
  /**
   * ID de tienda asignado por Codisa a este kiosko. Configurable vía
   * `VITE_CODISA_ID_TIENDA` (ver `.env.example`) para desplegar el mismo
   * build en otro kiosko/tienda sin recompilar con un valor distinto
   * hardcodeado (ver hallazgo de auditoría).
   */
  idTienda: import.meta.env.VITE_CODISA_ID_TIENDA || '22',
  /**
   * ID de cliente genérico para ventas sin factura electrónica (consumidor
   * final / anónimo), según el maestro de clientes de Codisa para esta
   * tienda (`id_tienda` arriba) — NO es un valor arbitrario nuestro.
   *
   * Confirmado como "0" directamente por Codisa (equipo CF) tras reproducir
   * el rechazo real en su lado: con `id_cliente: "1"` (valor anterior, ver
   * hallazgo de auditoría) Oracle devolvía
   * `ORA-02291: integrity constraint (NAF6.FK_ENCABEZADO_CLIENTES) violated
   * - parent key not found` — "1" no existe como cliente registrado en su
   * tabla CLIENTES para esta tienda, así que TODA venta sin factura se
   * rechazaba siempre, sin importar ningún otro campo del pedido. Con
   * `id_cliente: "0"` esa restricción ya no se viola (se probó un pedido
   * completo contra el ambiente real de Codisa y pasó esa validación).
   */
  idClienteAnonimo: '0',
  endpointCliente: 'http://localhost:4000/codisa/cliente',
  endpointOrden: 'http://localhost:4000/codisa/orden',
}

/** Longitud exacta de una cédula física costarricense (9 dígitos, sin guiones). */
export const CEDULA_LONGITUD_FISICA = 9
/** Longitud exacta de una cédula jurídica costarricense (10 dígitos, sin guiones). */
export const CEDULA_LONGITUD_JURIDICA = 10
/** Longitud mínima/máxima de un DIMEX/NITE/pasaporte de extranjero (11–12 dígitos) aceptados por Codisa como identificación de persona física extranjera. */
const CEDULA_LONGITUD_EXTRANJERO_MIN = 11
const CEDULA_LONGITUD_EXTRANJERO_MAX = 12

/**
 * Tiempo máximo de espera por una respuesta de Codisa antes de abortar la
 * petición (`AbortController`). Ninguno de los dos endpoints (`cliente`,
 * `orden`) documenta un timeout propio; sin esto, una caída de red del lado
 * de Codisa dejaba la UI (`CedulaScreen`/`WsDfPopup`) esperando
 * indefinidamente (ver hallazgo de auditoría).
 */
const TIMEOUT_MS = 35_000

/**
 * IDs de pedido (`WsDfPedido.id`, mismo consecutivo usado como `Venta.id`)
 * que ya se enviaron con éxito a Codisa. Evita reenviar duplicados si el
 * usuario presiona "Confirmar envío" más de una vez después de un envío
 * exitoso (ver `validarPedidoWsDf` y `enviarPedidoWsDf` abajo) — análogo en
 * espíritu a `terminalesConTransaccionActiva` en `services/datafono.ts`,
 * aunque aquí el riesgo es duplicar un pedido, no una transacción en vuelo.
 *
 * Persistido en `localStorage` (antes `sessionStorage` — ver hallazgo de
 * auditoría): el kiosko corre desatendido y puede reiniciarse (navegador
 * cerrado/reabierto, proceso relanzado, corte de luz) en medio del flujo de
 * pago con mucha más frecuencia de lo que se recarga una pestaña normal de
 * escritorio; con `sessionStorage` esa protección se perdía por completo en
 * cualquiera de esos reinicios, justo el escenario más probable en este
 * dispositivo. `localStorage` sobrevive al cierre/reapertura del navegador y
 * al reinicio del proceso, cubriendo ese caso — ver
 * `leerIdsPedidoEnviados`/`agregarIdPedidoEnviado` abajo.
 *
 * IMPORTANTE — límites de esta protección (sigue sin ser deduplicación
 * permanente/servidor-side): `localStorage` es local a este dispositivo y
 * navegador — no se comparte entre dos kioskos ni se sincroniza con Codisa.
 * Esto significa que:
 * - Si se usa un navegador distinto, un perfil distinto, o se limpian los
 *   datos del sitio manualmente, esta protección se pierde.
 * - Dos kioskos físicos distintos (si existieran) no comparten este set, así
 *   que tampoco protege contra un envío duplicado disparado desde dos
 *   dispositivos.
 * Esta salvaguarda cubre el caso más común en la práctica (doble-tap,
 * reintento accidental, o un reinicio del kiosko a medio flujo). La
 * deduplicación real/definitiva (por ejemplo, que Codisa rechace un
 * `pedido.id` repetido del lado del servidor) debe garantizarla el propio
 * backend de Codisa, no esta PWA — si eso no está garantizado del lado de
 * Codisa, un reinicio simultáneo de `localStorage` (ej. limpieza manual de
 * datos del navegador) sigue siendo un vector de duplicado real.
 */
const CLAVE_IDS_PEDIDO_ENVIADOS = 'wsdf_ids_pedido_enviados_v1'

function leerIdsPedidoEnviados(): Set<string> {
  try {
    const crudo = localStorage.getItem(CLAVE_IDS_PEDIDO_ENVIADOS)
    if (!crudo) return new Set()
    const parsed = JSON.parse(crudo) as unknown
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set()
  } catch {
    return new Set()
  }
}

function idPedidoYaEnviado(id: string): boolean {
  return leerIdsPedidoEnviados().has(id)
}

function agregarIdPedidoEnviado(id: string): void {
  const actuales = leerIdsPedidoEnviados()
  actuales.add(id)
  try {
    localStorage.setItem(CLAVE_IDS_PEDIDO_ENVIADOS, JSON.stringify(Array.from(actuales)))
  } catch {
    // localStorage no disponible (ej. modo privado): la protección contra
    // reenvío queda sólo en memoria para esta carga de página, igual que
    // antes de este cambio.
  }
}

/**
 * Bandera de concurrencia para el envío de pedidos: este kiosko envía como
 * máximo un pedido a Codisa a la vez (una sola venta en proceso de pago por
 * terminal). Evita que un doble-tap sobre "Confirmar envío" (o un
 * "Intentar de nuevo" disparado mientras el intento anterior sigue en
 * vuelo) mande dos POST simultáneos — mismo propósito que
 * `terminalesConTransaccionActiva` en `services/datafono.ts`, aplicado aquí
 * porque Codisa no documenta una regla equivalente del lado del servidor.
 * El botón "Confirmar envío" de la UI (`WsDfPopup`/`PaymentScreen`) ya se
 * deshabilita mientras espera respuesta; esta bandera es la salvaguarda a
 * nivel de servicio, independiente de la UI.
 */
let envioOrdenEnCurso = false

/** Quita todo lo que no sea dígito (espacios, guiones, etc.), para validar/enviar la cédula siempre en su forma numérica pura. */
export function limpiarCedula(cedula: string): string {
  return cedula.replace(/\D/g, '')
}

/** Resultado de clasificar una cédula ya limpia (sólo dígitos) por su longitud. */
export interface FormatoCedula {
  /** 'F' persona física (incluye extranjero con DIMEX/NITE/pasaporte), 'J' persona jurídica. */
  tipoPersona: 'F' | 'J'
  /** Código Hacienda/Codisa del tipo de identificación: '1' cédula física, '2' cédula jurídica, '3' DIMEX/NITE/pasaporte de extranjero. */
  tipoIdentificacion: string
}

/**
 * Clasifica una cédula (ya limpia de guiones/espacios, sólo dígitos) según
 * su longitud, aceptando los tres formatos de identificación costarricense
 * que Codisa puede recibir — antes sólo se aceptaba la cédula física
 * nacional (9 dígitos), lo que dejaba sin camino alguno a clientes con
 * cédula jurídica o identificación de extranjero (ver hallazgo de
 * auditoría). Devuelve `null` si la longitud no corresponde a ninguno de los
 * tres formatos conocidos.
 */
export function clasificarCedula(cedulaLimpia: string): FormatoCedula | null {
  const longitud = cedulaLimpia.length
  if (longitud === CEDULA_LONGITUD_FISICA) return { tipoPersona: 'F', tipoIdentificacion: '1' }
  if (longitud === CEDULA_LONGITUD_JURIDICA) return { tipoPersona: 'J', tipoIdentificacion: '2' }
  if (longitud >= CEDULA_LONGITUD_EXTRANJERO_MIN && longitud <= CEDULA_LONGITUD_EXTRANJERO_MAX) {
    return { tipoPersona: 'F', tipoIdentificacion: '3' }
  }
  return null
}

/**
 * Completa `tipoPersona`/`tipoIdentificacion` de un `Cliente` cuando faltan,
 * derivándolos de la longitud de su cédula (ver `clasificarCedula`).
 *
 * `buscarClienteCodisa` ya devuelve estos campos directamente desde Codisa
 * (ver `mapearClienteCodisa`), pero un cliente que viene del respaldo local
 * en Excel (`buscarCliente` en `services/facturacion.ts`, consultado en
 * `CedulaScreen` cuando Codisa no lo encuentra) no los trae — su esquema es
 * anterior a esta distinción. Sin esto, `construirPedidoWsDf` caía siempre
 * en el valor por defecto (`tipoPersona: 'F'`, `tipoIdentificacion: '1'`)
 * para esos clientes, lo cual es incorrecto si la cédula guardada en el
 * Excel es en realidad jurídica o de extranjero (ver hallazgo de auditoría).
 * No sobrescribe valores que el cliente ya traiga explícitos.
 */
export function completarTipoPersonaPorCedula(cliente: Cliente): Cliente {
  if (cliente.tipoPersona && cliente.tipoIdentificacion) return cliente
  const formato = clasificarCedula(limpiarCedula(cliente.cedula))
  if (!formato) return cliente
  return {
    ...cliente,
    tipoPersona: cliente.tipoPersona ?? formato.tipoPersona,
    tipoIdentificacion: cliente.tipoIdentificacion ?? formato.tipoIdentificacion,
  }
}

/** Recorta espacios y nunca devuelve `undefined`/`null`: evita que un campo opcional vacío (ej. `estado_civil`, `observaciones`) rompa el contrato de Codisa, que siempre espera un string. */
function limpiarTexto(valor?: string | null): string {
  return (valor ?? '').trim()
}

/**
 * Convierte un monto a string con exactamente 2 decimales (ej. 16730.78 ->
 * "16730.78", 15355 -> "15355.00"), formato que espera Codisa para todo
 * campo monetario.
 *
 * Valida con `Number.isFinite(monto) && monto >= 0` antes de formatear (ver
 * hallazgo de auditoría: antes se rechazaba también `monto === 0`, lo cual
 * bloqueaba artículos promocionales/regalo legítimos con precio cero). A
 * diferencia de `formatMontoDatafono` (que lanza, porque se usa justo antes
 * de cobrar y el llamador puede cortar el flujo de inmediato), aquí NO se
 * lanza: `construirPedidoWsDf` es una función pura llamada dentro de un
 * efecto DESPUÉS de que el pago ya fue aprobado e impreso, así que un error
 * de monto en esta etapa no debe tumbar toda la pantalla de confirmación. En
 * su lugar, un monto genuinamente inválido (negativo o `NaN`) devuelve un
 * sentinel ("0.00") que `validarPedidoWsDf` detecta y rechaza
 * (`error-validacion`), bloqueando el envío a Codisa sin afectar el resto
 * del flujo del kiosko.
 */
function formatMontoCodisa(monto: number): string {
  if (!Number.isFinite(monto) || monto < 0) {
    console.error(`[wsdf] Monto inválido (${monto}) recibido para formatMontoCodisa; se usa "0.00" como sentinel — validarPedidoWsDf debe bloquear el envío.`)
    return '0.00'
  }
  return monto.toFixed(2)
}

/** Convierte una fecha ISO (`Venta.fechaHora`, `new Date().toISOString()`) al formato `YYYY-MM-DD HH:mm:ss` (hora local, sin milisegundos ni zona) que espera Codisa. */
function formatFechaCodisa(fechaIso: string): string {
  const fecha = new Date(fechaIso)
  const dos = (n: number) => String(n).padStart(2, '0')
  const yyyy = fecha.getFullYear()
  const mm = dos(fecha.getMonth() + 1)
  const dd = dos(fecha.getDate())
  const hh = dos(fecha.getHours())
  const mi = dos(fecha.getMinutes())
  const ss = dos(fecha.getSeconds())
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`
}

/**
 * Divide un nombre completo en nombre/apellido1/apellido2 con una heurística
 * simple (válida para la convención costarricense "Nombre [Nombre2]
 * Apellido1 Apellido2"), usada sólo cuando `Cliente` no trae ya los
 * apellidos separados (ej. cuando el cliente se registró manualmente en
 * `RegistroClienteScreen`, que pide un único campo "Nombre completo").
 */
function dividirNombreCompleto(nombreCompleto: string): { nombre: string; apellido1: string; apellido2: string } {
  const partes = nombreCompleto.trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return { nombre: '', apellido1: '', apellido2: '' }
  if (partes.length === 1) return { nombre: partes[0], apellido1: '', apellido2: '' }
  if (partes.length === 2) return { nombre: partes[0], apellido1: partes[1], apellido2: '' }
  return { nombre: partes[0], apellido1: partes[1], apellido2: partes.slice(2).join(' ') }
}

/**
 * Construye el payload JSON compatible con `?action=orden` a partir de una
 * venta ya confirmada (pago aprobado). No envía nada: sólo arma el objeto,
 * listo para mostrarse en el pop-up de verificación (`WsDfPopup`) y luego
 * enviarse vía `enviarPedidoWsDf`. Todos los montos se normalizan a string
 * con 2 decimales, la fecha a `YYYY-MM-DD HH:mm:ss`, y los campos de texto
 * opcionales (`estado_civil`, `observaciones`, etc.) siempre quedan como
 * string (nunca `undefined`/`null`) — ver `formatMontoCodisa`/
 * `formatFechaCodisa`/`limpiarTexto` arriba.
 */
export function construirPedidoWsDf(venta: Venta): WsDfPayload {
  const conFactura = venta.tipoPago === 'factura' && !!venta.cliente
  const cliente = conFactura ? venta.cliente : undefined

  // Jurídica (empresa): el nombre completo va tal cual en `nombre`, sin
  // partirlo en apellidos — una razón social no tiene "apellido", y
  // `dividirNombreCompleto` (pensado para personas físicas) lo cortaría mal
  // (ej. "Ferretería El Tornillo S.A." quedaría con "Ferretería" en `nombre`
  // y el resto repartido entre `apellido1`/`apellido2`).
  const { nombre, apellido1, apellido2 } =
    cliente?.tipoPersona === 'J'
      ? { nombre: cliente?.nombre ?? '', apellido1: '', apellido2: '' }
      : cliente?.apellido1 !== undefined || cliente?.apellido2 !== undefined
        ? { nombre: cliente?.nombre ?? '', apellido1: cliente?.apellido1 ?? '', apellido2: cliente?.apellido2 ?? '' }
        : dividirNombreCompleto(cliente?.nombre ?? '')

  const detalle = venta.items.map((item) => {
    const totalLinea = item.price * item.quantity
    return {
      // Código de artículo Codisa: usa el código específico de la variante
      // elegida cuando aplica (ej. "Gaseosa" vs "Tropical", o la marca de
      // cerveza — ver `CODIGOS_POR_VARIANTE` en `data/catalog.ts`),
      // si no `Product.codigoArticulo`, y como último respaldo el
      // `productId` interno — así el envío a Codisa nunca se rompe por
      // falta de código (ver `codigoArticuloParaCodisa`).
      id_articulo: codigoArticuloParaCodisa(item.productId, item.variante),
      cantidad: String(item.quantity),
      precio: formatMontoCodisa(item.price),
      porc_desc: 0,
      porc_iv: '0',
      total_neto: formatMontoCodisa(totalLinea),
      observaciones: '',
    }
  })

  // `limpiarCedula`: un cliente encontrado en Codisa ya llega con la cédula
  // limpia (ver `mapearClienteCodisa`), pero uno del respaldo en Excel o de
  // registro manual (`RegistroClienteScreen`) conserva lo que el operador
  // tecleó en `CedulaScreen`, cuyo input permite dígitos Y guiones — sin este
  // paso, `id_cliente` llegaría con guiones para esas dos fuentes y sin
  // guiones para Codisa, una inconsistencia de formato entre fuentes (ver
  // hallazgo de auditoría).
  const idCliente = cliente?.cedula ? limpiarCedula(cliente.cedula) : WSDF_CONFIG.idClienteAnonimo

  return {
    pedido: {
      id: venta.id,
      id_tienda: WSDF_CONFIG.idTienda,
      id_cliente: idCliente,
      tipo_persona: cliente?.tipoPersona ?? 'F',
      tipo_identificacion: cliente?.tipoIdentificacion ?? '1',
      nombre: limpiarTexto(nombre),
      apellido1: limpiarTexto(apellido1),
      apellido2: limpiarTexto(apellido2),
      genero: cliente?.genero ?? '',
      estado_civil: limpiarTexto(cliente?.estadoCivil),
      email: limpiarTexto(cliente?.correo),
      telefono: limpiarTexto(cliente?.telefono),
      direccion: limpiarTexto(cliente?.direccion),
      fecha: formatFechaCodisa(venta.fechaHora),
      total_desc: 0,
      total_imp: '0',
      total_envio: null,
      total_neto: formatMontoCodisa(venta.total),
      observaciones: '',
      no_autoriza: 0,
      no_cuenta: '',
      fe: conFactura ? '1' : '0',
      // Pedido siempre consumido en el kiosko (no hay reparto a domicilio en
      // este flujo); se mantiene 'S' independientemente del ejemplo genérico
      // de Codisa (que usa "N"), que no refleja la lógica real del negocio.
      despachar: 'S',
      detalle,
    },
  }
}

/**
 * Valida un payload antes de mostrarlo/enviarlo, según las reglas mínimas
 * acordadas con Codisa:
 * - Debe existir el objeto raíz "pedido".
 * - `fe` debe ser "0" o "1" (se rechaza cualquier otro valor).
 * - `id_tienda` debe coincidir con la tienda configurada (`WSDF_CONFIG.idTienda`).
 * - `id_cliente` no puede estar vacío.
 * - `id` (pedido) no debe haberse enviado ya con éxito (ver `idsPedidoEnviados`).
 * - `cantidad` y `precio` de cada línea deben ser numéricos.
 * - `total_neto` del pedido debe ser consistente con la suma de las líneas.
 */
export function validarPedidoWsDf(payload: WsDfPayload): ValidacionWsDf {
  const errores: string[] = []

  if (!payload || typeof payload !== 'object' || !payload.pedido) {
    return { ok: false, errores: ['El JSON debe tener un objeto raíz "pedido".'] }
  }

  const { pedido } = payload

  if (pedido.fe !== '0' && pedido.fe !== '1') {
    errores.push(`"fe" debe ser "0" o "1" (recibido: ${String(pedido.fe)}).`)
  }

  if (!pedido.id_tienda || pedido.id_tienda !== WSDF_CONFIG.idTienda) {
    errores.push(`"id_tienda" (${String(pedido.id_tienda)}) no coincide con la tienda configurada.`)
  }

  if (!pedido.id_cliente) {
    errores.push('"id_cliente" no puede estar vacío.')
  }

  if (idPedidoYaEnviado(pedido.id)) {
    errores.push(`El pedido "${pedido.id}" ya fue enviado anteriormente a Codisa; no debe reenviarse.`)
  }

  let sumaDetalle = 0
  pedido.detalle.forEach((linea, i) => {
    const cantidad = Number(linea.cantidad)
    const precio = Number(linea.precio)
    const totalLinea = Number(linea.total_neto)
    if (!Number.isFinite(cantidad) || cantidad <= 0) errores.push(`Línea ${i + 1}: "cantidad" debe ser un número mayor a cero.`)
    if (!Number.isFinite(precio) || precio < 0) errores.push(`Línea ${i + 1}: "precio" debe ser un número válido (no negativo).`)
    if (!Number.isFinite(totalLinea) || totalLinea < 0) {
      errores.push(`Línea ${i + 1}: "total_neto" debe ser un número válido (no negativo).`)
    } else {
      sumaDetalle += totalLinea
    }
  })

  // `< 0` (no `<= 0`): un pedido con total ₡0 (ej. 100% de descuento/cortesía)
  // es válido — ya se permite el mismo caso a nivel de línea individual en
  // `formatMontoCodisa` (ver hallazgo de auditoría: antes este chequeo seguía
  // bloqueando el envío aunque las líneas sí aceptaran 0).
  const totalNeto = Number(pedido.total_neto)
  if (!Number.isFinite(totalNeto) || totalNeto < 0) {
    errores.push(`"total_neto" (${pedido.total_neto}) debe ser un número válido (no negativo).`)
  } else if (Math.abs(totalNeto - sumaDetalle) > 0.01) {
    errores.push(`"total_neto" (${pedido.total_neto}) no coincide con la suma del detalle (${sumaDetalle.toFixed(2)}).`)
  }

  return { ok: errores.length === 0, errores }
}

/**
 * Trazabilidad persistida de los envíos de pedido a Codisa, para el panel de
 * Admin ("Envíos a Codisa", `PanelCodisaOrdenes` en `AdminScreen.tsx`) —
 * mismo propósito y mismo patrón de persistencia en `localStorage` que
 * `services/awsVentas.ts`, pero SIN reintento automático en segundo plano
 * (Codisa, a diferencia de AWS, es parte del flujo de facturación en el
 * momento de la venta; el único mecanismo de reintento pedido es el botón
 * manual "Reenviar" del panel). A diferencia de `codisaLogs.ts` (bitácora
 * cruda de request/response pensada para depurar), esto es un resumen
 * ESTRUCTURADO pensado para operar: qué pedido quedó sin enviarse, con qué
 * código de error, y con el JSON exacto que se intentó mandar, listo para
 * reintentarlo con un botón sin tener que reconstruir nada.
 */

/** Un pedido que no se pudo enviar a Codisa (o fue rechazado) y espera reenvío manual desde Admin. */
export interface EnvioCodisaPendiente {
  ventaId: string
  /** JSON exacto que se intentó enviar (y que se reenvía tal cual al presionar "Reenviar"). */
  payload: WsDfPayload
  /** Categoría del último error (ver `CategoriaResultadoOrdenCodisa`), usada como "código de error" en el panel de Admin. */
  categoriaError: CategoriaResultadoOrdenCodisa
  /** Mensaje descriptivo del último error (ver `ResultadoOrdenCodisa.mensaje`). */
  ultimoError: string
  /** Intentos ya realizados (el inicial + cada reenvío manual desde Admin). */
  intentos: number
  /** ISO de la última vez que se intentó enviar este pedido. */
  ultimoIntentoEn: string
}

/** Un pedido que Codisa ya confirmó recibido/aceptado. */
export interface EnvioCodisaExitoso {
  ventaId: string
  enviadoEn: string
}

const CLAVE_CODISA_PENDIENTES = 'codisa_ordenes_pendientes_v1'
const CLAVE_CODISA_ENVIADOS = 'codisa_ordenes_enviados_v1'

type CodisaPendientesGuardados = Record<string, EnvioCodisaPendiente>
type CodisaEnviadosGuardados = Record<string, EnvioCodisaExitoso>

function leerJsonWsDf<T>(clave: string, porDefecto: T): T {
  try {
    const crudo = localStorage.getItem(clave)
    return crudo ? (JSON.parse(crudo) as T) : porDefecto
  } catch {
    return porDefecto
  }
}

function guardarJsonWsDf(clave: string, valor: unknown): void {
  try {
    localStorage.setItem(clave, JSON.stringify(valor))
  } catch (err) {
    // Ver comentario equivalente en `services/awsVentas.ts`: un problema de
    // persistencia de la trazabilidad nunca debe tumbar el flujo de pago.
    console.warn('[wsdf] No se pudo persistir la trazabilidad de envíos a Codisa en localStorage:', err)
  }
}

function leerCodisaPendientes(): CodisaPendientesGuardados {
  return leerJsonWsDf(CLAVE_CODISA_PENDIENTES, {})
}

function leerCodisaEnviados(): CodisaEnviadosGuardados {
  return leerJsonWsDf(CLAVE_CODISA_ENVIADOS, {})
}

/**
 * Registra el desenlace de un intento de envío a Codisa (éxito o error) en
 * la trazabilidad persistida. Se llama desde `enviarPedidoWsDf` en cada uno
 * de sus puntos de retorno, salvo 'en-curso' (no es un desenlace real de
 * ESTE intento, ver `envioOrdenEnCurso` más abajo: el envío original sigue
 * en vuelo y es ÉSE el que terminará registrando el resultado real).
 *
 * Éxito ('enviado'): se guarda en `CLAVE_CODISA_ENVIADOS` y se quita de
 * `CLAVE_CODISA_PENDIENTES` si estaba ahí (ej. tras un reenvío manual
 * exitoso). Cualquier otra categoría: se guarda/actualiza en
 * `CLAVE_CODISA_PENDIENTES`, incrementando `intentos` sobre la entrada
 * previa si ya existía (reenvíos manuales repetidos del mismo pedido).
 */
function registrarResultadoCodisaOrdenes(payload: WsDfPayload, resultado: ResultadoOrdenCodisa): void {
  if (resultado.categoria === 'en-curso') return
  const ventaId = payload.pedido.id

  if (resultado.categoria === 'enviado') {
    const enviados = leerCodisaEnviados()
    enviados[ventaId] = { ventaId, enviadoEn: new Date().toISOString() }
    guardarJsonWsDf(CLAVE_CODISA_ENVIADOS, enviados)

    const pendientes = leerCodisaPendientes()
    if (ventaId in pendientes) {
      delete pendientes[ventaId]
      guardarJsonWsDf(CLAVE_CODISA_PENDIENTES, pendientes)
    }
    return
  }

  const pendientes = leerCodisaPendientes()
  const previo = pendientes[ventaId]
  pendientes[ventaId] = {
    ventaId,
    payload,
    categoriaError: resultado.categoria,
    ultimoError: resultado.mensaje,
    intentos: (previo?.intentos ?? 0) + 1,
    ultimoIntentoEn: new Date().toISOString(),
  }
  guardarJsonWsDf(CLAVE_CODISA_PENDIENTES, pendientes)
}

/** Resumen para el panel de Admin ("Envíos a Codisa"): pedidos que no se pudieron enviar (con su error y JSON) y los ya enviados con éxito. */
export interface ResumenCodisaOrdenes {
  enviados: EnvioCodisaExitoso[]
  pendientes: EnvioCodisaPendiente[]
}

export function obtenerResumenCodisaOrdenes(): ResumenCodisaOrdenes {
  const enviados = Object.values(leerCodisaEnviados()).sort((a, b) => b.enviadoEn.localeCompare(a.enviadoEn))
  const pendientes = Object.values(leerCodisaPendientes()).sort((a, b) => b.ultimoIntentoEn.localeCompare(a.ultimoIntentoEn))
  return { enviados, pendientes }
}

/**
 * Botón "Reenviar" manual desde Admin (`PanelCodisaOrdenes`): reintenta de
 * inmediato el envío de un pedido que había quedado pendiente, reutilizando
 * EXACTAMENTE el mismo JSON que se armó entonces (no se reconstruye desde la
 * venta) — así el operador reenvía tal cual lo que falló, sin que un cambio
 * posterior de catálogo/precio pueda alterar el pedido ya facturado. Delega
 * en `enviarPedidoWsDf`, que ya registra el nuevo desenlace por su cuenta.
 */
export async function reenviarOrdenCodisaManual(ventaId: string): Promise<ResultadoOrdenCodisa | null> {
  const pendientes = leerCodisaPendientes()
  const item = pendientes[ventaId]
  if (!item) return null
  return enviarPedidoWsDf(item.payload)
}

/**
 * Envío real del pedido a Codisa (`WSDF_CONFIG.endpointOrden`). Devuelve un
 * resultado ya clasificado (`ResultadoOrdenCodisa`), análogo en espíritu a
 * `ResultadoDatafono` (ver `services/datafono.ts`), listo para mostrarse en
 * un pop-up de éxito/error con opción de reintentar.
 *
 * Orden de validación:
 * 1. Bandera de concurrencia (`envioOrdenEnCurso`) — se revisa antes de
 *    tocar red o validar nada.
 * 2. Validación local del payload (`validarPedidoWsDf`; si falla, no se
 *    manda nada por red).
 * 3. Request/response se registran en la bitácora (`registrarLogCodisa`,
 *    ver `services/codisaLogs.ts`) para depuración.
 *
 * En el mismo instante en que se intenta el envío real a Codisa (justo
 * después de pasar la validación local), se dispara también
 * `enviarVentaAws` (ver `services/awsVentas.ts`) con el MISMO payload, para
 * mandar una copia de la venta a nuestro backend propio en AWS. Es
 * deliberadamente independiente: no se espera su resultado (`void`, no
 * `await`) y un fallo ahí no afecta ni retrasa el envío a Codisa ni el resto
 * del flujo del kiosko — `enviarVentaAws` maneja sus propios reintentos.
 */
async function intentarEnviarPedidoWsDf(payload: WsDfPayload): Promise<ResultadoOrdenCodisa> {
  if (envioOrdenEnCurso) {
    return {
      categoria: 'en-curso',
      mensaje: 'Ya hay un envío a Codisa en curso. Espere a que finalice antes de enviar otro.',
      permiteReintentar: false,
    }
  }

  const validacion = validarPedidoWsDf(payload)
  if (!validacion.ok) {
    registrarLogCodisa('orden', 'response', { error: 'validacion', errores: validacion.errores })
    return {
      categoria: 'error-validacion',
      mensaje: validacion.errores.join(' '),
      permiteReintentar: false,
    }
  }

  envioOrdenEnCurso = true
  try {
    registrarLogCodisa('orden', 'request', payload)
    void enviarVentaAws(payload)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

    let res: Response
    try {
      res = await fetch(WSDF_CONFIG.endpointOrden, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        const mensaje = `Codisa no respondió dentro de ${TIMEOUT_MS / 1000} segundos (tiempo de espera agotado) al enviar el pedido.`
        registrarLogCodisa('orden', 'response', { error: mensaje })
        return { categoria: 'tiempo-agotado', mensaje, permiteReintentar: true }
      }
      const mensaje = `No se pudo contactar a Codisa: ${(err as Error).message}`
      registrarLogCodisa('orden', 'response', { error: mensaje })
      return { categoria: 'error-red', mensaje, permiteReintentar: true }
    } finally {
      clearTimeout(timeoutId)
    }

    if (!res.ok) {
      // El `print-bridge` (ver `routes/codisa.ts` ahí) siempre devuelve JSON
      // válido con un `mensaje` descriptivo, incluso en sus propios fallos de
      // conexión hacia Codisa (ej. 502 "No se pudo contactar a Codisa: ...")
      // — se intenta leerlo para no perder ese detalle en el panel de Admin,
      // aunque el status HTTP no sea 2xx. Si no se puede leer (ej. Codisa
      // respondiera directo con una página de error no-JSON, caso ya poco
      // probable al pasar por el proxy), se cae al mensaje genérico de antes.
      //
      // Igual que en la respuesta 2xx de abajo, Codisa puede devolver este
      // cuerpo envuelto en un arreglo de un elemento — `[{ error: '...' }]`
      // en vez de `{ mensaje: '...' }` directo (confirmado con un curl real:
      // un pedido rechazado por Codisa respondió HTTP 400 con
      // `[{"success":"0","error":"El pedido no fué posteado"}]`) — sin
      // desenvolver el arreglo, el panel de Admin mostraba sólo el genérico
      // "error HTTP inesperado (400)", perdiendo el motivo real que Codisa sí
      // mandó (ver hallazgo de auditoría).
      const crudoError = await res.json().catch(() => null as unknown)
      const cuerpoError = (Array.isArray(crudoError) ? crudoError[0] : crudoError) as
        | { mensaje?: string; error?: string }
        | null
      const mensajeCodisa =
        typeof cuerpoError?.mensaje === 'string'
          ? cuerpoError.mensaje
          : typeof cuerpoError?.error === 'string'
            ? cuerpoError.error
            : undefined
      const detalle = mensajeCodisa ? ` ${mensajeCodisa}` : ''
      registrarLogCodisa('orden', 'response', { httpStatus: res.status, body: crudoError })
      return {
        categoria: 'error-http',
        mensaje: `Codisa respondió con un error HTTP inesperado (${res.status}).${detalle}`,
        permiteReintentar: true,
      }
    }

    const crudo = await res.json().catch(() => null as unknown)
    registrarLogCodisa('orden', 'response', crudo)

    // A diferencia de `?action=cliente` (siempre un objeto plano, ver
    // `RespuestaClienteCodisa`), `?action=orden` puede venir envuelto en un
    // arreglo de un solo elemento — `[{ success: '0', error: '...' }]` en
    // vez de `{ success: '0', error: '...' }` directo (confirmado con un
    // curl real a Codisa, ver hallazgo de auditoría: antes se leía
    // `body.success` directo sobre el arreglo, que siempre es `undefined`,
    // así que NINGUNA respuesta de Codisa se detectaba como éxito ni
    // mostraba su mensaje real, sin importar qué contestara realmente).
    const body = (Array.isArray(crudo) ? crudo[0] : crudo) as Record<string, unknown> | null

    // Documentado por Codisa: HTTP 200 → { success: 1, mensaje: 'OK', No_Transa_Mov }
    // (envío aceptado) o { success: 0, mensaje/error: '<error>' } (rechazado)
    // — se acepta también `coderror: '0'` como alias de éxito, por
    // consistencia con la respuesta de `?action=cliente`. El mensaje puede
    // venir en `mensaje` (documentado) o en `error` (visto en la práctica),
    // se acepta cualquiera de los dos.
    const exito = body != null && (body.success === 1 || body.success === '1' || body.coderror === '0')
    const mensajeCodisa =
      typeof body?.mensaje === 'string' ? body.mensaje : typeof body?.error === 'string' ? body.error : undefined

    if (exito) {
      agregarIdPedidoEnviado(payload.pedido.id)
      return {
        categoria: 'enviado',
        mensaje: mensajeCodisa ?? 'Pedido enviado correctamente.',
        permiteReintentar: false,
      }
    }

    return {
      categoria: 'rechazado',
      mensaje: mensajeCodisa ?? 'Codisa rechazó el pedido.',
      permiteReintentar: true,
    }
  } finally {
    envioOrdenEnCurso = false
  }
}

/**
 * Punto de entrada público: envía el pedido a Codisa delegando en
 * `intentarEnviarPedidoWsDf` y, con el resultado ya resuelto (éxito o
 * cualquier categoría de error), lo registra en la trazabilidad
 * persistida que consume el panel de Admin (`registrarResultadoCodisaOrdenes`).
 * Mantiene exactamente la misma firma que antes de este cambio, así que
 * ningún llamador existente (`PaymentScreen.tsx`, `reenviarOrdenCodisaManual`
 * arriba) necesita modificarse.
 */
export async function enviarPedidoWsDf(payload: WsDfPayload): Promise<ResultadoOrdenCodisa> {
  const resultado = await intentarEnviarPedidoWsDf(payload)
  registrarResultadoCodisaOrdenes(payload, resultado)
  return resultado
}

/**
 * Busca una clave dentro de `registro` sin distinguir mayúsculas/minúsculas.
 * Necesario porque Codisa, en la práctica, devuelve las claves de `data[]`
 * TODO EN MAYÚSCULAS (ej. `NOMBRE`, `TELEFONO`, `ID_IDENTIFICACION` —
 * confirmado con una respuesta real), mientras que los alias de abajo
 * (`campoClienteCodisa`) están en minúsculas; el acceso a propiedades de un
 * objeto en JS SÍ distingue mayúsculas/minúsculas, así que sin esto ningún
 * alias calzaba nunca y todos los campos llegaban vacíos (hallazgo real de
 * soporte: cliente encontrado en Codisa, pero nombre/teléfono/dirección en
 * blanco en el pedido enviado).
 */
function buscarValorSinMayusculas(registro: Record<string, unknown>, clave: string): unknown {
  if (clave in registro) return registro[clave]
  const claveMinuscula = clave.toLowerCase()
  const claveEncontrada = Object.keys(registro).find((k) => k.toLowerCase() === claveMinuscula)
  return claveEncontrada !== undefined ? registro[claveEncontrada] : undefined
}

/** Lee un campo de un registro de `data[]` probando varios alias posibles de clave, en orden de preferencia (ver `buscarValorSinMayusculas`). */
function campoClienteCodisa(registro: Record<string, string>, ...claves: string[]): string {
  for (const clave of claves) {
    const valor = buscarValorSinMayusculas(registro, clave)
    if (valor !== undefined && valor !== null && String(valor).trim() !== '') return String(valor).trim()
  }
  return ''
}

/**
 * Adapta un registro crudo de `data[]` (forma exacta no 100% documentada
 * por Codisa) al tipo `Cliente` ya usado por el resto de la PWA, probando
 * varios alias posibles por campo (ver doc de `RespuestaClienteCodisa` en
 * `types/wsdf.ts`).
 */
function mapearClienteCodisa(cedula: string, formato: FormatoCedula, registro: Record<string, string>): Cliente {
  // Codisa, en la práctica, separa nombre y apellidos en 3 campos propios
  // (`NOMBRE_PILA`/`APELLIDO1`/`APELLIDO2` — confirmado con una respuesta
  // real), además de un `NOMBRE` que ya viene concatenado ("Bernal Quesada
  // Acuña"). Cuando los 3 campos separados vienen, se usan tal cual —así
  // `construirPedidoWsDf` los manda directo sin tener que volver a partir el
  // nombre concatenado con `dividirNombreCompleto` (una heurística que puede
  // fallar). Si no vienen separados (ej. sólo trae `nombre`/`razon_social`),
  // se cae al nombre completo y se deja que `construirPedidoWsDf` lo divida.
  const apellido1 = campoClienteCodisa(registro, 'apellido1', 'apellido_1', 'primer_apellido')
  const apellido2 = campoClienteCodisa(registro, 'apellido2', 'apellido_2', 'segundo_apellido')
  const nombrePila = campoClienteCodisa(registro, 'nombre_pila', 'nombrePila', 'primer_nombre')
  const nombreCompleto = campoClienteCodisa(
    registro,
    'nombre_completo',
    'nombreCompleto',
    'nombre',
    'razon_social',
    'razonSocial',
  )
  return {
    cedula: campoClienteCodisa(registro, 'cedula', 'id_identificacion', 'identificacion', 'cod_cliente') || cedula,
    nombre: nombrePila || nombreCompleto,
    apellido1: apellido1 || undefined,
    apellido2: apellido2 || undefined,
    correo: campoClienteCodisa(registro, 'correo', 'correo_electronico', 'correoElectronico', 'email', 'email1'),
    telefono: campoClienteCodisa(registro, 'telefono', 'telefono1', 'celular'),
    direccion: campoClienteCodisa(registro, 'direccion', 'direccion1'),
    // Se derivan de la longitud de la cédula consultada (ver
    // `clasificarCedula`), no de la respuesta de Codisa — necesarios para
    // que `construirPedidoWsDf` envíe `tipo_persona`/`tipo_identificacion`
    // correctos en el pedido (antes siempre hardcodeaba 'F').
    tipoPersona: formato.tipoPersona,
    tipoIdentificacion: formato.tipoIdentificacion,
  }
}

/**
 * Busca un cliente por cédula en Codisa (`WSDF_CONFIG.endpointCliente`),
 * para autocompletar los datos de factura electrónica (ver `CedulaScreen`).
 *
 * Orden de validación:
 * 1. Formato de la cédula (sólo números; 9 dígitos = física, 10 = jurídica,
 *    11–12 = DIMEX/NITE/pasaporte de extranjero — ver `clasificarCedula`) —
 *    si la longitud no corresponde a ninguno de los tres formatos, se
 *    devuelve `'invalida'` SIN mandar ninguna petición HTTP. A diferencia de
 *    antes, este caso ya NO es un callejón sin salida: `CedulaScreen` ofrece
 *    continuar al registro manual (`RegistroClienteScreen`) desde el mismo
 *    pop-up de error (ver `ErrorCedula.permiteRegistroManual`).
 * 2. Error de red, tiempo agotado, o HTTP no-200 → `'error-conexion'` (el
 *    llamador debe ofrecer reintentar).
 * 3. `coderror !== "0"` → `'error-api'`: Codisa sí respondió pero reportó un
 *    error real de su lado (no es lo mismo que "no encontrado" — aquí NO se
 *    debe caer silenciosamente al formulario manual sin que el operador se
 *    entere de que algo falló del lado de Codisa).
 * 4. `coderror === "0"` pero `data` vacío/ausente → `'no-encontrado'`
 *    (búsqueda exitosa, cliente genuinamente no existe — el llamador debe
 *    caer al respaldo local y, si tampoco, al formulario manual —
 *    `RegistroClienteScreen`).
 * 5. `coderror === "0"` + `data` no vacío → `'encontrado'` (se mapea al tipo
 *    `Cliente`).
 *
 * Cada request/response se registra en la bitácora (`registrarLogCodisa`).
 */
export async function buscarClienteCodisa(cedulaCruda: string): Promise<ResultadoBusquedaClienteCodisa> {
  const cedula = limpiarCedula(cedulaCruda)
  const formato = clasificarCedula(cedula)
  if (!formato) {
    return {
      categoria: 'invalida',
      mensaje: `La cédula debe contener únicamente números y tener ${CEDULA_LONGITUD_FISICA} dígitos (física), ${CEDULA_LONGITUD_JURIDICA} (jurídica) o ${CEDULA_LONGITUD_EXTRANJERO_MIN}-${CEDULA_LONGITUD_EXTRANJERO_MAX} (DIMEX/pasaporte).`,
    }
  }

  const parametros = { id_tienda: WSDF_CONFIG.idTienda, tipo_persona: formato.tipoPersona, id_identificacion: cedula }
  registrarLogCodisa('cliente', 'request', parametros)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(WSDF_CONFIG.endpointCliente, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parametros),
      signal: controller.signal,
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      const mensaje = `Codisa no respondió dentro de ${TIMEOUT_MS / 1000} segundos (tiempo de espera agotado) al buscar el cliente.`
      registrarLogCodisa('cliente', 'response', { error: mensaje })
      return { categoria: 'error-conexion', mensaje }
    }
    const mensaje = `No se pudo contactar a Codisa: ${(err as Error).message}`
    registrarLogCodisa('cliente', 'response', { error: mensaje })
    return { categoria: 'error-conexion', mensaje }
  } finally {
    clearTimeout(timeoutId)
  }

  if (!res.ok) {
    // Ver comentario equivalente en `enviarPedidoWsDf`: el `print-bridge`
    // siempre devuelve JSON con `mensaje`, incluso en sus propios fallos de
    // conexión — se intenta leerlo para no perder ese detalle.
    const cuerpoError = await res.json().catch(() => null as { mensaje?: string } | null)
    const detalle = typeof cuerpoError?.mensaje === 'string' ? ` ${cuerpoError.mensaje}` : ''
    registrarLogCodisa('cliente', 'response', { httpStatus: res.status, body: cuerpoError })
    return {
      categoria: 'error-conexion',
      mensaje: `Codisa respondió con un error HTTP inesperado (${res.status}) al buscar el cliente.${detalle}`,
    }
  }

  const crudo = await res.json().catch(() => ({ coderror: '1' }) as unknown)
  registrarLogCodisa('cliente', 'response', crudo)

  // Igual que en `intentarEnviarPedidoWsDf` (?action=orden), Codisa puede
  // envolver la respuesta en un arreglo de un solo elemento en vez de
  // devolver el objeto plano documentado — confirmado en la práctica con un
  // rechazo real por IP no autorizada: `[{"mensaje":"Acceso denegado la IP
  // ..."}]`. Sin desenvolver el arreglo, `body.coderror`/`body.data` daban
  // siempre `undefined` (un arreglo no tiene esas propiedades), así que
  // CUALQUIER respuesta envuelta así caía en "Codisa reportó un error al
  // buscar el cliente (código undefined)", perdiendo el motivo real que
  // Codisa sí mandó (ej. el mensaje de IP denegada) — ver hallazgo real de
  // soporte.
  const body = (Array.isArray(crudo) ? crudo[0] : crudo) as RespuestaClienteCodisa | null

  if (!body || body.coderror !== '0') {
    const mensajeCodisa = typeof body?.mensaje === 'string' ? body.mensaje : typeof body?.error === 'string' ? body.error : undefined
    const mensaje = mensajeCodisa
      ? `Codisa reportó un error al buscar el cliente: ${mensajeCodisa}`
      : `Codisa reportó un error al buscar el cliente (código ${body?.coderror}).`
    registrarLogCodisa('cliente', 'response', { error: mensaje, coderror: body?.coderror })
    return { categoria: 'error-api', mensaje }
  }

  if (!body.data || body.data.length === 0) {
    return { categoria: 'no-encontrado' }
  }

  return { categoria: 'encontrado', cliente: mapearClienteCodisa(cedula, formato, body.data[0]) }
}

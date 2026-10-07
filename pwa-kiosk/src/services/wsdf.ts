import { codigoArticuloParaCodisa } from '../data/catalog'
import { registrarLogCodisa } from './codisaLogs'
import type { Cliente } from '../types/factura'
import type { Venta } from '../types/order'
import type {
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
 * Host: `10.0.1.24`, puerto 443 (https). Es una red/host DISTINTO al
 * gateway local del kiosko (`RED_CONFIG.ipGateway` = `10.0.5.250`, ver
 * `services/redConfig.ts`, usado por AWS IoT y por el datáfono BAC) — por
 * eso NO se reutiliza `RED_CONFIG` aquí, se hardcodea el host de Codisa
 * directamente en este archivo, siguiendo el mismo patrón ya usado para
 * otras integraciones externas (`BRIDGE_URL` en `services/facturacion.ts`,
 * `DATAFONO_CONFIG.endpoint` en `services/datafono.ts`).
 */
export const WSDF_CONFIG = {
  /** ID de tienda asignado por Codisa a este kiosko. */
  idTienda: '22',
  /** ID de cliente genérico para ventas sin factura electrónica (consumidor final / anónimo). */
  idClienteAnonimo: '1',
  endpointCliente: 'https://10.0.1.24/kiosko/df_api.php?action=cliente',
  endpointOrden: 'https://10.0.1.24/kiosko/df_api.php?action=orden',
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

  const { nombre, apellido1, apellido2 } =
    cliente?.apellido1 !== undefined || cliente?.apellido2 !== undefined
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
 */
export async function enviarPedidoWsDf(payload: WsDfPayload): Promise<ResultadoOrdenCodisa> {
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
      registrarLogCodisa('orden', 'response', { httpStatus: res.status })
      return {
        categoria: 'error-http',
        mensaje: `Codisa respondió con un error HTTP inesperado (${res.status}).`,
        permiteReintentar: true,
      }
    }

    const body = await res.json().catch(() => null as Record<string, unknown> | null)
    registrarLogCodisa('orden', 'response', body)

    // Documentado por Codisa: HTTP 200 → { success: 1, mensaje: 'OK', No_Transa_Mov }
    // (envío aceptado) o { success: 0, mensaje: '<error>' } (rechazado) — se
    // acepta también `coderror: '0'` como alias de éxito, por consistencia con
    // la respuesta de `?action=cliente`.
    const exito = body != null && (body.success === 1 || body.success === '1' || body.coderror === '0')
    if (exito) {
      agregarIdPedidoEnviado(payload.pedido.id)
      return {
        categoria: 'enviado',
        mensaje: typeof body?.mensaje === 'string' ? body.mensaje : 'Pedido enviado correctamente.',
        permiteReintentar: false,
      }
    }

    return {
      categoria: 'rechazado',
      mensaje: typeof body?.mensaje === 'string' ? body.mensaje : 'Codisa rechazó el pedido.',
      permiteReintentar: true,
    }
  } finally {
    envioOrdenEnCurso = false
  }
}

/** Lee un campo de un registro de `data[]` probando varios alias posibles de clave, en orden de preferencia. */
function campoClienteCodisa(registro: Record<string, string>, ...claves: string[]): string {
  for (const clave of claves) {
    const valor = registro[clave]
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
  const nombreCompleto = campoClienteCodisa(
    registro,
    'nombre_completo',
    'nombreCompleto',
    'nombre',
    'razon_social',
    'razonSocial',
  )
  return {
    cedula: campoClienteCodisa(registro, 'cedula', 'id_identificacion', 'identificacion') || cedula,
    nombre: nombreCompleto,
    correo: campoClienteCodisa(registro, 'correo', 'correo_electronico', 'correoElectronico', 'email'),
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
    registrarLogCodisa('cliente', 'response', { httpStatus: res.status })
    return {
      categoria: 'error-conexion',
      mensaje: `Codisa respondió con un error HTTP inesperado (${res.status}) al buscar el cliente.`,
    }
  }

  const body: RespuestaClienteCodisa = await res.json().catch(() => ({ coderror: '1' }))
  registrarLogCodisa('cliente', 'response', body)

  if (body.coderror !== '0') {
    const mensaje = `Codisa reportó un error al buscar el cliente (código ${body.coderror}).`
    registrarLogCodisa('cliente', 'response', { error: mensaje, coderror: body.coderror })
    return { categoria: 'error-api', mensaje }
  }

  if (!body.data || body.data.length === 0) {
    return { categoria: 'no-encontrado' }
  }

  return { categoria: 'encontrado', cliente: mapearClienteCodisa(cedula, formato, body.data[0]) }
}

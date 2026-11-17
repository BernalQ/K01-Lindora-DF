import { nombreParaCodigoCodisa } from '../data/catalog'
import type { WsDfPayload } from '../types/wsdf'
import { CAJA_ID } from './consecutivo'
import { camposPeriodoAws, periodoDesdeFechaCodisa } from './periodoOrdenes'

/**
 * Integración con el backend propio en AWS (API Gateway) para recibir una
 * copia de cada venta — requerimiento: "enviar el JSON que se le envía a
 * Codisa también a nuestro AWS". Reutiliza EXACTAMENTE el mismo payload que
 * ya arma `construirPedidoWsDf` para Codisa (ver `services/wsdf.ts`), sin
 * ninguna transformación.
 *
 * Disparo: `enviarVentaAws` se llama desde `enviarPedidoWsDf` (`wsdf.ts`), en
 * el mismo instante en que se intenta el envío real a Codisa — las dos
 * peticiones son independientes entre sí (si una falla, no afecta a la
 * otra) y ninguna bloquea el flujo de cobro/impresión/factura del kiosko
 * ("fire-and-forget").
 *
 * Reintentos: si el envío falla, se reintenta automáticamente cada 30
 * minutos hasta `MAX_REINTENTOS` veces (`iniciarRevisionAwsVentas`, debe
 * llamarse una vez al arrancar la app — ver `App.tsx`). El estado
 * (pendientes/enviados) se persiste en `localStorage` para sobrevivir
 * recargas o reinicios del kiosko a medio reintento. Pasado ese tope, el
 * envío automático se detiene pero sigue disponible el reenvío manual desde
 * Admin (`reenviarVentaAwsManual`, ver `PanelAwsVentas` en
 * `components/screens/AdminScreen.tsx`).
 */
export const AWS_VENTAS_CONFIG = {
  endpoint: 'https://3zr1r05mwc.execute-api.us-east-1.amazonaws.com/v1/ventas',
  /**
   * Endpoint de CANCELACIONES (ver `enviarCancelacionAws`). Hoy no existe uno
   * específico, así que por defecto es el mismo de ventas: el backend debe
   * tratar un POST con `status: "CANCELLED"` + `orderId` como actualización
   * (upsert) de la orden existente, nunca como una venta nueva. Cuando AWS
   * publique un endpoint dedicado basta con definir `VITE_AWS_CANCELACION_URL`
   * en el `.env` y rebuild — no hay que tocar código.
   */
  endpointCancelacion: import.meta.env.VITE_AWS_CANCELACION_URL || 'https://3zr1r05mwc.execute-api.us-east-1.amazonaws.com/v1/ventas',
}

/** Cuerpo enviado a AWS al anular una orden (ver `enviarCancelacionAws`). La orden NO se borra en AWS: sólo cambia su estado. */
export interface CancelacionAwsPayload {
  orderId: string
  status: 'CANCELLED'
  /** ISO 8601 del momento en que el TM del BAC aprobó el VOID. */
  cancelledAt: string
  authorizationNumber: string
  referenceNumber: string
}

/**
 * Cuerpo enviado a AWS al registrar una venta: el MISMO pedido que recibe
 * Codisa (`{ pedido: {...} }`, sin modificarlo) MÁS campos propios de
 * AWS al nivel raíz, junto a `pedido` — nunca dentro de él ni en el JSON que
 * se manda a Codisa:
 * - `status: "ACTIVE"` (pasa a `"CANCELLED"` vía `enviarCancelacionAws`).
 * - `year`, `month`, `monthName`, `yearMonth`: período de la venta (hora
 *   local, derivado de `pedido.fecha`) para filtros, búsquedas y QuickSight.
 * - `items`: una fila plana por línea con el NOMBRE del artículo real
 *   (`nombre`, en español). Para los productos con variantes (ej. "Gaseosa o
 *   Tropical", "Cerveza Importada") es la opción elegida ("Gaseosa",
 *   "Tropical", "Heineken", …), resuelta a partir del `id_articulo` que ya
 *   es específico por variante (ver `nombreParaCodigoCodisa` en
 *   `data/catalog.ts`), no el nombre genérico del producto del menú.
 * Se arma al momento de enviar (no al encolar), así los pendientes viejos
 * guardados antes de este cambio también salen con los campos nuevos.
 */
export function construirCuerpoAwsVenta(payload: WsDfPayload): Record<string, unknown> {
  const periodo = periodoDesdeFechaCodisa(payload.pedido.fecha)
  const items = payload.pedido.detalle.map((d) => ({
    id_articulo: d.id_articulo,
    nombre: nombreParaCodigoCodisa(d.id_articulo, 'es'),
    cantidad: Number(d.cantidad),
    precio: Number(d.precio),
    total: Number(d.total_neto),
  }))
  return { ...payload, status: 'ACTIVE', ...(periodo ? camposPeriodoAws(periodo) : {}), items }
}

/** Tiempo máximo de espera por una respuesta antes de abortar (mismo valor que `wsdf.ts`). */
const TIMEOUT_MS = 35_000

/** Cantidad de reintentos AUTOMÁTICOS tras el intento inicial fallido (6 intentos en total: 1 + 5). Pasado este tope, sólo queda el reenvío manual desde Admin. */
const MAX_REINTENTOS = 5

/** Espera entre un intento fallido y el siguiente reintento automático. */
const INTERVALO_REINTENTO_MS = 30 * 60 * 1000

/** Frecuencia con la que se revisa si ya toca reintentar algún pendiente (no es lo mismo que el intervalo entre reintentos de arriba: esto sólo decide cada cuánto "mirar el reloj"). */
const INTERVALO_REVISION_MS = 60 * 1000

/**
 * API key de este kiosko (header `x-api-key`), una por `CAJA_ID` — a
 * diferencia de las IPs de sincronización entre kioskos (`kioskoSyncConfig.ts`,
 * hardcodeadas porque NO son secretas), esta sí es una credencial: se lee de
 * variables de entorno (`VITE_AWS_VENTAS_API_KEY_K001`/`_K002`, ver
 * `.env.example`) para que el valor real viva sólo en el `.env` de cada
 * máquina (no versionado, ver `.gitignore`) y nunca quede committeado en el
 * repositorio. El MISMO `.env` (con ambas claves) puede copiarse a los dos
 * kioskos físicos, igual que hoy se hace con el resto de la configuración:
 * cada máquina usa sólo la que le corresponde según su `CAJA_ID` elegido en
 * Admin → Kiosko.
 */
function apiKeyPropia(): string {
  const claves: Record<string, string | undefined> = {
    K001: import.meta.env.VITE_AWS_VENTAS_API_KEY_K001,
    K002: import.meta.env.VITE_AWS_VENTAS_API_KEY_K002,
  }
  return claves[CAJA_ID] ?? ''
}

/** Un envío que falló y espera su próximo reintento automático (o reenvío manual). */
export interface EnvioAwsPendiente {
  ventaId: string
  payload: WsDfPayload
  /** Intentos ya realizados, incluyendo el inicial (no cuenta los reenvíos manuales). */
  intentos: number
  ultimoError: string
  /** ISO de cuándo toca el próximo reintento automático. */
  proximoIntentoEn: string
  /** `true` cuando ya se agotaron los `MAX_REINTENTOS` automáticos (sólo queda el botón "Reenviar" manual en Admin). */
  agotado: boolean
}

/** Un envío que ya se confirmó recibido por AWS. */
export interface EnvioAwsExitoso {
  ventaId: string
  enviadoEn: string
}

const CLAVE_PENDIENTES = 'aws_ventas_pendientes_v1'
const CLAVE_ENVIADOS = 'aws_ventas_enviados_v1'

type PendientesGuardados = Record<string, Omit<EnvioAwsPendiente, 'agotado'>>
type EnviadosGuardados = Record<string, EnvioAwsExitoso>

function leerJson<T>(clave: string, porDefecto: T): T {
  try {
    const crudo = localStorage.getItem(clave)
    return crudo ? (JSON.parse(crudo) as T) : porDefecto
  } catch {
    return porDefecto
  }
}

function guardarJson(clave: string, valor: unknown): void {
  try {
    localStorage.setItem(clave, JSON.stringify(valor))
  } catch (err) {
    // localStorage no disponible (ej. modo privado) o lleno: la protección
    // anti-duplicado/reintento queda sólo en memoria para esta carga de
    // página — un problema de persistencia nunca debe tumbar el flujo de
    // cobro del kiosko.
    console.warn('[aws-ventas] No se pudo persistir estado en localStorage:', err)
  }
}

function leerPendientes(): PendientesGuardados {
  return leerJson(CLAVE_PENDIENTES, {})
}

function leerEnviados(): EnviadosGuardados {
  return leerJson(CLAVE_ENVIADOS, {})
}

function yaFueEnviado(ventaId: string): boolean {
  return ventaId in leerEnviados()
}

function marcarEnviado(ventaId: string): void {
  const enviados = leerEnviados()
  enviados[ventaId] = { ventaId, enviadoEn: new Date().toISOString() }
  guardarJson(CLAVE_ENVIADOS, enviados)

  const pendientes = leerPendientes()
  if (ventaId in pendientes) {
    delete pendientes[ventaId]
    guardarJson(CLAVE_PENDIENTES, pendientes)
  }
}

/**
 * Intento de red puro (sin tocar `localStorage`): un solo POST, con timeout.
 *
 * Cada fallo se imprime con `console.error` (status HTTP + cuerpo de la
 * respuesta, o el motivo si ni siquiera hubo respuesta) — antes esto quedaba
 * oculto: sólo se guardaba un mensaje genérico en `localStorage` para el
 * panel de Admin, sin nada visible en la consola del navegador en el
 * momento real de la falla. Diagnóstico pedido por el equipo de AWS al
 * revisar un rechazo silencioso (403 por `x-api-key` ausente/incorrecta en
 * un build viejo, ver historial) — con este log, un problema similar a
 * futuro se detecta de inmediato abriendo las DevTools del kiosko.
 */
async function intentarEnvioAws(
  cuerpoJson: unknown,
  ventaId: string,
  url: string = AWS_VENTAS_CONFIG.endpoint,
): Promise<{ ok: boolean; error?: string }> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKeyPropia() },
      body: JSON.stringify(cuerpoJson),
      signal: controller.signal,
    })
    if (!res.ok) {
      const cuerpo = await res.text().catch(() => '(no se pudo leer el cuerpo de la respuesta)')
      console.error(`[aws-ventas] AWS respondió con error HTTP ${res.status} para la venta "${ventaId}":`, cuerpo)
      return { ok: false, error: `Error HTTP ${res.status}: ${cuerpo}` }
    }
    return { ok: true }
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      const mensaje = `Tiempo de espera agotado (${TIMEOUT_MS / 1000}s)`
      console.error(`[aws-ventas] ${mensaje} al enviar la venta "${ventaId}" a AWS.`)
      return { ok: false, error: mensaje }
    }
    console.error(`[aws-ventas] No se pudo contactar AWS para la venta "${ventaId}":`, err)
    return { ok: false, error: `No se pudo contactar AWS: ${(err as Error).message}` }
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Envío inicial de una venta a AWS ("fire-and-forget"): se llama desde
 * `enviarPedidoWsDf` (`wsdf.ts`) con el mismo payload que se le manda a
 * Codisa, en el mismo instante. No lanza ni devuelve un resultado que el
 * llamador deba manejar — si falla, queda encolada para reintento
 * automático (ver `revisarPendientesVencidos`).
 */
export async function enviarVentaAws(payload: WsDfPayload): Promise<void> {
  const ventaId = payload.pedido.id
  if (yaFueEnviado(ventaId)) return // protección anti-duplicado

  const resultado = await intentarEnvioAws(construirCuerpoAwsVenta(payload), ventaId)
  if (resultado.ok) {
    marcarEnviado(ventaId)
    return
  }

  const pendientes = leerPendientes()
  pendientes[ventaId] = {
    ventaId,
    payload,
    intentos: 1,
    ultimoError: resultado.error ?? 'Error desconocido',
    proximoIntentoEn: new Date(Date.now() + INTERVALO_REINTENTO_MS).toISOString(),
  }
  guardarJson(CLAVE_PENDIENTES, pendientes)
}

/** Reintenta un pendiente ya existente (automático o manual) y actualiza su estado según el resultado. */
async function reintentarPendiente(ventaId: string, manual: boolean): Promise<void> {
  const pendientes = leerPendientes()
  const item = pendientes[ventaId]
  if (!item) return // ya no existe (pudo marcarse enviado por otra vía mientras tanto)

  const resultado = await intentarEnvioAws(construirCuerpoAwsVenta(item.payload), ventaId)
  if (resultado.ok) {
    marcarEnviado(ventaId)
    return
  }

  const actuales = leerPendientes()
  const actual = actuales[ventaId]
  if (!actual) return
  actuales[ventaId] = {
    ...actual,
    // Un reenvío manual no cuenta contra el tope de reintentos automáticos
    // (`MAX_REINTENTOS`): es una acción explícita del operador, no debe
    // "gastarse" sola ni bloquear que el poller siga intentando después.
    intentos: manual ? actual.intentos : actual.intentos + 1,
    ultimoError: resultado.error ?? 'Error desconocido',
    proximoIntentoEn: new Date(Date.now() + INTERVALO_REINTENTO_MS).toISOString(),
  }
  guardarJson(CLAVE_PENDIENTES, actuales)
}

/** Botón "Reenviar" manual desde Admin (`PanelAwsVentas`): reintenta de inmediato, sin esperar el horario programado. */
export async function reenviarVentaAwsManual(ventaId: string): Promise<void> {
  await reintentarPendiente(ventaId, true)
}

/* ------------------------------------------------------------------ */
/* Cancelaciones (orden anulada con VOID aprobado por el TM del BAC).  */
/* ------------------------------------------------------------------ */

const CLAVE_CANCELACIONES_PENDIENTES = 'aws_cancelaciones_pendientes_v1'
const CLAVE_CANCELACIONES_ENVIADAS = 'aws_cancelaciones_enviadas_v1'

/** Una cancelación que falló y espera su próximo reintento automático (o reenvío manual). */
export interface EnvioCancelacionAwsPendiente {
  ventaId: string
  payload: CancelacionAwsPayload
  intentos: number
  ultimoError: string
  proximoIntentoEn: string
  agotado: boolean
}

type CancelacionesPendientesGuardadas = Record<string, Omit<EnvioCancelacionAwsPendiente, 'agotado'>>

function leerCancelacionesPendientes(): CancelacionesPendientesGuardadas {
  return leerJson(CLAVE_CANCELACIONES_PENDIENTES, {})
}

function marcarCancelacionEnviada(ventaId: string): void {
  const enviadas = leerJson<Record<string, string>>(CLAVE_CANCELACIONES_ENVIADAS, {})
  enviadas[ventaId] = new Date().toISOString()
  guardarJson(CLAVE_CANCELACIONES_ENVIADAS, enviadas)

  const pendientes = leerCancelacionesPendientes()
  if (ventaId in pendientes) {
    delete pendientes[ventaId]
    guardarJson(CLAVE_CANCELACIONES_PENDIENTES, pendientes)
  }
}

/**
 * Un solo intento de enviar la cancelación. Si la venta original todavía está
 * pendiente en AWS (nunca llegó), primero se reintenta ESA: así AWS nunca
 * recibe la cancelación de una orden que no conoce, ni la venta original
 * "pisa" después a la cancelación. Si la venta sigue sin llegar, la
 * cancelación queda para el siguiente reintento.
 */
async function intentarCancelacion(payload: CancelacionAwsPayload): Promise<{ ok: boolean; error?: string }> {
  if (payload.orderId in leerPendientes()) {
    await reintentarPendiente(payload.orderId, true)
    if (payload.orderId in leerPendientes()) {
      return { ok: false, error: 'La venta original aún no está confirmada en AWS; la anulación se enviará después.' }
    }
  }
  return intentarEnvioAws(payload, payload.orderId, AWS_VENTAS_CONFIG.endpointCancelacion)
}

/**
 * Notifica a AWS que una orden fue CANCELADA (la orden NO se borra, sólo
 * cambia su estado para auditoría). Se llama una vez que el TM del BAC
 * aprobó el VOID (`responseCode "00"`). "Fire-and-forget" igual que
 * `enviarVentaAws`: no lanza; si falla queda en cola con reintento automático
 * (mismo intervalo/tope que las ventas) y reenvío manual en Admin → Envíos a
 * AWS. `PanelAwsVentas.limpiarAwsPendientes` NO vacía esta cola a propósito:
 * una cancelación perdida dejaría la venta contando en los dashboards.
 */
export async function enviarCancelacionAws(payload: CancelacionAwsPayload): Promise<void> {
  const enviadas = leerJson<Record<string, string>>(CLAVE_CANCELACIONES_ENVIADAS, {})
  if (payload.orderId in enviadas) return // protección anti-duplicado

  const resultado = await intentarCancelacion(payload)
  if (resultado.ok) {
    marcarCancelacionEnviada(payload.orderId)
    return
  }

  const pendientes = leerCancelacionesPendientes()
  pendientes[payload.orderId] = {
    ventaId: payload.orderId,
    payload,
    intentos: 1,
    ultimoError: resultado.error ?? 'Error desconocido',
    proximoIntentoEn: new Date(Date.now() + INTERVALO_REINTENTO_MS).toISOString(),
  }
  guardarJson(CLAVE_CANCELACIONES_PENDIENTES, pendientes)
}

async function reintentarCancelacionPendiente(ventaId: string, manual: boolean): Promise<void> {
  const item = leerCancelacionesPendientes()[ventaId]
  if (!item) return

  const resultado = await intentarCancelacion(item.payload)
  if (resultado.ok) {
    marcarCancelacionEnviada(ventaId)
    return
  }

  const actuales = leerCancelacionesPendientes()
  const actual = actuales[ventaId]
  if (!actual) return
  actuales[ventaId] = {
    ...actual,
    intentos: manual ? actual.intentos : actual.intentos + 1,
    ultimoError: resultado.error ?? 'Error desconocido',
    proximoIntentoEn: new Date(Date.now() + INTERVALO_REINTENTO_MS).toISOString(),
  }
  guardarJson(CLAVE_CANCELACIONES_PENDIENTES, actuales)
}

/** Botón "Reenviar" manual de una cancelación pendiente (ver `PanelAwsVentas`). */
export async function reenviarCancelacionAwsManual(ventaId: string): Promise<void> {
  await reintentarCancelacionPendiente(ventaId, true)
}

function revisarPendientesVencidos(): void {
  const ahora = Date.now()
  Object.values(leerPendientes()).forEach((item) => {
    if (item.intentos >= 1 + MAX_REINTENTOS) return // agotado: sólo reenvío manual desde acá en adelante
    if (new Date(item.proximoIntentoEn).getTime() > ahora) return
    void reintentarPendiente(item.ventaId, false)
  })
  Object.values(leerCancelacionesPendientes()).forEach((item) => {
    if (item.intentos >= 1 + MAX_REINTENTOS) return
    if (new Date(item.proximoIntentoEn).getTime() > ahora) return
    void reintentarCancelacionPendiente(item.ventaId, false)
  })
}

let revisionIniciada = false

/**
 * Arranca el revisor periódico de reintentos pendientes. Debe llamarse UNA
 * VEZ al arrancar la app (ver `App.tsx`, mismo patrón que
 * `services/kioskoSyncPolling.ts`); la bandera `revisionIniciada` evita
 * registrar más de un `setInterval` si por algún motivo se llama más de una
 * vez (ej. doble montaje en desarrollo).
 */
export function iniciarRevisionAwsVentas(): void {
  if (revisionIniciada) return
  revisionIniciada = true
  setInterval(revisarPendientesVencidos, INTERVALO_REVISION_MS)
}

/** Resumen para el panel de Admin: qué se envió y qué falta (con su estado), para el listado + botón de reenvío manual. */
export interface ResumenAwsVentas {
  enviados: EnvioAwsExitoso[]
  pendientes: EnvioAwsPendiente[]
  cancelacionesPendientes: EnvioCancelacionAwsPendiente[]
}

export function obtenerResumenAwsVentas(): ResumenAwsVentas {
  const enviados = Object.values(leerEnviados()).sort((a, b) => b.enviadoEn.localeCompare(a.enviadoEn))
  const pendientes = Object.values(leerPendientes())
    .map((p) => ({ ...p, agotado: p.intentos >= 1 + MAX_REINTENTOS }))
    .sort((a, b) => b.proximoIntentoEn.localeCompare(a.proximoIntentoEn))
  const cancelacionesPendientes = Object.values(leerCancelacionesPendientes())
    .map((p) => ({ ...p, agotado: p.intentos >= 1 + MAX_REINTENTOS }))
    .sort((a, b) => b.proximoIntentoEn.localeCompare(a.proximoIntentoEn))
  return { enviados, pendientes, cancelacionesPendientes }
}

/**
 * Botón "Limpiar pendientes" manual desde Admin (`PanelAwsVentas`): vacía por
 * completo la cola de reintentos (`CLAVE_PENDIENTES`), SIN intentar reenviar
 * nada antes. A diferencia de Codisa (ver `limpiarCodisaPendientes` en
 * `wsdf.ts`), esta cola es sólo una copia secundaria/no fiscal de la venta
 * (el dato fiscal real vive en la cola de Codisa), así que perderla no deja
 * ninguna venta sin facturar — es seguro limpiarla sin pedir reenvío previo.
 * No toca `CLAVE_ENVIADOS` (historial de éxitos, no es una cola "pendiente").
 * El llamador (UI) es responsable de confirmar con el operador antes de
 * invocar esto, igual que el resto de acciones destructivas de Admin.
 */
export function limpiarAwsPendientes(): void {
  guardarJson(CLAVE_PENDIENTES, {})
}

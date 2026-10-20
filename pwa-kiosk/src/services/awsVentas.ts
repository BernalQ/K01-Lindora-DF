import type { WsDfPayload } from '../types/wsdf'
import { CAJA_ID } from './consecutivo'

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
async function intentarEnvioAws(payload: WsDfPayload): Promise<{ ok: boolean; error?: string }> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(AWS_VENTAS_CONFIG.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKeyPropia() },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    if (!res.ok) {
      const cuerpo = await res.text().catch(() => '(no se pudo leer el cuerpo de la respuesta)')
      console.error(`[aws-ventas] AWS respondió con error HTTP ${res.status} para la venta "${payload.pedido.id}":`, cuerpo)
      return { ok: false, error: `Error HTTP ${res.status}: ${cuerpo}` }
    }
    return { ok: true }
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      const mensaje = `Tiempo de espera agotado (${TIMEOUT_MS / 1000}s)`
      console.error(`[aws-ventas] ${mensaje} al enviar la venta "${payload.pedido.id}" a AWS.`)
      return { ok: false, error: mensaje }
    }
    console.error(`[aws-ventas] No se pudo contactar AWS para la venta "${payload.pedido.id}":`, err)
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

  const resultado = await intentarEnvioAws(payload)
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

  const resultado = await intentarEnvioAws(item.payload)
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

function revisarPendientesVencidos(): void {
  const pendientes = leerPendientes()
  const ahora = Date.now()
  Object.values(pendientes).forEach((item) => {
    if (item.intentos >= 1 + MAX_REINTENTOS) return // agotado: sólo reenvío manual desde acá en adelante
    if (new Date(item.proximoIntentoEn).getTime() > ahora) return
    void reintentarPendiente(item.ventaId, false)
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
}

export function obtenerResumenAwsVentas(): ResumenAwsVentas {
  const enviados = Object.values(leerEnviados()).sort((a, b) => b.enviadoEn.localeCompare(a.enviadoEn))
  const pendientes = Object.values(leerPendientes())
    .map((p) => ({ ...p, agotado: p.intentos >= 1 + MAX_REINTENTOS }))
    .sort((a, b) => b.proximoIntentoEn.localeCompare(a.proximoIntentoEn))
  return { enviados, pendientes }
}

import { PRODUCTS } from '../data/catalog'
import { enviarAOtroKiosko } from './kioskoTransport'
import { obtenerOverrides, aplicarPrecioRemoto, aplicarDisponibilidadRemota } from './catalogOverrides'
import { obtenerConfigVersion, fijarConfigVersion } from './configVersion'
import { obtenerSnapshotMesas, reemplazarBloqueos } from './mesaLocks'
import { registrarEventoSync } from './kioskoSyncLogs'

/**
 * Resincronización automática entre kioskos (requerimiento
 * "Resincronización automática") + Modo autónomo (requerimiento "Modo
 * autónomo"): si un kiosko estuvo apagado/desconectado, al arrancar (o al
 * recuperar contacto con el otro) consulta el estado completo del otro
 * kiosko y adopta lo que esté más reciente según `configVersion`
 * (requerimiento "Versionamiento de configuración", ver
 * `services/configVersion.ts`).
 *
 * Este archivo implementa la LÓGICA de aplicación (construir la respuesta,
 * decidir si adoptar lo recibido) — el transporte real (envío/recepción por
 * red entre las dos máquinas, puerto 3005) vive en `services/kioskoTransport.ts`
 * (envío) y `services/kioskoSyncPolling.ts` (recepción: consulta la cola
 * local de mensajes pendientes y los despacha hacia este módulo vía
 * `aplicarRespuestaSyncConfig`, y hacia `mesaSync.ts`/`catalogSync.ts` para
 * los demás tipos de mensaje). Ese módulo de más arriba también es quien
 * detecta la transición "el otro kiosko volvió a estar disponible" y dispara
 * `solicitarResincronizacion` de nuevo (requerimiento "Modo autónomo": "cuando
 * K001 regrese: ejecutar resincronización automática") — AQUÍ ya no vive esa
 * reacción (antes `marcarRemotoDisponible`, ver historial) porque hacerlo
 * desde este archivo o desde `kioskoTransport.ts` crearía un import circular
 * entre ambos.
 */

/** Mensaje de solicitud de resincronización: "tableId"/"orderId" no aplica aquí, es una solicitud de estado completo. */
export interface MensajeSyncConfigRequest {
  action: 'syncConfig'
}

/** Respuesta con el estado completo del catálogo y las mesas de quien la emite. */
export interface MensajeSyncConfigResponse {
  configVersion: number
  /** `Product.id` -> precio vigente (sólo productos con override, igual que `Overrides.precios`). */
  prices: Record<string, number>
  /** `Product.id` -> disponible (polaridad de red: `true` = disponible; ver `aplicarDisponibilidadRemota`). */
  availability: Record<string, boolean>
  /** `tableId` -> ocupación vigente (ver `services/mesaLocks.ts` -> `obtenerSnapshotMesas`). */
  tables: Record<string, { orderId?: string; source: string }>
}

/**
 * Arma la respuesta que ESTE kiosko daría a un `syncConfig` recibido del
 * otro: su propia versión de configuración + overrides de catálogo vigentes
 * + mesas actualmente ocupadas.
 */
export function construirRespuestaSyncConfig(): MensajeSyncConfigResponse {
  const { precios, agotados } = obtenerOverrides()
  const availability: Record<string, boolean> = {}
  for (const [productId, agotado] of Object.entries(agotados)) {
    availability[productId] = !agotado
  }
  return {
    configVersion: obtenerConfigVersion(),
    prices: { ...precios },
    availability,
    tables: obtenerSnapshotMesas(),
  }
}

/**
 * Pide al otro kiosko su estado completo (requerimiento "Resincronización
 * automática": "cuando un kiosko arranque: debe consultar al otro"). Se debe
 * llamar una vez al arrancar la PWA (ver `App.tsx` -> `services/kioskoSyncPolling.ts`)
 * y además cada vez que el kiosko remoto vuelve a estar disponible después de
 * haber estado caído (ver `services/kioskoSyncPolling.ts`, que se suscribe a
 * `store/syncStatusStore.ts` y llama aquí en la transición false -> true).
 *
 * La respuesta en sí llega de forma asíncrona por la cola de mensajes
 * pendientes (ver `services/kioskoTransport.ts` -> `consultarPendientes`) y
 * se despacha hacia `aplicarRespuestaSyncConfig` desde
 * `services/kioskoSyncPolling.ts`, no desde aquí.
 */
export function solicitarResincronizacion(): void {
  registrarEventoSync('Sincronización iniciada')
  void enviarAOtroKiosko('syncConfigRequest', { action: 'syncConfig' } satisfies MensajeSyncConfigRequest)
}

/**
 * Aplica la respuesta `syncConfig` recibida del otro kiosko: SÓLO si su
 * `configVersion` es más reciente que la propia (requerimiento
 * "Resincronización automática": "si la versión remota es más reciente:
 * actualizar automáticamente"). Si no es más reciente, este kiosko ya está
 * al día (o más adelante, ej. acaba de hacer un cambio que el otro aún no
 * procesó) y no hace falta tocar nada.
 */
export function aplicarRespuestaSyncConfig(respuesta: MensajeSyncConfigResponse): void {
  if (respuesta.configVersion <= obtenerConfigVersion()) {
    registrarEventoSync('Sincronización completada', { aplicado: false, configVersion: respuesta.configVersion })
    return
  }

  for (const [productId, price] of Object.entries(respuesta.prices)) {
    aplicarPrecioRemoto(PRODUCTS, productId, price)
  }
  for (const [productId, available] of Object.entries(respuesta.availability)) {
    aplicarDisponibilidadRemota(PRODUCTS, productId, available)
  }
  reemplazarBloqueos(respuesta.tables)
  fijarConfigVersion(respuesta.configVersion)
  registrarEventoSync('Sincronización completada', { aplicado: true, configVersion: respuesta.configVersion })
}

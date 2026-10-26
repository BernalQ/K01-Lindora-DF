import { CAJA_ID } from './consecutivo'
import type { MensajeMesaSync } from './mesaSync'
import { registrarEventoSync } from './kioskoSyncLogs'
import { enviarAOtroKiosko } from './kioskoTransport'

/**
 * Bloqueo temporal de identificadores de mesa (razas de ganado), SINCRONIZADO
 * entre los kioskos físicos del negocio (ver requerimiento "Sincronización de
 * mesas" / "Liberación automática de mesas").
 *
 * Cuando un identificador se elige para una orden nueva (`MesaSetupScreen` →
 * `mesaStore.iniciar` → `bloquearMesa`), queda bloqueado por 30 minutos para
 * evitar que dos mesas distintas usen el mismo identificador al mismo
 * tiempo. Pasado ese lapso, el identificador vuelve a estar disponible
 * automáticamente, tanto en este kiosko como en el otro (ver
 * `iniciarRevisionAutomatica`).
 *
 * Se persiste en `localStorage` (en vez de IndexedDB, usado en
 * `offlineQueue.ts` para la cola de ventas) porque sólo se necesita un mapa
 * simple `{ mesaId: RegistroBloqueo }` con lectura/escritura síncrona, sin
 * necesidad de consultas complejas.
 *
 * Sincronización ENTRE PESTAÑAS/VENTANAS del MISMO dispositivo:
 * `BroadcastChannel` + evento nativo `storage` (ver
 * `suscribirCambiosMesaLocks` abajo) notifican casi al instante.
 *
 * Sincronización ENTRE KIOSKOS FÍSICOS DISTINTOS (hallazgo de auditoría ya
 * resuelto en este cambio): antes esto NO se resolvía — cada kiosko tiene su
 * propio `localStorage`, aislado del resto, así que bloquear una mesa en uno
 * no se reflejaba en el otro. Ahora `bloquearMesa`/`liberarMesa` (y el
 * vencimiento automático de 30 minutos) además EMITEN un mensaje JSON
 * (`lockTable`/`unlockTable`, ver `services/mesaSync.ts`) hacia el otro
 * kiosko, vía `enviarMensajeMesaSync` más abajo — transporte real por HTTP
 * directo a la IP del otro kiosko, puerto 3005 (ver
 * `services/kioskoTransport.ts`). Toda la lógica de aplicación del lado
 * receptor (`aplicarLockRemoto`/`aplicarUnlockRemoto`) se conecta a ese
 * transporte vía `services/kioskoSyncPolling.ts`.
 */

const STORAGE_KEY = 'kiosko:mesaLocks'
const DURACION_BLOQUEO_MS = 30 * 60 * 1000 // 30 minutos
/** Nombre del canal usado para notificar cambios entre pestañas/ventanas del mismo dispositivo. */
const CANAL_NOMBRE = 'kiosko:mesaLocks:canal'
/** Cada cuánto se revisan los bloqueos vencidos para liberarlos y sincronizar la liberación con el otro kiosko (ver `iniciarRevisionAutomatica`). */
const INTERVALO_REVISION_VENCIMIENTO_MS = 30_000

/**
 * Registro de bloqueo de una mesa.
 *
 * `bloqueadoEn` es el momento (epoch ms) en que ESTE kiosko registró el
 * bloqueo — ya sea por haberlo originado localmente (`bloquearMesa`) o por
 * haber recibido un `lockTable` del otro kiosko (`aplicarLockRemoto`). Cada
 * kiosko calcula su propio vencimiento (`bloqueadoEn + 30 min`) a partir de
 * ESTE timestamp local (requerimiento: "cada kiosko debe ser capaz de
 * calcular localmente cuándo liberar la mesa usando el timestamp del
 * bloqueo") — ningún timestamp se transmite por red; el mensaje
 * `lockTable`/`unlockTable` no lo incluye (ver `services/mesaSync.ts`), así
 * que cada kiosko agenda su propio vencimiento al bloquear o al recibir el
 * aviso de bloqueo, sin depender de que los relojes de ambos dispositivos
 * estén perfectamente sincronizados.
 */
interface RegistroBloqueo {
  bloqueadoEn: number
  /** Consecutivo de la orden que ocupa esta mesa (ver `services/consecutivo.ts`), si ya se conoce al bloquear. */
  orderId?: string
  /** Caja/kiosko que originó el bloqueo (`CAJA_ID` propio, o el recibido en el mensaje `lockTable`/`unlockTable`). */
  source: string
}

type MapaBloqueos = Record<string, RegistroBloqueo>

/**
 * `BroadcastChannel` no está disponible en todos los entornos (ej. algunos
 * WebViews antiguos); se crea de forma perezosa y se tolera su ausencia —
 * en ese caso la sincronización entre pestañas queda sólo a cargo del
 * evento `storage` (ver `suscribirCambiosMesaLocks`), que sí es más
 * ampliamente soportado.
 */
function crearCanal(): BroadcastChannel | null {
  try {
    return typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CANAL_NOMBRE) : null
  } catch {
    return null
  }
}

const canal = crearCanal()

/** Notifica a otras pestañas/ventanas de este mismo dispositivo que el mapa de bloqueos cambió. */
function notificarCambio(): void {
  try {
    canal?.postMessage({ tipo: 'cambio' })
  } catch {
    // Canal cerrado o no disponible: no es crítico, el evento `storage`
    // sigue funcionando como respaldo para otras pestañas.
  }
}

function leerBloqueos(): MapaBloqueos {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as MapaBloqueos
  } catch {
    return {}
  }
}

function guardarBloqueos(bloqueos: MapaBloqueos): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bloqueos))
  } catch {
    // localStorage no disponible (modo privado, cuota llena, etc.): se
    // ignora, el bloqueo simplemente no persiste en ese caso.
  }
}

/**
 * Quita del mapa las entradas ya vencidas (según el timestamp LOCAL de cada
 * una, ver `RegistroBloqueo.bloqueadoEn`) y persiste el resultado limpio.
 * Cuando `emitirAuto` es `true` (sólo lo pasa `iniciarRevisionAutomatica`),
 * además emite un `unlockTable` con `source: "AUTO_TIMEOUT"` por cada mesa
 * recién vencida, para sincronizar la liberación con el otro kiosko
 * (requerimiento: "la liberación debe sincronizarse entre ambos kioskos").
 * Las lecturas perezosas normales (`mesasBloqueadas`, usada por
 * `MesaSetupScreen`) pasan `emitirAuto: false` — limpian el mapa igual, pero
 * no les corresponde a ellas decidir cuándo avisarle al otro kiosko.
 */
function limpiarVencidos(bloqueos: MapaBloqueos, opts: { emitirAuto: boolean }): MapaBloqueos {
  const ahora = Date.now()
  const limpio: MapaBloqueos = {}
  const vencidas: string[] = []
  for (const [mesaId, registro] of Object.entries(bloqueos)) {
    if (registro.bloqueadoEn + DURACION_BLOQUEO_MS > ahora) {
      limpio[mesaId] = registro
    } else {
      vencidas.push(mesaId)
    }
  }
  if (vencidas.length > 0) {
    guardarBloqueos(limpio)
    notificarCambio()
    if (opts.emitirAuto) {
      for (const mesaId of vencidas) {
        registrarEventoSync('Mesa liberada', { mesaId, source: 'AUTO_TIMEOUT' })
        enviarMensajeMesaSync({ action: 'unlockTable', tableId: mesaId, source: 'AUTO_TIMEOUT' })
      }
    }
  }
  return limpio
}

/**
 * Envía un mensaje de sincronización de mesas al otro kiosko (contrato JSON
 * fijado en `services/mesaSync.ts`), vía `services/kioskoTransport.ts`
 * (`fetch` directo a la IP del otro kiosko, puerto 3005). "Fire and forget":
 * `bloquearMesa`/`liberarMesa` son funciones síncronas y el bloqueo/
 * liberación ya quedó aplicado localmente ANTES de llegar aquí (requerimiento
 * "Modo autónomo": la operación local nunca depende de que el envío al otro
 * kiosko tenga éxito).
 */
function enviarMensajeMesaSync(mensaje: MensajeMesaSync): void {
  void enviarAOtroKiosko('mesaSync', mensaje)
}

/**
 * Bloquea un identificador de mesa por 30 minutos a partir de ahora.
 *
 * `orderId` sólo se conoce a partir de la primera orden confirmada bajo esa
 * mesa (ver `PaymentScreen.tsx`, construcción de `nuevaVenta` ->
 * `bloquearMesa(nuevaVenta.mesa, nuevaVenta.id)`): es el único punto donde
 * `tableId` (el identificador de mesa) y `orderId` (el consecutivo de la
 * orden) se conocen juntos, igual que en el ejemplo del requerimiento ("Si
 * K001 ocupa una mesa... Mesa: 15, Orden: 0100000123"). El bloqueo inicial
 * que hace `mesaStore.iniciar()` al elegir el identificador en
 * `MesaSetupScreen` (ANTES de que exista cualquier orden) llama a esta misma
 * función SIN `orderId` — ese bloqueo temprano sigue siendo sólo local
 * (evita que este mismo kiosko ofrezca la misma raza dos veces mientras el
 * cliente arma el carrito) y NO se sincroniza con el otro kiosko todavía, ya
 * que no hay `orderId` real que incluir en el mensaje `lockTable`. En
 * cuanto se confirma la primera orden de esa mesa, este mismo bloqueo se
 * "promueve" a sincronizado: se vuelve a llamar con el `orderId` ya
 * disponible, lo que además reinicia el conteo de 30 minutos (cada orden
 * nueva bajo una mesa compartida extiende su ventana de ocupación).
 */
export function bloquearMesa(mesaId: string, orderId?: string): void {
  if (!mesaId) return
  const bloqueos = limpiarVencidos(leerBloqueos(), { emitirAuto: false })
  bloqueos[mesaId] = { bloqueadoEn: Date.now(), orderId, source: CAJA_ID }
  guardarBloqueos(bloqueos)
  notificarCambio()
  registrarEventoSync('Mesa ocupada', { mesaId, orderId, source: CAJA_ID })
  if (orderId) {
    enviarMensajeMesaSync({ action: 'lockTable', tableId: mesaId, orderId, source: CAJA_ID })
  }
}

/** Conjunto de identificadores de mesa actualmente bloqueados (vigentes, en cualquier kiosko). */
export function mesasBloqueadas(): Set<string> {
  return new Set(Object.keys(limpiarVencidos(leerBloqueos(), { emitirAuto: false })))
}

/**
 * Libera un identificador de mesa de inmediato, sin esperar a que expiren
 * los 30 minutos de bloqueo (ver `bloquearMesa`). Usado cuando se cancela
 * una orden desde `PaymentScreen` ("Cancelar Orden"), para que ese
 * identificador quede disponible enseguida para otra mesa. Sincroniza la
 * liberación con el otro kiosko de inmediato (`unlockTable` con
 * `source: CAJA_ID`, para distinguirla de una liberación por vencimiento —
 * ver `iniciarRevisionAutomatica`, que usa `"AUTO_TIMEOUT"`), para que éste
 * no se quede esperando a que venzan los 30 minutos de su lado.
 */
export function liberarMesa(mesaId: string): void {
  if (!mesaId) return
  const bloqueos = limpiarVencidos(leerBloqueos(), { emitirAuto: false })
  if (!(mesaId in bloqueos)) return
  delete bloqueos[mesaId]
  guardarBloqueos(bloqueos)
  notificarCambio()
  registrarEventoSync('Mesa liberada', { mesaId, source: CAJA_ID })
  enviarMensajeMesaSync({ action: 'unlockTable', tableId: mesaId, source: CAJA_ID })
}

/**
 * Aplica un `lockTable` RECIBIDO del otro kiosko (ver
 * `services/mesaSync.ts` -> `recibirMensajeMesaSync`): marca la mesa
 * ocupada localmente, con la misma estructura que `bloquearMesa`, pero SIN
 * reemitir el mensaje de vuelta (evitaría un eco infinito entre kioskos).
 * `bloqueadoEn` se marca con el momento en que ESTE kiosko recibe el
 * mensaje, no con un timestamp transmitido por la red (ver comentario de
 * `RegistroBloqueo.bloqueadoEn`), así que el vencimiento de 30 minutos queda
 * calculado de forma independiente en cada kiosko.
 */
export function aplicarLockRemoto(mesaId: string, orderId: string, source: string): void {
  if (!mesaId) return
  const bloqueos = limpiarVencidos(leerBloqueos(), { emitirAuto: false })
  bloqueos[mesaId] = { bloqueadoEn: Date.now(), orderId, source }
  guardarBloqueos(bloqueos)
  notificarCambio()
  registrarEventoSync('Mesa ocupada', { mesaId, orderId, source })
}

/**
 * Aplica un `unlockTable` RECIBIDO del otro kiosko (liberación manual o por
 * `"AUTO_TIMEOUT"`, ver `services/mesaSync.ts` -> `recibirMensajeMesaSync`):
 * libera la mesa localmente sin reemitir el mensaje.
 */
export function aplicarUnlockRemoto(mesaId: string): void {
  if (!mesaId) return
  const bloqueos = leerBloqueos()
  if (!(mesaId in bloqueos)) return
  delete bloqueos[mesaId]
  guardarBloqueos(bloqueos)
  notificarCambio()
  registrarEventoSync('Mesa liberada', { mesaId })
}

/**
 * Revisión periódica de vencimientos: a diferencia de `mesasBloqueadas()`
 * (lectura perezosa, sólo limpia cuando algo la consulta, ej. el polling de
 * `MesaSetupScreen`), este intervalo corre siempre mientras la PWA esté
 * abierta — sin importar qué pantalla esté activa — para que el
 * `unlockTable` con `source: "AUTO_TIMEOUT"` salga hacia el otro kiosko
 * apenas se cumplen los 30 minutos (requerimiento: "la liberación no
 * depende de pago/impresión/envío a Codisa", tampoco depende de qué
 * pantalla esté usando el operador en ese momento). Arranca una sola vez,
 * como efecto de carga de este módulo (ver llamada al final del archivo) —
 * se mantiene vivo durante toda la vida de la pestaña del kiosko, igual
 * que el resto de este almacenamiento en memoria/`localStorage`.
 */
function iniciarRevisionAutomatica(): void {
  setInterval(() => {
    limpiarVencidos(leerBloqueos(), { emitirAuto: true })
  }, INTERVALO_REVISION_VENCIMIENTO_MS)
}

iniciarRevisionAutomatica()

/**
 * Suscribe `callback` a cambios en el mapa de bloqueos originados en OTRA
 * pestaña/ventana de este mismo dispositivo (propia pestaña ya se actualiza
 * de forma síncrona al llamar `bloquearMesa`/`liberarMesa` directamente, no
 * necesita este mecanismo). Usa dos canales en paralelo, por compatibilidad:
 * - `BroadcastChannel`: notificación casi instantánea, pero no disponible en
 *   absolutamente todos los entornos.
 * - Evento nativo `storage`: se dispara en el resto de pestañas cuando
 *   cambia `localStorage[STORAGE_KEY]`; más ampliamente soportado, sirve de
 *   respaldo si `BroadcastChannel` no existe.
 *
 * No reemplaza el polling por intervalo que ya hace `MesaSetupScreen`
 * (sigue siendo necesario para reflejar la expiración por tiempo de los 30
 * minutos, que no dispara ningún evento); esto sólo acelera la reacción a
 * cambios explícitos (bloquear/liberar) mientras tanto.
 *
 * Devuelve una función para des-suscribirse (llamar en el cleanup del
 * `useEffect` del componente).
 */
export function suscribirCambiosMesaLocks(callback: () => void): () => void {
  const manejarMensajeCanal = () => callback()
  const manejarEventoStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) callback()
  }

  canal?.addEventListener('message', manejarMensajeCanal)
  window.addEventListener('storage', manejarEventoStorage)

  return () => {
    canal?.removeEventListener('message', manejarMensajeCanal)
    window.removeEventListener('storage', manejarEventoStorage)
  }
}

/**
 * Snapshot de los bloqueos vigentes (requerimiento "Resincronización
 * automática", campo `tables` de la respuesta `syncConfig`, ver
 * `services/kioskoSync.ts` -> `construirRespuestaSyncConfig`). Se omite
 * `bloqueadoEn`: igual que en `aplicarLockRemoto`, el kiosko que RECIBE este
 * snapshot debe marcar su propio momento de recepción como inicio de sus 30
 * minutos locales (ver comentario de `RegistroBloqueo.bloqueadoEn`), no
 * heredar el instante en que el otro kiosko bloqueó la mesa.
 */
export function obtenerSnapshotMesas(): Record<string, { orderId?: string; source: string }> {
  const bloqueos = limpiarVencidos(leerBloqueos(), { emitirAuto: false })
  const snapshot: Record<string, { orderId?: string; source: string }> = {}
  for (const [mesaId, registro] of Object.entries(bloqueos)) {
    snapshot[mesaId] = { orderId: registro.orderId, source: registro.source }
  }
  return snapshot
}

/**
 * Reemplaza por completo el mapa de bloqueos local con el `tables` recibido
 * en una respuesta `syncConfig` del otro kiosko (ver
 * `services/kioskoSync.ts` -> `aplicarRespuestaSyncConfig`). A diferencia de
 * `aplicarLockRemoto`/`aplicarUnlockRemoto` (que ajustan una mesa puntual a
 * partir de un mensaje `lockTable`/`unlockTable` en tiempo real), esto adopta
 * de una sola vez el estado completo reportado por el otro kiosko — pensado
 * para el catch-up de un kiosko que estuvo desconectado, no para el flujo
 * normal de ocupar/liberar una mesa (por eso NO reemite ningún mensaje de
 * salida). Cada mesa adoptada arranca su propio conteo de 30 minutos desde
 * AHORA (mismo criterio que `aplicarLockRemoto`).
 */
export function reemplazarBloqueos(tables: Record<string, { orderId?: string; source: string }>): void {
  const ahora = Date.now()
  const nuevoMapa: MapaBloqueos = {}
  for (const [mesaId, registro] of Object.entries(tables)) {
    nuevoMapa[mesaId] = { bloqueadoEn: ahora, orderId: registro.orderId, source: registro.source }
  }
  guardarBloqueos(nuevoMapa)
  notificarCambio()
}

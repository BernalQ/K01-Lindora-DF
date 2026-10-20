import { CAJA_ID, STORAGE_KEY_CAJA_ID } from './consecutivo'
import { KIOSKO_SYNC_PORT, cajaIdPorIp } from './kioskoSyncConfig'

/**
 * Asignación AUTOMÁTICA de `CAJA_ID` según la IP real de esta máquina: "si es
 * .250 es K001 y si es .251 es K002" — sin tener que configurar
 * `VITE_CAJA_ID` a mano en cada terminal (ver comentario de `CAJA_ID` en
 * `services/consecutivo.ts` para el orden de prioridad completo).
 *
 * El navegador no tiene forma estándar de preguntarle al sistema operativo
 * "¿cuál es mi IP en la red local?" (a diferencia de Node, que sí puede vía
 * `os.networkInterfaces()`). Por eso este archivo le pregunta al print-bridge
 * de ESTA MISMA máquina (`GET /kiosko-sync/whoami` en
 * `print-bridge/src/kioskoSync/server.ts`, puerto 3005, siempre vía
 * `localhost` — nunca cruza a la red), que sí corre en Node y puede leer la
 * IP real de la tarjeta de red. Con esa IP (o esas IPs, si la máquina tiene
 * varios adaptadores), se busca cuál `CAJA_ID` le corresponde en la tabla
 * conocida de `services/kioskoSyncConfig.ts` (`cajaIdPorIp`).
 *
 * `CAJA_ID` (el import de arriba) ya se resolvió de forma SÍNCRONA al cargar
 * `services/consecutivo.ts` (por defecto "K001" la primera vez, o lo que haya
 * quedado cacheado de una detección anterior) — este archivo corre la
 * detección real EN SEGUNDO PLANO y, si descubre que el valor correcto es
 * distinto del que ya está en uso, lo persiste en `localStorage` y recarga
 * la página UNA VEZ para que todo el resto de la app (consecutivo, Master de
 * catálogo, IPs propia/del otro kiosko) arranque ya con el valor correcto
 * desde cero. En arranques siguientes, el valor cacheado es el correcto
 * desde el primer render, sin depender de esta consulta de red.
 *
 * Si hay un override manual (`VITE_CAJA_ID` configurado), esta detección NO
 * se ejecuta — se respeta la decisión explícita del operador sin
 * cuestionarla.
 */

const TIMEOUT_MS = 4_000

function urlWhoami(): string {
  return `http://localhost:${KIOSKO_SYNC_PORT}/kiosko-sync/whoami`
}

async function obtenerIpsLocales(): Promise<string[]> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(urlWhoami(), { signal: controller.signal })
    if (!res.ok) throw new Error(`Error HTTP ${res.status}`)
    const data = (await res.json()) as { ips?: string[] }
    return data.ips ?? []
  } catch (err) {
    console.log('[cajaIdDetect] No se pudo consultar la IP local vía print-bridge (puerto 3005):', err)
    return []
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Corre la detección automática una sola vez por carga de la pestaña. No
 * hace nada (deja todo como está) si: hay un override manual configurado, no
 * se pudo contactar al print-bridge local, o ninguna de las IPs de esta
 * máquina coincide con un `CAJA_ID` conocido — en cualquiera de esos casos,
 * el valor ya resuelto síncronamente en `consecutivo.ts` sigue siendo el
 * vigente, sin bloquear ni interrumpir nada (mismo criterio "fail open" que
 * el resto de la sincronización entre kioskos).
 */
async function detectarYAplicar(): Promise<void> {
  if (import.meta.env.VITE_CAJA_ID) return

  const ips = await obtenerIpsLocales()
  let detectado: string | undefined
  for (const ip of ips) {
    detectado = cajaIdPorIp(ip)
    if (detectado) break
  }

  if (!detectado || detectado === CAJA_ID) return

  console.log(
    `[cajaIdDetect] CAJA_ID detectado por IP ("${detectado}") difiere del vigente ("${CAJA_ID}") — se actualiza y recarga la página.`,
  )
  try {
    localStorage.setItem(STORAGE_KEY_CAJA_ID, detectado)
  } catch {
    // Si no se puede persistir, se sigue intentando recargar igual: en el
    // peor caso (localStorage no disponible) la detección se repetirá en el
    // próximo arranque sin quedar en un estado peor que el actual.
  }
  window.location.reload()
}

void detectarYAplicar()

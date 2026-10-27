import { Router } from 'express'

/**
 * Proxy server-to-server hacia el API `df_api.php` de Codisa (factura
 * electrónica: búsqueda de cliente por cédula + envío de pedido), para la
 * PWA (`services/wsdf.ts` -> `WSDF_CONFIG.endpointCliente`/`endpointOrden`).
 *
 * Por qué existe: el navegador del kiosko (origen `http://localhost:3000`)
 * no puede llamar directo a `https://10.0.1.24/kiosko/df_api.php` porque el
 * servidor de Codisa no responde correctamente al preflight CORS (`OPTIONS`)
 * que todo navegador manda antes de un POST con `Content-Type:
 * application/json` entre orígenes distintos — Codisa le devuelve 400 Bad
 * Request a ese preflight, y el navegador nunca llega a mandar el POST real
 * (aunque el mismo JSON, probado con Postman, sí funciona — Postman no
 * aplica CORS, por eso "funciona ahí" y no desde el navegador).
 *
 * CORS es una restricción exclusiva de JavaScript corriendo en un navegador;
 * una petición HTTP hecha por este servicio Node (server a servidor, sin
 * navegador de por medio) no está sujeta a esa restricción en absoluto. Por
 * eso este archivo simplemente reenvía el body recibido de la PWA hacia
 * Codisa con un `fetch` normal, y devuelve la respuesta de Codisa tal cual
 * a la PWA — sin aplicarle ninguna lógica/validación propia, esa sigue
 * viviendo enteramente en `wsdf.ts` del lado de la PWA (este proxy es
 * "tonto" a propósito, para no duplicar reglas de negocio en dos lugares).
 *
 * Host hardcodeado igual que está hoy en `WSDF_CONFIG` de `wsdf.ts` (mismo
 * patrón ya usado en este proyecto para integraciones externas fijas, ver
 * comentario de archivo ahí) — no se agregó variable de `.env` nueva porque
 * sería el mismo valor duplicado en dos `.env` distintos sin necesidad real
 * de configurarlo por ambiente.
 */
const CODISA_HOST = 'https://10.0.1.24/kiosko/df_api.php'

/**
 * Tiempo máximo de espera a Codisa antes de abortar. Deliberadamente MENOR
 * al `TIMEOUT_MS` de `wsdf.ts` (35000ms) — no igual — para que este proxy
 * siempre resuelva (éxito o su propio error 502) antes de que el fetch de
 * la PWA hacia el `print-bridge` llegue a abortar primero por su propio
 * timeout; si fueran iguales o éste fuera mayor, la PWA podría cortar la
 * conexión justo cuando Codisa está por responder, perdiendo el detalle
 * del error real a favor de un simple "se agotó el tiempo de espera".
 */
const TIMEOUT_MS = 15000

export const codisaRouter = Router()

/**
 * Reenvía el body recibido tal cual a `df_api.php?action=<accion>` por POST,
 * y devuelve la respuesta de Codisa (status + JSON) sin modificarla. Si
 * Codisa no responde a tiempo o la conexión falla, devuelve un JSON con
 * `coderror`/`success` en 1/0 según corresponda, para que `wsdf.ts` lo trate
 * igual que hoy trata cualquier otra respuesta no exitosa de Codisa.
 */
async function reenviarACodisa(accion: 'orden' | 'cliente', body: unknown): Promise<{ status: number; json: unknown }> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${CODISA_HOST}?action=${accion}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const json = await res.json().catch(() => null)
    return { status: res.status, json }
  } finally {
    clearTimeout(timeoutId)
  }
}

codisaRouter.post('/codisa/orden', async (req, res) => {
  try {
    const { status, json } = await reenviarACodisa('orden', req.body)
    res.status(status).json(json)
  } catch (err) {
    console.error('[print-bridge] Error reenviando pedido a Codisa:', err)
    res.status(502).json({ success: 0, mensaje: `No se pudo contactar a Codisa: ${(err as Error).message}` })
  }
})

codisaRouter.post('/codisa/cliente', async (req, res) => {
  try {
    const { status, json } = await reenviarACodisa('cliente', req.body)
    res.status(status).json(json)
  } catch (err) {
    console.error('[print-bridge] Error reenviando búsqueda de cliente a Codisa:', err)
    res.status(502).json({ coderror: '1', mensaje: `No se pudo contactar a Codisa: ${(err as Error).message}` })
  }
})

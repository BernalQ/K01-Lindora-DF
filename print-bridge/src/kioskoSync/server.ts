import express from 'express'
import cors from 'cors'
import { pushEnvelope, drainEnvelopes } from './queue.js'

/**
 * Servidor de sincronización DIRECTA entre los dos kioskos físicos
 * (requerimientos "Sincronización de mesas" / "Disponibilidad de productos" /
 * "Actualización de precios" / "Resincronización automática"), puerto 3005 —
 * DISTINTO del servidor principal de print-bridge (`../server.ts`, puerto
 * 4000, impresión/facturación/BAC). Mismo proceso Node, pero un `express()`
 * separado y sin el guard `requireKioskToken` de aquel: esta red es interna
 * (10.0.5.0/24) y sólo habla con la máquina del otro kiosko, conocida por IP
 * fija (ver `services/kioskoSyncConfig.ts` en `pwa-kiosk`).
 *
 * Flujo (ver `services/kioskoTransport.ts` en `pwa-kiosk` para el lado
 * cliente):
 * - El kiosko EMISOR hace `POST /kiosko-sync/incoming` DIRECTO a la IP de la
 *   máquina del kiosko RECEPTOR (cross-origin, navegador -> este servidor).
 * - Este servidor sólo encola (`pushEnvelope`, ver `queue.ts`) — no sabe nada
 *   de qué significa "mesaSync"/"catalogSync"/"syncConfigRequest"/
 *   "syncConfigResponse" (eso lo interpreta la PWA).
 * - La PWA de ESTA MISMA máquina (nunca la del otro kiosko) hace
 *   `GET /kiosko-sync/pending` vía `localhost` para drenar la cola
 *   (`drainEnvelopes`) y despachar cada mensaje a su manejador.
 */

const PORT = Number(process.env.KIOSKO_SYNC_PORT ?? 3005)

/**
 * Arranca el servidor de sincronización entre kioskos. Se llama desde
 * `../server.ts` junto con (no en vez de) el `app.listen` del print-bridge
 * normal — son dos servidores HTTP independientes en el mismo proceso Node.
 */
export function iniciarServidorKioskoSync(): void {
  const app = express()

  // CORS abierto a propósito (sin `origin` restringido, a diferencia del
  // print-bridge normal): este puerto sólo es alcanzable dentro de la red
  // interna del negocio y sólo el otro kiosko conoce esta IP.
  app.use(cors())
  app.use(express.json())

  app.get('/kiosko-sync/health', (_req, res) => {
    res.json({ ok: true, service: 'kiosko-sync' })
  })

  app.post('/kiosko-sync/incoming', (req, res) => {
    const { tipo, mensaje } = req.body as { tipo?: unknown; mensaje?: unknown }
    if (typeof tipo !== 'string' || mensaje === undefined) {
      res.status(400).json({ error: 'Envelope inválido: se espera { tipo: string, mensaje: unknown }' })
      return
    }
    pushEnvelope({ tipo, mensaje })
    res.status(200).json({ ok: true })
  })

  app.get('/kiosko-sync/pending', (_req, res) => {
    res.json({ envelopes: drainEnvelopes() })
  })

  app.listen(PORT, () => {
    console.log(`[kiosko-sync] escuchando en http://localhost:${PORT}`)
  })
}

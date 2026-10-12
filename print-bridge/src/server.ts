import 'dotenv/config'
import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import cors from 'cors'
import { printRouter } from './routes/print.js'
import { clientesRouter } from './routes/clientes.js'
import { facturaRouter } from './routes/factura.js'
import { ventasRouter } from './routes/ventas.js'
import { systemRouter } from './routes/system.js'
import { FACTURAS_DIR, asegurarCarpetaDatos } from './data/paths.js'

const app = express()
const PORT = Number(process.env.PORT ?? 4000)

asegurarCarpetaDatos()

app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' }))
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'print-bridge' })
})

// Descarga de PDFs de factura generados en /factura (ver services/pdfFactura.ts):
// montado ANTES de requireKioskToken porque se abre con un <a href> directo
// desde PaymentScreen.tsx (navegación del navegador, no puede mandar el
// header x-kiosk-token) — ver KIOSK_TOKEN más abajo y services/kioskToken.ts
// en la PWA.
app.use('/facturas', express.static(FACTURAS_DIR))

/**
 * Exige el header `x-kiosk-token` en el resto de rutas (clientes/factura/
 * ventas/print/system) si este servicio tiene `KIOSK_TOKEN` configurado en
 * su `.env` — protege contra que cualquier dispositivo en la red
 * 10.0.5.0/24 pueda llamarlas sin credencial, incluyendo `/system/exit-kiosk`
 * (ver hallazgo de auditoría).
 *
 * Igual que `CODISA_API_KEY`/`SMTP_*` en este mismo servicio: si
 * `KIOSK_TOKEN` no está configurado, el guard queda deshabilitado (fail-open)
 * en vez de bloquear todo el tráfico — así los despliegues/desarrollo que no
 * configuran el token siguen funcionando igual que antes. El lado de la PWA
 * (`services/kioskToken.ts`) sólo manda el header si `VITE_KIOSK_TOKEN` está
 * configurado, así que ambos lados deben configurarse juntos (si sólo uno de
 * los dos tiene el valor, las peticiones reales empezarán a fallar con 401).
 */
function requireKioskToken(req: Request, res: Response, next: NextFunction): void {
  const tokenEsperado = process.env.KIOSK_TOKEN
  if (!tokenEsperado) {
    next()
    return
  }
  if (req.header('x-kiosk-token') === tokenEsperado) {
    next()
    return
  }
  res.status(401).json({ error: 'Token de kiosko inválido o ausente' })
}

app.use(requireKioskToken)

app.use(printRouter)
app.use(clientesRouter)
app.use(facturaRouter)
app.use(ventasRouter)
app.use(systemRouter)

app.listen(PORT, () => {
  console.log(`[print-bridge] escuchando en http://localhost:${PORT}`)
})

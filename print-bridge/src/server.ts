import 'dotenv/config'
import express from 'express'
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

app.use(printRouter)
app.use(clientesRouter)
app.use(facturaRouter)
app.use(ventasRouter)
app.use(systemRouter)
// Descarga de PDFs de factura generados en /factura (ver services/pdfFactura.ts).
app.use('/facturas', express.static(FACTURAS_DIR))

app.listen(PORT, () => {
  console.log(`[print-bridge] escuchando en http://localhost:${PORT}`)
})

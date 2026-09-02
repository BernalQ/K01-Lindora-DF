import { Router } from 'express'
import { registrarVentaEnExcel } from '../data/ventasStore.js'
import type { VentaSimpleRequestBody } from '../types.js'

export const ventasRouter = Router()

/** Registra en la bitácora local una venta pagada SIN factura electrónica. */
ventasRouter.post('/ventas/simple', async (req, res) => {
  const body = req.body as Partial<VentaSimpleRequestBody>

  if (!Array.isArray(body.items) || body.items.length === 0) {
    res.status(400).json({ ok: false, error: 'items debe ser un array no vacío' })
    return
  }

  const total = body.total ?? body.items.reduce((s, i) => s + i.cantidad * i.precioUnitario, 0)

  try {
    await registrarVentaEnExcel({
      mesa: body.mesa ?? '',
      tipoPago: 'simple',
      total,
      items: body.items,
    })
    res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[print-bridge] Error registrando venta simple:', err)
    res.status(500).json({ ok: false, error: (err as Error).message })
  }
})

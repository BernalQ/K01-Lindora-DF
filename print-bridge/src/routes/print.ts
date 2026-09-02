import { Router } from 'express'
import { printTicket } from '../printers/print.js'
import type { PrintRequestBody, PrinterId } from '../types.js'

const VALID_PRINTERS: PrinterId[] = ['carniceria', 'restaurante', 'cliente']

export const printRouter = Router()

printRouter.post('/print', async (req, res) => {
  const body = req.body as Partial<PrintRequestBody>

  if (!body.printer || !VALID_PRINTERS.includes(body.printer)) {
    res.status(400).json({ error: `printer debe ser uno de: ${VALID_PRINTERS.join(', ')}` })
    return
  }

  if (!Array.isArray(body.lines) || body.lines.length === 0) {
    res.status(400).json({ error: 'lines debe ser un array no vacío' })
    return
  }

  try {
    await printTicket(body.printer, body.lines)
    res.status(200).json({ ok: true, printer: body.printer })
  } catch (err) {
    console.error(`[print-bridge] Error imprimiendo en "${body.printer}":`, err)
    res.status(502).json({ ok: false, error: (err as Error).message })
  }
})

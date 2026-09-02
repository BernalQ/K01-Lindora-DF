import { Router } from 'express'
import path from 'node:path'
import { enviarFacturaAHacienda } from '../services/hacienda.js'
import { generarPdfFactura } from '../services/pdfFactura.js'
import { enviarCorreoFactura } from '../services/email.js'
import { guardarCliente } from '../data/clientesStore.js'
import { registrarVentaEnExcel } from '../data/ventasStore.js'
import { registrarErrorFactura } from '../data/erroresLog.js'
import type { FacturaRequestBody } from '../types.js'

export const facturaRouter = Router()

/**
 * Genera y "envía" una factura electrónica:
 * 1. Guarda/actualiza el cliente en la base local (Excel, cédula = llave).
 *    Esto ocurre ANTES de contactar a Hacienda/Codisa, y no se revierte si
 *    el paso 2 falla: los datos del cliente quedan guardados de todas
 *    formas, para que un reintento no le pida los datos de nuevo
 *    (requerimiento 6).
 * 2. Envía la venta a Hacienda vía Codisa (stub mientras no haya API real).
 * 3. Si Hacienda/Codisa aprueba: genera el PDF y lo envía por correo.
 * 4. Registra la venta (con o sin éxito) en la bitácora local de ventas.
 *
 * Si el paso 2 falla (rechazo) o hay un error inesperado, responde con un
 * mensaje claro para que la PWA lo muestre y ofrezca reintentar
 * (requerimiento 5), y el detalle queda además en el log local de errores
 * (`data/facturas-errores.log`, ver `data/erroresLog.ts`) para auditoría.
 */
facturaRouter.post('/factura', async (req, res) => {
  const body = req.body as Partial<FacturaRequestBody>

  if (!body.cliente?.cedula?.trim() || !body.cliente?.nombre?.trim()) {
    res.status(400).json({ ok: false, error: 'Datos de cliente incompletos' })
    return
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    res.status(400).json({ ok: false, error: 'items debe ser un array no vacío' })
    return
  }

  const cliente = body.cliente
  const items = body.items
  const total = body.total ?? items.reduce((s, i) => s + i.cantidad * i.precioUnitario, 0)
  const mesa = body.mesa ?? ''
  const numeroFactura = body.numeroFactura ?? 'S/N'

  try {
    await guardarCliente(cliente)

    const resultadoHacienda = await enviarFacturaAHacienda({ cliente, items, total, mesa })

    if (!resultadoHacienda.ok || !resultadoHacienda.clave) {
      const mensajeError = resultadoHacienda.mensajeError ?? 'Hacienda rechazó la factura electrónica'

      await registrarVentaEnExcel({
        mesa,
        tipoPago: 'factura',
        total,
        items,
        cedulaCliente: cliente.cedula,
        nombreCliente: cliente.nombre,
      }).catch((err) => console.error('[print-bridge] Error registrando venta rechazada:', err))

      registrarErrorFactura({ cedula: cliente.cedula, nombre: cliente.nombre, mesa, total, mensajeError })

      console.error('[print-bridge] Hacienda/Codisa rechazó la factura:', mensajeError)
      res.status(502).json({ ok: false, error: mensajeError })
      return
    }

    const { rutaAbsoluta } = await generarPdfFactura({
      clave: resultadoHacienda.clave,
      numeroFactura,
      cliente,
      items,
      total,
      mesa,
    })

    const correo = await enviarCorreoFactura(cliente, rutaAbsoluta, resultadoHacienda.clave)

    await registrarVentaEnExcel({
      mesa,
      tipoPago: 'factura',
      total,
      items,
      cedulaCliente: cliente.cedula,
      nombreCliente: cliente.nombre,
      claveFactura: resultadoHacienda.clave,
    })

    res.status(200).json({
      ok: true,
      clave: resultadoHacienda.clave,
      pdfUrl: `/facturas/${path.basename(rutaAbsoluta)}`,
      correoEnviado: correo.ok && !correo.simulado,
    })
  } catch (err) {
    const mensajeError = (err as Error).message
    console.error('[print-bridge] Error generando factura:', err)
    registrarErrorFactura({ cedula: cliente.cedula, nombre: cliente.nombre, mesa, total, mensajeError })
    res.status(500).json({ ok: false, error: mensajeError })
  }
})

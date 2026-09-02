import PDFDocument from 'pdfkit'
import fs from 'node:fs'
import path from 'node:path'
import { FACTURAS_DIR, asegurarCarpetaDatos } from '../data/paths.js'
import { LOGO_PATH } from '../assets.js'
import type { Cliente, FacturaItem } from '../types.js'

/**
 * Datos fijos del emisor (encabezado de la factura impresa), configurables
 * por variable de entorno siguiendo el mismo patrón ya usado en el resto
 * del proyecto para config de red/dispositivo (ver `PRINTER_*_IP`/
 * `GATEWAY_IP` en `printers/config.ts`). Los valores por defecto son los
 * datos reales del negocio.
 */
const EMISOR_NOMBRE = process.env.EMISOR_NOMBRE ?? 'CARNES DON FERNANDO'
const EMISOR_ESLOGAN = process.env.EMISOR_ESLOGAN ?? 'EL ESPECIALISTA EN CARNES'
const EMISOR_DIRECCION = process.env.EMISOR_DIRECCION ?? 'Santa Ana, C.C Vistana Este'
const EMISOR_CORREO = process.env.EMISOR_CORREO ?? 'santana@carnesdonfernado.com'
const EMISOR_TELEFONO = process.env.EMISOR_TELEFONO ?? '2282-0182'
const EMISOR_CEDULA = process.env.EMISOR_CEDULA ?? '3101017589'

export interface DatosFacturaPDF {
  clave: string
  /** Consecutivo de la orden en el kiosko (ej. "01-2026-08-00001"), ver `services/consecutivo.ts` en pwa-kiosk. */
  numeroFactura: string
  cliente: Cliente
  items: FacturaItem[]
  total: number
  mesa: string
}

function formatoCRC(monto: number): string {
  return `₡${monto.toLocaleString('es-CR')}`
}

/** Genera el PDF del comprobante en `data/facturas/` y devuelve su ruta. */
export async function generarPdfFactura(
  datos: DatosFacturaPDF,
): Promise<{ archivo: string; rutaAbsoluta: string }> {
  asegurarCarpetaDatos()
  const archivo = `factura-${datos.clave.slice(0, 12)}-${Date.now()}.pdf`
  const rutaAbsoluta = path.join(FACTURAS_DIR, archivo)

  await new Promise<void>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A5', margin: 36 })
    const stream = fs.createWriteStream(rutaAbsoluta)
    doc.pipe(stream)

    // --- Encabezado: logo centrado, referencia "Logo Resta", leyenda del
    // negocio y datos de la factura, todo centrado (ver documentación de
    // `DatosFacturaPDF` y comentario de `LOGO_PATH` más arriba). ---
    const anchoLogo = 80
    if (fs.existsSync(LOGO_PATH)) {
      const xLogo = (doc.page.width - anchoLogo) / 2
      const yLogo = doc.y
      doc.image(LOGO_PATH, xLogo, yLogo, { width: anchoLogo })
      // Logo cuadrado (fuente 640x640px): alto renderizado == anchoLogo.
      // Se posiciona doc.y explícitamente (en vez de moveDown, que avanza en
      // múltiplos del alto de línea actual y no del alto en puntos de la
      // imagen) para evitar solapamiento con "Logo Resta".
      doc.y = yLogo + anchoLogo + 6
    }
    doc.fontSize(7).fillColor('#888').text('Logo Resta', { align: 'center' })
    doc.fillColor('#000').moveDown(0.5)

    doc.fontSize(16).text(EMISOR_NOMBRE, { align: 'center' })
    doc.fontSize(10).text(EMISOR_ESLOGAN, { align: 'center' })
    doc.fontSize(9).text(EMISOR_DIRECCION, { align: 'center' })
    doc.text(EMISOR_CORREO, { align: 'center' })
    doc.text(`Tel: ${EMISOR_TELEFONO} / Ced. J: ${EMISOR_CEDULA}`, { align: 'center' })
    doc.moveDown()

    doc.fontSize(9).text(`Factura de Caja#: ${datos.numeroFactura}`, { align: 'center' })
    doc.text(`Fecha: ${new Date().toLocaleString('es-CR')}`, { align: 'center' })
    doc.moveDown()

    doc.fontSize(11).text('Comprobante Electrónico', { align: 'center' })
    doc.fontSize(8).fillColor('#666').text(`Clave: ${datos.clave}`, { align: 'center' })
    doc.fillColor('#000').moveDown()

    doc.fontSize(10)
    doc.text(`Mesa: ${datos.mesa}`)
    doc.moveDown(0.5)
    doc.text(`Cliente: ${datos.cliente.nombre}`)
    doc.text(`Cédula: ${datos.cliente.cedula}`)
    if (datos.cliente.correo) doc.text(`Correo: ${datos.cliente.correo}`)
    if (datos.cliente.telefono) doc.text(`Teléfono: ${datos.cliente.telefono}`)
    if (datos.cliente.direccion) doc.text(`Dirección: ${datos.cliente.direccion}`)
    doc.moveDown()

    doc.fontSize(10).text('Detalle:', { underline: true })
    doc.moveDown(0.3)
    for (const item of datos.items) {
      const monto = item.cantidad * item.precioUnitario
      doc.text(`${item.cantidad}x ${item.nombre}  —  ${formatoCRC(monto)}`)
    }
    doc.moveDown()
    doc.fontSize(12).text(`TOTAL: ${formatoCRC(datos.total)}`, { align: 'right' })
    doc.moveDown(2)
    doc
      .fontSize(7)
      .fillColor('#888')
      .text(
        'Comprobante generado localmente. Sujeto a validación final de Hacienda una vez ' +
          'habilitada la integración con Codisa.',
        { align: 'center' },
      )

    doc.end()
    stream.on('finish', resolve)
    stream.on('error', reject)
  })

  return { archivo, rutaAbsoluta }
}
